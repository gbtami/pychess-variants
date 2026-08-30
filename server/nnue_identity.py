from __future__ import annotations

import hashlib
import re

_SECTION_RE = re.compile(r"^\[\s*([^:\]]+?)\s*(?::\s*([^\]]+?)\s*)?\]$")


def _normalize_value(value: str) -> str:
    return re.sub(r"[ \t]+", " ", value.strip())


def canonicalize_fsf_ini_v1(ini: str) -> str:
    """Return the conservative fsf-ini-v1 representation of one variant section."""

    canonical: list[str] = []
    section_seen = False

    for raw_line in ini.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if not line or line.startswith(("#", ";")):
            continue

        section = _SECTION_RE.fullmatch(line)
        if section:
            if section_seen:
                raise ValueError("fingerprint input must contain exactly one variant section")
            name = section.group(1).strip().casefold()
            base = (section.group(2) or "").strip().casefold()
            if not name:
                raise ValueError("variant section has no name")
            canonical.append(f"[{name}:{base}]" if base else f"[{name}]")
            section_seen = True
            continue

        if not section_seen:
            raise ValueError("non-comment content before variant section")
        if "=" not in line:
            raise ValueError(f"unsupported INI line in fingerprint input: {line!r}")

        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise ValueError("variant option has an empty key")
        canonical.append(f"{key}={_normalize_value(value)}")

    if not section_seen:
        raise ValueError("fingerprint input has no variant section")
    return "\n".join(canonical) + "\n"


def fsf_ini_v1_fingerprint(ini: str) -> str:
    canonical = canonicalize_fsf_ini_v1(ini)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
