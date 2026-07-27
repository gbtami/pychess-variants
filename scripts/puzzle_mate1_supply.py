#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def _load_categories(repo_root: Path) -> dict[str, tuple[str, ...]]:
    """Load category->variants mapping from server constants with a safe fallback."""
    sys.path.insert(0, str(repo_root / "server"))
    try:
        from const import CATEGORIES  # type: ignore

        normalized: dict[str, tuple[str, ...]] = {}
        for category, variants in CATEGORIES.items():
            if isinstance(variants, str):
                normalized[category] = (variants,)
            else:
                normalized[category] = tuple(variants)
        return normalized
    except Exception:
        # Keep a minimal fallback so the script can still run in constrained environments.
        return {
            "chess": ("chess",),
            "fairy": ("shatranj",),
            "army": ("orda",),
            "makruk": ("makruk",),
            "shogi": ("shogi",),
            "xiangqi": ("xiangqi",),
            "other": ("ataxx",),
        }


def _variant(doc: dict) -> str:
    value = doc.get("v")
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def _is_mate_in_one(doc: dict) -> bool:
    return doc.get("e") == "#1"


def _is_forum_candidate(doc: dict) -> bool:
    # Mirrors FORUM_CAPTCHA_PUZZLE_BASE_QUERY and _captcha_from_puzzle_doc essentials.
    if doc.get("e") != "#1":
        return False
    if doc.get("c") is True:
        return False
    if doc.get("r") is False:
        return False
    if not isinstance(doc.get("f"), str):
        return False
    if not isinstance(doc.get("m"), str):
        return False
    variant = _variant(doc)
    if not variant:
        return False
    return True


def _scan_puzzles(path: Path) -> tuple[int, int, Counter[str], Counter[str]]:
    total_lines = 0
    bad_lines = 0
    mate1_by_variant: Counter[str] = Counter()
    forum_by_variant: Counter[str] = Counter()

    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            total_lines += 1
            line = line.strip()
            if not line:
                continue
            try:
                doc = json.loads(line)
            except json.JSONDecodeError:
                bad_lines += 1
                continue
            if not isinstance(doc, dict):
                continue

            variant = _variant(doc)
            if _is_mate_in_one(doc) and variant:
                mate1_by_variant[variant] += 1
            if _is_forum_candidate(doc):
                forum_by_variant[variant] += 1

    return total_lines, bad_lines, mate1_by_variant, forum_by_variant


def _print_report(
    categories: dict[str, tuple[str, ...]],
    mate1_by_variant: Counter[str],
    forum_by_variant: Counter[str],
) -> None:
    print("Category supply report")
    print("category | main_variant | mate1(main) | forum(main) | mate1(total) | forum(total)")
    print("-" * 86)
    for category, variants in categories.items():
        main_variant = variants[0] if variants else ""
        mate1_main = mate1_by_variant.get(main_variant, 0)
        forum_main = forum_by_variant.get(main_variant, 0)
        mate1_total = sum(mate1_by_variant.get(v, 0) for v in variants)
        forum_total = sum(forum_by_variant.get(v, 0) for v in variants)
        print(
            f"{category:8} | {main_variant:12} | {mate1_main:11} | {forum_main:11} |"
            f" {mate1_total:12} | {forum_total:11}"
        )

    print("\nVariants with zero forum-candidate mate-in-one puzzles")
    zero_variants: list[str] = []
    for variants in categories.values():
        for variant in variants:
            if forum_by_variant.get(variant, 0) == 0:
                zero_variants.append(variant)
    if zero_variants:
        print(", ".join(sorted(set(zero_variants))))
    else:
        print("(none)")

    print("\nTop 20 variants by forum-candidate mate-in-one count")
    print("variant | forum_mate1")
    print("-" * 32)
    for variant, count in forum_by_variant.most_common(20):
        print(f"{variant:12} | {count}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Report mate-in-one puzzle supply per variant/category from NDJSON puzzle dump."
    )
    parser.add_argument(
        "puzzle_file",
        nargs="?",
        default="puzzle.json",
        help="Path to puzzle NDJSON file (default: puzzle.json)",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    puzzle_path = Path(args.puzzle_file)
    if not puzzle_path.is_absolute():
        puzzle_path = repo_root / puzzle_path

    if not puzzle_path.exists():
        print(f"File not found: {puzzle_path}", file=sys.stderr)
        return 2

    categories = _load_categories(repo_root)
    total_lines, bad_lines, mate1_by_variant, forum_by_variant = _scan_puzzles(puzzle_path)

    print(f"Input file: {puzzle_path}")
    print(f"Total lines: {total_lines}")
    print(f"Invalid JSON lines: {bad_lines}")
    print(f"Variants with mate-in-one puzzles: {len(mate1_by_variant)}")
    print(f"Variants with forum candidates: {len(forum_by_variant)}\n")

    _print_report(categories, mate1_by_variant, forum_by_variant)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
