import functools
import inspect
import logging

from tenacity import (
    retry,
    wait_exponential_jitter,
    stop_after_delay,
    retry_if_exception_type,
    before_sleep_log,
    after_log,
)
from pymongo.errors import (
    ServerSelectionTimeoutError,
    AutoReconnect,
    NetworkTimeout,
    ConnectionFailure,
)
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.asynchronous.cursor import AsyncCursor

logger = logging.getLogger("mongo.retry")

RETRYABLE = (
    ServerSelectionTimeoutError,
    AutoReconnect,
    NetworkTimeout,
    ConnectionFailure,
)


def mongo_retry():
    return retry(
        retry=retry_if_exception_type(RETRYABLE),
        wait=wait_exponential_jitter(initial=0.1, max=10),
        stop=stop_after_delay(120),
        reraise=True,
        before_sleep=before_sleep_log(logger, logging.WARNING),
        after=after_log(logger, logging.INFO),
    )


class AsyncCursorWrapper:
    """Wraps PyMongo AsyncCursor to retry transient errors during iteration or to_list()."""

    def __init__(self, cursor: AsyncCursor):
        self._cursor = cursor

    def __aiter__(self):
        return self

    @mongo_retry()
    async def __anext__(self):
        return await self._cursor.__anext__()

    def __getattr__(self, name):
        attr = getattr(self._cursor, name)

        # Only wrap coroutine methods (to_list, __anext__)
        if inspect.iscoroutinefunction(attr):

            @functools.wraps(attr)
            @mongo_retry()
            async def wrapper(*args, **kwargs):
                return await attr(*args, **kwargs)

            return wrapper

        # sync methods (sort, limit, skip) returned untouched
        return attr


class AsyncCollectionWrapper:
    """Wrap PyMongo async collection with retry logic."""

    def __init__(self, coll: AsyncCollection):
        self._coll = coll

    def __getattr__(self, name):
        attr = getattr(self._coll, name)

        # Non-callable attributes
        if not callable(attr):
            return attr

        # Coroutine functions (insert_one, update_one, find_one, etc.)
        if inspect.iscoroutinefunction(attr):

            @functools.wraps(attr)
            @mongo_retry()
            async def wrapper(*args, **kwargs):
                return await attr(*args, **kwargs)

            return wrapper

        # Cursor-producing methods (find, aggregate) → wrap cursor
        def cursor_wrapper(*args, **kwargs):
            cursor = attr(*args, **kwargs)
            try:
                return AsyncCursorWrapper(cursor)
            except Exception:
                return cursor

        return cursor_wrapper


class AsyncDBWrapper:
    """Wrap PyMongo async DB to apply retry on async operations and cursors."""

    def __init__(self, db: AsyncDatabase):
        self._db = db

    def __getattr__(self, name):
        attr = getattr(self._db, name)

        if isinstance(attr, AsyncCollection):
            return AsyncCollectionWrapper(attr)

        # DB-level async commands
        if callable(attr) and inspect.iscoroutinefunction(attr):

            @mongo_retry()
            @functools.wraps(attr)
            async def wrapper(*args, **kwargs):
                return await attr(*args, **kwargs)

            return wrapper

        return attr

    def __getitem__(self, name):
        return AsyncCollectionWrapper(self._db[name])
