import inspect
import json
import sys
import gc
import time
import asyncio
from asyncio import Task, Queue
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timezone
from functools import partial
from typing import TYPE_CHECKING, TypedDict, cast

from aiohttp import web
from aiohttp.web_ws import WebSocketResponse

from clock import Clock
from game import Game
import logging

from const import STARTED, reserved
from lobby import Lobby
from seek import Seek
from user import User
from variants import Variant
from fairy.fairy_board import FairyBoard
from glicko2.glicko2 import Rating
from settings import PYCHESS_MONITOR_TOKEN, URI, LOCALHOST
from tournament.tournament import PlayerData, GameData
from tournament.arena import ArenaTournament
from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)


def _seek_expire_sort_key(seek: Seek) -> float:
    expire_at = seek.expire_at
    if expire_at is None:
        return float("-inf")
    if expire_at.tzinfo is None:
        expire_at = expire_at.replace(tzinfo=timezone.utc)
    return expire_at.timestamp()


class AllocationStat(TypedDict):
    type: str
    count: int
    size_bytes: int
    size_human: str


class TaskInfo(TypedDict):
    id: int
    name: str
    state: object
    file: str
    source: str


class QueueInfo(TypedDict):
    id: int
    name: str
    size: int
    file: str
    source: str


def _task_state(task: Task[None] | None) -> str:
    if task is None:
        return "none"
    if task.cancelled():
        return "cancelled"
    if not task.done():
        return "pending"
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        return "cancelled"
    except Exception:
        return "done"
    return "failed" if exc is not None else "done"


def inspect_referrer(ref: object) -> None:
    if isinstance(ref, dict):
        log.info("  Dictionary referrer:")
        log.info("     %s", list(ref.keys()))
    elif isinstance(ref, Task):
        log.info("  TASK REFERRER   ")
        log.info("     %s", ref.get_name())
    elif hasattr(ref, "__dict__"):
        log.info("  Object referrer:")
        log.info("     %s", list(ref.__dict__.keys()))
    elif isinstance(ref, set):
        log.info("  Set referrer:")
        li = tuple(ref)
        log.info("     %s", li if len(li) == 0 else li[0])
    elif isinstance(ref, Iterable):
        log.info("  Iterable referrer:")
        try:
            ref_len = len(ref)  # type: ignore[arg-type]
            log.info("     %s", ref if ref_len == 0 else ref[0])  # type: ignore[index]
        except TypeError:
            log.info("     %s", id(ref))
    else:
        log.info(f"  Other referrer: {ref}")


# Helper function to calculate deep memory size
def get_deep_size(obj: object, seen: set[int] | None = None) -> int:
    """Recursively calculate the memory size of an object."""
    if seen is None:
        seen = set()
    obj_id = id(obj)
    if obj_id in seen:
        return 0
    seen.add(obj_id)

    size = sys.getsizeof(obj)

    if isinstance(obj, dict):
        size += sum(get_deep_size(k, seen) + get_deep_size(v, seen) for k, v in obj.items())
    elif isinstance(obj, Iterable) and not isinstance(obj, (str, bytes, bytearray)):
        size += sum(get_deep_size(item, seen) for item in obj)

    return size


def memory_stats(
    top_n: int = 20, need_inspect: bool | str | None = False
) -> tuple[list[AllocationStat], list[TaskInfo], list[QueueInfo], dict[str, int]]:
    """
    Collects memory usage statistics for the top N object types in the Python heap.
    - Performs garbage collection to clean up unreferenced objects.
    - Uses gc.get_objects() to retrieve all tracked objects.
    - Computes count and total deep size (using get_deep_size) for each type.
    - Returns a list of dictionaries sorted by total deep size in descending order.

    Note: Deep size calculation is more accurate for nested structures but can be slower
    due to recursive traversal. For large object graphs, this may impact performance.
    In an aiohttp server, run this in an executor to avoid blocking the event loop, e.g.:

    from concurrent.futures import ThreadPoolExecutor
    executor = ThreadPoolExecutor()
    stats = await loop.run_in_executor(executor, memory_stats)
    """
    gc.collect()  # Clean up garbage before measuring

    objects: list[object] = gc.get_objects()

    type_info: defaultdict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "size": 0})

    tasks: list[TaskInfo] = []
    queues: list[QueueInfo] = []

    for obj in objects:
        if type(obj) in (
            Clock,
            Game,
            User,
            Seek,
            PlayerData,
            GameData,
            ArenaTournament,
            Lobby,
            WebSocketResponse,
            Task,
            Queue,
            FairyBoard,
            Rating,
            Variant,
        ):
            obj_type = type(obj).__name__
            type_info[obj_type]["count"] += 1
            if type(obj) is Task:
                type_info[obj_type]["size"] += sys.getsizeof(obj)
                # TODO: using inspect modul is rather time consuming
                # Add a new switch to the monitor TUI to enable this
                stack = obj.get_stack(limit=1) if need_inspect else ""
                if TYPE_CHECKING:
                    assert isinstance(stack, list)
                if len(stack) > 0:
                    stack_file = "/".join(inspect.getfile(stack[0]).split("/")[-2:])
                    # stack_source = inspect.getsource(stack[0])[:25]
                    stack_source = "-"

                    if 0:  # "aiohttp" in stack_file:
                        referrers = gc.get_referrers(obj)  # type: ignore[unreachable]
                        print("------", obj.get_name())
                        for ref in referrers:
                            inspect_referrer(ref)
                else:
                    stack_file = "-"
                    stack_source = "-"

                tasks.append(
                    {
                        "id": id(obj),
                        "name": obj.get_name(),
                        "state": obj._state,
                        "file": stack_file,
                        "source": stack_source,
                    }
                )

            elif type(obj) is Queue:
                queues.append(
                    {
                        "id": id(obj),
                        "name": str(obj),
                        "size": obj.qsize(),
                        "file": "-",
                        "source": "-",
                    }
                )
            else:
                type_info[obj_type]["size"] += get_deep_size(obj)

    type_counts = {obj_type: info["count"] for obj_type, info in type_info.items()}

    # Sort by total deep size descending
    sorted_types = sorted(type_info.items(), key=lambda x: x[1]["size"], reverse=True)[:top_n]

    # Convert to list of dicts for easy consumption/printing
    result: list[AllocationStat] = [
        {
            "type": t,
            "count": info["count"],
            "size_bytes": info["size"],
            "size_human": (
                f"{info['size'] / 1024 / 1024:.2f} MB"
                if info["size"] >= 1024 * 1024
                else (
                    f"{info['size'] / 1024:.2f} KB"
                    if info["size"] >= 1024
                    else f"{info['size']} bytes"
                )
            ),
        }
        for t, info in sorted_types
    ]

    return result, tasks, queues, type_counts


async def metrics_handler(request: web.Request) -> web.StreamResponse:
    """Return server metrics as JSON."""
    auth = request.headers.get("Authorization")
    if auth is None:
        log.error("metrics request without Authorization header!")
        raise web.HTTPNotFound()

    token = auth[auth.find("Bearer") + 7 :]
    if URI != LOCALHOST and token != PYCHESS_MONITOR_TOKEN:
        log.error("Invalid pychess-metrics token! %s", token)
        raise web.HTTPNotFound()

    app_state = get_app_state(request.app)
    active_connections = app_state.lobby.lobbysockets

    need_inspect = request.rel_url.query.get("inspect")

    # Take snapshot
    start = time.process_time()
    top_stats, tasks, queues, type_counts = memory_stats(
        15, need_inspect and need_inspect == "True"
    )
    log.debug("Running memory_stats() time: %s", (time.process_time() - start))

    # Prepare object details
    now = datetime.now(timezone.utc)

    users: list[dict[str, object]] = [
        {
            "title": user.title,
            "username": user.username,
            "anon": user.anon,
            "reserved": reserved(user.username),
            "online": user.online,
            "ever_connected": getattr(user, "ever_connected", False),
            "last_seen": user.last_seen,
            "last_seen_default": user.last_seen.year <= 1,
            "idle_mins": (
                ""
                if user.last_seen.year <= 1
                else int((now - user.last_seen).total_seconds() // 60)
            ),
            "game_in_progress": user.game_in_progress or "",
            "corr_games": len(user.correspondence_games),
            "lobby_sockets": len(user.lobby_sockets),
            "game_socket_games": len(user.game_sockets),
            "game_socket_total": sum(len(ws_set) for ws_set in user.game_sockets.values()),
            "challenge_channels": len(user.challenge_channels),
            "notify_channels": len(user.notify_channels),
            "tournament_sockets": sum(len(ws_set) for ws_set in user.tournament_sockets.values()),
            "simul_sockets": sum(len(ws_set) for ws_set in user.simul_sockets.values()),
            "abandon_tasks": len(user.abandon_game_tasks),
            "background_tasks": len(user.background_tasks),
            "remove_anon_task": _task_state(user.remove_anon_task),
            "game_queues": len(user.game_queues) if user.bot else "",
        }
        for username, user in sorted(
            app_state.users.items(), key=lambda x: x[1].last_seen, reverse=True
        )
    ]
    seeks: list[dict[str, object]] = [
        {
            "id": seek_id,
            "creator": seek.creator.username,
            "target": seek.target,
            "expire_at": seek.expire_at,
            "variant": seek.variant,
            "base": seek.base,
            "inc": seek.inc,
            "day": seek.day,
            "rated": seek.rated,
        }
        for seek_id, seek in sorted(
            app_state.seeks.items(), key=lambda x: _seek_expire_sort_key(x[1]), reverse=True
        )
    ]
    games: list[dict[str, object]] = [
        {
            "id": game_id,
            "date": game.date,
            "status": game.status,
            "players": (game.wplayer.username, game.bplayer.username),
        }
        for game_id, game in sorted(app_state.games.items(), key=lambda x: x[1].date, reverse=True)
    ]
    connections: list[dict[str, str]] = [
        {"id": username, "timestamp": datetime.now(timezone.utc).isoformat()}
        for username in app_state.lobby.lobbysockets
    ]

    user_objects_total = type_counts.get("User", 0)
    detached_user_objects = max(0, user_objects_total - len(users))

    anon_users: list[dict[str, object]] = []
    anon_total = 0
    anon_online = 0
    anon_removable_now = 0
    anon_default_last_seen = 0
    anon_never_connected = 0
    anon_with_remove_task = 0
    anon_idle_lt_10m = 0
    anon_idle_10m_to_60m = 0
    anon_idle_over_60m = 0
    anon_pending_remove_idle_default = 0
    anon_pending_remove_idle_lt_10m = 0
    anon_pending_remove_idle_10m_to_60m = 0
    anon_pending_remove_idle_over_60m = 0
    anon_removable_idle_default = 0
    anon_removable_idle_lt_10m = 0
    anon_removable_idle_10m_to_60m = 0
    anon_removable_idle_over_60m = 0
    anon_blocker_game_in_progress = 0
    anon_blocker_correspondence_games = 0
    anon_blocker_game_sockets = 0
    anon_blocker_lobby_sockets = 0
    anon_blocker_challenge_channels = 0
    anon_blocker_tournament_sockets = 0
    anon_blocker_simul_sockets = 0

    for user in app_state.users.values():
        if (not user.anon) or reserved(user.username):
            continue

        anon_total += 1
        lobby_sockets = len(user.lobby_sockets)
        game_socket_games = len(user.game_sockets)
        game_socket_total = sum(len(ws_set) for ws_set in user.game_sockets.values())
        challenge_channels = len(user.challenge_channels)
        tournament_sockets = sum(len(ws_set) for ws_set in user.tournament_sockets.values())
        simul_sockets = sum(len(ws_set) for ws_set in user.simul_sockets.values())
        corr_games = len(user.correspondence_games)
        last_seen_default = user.last_seen.year <= 1
        idle_mins: int | None = (
            None if last_seen_default else int((now - user.last_seen).total_seconds() // 60)
        )
        blockers: list[str] = []
        if user.game_in_progress is not None:
            blockers.append("game_in_progress")
            anon_blocker_game_in_progress += 1
        if corr_games > 0:
            blockers.append("correspondence_games")
            anon_blocker_correspondence_games += 1
        if game_socket_games > 0:
            blockers.append("game_sockets")
            anon_blocker_game_sockets += 1
        if lobby_sockets > 0:
            blockers.append("lobby_sockets")
            anon_blocker_lobby_sockets += 1
        if challenge_channels > 0:
            blockers.append("challenge_channels")
            anon_blocker_challenge_channels += 1
        if tournament_sockets > 0:
            blockers.append("tournament_sockets")
            anon_blocker_tournament_sockets += 1
        if simul_sockets > 0:
            blockers.append("simul_sockets")
            anon_blocker_simul_sockets += 1

        task_state = _task_state(user.remove_anon_task)
        if task_state == "pending":
            anon_with_remove_task += 1
            if last_seen_default:
                anon_pending_remove_idle_default += 1
            elif TYPE_CHECKING:
                assert idle_mins is not None
                if idle_mins < 10:
                    anon_pending_remove_idle_lt_10m += 1
                elif idle_mins < 60:
                    anon_pending_remove_idle_10m_to_60m += 1
                else:
                    anon_pending_remove_idle_over_60m += 1
            else:
                if idle_mins is not None and idle_mins < 10:
                    anon_pending_remove_idle_lt_10m += 1
                elif idle_mins is not None and idle_mins < 60:
                    anon_pending_remove_idle_10m_to_60m += 1
                elif idle_mins is not None:
                    anon_pending_remove_idle_over_60m += 1
        if user.online:
            anon_online += 1
        if last_seen_default:
            anon_default_last_seen += 1
        if not getattr(user, "ever_connected", False):
            anon_never_connected += 1

        if not last_seen_default:
            if TYPE_CHECKING:
                assert idle_mins is not None
            if idle_mins is not None and idle_mins < 10:
                anon_idle_lt_10m += 1
                if len(blockers) == 0:
                    anon_removable_idle_lt_10m += 1
            elif idle_mins is not None and idle_mins < 60:
                anon_idle_10m_to_60m += 1
                if len(blockers) == 0:
                    anon_removable_idle_10m_to_60m += 1
            elif idle_mins is not None:
                anon_idle_over_60m += 1
                if len(blockers) == 0:
                    anon_removable_idle_over_60m += 1

        if last_seen_default and len(blockers) == 0:
            anon_removable_idle_default += 1
        if len(blockers) == 0:
            anon_removable_now += 1

        anon_users.append(
            {
                "username": user.username,
                "online": user.online,
                "ever_connected": getattr(user, "ever_connected", False),
                "last_seen": user.last_seen,
                "last_seen_default": last_seen_default,
                "idle_mins": "" if last_seen_default else idle_mins,
                "game_in_progress": user.game_in_progress or "",
                "corr_games": corr_games,
                "lobby_sockets": lobby_sockets,
                "game_socket_games": game_socket_games,
                "game_socket_total": game_socket_total,
                "challenge_channels": challenge_channels,
                "tournament_sockets": tournament_sockets,
                "simul_sockets": simul_sockets,
                "abandon_tasks": len(user.abandon_game_tasks),
                "remove_anon_task": task_state,
                "blockers": blockers,
                "removable_now": len(blockers) == 0,
            }
        )

    anon_users.sort(key=lambda row: cast(datetime, row["last_seen"]), reverse=True)

    started_games_no_round_sockets: list[dict[str, object]] = []
    for game_id, game in app_state.games.items():
        if game.status != STARTED:
            continue

        non_bot_players = tuple(game.non_bot_players)
        if len(non_bot_players) == 0:
            continue

        players_with_round_socket = sum(
            1 for player in non_bot_players if player.is_user_active_in_game(game_id)
        )
        players_with_game_in_progress = sum(
            1 for player in non_bot_players if player.game_in_progress == game_id
        )
        if players_with_round_socket > 0:
            continue
        if players_with_game_in_progress == 0:
            continue

        started_games_no_round_sockets.append(
            {
                "id": game_id,
                "variant": game.variant,
                "status": game.status,
                "date": game.date,
                "players": [player.username for player in non_bot_players],
                "players_with_game_in_progress": players_with_game_in_progress,
                "spectators": len(game.spectators),
            }
        )

    started_games_no_round_sockets.sort(key=lambda row: cast(datetime, row["date"]), reverse=True)

    anon_summary = [
        {
            "anon_total": anon_total,
            "anon_online_flag": anon_online,
            "anon_with_default_last_seen": anon_default_last_seen,
            "anon_never_connected": anon_never_connected,
            "anon_with_pending_remove_task": anon_with_remove_task,
            "anon_removable_now": anon_removable_now,
            "anon_idle_lt_10m": anon_idle_lt_10m,
            "anon_idle_10m_to_60m": anon_idle_10m_to_60m,
            "anon_idle_over_60m": anon_idle_over_60m,
            "anon_pending_remove_idle_default": anon_pending_remove_idle_default,
            "anon_pending_remove_idle_lt_10m": anon_pending_remove_idle_lt_10m,
            "anon_pending_remove_idle_10m_to_60m": anon_pending_remove_idle_10m_to_60m,
            "anon_pending_remove_idle_over_60m": anon_pending_remove_idle_over_60m,
            "anon_removable_idle_default": anon_removable_idle_default,
            "anon_removable_idle_lt_10m": anon_removable_idle_lt_10m,
            "anon_removable_idle_10m_to_60m": anon_removable_idle_10m_to_60m,
            "anon_removable_idle_over_60m": anon_removable_idle_over_60m,
            "anon_blocker_game_in_progress": anon_blocker_game_in_progress,
            "anon_blocker_correspondence_games": anon_blocker_correspondence_games,
            "anon_blocker_game_sockets": anon_blocker_game_sockets,
            "anon_blocker_lobby_sockets": anon_blocker_lobby_sockets,
            "anon_blocker_challenge_channels": anon_blocker_challenge_channels,
            "anon_blocker_tournament_sockets": anon_blocker_tournament_sockets,
            "anon_blocker_simul_sockets": anon_blocker_simul_sockets,
            "cached_users": len(users),
            "user_objects_total": user_objects_total,
            "detached_user_objects": detached_user_objects,
            "started_games_no_round_sockets": len(started_games_no_round_sockets),
        }
    ]

    # Calculate memory sizes
    user_memory_size = get_deep_size(app_state.users) / 1024  # Convert to KB
    game_memory_size = get_deep_size(app_state.games) / 1024  # Convert to KB
    task_memory_size = sum([sys.getsizeof(obj) for obj in tasks]) / 1024  # Convert to KB
    queue_memory_size = sum([sys.getsizeof(obj) for obj in queues]) / 1024  # Convert to KB
    conn_memory_size = get_deep_size(active_connections) / 1024  # Convert to KB
    anon_user_memory_size = get_deep_size(anon_users) / 1024
    started_game_no_socket_memory_size = get_deep_size(started_games_no_round_sockets) / 1024
    anon_summary_memory_size = get_deep_size(anon_summary) / 1024

    metrics: dict[str, object] = {
        "active_connections": len(active_connections),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "top_allocations": [
            {
                "type": stat["type"],
                "count": stat["count"],
                "size_bytes": stat["size_bytes"],
                "size_human": stat["size_human"],
            }
            for stat in top_stats
        ],
        "object_counts": {
            "users": len(users),
            "games": len(games),
            "tasks": len(tasks),
            "queues": len(queues),
            "connections": len(connections),
            "anon_users": len(anon_users),
            "started_games_no_round_sockets": len(started_games_no_round_sockets),
            "anon_summary": len(anon_summary),
        },
        "object_sizes": {
            "users": user_memory_size,
            "games": game_memory_size,
            "tasks": task_memory_size,
            "queues": queue_memory_size,
            "connections": conn_memory_size,
            "anon_users": anon_user_memory_size,
            "started_games_no_round_sockets": started_game_no_socket_memory_size,
            "anon_summary": anon_summary_memory_size,
        },
        "object_details": {
            "users": users,
            "seeks": seeks,
            "games": games,
            "tasks": tasks,
            "queues": queues,
            "connections": connections,
            "anon_users": anon_users,
            "started_games_no_round_sockets": started_games_no_round_sockets,
            "anon_summary": anon_summary,
        },
    }
    log.debug("Collecting all metrics time: %s", (time.process_time() - start))

    return web.json_response(metrics, dumps=partial(json.dumps, default=datetime.isoformat))
