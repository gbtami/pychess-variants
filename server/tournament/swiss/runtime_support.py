from __future__ import annotations

from typing import Any

try:
    from py4swiss.engines import DutchEngine
    from py4swiss.engines.common import PairingError
    from py4swiss.trf import ParsedTrf
    from py4swiss.trf.codes import PlayerCode
    from py4swiss.trf.results import (
        ColorToken,
        ResultToken,
        RoundResult,
        ScoringPointSystem,
        ScoringPointSystemCode,
    )
    from py4swiss.trf.sections import PlayerSection, XSection
    from py4swiss.trf.sections.x_section import XSectionConfiguration

    PY4SWISS_IMPORT_ERROR: Exception | None = None
except Exception as exc:  # pragma: no cover - exercised only when dependency is missing
    DutchEngine = None
    PairingError = RuntimeError
    ParsedTrf = None
    PlayerCode = None
    ColorToken = None
    ResultToken = None
    RoundResult = None
    ScoringPointSystem = None
    ScoringPointSystemCode = None
    PlayerSection = None
    XSection = None
    XSectionConfiguration = None
    PY4SWISS_IMPORT_ERROR = exc

DutchEngine: Any
PairingError: Any
ParsedTrf: Any
PlayerCode: Any
ColorToken: Any
ResultToken: Any
RoundResult: Any
ScoringPointSystem: Any
ScoringPointSystemCode: Any
PlayerSection: Any
XSection: Any
XSectionConfiguration: Any

__all__ = [
    "ColorToken",
    "DutchEngine",
    "PY4SWISS_IMPORT_ERROR",
    "PairingError",
    "ParsedTrf",
    "PlayerCode",
    "PlayerSection",
    "ResultToken",
    "RoundResult",
    "ScoringPointSystem",
    "ScoringPointSystemCode",
    "XSection",
    "XSectionConfiguration",
]
