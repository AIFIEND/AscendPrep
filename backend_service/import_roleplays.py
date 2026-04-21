import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend_service.app import app, db, Roleplay


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    seed_path = repo_root / "seed_roleplays.json"

    if not seed_path.exists():
        raise FileNotFoundError(f"Missing seed file: {seed_path}")

    with seed_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, list):
        raise ValueError("seed_roleplays.json must contain a top-level JSON array")

    added = 0
    skipped = 0

    with app.app_context():
        for item in payload:
            business_name = (item.get("business_name") or "").strip()
            event = (item.get("event") or "").strip()

            existing = Roleplay.query.filter_by(business_name=business_name, event=event).first()
            if existing:
                skipped += 1
                continue

            roleplay = Roleplay(
                event=event,
                industry=item.get("industry"),
                business_name=business_name,
                student_role=item.get("student_role"),
                judge_role=item.get("judge_role"),
                scenario_background=item.get("scenario_background"),
                objective=item.get("objective"),
                task_type=item.get("task_type"),
                difficulty=item.get("difficulty"),
                training_json=item.get("training"),
                is_active=bool(item.get("is_active", True)),
            )
            db.session.add(roleplay)
            added += 1

        db.session.commit()

    print(f"Added {added} roleplays; skipped {skipped} duplicates.")


if __name__ == "__main__":
    main()
