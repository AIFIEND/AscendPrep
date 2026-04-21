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

REQUIRED_TRAINING_FIELDS = [
    "performance_indicators",
    "key_terms",
    "example_opening",
    "example_questions",
    "closing_tip",
]


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    seed_path = repo_root / "seed_roleplays.json"

    with seed_path.open("r", encoding="utf-8") as f:
        roleplays = json.load(f)

    errors: list[str] = []
    if not isinstance(roleplays, list):
        print("seed_roleplays.json must be a JSON array")
        return 1

    for idx, roleplay in enumerate(roleplays):
        prefix = f"item[{idx}]"
        if not isinstance(roleplay, dict):
            errors.append(f"{prefix} must be an object")
            continue

        for field in REQUIRED_FIELDS:
            if field not in roleplay:
                errors.append(f"{prefix} missing required field: {field}")

        training = roleplay.get("training")
        if not isinstance(training, dict):
            errors.append(f"{prefix}.training must be an object")
            continue

        for field in REQUIRED_TRAINING_FIELDS:
            if field not in training:
                errors.append(f"{prefix}.training missing required field: {field}")

    if errors:
        for err in errors:
            print(err)
        print(f"Validation failed with {len(errors)} issue(s)")
        return 1

    print(f"Validation passed for {len(roleplays)} roleplays")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
