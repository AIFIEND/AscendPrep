"""Convert an extracted roleplay payload into seed_roleplays.json.

Usage:
  python scripts/pdf_to_seed_json.py input.json [output.json]

This helper expects `input.json` to already contain a parsed JSON array from the
source PDF extraction workflow and normalizes key ordering/whitespace.
"""

import json
import sys
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


def _normalize_item(item: dict) -> dict:
    normalized = {}
    for field in REQUIRED_FIELDS:
        value = item.get(field)
        normalized[field] = value.strip() if isinstance(value, str) else value
    normalized["is_active"] = bool(item.get("is_active", True))
    return normalized


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python scripts/pdf_to_seed_json.py input.json [output.json]")

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path("seed_roleplays.json").resolve()

    with input_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Input must be a JSON array")

    normalized = [_normalize_item(item) for item in data]

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(normalized, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote {len(normalized)} roleplays to {output_path}")


if __name__ == "__main__":
    main()
