import json
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    seed_path = repo_root / "seed_roleplays.json"

    with seed_path.open("r", encoding="utf-8") as f:
        roleplays = json.load(f)

    print(f"roleplays: {len(roleplays)}")


if __name__ == "__main__":
    main()
