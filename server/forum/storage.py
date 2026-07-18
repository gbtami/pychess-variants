from __future__ import annotations

from notify import notify_by_username

from forum.constants import DEFAULT_FORUM_CATEGS, FORUM_POST_PER_PAGE, KEY_TO_REACTION
from forum.utils import extract_mentions, post_page_for_index


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

    for username in sorted(mentions):
        profile = await app_state.public_users.get_profile(username)
        if profile is None or not profile.enabled:
            continue
        if mentioner in profile.blocked:
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
