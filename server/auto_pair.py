from newid import new_id
from seek import Seek
from utils import join_seek
from websocket_utils import ws_send_json


async def auto_pair(app_state, user, auto_variant_tc, other_user=None, matching_seek=None):
    """If matching_seek is not None accept it, else create a new one and accpt it by other_user"""
    if matching_seek is None:
        variant, chess960, base, inc, byoyomi_period = auto_variant_tc

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
                if seek.variant == variant
                and seek.chess960 == chess960
                and seek.rated
                and seek.base == base
                and seek.inc == inc
                and seek.byoyomi_period == byoyomi_period
                and seek.color == "r"
                and seek.fen == ""
            )
            if user.auto_compatible_with_seek(seek_candidate)
        ),
        None,
    )
