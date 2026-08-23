"""Run one deterministic shard of the unittest-discovered test modules."""

from __future__ import annotations

import argparse
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one shard of the tests collected by unittest discovery."
    )
    parser.add_argument("shard", type=int, help="1-based shard number to run")
    parser.add_argument("shards", type=int, help="total number of shards")
    args = parser.parse_args()
    if args.shards < 1:
        parser.error("shards must be at least 1")
    if not 1 <= args.shard <= args.shards:
        parser.error("shard must be between 1 and shards")
    return args


def _test_modules(shard: int, shards: int) -> list[Path]:
    tests_dir = Path(__file__).resolve().parent
    modules = sorted(tests_dir.glob("test*.py"))
    return [path for index, path in enumerate(modules) if index % shards == shard - 1]


def main() -> int:
    args = _parse_args()
    modules = _test_modules(args.shard, args.shards)

    print(
        f"Running unittest shard {args.shard}/{args.shards}: {len(modules)} test modules",
        flush=True,
    )

    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    tests_dir = str(Path(__file__).resolve().parent)
    for module in modules:
        suite.addTests(loader.discover(tests_dir, pattern=module.name))

    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
