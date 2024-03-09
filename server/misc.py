from __future__ import annotations
import asyncio
import cProfile
import pstats
import time
from timeit import default_timer
from collections import UserDict

from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState


def timeit(func):
    async def process(func, *args, **params):
        if asyncio.iscoroutinefunction(func):
            # print('this function is a coroutine: {}'.format(func.__name__))
            return await func(*args, **params)
        else:
            # print('this is not a coroutine')
            return func(*args, **params)

    async def helper(*args, **params):
        # print('{}.time'.format(func.__name__))
        start = time.time()
        result = await process(func, *args, **params)

        # Test normal function route...
        # result = await process(lambda *a, **p: print(*a, **p), *args, **params)

        print(">>>", time.time() - start)
        return result

    return helper


class OnDemand:
    """Helper class to conditionally logging expensive tasks
    if get_object_counts() is expensive to calculate
    instead of doing: logging.debug("total number: %r", get_object_counts())
    you can do: logging.debug("total number: %r", OnDemand(get_object_counts))"""

    def __init__(self, callable):
        self.callable = callable

    def __repr__(self):
        return repr(self.callable())


def profile_me(fn):
    def profiled_fn(*args, **kwargs):
        prof = cProfile.Profile()
        ret = prof.runcall(fn, *args, **kwargs)
        ps = pstats.Stats(prof)
        ps.sort_stats("cumulative")
        ps.print_stats(60)
        return ret

    return profiled_fn


class Timer:
    def __init__(self, text):
        self.text = text
        self.timer = default_timer

    def __enter__(self):
        self.start = self.timer()
        return self

    def __exit__(self, *args):
        end = self.timer()
        self.elapsed_secs = end - self.start
        self.elapsed = self.elapsed_secs * 1000  # millisecs
        print("---- elapsed time: %f ms - %s" % (self.elapsed, self.text))


def time_control_str(base, inc, byo, day=0):
    if day > 0:
        return f"{day} day" if day == 1 else f"{day} days"

    if base == 1 / 4:
        base = "¼"
    elif base == 1 / 2:
        base = "½"
    elif base == 3 / 4:
        base = "¾"
    else:
        base = str(int(base))
    if byo == 0:
        inc_str = f"{inc}"
    elif byo == 1:
        inc_str = f"{inc}(b)"
    else:
        inc_str = f"{byo}x{inc}(b)"
    return base + "+" + inc_str


def server_state(app_state: PychessGlobalAppState, amount=3):
    print("=" * 40)
    for attr in vars(app_state):
        attrib = getattr(app_state, attr)
        length = len(attrib) if hasattr(attrib, "__len__") else 1
        print("--- %s %s ---" % (attr, length))
        if isinstance(attrib, dict) or isinstance(attrib, UserDict):
            for item in list(attrib.items())[: min(length, amount)]:
                print("   %s %s" % item)
            if length > amount:
                last = list(attrib.items())[-1]
                print("   ...")
                print("   %s %s" % last)
        elif isinstance(attrib, list):
            for item in attrib[: min(length, amount)]:
                print("   %s" % item)
            if length > amount:
                last = attrib[-1]
                print("   ...")
                print("   %s %s" % last)
        else:
            print(attrib)
    print("=" * 40)

    q = app_state.users["Random-Mover"].event_queue
    gq = app_state.users["Random-Mover"].game_queues
    print(" ... Random-Mover ...")
    print(q)
    print(gq)
    q = app_state.users["Fairy-Stockfish"].event_queue
    gq = app_state.users["Fairy-Stockfish"].game_queues
    print(" ... Fairy-Stockfish ...")
    print(q)
    print(gq)
    print("=" * 40)
