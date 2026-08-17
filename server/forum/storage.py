from __future__ import annotations

from datetime import UTC, datetime

from newid import new_id
from notify import notify_by_username
from pymongo.errors import DuplicateKeyError

from forum.access import (
    can_read_forum_categ,
    team_forum_categ_id,
    team_id_from_forum_categ,
    team_id_from_forum_categ_id,
)
from forum.constants import DEFAULT_FORUM_CATEGS, FORUM_POST_PER_PAGE, KEY_TO_REACTION
from forum.utils import extract_mentions, post_page_for_index
from team import get_team


async def ensure_categs(app_state) -> None:
    """Ensure default forum categories exist before forum APIs serve content."""
    if app_state.db is None:
        return
    for categ in DEFAULT_FORUM_CATEGS:
        await app_state.db.forum_categ.update_one(
            {"_id": categ["_id"]},
            {
                "$set": {
                    "name": categ["name"],
                    "desc": categ["desc"],
                    "order": categ["order"],
                },
                "$setOnInsert": {
                    "nbTopics": categ["nbTopics"],
                    "nbPosts": categ["nbPosts"],
                },
            },
            upsert=True,
        )


async def ensure_team_forum(app_state, team) -> dict[str, object] | None:
    """Ensure one hidden-from-index forum category exists for a team."""
    if app_state.db is None:
        return None
    team_id = str(team.get("_id") or "")
    if not team_id:
        return None
    categ_id = team_forum_categ_id(team_id)
    team_name = str(team.get("name") or team_id)

    await app_state.db.forum_categ.update_one(
        {"_id": categ_id},
        {
            "$set": {
                "name": team_name,
                "desc": f"Forum of the team {team_name}",
                "teamId": team_id,
                "order": 1000,
            },
            "$setOnInsert": {
                "nbTopics": 0,
                "nbPosts": 0,
                "teamForumSeeded": False,
            },
        },
        upsert=True,
    )

    # Step 5 is applied after teams may already exist, so seed the welcome topic lazily.
    # Keep a marker so deleting the last real topic does not resurrect the welcome thread.
    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is not None and not bool(categ.get("teamForumSeeded")):
        if await app_state.db.forum_topic.count_documents({"categId": categ_id}) == 0:
            now = datetime.now(UTC)
            topic_id = await new_id(app_state.db.forum_topic)
            post_id = await new_id(app_state.db.forum_post)
            slug = f"{team_id}-forum"
            topic = {
                "_id": topic_id,
                "categId": categ_id,
                "slug": slug,
                "name": f"{team_name} forum",
                "user": str(team.get("createdBy") or ""),
                "createdAt": now,
                "updatedAt": now,
                "nbPosts": 1,
                "lastPostId": post_id,
                "lastPostAt": now,
                "lastPostUser": str(team.get("createdBy") or ""),
                "closed": False,
                "sticky": False,
            }
            post = {
                "_id": post_id,
                "topicId": topic_id,
                "categId": categ_id,
                "user": str(team.get("createdBy") or ""),
                "text": f"Welcome to the {team_name} forum!",
                "createdAt": now,
                "updatedAt": None,
                "editCount": 0,
            }
            try:
                await app_state.db.forum_topic.insert_one(topic)
                await app_state.db.forum_post.insert_one(post)
            except DuplicateKeyError:
                # Concurrent first views can race on the deterministic welcome-topic slug.
                await app_state.db.forum_topic.delete_one({"_id": topic_id})
            await recompute_categ_summary(app_state, categ_id)
        await app_state.db.forum_categ.update_one(
            {"_id": categ_id}, {"$set": {"teamForumSeeded": True}}
        )

    return await app_state.db.forum_categ.find_one({"_id": categ_id})


async def forum_categ_by_id(app_state, categ_id: str) -> dict[str, object] | None:
    """Fetch a category, lazily creating the category for an existing team."""
    if app_state.db is None:
        return None
    categ = await app_state.db.forum_categ.find_one({"_id": categ_id})
    if categ is not None:
        return categ
    team_id = team_id_from_forum_categ_id(categ_id)
    if team_id is None:
        return None
    team = await get_team(app_state, team_id)
    if team is None:
        return None
    return await ensure_team_forum(app_state, team)


async def topic_by_tree(app_state, categ_id: str, slug: str) -> dict[str, object] | None:
    """Fetch a forum topic by category slug pair."""
    if app_state.db is None:
        return None
    return await app_state.db.forum_topic.find_one({"categId": categ_id, "slug": slug})


async def recompute_topic_summary(app_state, topic_id: str) -> dict[str, object] | None:
    """Recompute denormalized topic counters/last-post metadata after post mutations."""
    if app_state.db is None:
        return None
    topic = await app_state.db.forum_topic.find_one({"_id": topic_id})
    if topic is None:
        return None

    nb_posts = await app_state.db.forum_post.count_documents({"topicId": topic_id})
    if nb_posts < 1:
        await app_state.db.forum_topic.delete_one({"_id": topic_id})
        return None

    last_post = await app_state.db.forum_post.find_one(
        {"topicId": topic_id},
        sort=[("createdAt", -1)],
        projection={"_id": 1, "createdAt": 1, "user": 1},
    )
    if last_post is None:
        return None

    await app_state.db.forum_topic.update_one(
        {"_id": topic_id},
        {
            "$set": {
                "nbPosts": nb_posts,
                "updatedAt": last_post["createdAt"],
                "lastPostId": last_post["_id"],
                "lastPostAt": last_post["createdAt"],
                "lastPostUser": last_post.get("user", ""),
            }
        },
    )
    return await app_state.db.forum_topic.find_one({"_id": topic_id})


async def recompute_categ_summary(app_state, categ_id: str) -> None:
    """Recompute denormalized category counters and last-topic/last-post pointers."""
    if app_state.db is None:
        return
    nb_topics = await app_state.db.forum_topic.count_documents({"categId": categ_id})
    nb_posts = await app_state.db.forum_post.count_documents({"categId": categ_id})
    latest = await app_state.db.forum_post.find_one(
        {"categId": categ_id},
        sort=[("createdAt", -1)],
        projection={"_id": 1, "createdAt": 1, "topicId": 1, "user": 1},
    )
    updates: dict[str, object] = {
        "nbTopics": nb_topics,
        "nbPosts": nb_posts,
    }
    if latest is None:
        updates.update(
            {
                "lastPostId": None,
                "lastPostAt": None,
                "lastPostUser": "",
                "lastTopicSlug": "",
                "lastTopicName": "",
                "lastTopicPage": 1,
            }
        )
    else:
        topic = await app_state.db.forum_topic.find_one({"_id": latest["topicId"]})
        topic_nb_posts = int((topic or {}).get("nbPosts", 1))
        updates.update(
            {
                "lastPostId": latest["_id"],
                "lastPostAt": latest.get("createdAt"),
                "lastPostUser": latest.get("user", ""),
                "lastTopicSlug": (topic or {}).get("slug", ""),
                "lastTopicName": (topic or {}).get("name", ""),
                "lastTopicPage": post_page_for_index(
                    max(topic_nb_posts - 1, 0), FORUM_POST_PER_PAGE
                ),
            }
        )
    await app_state.db.forum_categ.update_one({"_id": categ_id}, {"$set": updates})


def serialize_reactions(
    reactions_doc: object,
    *,
    viewer: str | None,
) -> tuple[dict[str, int], set[str]]:
    """Convert persisted reaction arrays into API counts and current-user selections."""
    if not isinstance(reactions_doc, dict):
        return {}, set()

    counts: dict[str, int] = {}
    mine: set[str] = set()
    for key, users in reactions_doc.items():
        reaction = KEY_TO_REACTION.get(str(key))
        if reaction is None:
            continue
        if isinstance(users, list):
            usernames = [str(item) for item in users if isinstance(item, str)]
        else:
            usernames = []
        if len(usernames) > 0:
            counts[reaction] = len(usernames)
            if viewer is not None and viewer in usernames:
                mine.add(reaction)
    return counts, mine


async def notify_mentions(
    app_state,
    *,
    text: str,
    mentioner: str,
    topic: dict[str, object],
    post_id: str,
) -> None:
    """Send forum mention notifications to mentioned users who are eligible to receive them."""
    if app_state.db is None:
        return
    mentions = extract_mentions(text)
    if len(mentions) == 0:
        return
    mentions.discard(mentioner)
    if len(mentions) == 0:
        return

    topic_name = str(topic.get("name") or "")
    topic_slug = str(topic.get("slug") or "")
    categ_id = str(topic.get("categId") or "")
    topic_id = str(topic.get("_id") or "")
    categ = await forum_categ_by_id(app_state, categ_id)

    for username in sorted(mentions):
        profile = await app_state.public_users.get_profile(username)
        if profile is None or not profile.enabled:
            continue
        if mentioner in profile.blocked:
            continue
        if (
            categ is not None
            and team_id_from_forum_categ(categ) is not None
            and not await can_read_forum_categ(app_state, categ, username)
        ):
            continue
        await notify_by_username(
            app_state,
            username,
            "forumMention",
            {
                "id": post_id,
                "opp": mentioner,
                "tid": topic_id,
                "topic": topic_name,
                "slug": topic_slug,
                "categ": categ_id,
            },
        )
