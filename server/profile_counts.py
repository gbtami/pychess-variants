from __future__ import annotations

from inspect import isawaitable
from typing import Any, Literal

from const import ARENA, T_ARCHIVED, T_FINISHED
from pymongo import ReturnDocument
from variants import ServerVariants

Counter = Literal["forumPosts", "tournamentPoints", "variantCount"]
HISTORY_PAGE_SIZE = 25


def public_forum_posts_query(username: str) -> dict[str, Any]:
    # Match global forum search: team forums must not leak through public counters.
    return {
        "user": username,
        "categId": {"$not": {"$regex": "^team-"}},
        "erasedAt": None,
    }


def public_catalogued_variants_query(username: str) -> dict[str, Any]:
    # Keep this in sync with the public community catalogue query. Profile
    # counters must never reveal private, unlisted, disabled, or archived
    # user-defined variants.
    return {
        "author": username,
        "enabled": {"$ne": False},
        "archived": {"$ne": True},
        "visibility": "public",
    }


def completed_tournament_results(username: str) -> list[dict[str, Any]]:
    return [
        {"$match": {"uid": username}},
        {
            "$lookup": {
                "from": "tournament",
                "localField": "tid",
                "foreignField": "_id",
                "as": "tournament",
            }
        },
        {"$unwind": "$tournament"},
        {"$match": {"tournament.status": {"$in": [T_FINISHED, T_ARCHIVED]}}},
        {
            "$addFields": {
                "points": {
                    "$divide": [
                        {"$ifNull": ["$s", 0]},
                        {
                            "$cond": [
                                {
                                    "$and": [
                                        {
                                            "$gt": [
                                                {"$ifNull": ["$tournament.system", ARENA]},
                                                ARENA,
                                            ]
                                        },
                                        {
                                            "$ne": [
                                                "$tournament.v",
                                                ServerVariants.JANGGI.value.code,
                                            ]
                                        },
                                    ]
                                },
                                2,
                                1,
                            ]
                        },
                    ]
                }
            }
        },
    ]


async def aggregate_results(db: Any, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = db.tournament_player.aggregate(pipeline)
    cursor = await result if isawaitable(result) else result
    return await cursor.to_list(length=None)


async def calculate_counter(db: Any, username: str, counter: Counter) -> int | float:
    if counter == "forumPosts":
        return await db.forum_post.count_documents(public_forum_posts_query(username))
    if counter == "variantCount":
        return await db.catalogued_variant.count_documents(
            public_catalogued_variants_query(username)
        )
    rows = await aggregate_results(
        db,
        completed_tournament_results(username)
        + [{"$group": {"_id": None, "points": {"$sum": "$points"}}}],
    )
    return rows[0]["points"] if rows else 0


async def refresh_counter(db: Any, username: str, counter: Counter) -> dict[str, Any] | None:
    """Refresh on writes/backfill, never on profile reads.

    Replacing an authoritative total makes retries safe without an ever-growing
    list of awarded tournament IDs. CAS prevents concurrent refreshes overwriting
    a newer value with an older snapshot. Each counter has its own revision.
    """
    revision_key = f"profileCounterRevision.{counter}"
    while True:
        user = await db.user.find_one({"_id": username}, {revision_key: 1})
        if user is None:
            return None
        revision = user.get("profileCounterRevision", {}).get(counter)
        value = await calculate_counter(db, username, counter)
        updated = await db.user.find_one_and_update(
            {"_id": username, revision_key: revision},
            {"$set": {counter: value}, "$inc": {revision_key: 1}},
            projection={counter: 1},
            return_document=ReturnDocument.AFTER,
        )
        if updated is not None:
            return updated


async def refresh_user_counter(app_state: Any, username: str, counter: Counter) -> None:
    if app_state.db is None:
        return
    updated = await refresh_counter(app_state.db, username, counter)
    if updated is None:
        return
    user = app_state.users.data.get(username)
    if user is not None:
        if counter == "forumPosts":
            user.forum_posts = int(updated[counter])
        elif counter == "tournamentPoints":
            user.tournament_points = updated[counter]
        else:
            user.variant_count = int(updated[counter])
    app_state.public_users.invalidate(username)


async def refresh_tournament_points(app_state: Any, tournament_id: str) -> None:
    """Complete a durable pending refresh, including after a server restart."""
    async for player in app_state.db.tournament_player.find({"tid": tournament_id}, {"uid": 1}):
        await refresh_user_counter(app_state, player["uid"], "tournamentPoints")
    await app_state.db.tournament.update_one(
        {"_id": tournament_id}, {"$unset": {"profilePointsPending": ""}}
    )
