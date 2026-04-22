from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Literal

import logging

if TYPE_CHECKING:
    from pymongo.asynchronous.database import AsyncDatabase

    from game import Game
    from user import User

log = logging.getLogger(__name__)

CHEAT_REPORT_COLLECTION = "cheat_report"
CEVAL_AUTO_LOSE_CONFIG_NAME = "ceval.auto_lose"
CEVAL_REPORT_REASON = "ceval_cross_tab"
CEVAL_REPORT_ACTION_REPORTED_ONLY: Literal["reported_only"] = "reported_only"
CEVAL_REPORT_ACTION_AUTO_FORFEIT: Literal["auto_forfeit"] = "auto_forfeit"
CevalReportAction = Literal["reported_only", "auto_forfeit"]


async def ceval_auto_lose_enabled(db: AsyncDatabase | None) -> bool:
    if db is None:
        return False

    doc = await db.config.find_one({"name": CEVAL_AUTO_LOSE_CONFIG_NAME}, projection={"value": 1})
    return bool(doc is not None and doc.get("value") is True)


async def append_ceval_cheat_report(
    db: AsyncDatabase | None,
    *,
    game: Game,
    user: User,
    reported_fen: str,
    reported_variant: str,
    reported_chess960: bool,
    min_report_ply: int,
    action: CevalReportAction,
) -> None:
    if db is None:
        return

    opponent = (
        game.bplayer.username if user.username == game.wplayer.username else game.wplayer.username
    )

    report = {
        "createdAt": datetime.now(timezone.utc),
        "kind": CEVAL_REPORT_REASON,
        "action": action,
        "gameId": game.id,
        "suspect": user.username,
        "opponent": opponent,
        "variant": game.variant,
        "chess960": bool(game.chess960),
        "rated": bool(game.rated),
        "tournamentId": game.tournamentId,
        "simulId": game.simulId,
        "ply": game.board.ply,
        "minReportPly": min_report_ply,
        "reportedVariant": reported_variant,
        "reportedChess960": reported_chess960,
        "reportedFen": reported_fen,
        "liveFen": game.board.fen,
        "boardFen": reported_fen.split(" ", 1)[0],
    }

    try:
        await db[CHEAT_REPORT_COLLECTION].insert_one(report)
    except Exception:
        log.exception("Failed to store ceval cheat report for game %s", game.id)
