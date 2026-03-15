# backend/app.py
# UPDATED: Added random shuffling of questions when a new quiz is started.

import os
from datetime import datetime, timedelta
import jwt
from functools import wraps
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv
import random # NEW: Import the random module for shuffling
from time import time
from collections import defaultdict


load_dotenv() 

basedir = os.path.abspath(os.path.dirname(__file__))

# App & Database Configuration
app = Flask(__name__)

# Require secrets from environment (no defaults)
app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
database_url = os.environ["SQLALCHEMY_DATABASE_URI"]
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

if database_url.startswith("postgres") and "sslmode=" not in database_url:
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "connect_args": {"sslmode": "require"}
    }

# Also require this from env; do NOT print it
ADMIN_PASSCODE = os.environ["ADMIN_PASSCODE"]

# Support one or many origins in FRONTEND_ORIGIN, e.g.
# FRONTEND_ORIGIN=http://localhost:3000,http://192.168.0.65:3000
_frontend_origin_raw = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
FRONTEND_ORIGINS = [o.strip() for o in _frontend_origin_raw.split(",") if o.strip()]

CORS(
    app,
    origins=FRONTEND_ORIGINS,
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    supports_credentials=True,
)


db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

# --- Simple in-memory rate limiter for admin passcode ---
# Allow 5 attempts per 5 minutes per IP (dev-safe; swap for Redis in prod).
ADMIN_RATE_WINDOW = 5 * 60  # seconds
ADMIN_RATE_MAX = 5
_admin_attempts = defaultdict(list)  # ip -> [timestamps]

def _admin_rate_limited(ip: str) -> bool:
    now = time()
    # Drop stale attempts outside the window
    _admin_attempts[ip] = [t for t in _admin_attempts[ip] if now - t < ADMIN_RATE_WINDOW]
    if len(_admin_attempts[ip]) >= ADMIN_RATE_MAX:
        return True
    _admin_attempts[ip].append(now)
    return False

# --- Simple in-memory rate limiter for LOGIN ---
# Allow 10 attempts per 5 minutes per IP (dev-safe; use Redis in prod).
LOGIN_RATE_WINDOW = 5 * 60  # seconds
LOGIN_RATE_MAX = 10
_login_attempts = defaultdict(list)  # ip -> [timestamps]

def _login_rate_limited(ip: str) -> bool:
    now = time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_RATE_WINDOW]
    if len(_login_attempts[ip]) >= LOGIN_RATE_MAX:
        return True
    _login_attempts[ip].append(now)
    return False


def is_production() -> bool:
    return os.environ.get("FLASK_ENV") == "production" or os.environ.get("ENV") == "production"


# --- Database Model Definitions ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    attempts = db.relationship('QuizAttempt', backref='user', lazy=True)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)

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
            'id': self.id, 'question': self.question,
            'options': [
                {'id': 'A', 'text': self.optionA}, {'id': 'B', 'text': self.optionB},
                {'id': 'C', 'text': self.optionC}, {'id': 'D', 'text': self.optionD},
            ],
            'correctAnswer': self.correctAnswer, 'explanation': self.explanation,
            'category': self.category, 'difficulty': self.difficulty,
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

# --- Decorators ---

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Read token from Authorization: Bearer <token>
        auth = request.headers.get("Authorization", "")
        token = None
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1].strip()

        if not token:
            return jsonify({"message": "Authorization token is missing"}), 401

        try:
            # Allow small clock skew (30s) to avoid edge cases around expiry
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

def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # First, require a valid user token
        auth = request.headers.get("Authorization", "")
        token = None
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1].strip()
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
            is_admin_flag = payload.get("is_admin", False)
            current_user = User.query.get(user_id)
            if not current_user:
                return jsonify({"message": "User not found"}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Token invalid"}), 401

        # If the user has admin role, allow immediately
        if getattr(current_user, "is_admin", False) or is_admin_flag:
            return f(current_user, *args, **kwargs)

        # Otherwise, check the short-lived admin cookie from the passcode gate
        admin_access_token = request.cookies.get("admin_access_token")
        if not admin_access_token:
            return jsonify({"message": "Admin privileges required"}), 403

        try:
            jwt.decode(
                admin_access_token,
                app.config["SECRET_KEY"],
                algorithms=["HS256"],
                options={"require": ["exp"]},
                leeway=30,
            )
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Admin access expired"}), 403
        except jwt.InvalidTokenError:
            return jsonify({"message": "Admin access token invalid"}), 403

        return f(current_user, *args, **kwargs)

    return wrapper

# --- API Endpoints ---

# --- Minimal security headers for every response ---
@app.after_request
def set_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Lock down some powerful features by default
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return resp


@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    # Hardened validation (INSIDE the function)
    if not username or not password:
        return jsonify({'message': 'Username and password required'}), 400
    if len(username) < 3:
        return jsonify({'message': 'Username must be at least 3 characters'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'message': 'User already exists'}), 400

    user = User(username=username)
    user.set_password(password)

    # First user becomes admin
    if User.query.count() == 0:
        user.is_admin = True

    db.session.add(user)
    db.session.commit()

    token = jwt.encode(
        {
            'user_id': user.id,
            'is_admin': user.is_admin,
            'exp': datetime.utcnow() + timedelta(hours=24)
        },
        app.config['SECRET_KEY'],
        algorithm="HS256"
    )

    return jsonify({
        'id': user.id,
        'name': user.username,
        'token': token,
        'is_admin': user.is_admin
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

    token = jwt.encode({
        'user_id': user.id,
        'is_admin': user.is_admin,
        'exp': datetime.utcnow() + timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm="HS256")
    
    return jsonify({
        'id': user.id,
        'name': user.username,
        'token': token,
        'is_admin': user.is_admin
    }), 200


# UPDATED: This endpoint now shuffles the questions before creating the attempt.
@app.route('/api/quiz/start', methods=['POST'])
@token_required
def start_quiz(current_user):
    data = request.get_json() or {}
    cats = data.get('categories', [])
    diffs = data.get('difficulties', [])
    q = Question.query
    if cats: q = q.filter(Question.category.in_(cats))
    if diffs: q = q.filter(Question.difficulty.in_(diffs))
    selected = q.all()

    requested_count = data.get('numQuestions')
    if requested_count is not None:
        try:
            requested_count = max(1, int(requested_count))
        except (TypeError, ValueError):
            return jsonify({'message': 'numQuestions must be a positive integer'}), 400

    # NEW: Shuffle the selected questions randomly.
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

    # Calculate score server-side based on the results
    total_correct = sum(r['correct'] for r in results.values())
    # You can calculate percentage based on the total questions in the attempt
    # or just the questions processed. Using attempt.total_questions is safer.
    if attempt.total_questions > 0:
        calculated_score = int((total_correct / attempt.total_questions) * 100)
    else:
        calculated_score = 0

    attempt.score = calculated_score
    attempt.is_complete = True
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

    return jsonify({
        'attempt': attempt.to_dict(),
        'questions': ordered_questions,
    }), 200

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

    return jsonify({
        'progress_data': progress_data,
        'overall_performance': overall_performance
    }), 200


# --- ADMIN ENDPOINTS ---

@app.route('/api/admin/verify-passcode', methods=['POST'])
def verify_admin_passcode():
    # Rate limit by client IP
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()
    if _admin_rate_limited(ip):
        return jsonify({'message': 'Too many attempts, please try again later'}), 429

    data = request.get_json() or {}
    passcode = data.get('passcode')

    if not passcode or passcode != ADMIN_PASSCODE:
        return jsonify({'message': 'Invalid passcode'}), 401

    admin_access_token = jwt.encode({
        'admin_access': True,
        'exp': datetime.utcnow() + timedelta(hours=1)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    resp = make_response(jsonify({'message': 'Passcode verified'}))
    resp.set_cookie(
        'admin_access_token',
        value=admin_access_token,
        httponly=True,
        secure=is_production(),  # True in prod (HTTPS), False in dev
        samesite='None' if is_production() else 'Lax',
        max_age=3600,
        path="/",
    )
    return resp

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_all_users(current_user):
    users = User.query.all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'is_admin': u.is_admin
    } for u in users]), 200

@app.route('/api/admin/analytics', methods=['GET'])
@admin_required
def get_admin_analytics(current_user):
    all_attempts = QuizAttempt.query.filter_by(is_complete=True).all()
    
    total_quizzes = len(all_attempts)
    avg_score = db.session.query(db.func.avg(QuizAttempt.score)).filter(QuizAttempt.is_complete==True).scalar()

    performance_by_category = {}
    for attempt in all_attempts:
        if attempt.results_by_category:
            for category, result in attempt.results_by_category.items():
                if category not in performance_by_category:
                    performance_by_category[category] = {'correct': 0, 'total': 0}
                performance_by_category[category]['correct'] += result['correct']
                performance_by_category[category]['total'] += result['total']
    
    users = User.query.all()
    user_analytics = []
    for user in users:
        user_attempts = [a for a in all_attempts if a.user_id == user.id]
        if user_attempts:
            user_avg_score = sum(a.score for a in user_attempts if a.score is not None) / len(user_attempts)
            user_analytics.append({
                'id': user.id,
                'username': user.username,
                'quiz_count': len(user_attempts),
                'average_score': user_avg_score
            })

    return jsonify({
        'total_quizzes_taken': total_quizzes,
        'average_score_all_users': avg_score,
        'performance_by_category': performance_by_category,
        'user_analytics': user_analytics
    }), 200

# --- Other endpoints ---
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
    attempts = (
        QuizAttempt.query
        .filter_by(user_id=current_user.id)
        .order_by(QuizAttempt.timestamp.desc())
        .all()
    )
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
    return jsonify({
        'questions': [q.to_dict() for q in ordered],
        'answersSoFar': attempt.answers
    }), 200

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
    return jsonify({
        'categories': [c[0] for c in categories],
        'difficulties': [d[0] for d in difficulties]
    })

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'time': datetime.utcnow().isoformat()
    }), 200


# Create database tables if they don't exist
with app.app_context():
    try:
        db.create_all()
        print("✅ Database tables initialized successfully")
    except Exception as e:
        print(f"⚠️ Database initialization warning: {e}")

if __name__ == '__main__':
    # Get port from environment variable or default to 5000
    port = int(os.environ.get('PORT', 5000))
    # Bind to all interfaces in Docker
    app.run(host='0.0.0.0', port=port, debug=False)
