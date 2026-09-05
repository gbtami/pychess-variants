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


class StudyMutationIn(WsInboundStruct):
    studyId: str
    chapterId: str
    clientOpId: str
    expectedRevision: int


class StudyAddNodeIn(StudyMutationIn):
    type: Literal["study_add_node"]
    parentPath: str
    move: str
    nodeId: str


class StudyDeleteNodeIn(StudyMutationIn):
    type: Literal["study_delete_node"]
    path: str


class StudyPromoteVariationIn(StudyMutationIn):
    type: Literal["study_promote_variation"]
    path: str
    toMainline: bool


class StudyForceVariationIn(StudyMutationIn):
    type: Literal["study_force_variation"]
    path: str
    force: bool


class StudySetShapesIn(StudyMutationIn):
    type: Literal["study_set_shapes"]
    path: str
    shapes: list[dict[str, object]]


class StudySetCommentIn(StudyMutationIn):
    type: Literal["study_set_comment"]
    path: str
    commentId: str
    text: str


class StudySetNagsIn(StudyMutationIn):
    type: Literal["study_set_nags"]
    path: str
    nags: list[int]


class StudyClearAnnotationsIn(StudyMutationIn):
    type: Literal["study_clear_annotations"]
    path: str


class StudySetDescriptionIn(StudyMutationIn):
    type: Literal["study_set_description"]
    description: str


class StudySetTagsIn(StudyMutationIn):
    type: Literal["study_set_tags"]
    tags: dict[str, str]


STUDY_TYPED_DECODERS: dict[str, msgspec.json.Decoder] = {
    "study_add_node": msgspec.json.Decoder(type=StudyAddNodeIn),
    "study_delete_node": msgspec.json.Decoder(type=StudyDeleteNodeIn),
    "study_promote_variation": msgspec.json.Decoder(type=StudyPromoteVariationIn),
    "study_force_variation": msgspec.json.Decoder(type=StudyForceVariationIn),
    "study_set_shapes": msgspec.json.Decoder(type=StudySetShapesIn),
    "study_set_comment": msgspec.json.Decoder(type=StudySetCommentIn),
    "study_set_nags": msgspec.json.Decoder(type=StudySetNagsIn),
    "study_clear_annotations": msgspec.json.Decoder(type=StudyClearAnnotationsIn),
    "study_set_description": msgspec.json.Decoder(type=StudySetDescriptionIn),
    "study_set_tags": msgspec.json.Decoder(type=StudySetTagsIn),
}
