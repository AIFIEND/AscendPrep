import json
from pathlib import Path

from app import app, db, Roleplay


def import_roleplays() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    seed_path = repo_root / "seed_roleplays.json"

    with seed_path.open("r", encoding="utf-8") as f:
        records = json.load(f)

    added = 0
    skipped = 0

    with app.app_context():
        existing_pairs = {
            (roleplay.business_name, roleplay.event)
            for roleplay in Roleplay.query.with_entities(Roleplay.business_name, Roleplay.event).all()
        }

        for item in records:
            key = (item.get("business_name"), item.get("event"))
            if key in existing_pairs:
                skipped += 1
                continue

            roleplay = Roleplay(
                event=item["event"],
                industry=item["industry"],
                business_name=item["business_name"],
                student_role=item["student_role"],
                judge_role=item["judge_role"],
                scenario_background=item["scenario_background"],
                objective=item["objective"],
                task_type=item["task_type"],
                difficulty=item["difficulty"],
                training_json=item["training"],
                is_active=item.get("is_active", True),
            )
            db.session.add(roleplay)
            existing_pairs.add(key)
            added += 1

        db.session.commit()

    print(f"Added {added} roleplays; skipped {skipped} duplicates")


if __name__ == "__main__":
    import_roleplays()
