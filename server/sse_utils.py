from __future__ import annotations

import asyncio
from typing import Protocol

from const import SSE_GET_TIMEOUT, SSE_SEND_TIMEOUT


class SSEResponse(Protocol):
    def is_connected(self) -> bool: ...

    async def send(self, data: str) -> None: ...


def enqueue_sse_payload(
    queue: asyncio.Queue[str],
    payload: str,
    *,
    replace_pending: bool = False,
) -> bool:
    """Enqueue without blocking; optionally replace an obsolete state snapshot."""
    try:
        queue.put_nowait(payload)
        return True
    except asyncio.QueueShutDown:
        return False
    except asyncio.QueueFull:
        if not replace_pending:
            queue.shutdown(immediate=True)
            return False

    try:
        queue.get_nowait()
        queue.task_done()
    except asyncio.QueueEmpty, asyncio.QueueShutDown:
        pass

    try:
        queue.put_nowait(payload)
        return True
    except asyncio.QueueFull, asyncio.QueueShutDown:
        queue.shutdown(immediate=True)
        return False


async def send_sse_payload(response: SSEResponse, payload: str) -> None:
    await asyncio.wait_for(response.send(payload), timeout=SSE_SEND_TIMEOUT)


async def consume_sse_queue(
    response: SSEResponse,
    queue: asyncio.Queue[str],
) -> None:
    while response.is_connected():
        try:
            payload = await asyncio.wait_for(queue.get(), timeout=SSE_GET_TIMEOUT)
        except TimeoutError:
            if not response.is_connected():
                break
            continue
        except asyncio.QueueShutDown:
            break

        try:
            await send_sse_payload(response, payload)
        except TimeoutError:
            break
        finally:
            queue.task_done()
