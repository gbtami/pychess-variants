"""Friendly chess-variant sites shown on /friendly-sites."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class FriendlySite:
    name: str
    url: str
    description: str


# Keep alphabetically sorted by name (case-insensitive).
FRIENDLY_SITES: tuple[FriendlySite, ...] = tuple(
    sorted(
        (
            FriendlySite(
                name="Fairy-Stockfish",
                url="https://fairy-stockfish.github.io/",
                description="Strong open-source engine powering analysis for many chess variants.",
            ),
            FriendlySite(
                name="Lichess",
                url="https://lichess.org/",
                description="Free online chess with puzzles, studies, and a huge open-source community.",
            ),
            FriendlySite(
                name="Lishogi",
                url="https://lishogi.org/",
                description="Free online shogi server — sister project in the open-source spirit.",
            ),
            FriendlySite(
                name="PyChess Desktop",
                url="https://pychess.github.io/",
                description="Desktop chess client with engines, variants, and offline play.",
            ),
        ),
        key=lambda site: site.name.casefold(),
    )
)


def public_friendly_sites() -> tuple[FriendlySite, ...]:
    return FRIENDLY_SITES
