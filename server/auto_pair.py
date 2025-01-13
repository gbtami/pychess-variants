from itertools import product
from random import random

from variants import BYOS
from misc import time_control_str
from newid import new_id
from seek import Seek
from utils import join_seek
from websocket_utils import ws_send_json


def add_to_auto_pairings(app_state, user, data):
    """Add auto pairing to app_state and while doing this
    tries to find a compatible other auto pairing or seek"""

    added = False
    auto_variant_tc = None
    matching_user = None
    matching_seek = None

    rrmin = data["rrmin"]
    rrmax = data["rrmax"]
    rrmin = rrmin if (rrmin != -1000) else -10000
    rrmax = rrmax if (rrmax != 1000) else 10000

    app_state.auto_pairing_users[user] = (rrmin, rrmax)
    user.ready_for_auto_pairing = True

    for variant_tc in product(sorted(data["variants"], key=lambda _: random()), data["tcs"]):
        variant_tc = (
            variant_tc[0][0],
            variant_tc[0][1],
            variant_tc[1][0],
            variant_tc[1][1],
            variant_tc[1][2],
        )
        variant, chess960, base, inc, byoyomi_period = variant_tc

        # We don't want to create unsupported variant-TC combinations
        if (
            (byoyomi_period > 0 and variant not in BYOS)
            or (byoyomi_period == 0 and variant in BYOS)
            or variant.startswith("bug")
        ):
            continue

        if variant_tc not in app_state.auto_pairings:
            app_state.auto_pairings[variant_tc] = set()

        app_state.auto_pairings[variant_tc].add(user)
        added = True

        if (matching_user is None) and (matching_seek is None):
            # Try to find the same combo in auto_pairings
            matching_user = find_matching_user(app_state, user, variant_tc)
            auto_variant_tc = variant_tc

        if (matching_user is None) and (matching_seek is None):
            # Maybe there is a matching normal seek
            matching_seek = find_matching_seek(app_state, user, variant_tc)
            auto_variant_tc = variant_tc

    if not added:
        del app_state.auto_pairing_users[user]
        user.ready_for_auto_pairing = False

    return auto_variant_tc, matching_user, matching_seek


async def auto_pair(app_state, user, auto_variant_tc, other_user=None, matching_seek=None):
    """If matching_seek is not None accept it, else create a new one and accpt it by other_user"""

    variant, chess960, base, inc, byoyomi_period = auto_variant_tc
    if matching_seek is None:
        seek_id = await new_id(None if app_state.db is None else app_state.db.seek)
        seek = Seek(
            seek_id,
            other_user,
            variant,
            base=base,
            inc=inc,
            byoyomi_period=byoyomi_period,
            player1=other_user,
            rated=True,
            chess960=chess960,
        )
    else:
        other_user = matching_seek.creator
        seek = matching_seek
        if len(other_user.lobby_sockets) == 0:
            return False

    # remove them from auto_pairings
    user.remove_from_auto_pairings()
    other_user.remove_from_auto_pairings()

    # create game
    response = await join_seek(app_state, user, seek)

    for user_ws in user.lobby_sockets:
        await ws_send_json(user_ws, response)

    for other_user_ws in other_user.lobby_sockets:
        await ws_send_json(other_user_ws, response)

    tc = time_control_str(base, inc, byoyomi_period)
    tail960 = "960" if chess960 else ""
    msg = "**AUTO PAIR** %s - %s **%s%s** %s" % (
        user.username,
        other_user.username,
        variant,
        tail960,
        tc,
    )
    await app_state.discord.send_to_discord("accept_seek", msg)

    return True


def find_matching_user(app_state, user, variant_tc):
    """Return first compatible user from app_state.auto_pairing_users if there is any, else None"""

    variant, chess960, _, _, _ = variant_tc
    return next(
        (
            user_candidate
            for user_candidate in (
                auto_pairing_user
                for auto_pairing_user in app_state.auto_pairings[variant_tc]
                if auto_pairing_user in app_state.auto_pairing_users
                and auto_pairing_user != user
                and user.ready_for_auto_pairing
                and auto_pairing_user.ready_for_auto_pairing
            )
            if user.auto_compatible_with_other_user(user_candidate, variant, chess960)
        ),
        None,
    )


def find_matching_seek(app_state, user, variant_tc):
    """Return first compatible seek from app_state.seeks if there is any, else None"""

    variant, chess960, base, inc, byoyomi_period = variant_tc
    return next(
        (
            seek_candidate
            for seek_candidate in (
                seek
                for seek in app_state.seeks.values()
                if seek.day == 0
                and seek.variant == variant
                and seek.chess960 == chess960
                and seek.rated
                and seek.base == base
                and seek.inc == inc
                and seek.byoyomi_period == byoyomi_period
                and seek.color == "r"
                and seek.fen == ""
                and user != seek.creator
            )
            if user.auto_compatible_with_seek(seek_candidate)
        ),
        None,
    )


def find_matching_user_for_seek(app_state, seek, variant_tc):
    """Return first compatible user from app_state.auto_pairing_users if there is any, else None"""

    return next(
        (
            user_candidate
            for user_candidate in (
                auto_pairing_user
                for auto_pairing_user in app_state.auto_pairings[variant_tc]
                if auto_pairing_user in app_state.auto_pairing_users
                and auto_pairing_user.ready_for_auto_pairing
                and auto_pairing_user != seek.creator
            )
            if user_candidate.auto_compatible_with_seek(seek)
        ),
        None,
    )
