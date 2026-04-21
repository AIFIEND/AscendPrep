"""Validate required roleplay fields and training payload shape."""

import json
from pathlib import Path

REQUIRED_FIELDS = [
    "event",
    "industry",
    "business_name",
    "student_role",
    "judge_role",
    "scenario_background",
    "objective",
    "task_type",
    "difficulty",
    "training",
]

REQUIRED_TRAINING_KEYS = ["performance_indicators", "example_questions"]


def main() -> None:
    seed_path = Path(__file__).resolve().parent.parent / "seed_roleplays.json"
    with seed_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, list):
        raise ValueError("seed_roleplays.json must contain a list")

    errors = []
    for idx, item in enumerate(payload):
        missing = [field for field in REQUIRED_FIELDS if not item.get(field)]
        if missing:
            errors.append(f"Item {idx}: missing fields {missing}")
            continue

        training = item.get("training")
        if not isinstance(training, dict):
            errors.append(f"Item {idx}: training must be an object")
            continue

        for key in REQUIRED_TRAINING_KEYS:
            if key not in training:
                errors.append(f"Item {idx}: training missing key '{key}'")

    if errors:
        for err in errors:
            print(err)
        raise SystemExit(f"Validation failed with {len(errors)} error(s)")

    print(f"Validation passed for {len(payload)} roleplay records")


if __name__ == "__main__":
    main()
