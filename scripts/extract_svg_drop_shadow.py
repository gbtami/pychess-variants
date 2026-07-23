#!/usr/bin/env python3
"""Remove the standard embedded shogi drop shadow from SVG piece images."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from xml.etree import ElementTree


FILTER_BLOCK_RE = re.compile(
    r"<(?P<prefix>(?:[A-Za-z_][\w.-]*:)?)filter\b"
    r"(?P<attributes>[^>]*)>.*?</(?P=prefix)filter\s*>",
    re.DOTALL,
)
FILTER_REFERENCE_RE = re.compile(r"""\sfilter=(?P<quote>["'])url\(#(?P<id>[^)]+)\)(?P=quote)""")
ID_RE = re.compile(r"""\bid=(?P<quote>["'])(?P<id>[^"']+)(?P=quote)""")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def is_standard_drop_shadow(element: ElementTree.Element) -> bool:
    children = list(element)
    if [local_name(child.tag) for child in children] != [
        "feGaussianBlur",
        "feOffset",
        "feBlend",
    ]:
        return False

    blur, offset, blend = children
    return (
        blur.attrib.get("in") == "SourceAlpha"
        and blur.attrib.get("result") == "blur"
        and blur.attrib.get("stdDeviation") == "2"
        and offset.attrib.get("dx") == "2"
        and offset.attrib.get("dy") == "2"
        and offset.attrib.get("result") == "offsetBlur"
        and blend.attrib.get("in") == "SourceGraphic"
        and blend.attrib.get("in2") == "offsetBlur"
        and blend.attrib.get("mode", "normal") == "normal"
    )


def referenced_filter_ids(root: ElementTree.Element) -> set[str]:
    referenced: set[str] = set()
    for element in root.iter():
        value = element.attrib.get("filter", "")
        match = re.fullmatch(r"url\(#([^)]+)\)", value)
        if match:
            referenced.add(match.group(1))
    return referenced


def standard_shadow_ids(root: ElementTree.Element) -> set[str]:
    return {
        filter_id
        for element in root.iter()
        if local_name(element.tag) == "filter"
        and (filter_id := element.attrib.get("id"))
        and is_standard_drop_shadow(element)
    }


def remove_filter_block(svg: str, filter_id: str) -> tuple[str, int]:
    removed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal removed
        id_match = ID_RE.search(match.group("attributes"))
        if id_match and id_match.group("id") == filter_id:
            removed += 1
            return ""
        return match.group(0)

    return FILTER_BLOCK_RE.sub(replace, svg), removed


def remove_filter_reference(svg: str, filter_id: str) -> tuple[str, int]:
    removed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal removed
        if match.group("id") == filter_id:
            removed += 1
            return ""
        return match.group(0)

    return FILTER_REFERENCE_RE.sub(replace, svg), removed


def extract_shadow(path: Path, *, check: bool) -> bool:
    original = path.read_text(encoding="utf-8")
    root = ElementTree.fromstring(original)
    targets = referenced_filter_ids(root) & standard_shadow_ids(root)

    if len(targets) != 1:
        raise ValueError(f"expected one referenced standard drop shadow, found {len(targets)}")

    filter_id = targets.pop()
    converted, block_count = remove_filter_block(original, filter_id)
    converted, reference_count = remove_filter_reference(converted, filter_id)
    converted = re.sub(r"(?m)^[ \t]+$", "", converted)
    if block_count != 1 or reference_count != 1:
        raise ValueError(
            f"expected one filter block and one reference, found {block_count} and {reference_count}"
        )

    converted_root = ElementTree.fromstring(converted)
    if filter_id in referenced_filter_ids(converted_root):
        raise ValueError("the converted SVG still references the removed filter")

    changed = converted != original
    if changed and not check:
        path.write_text(converted, encoding="utf-8")
    return changed


def svg_paths(arguments: list[Path]) -> list[Path]:
    paths: set[Path] = set()
    for argument in arguments:
        if argument.is_dir():
            paths.update(argument.rglob("*.svg"))
        elif argument.suffix.lower() == ".svg":
            paths.add(argument)
        else:
            raise ValueError(f"not an SVG file or directory: {argument}")
    return sorted(paths)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", type=Path, nargs="+")
    parser.add_argument(
        "--check",
        action="store_true",
        help="report files that would change without writing them",
    )
    args = parser.parse_args()

    failures = 0
    changed = 0
    for path in svg_paths(args.paths):
        try:
            if extract_shadow(path, check=args.check):
                changed += 1
                print(path)
        except (ElementTree.ParseError, OSError, ValueError) as error:
            failures += 1
            print(f"{path}: {error}", file=sys.stderr)

    action = "would change" if args.check else "changed"
    print(f"{changed} file(s) {action}; {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
