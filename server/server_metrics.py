import json
import os
import sys
import gc
from asyncio import Task
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from functools import partial

from aiohttp import web
from aiohttp.web_ws import WebSocketResponse

from clock import Clock
from game import Game
from lobby import Lobby
from seek import Seek
from user import User
from variants import Variant
from fairy.fairy_board import FairyBoard
from glicko2.glicko2 import Rating
from tournament.tournament import PlayerData, GameData
from tournament.arena_new import ArenaTournament
from pychess_global_app_state_utils import get_app_state


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


def memory_stats(top_n=10):
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

    type_info = defaultdict(lambda: {'count': 0, 'size': 0})

    for obj in objects:
        if type(obj) in (Clock, Game, User, Seek, PlayerData, GameData, ArenaTournament, Lobby, WebSocketResponse, Task, FairyBoard, Rating, Variant):
            obj_type = type(obj).__name__
            print("---", obj_type)
            type_info[obj_type]['count'] += 1
            if type(obj) == Task:
                type_info[obj_type]['size'] += sys.getsizeof(obj)
            else:
                type_info[obj_type]['size'] += get_deep_size(obj)

    # Sort by total deep size descending
    sorted_types = sorted(
        type_info.items(),
        key=lambda x: x[1]['size'],
        reverse=True
    )[:top_n]

    # Convert to list of dicts for easy consumption/printing
    result = [
        {
            'type': t,
            'count': info['count'],
            'size_bytes': info['size'],
            'size_human': (
                f"{info['size'] / 1024 / 1024:.2f} MB" if info['size'] >= 1024 * 1024 else
                f"{info['size'] / 1024:.2f} KB" if info['size'] >= 1024 else
                f"{info['size']} bytes"
            )
        }
        for t, info in sorted_types
    ]

    return result


async def metrics_handler(request):
    """Return server metrics as JSON."""
    app_state = get_app_state(request.app)
    active_connections = app_state.lobby.lobbysockets

    # Take snapshot
    top_stats = memory_stats()

    # Prepare object details
    users = [
        {
            "title": user.title,
            "username": user.username,
            "online": user.online,
            "last_seen": user.last_seen,
        }
        for username, user in sorted(
            app_state.users.items(), key=lambda x: x[1].last_seen, reverse=True
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
        {"id": username, "timestamp": datetime.now().isoformat()}  # Example attributes
        for username in app_state.lobby.lobbysockets
    ]

    # Calculate memory sizes
    user_memory_size = get_deep_size(app_state.users) / 1024  # Convert to KB
    game_memory_size = get_deep_size(app_state.games) / 1024  # Convert to KB
    conn_memory_size = get_deep_size(active_connections) / 1024  # Convert to KB

    metrics = {
        "pid": os.getpid(),
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
            "connections": len(connections),
        },
        "object_sizes": {
            "users": user_memory_size,
            "games": game_memory_size,
            "connections": conn_memory_size,
        },
        "object_details": {
            "users": users,
            "games": games,
            "connections": connections,
        },
    }
    return web.json_response(metrics, dumps=partial(json.dumps, default=datetime.isoformat))
