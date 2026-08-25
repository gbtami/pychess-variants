"""Friendly chess-variant sites shown on /friendly-sites."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class FriendlySite:
    name: str
    url: str
    description: str
    icon_url: str


# Keep alphabetically sorted by name (case-insensitive).
FRIENDLY_SITES: tuple[FriendlySite, ...] = tuple(
    sorted(
        (
            FriendlySite(
                name="Fairy-Stockfish",
                url="https://fairy-stockfish.github.io/",
                description="Strong open-source engine powering analysis for many chess variants.",
                icon_url="/static/images/Fairy-Stockfish.webp",
            ),
            FriendlySite(
                name="Green Chess",
                url="https://greenchess.net/",
                description="Online chess and chess variants, with a focus on correspondence play.",
                icon_url="/static/images/greenchess-logo.png",
            ),
            FriendlySite(
                name="Lichess",
                url="https://lichess.org/",
                description="Free online chess with puzzles, studies, and a huge open-source community.",
                icon_url="https://lichess1.org/assets/logo/lichess.svg",
            ),
            FriendlySite(
                name="Lishogi",
                url="https://lishogi.org/",
                description="Free online shogi server — sister project in the open-source spirit.",
                icon_url="https://raw.githubusercontent.com/WandererXII/lishogi/master/ui/%40build/static/assets/logo/lishogi.svg",
            ),
            FriendlySite(
                name="PlayStrategy",
                url="https://playstrategy.org/",
                description="Free, open-source platform for chess and many other two-player strategy games.",
                icon_url="https://raw.githubusercontent.com/Mind-Sports-Games/lila/master/public/logo/playstrategy.svg",
            ),
            FriendlySite(
                name="PyChess Desktop",
                url="https://pychess.github.io/",
                description="Desktop chess client with engines, variants, and offline play.",
                icon_url="https://raw.githubusercontent.com/pychess/pychess/master/pychess.svg",
            ),
        ),
        key=lambda site: site.name.casefold(),
    )
)


def public_friendly_sites() -> tuple[FriendlySite, ...]:
    return FRIENDLY_SITES
