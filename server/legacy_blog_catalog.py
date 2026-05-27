from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


_META_PATH = Path(__file__).with_name("blog_legacy_metadata.json")


@lru_cache(maxsize=1)
def legacy_blogs() -> list[dict[str, Any]]:
    data = json.loads(_META_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("blog_legacy_metadata.json must contain a list")
    return [item for item in data if isinstance(item, dict)]


def legacy_blog_categories() -> dict[str, Any]:
    return {
        str(blog["_id"]): blog.get("category", "all") for blog in legacy_blogs() if "_id" in blog
    }
