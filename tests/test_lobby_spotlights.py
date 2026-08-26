from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from const import T_CREATED
from lobby_spotlights import lobby_spotlights, simul_spotlight


def _simul(*, live: bool = True, featurable: bool = True, age_minutes: int = 5):
    simul_id = "simul001"
    host = SimpleNamespace(simul_sockets={simul_id: {object()}} if live else {})
    return SimpleNamespace(
        id=simul_id,
        name="Featured host",
        variants=["chess", "makruk"],
        created_by="host",
        created_at=datetime.now(UTC) - timedelta(minutes=age_minutes),
        status=T_CREATED,
        featurable=featurable,
        players={"host": host, "accepted": object()},
        pending_players={"pending": object()},
        opponent_count=1,
    )


def _tournament(number: int):
    return SimpleNamespace(
        id=f"tour000{number}",
        name=f"Tournament {number}",
        variant="chess",
        chess960=False,
        nb_players=number,
        starts_at=datetime.now(UTC) + timedelta(minutes=number),
        status=T_CREATED,
        frequency=None,
    )


def _app_state(simul, tournaments=()):
    return SimpleNamespace(
        simuls={simul.id: simul},
        tournaments={tournament.id: tournament for tournament in tournaments},
        tourneynames={},
    )


def test_simul_spotlight_matches_lichess_created_live_host_policy():
    simul = _simul()
    item = simul_spotlight(_app_state(simul))

    assert item == {
        "kind": "simul",
        "sid": "simul001",
        "name": "Featured host",
        "variants": ["chess", "makruk"],
        "nbPlayers": 2,
    }

    assert simul_spotlight(_app_state(_simul(live=False))) is None
    assert simul_spotlight(_app_state(_simul(featurable=False))) is None
    assert simul_spotlight(_app_state(_simul(age_minutes=61))) is None


def test_simul_reserves_one_of_three_lobby_spotlight_slots():
    simul = _simul()
    tournaments = [_tournament(number) for number in range(1, 4)]

    items = lobby_spotlights(_app_state(simul, tournaments))

    assert [item["kind"] for item in items] == ["tournament", "tournament", "simul"]
    assert [item["tid"] for item in items[:2]] == ["tour0001", "tour0002"]


def test_three_tournaments_remain_when_simul_host_is_not_around():
    simul = _simul(live=False)
    tournaments = [_tournament(number) for number in range(1, 4)]

    items = lobby_spotlights(_app_state(simul, tournaments))

    assert [item["kind"] for item in items] == ["tournament", "tournament", "tournament"]
