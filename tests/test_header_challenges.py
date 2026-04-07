import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

import test_logger

from glicko2.glicko2 import new_default_perf_map
from header_challenges import get_user_challenges, set_direct_challenge_status
from seek import (
    DIRECT_CHALLENGE_ACCEPTED,
    DIRECT_CHALLENGE_CANCELED,
    DIRECT_CHALLENGE_CREATED,
    DIRECT_CHALLENGE_DECLINED,
    DIRECT_CHALLENGE_OFFLINE,
    Seek,
    create_seek,
    get_seeks,
)
from user import User
from variants import VARIANTS

test_logger.init_test_logger()

PERFS = new_default_perf_map(VARIANTS)


class HeaderChallengeTestCase(unittest.IsolatedAsyncioTestCase):
    def make_app_state(self):
        return SimpleNamespace(
            users={},
            seeks={},
            invites={},
            db=None,
            lobby=SimpleNamespace(lobby_broadcast_seeks=AsyncMock()),
            anon_as_test_users=False,
        )

    async def test_direct_challenge_seek_has_expiry_and_is_not_marked_pending(self):
        app_state = self.make_app_state()
        challenger = User(app_state, username="alice", perfs=PERFS)
        target = User(app_state, username="bob", perfs=PERFS)
        app_state.users[challenger.username] = challenger
        app_state.users[target.username] = target

        seek = Seek("seek1", challenger, "chess", target=target.username)
        app_state.seeks[seek.id] = seek
        challenger.seeks[seek.id] = seek

        await challenger.update_seeks(pending=True)

        self.assertTrue(seek.is_direct_challenge)
        self.assertIsNotNone(seek.expire_at)
        self.assertFalse(seek.pending)

    async def test_get_user_challenges_separates_incoming_and_outgoing(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        carol = User(app_state, username="carol", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob, carol.username: carol})

        outgoing = Seek("seek1", bob, "chess", target=alice.username)
        incoming = Seek("seek2", carol, "atomic", target=bob.username)
        app_state.seeks[outgoing.id] = outgoing
        app_state.seeks[incoming.id] = incoming

        bob_challenges = get_user_challenges(app_state, bob.username)

        self.assertEqual([challenge["id"] for challenge in bob_challenges], ["seek2", "seek1"])
        self.assertTrue(bob_challenges[0]["incoming"])
        self.assertFalse(bob_challenges[1]["incoming"])
        self.assertEqual(bob_challenges[0]["opponent"], "carol")
        self.assertEqual(bob_challenges[1]["opponent"], "alice")

    async def test_get_user_challenges_keeps_terminal_direct_challenge_status(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob})

        seek = Seek("seek1", alice, "chess", target=bob.username)
        set_direct_challenge_status(seek, DIRECT_CHALLENGE_DECLINED)
        app_state.seeks[seek.id] = seek

        bob_challenges = get_user_challenges(app_state, bob.username)

        self.assertEqual([], bob_challenges)

    async def test_get_user_challenges_keeps_declined_status_for_challenger(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob})

        seek = Seek("seek1", alice, "chess", target=bob.username)
        seek.set_challenge_decline_reason("This time control is too fast for me.")
        set_direct_challenge_status(seek, DIRECT_CHALLENGE_DECLINED)
        app_state.seeks[seek.id] = seek

        alice_challenges = get_user_challenges(app_state, alice.username)

        self.assertEqual(1, len(alice_challenges))
        self.assertEqual(DIRECT_CHALLENGE_DECLINED, alice_challenges[0]["status"])
        self.assertEqual(
            "This time control is too fast for me.", alice_challenges[0]["declineReason"]
        )

    async def test_get_user_challenges_filters_canceled_direct_challenges(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob})

        seek = Seek("seek-canceled", alice, "chess", target=bob.username)
        set_direct_challenge_status(seek, DIRECT_CHALLENGE_CANCELED)
        app_state.seeks[seek.id] = seek

        bob_challenges = get_user_challenges(app_state, bob.username)
        alice_challenges = get_user_challenges(app_state, alice.username)

        self.assertEqual([], bob_challenges)
        self.assertEqual([], alice_challenges)

    async def test_get_user_challenges_keeps_accepted_direct_challenge_status(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob})

        seek = Seek("seek-accepted", alice, "chess", target=bob.username)
        set_direct_challenge_status(seek, DIRECT_CHALLENGE_ACCEPTED)
        app_state.seeks[seek.id] = seek

        bob_challenges = get_user_challenges(app_state, bob.username)

        self.assertEqual(1, len(bob_challenges))
        self.assertEqual(DIRECT_CHALLENGE_ACCEPTED, bob_challenges[0]["status"])

    async def test_get_seeks_filters_terminal_direct_challenges_from_lobby(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob})

        active = Seek("seek-active", alice, "chess", target=bob.username)
        inactive = Seek("seek-offline", alice, "chess", target=bob.username)
        canceled = Seek("seek-canceled", alice, "chess", target=bob.username)
        set_direct_challenge_status(inactive, DIRECT_CHALLENGE_OFFLINE)
        set_direct_challenge_status(canceled, DIRECT_CHALLENGE_CANCELED)
        app_state.seeks.update({active.id: active, inactive.id: inactive, canceled.id: canceled})

        lobby_seeks = get_seeks(bob, app_state.seeks.values())

        self.assertEqual(["seek-active", "seek-offline"], [seek["_id"] for seek in lobby_seeks])

    async def test_get_seeks_filters_accepted_direct_challenges_from_lobby(self):
        app_state = self.make_app_state()
        alice = User(app_state, username="alice", perfs=PERFS)
        bob = User(app_state, username="bob", perfs=PERFS)
        app_state.users.update({alice.username: alice, bob.username: bob})

        accepted = Seek("seek-accepted", alice, "chess", target=bob.username)
        set_direct_challenge_status(accepted, DIRECT_CHALLENGE_ACCEPTED)
        app_state.seeks[accepted.id] = accepted

        lobby_seeks = get_seeks(bob, app_state.seeks.values())

        self.assertEqual([], lobby_seeks)

    async def test_clear_seeks_preserves_direct_challenge(self):
        app_state = self.make_app_state()
        challenger = User(app_state, username="alice", perfs=PERFS)
        target = User(app_state, username="bob", perfs=PERFS)
        app_state.users[challenger.username] = challenger
        app_state.users[target.username] = target

        seek = Seek("seek-preserve", challenger, "chess", target=target.username)
        app_state.seeks[seek.id] = seek
        challenger.seeks[seek.id] = seek

        await challenger.clear_seeks()

        self.assertIn(seek.id, app_state.seeks)
        self.assertIn(seek.id, challenger.seeks)

    async def test_create_seek_replaces_existing_direct_challenge_for_same_target(self):
        app_state = self.make_app_state()
        challenger = User(app_state, username="alice", perfs=PERFS)
        target = User(app_state, username="bob", perfs=PERFS)
        app_state.users[challenger.username] = challenger
        app_state.users[target.username] = target

        data = {
            "variant": "chess",
            "fen": "",
            "color": "r",
            "minutes": 5,
            "increment": 3,
            "byoyomiPeriod": 0,
            "rated": True,
            "chess960": False,
            "target": target.username,
        }

        first = await create_seek(
            app_state.db, app_state.invites, app_state.seeks, challenger, data
        )
        replacement = await create_seek(
            app_state.db, app_state.invites, app_state.seeks, challenger, data
        )

        self.assertIsNotNone(first)
        self.assertIsNotNone(replacement)
        self.assertEqual(2, len(app_state.seeks))
        self.assertEqual(DIRECT_CHALLENGE_CANCELED, first.challenge_status)
        self.assertEqual(DIRECT_CHALLENGE_CREATED, replacement.challenge_status)
        self.assertNotEqual(first.id, replacement.id)


if __name__ == "__main__":
    unittest.main(verbosity=2)
