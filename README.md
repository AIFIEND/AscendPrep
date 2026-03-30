# Practice Readiness Platform (DECA + Business Programs)

A multi-tenant quiz and assignment platform for:
- DECA chapters
- business departments
- business classes
- entrepreneurship / marketing / finance programs

It supports institution-managed onboarding and individual learner access while keeping role-based administration and analytics.

## Core capabilities
- **Learner accounts** via institution/program code or individual access code
- **Institution admins** who manage learners, assignments, and intervention
- **Superadmins** who manage institutions, admin roles, and access code inventory
- **Quiz workflows** (start, resume, answer-save, submit, results)
- **Weakness targeting** based on category history (`results_by_category`)
- **Gamification** (XP, streaks, badges, levels, leaderboard)
- **Institution analytics** and assignment tracking

## Tech stack
- **Frontend:** Next.js App Router + TypeScript + NextAuth
- **Backend:** Flask + SQLAlchemy + JWT + Bcrypt
- **Schema migration:** SQL migration runner (`backend_service/migrate.py`) with tracked `schema_migrations`

## Repository structure
- `frontend_service/` – Next.js app
- `backend_service/` – Flask API
- `backend_service/migrations/` – versioned SQL migrations

## Environment variables
Use `.env.example` as baseline.

### Backend
- `SECRET_KEY` (required)
- `SQLALCHEMY_DATABASE_URI` (required)
- `FRONTEND_ORIGIN`
- `FLASK_ENV`
- `SUPERADMIN_BOOTSTRAP_TOKEN` (recommended for production setup protection)

### Frontend
- `NEXT_PUBLIC_API_URL`
- `API_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

## Local setup

### 1) Backend
```bash
cd backend_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python init_db.py   # runs tracked SQL migrations
flask run --port 5000
```

### 2) Frontend
```bash
cd frontend_service
npm install
npm run dev
```

## Deployment path (fresh + existing)

### Fresh deployment
1. Set all required env vars.
2. Run backend migrations:
   ```bash
   cd backend_service
   python init_db.py
   ```
3. Start backend (`gunicorn -b 0.0.0.0:5000 app:app`).
4. Build/start frontend.
5. Open `/setup` and create first superadmin.
6. Create first institution/program from superadmin UI.
7. Share institution registration code with learners.

### Existing deployment update
1. Deploy new code.
2. Run migrations (`python init_db.py`).
3. Restart services.
4. Verify `/api/bootstrap/status` and `/api/health`.

## Registration and auth flows

### Institution/program flow
1. Learner enters institution code.
2. Backend validates active institution and returns institution name.
3. Registration creates institution-linked account (`account_type = institution`).

### Individual flow
1. Learner enters individual access code.
2. Backend validates status, expiry, and remaining uses.
3. Registration creates account (`account_type = individual`) and redeems code atomically.

### Session/auth
- Login: `POST /api/auth/credentials`
- Session restore: `GET /api/session/me`
- Inactive account and inactive institution checks are enforced in login/session token-protected flows.

## Admin tools overview
- Assignment creation: `POST /api/admin/assignments`
- Assignment tracking: `GET /api/admin/assignments`
- Assignment completion CSV export: `GET /api/admin/reports/assignment-completion.csv`
- Learner activation/deactivation via institution admin and superadmin endpoints

## Analytics + weakness targeting
- Learner analytics: `GET /api/user/analytics?period=all|7d|30d`
- Focus areas: `GET /api/user/focus-areas`
- Targeted quiz: `POST /api/quiz/start-targeted`
- Institution summary: `GET /api/admin/institution/summary`
- Institution leaderboard: `GET /api/leaderboard/institution`

## Manual QA checklist

### Setup / onboarding
- [ ] `/setup` shows bootstrap-needed state on fresh DB
- [ ] Superadmin bootstrap creates first superadmin
- [ ] Superadmin can create institution and get registration code
- [ ] Institution code validation returns institution/program name
- [ ] Individual access code validation returns success for valid code

### Auth/session
- [ ] Institution registration succeeds and login works
- [ ] Individual registration succeeds and login works
- [ ] `/api/session/me` returns role + account metadata
- [ ] Deactivated user is rejected on login/session use
- [ ] Inactive institution learner is rejected on login/session use

### Learner product
- [ ] Focus Areas module appears after completing quizzes
- [ ] Targeted quiz starts and prioritizes weak categories
- [ ] Dashboard shows XP/level/streak/badges/readiness signals

### Institution admin
- [ ] Assignment can be created and assigned to all learners
- [ ] Assignment list shows completion counts and average score
- [ ] CSV export downloads with assignment completion rows
- [ ] User status management works (activate/deactivate)

### Superadmin
- [ ] Superadmin summary loads and institution management works

