from __future__ import annotations

from typing import Literal

import msgspec


Number = int | float


class WsInboundStruct(msgspec.Struct):
    """Mapping-like wrapper to keep existing dict-style message access."""

    def __getitem__(self, key: str):
        return getattr(self, key)

    def __contains__(self, key: object) -> bool:
        return isinstance(key, str) and hasattr(self, key)

    def get(self, key: str, default=None):
        return getattr(self, key, default)

    def keys(self) -> tuple[str, ...]:
        return self.__struct_fields__


class LobbyCreateAiChallengeIn(WsInboundStruct):
    type: Literal["create_ai_challenge"]
    profileid: str
    variant: str
    rm: bool
    fen: str
    color: str
    minutes: int
    increment: int
    byoyomiPeriod: int
    level: int
    chess960: bool
    alternateStart: str = ""


class RoundMoveIn(WsInboundStruct):
    type: Literal["move"]
    gameId: str
    move: str
    clocks: list[Number]
    ply: int
    positionId: str | None = None
    board: str | None = None
    clocksB: list[Number] | None = None


class RoundReadyIn(WsInboundStruct):
    type: Literal["ready"]
    gameId: str


class RoundBoardIn(WsInboundStruct):
    type: Literal["board"]
    gameId: str


class RoundSetupIn(WsInboundStruct):
    type: Literal["setup"]
    gameId: str
    color: str
    fen: str


class RoundChatIn(WsInboundStruct):
    type: Literal["roundchat"]
    gameId: str
    message: str
    room: str


class BugRoundChatIn(WsInboundStruct):
    type: Literal["bugroundchat"]
    gameId: str
    message: str
    room: str


LOBBY_TYPED_DECODERS: dict[str, msgspec.json.Decoder] = {
    "create_ai_challenge": msgspec.json.Decoder(type=LobbyCreateAiChallengeIn),
}


ROUND_TYPED_DECODERS: dict[str, msgspec.json.Decoder] = {
    "move": msgspec.json.Decoder(type=RoundMoveIn),
    "ready": msgspec.json.Decoder(type=RoundReadyIn),
    "board": msgspec.json.Decoder(type=RoundBoardIn),
    "setup": msgspec.json.Decoder(type=RoundSetupIn),
    "roundchat": msgspec.json.Decoder(type=RoundChatIn),
    "bugroundchat": msgspec.json.Decoder(type=BugRoundChatIn),
}
