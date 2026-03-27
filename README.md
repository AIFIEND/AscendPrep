# DECA Practice Web App

A multi-tenant DECA quiz platform with role-based access:
- **Students** register with an institution registration code and take practice quizzes.
- **Institution admins** view data for their own institution and can deactivate/reactivate student accounts in that institution.
- **Superadmins** manage institutions, registration codes, institution admins, and user activation status.

## Tech stack
- **Frontend:** Next.js (App Router), TypeScript, NextAuth credentials provider
- **Backend:** Flask, SQLAlchemy, JWT auth, Flask-CORS, Flask-Bcrypt

## Repository structure
- `frontend_service/` – Next.js app
- `backend_service/` – Flask API
- `.env.example` – environment template
- `docker-compose.yml` – local container orchestration

## Environment variables
Use `.env.example` as the source of truth.

### Backend (Flask)
- `SECRET_KEY` (required)
- `SQLALCHEMY_DATABASE_URI` (required)
- `FRONTEND_ORIGIN` (comma-separated; wildcard patterns supported, e.g. `https://your-app-*.vercel.app`)
- `FLASK_ENV`
- `SUPERADMIN_BOOTSTRAP_TOKEN` (strongly recommended in production)

### Frontend (Next.js)
- `NEXT_PUBLIC_API_BASE` (default `/backend`; keeps browser calls same-origin)
- `API_URL` (backend origin for Next.js server/rewrite target)
- `NEXT_PUBLIC_API_URL` (optional fallback for server-side calls)
- `NEXTAUTH_URL` (required for production auth/session correctness)
- `NEXTAUTH_SECRET` (required)

## Local development quick start

### Backend
```bash
cd backend_service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
flask run --port 5000
```

### Frontend
```bash
cd frontend_service
npm install
npm run dev
```

## First-time setup (one time per deployment)
1. Deploy backend + frontend with production environment variables.
2. Open `https://<your-app>/setup`.
3. Create the first superadmin account.
4. Log in as that superadmin.
5. Open **Institutions** and create the first institution.
6. Copy and share that institution registration code with the school/team.

If a superadmin already exists, `/setup` shows **Setup already completed** and links to login.

## Production notes
- Use a real **Postgres** database (`SQLALCHEMY_DATABASE_URI`), not local SQLite.
- Set strong random values for `SECRET_KEY` and `NEXTAUTH_SECRET`.
- Keep browser API calls same-origin through the Next.js `/backend/*` rewrite (default via `NEXT_PUBLIC_API_BASE=/backend`).
- Set `API_URL` on Vercel to your Render backend origin (for rewrite destination / server-side calls).
- Set CORS `FRONTEND_ORIGIN` on Render to include your Vercel production domain and preview pattern(s).
- Set correct public URL for `NEXTAUTH_URL`.
- Set `SUPERADMIN_BOOTSTRAP_TOKEN` to protect first superadmin creation.
- User management uses **soft deactivation** (no hard-delete), so quiz history is retained.
- Run behind HTTPS + reverse proxy (for example, Nginx, Caddy, or your cloud load balancer).

## Deployment commands

### Backend
```bash
cd backend_service
gunicorn -b 0.0.0.0:5000 app:app
```

### Frontend
```bash
cd frontend_service
npm run build
npm run start
```
