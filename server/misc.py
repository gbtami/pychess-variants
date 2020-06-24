import cProfile
import pstats
from timeit import default_timer


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
