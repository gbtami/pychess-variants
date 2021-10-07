from typing import NewType, Optional, Union
from server.fairy import FairyBoard
from tournament import ByeGame, Tournament, GameData, PlayerData
from aiohttp.web_response import Response, StreamResponse
from game import Game
import json
import time


NullType = NewType("NullType", None)
PlayerDataType = NewType("PlayerDataType", PlayerData)
TournamentType = NewType("TournamentType", Tournament)
GameDataType = NewType("GameDataType", Tournament)
GameType = NewType("GameType", Game)
ByeGameType = NewType("ByeGameType", ByeGame)
Time = NewType("TimeType", time.time())
JsonType = NewType("JsonWebType", StreamResponse)
ResponseType = NewType("ResponseType", StreamResponse)
FairyBoardType = NewType("FairyBoardType", FairyBoard)
