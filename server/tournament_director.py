from __future__ import annotations

from typing import TYPE_CHECKING

from const import TEST_PREFIX
import settings

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User


def is_tournament_director(user: User, app_state: PychessGlobalAppState) -> bool:
    if user.username in settings.TOURNAMENT_DIRECTORS:
        return True

    # Local/dev test users created via `server.py -a` should be able to exercise
    # tournament creation and management flows without environment changes.
    return (
        settings.DEV
        and app_state.anon_as_test_users
        and user.username.startswith(TEST_PREFIX)
    )
