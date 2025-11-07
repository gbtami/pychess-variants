import inspect
import json
import sys
import gc
import time
from asyncio import Task, Queue
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from functools import partial

from aiohttp import web
from aiohttp.web_ws import WebSocketResponse

from clock import Clock
from game import Game
from logger import log
from lobby import Lobby
from seek import Seek
from user import User
from variants import Variant
from fairy.fairy_board import FairyBoard
from glicko2.glicko2 import Rating
from settings import PYCHESS_MONITOR_TOKEN
from tournament.tournament import PlayerData, GameData
from tournament.arena_new import ArenaTournament
from pychess_global_app_state_utils import get_app_state


def inspect_referrer(ref):
    if isinstance(ref, dict):
        print("  Dictionary referrer:")
        print("     ", list(ref.keys()))
    elif isinstance(ref, Task):
        print("  TASK REFERRER   ")
        print("     ", ref.get_name())
    elif hasattr(ref, "__dict__"):
        print("  Object referrer:")
        print("     ", list(ref.__dict__.keys()))
    elif isinstance(ref, set):
        print("  Set referrer:")
        li = list(ref)
        print("     ", li if len(li) == 0 else li[0])
    elif isinstance(ref, Iterable):
        print("  Iterable referrer:")
        try:
            print("     ", ref if len(ref) == 0 else ref[0])
        except TypeError:
            print("     ", id(ref))
    else:
        print(f"  Other referrer: {ref}")


# Helper function to calculate deep memory size
def get_deep_size(obj, seen=None):
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


def memory_stats(top_n=20, need_inspect=False):
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

    objects = gc.get_objects()

    type_info = defaultdict(lambda: {"count": 0, "size": 0})

    tasks = []
    queues = []

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
                if len(stack) > 0:
                    stack_file = "/".join(inspect.getfile(stack[0]).split("/")[-2:])
                    # stack_source = inspect.getsource(stack[0])[:25]
                    stack_source = "-"

                    if 0:  # "aiohttp" in stack_file:
                        referrers = gc.get_referrers(obj)
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

    # Sort by total deep size descending
    sorted_types = sorted(type_info.items(), key=lambda x: x[1]["size"], reverse=True)[:top_n]

    # Convert to list of dicts for easy consumption/printing
    result = [
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

    return result, tasks, queues


async def metrics_handler(request):
    """Return server metrics as JSON."""
    auth = request.headers.get("Authorization")
    if auth is None:
        log.error("metrics request without Authorization header!")
        raise web.HTTPNotFound()

    token = auth[auth.find("Bearer") + 7 :]
    if token != PYCHESS_MONITOR_TOKEN:
        log.error("Invalid pychess-metrics token! %s", token)
        raise web.HTTPNotFound()

    app_state = get_app_state(request.app)
    active_connections = app_state.lobby.lobbysockets

    need_inspect = request.rel_url.query.get("inspect")

    # Take snapshot
    start = time.process_time()
    top_stats, tasks, queues = memory_stats(15, need_inspect and need_inspect == "True")
    log.debug("Running memory_stats() time: %s", (time.process_time() - start))

    # Prepare object details
    users = [
        {
            "title": user.title,
            "username": user.username,
            "online": user.online,
            "last_seen": user.last_seen,
            "game_queues": len(user.game_queues) if user.bot else "",
        }
        for username, user in sorted(
            app_state.users.items(), key=lambda x: x[1].last_seen, reverse=True
        )
    ]
    seeks = [
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
            app_state.seeks.items(), key=lambda x: x[1].expire_at, reverse=True
        )
    ]
    games = [
        {
            "id": game_id,
            "date": game.date,
            "status": game.status,
            "players": (game.wplayer.username, game.bplayer.username),
        }
        for game_id, game in sorted(app_state.games.items(), key=lambda x: x[1].date, reverse=True)
    ]
    connections = [
        {"id": username, "timestamp": datetime.now().isoformat()}
        for username in app_state.lobby.lobbysockets
    ]

    # Calculate memory sizes
    user_memory_size = get_deep_size(app_state.users) / 1024  # Convert to KB
    game_memory_size = get_deep_size(app_state.games) / 1024  # Convert to KB
    task_memory_size = sum([sys.getsizeof(obj) for obj in tasks]) / 1024  # Convert to KB
    queue_memory_size = sum([sys.getsizeof(obj) for obj in queues]) / 1024  # Convert to KB
    conn_memory_size = get_deep_size(active_connections) / 1024  # Convert to KB

    metrics = {
        "active_connections": len(active_connections),
        "timestamp": datetime.now().isoformat(),
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
        },
        "object_sizes": {
            "users": user_memory_size,
            "games": game_memory_size,
            "tasks": task_memory_size,
            "queues": queue_memory_size,
            "connections": conn_memory_size,
        },
        "object_details": {
            "users": users,
            "seeks": seeks,
            "games": games,
            "tasks": tasks,
            "queues": queues,
            "connections": connections,
        },
    }
    log.debug("Collecting all metrics time: %s", (time.process_time() - start))

    return web.json_response(metrics, dumps=partial(json.dumps, default=datetime.isoformat))
