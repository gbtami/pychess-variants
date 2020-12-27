import cProfile
import pstats
from timeit import default_timer

import objgraph


class OnDemand:
    """ Helper class to conditionally logging expensive tasks
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
        ps.sort_stats('cumulative')
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
        print('---- elapsed time: %f ms - %s' % (self.elapsed, self.text))


def time_control_str(base, inc, byo):
    if base == 1 / 4:
        base = "¼"
    elif base == 1 / 2:
        base = "½"
    elif base == 3 / 4:
        base = "¾"
    else:
        base = str(base)
    if byo == 0:
        inc_str = f"{inc}"
    elif byo == 1:
        inc_str = f"{inc}(b)"
    else:
        inc_str = f"{byo}x{inc}(b)"
    return base + "+" + inc_str


def server_state(app, amount=3):
    print("=" * 40)
    for akey in app:
        length = len(app[akey]) if hasattr(app[akey], "__len__") else 1
        print("--- %s %s ---" % (akey, length))
        if isinstance(app[akey], dict):
            items = list(app[akey].items())[:min(length, amount)]
            for key, value in items:
                print("   %s %s" % (key, value))
        elif isinstance(app[akey], list):
            for item in app[akey][:min(length, amount)]:
                print("   %s" % item)
        else:
            print(app[akey])
    print("=" * 40)

    q = app["users"]["Random-Mover"].event_queue
    print(" ... Random-Mover ...")
    print(q)
    q = app["users"]["Fairy-Stockfish"].event_queue
    print(" ... Fairy-Stockfish ...")
    print(q)


def server_growth():
    objgraph.show_growth()
