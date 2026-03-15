# DECA Practice Web App

## Overview

This repository contains a full-stack quiz application designed to help DECA students practice for multiple-choice exams.  
The application supports targeted practice quizzes, instant feedback with explanations, answer elimination, question flagging for later review, and detailed progress tracking.  
An admin dashboard provides platform-wide analytics.  

- **Frontend:** Next.js (App Router) with TypeScript and NextAuth for authentication  
- **Backend:** Flask with SQLAlchemy, SQLite/Postgres (configurable), CORS, and rate-limiting  
- **Auth flow:** Credential login backed by Flask; NextAuth sessions expose `session.user.backendToken` and `is_admin`  

---

## Folder structure

.
├── app/                   # Next.js frontend (App Router)
│   ├── api/               # Next.js API routes (proxying to Flask)
│   ├── exams/             # Exam listing UI
│   ├── quiz/              # Quiz start/resume/answer
│   ├── progress/          # User progress tracking
│   ├── tests-taken/       # Completed test review
│   ├── admin/             # Admin dashboard
│   └── ... 
├── backend_service/       # Flask backend
│   ├── app.py             # Entry point, CORS, rate-limiting
│   ├── models.py          # SQLAlchemy models
│   └── routes/            # API endpoints
├── components/            # React UI components (e.g. QuizClient.tsx)
├── context/               # React contexts (AuthContext)
├── lib/                   # Shared helpers (api.ts with apiFetch/getJson/postJson)
├── public/                # Static assets
└── .env.example           # Example environment variables

---

## Environment variables

### Frontend (.env.local)

- NEXT_PUBLIC_API_URL – Base URL for Flask backend (browser)  
- API_URL – Base URL for Flask backend (server-side)  
- NEXTAUTH_URL – Base URL of Next.js app  
- NEXTAUTH_SECRET – Secret for NextAuth  

### Backend (.env)

- SECRET_KEY – Flask secret  
- SQLALCHEMY_DATABASE_URI – Database connection string  
- ADMIN_PASSCODE – Passcode to access admin dashboard  
- FRONTEND_ORIGIN – Comma-separated list of allowed frontend origins for CORS  
- FLASK_ENV – Development or production  

---

## Local development (Quick Start)

### Prereqs
- Node.js 18+  
- Python 3.10+  
- pipenv or venv for Python  

### Backend
cd backend_service
python -m venv venv
source venv/bin/activate   # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
export FLASK_ENV=development
flask run --port 5000

### Frontend
cd frontend_service
npm install
npm run dev
# App runs on http://localhost:3000

---

## Auth flow

- Users register with credentials → stored in backend (Flask)  
- NextAuth handles sessions in Next.js  
- On login, Flask returns a JWT token → exposed as `session.user.backendToken`  
- Session object includes `is_admin` when admin passcode was used  

---

## Admin access

- Navigate to `/admin` → enter the `ADMIN_PASSCODE`  
- A cookie `admin_access_token` is set  
- Admin dashboard is available at `/admin/dashboard`  

---

## Security & stability

- **CORS:** Allowed origins pulled from `FRONTEND_ORIGIN` env, supports multiple origins  
- **Rate limiting:** In-memory throttling protects login/admin passcode attempts  
- **Secrets in env:** No hardcoded IPs or URLs; all backend calls use env variables  

---

## Deployment

### Backend
gunicorn -b 0.0.0.0:5000 app:app

### Frontend
npm run build
npm run start

- Ensure all env variables are set in production.  
- Use HTTPS with a reverse proxy (e.g. nginx).  

---
