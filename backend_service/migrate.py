from pathlib import Path
from sqlalchemy import text
from app import app, db

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _ensure_migration_table():
    db.session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    db.session.commit()


def _applied_versions() -> set[str]:
    rows = db.session.execute(text("SELECT version FROM schema_migrations")).fetchall()
    return {row[0] for row in rows}


def _apply_sql_file(path: Path):
    sql = path.read_text()
    if not sql.strip():
        return
    try:
        db.session.execute(text(sql))
        db.session.execute(text("INSERT INTO schema_migrations (version) VALUES (:v)"), {"v": path.name})
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


def run_migrations():
    with app.app_context():
        # Keep legacy behavior for first deploys, but only in controlled migration flow (not app startup).
        db.create_all()
        _ensure_migration_table()
        applied = _applied_versions()

        migration_files = sorted([p for p in MIGRATIONS_DIR.glob("*.sql")])
        for migration in migration_files:
            if migration.name in applied:
                continue
            print(f"➡️ Applying migration: {migration.name}")
            _apply_sql_file(migration)

        print("✅ Migrations complete")


if __name__ == "__main__":
    run_migrations()
