import argparse
import json
from pathlib import Path


def _extract_text(pdf_path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Install pypdf to parse PDFs: pip install pypdf") from exc

    reader = PdfReader(str(pdf_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _build_roleplay_record(pdf_path: Path, text: str) -> dict:
    # Placeholder extraction: keeps workflow practical while allowing manual curation.
    return {
        "event": "",
        "industry": "",
        "business_name": pdf_path.stem,
        "student_role": "",
        "judge_role": "",
        "scenario_background": text,
        "objective": "",
        "task_type": "",
        "difficulty": "",
        "training": {
            "performance_indicators": [],
            "key_terms": [],
            "example_opening": "",
            "example_questions": [],
            "closing_tip": "",
        },
        "source_pdf": str(pdf_path.name),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert roleplay PDFs into seed_roleplays.json")
    parser.add_argument("pdfs", nargs="+", help="PDF files to include")
    parser.add_argument("--output", default="seed_roleplays.json", help="Output JSON path")
    args = parser.parse_args()

    output_path = Path(args.output).resolve()
    existing = []
    if output_path.exists():
        with output_path.open("r", encoding="utf-8") as f:
            existing = json.load(f)
            if not isinstance(existing, list):
                raise RuntimeError("Existing output must be a JSON array")

    records = list(existing)
    for raw_path in args.pdfs:
        pdf_path = Path(raw_path).resolve()
        text = _extract_text(pdf_path)
        records.append(_build_roleplay_record(pdf_path, text))

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {len(records)} roleplays to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
