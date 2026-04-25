import argparse
import json
from pathlib import Path

from app import Roleplay, app, db


def _resolve_seed_path(seed_file: str | None) -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    if seed_file:
        candidate = Path(seed_file)
        return candidate if candidate.is_absolute() else (repo_root / candidate)

    repaired = repo_root / "seed_roleplays_repaired_training.json"
    if repaired.exists():
        return repaired

    return repo_root / "seed_roleplays.json"


def import_roleplays(seed_file: str | None = None) -> None:
    seed_path = _resolve_seed_path(seed_file)

    if not seed_path.exists():
        raise FileNotFoundError(f"Seed file not found: {seed_path}")

    with seed_path.open("r", encoding="utf-8") as f:
        records = json.load(f)

    added = 0
    skipped = 0
    updated_training = 0

    with app.app_context():
        existing_roleplays = {
            (roleplay.business_name, roleplay.event): roleplay
            for roleplay in Roleplay.query.all()
        }

        for item in records:
            key = (item.get("business_name"), item.get("event"))
            training_payload = item.get("training") or {}

            if key in existing_roleplays:
                roleplay = existing_roleplays[key]
                roleplay.training_json = training_payload
                updated_training += 1
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
                training_json=training_payload,
                is_active=item.get("is_active", True),
            )
            db.session.add(roleplay)
            existing_roleplays[key] = roleplay
            added += 1

        db.session.commit()

    print(
        f"Processed {len(records)} roleplays from {seed_path.name}: "
        f"added {added}, skipped duplicates {skipped}, training updated {updated_training}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import roleplays and repaired training JSON into the database.")
    parser.add_argument(
        "--seed-file",
        help="Optional path (absolute or repo-relative) to a roleplay seed JSON file.",
    )
    args = parser.parse_args()
    import_roleplays(args.seed_file)
