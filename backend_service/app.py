import os
import re
import hmac
import hashlib
import secrets
import logging
import csv
import io
from datetime import datetime, timedelta, date
import jwt
from functools import wraps
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS# Create the base engine options
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv
import random
from time import time
from collections import defaultdict
from threading import Lock
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.exc import SQLAlchemyError

load_dotenv()

app = Flask(__name__)
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")


def _require_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _warn_env(name: str):
    value = (os.environ.get(name) or "").strip()
    if not value:
        print(f"⚠️ Startup warning: {name} is not set.")


def _is_production() -> bool:
    return (os.environ.get("FLASK_ENV") or "").strip().lower() in {"production", "prod"}


def _is_placeholder_secret(value: str) -> bool:
    lowered = (value or "").strip().lower()
    return lowered in {
        "",
        "changeme",
        "change-me",
        "replace-me",
        "dev-secret-change-me",
        "change-this-to-a-random-secret-key-in-production",
    }


app.config["SECRET_KEY"] = _require_env("SECRET_KEY")
database_url = _require_env("SQLALCHEMY_DATABASE_URI")
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

if _is_production():
    if database_url.startswith("sqlite"):
        raise RuntimeError("SQLALCHEMY_DATABASE_URI cannot use SQLite in production. Configure a persistent Postgres database.")
    if _is_placeholder_secret(app.config["SECRET_KEY"]):
        raise RuntimeError("SECRET_KEY must be set to a strong non-placeholder value in production.")
    _require_env("FRONTEND_ORIGIN")
    _require_env("NEXTAUTH_SECRET")
    if not any((os.environ.get(name) or "").strip() for name in ("API_URL", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_API_BASE")):
        raise RuntimeError("Set one of API_URL, NEXT_PUBLIC_API_URL, or NEXT_PUBLIC_API_BASE in production.")
else:
    _warn_env("SUPERADMIN_BOOTSTRAP_TOKEN")

# Create the base engine options
engine_options = {
    # pool_pre_ping: The magic bullet. SQLAlchemy will issue a quick 'SELECT 1' 
    # to test the connection before yielding it from the pool. If it fails, 
    # it silently reconnects.
    "pool_pre_ping": True,
    
    # pool_recycle: Proactively recycle connections older than X seconds.
    # 280 seconds (4.5 minutes) is a safe value that beats Render/Neon's typical 5-minute idle timeouts.
    "pool_recycle": 280,
    
    # Optional but recommended: Prevent requests from hanging indefinitely if the DB is overwhelmed.
    "pool_timeout": 30,
}

if database_url.startswith("postgres") and "sslmode=" not in database_url:
    engine_options["connect_args"] = {"sslmode": "require"}

app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options

_frontend_origin_raw = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")


def _cors_origin_values(raw_origins: str):
    values = []
    for origin in raw_origins.split(","):
        cleaned = origin.strip()
        if not cleaned:
            continue
        if "*" in cleaned:
            if _is_production():
                print(f"⚠️ Startup warning: Wildcard FRONTEND_ORIGIN entry '{cleaned}' ignored in production.")
                continue
            pattern = "^" + re.escape(cleaned).replace(r"\*", ".*") + "$"
            values.append(re.compile(pattern))
        else:
            values.append(cleaned)
    if not values:
        fallback_origin = "http://localhost:3000"
        print(f"⚠️ Startup warning: no valid FRONTEND_ORIGIN values found; falling back to {fallback_origin}.")
        values.append(fallback_origin)
    return values


FRONTEND_ORIGINS = _cors_origin_values(_frontend_origin_raw)
JWT_ISSUER = (os.environ.get("JWT_ISSUER") or "ascendprep-backend").strip()
JWT_AUDIENCE = (os.environ.get("JWT_AUDIENCE") or "ascendprep-frontend").strip()


# 3. Initialize CORS 
CORS(
    app,
    origins=FRONTEND_ORIGINS,
    methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    supports_credentials=True,
)

db = SQLAlchemy(app) 
bcrypt = Bcrypt(app)

LOGIN_RATE_WINDOW = 5 * 60
LOGIN_RATE_MAX = 10
_login_attempts: dict[str, list[float]] = defaultdict(list)
_login_attempts_lock = Lock()


def _login_rate_limited(username: str, ip: str) -> bool:
    now = time()
    key = f"{(username or '').lower()}|{ip or 'unknown'}"
    with _login_attempts_lock:
        _login_attempts[key] = [t for t in _login_attempts[key] if now - t < LOGIN_RATE_WINDOW]
        if len(_login_attempts[key]) >= LOGIN_RATE_MAX:
            return True
        _login_attempts[key].append(now)

        if len(_login_attempts) > 5000:
            cutoff = now - LOGIN_RATE_WINDOW
            stale_keys = [k for k, values in _login_attempts.items() if not values or max(values) < cutoff]
            for stale in stale_keys:
                _login_attempts.pop(stale, None)
    return False


def _normalize_username(value: str) -> str:
    return (value or "").strip().lower()


class Institution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), unique=True, nullable=False)
    registration_code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    attempts = db.relationship('QuizAttempt', backref='user', lazy=True)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    is_superadmin = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    account_type = db.Column(db.String(24), default='institution', nullable=False, index=True)
    institution_id = db.Column(db.Integer, db.ForeignKey('institution.id'), nullable=True, index=True)
    institution = db.relationship('Institution', backref=db.backref('users', lazy=True))

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)


class Question(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    question = db.Column(db.Text, nullable=False)
    optionA = db.Column(db.String(255), nullable=True)
    optionB = db.Column(db.String(255), nullable=True)
    optionC = db.Column(db.String(255), nullable=True)
    optionD = db.Column(db.String(255), nullable=True)
    correctAnswer = db.Column(db.String(1), nullable=False)
    explanation = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(100), nullable=False)
    difficulty = db.Column(db.String(50), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'question': self.question,
            'options': [
                {'id': 'A', 'text': self.optionA},
                {'id': 'B', 'text': self.optionB},
                {'id': 'C', 'text': self.optionC},
                {'id': 'D', 'text': self.optionD},
            ],
            'correctAnswer': self.correctAnswer,
            'explanation': self.explanation,
            'category': self.category,
            'difficulty': self.difficulty,
        }


class AccessCode(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    label = db.Column(db.String(120), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    max_uses = db.Column(db.Integer, default=1, nullable=False)
    use_count = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)
    redeemed_at = db.Column(db.DateTime, nullable=True)
    redeemed_by_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    redeemed_by_user = db.relationship('User', foreign_keys=[redeemed_by_user_id])
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_by_user = db.relationship('User', foreign_keys=[created_by_user_id], post_update=True)


class UserGamification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True, index=True)
    xp = db.Column(db.Integer, default=0, nullable=False)
    total_questions_answered = db.Column(db.Integer, default=0, nullable=False)
    total_correct_answers = db.Column(db.Integer, default=0, nullable=False)
    current_streak_days = db.Column(db.Integer, default=0, nullable=False)
    best_streak_days = db.Column(db.Integer, default=0, nullable=False)
    last_practice_date = db.Column(db.Date, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UserBadge(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    badge_key = db.Column(db.String(64), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    unlocked_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'badge_key', name='uq_user_badge_key'),
    )


class QuizAttempt(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    test_name = db.Column(db.String(128), nullable=False)
    score = db.Column(db.Integer, nullable=True)
    total_questions = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    assignment_id = db.Column(db.Integer, db.ForeignKey('assignment.id'), nullable=True, index=True)
    question_ids = db.Column(db.JSON, nullable=False)
    answers = db.Column(db.JSON, default=dict, nullable=False)
    is_complete = db.Column(db.Boolean, default=False, nullable=False)
    results_by_category = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        timestamp_value = self.timestamp.isoformat() if self.timestamp else None
        return {
            'id': self.id,
            'test_name': self.test_name,
            'score': self.score,
            'total_questions': self.total_questions,
            'timestamp': timestamp_value,
            'user_id': self.user_id,
            'assignment_id': self.assignment_id,
            'question_ids': self.question_ids or [],
            'answers': self.answers or {},
            'is_complete': self.is_complete,
            'results_by_category': self.results_by_category
        }


class Roleplay(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event = db.Column(db.String(255), nullable=False)
    industry = db.Column(db.String(255), nullable=False)
    business_name = db.Column(db.String(255), nullable=False)
    student_role = db.Column(db.String(255), nullable=False)
    judge_role = db.Column(db.String(255), nullable=False)
    scenario_background = db.Column(db.Text, nullable=False)
    objective = db.Column(db.Text, nullable=False)
    task_type = db.Column(db.String(255), nullable=False)
    difficulty = db.Column(db.String(50), nullable=False)
    training_json = db.Column(JSONB, nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'event': self.event,
            'industry': self.industry,
            'business_name': self.business_name,
            'student_role': self.student_role,
            'judge_role': self.judge_role,
            'scenario_background': self.scenario_background,
            'objective': self.objective,
            'task_type': self.task_type,
            'difficulty': self.difficulty,
            'training': self.training_json,
            'is_active': self.is_active,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
        }


class Assignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    institution_id = db.Column(db.Integer, db.ForeignKey("institution.id"), nullable=False, index=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=True)
    categories = db.Column(db.JSON, nullable=False, default=list)
    difficulties = db.Column(db.JSON, nullable=False, default=list)
    question_count = db.Column(db.Integer, nullable=False, default=20)
    due_date = db.Column(db.DateTime, nullable=True)
    time_limit_minutes = db.Column(db.Integer, nullable=True)
    mode = db.Column(db.String(20), nullable=False, default="practice")
    shuffle_questions = db.Column(db.Boolean, nullable=False, default=True)
    show_explanations = db.Column(db.Boolean, nullable=False, default=True)
    minimum_passing_score = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)


class AssignmentRecipient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey("assignment.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("assignment_id", "user_id", name="uq_assignment_recipient"),
    )


ROLEPLAY_DRILL_TYPES = {
    "determine_objective": "Determine the Objective",
    "identify_performance_indicators": "Identify Performance Indicators",
    "plan_opening": "Plan the Opening",
    "anticipate_judge_questions": "Anticipate Judge Questions",
    "define_key_terms": "Define Key Terms",
    "plan_closing": "Plan the Closing",
}


class RoleplayAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    institution_id = db.Column(db.Integer, db.ForeignKey("institution.id"), nullable=False, index=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    roleplay_id = db.Column(db.Integer, db.ForeignKey("roleplay.id"), nullable=False, index=True)
    assignment_type = db.Column(db.String(20), nullable=False, default="full")
    drill_type = db.Column(db.String(80), nullable=True)
    title = db.Column(db.String(180), nullable=False)
    instructions = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    roleplay = db.relationship("Roleplay")


class RoleplayAssignmentRecipient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    roleplay_assignment_id = db.Column(db.Integer, db.ForeignKey("roleplay_assignment.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint("roleplay_assignment_id", "user_id", name="uq_roleplay_assignment_recipient"),
    )

def _superadmin_exists() -> bool:
    return User.query.filter_by(is_superadmin=True).count() > 0


BADGE_RULES = {
    "first_session": ("First Session", "Complete your first practice session."),
    "ten_correct_session": ("Sharp Focus", "Answer at least 10 questions correctly in one session."),
    "streak_7": ("7-Day Streak", "Practice on 7 consecutive days."),
    "hundred_questions": ("Century Mark", "Answer 100 questions in total."),
    "mastery_80": ("Category Mastery", "Reach at least 80% mastery in any category (min 20 answered)."),
}


def _normalize_access_code(raw_code: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", (raw_code or "").upper())
    return cleaned


def _access_code_hash(raw_code: str) -> str:
    return hashlib.sha256(_normalize_access_code(raw_code).encode("utf-8")).hexdigest()


def _generate_plain_access_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    chunks = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    return "-".join(chunks)


def _issue_unique_access_code() -> tuple[str, str]:
    for _ in range(25):
        plain = _generate_plain_access_code()
        code_hash = _access_code_hash(plain)
        if AccessCode.query.filter_by(code_hash=code_hash).first() is None:
            return plain, code_hash
    raise RuntimeError("Could not generate unique access code")


def _find_access_code(raw_code: str):
    normalized = _normalize_access_code(raw_code)
    if len(normalized) < 8:
        return None, "Access code format is invalid."
    code_hash = _access_code_hash(normalized)
    code = AccessCode.query.filter_by(code_hash=code_hash).first()
    if not code:
        return None, "Access code is invalid."
    if not code.is_active:
        return None, "Access code is inactive."
    if code.expires_at and code.expires_at < datetime.utcnow():
        return None, "Access code has expired."
    if code.use_count >= code.max_uses:
        return None, "Access code has already been used."
    return code, None


def _get_or_create_gamification(user_id: int) -> UserGamification:
    state = UserGamification.query.filter_by(user_id=user_id).first()
    if not state:
        state = UserGamification(user_id=user_id)
        db.session.add(state)
        db.session.flush()
    return state


def _level_for_xp(xp: int) -> int:
    return max(1, (xp // 100) + 1)


def _unlock_badge(user_id: int, badge_key: str):
    if badge_key not in BADGE_RULES:
        return None
    existing = UserBadge.query.filter_by(user_id=user_id, badge_key=badge_key).first()
    if existing:
        return None
    title, description = BADGE_RULES[badge_key]
    badge = UserBadge(user_id=user_id, badge_key=badge_key, title=title, description=description)
    db.session.add(badge)
    return badge


def _today_question_goal_progress(user_id: int, goal: int = 20):
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    completed_today = QuizAttempt.query.filter(
        QuizAttempt.user_id == user_id,
        QuizAttempt.is_complete == True,
        QuizAttempt.timestamp >= start_of_day
    ).all()
    answered = sum(a.total_questions for a in completed_today)
    return {
        "goal_questions": goal,
        "answered_today": answered,
        "remaining": max(goal - answered, 0),
        "is_complete": answered >= goal,
    }


def _superadmin_exists_safe() -> bool:
    try:
        return _superadmin_exists()
    except SQLAlchemyError as err:
        db.session.rollback()
        print(f"⚠️ Database query warning while checking superadmin status: {err}")
        raise


def generate_registration_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(10):
        code = "".join(random.choice(alphabet) for _ in range(6))
        if Institution.query.filter_by(registration_code=code).first() is None:
            return code
    raise RuntimeError("Could not generate unique registration code")


def _normalize_institution_code(raw_code: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", (raw_code or "").upper())


def _json_error(message: str, status: int = 400, code: str | None = None, details: dict | None = None):
    payload = {"message": message}
    if code:
        payload["code"] = code
    if details:
        payload["details"] = details
    return jsonify(payload), status


def _compute_category_metrics(user_id: int, max_recent_quizzes: int = 10):
    attempts = QuizAttempt.query.filter_by(user_id=user_id, is_complete=True).order_by(QuizAttempt.timestamp.desc()).all()
    lifetime = defaultdict(lambda: {"correct": 0, "total": 0})
    recent = defaultdict(lambda: {"correct": 0, "total": 0})

    for idx, attempt in enumerate(attempts):
        if not attempt.results_by_category:
            continue
        for category, result in attempt.results_by_category.items():
            correct = int(result.get("correct", 0))
            total = int(result.get("total", 0))
            lifetime[category]["correct"] += correct
            lifetime[category]["total"] += total
            if idx < max_recent_quizzes:
                recent[category]["correct"] += correct
                recent[category]["total"] += total

    rows = []
    for category, totals in lifetime.items():
        lifetime_pct = round((totals["correct"] / totals["total"]) * 100, 1) if totals["total"] else 0
        recent_totals = recent.get(category, {"correct": 0, "total": 0})
        recent_pct = round((recent_totals["correct"] / recent_totals["total"]) * 100, 1) if recent_totals["total"] else None

        if totals["total"] < 12:
            band = "developing"
            reason = "Need more question volume for a stable signal."
        elif lifetime_pct < 65:
            band = "weak"
            reason = "Accuracy is below 65%."
        elif lifetime_pct < 80:
            band = "developing"
            reason = "Accuracy is improving but not yet strong."
        else:
            band = "strong"
            reason = "Consistently strong accuracy."

        if recent_pct is None:
            trend = "not_enough_recent_data"
        elif recent_pct >= lifetime_pct + 5:
            trend = "improving"
        elif recent_pct <= lifetime_pct - 5:
            trend = "declining"
        else:
            trend = "stable"

        rows.append({
            "category": category,
            "lifetime_accuracy": lifetime_pct,
            "recent_accuracy": recent_pct,
            "total_answered": totals["total"],
            "classification": band,
            "trend": trend,
            "reason": reason,
        })
    return sorted(rows, key=lambda x: (x["classification"] != "weak", x["lifetime_accuracy"]))


def role_for_user(user: User) -> str:
    if user.is_superadmin:
        return "superadmin"
    if user.is_admin:
        return "institution_admin"
    return "student"


def issue_token(user: User) -> str:
    return jwt.encode({
        'user_id': user.id,
        'is_admin': user.is_admin,
        'is_superadmin': user.is_superadmin,
        'role': role_for_user(user),
        'account_type': user.account_type,
        'institution_id': user.institution_id,
        'iss': JWT_ISSUER,
        'aud': JWT_AUDIENCE,
        'exp': datetime.utcnow() + timedelta(hours=8)
    }, app.config['SECRET_KEY'], algorithm="HS256")


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        token = auth.split(" ", 1)[1].strip() if auth.startswith("Bearer ") else None
        if not token:
            return jsonify({"message": "Authorization token is missing"}), 401

        try:
            payload = jwt.decode(
                token,
                app.config["SECRET_KEY"],
                algorithms=["HS256"],
                issuer=JWT_ISSUER,
                audience=JWT_AUDIENCE,
                options={"require": ["exp", "iss", "aud"]},
                leeway=30,
            )
            user_id = payload.get("user_id")
            if not user_id:
                return jsonify({"message": "Invalid token payload"}), 401

            current_user = User.query.get(user_id)
            if not current_user:
                return jsonify({"message": "User not found"}), 401
            if not current_user.is_active:
                return jsonify({"message": "Account inactive"}), 403
            if current_user.account_type == "institution" and current_user.institution_id:
                institution = Institution.query.get(current_user.institution_id)
                if not institution or not institution.is_active:
                    return jsonify({"message": "Your institution is inactive."}), 403

        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Token invalid"}), 401

        return f(current_user, *args, **kwargs)

    return decorated


def institution_admin_required(f):
    @wraps(f)
    def wrapper(current_user, *args, **kwargs):
        if not (current_user.is_admin or current_user.is_superadmin):
            return jsonify({'message': 'Institution admin privileges required'}), 403
        if current_user.is_superadmin:
            return f(current_user, *args, **kwargs)
        if not current_user.institution_id:
            return jsonify({'message': 'No institution assigned'}), 403
        return f(current_user, *args, **kwargs)

    return token_required(wrapper)


def superadmin_required(f):
    @wraps(f)
    def wrapper(current_user, *args, **kwargs):
        if not current_user.is_superadmin:
            return jsonify({'message': 'Superadmin privileges required'}), 403
        return f(current_user, *args, **kwargs)

    return token_required(wrapper)


@app.after_request
def set_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return resp


@app.route('/api/institutions/validate-code', methods=['POST'])
def validate_institution_code():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({'message': 'Invalid JSON body'}), 400
    institution_code = _normalize_institution_code(data.get('institutionCode') or '')
    if not institution_code:
        return jsonify({'message': 'Institution code is required'}), 400

    institution = Institution.query.filter_by(registration_code=institution_code).first()
    if not institution:
        return jsonify({'message': 'Institution code not found'}), 404
    if not institution.is_active:
        return jsonify({'message': 'Institution is inactive. Contact your advisor or teacher.'}), 403

    return jsonify({
        'valid': True,
        'institution_id': institution.id,
        'institution_name': institution.name,
    }), 200


@app.route('/api/access-codes/validate', methods=['POST'])
def validate_access_code():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({'message': 'Invalid JSON body'}), 400
    raw_code = data.get('accessCode') or ''
    code, error = _find_access_code(raw_code)
    if error:
        return jsonify({'message': error}), 400
    return jsonify({
        'valid': True,
        'is_active': code.is_active,
        'expires_at': code.expires_at.isoformat() if code.expires_at else None,
        'remaining_uses': max(code.max_uses - code.use_count, 0),
    }), 200


@app.route('/api/bootstrap/status', methods=['GET'])
def bootstrap_status():
    expected_token = os.environ.get('SUPERADMIN_BOOTSTRAP_TOKEN')
    try:
        needs_bootstrap = _superadmin_exists_safe() is False
    except SQLAlchemyError:
        return jsonify({
            'message': 'Database unavailable or migrations not applied yet.',
            'needs_superadmin_bootstrap': None,
            'bootstrap_token_required': bool((expected_token or '').strip()),
        }), 503
    return jsonify({
        'needs_superadmin_bootstrap': needs_bootstrap,
        'bootstrap_token_required': bool((expected_token or '').strip()),
    }), 200


@app.route('/api/bootstrap/superadmin', methods=['POST'])
def bootstrap_superadmin():
    try:
        if _superadmin_exists():
            return jsonify({'message': 'Superadmin already exists'}), 409
    except SQLAlchemyError as err:
        print(f"⚠️ Bootstrap check failed: {err}")
        return jsonify({'message': 'Bootstrap unavailable: database not ready or migrations missing.'}), 503

    data = request.get_json() or {}
    username = _normalize_username(data.get('username') or '')
    password = data.get('password') or ''
    bootstrap_token = (data.get('bootstrapToken') or '').strip()
    expected_token = (os.environ.get('SUPERADMIN_BOOTSTRAP_TOKEN') or '').strip()

    if expected_token and not hmac.compare_digest(bootstrap_token, expected_token):
        return jsonify({'message': 'Invalid bootstrap token'}), 403

    if not username or not password:
        return jsonify({'message': 'Username and password are required'}), 400
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,80}", username):
        return jsonify({'message': 'Username must be 3-80 chars and use letters, numbers, ., _, or -'}), 400
    if len(username) < 3:
        return jsonify({'message': 'Username must be at least 3 characters'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if User.query.filter(db.func.lower(User.username) == username).first():
        return jsonify({'message': 'Username already exists'}), 400

    user = User(username=username, is_superadmin=True, is_admin=True, institution_id=None, is_active=True)
    user.set_password(password)
    try:
        db.session.add(user)
        db.session.commit()
    except SQLAlchemyError as err:
        db.session.rollback()
        print(f"⚠️ Bootstrap create failed: {err}")
        return jsonify({'message': 'Could not create superadmin due to database error'}), 500

    return jsonify({
        'id': user.id,
        'username': user.username,
        'role': role_for_user(user),
    }), 201


@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return _json_error("Invalid JSON body", 400, "invalid_json")
    username = _normalize_username(data.get('username') or '')
    password = data.get('password') or ''
    account_type = (data.get('accountType') or 'institution').strip().lower()
    institution_code = _normalize_institution_code(data.get('institutionCode') or '')
    access_code_input = (data.get('accessCode') or '').strip()

    if account_type not in {'institution', 'individual'}:
        return _json_error('accountType must be institution or individual', 400, "invalid_account_type")
    if not username or not password:
        return _json_error('Username and password are required', 400, "missing_credentials")
    if len(username) < 3:
        return _json_error('Username must be at least 3 characters', 400, "username_too_short")
    if len(password) < 8:
        return _json_error('Password must be at least 8 characters', 400, "password_too_short")
    if User.query.filter(db.func.lower(User.username) == username).first():
        return _json_error('User already exists', 409, "username_taken")

    institution = None
    redeemed_code = None
    if account_type == 'institution':
        if not institution_code:
            return _json_error('Institution code is required for institution accounts.', 400, "institution_code_required")
        institution = Institution.query.filter_by(registration_code=institution_code, is_active=True).first()
        if not institution:
            return _json_error('Invalid institution code. Ask your advisor or teacher for a valid code.', 400, "invalid_institution_code")
    else:
        if not access_code_input:
            return _json_error('Access code is required for individual accounts.', 400, "access_code_required")
        access_code_hash = _access_code_hash(access_code_input)

    user = User(
        username=username,
        institution_id=institution.id if institution else None,
        is_admin=False,
        is_superadmin=False,
        account_type=account_type,
    )
    user.set_password(password)

    try:
        if account_type == "individual":
            redeemed_code = (
                AccessCode.query
                .filter_by(code_hash=access_code_hash)
                .with_for_update()
                .first()
            )
            if not redeemed_code:
                return _json_error('Access code is invalid.', 400, "invalid_access_code")
            if not redeemed_code.is_active:
                return _json_error('Access code is inactive.', 400, "invalid_access_code")
            if redeemed_code.expires_at and redeemed_code.expires_at < datetime.utcnow():
                return _json_error('Access code has expired.', 400, "invalid_access_code")
            if redeemed_code.use_count >= redeemed_code.max_uses:
                return _json_error('Access code has already been used.', 400, "invalid_access_code")

        db.session.add(user)
        db.session.flush()
        if redeemed_code:
            redeemed_code.use_count += 1
            redeemed_code.redeemed_by_user_id = user.id
            redeemed_code.redeemed_at = datetime.utcnow()
        db.session.commit()
    except SQLAlchemyError as err:
        db.session.rollback()
        print(f"⚠️ Registration transaction failed: {err}")
        return _json_error("Registration failed due to a database error.", 500, "registration_db_error")

    return jsonify({
        'id': user.id,
        'name': user.username,
        'account_type': user.account_type,
        'institution_name': institution.name if institution else None,
        'institution_id': institution.id if institution else None,
        'role': role_for_user(user)
    }), 201


@app.route('/api/auth/credentials', methods=['POST'])
def verify_and_get_token():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()

    data = request.get_json() or {}
    username = _normalize_username(data.get('username') or '')
    password = data.get('password') or ''
    
    if _login_rate_limited(username, ip):
        app.logger.warning("login_rate_limited username=%s ip=%s", username or "<empty>", ip)
        return jsonify({'message': 'Too many login attempts for this account. Please wait a few minutes and try again.'}), 429

    if not username or not password:
        return jsonify({"message": "Username and password required"}), 400

    try:
        # Wrap the database call in a try/except
        user = User.query.filter(db.func.lower(User.username) == username).first()
    except SQLAlchemyError as e:
        db.session.rollback() # Crucial: rollback the broken transaction
        app.logger.error("db_connection_error during auth username=%s ip=%s error=%s", username, ip, str(e))
        return jsonify({"message": "Database connection error. Please try again."}), 503

    # Differentiate between missing user and bad password for internal logging
    if not user:
        app.logger.warning("login_failed_user_not_found username=%s ip=%s", username, ip)
        return jsonify({"message": "Invalid username or password"}), 401
        
    if not user.check_password(password):
        app.logger.warning("login_failed_bad_password username=%s ip=%s", username, ip)
        return jsonify({"message": "Invalid username or password"}), 401
        
    if not user.is_active:
        app.logger.warning("login_failed_inactive_account username=%s ip=%s", username, ip)
        return jsonify({"message": "Your account is deactivated. Contact your administrator."}), 403

    if user.account_type == "institution" and user.institution_id is not None:
        institution = Institution.query.get(user.institution_id)
        if not institution or not institution.is_active:
            app.logger.warning("login_failed_inactive_institution username=%s ip=%s", username, ip)
            return jsonify({"message": "Your institution is currently inactive."}), 403

    token = issue_token(user)
    app.logger.info("login_success username=%s ip=%s role=%s", username, ip, role_for_user(user))

    return jsonify({
        'id': user.id,
        'name': user.username,
        'token': token,
        'is_admin': user.is_admin,
        'is_superadmin': user.is_superadmin,
        'is_super_admin': user.is_superadmin,
        'role': role_for_user(user),
        'account_type': user.account_type,
        'institution_id': user.institution_id,
        'institution_name': user.institution.name if user.institution else None,
        'is_active': user.is_active,
    }), 200


@app.route('/api/session/me', methods=['GET'])
@token_required
def session_me(current_user):
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'is_admin': current_user.is_admin,
        'is_superadmin': current_user.is_superadmin,
        'is_super_admin': current_user.is_superadmin,
        'role': role_for_user(current_user),
        'account_type': current_user.account_type,
        'institution_id': current_user.institution_id,
        'institution_name': current_user.institution.name if current_user.institution else None,
        'is_active': current_user.is_active,
    }), 200


@app.route('/api/superadmin/summary', methods=['GET'])
@superadmin_required
def superadmin_summary(current_user):
    total_institutions = Institution.query.count()
    total_users = User.query.filter_by(is_superadmin=False).count()
    total_admins = User.query.filter_by(is_admin=True, is_superadmin=False).count()
    total_individual_users = User.query.filter_by(account_type='individual', is_superadmin=False).count()
    active_access_codes = AccessCode.query.filter_by(is_active=True).count()
    total_quizzes = QuizAttempt.query.filter_by(is_complete=True).count()
    return jsonify({
        'total_institutions': total_institutions,
        'total_users': total_users,
        'total_admins': total_admins,
        'total_individual_users': total_individual_users,
        'active_access_codes': active_access_codes,
        'total_quizzes_taken': total_quizzes,
    }), 200


@app.route('/api/superadmin/access-codes', methods=['GET'])
@superadmin_required
def list_access_codes(current_user):
    codes = AccessCode.query.order_by(AccessCode.created_at.desc()).limit(200).all()
    return jsonify([
        {
            'id': code.id,
            'label': code.label,
            'is_active': code.is_active,
            'max_uses': code.max_uses,
            'use_count': code.use_count,
            'created_at': code.created_at.isoformat(),
            'expires_at': code.expires_at.isoformat() if code.expires_at else None,
            'redeemed_at': code.redeemed_at.isoformat() if code.redeemed_at else None,
            'redeemed_by': code.redeemed_by_user.username if code.redeemed_by_user else None,
        }
        for code in codes
    ]), 200


@app.route('/api/superadmin/access-codes', methods=['POST'])
@superadmin_required
def create_access_codes(current_user):
    data = request.get_json(silent=True) or {}
    quantity = data.get('quantity', 1)
    label = (data.get('label') or '').strip() or None
    max_uses = data.get('max_uses', 1)
    expires_at_raw = (data.get('expires_at') or '').strip()

    try:
        quantity = int(quantity)
        max_uses = int(max_uses)
    except (TypeError, ValueError):
        return jsonify({'message': 'quantity and max_uses must be integers'}), 400
    if quantity < 1 or quantity > 200:
        return jsonify({'message': 'quantity must be between 1 and 200'}), 400
    if max_uses < 1 or max_uses > 1000:
        return jsonify({'message': 'max_uses must be between 1 and 1000'}), 400

    expires_at = None
    if expires_at_raw:
        try:
            expires_at = datetime.fromisoformat(expires_at_raw)
        except ValueError:
            return jsonify({'message': 'expires_at must be an ISO-8601 datetime'}), 400

    created = []
    for _ in range(quantity):
        plain, code_hash = _issue_unique_access_code()
        code = AccessCode(
            code_hash=code_hash,
            label=label,
            max_uses=max_uses,
            use_count=0,
            is_active=True,
            created_by_user_id=current_user.id,
            expires_at=expires_at,
        )
        db.session.add(code)
        created.append({'code': plain, 'label': label, 'max_uses': max_uses, 'expires_at': expires_at.isoformat() if expires_at else None})
    db.session.commit()
    return jsonify({'created': created, 'count': len(created)}), 201


@app.route('/api/superadmin/access-codes/<int:code_id>/status', methods=['PATCH'])
@superadmin_required
def set_access_code_status(current_user, code_id):
    data = request.get_json(silent=True) or {}
    next_status = data.get('is_active')
    if not isinstance(next_status, bool):
        return jsonify({'message': 'is_active must be true or false'}), 400
    code = AccessCode.query.get(code_id)
    if not code:
        return jsonify({'message': 'Access code not found'}), 404
    code.is_active = next_status
    db.session.commit()
    return jsonify({'id': code.id, 'is_active': code.is_active}), 200


@app.route('/api/superadmin/institutions', methods=['GET'])
@superadmin_required
def list_institutions(current_user):
    institutions = Institution.query.order_by(Institution.name.asc()).all()
    payload = []
    for inst in institutions:
        user_count = User.query.filter_by(institution_id=inst.id, is_superadmin=False).count()
        admin_count = User.query.filter_by(institution_id=inst.id, is_admin=True, is_superadmin=False).count()
        quiz_count = (
            db.session.query(QuizAttempt)
            .join(User, QuizAttempt.user_id == User.id)
            .filter(User.institution_id == inst.id, QuizAttempt.is_complete == True)
            .count()
        )
        payload.append({
            'id': inst.id,
            'name': inst.name,
            'registration_code': inst.registration_code,
            'is_active': inst.is_active,
            'users': user_count,
            'admins': admin_count,
            'quizzes_taken': quiz_count,
        })
    return jsonify(payload), 200


@app.route('/api/superadmin/institutions', methods=['POST'])
@superadmin_required
def create_institution(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Institution name is required'}), 400
    if Institution.query.filter_by(name=name).first():
        return jsonify({'message': 'Institution already exists'}), 400

    institution = Institution(name=name, registration_code=generate_registration_code(), is_active=True)
    db.session.add(institution)
    db.session.commit()

    return jsonify({
        'id': institution.id,
        'name': institution.name,
        'registration_code': institution.registration_code,
        'is_active': institution.is_active,
    }), 201


@app.route('/api/superadmin/institutions/<int:institution_id>', methods=['GET'])
@superadmin_required
def get_institution_detail(current_user, institution_id):
    institution = Institution.query.get(institution_id)
    if not institution:
        return jsonify({'message': 'Institution not found'}), 404

    users = User.query.filter_by(institution_id=institution_id, is_superadmin=False).order_by(User.username.asc()).all()
    admins = [
        {'id': u.id, 'username': u.username}
        for u in users if u.is_admin
    ]

    quiz_count = (
        db.session.query(QuizAttempt)
        .join(User, QuizAttempt.user_id == User.id)
        .filter(User.institution_id == institution_id, QuizAttempt.is_complete == True)
        .count()
    )

    return jsonify({
        'id': institution.id,
        'name': institution.name,
        'registration_code': institution.registration_code,
        'is_active': institution.is_active,
        'users': [{'id': u.id, 'username': u.username, 'is_admin': u.is_admin, 'is_active': u.is_active} for u in users],
        'admins': admins,
        'user_count': len(users),
        'admin_count': len(admins),
        'quizzes_taken': quiz_count,
    }), 200


@app.route('/api/superadmin/institutions/<int:institution_id>/code/regenerate', methods=['POST'])
@superadmin_required
def regenerate_code(current_user, institution_id):
    institution = Institution.query.get(institution_id)
    if not institution:
        return jsonify({'message': 'Institution not found'}), 404
    institution.registration_code = generate_registration_code()
    db.session.commit()
    return jsonify({'registration_code': institution.registration_code}), 200


@app.route('/api/superadmin/institutions/<int:institution_id>/status', methods=['PATCH'])
@superadmin_required
def update_institution_status(current_user, institution_id):
    institution = Institution.query.get(institution_id)
    if not institution:
        return jsonify({'message': 'Institution not found'}), 404
    data = request.get_json() or {}
    next_status = data.get('is_active')
    if not isinstance(next_status, bool):
        return jsonify({'message': 'is_active must be true or false'}), 400
    institution.is_active = next_status
    db.session.commit()
    app.logger.info("institution_status_changed actor_user_id=%s institution_id=%s is_active=%s", current_user.id, institution_id, next_status)
    return jsonify({'is_active': institution.is_active}), 200


@app.route('/api/superadmin/institutions/<int:institution_id>/admins', methods=['POST'])
@superadmin_required
def set_institution_admin(current_user, institution_id):
    institution = Institution.query.get(institution_id)
    if not institution:
        return jsonify({'message': 'Institution not found'}), 404

    data = request.get_json() or {}
    user_id = data.get('user_id')
    make_admin = bool(data.get('make_admin'))

    user = User.query.filter_by(id=user_id, institution_id=institution_id, is_superadmin=False).first()
    if not user:
        return jsonify({'message': 'User not found in this institution'}), 404

    user.is_admin = make_admin
    db.session.commit()
    app.logger.info("admin_role_changed actor_user_id=%s target_user_id=%s institution_id=%s is_admin=%s", current_user.id, user.id, institution_id, make_admin)
    return jsonify({'id': user.id, 'username': user.username, 'is_admin': user.is_admin}), 200


@app.route('/api/superadmin/users/<int:user_id>/status', methods=['PATCH'])
@superadmin_required
def set_user_active_status(current_user, user_id):
    data = request.get_json() or {}
    next_status = data.get('is_active')
    if not isinstance(next_status, bool):
        return jsonify({'message': 'is_active must be true or false'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    if user.is_superadmin:
        return jsonify({'message': 'Superadmin accounts cannot be deactivated here'}), 403

    user.is_active = next_status
    db.session.commit()
    app.logger.info("user_status_changed actor_user_id=%s target_user_id=%s is_active=%s", current_user.id, user.id, next_status)
    return jsonify({'id': user.id, 'username': user.username, 'is_active': user.is_active}), 200


@app.route('/api/admin/users/<int:user_id>/status', methods=['PATCH'])
@institution_admin_required
def set_student_active_status(current_user, user_id):
    data = request.get_json() or {}
    next_status = data.get('is_active')
    if not isinstance(next_status, bool):
        return jsonify({'message': 'is_active must be true or false'}), 400

    user = User.query.filter_by(id=user_id, institution_id=current_user.institution_id, is_superadmin=False).first()
    if not user:
        return jsonify({'message': 'User not found in your institution'}), 404
    if user.is_admin:
        return jsonify({'message': 'Institution admins cannot be managed from this endpoint'}), 403

    user.is_active = next_status
    db.session.commit()
    app.logger.info("student_status_changed actor_user_id=%s target_user_id=%s institution_id=%s is_active=%s", current_user.id, user.id, current_user.institution_id, next_status)
    return jsonify({'id': user.id, 'username': user.username, 'is_active': user.is_active}), 200


@app.route('/api/admin/institution/summary', methods=['GET'])
@institution_admin_required
def institution_admin_summary(current_user):
    institution_id = current_user.institution_id
    students = User.query.filter_by(institution_id=institution_id, is_superadmin=False).all()
    student_ids = [u.id for u in students]
    attempts = QuizAttempt.query.filter(QuizAttempt.user_id.in_(student_ids), QuizAttempt.is_complete == True).all() if student_ids else []

    total_students = len([u for u in students if not u.is_admin])
    total_quizzes = len(attempts)
    avg_score = (sum(a.score for a in attempts if a.score is not None) / len(attempts)) if attempts else None

    activity = sorted([
        {
            'id': u.id,
            'username': u.username,
            'is_admin': u.is_admin,
            'is_active': u.is_active,
            'quizzes_taken': len([a for a in attempts if a.user_id == u.id]),
            'last_active': max([a.timestamp for a in attempts if a.user_id == u.id]).isoformat() if any(a.user_id == u.id for a in attempts) else None,
            'average_score': (
                sum(a.score for a in attempts if a.user_id == u.id and a.score is not None) /
                len([a for a in attempts if a.user_id == u.id and a.score is not None])
            ) if any(a.user_id == u.id and a.score is not None for a in attempts) else None,
        }
        for u in students
    ], key=lambda x: x['quizzes_taken'], reverse=True)

    category_totals = {}
    for attempt in attempts:
        if attempt.results_by_category:
            for category, result in attempt.results_by_category.items():
                if category not in category_totals:
                    category_totals[category] = {'correct': 0, 'total': 0}
                category_totals[category]['correct'] += result['correct']
                category_totals[category]['total'] += result['total']

    institution = Institution.query.get(institution_id)

    return jsonify({
        'institution': {
            'id': institution.id,
            'name': institution.name,
            'registration_code': institution.registration_code,
        },
        'totals': {
            'total_students': total_students,
            'total_quizzes_taken': total_quizzes,
            'average_score': avg_score,
        },
        'users': activity,
        'category_performance': category_totals,
        'leaderboard': [
            row for row in activity if not row["is_admin"]
        ][:10],
        'recently_active_users': [row for row in activity if row["last_active"]][:5],
        'inactive_users': [row for row in activity if not row["is_active"] or not row["last_active"]][:15],
    }), 200


@app.route('/api/user/focus-areas', methods=['GET'])
@token_required
def get_user_focus_areas(current_user):
    metrics = _compute_category_metrics(current_user.id)
    weak = [m for m in metrics if m["classification"] == "weak"][:5]
    for item in weak:
        item["recommended_action"] = "Complete a targeted practice set and review explanations."
        item["suggested_question_count"] = 12 if item["total_answered"] < 40 else 8
    return jsonify({
        "focus_areas": weak,
        "summary": {
            "total_categories_evaluated": len(metrics),
            "weak_categories": len([m for m in metrics if m["classification"] == "weak"]),
        },
    }), 200


@app.route('/api/leaderboard/institution', methods=['GET'])
@token_required
def institution_leaderboard(current_user):
    institution_id = current_user.institution_id
    if not institution_id:
        return jsonify({"rows": []}), 200
    users = User.query.filter_by(institution_id=institution_id, is_superadmin=False, is_active=True).all()
    rows = []
    for user in users:
        state = UserGamification.query.filter_by(user_id=user.id).first()
        rows.append({
            "user_id": user.id,
            "username": user.username,
            "xp": state.xp if state else 0,
            "level": _level_for_xp(state.xp) if state else 1,
            "streak": state.current_streak_days if state else 0,
            "is_admin": user.is_admin,
        })
    rows.sort(key=lambda x: (x["xp"], x["streak"]), reverse=True)
    return jsonify({"rows": rows[:20]}), 200


@app.route('/api/admin/assignments', methods=['POST'])
@institution_admin_required
def create_assignment(current_user):
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return _json_error("title is required", 400, "title_required")

    categories = data.get("categories") or []
    difficulties = data.get("difficulties") or []
    if not isinstance(categories, list) or not all(isinstance(item, str) for item in categories):
        return _json_error("categories must be a list of strings", 400, "invalid_categories")
    if not isinstance(difficulties, list) or not all(isinstance(item, str) for item in difficulties):
        return _json_error("difficulties must be a list of strings", 400, "invalid_difficulties")

    valid_categories = [c[0] for c in db.session.query(Question.category).distinct().all()]
    valid_difficulties = [d[0] for d in db.session.query(Question.difficulty).distinct().all()]
    if any(category not in valid_categories for category in categories):
        return _json_error("One or more categories are invalid.", 400, "invalid_categories")
    if any(diff not in valid_difficulties for diff in difficulties):
        return _json_error("One or more difficulties are invalid.", 400, "invalid_difficulties")

    try:
        question_count = int(data.get("question_count") or 20)
    except (TypeError, ValueError):
        return _json_error("question_count must be an integer", 400, "invalid_question_count")

    due_date_raw = (data.get("due_date") or "").strip()
    if due_date_raw:
        try:
            due_date = datetime.fromisoformat(due_date_raw)
        except ValueError:
            return _json_error("due_date must be a valid ISO datetime string", 400, "invalid_due_date")
    else:
        due_date = None

    time_limit_minutes = data.get("time_limit_minutes")
    if time_limit_minutes in (None, ""):
        time_limit_minutes = None
    else:
        try:
            time_limit_minutes = int(time_limit_minutes)
        except (TypeError, ValueError):
            return _json_error("time_limit_minutes must be an integer", 400, "invalid_time_limit")
        if time_limit_minutes <= 0:
            return _json_error("time_limit_minutes must be greater than 0", 400, "invalid_time_limit")

    minimum_passing_score = data.get("minimum_passing_score")
    if minimum_passing_score in (None, ""):
        minimum_passing_score = None
    else:
        try:
            minimum_passing_score = int(minimum_passing_score)
        except (TypeError, ValueError):
            return _json_error("minimum_passing_score must be an integer", 400, "invalid_minimum_passing_score")
        if minimum_passing_score < 1 or minimum_passing_score > 100:
            return _json_error("minimum_passing_score must be between 1 and 100", 400, "invalid_minimum_passing_score")

    mode = (data.get("mode") or "practice").strip().lower()
    if mode not in ("practice", "test"):
        return _json_error("mode must be either 'practice' or 'test'", 400, "invalid_mode")

    selected_user_ids = data.get("selected_user_ids") or []
    assign_to_all = bool(data.get("assign_to_all", True))
    if not assign_to_all:
        if not isinstance(selected_user_ids, list):
            return _json_error("selected_user_ids must be a list", 400, "invalid_selected_users")
        try:
            selected_user_ids = [int(uid) for uid in selected_user_ids]
        except (TypeError, ValueError):
            return _json_error("selected_user_ids must contain integers", 400, "invalid_selected_users")
        allowed_ids = {
            u.id for u in User.query.filter_by(
                institution_id=current_user.institution_id,
                is_admin=False,
                is_superadmin=False,
                is_active=True,
            ).all()
        }
        if any(uid not in allowed_ids for uid in selected_user_ids):
            return _json_error("selected_user_ids must belong to active learners in your institution", 400, "invalid_selected_users")
        if len(selected_user_ids) == 0:
            return _json_error("Select at least one learner or assign to all.", 400, "no_selected_users")

    assignment = Assignment(
        institution_id=current_user.institution_id,
        created_by_user_id=current_user.id,
        title=title,
        description=(data.get("description") or "").strip() or None,
        categories=categories,
        difficulties=difficulties,
        question_count=max(5, min(question_count, 100)),
        due_date=due_date,
        time_limit_minutes=time_limit_minutes,
        mode=mode,
        shuffle_questions=bool(data.get("shuffle_questions", True)),
        show_explanations=bool(data.get("show_explanations", True)),
        minimum_passing_score=minimum_passing_score,
    )
    db.session.add(assignment)
    db.session.flush()
    if assign_to_all:
        recipients = User.query.filter_by(
            institution_id=current_user.institution_id,
            is_admin=False,
            is_superadmin=False,
            is_active=True,
        ).all()
        selected_user_ids = [u.id for u in recipients]
    if len(selected_user_ids) == 0:
        return _json_error("No eligible learners found for this assignment.", 400, "no_recipients")
    for user_id in selected_user_ids:
        db.session.add(AssignmentRecipient(assignment_id=assignment.id, user_id=int(user_id)))
    db.session.commit()
    app.logger.info(
        "assignment_created actor_user_id=%s institution_id=%s assignment_id=%s assigned_count=%s mode=%s",
        current_user.id,
        current_user.institution_id,
        assignment.id,
        len(selected_user_ids),
        mode,
    )
    return jsonify({"id": assignment.id, "assigned_count": len(selected_user_ids)}), 201


@app.route('/api/admin/assignments', methods=['GET'])
@institution_admin_required
def list_assignments(current_user):
    assignments = Assignment.query.filter_by(institution_id=current_user.institution_id).order_by(Assignment.created_at.desc()).all()
    all_active_learners = User.query.filter_by(
        institution_id=current_user.institution_id,
        is_admin=False,
        is_superadmin=False,
        is_active=True,
    ).count()
    payload = []
    for assignment in assignments:
        recipients = AssignmentRecipient.query.filter_by(assignment_id=assignment.id).all()
        recipient_ids = [r.user_id for r in recipients]
        completed_attempts = QuizAttempt.query.filter(
            QuizAttempt.assignment_id == assignment.id,
            QuizAttempt.is_complete == True
        ).all()
        completion_map = {a.user_id: a for a in completed_attempts}
        missing = [uid for uid in recipient_ids if uid not in completion_map]
        payload.append({
            "id": assignment.id,
            "title": assignment.title,
            "description": assignment.description,
            "mode": assignment.mode,
            "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
            "question_count": assignment.question_count,
            "categories": assignment.categories or [],
            "difficulties": assignment.difficulties or [],
            "time_limit_minutes": assignment.time_limit_minutes,
            "assign_to_all": len(recipient_ids) >= all_active_learners,
            "shuffle_questions": assignment.shuffle_questions if assignment.shuffle_questions is not None else True,
            "show_explanations": assignment.show_explanations if assignment.show_explanations is not None else True,
            "minimum_passing_score": assignment.minimum_passing_score,
            "assigned_count": len(recipient_ids),
            "completed_count": len(completed_attempts),
            "missing_count": len(missing),
            "average_score": round(sum(a.score for a in completed_attempts if a.score is not None) / len(completed_attempts), 1) if completed_attempts else None,
        })
    return jsonify(payload), 200


@app.route('/api/user/assignments', methods=['GET'])
@token_required
def list_user_assignments(current_user):
    if current_user.is_admin or current_user.is_superadmin:
        return _json_error("Assignments are only available for learner accounts.", 403, "assignments_forbidden")

    recipients = AssignmentRecipient.query.filter_by(user_id=current_user.id).all()
    assignment_ids = [recipient.assignment_id for recipient in recipients]
    if not assignment_ids:
        return jsonify([]), 200

    assignments = (
        Assignment.query
        .filter(Assignment.id.in_(assignment_ids), Assignment.is_active == True)
        .order_by(Assignment.due_date.asc().nullslast(), Assignment.created_at.desc())
        .all()
    )

    assignment_attempts = QuizAttempt.query.filter(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.assignment_id.in_(assignment_ids),
    ).all()
    latest_attempt_map = {}
    completed_map = {}
    in_progress_map = {}
    for attempt in assignment_attempts:
        existing = latest_attempt_map.get(attempt.assignment_id)
        if not existing or attempt.timestamp > existing.timestamp:
            latest_attempt_map[attempt.assignment_id] = attempt
        if attempt.is_complete:
            existing_completed = completed_map.get(attempt.assignment_id)
            if not existing_completed or attempt.timestamp > existing_completed.timestamp:
                completed_map[attempt.assignment_id] = attempt
        else:
            existing_in_progress = in_progress_map.get(attempt.assignment_id)
            if not existing_in_progress or attempt.timestamp > existing_in_progress.timestamp:
                in_progress_map[attempt.assignment_id] = attempt

    payload = []
    for assignment in assignments:
        latest = latest_attempt_map.get(assignment.id)
        attempt = completed_map.get(assignment.id)
        in_progress = in_progress_map.get(assignment.id)
        payload.append({
            "id": assignment.id,
            "title": assignment.title,
            "description": assignment.description,
            "mode": assignment.mode,
            "question_count": assignment.question_count,
            "categories": assignment.categories or [],
            "difficulties": assignment.difficulties or [],
            "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
            "time_limit_minutes": assignment.time_limit_minutes,
            "shuffle_questions": assignment.shuffle_questions if assignment.shuffle_questions is not None else True,
            "show_explanations": assignment.show_explanations if assignment.show_explanations is not None else True,
            "minimum_passing_score": assignment.minimum_passing_score,
            "is_completed": attempt is not None,
            "latest_attempt_id": latest.id if latest else None,
            "latest_score": latest.score if latest and latest.is_complete else None,
            "in_progress_attempt_id": in_progress.id if in_progress else None,
        })

    return jsonify(payload), 200


@app.route('/api/admin/reports/assignment-completion.csv', methods=['GET'])
@institution_admin_required
def export_assignment_completion(current_user):
    assignments = Assignment.query.filter_by(institution_id=current_user.institution_id).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["assignment_id", "title", "assigned_learners", "completed_learners", "average_score"])
    for assignment in assignments:
        recipients = AssignmentRecipient.query.filter_by(assignment_id=assignment.id).count()
        completed = QuizAttempt.query.filter_by(assignment_id=assignment.id, is_complete=True).all()
        avg = round(sum(a.score for a in completed if a.score is not None) / len(completed), 1) if completed else ""
        writer.writerow([assignment.id, assignment.title, recipients, len(completed), avg])
    response = make_response(output.getvalue())
    response.headers["Content-Type"] = "text/csv"
    response.headers["Content-Disposition"] = "attachment; filename=assignment_completion.csv"
    return response


@app.route('/api/quiz/start-targeted', methods=['POST'])
@token_required
def start_targeted_quiz(current_user):
    data = request.get_json(silent=True) or {}
    num_questions = int(data.get("numQuestions", 12))
    num_questions = min(max(num_questions, 5), 40)
    difficulty = data.get("difficulty")
    metrics = _compute_category_metrics(current_user.id)
    weak_categories = [m["category"] for m in metrics if m["classification"] == "weak"]
    developing = [m["category"] for m in metrics if m["classification"] == "developing"]
    if not weak_categories and metrics:
        weak_categories = [metrics[0]["category"]]

    recent_attempts = QuizAttempt.query.filter_by(user_id=current_user.id).order_by(QuizAttempt.timestamp.desc()).limit(5).all()
    recent_qids = set()
    for attempt in recent_attempts:
        recent_qids.update(attempt.question_ids or [])

    pool = Question.query
    if difficulty:
        pool = pool.filter_by(difficulty=difficulty)
    prioritized_categories = weak_categories + developing[:2]
    if prioritized_categories:
        pool = pool.filter(Question.category.in_(prioritized_categories))
    questions = [q for q in pool.all() if q.id not in recent_qids]
    if len(questions) < num_questions:
        backup_q = Question.query
        if difficulty:
            backup_q = backup_q.filter_by(difficulty=difficulty)
        questions = list({q.id: q for q in (questions + backup_q.all())}.values())
    shuffle_questions = bool(data.get("shuffle_questions", True))
    if shuffle_questions:
        random.shuffle(questions)
    else:
        questions.sort(key=lambda item: item.id)
    selected = questions[:num_questions]
    if not selected:
        return _json_error("No questions available for targeted quiz.", 400, "no_questions")

    new_attempt = QuizAttempt(
        test_name='Targeted Focus Quiz',
        total_questions=len(selected),
        user_id=current_user.id,
        question_ids=[q.id for q in selected],
        answers={},
        is_complete=False
    )
    db.session.add(new_attempt)
    db.session.commit()
    return jsonify({
        "attemptId": new_attempt.id,
        "questions": [q.to_dict() for q in selected],
        "targeted_categories": weak_categories[:3],
    }), 200


@app.route('/api/quiz/start-assignment', methods=['POST'])
@token_required
def start_assignment_quiz(current_user):
    data = request.get_json(silent=True) or {}
    assignment_id = data.get("assignmentId")
    assignment = Assignment.query.get(assignment_id)
    if not assignment or not assignment.is_active:
        return _json_error("Assignment not found.", 404, "assignment_not_found")
    recipient = AssignmentRecipient.query.filter_by(assignment_id=assignment.id, user_id=current_user.id).first()
    if not recipient:
        return _json_error("You are not assigned to this assignment.", 403, "assignment_forbidden")
    if assignment.due_date and assignment.due_date < datetime.utcnow():
        return _json_error("This assignment is past due and can no longer be started.", 403, "assignment_past_due")

    existing_attempt = QuizAttempt.query.filter_by(
        user_id=current_user.id,
        assignment_id=assignment.id,
        is_complete=False,
    ).order_by(QuizAttempt.timestamp.desc()).first()
    if existing_attempt:
        qs = Question.query.filter(Question.id.in_(existing_attempt.question_ids or [])).all()
        id_to_q = {q.id: q for q in qs}
        ordered = [id_to_q[qid] for qid in (existing_attempt.question_ids or []) if qid in id_to_q]
        return jsonify({
            "attemptId": existing_attempt.id,
            "questions": [q.to_dict() for q in ordered],
            "resumed": True,
            "startedAt": existing_attempt.timestamp.isoformat() if existing_attempt.timestamp else None,
            "timeLimitMinutes": assignment.time_limit_minutes,
            "dueDate": assignment.due_date.isoformat() if assignment.due_date else None,
        }), 200

    completed_attempt = QuizAttempt.query.filter_by(
        user_id=current_user.id,
        assignment_id=assignment.id,
        is_complete=True,
    ).first()
    if completed_attempt:
        return _json_error("Assignment already completed. Multiple attempts are not allowed.", 409, "assignment_already_completed")

    q = Question.query
    if assignment.categories:
        q = q.filter(Question.category.in_(assignment.categories))
    if assignment.difficulties:
        q = q.filter(Question.difficulty.in_(assignment.difficulties))
    selected = q.all()
    if assignment.shuffle_questions is not False:
        random.shuffle(selected)
    else:
        selected.sort(key=lambda item: item.id)
    selected = selected[:assignment.question_count]
    if not selected:
        return _json_error("No questions available for this assignment.", 400, "assignment_no_questions")
    attempt = QuizAttempt(
        test_name=f"Assignment: {assignment.title}",
        total_questions=len(selected),
        user_id=current_user.id,
        assignment_id=assignment.id,
        question_ids=[item.id for item in selected],
        answers={},
        is_complete=False,
    )
    db.session.add(attempt)
    db.session.commit()
    app.logger.info("assignment_attempt_started assignment_id=%s attempt_id=%s user_id=%s", assignment.id, attempt.id, current_user.id)
    return jsonify({
        "attemptId": attempt.id,
        "questions": [q.to_dict() for q in selected],
        "resumed": False,
        "startedAt": attempt.timestamp.isoformat() if attempt.timestamp else None,
        "timeLimitMinutes": assignment.time_limit_minutes,
        "dueDate": assignment.due_date.isoformat() if assignment.due_date else None,
    }), 200


@app.route('/api/quiz/start', methods=['POST'])
@token_required
def start_quiz(current_user):
    data = request.get_json() or {}
    cats = data.get('categories', [])
    diffs = data.get('difficulties', [])
    q = Question.query
    if cats:
        q = q.filter(Question.category.in_(cats))
    if diffs:
        q = q.filter(Question.difficulty.in_(diffs))
    selected = q.all()

    requested_count = data.get('numQuestions')
    if requested_count is not None:
        try:
            requested_count = max(1, int(requested_count))
        except (TypeError, ValueError):
            return jsonify({'message': 'numQuestions must be a positive integer'}), 400

    shuffle_questions = bool(data.get("shuffle_questions", True))
    if shuffle_questions:
        random.shuffle(selected)
    else:
        selected.sort(key=lambda item: item.id)

    if requested_count is not None:
        selected = selected[:requested_count]

    ids = [q.id for q in selected]
    new_attempt = QuizAttempt(
        test_name=data.get('testName', 'Practice Quiz'),
        total_questions=len(ids),
        user_id=current_user.id,
        question_ids=ids,
        answers={},
        is_complete=False
    )
    db.session.add(new_attempt)
    db.session.commit()
    return jsonify({
        'attemptId': new_attempt.id,
        'questions': [q.to_dict() for q in selected]
    }), 200


@app.route('/api/quiz/submit', methods=['POST'])
@token_required
def submit_quiz(current_user):
    data = request.get_json() or {}
    attempt_id = data.get('attemptId')

    if attempt_id is None:
        return jsonify({'message': 'attemptId required'}), 400

    try:
        attempt_id = int(attempt_id)
    except (TypeError, ValueError):
        return jsonify({'message': 'attemptId must be a valid integer'}), 400

    attempt = QuizAttempt.query.filter_by(id=attempt_id, user_id=current_user.id).first()
    if not attempt:
        return jsonify({'message': 'Attempt not found'}), 404

    if attempt.is_complete:
        return jsonify({'message': 'Quiz already submitted', 'attempt': attempt.to_dict()}), 200
    if attempt.assignment_id:
        assignment = Assignment.query.get(attempt.assignment_id)
        now = datetime.utcnow()
        if assignment:
            if assignment.due_date and now > assignment.due_date:
                return _json_error("Assignment due date has passed. Submission rejected.", 403, "assignment_due_date_passed")
            if assignment.time_limit_minutes:
                started_at = attempt.timestamp or now
                elapsed_seconds = (now - started_at).total_seconds()
                if elapsed_seconds > assignment.time_limit_minutes * 60:
                    return _json_error("Time limit exceeded for this assignment.", 403, "assignment_time_limit_exceeded")

    questions = Question.query.filter(Question.id.in_(attempt.question_ids)).all()
    question_map = {q.id: q for q in questions}
    results = {}
    for q_id_str, user_answer in attempt.answers.items():
        q_id = int(q_id_str)
        if q_id in question_map:
            question = question_map[q_id]
            category = question.category
            if category not in results:
                results[category] = {'correct': 0, 'total': 0}

            results[category]['total'] += 1
            if user_answer == question.correctAnswer:
                results[category]['correct'] += 1

    attempt.results_by_category = results
    total_correct = sum(r['correct'] for r in results.values())
    attempt.score = int((total_correct / attempt.total_questions) * 100) if attempt.total_questions > 0 else 0
    attempt.is_complete = True
    flag_modified(attempt, "results_by_category")
    total_answered = len(attempt.answers or {})

    state = _get_or_create_gamification(current_user.id)
    today = datetime.utcnow().date()
    previous_date = state.last_practice_date
    if previous_date == today:
        streak_increment = 0
    elif previous_date == (today - timedelta(days=1)):
        state.current_streak_days += 1
        streak_increment = 1
    else:
        state.current_streak_days = 1
        streak_increment = 1
    state.last_practice_date = today
    state.best_streak_days = max(state.best_streak_days, state.current_streak_days)

    xp_earned = 10 + (total_correct * 2)
    if attempt.score and attempt.score >= 80:
        xp_earned += 10
    if streak_increment:
        xp_earned += 5
    state.xp += xp_earned
    state.total_questions_answered += total_answered
    state.total_correct_answers += total_correct

    unlocked = []
    if state.total_questions_answered >= 1:
        badge = _unlock_badge(current_user.id, "first_session")
        if badge:
            unlocked.append({'key': badge.badge_key, 'title': badge.title})
    if total_correct >= 10:
        badge = _unlock_badge(current_user.id, "ten_correct_session")
        if badge:
            unlocked.append({'key': badge.badge_key, 'title': badge.title})
    if state.current_streak_days >= 7:
        badge = _unlock_badge(current_user.id, "streak_7")
        if badge:
            unlocked.append({'key': badge.badge_key, 'title': badge.title})
    if state.total_questions_answered >= 100:
        badge = _unlock_badge(current_user.id, "hundred_questions")
        if badge:
            unlocked.append({'key': badge.badge_key, 'title': badge.title})
    mastery = User.query.filter_by(id=current_user.id).first()
    if mastery:
        perf = QuizAttempt.query.filter_by(user_id=current_user.id, is_complete=True).all()
        totals = {}
        for item in perf:
            if not item.results_by_category:
                continue
            for category, result in item.results_by_category.items():
                totals.setdefault(category, {'correct': 0, 'total': 0})
                totals[category]['correct'] += result['correct']
                totals[category]['total'] += result['total']
        if any(v['total'] >= 20 and (v['correct'] / v['total']) >= 0.8 for v in totals.values()):
            badge = _unlock_badge(current_user.id, "mastery_80")
            if badge:
                unlocked.append({'key': badge.badge_key, 'title': badge.title})

    db.session.commit()
    if attempt.assignment_id:
        app.logger.info("assignment_submitted assignment_id=%s attempt_id=%s user_id=%s score=%s", attempt.assignment_id, attempt.id, current_user.id, attempt.score)
    goal = _today_question_goal_progress(current_user.id)

    return jsonify({
        'message': 'Quiz submitted',
        'attempt': attempt.to_dict(),
        'gamification': {
            'xp_earned': xp_earned,
            'total_xp': state.xp,
            'level': _level_for_xp(state.xp),
            'current_streak_days': state.current_streak_days,
            'best_streak_days': state.best_streak_days,
            'daily_goal': goal,
            'badges_unlocked': unlocked,
        }
    }), 200


@app.route('/api/quiz/attempt/<int:attempt_id>/results', methods=['GET'])
@token_required
def get_attempt_results(current_user, attempt_id):
    attempt = QuizAttempt.query.filter_by(id=attempt_id, user_id=current_user.id).first()
    if not attempt:
        return jsonify({'message': 'Attempt not found'}), 404

    questions = Question.query.filter(Question.id.in_(attempt.question_ids)).all()
    id_to_q = {q.id: q for q in questions}
    ordered_questions = [id_to_q[qid].to_dict() for qid in attempt.question_ids if qid in id_to_q]

    return jsonify({'attempt': attempt.to_dict(), 'questions': ordered_questions}), 200


@app.route('/api/user/progress', methods=['GET'])
@token_required
def get_user_progress(current_user):
    attempts = QuizAttempt.query.filter_by(user_id=current_user.id, is_complete=True).order_by(QuizAttempt.timestamp.asc()).all()

    progress_data = []
    overall_performance = {}

    for attempt in attempts:
        if attempt.results_by_category:
            for category, result in attempt.results_by_category.items():
                score = (result['correct'] / result['total']) * 100 if result['total'] > 0 else 0

                progress_data.append({
                    'timestamp': attempt.timestamp.isoformat(),
                    'test_name': attempt.test_name,
                    'category': category,
                    'score': score
                })

                if category not in overall_performance:
                    overall_performance[category] = {'correct': 0, 'total': 0}
                overall_performance[category]['correct'] += result['correct']
                overall_performance[category]['total'] += result['total']

    return jsonify({'progress_data': progress_data, 'overall_performance': overall_performance}), 200


@app.route('/api/user/analytics', methods=['GET'])
@token_required
def get_user_analytics(current_user):
    period = (request.args.get("period") or "all").strip().lower()
    now = datetime.utcnow()
    query = QuizAttempt.query.filter_by(user_id=current_user.id, is_complete=True)
    if period == "7d":
        query = query.filter(QuizAttempt.timestamp >= now - timedelta(days=7))
    elif period == "30d":
        query = query.filter(QuizAttempt.timestamp >= now - timedelta(days=30))
    attempts = query.order_by(QuizAttempt.timestamp.desc()).all()
    scores = [a.score for a in attempts if a.score is not None]
    totals = sum(a.total_questions for a in attempts)
    metrics = _compute_category_metrics(current_user.id)
    weak = [m for m in metrics if m["classification"] == "weak"][:3]
    strong = [m for m in metrics if m["classification"] == "strong"][:3]
    readiness = 0
    if scores:
        readiness = round((sum(scores) / len(scores)) * 0.7 + min(len(attempts), 20) * 1.5, 1)
    return jsonify({
        "period": period,
        "quizzes_completed": len(attempts),
        "questions_answered": totals,
        "overall_accuracy": round(sum(scores) / len(scores), 1) if scores else 0,
        "recent_scores": scores[:10],
        "category_mastery": metrics,
        "weakest_categories": weak,
        "strongest_categories": strong,
        "practice_readiness": min(readiness, 100),
    }), 200


@app.route('/api/quiz/answer', methods=['POST'])
@token_required
def save_answer(current_user):
    data = request.get_json() or {}
    attempt_id = data.get('attemptId')
    question_id = data.get('questionId')
    answer = data.get('answer')
    attempt = QuizAttempt.query.filter_by(id=attempt_id, user_id=current_user.id).first()
    if not attempt:
        return jsonify({'message': 'Attempt not found'}), 404
    if attempt.is_complete:
        return _json_error("Cannot modify answers for a completed attempt.", 403, "attempt_immutable")
    if attempt.assignment_id:
        assignment = Assignment.query.get(attempt.assignment_id)
        now = datetime.utcnow()
        if assignment:
            if assignment.due_date and now > assignment.due_date:
                return _json_error("Cannot save answers after assignment due date.", 403, "assignment_due_date_passed")
            if assignment.time_limit_minutes:
                started_at = attempt.timestamp or now
                elapsed_seconds = (now - started_at).total_seconds()
                if elapsed_seconds > assignment.time_limit_minutes * 60:
                    return _json_error("Cannot save answers after assignment time limit expires.", 403, "assignment_time_limit_exceeded")
    new_answers = attempt.answers.copy()
    new_answers[str(question_id)] = answer
    attempt.answers = new_answers
    db.session.commit()
    return jsonify({'message': 'Answer saved'}), 200


@app.route('/api/user/attempts', methods=['GET'])
@token_required
def get_user_attempts(current_user):
    attempts = QuizAttempt.query.filter_by(user_id=current_user.id).order_by(QuizAttempt.timestamp.desc()).all()
    payload = []
    for attempt in attempts:
        try:
            payload.append(attempt.to_dict())
        except Exception as exc:
            app.logger.exception("Skipping malformed attempt during /api/user/attempts for user_id=%s attempt_id=%s: %s", current_user.id, getattr(attempt, "id", None), exc)
    return jsonify(payload)


@app.route('/api/user/gamification-summary', methods=['GET'])
@token_required
def get_user_gamification_summary(current_user):
    state = _get_or_create_gamification(current_user.id)
    attempts = QuizAttempt.query.filter_by(user_id=current_user.id, is_complete=True).order_by(QuizAttempt.timestamp.desc()).limit(10).all()
    category_totals = {}
    for attempt in QuizAttempt.query.filter_by(user_id=current_user.id, is_complete=True).all():
        if not attempt.results_by_category:
            continue
        for category, result in attempt.results_by_category.items():
            category_totals.setdefault(category, {'correct': 0, 'total': 0})
            category_totals[category]['correct'] += result['correct']
            category_totals[category]['total'] += result['total']
    mastery = [{
        'category': category,
        'percent': round((vals['correct'] / vals['total']) * 100, 1) if vals['total'] else 0,
        'answered': vals['total'],
    } for category, vals in category_totals.items()]
    mastery.sort(key=lambda x: x['percent'], reverse=True)

    badges = UserBadge.query.filter_by(user_id=current_user.id).order_by(UserBadge.unlocked_at.desc()).all()
    level = _level_for_xp(state.xp)
    next_level_xp = level * 100
    db.session.commit()
    return jsonify({
        'xp': state.xp,
        'level': level,
        'xp_to_next_level': max(next_level_xp - state.xp, 0),
        'current_streak_days': state.current_streak_days,
        'best_streak_days': state.best_streak_days,
        'accuracy_percent': round((state.total_correct_answers / state.total_questions_answered) * 100, 1) if state.total_questions_answered else 0,
        'total_questions_answered': state.total_questions_answered,
        'quizzes_completed': QuizAttempt.query.filter_by(user_id=current_user.id, is_complete=True).count(),
        'recent_scores': [a.score for a in attempts if a.score is not None][:5],
        'daily_goal': _today_question_goal_progress(current_user.id),
        'mastery': mastery[:8],
        'badges': [
            {
                'key': badge.badge_key,
                'title': badge.title,
                'description': badge.description,
                'unlocked_at': badge.unlocked_at.isoformat(),
            }
            for badge in badges
        ],
    }), 200


@app.route('/api/quiz/resume/<int:attempt_id>', methods=['GET'])
@token_required
def resume_quiz(current_user, attempt_id):
    attempt = QuizAttempt.query.filter_by(id=attempt_id, user_id=current_user.id).first()
    if not attempt:
        return jsonify({'message': 'Attempt not found'}), 404
    question_ids = attempt.question_ids or []
    if not question_ids:
        return _json_error("This attempt does not contain any questions.", 400, "attempt_has_no_questions")
    qs = Question.query.filter(Question.id.in_(question_ids)).all()
    id_to_q = {q.id: q for q in qs}
    ordered = [id_to_q[qid] for qid in question_ids if qid in id_to_q]
    assignment = Assignment.query.get(attempt.assignment_id) if attempt.assignment_id else None
    return jsonify({
        'questions': [q.to_dict() for q in ordered],
        'answersSoFar': attempt.answers or {},
        'attempt': attempt.to_dict(),
        'assignment': {
            'id': assignment.id,
            'due_date': assignment.due_date.isoformat() if assignment and assignment.due_date else None,
            'time_limit_minutes': assignment.time_limit_minutes if assignment else None,
        } if assignment else None,
    }), 200


@app.route('/api/roleplays', methods=['GET'])
def get_roleplays():
    roleplays = Roleplay.query.filter_by(is_active=True).order_by(Roleplay.id.asc()).all()
    return jsonify([roleplay.to_dict() for roleplay in roleplays]), 200


@app.route('/api/roleplays/<int:roleplay_id>', methods=['GET'])
def get_roleplay_detail(roleplay_id):
    roleplay = Roleplay.query.filter_by(id=roleplay_id, is_active=True).first()
    if not roleplay:
        return _json_error("Roleplay not found.", 404, "roleplay_not_found")
    return jsonify(roleplay.to_dict()), 200


def _serialize_roleplay_assignment(assignment: RoleplayAssignment, recipient: RoleplayAssignmentRecipient | None = None):
    advisor = User.query.get(assignment.created_by_user_id)
    return {
        "id": assignment.id,
        "title": assignment.title,
        "instructions": assignment.instructions,
        "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
        "assignment_type": assignment.assignment_type,
        "drill_type": assignment.drill_type,
        "drill_label": ROLEPLAY_DRILL_TYPES.get(assignment.drill_type) if assignment.drill_type else None,
        "roleplay_id": assignment.roleplay_id,
        "roleplay": assignment.roleplay.to_dict() if assignment.roleplay else None,
        "advisor": advisor.username if advisor else None,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        "is_completed": bool(recipient and recipient.completed_at),
        "completed_at": recipient.completed_at.isoformat() if recipient and recipient.completed_at else None,
    }


@app.route('/api/admin/roleplay-assignments', methods=['POST'])
@institution_admin_required
def create_roleplay_assignment(current_user):
    data = request.get_json(silent=True) or {}
    roleplay_id = data.get("roleplay_id")
    try:
        roleplay_id = int(roleplay_id)
    except (TypeError, ValueError):
        return _json_error("roleplay_id must be an integer", 400, "invalid_roleplay_id")

    roleplay = Roleplay.query.filter_by(id=roleplay_id, is_active=True).first()
    if not roleplay:
        return _json_error("Roleplay not found.", 404, "roleplay_not_found")

    assignment_type = (data.get("assignment_type") or "full").strip().lower()
    if assignment_type not in ("full", "drill"):
        return _json_error("assignment_type must be 'full' or 'drill'", 400, "invalid_assignment_type")

    drill_type = (data.get("drill_type") or "").strip()
    if assignment_type == "drill":
        if drill_type not in ROLEPLAY_DRILL_TYPES:
            return _json_error("drill_type is invalid", 400, "invalid_drill_type")
    else:
        drill_type = None

    due_date_raw = (data.get("due_date") or "").strip()
    if due_date_raw:
        try:
            due_date = datetime.fromisoformat(due_date_raw)
        except ValueError:
            return _json_error("due_date must be a valid ISO datetime string", 400, "invalid_due_date")
    else:
        due_date = None

    selected_user_ids = data.get("selected_user_ids") or []
    assign_to_all = bool(data.get("assign_to_all", True))
    allowed_ids = {
        u.id for u in User.query.filter_by(
            institution_id=current_user.institution_id,
            is_admin=False,
            is_superadmin=False,
            is_active=True,
        ).all()
    }
    if assign_to_all:
        selected_user_ids = list(allowed_ids)
    else:
        if not isinstance(selected_user_ids, list):
            return _json_error("selected_user_ids must be a list", 400, "invalid_selected_users")
        try:
            selected_user_ids = [int(uid) for uid in selected_user_ids]
        except (TypeError, ValueError):
            return _json_error("selected_user_ids must contain integers", 400, "invalid_selected_users")
        if any(uid not in allowed_ids for uid in selected_user_ids):
            return _json_error("selected_user_ids must belong to active learners in your institution", 400, "invalid_selected_users")

    if len(selected_user_ids) == 0:
        return _json_error("No eligible learners selected.", 400, "no_recipients")

    title = (data.get("title") or "").strip()
    if not title:
        title = f"{roleplay.business_name} - {'Full Roleplay' if assignment_type == 'full' else ROLEPLAY_DRILL_TYPES[drill_type]}"

    assignment = RoleplayAssignment(
        institution_id=current_user.institution_id,
        created_by_user_id=current_user.id,
        roleplay_id=roleplay.id,
        assignment_type=assignment_type,
        drill_type=drill_type,
        title=title,
        instructions=(data.get("instructions") or "").strip() or None,
        due_date=due_date,
    )
    db.session.add(assignment)
    db.session.flush()
    for user_id in selected_user_ids:
        db.session.add(RoleplayAssignmentRecipient(roleplay_assignment_id=assignment.id, user_id=user_id))
    db.session.commit()
    return jsonify({"id": assignment.id, "assigned_count": len(selected_user_ids)}), 201


@app.route('/api/admin/roleplay-assignments', methods=['GET'])
@institution_admin_required
def list_roleplay_assignments(current_user):
    assignments = RoleplayAssignment.query.filter_by(
        institution_id=current_user.institution_id,
        is_active=True,
    ).order_by(RoleplayAssignment.created_at.desc()).all()
    payload = []
    for assignment in assignments:
        recipients = RoleplayAssignmentRecipient.query.filter_by(roleplay_assignment_id=assignment.id).all()
        payload.append({
            **_serialize_roleplay_assignment(assignment),
            "assigned_count": len(recipients),
            "completed_count": len([r for r in recipients if r.completed_at]),
        })
    return jsonify(payload), 200


@app.route('/api/user/roleplay-assignments', methods=['GET'])
@token_required
def list_user_roleplay_assignments(current_user):
    if current_user.is_admin or current_user.is_superadmin:
        return _json_error("Assignments are only available for learner accounts.", 403, "assignments_forbidden")
    recipients = RoleplayAssignmentRecipient.query.filter_by(user_id=current_user.id).all()
    assignment_ids = [row.roleplay_assignment_id for row in recipients]
    if not assignment_ids:
        return jsonify([]), 200
    recipient_by_assignment = {row.roleplay_assignment_id: row for row in recipients}
    assignments = RoleplayAssignment.query.filter(
        RoleplayAssignment.id.in_(assignment_ids),
        RoleplayAssignment.is_active == True
    ).order_by(RoleplayAssignment.due_date.asc().nullslast(), RoleplayAssignment.created_at.desc()).all()
    return jsonify([
        _serialize_roleplay_assignment(item, recipient_by_assignment.get(item.id))
        for item in assignments
    ]), 200


@app.route('/api/roleplay-assignments/<int:assignment_id>', methods=['GET'])
@token_required
def get_roleplay_assignment(current_user, assignment_id):
    assignment = RoleplayAssignment.query.get(assignment_id)
    if not assignment or not assignment.is_active:
        return _json_error("Roleplay assignment not found.", 404, "roleplay_assignment_not_found")

    if current_user.is_superadmin:
        return jsonify(_serialize_roleplay_assignment(assignment)), 200
    if current_user.is_admin:
        if assignment.institution_id != current_user.institution_id:
            return _json_error("Forbidden", 403, "forbidden")
        return jsonify(_serialize_roleplay_assignment(assignment)), 200

    recipient = RoleplayAssignmentRecipient.query.filter_by(
        roleplay_assignment_id=assignment.id,
        user_id=current_user.id
    ).first()
    if not recipient:
        return _json_error("Forbidden", 403, "forbidden")
    return jsonify(_serialize_roleplay_assignment(assignment, recipient)), 200


@app.route('/api/user/roleplay-assignments/<int:assignment_id>/complete', methods=['POST'])
@token_required
def complete_roleplay_assignment(current_user, assignment_id):
    if current_user.is_admin or current_user.is_superadmin:
        return _json_error("Assignments are only available for learner accounts.", 403, "assignments_forbidden")
    recipient = RoleplayAssignmentRecipient.query.filter_by(
        roleplay_assignment_id=assignment_id,
        user_id=current_user.id
    ).first()
    if not recipient:
        return _json_error("Roleplay assignment not found.", 404, "roleplay_assignment_not_found")
    if not recipient.completed_at:
        recipient.completed_at = datetime.utcnow()
        db.session.commit()
    return jsonify({"ok": True, "completed_at": recipient.completed_at.isoformat()}), 200


@app.route('/api/questions')
def get_questions():
    query = db.select(Question)
    categories = request.args.get('categories')
    difficulties = request.args.get('difficulties')
    if categories:
        query = query.where(Question.category.in_(categories.split(',')))
    if difficulties:
        query = query.where(Question.difficulty.in_(difficulties.split(',')))
    questions = db.session.execute(query).scalars().all()
    return jsonify([q.to_dict() for q in questions])


@app.route('/api/quiz-config')
def get_quiz_config():
    categories = db.session.query(Question.category).distinct().all()
    difficulties = db.session.query(Question.difficulty).distinct().all()
    return jsonify({'categories': [c[0] for c in categories], 'difficulties': [d[0] for d in difficulties]})


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'time': datetime.utcnow().isoformat(),
    }), 200


@app.route('/health', methods=['GET'])
def simple_health():
    return jsonify({'status': 'ok'}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
