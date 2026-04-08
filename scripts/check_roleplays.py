"""Check roleplay totals in seed_roleplays.json and the database."""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend_service.app import app, Roleplay


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    seed_path = repo_root / "seed_roleplays.json"

    seed_count = 0
    if seed_path.exists():
        with seed_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                seed_count = len(data)

    with app.app_context():
        db_count = Roleplay.query.count()
        active_count = Roleplay.query.filter_by(is_active=True).count()

    print(f"Seed roleplays: {seed_count}")
    print(f"DB roleplays: {db_count}")
    print(f"Active roleplays: {active_count}")


if __name__ == "__main__":
    main()
