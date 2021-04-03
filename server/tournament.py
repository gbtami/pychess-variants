import collections

from misc import time_control_str
from game import new_game_id

log = logging.getLogger(__name__)


class Tournament:

    def __init__(self, tournamentId, name, variant, fen="", base=5, inc=3, byoyomi_period=0, chess960=False, ws=None):
        self.id = tournamentId
        self.name = name
        self.variant = variant
        self.fen = fen
        self.base = base
        self.inc = inc
        self.byoyomi_period = byoyomi_period
        self.chess960 = chess960
        self.ws = ws

        self.messages = collections.deque([], 200)

        self.spectators = []
        self.participants = []
