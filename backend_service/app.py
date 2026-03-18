import os
from datetime import datetime, timedelta
import jwt
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv
import random
from time import time
from collections import defaultdict
from sqlalchemy.orm.attributes import flag_modified

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
database_url = os.environ["SQLALCHEMY_DATABASE_URI"]
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

if database_url.startswith("postgres") and "sslmode=" not in database_url:
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "connect_args": {"sslmode": "require"}
    }

_frontend_origin_raw = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
FRONTEND_ORIGINS = [o.strip() for o in _frontend_origin_raw.split(",") if o.strip()]

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
_login_attempts = defaultdict(list)


def _login_rate_limited(ip: str) -> bool:
    now = time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_RATE_WINDOW]
    if len(_login_attempts[ip]) >= LOGIN_RATE_MAX:
        return True
    _login_attempts[ip].append(now)
    return False


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


class QuizAttempt(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    test_name = db.Column(db.String(128), nullable=False)
    score = db.Column(db.Integer, nullable=True)
    total_questions = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    question_ids = db.Column(db.JSON, nullable=False)
    answers = db.Column(db.JSON, default=dict, nullable=False)
    is_complete = db.Column(db.Boolean, default=False, nullable=False)
    results_by_category = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'test_name': self.test_name,
            'score': self.score,
            'total_questions': self.total_questions,
            'timestamp': self.timestamp.isoformat(),
            'user_id': self.user_id,
            'question_ids': self.question_ids,
            'answers': self.answers,
            'is_complete': self.is_complete,
            'results_by_category': self.results_by_category
        }


def generate_registration_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(10):
        code = "".join(random.choice(alphabet) for _ in range(6))
        if Institution.query.filter_by(registration_code=code).first() is None:
            return code
    raise RuntimeError("Could not generate unique registration code")


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
        'institution_id': user.institution_id,
        'exp': datetime.utcnow() + timedelta(hours=24)
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
                options={"require": ["exp"]},
                leeway=30,
            )
            user_id = payload.get("user_id")
            if not user_id:
                return jsonify({"message": "Invalid token payload"}), 401

            current_user = User.query.get(user_id)
            if not current_user:
                return jsonify({"message": "User not found"}), 401

        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Token invalid"}), 401

        return f(current_user, *args, **kwargs)

    return decorated


def institution_admin_required(f):
    @wraps(f)
    def wrapper(current_user, *args, **kwargs):
        if not current_user.is_admin or current_user.is_superadmin:
            return jsonify({'message': 'Institution admin privileges required'}), 403
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
    data = request.get_json() or {}
    institution_code = (data.get('institutionCode') or '').strip().upper()
    if not institution_code:
        return jsonify({'message': 'Institution code is required'}), 400

    institution = Institution.query.filter_by(registration_code=institution_code).first()
    if not institution:
        return jsonify({'message': 'Institution code not found'}), 404
    if not institution.is_active:
        return jsonify({'message': 'Institution is inactive. Contact your counselor.'}), 403

    return jsonify({
        'valid': True,
        'institution_id': institution.id,
        'institution_name': institution.name,
    }), 200


@app.route('/api/bootstrap/status', methods=['GET'])
def bootstrap_status():
    return jsonify({
        'needs_superadmin_bootstrap': User.query.filter_by(is_superadmin=True).count() == 0
    }), 200


@app.route('/api/bootstrap/superadmin', methods=['POST'])
def bootstrap_superadmin():
    if User.query.filter_by(is_superadmin=True).count() > 0:
        return jsonify({'message': 'Superadmin already exists'}), 409

    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    bootstrap_token = data.get('bootstrapToken')
    expected_token = os.environ.get('SUPERADMIN_BOOTSTRAP_TOKEN')

    if expected_token and bootstrap_token != expected_token:
        return jsonify({'message': 'Invalid bootstrap token'}), 403

    if not username or not password:
        return jsonify({'message': 'Username and password are required'}), 400
    if len(username) < 3:
        return jsonify({'message': 'Username must be at least 3 characters'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'message': 'Username already exists'}), 400

    user = User(username=username, is_superadmin=True, is_admin=True, institution_id=None)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({
        'id': user.id,
        'username': user.username,
        'role': role_for_user(user),
    }), 201


@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    institution_code = (data.get('institutionCode') or '').strip().upper()

    if not username or not password or not institution_code:
        return jsonify({'message': 'Username, password, and institution code are required'}), 400
    if len(username) < 3:
        return jsonify({'message': 'Username must be at least 3 characters'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'message': 'User already exists'}), 400

    institution = Institution.query.filter_by(registration_code=institution_code, is_active=True).first()
    if not institution:
        return jsonify({'message': 'Invalid institution code. Ask your counselor for a valid code.'}), 400

    user = User(username=username, institution_id=institution.id, is_admin=False, is_superadmin=False)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        'id': user.id,
        'name': user.username,
        'institution_name': institution.name,
        'institution_id': institution.id,
        'role': role_for_user(user)
    }), 201


@app.route('/api/auth/credentials', methods=['POST'])
def verify_and_get_token():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()
    if _login_rate_limited(ip):
        return jsonify({'message': 'Too many login attempts, please try again later'}), 429

    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({"message": "Username and password required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid username or password"}), 401

    if user.institution_id is not None:
        institution = Institution.query.get(user.institution_id)
        if not institution or not institution.is_active:
            return jsonify({"message": "Your institution is currently inactive."}), 403

    token = issue_token(user)

    return jsonify({
        'id': user.id,
        'name': user.username,
        'token': token,
        'is_admin': user.is_admin,
        'is_superadmin': user.is_superadmin,
        'is_super_admin': user.is_superadmin,
        'role': role_for_user(user),
        'institution_id': user.institution_id,
        'institution_name': user.institution.name if user.institution else None,
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
        'institution_id': current_user.institution_id,
        'institution_name': current_user.institution.name if current_user.institution else None,
    }), 200


@app.route('/api/superadmin/summary', methods=['GET'])
@superadmin_required
def superadmin_summary(current_user):
    total_institutions = Institution.query.count()
    total_users = User.query.filter_by(is_superadmin=False).count()
    total_admins = User.query.filter_by(is_admin=True, is_superadmin=False).count()
    total_quizzes = QuizAttempt.query.filter_by(is_complete=True).count()
    return jsonify({
        'total_institutions': total_institutions,
        'total_users': total_users,
        'total_admins': total_admins,
        'total_quizzes_taken': total_quizzes,
    }), 200


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
        'users': [{'id': u.id, 'username': u.username, 'is_admin': u.is_admin} for u in users],
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
    return jsonify({'id': user.id, 'username': user.username, 'is_admin': user.is_admin}), 200


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

    random.shuffle(selected)

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
    db.session.commit()

    return jsonify({'message': 'Quiz submitted', 'attempt': attempt.to_dict()}), 200


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
    new_answers = attempt.answers.copy()
    new_answers[str(question_id)] = answer
    attempt.answers = new_answers
    db.session.commit()
    return jsonify({'message': 'Answer saved'}), 200


@app.route('/api/user/attempts', methods=['GET'])
@token_required
def get_user_attempts(current_user):
    attempts = QuizAttempt.query.filter_by(user_id=current_user.id).order_by(QuizAttempt.timestamp.desc()).all()
    return jsonify([a.to_dict() for a in attempts])


@app.route('/api/quiz/resume/<int:attempt_id>', methods=['GET'])
@token_required
def resume_quiz(current_user, attempt_id):
    attempt = QuizAttempt.query.filter_by(id=attempt_id, user_id=current_user.id).first()
    if not attempt:
        return jsonify({'message': 'Attempt not found'}), 404
    qs = Question.query.filter(Question.id.in_(attempt.question_ids)).all()
    id_to_q = {q.id: q for q in qs}
    ordered = [id_to_q[qid] for qid in attempt.question_ids if qid in id_to_q]
    return jsonify({'questions': [q.to_dict() for q in ordered], 'answersSoFar': attempt.answers}), 200


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
        'multi_tenant_enabled': True,
        'needs_superadmin_bootstrap': User.query.filter_by(is_superadmin=True).count() == 0,
    }), 200


with app.app_context():
    try:
        db.create_all()
        print("✅ Database tables initialized successfully")
    except Exception as e:
        print(f"⚠️ Database initialization warning: {e}")


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
