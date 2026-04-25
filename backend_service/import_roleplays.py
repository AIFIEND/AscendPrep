import argparse
import json
from pathlib import Path

from app import Roleplay, app, db

REQUIRED_FIELDS = ("business_name", "event", "objective", "task_type", "difficulty", "training")


def _resolve_seed_path(seed_file: str | None) -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    if seed_file:
        candidate = Path(seed_file)
        return candidate if candidate.is_absolute() else (repo_root / candidate)

    return repo_root / "seed_roleplays.json"


def _validate_records(payload: object, seed_path: Path) -> list[dict]:
    if not isinstance(payload, list):
        raise ValueError(f"Invalid seed JSON in {seed_path}: root must be an array of roleplays.")

    for index, record in enumerate(payload, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"Invalid roleplay at index {index}: each item must be an object.")

        missing = [field for field in REQUIRED_FIELDS if field not in record]
        if missing:
            raise ValueError(
                f"Invalid roleplay at index {index}: missing required fields {missing}."
            )

        training = record.get("training")
        if not isinstance(training, dict):
            raise ValueError(f"Invalid roleplay at index {index}: training must be an object.")

        mcqs = training.get("mcq_training_questions")
        if mcqs is None:
            continue

        if not isinstance(mcqs, list):
            raise ValueError(
                f"Invalid roleplay at index {index}: training.mcq_training_questions must be an array."
            )

        for q_index, mcq in enumerate(mcqs, start=1):
            if not isinstance(mcq, dict):
                raise ValueError(
                    f"Invalid MCQ at roleplay index {index}, question {q_index}: item must be an object."
                )

            choices = mcq.get("choices", mcq.get("options"))
            if not isinstance(choices, list) or len(choices) != 4:
                raise ValueError(
                    f"Invalid MCQ at roleplay index {index}, question {q_index}: exactly 4 choices are required."
                )

            if not all(isinstance(choice, str) for choice in choices):
                raise ValueError(
                    f"Invalid MCQ at roleplay index {index}, question {q_index}: every choice must be a string."
                )

            correct_answer = mcq.get("correct_answer")
            if not isinstance(correct_answer, str):
                raise ValueError(
                    f"Invalid MCQ at roleplay index {index}, question {q_index}: correct_answer must be a string."
                )

            if correct_answer not in choices:
                raise ValueError(
                    f"Invalid MCQ at roleplay index {index}, question {q_index}: "
                    "correct_answer must exactly match one of the four choices."
                )

    return payload


def import_roleplays(seed_file: str | None = None) -> None:
    seed_path = _resolve_seed_path(seed_file)

    if not seed_path.exists():
        if seed_file:
            raise FileNotFoundError(f"Seed file not found: {seed_path}")
        raise FileNotFoundError(
            "Missing required seed file at repo root: seed_roleplays.json. "
            "Please manually add seed_roleplays.json and rerun the import."
        )

    with seed_path.open("r", encoding="utf-8") as f:
        records = _validate_records(json.load(f), seed_path)

    processed = len(records)
    added = 0
    updated = 0
    unchanged = 0

    with app.app_context():
        existing_roleplays = {
            (roleplay.business_name, roleplay.event): roleplay
            for roleplay in Roleplay.query.all()
        }

        for item in records:
            key = (item.get("business_name"), item.get("event"))
            training_payload = item["training"]

            if key in existing_roleplays:
                roleplay = existing_roleplays[key]
                if roleplay.training_json != training_payload:
                    roleplay.training_json = training_payload
                    updated += 1
                else:
                    unchanged += 1
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
        f"Processed {processed} roleplays from {seed_path.name}: "
        f"added {added}, updated {updated}, unchanged/skipped {unchanged}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import roleplays and training JSON into the database.")
    parser.add_argument(
        "--seed-file",
        help="Optional path (absolute or repo-relative) to a roleplay seed JSON file.",
    )
    args = parser.parse_args()
    import_roleplays(args.seed_file)
