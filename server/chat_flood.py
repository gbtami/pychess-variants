from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from time import monotonic

from rapidfuzz.distance import Levenshtein

FLOOD_CACHE_SECONDS = 60.0
FLOOD_WINDOW_SECONDS = 10.0
FLOOD_NUMBER = 4

PASSLIST = {
    "Hello",
    "Good luck",
    "Have fun!",
    "You too!",
    "Good game",
    "Well played",
    "Thank you",
    "I've got to go",
    "Bye!",
}


def _normalize_for_similarity(text: str) -> str:
    return " ".join(text.lower().split())


def similar_messages(text1: str, text2: str, *, normalized: bool = False) -> bool:
    normalized1 = text1 if normalized else _normalize_for_similarity(text1)
    normalized2 = text2 if normalized else _normalize_for_similarity(text2)
    if not normalized1 or not normalized2:
        return normalized1 == normalized2
    if normalized1 == normalized2:
        return True
    limit = max(2, min(len(normalized1), len(normalized2)) >> 3)
    return Levenshtein.distance(normalized1, normalized2, score_cutoff=limit) <= limit


@dataclass(slots=True)
class FloodMessage:
    normalized_text: str
    created_at: float


class ChatFlood:
    def __init__(self) -> None:
        self._messages: dict[str, deque[FloodMessage]] = {}
        self._calls = 0

    def allow_message(self, source: str, text: str, *, now: float | None = None) -> bool:
        current_time = monotonic() if now is None else now
        messages = self._messages.setdefault(source, deque())
        self._prune_source(messages, current_time)

        normalized_text = _normalize_for_similarity(text)
        candidate = FloodMessage(normalized_text=normalized_text, created_at=current_time)
        if self._duplicate_message(text, candidate, messages) or self._quick_post(
            candidate, messages
        ):
            if not messages:
                self._messages.pop(source, None)
            return False

        messages.appendleft(candidate)
        while len(messages) > FLOOD_NUMBER + 2:
            messages.pop()

        self._calls += 1
        if self._calls % 256 == 0:
            self._prune_all(current_time)
        return True

    def _prune_all(self, current_time: float) -> None:
        stale_sources = []
        for source, messages in self._messages.items():
            self._prune_source(messages, current_time)
            if not messages:
                stale_sources.append(source)
        for source in stale_sources:
            self._messages.pop(source, None)

    @staticmethod
    def _prune_source(messages: deque[FloodMessage], current_time: float) -> None:
        cutoff = current_time - FLOOD_CACHE_SECONDS
        while messages and messages[-1].created_at < cutoff:
            messages.pop()

    @staticmethod
    def _quick_post(message: FloodMessage, previous_messages: deque[FloodMessage]) -> bool:
        return (
            len(previous_messages) > FLOOD_NUMBER
            and previous_messages[FLOOD_NUMBER].created_at
            > message.created_at - FLOOD_WINDOW_SECONDS
        )

    @staticmethod
    def _duplicate_message(
        raw_text: str, message: FloodMessage, previous_messages: deque[FloodMessage]
    ) -> bool:
        if raw_text in PASSLIST:
            return False

        for idx, older in enumerate(previous_messages):
            if idx >= 2:
                break
            if similar_messages(message.normalized_text, older.normalized_text, normalized=True):
                return True
        return False
