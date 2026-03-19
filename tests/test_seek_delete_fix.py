import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import test_logger

from wsl import handle_delete_seek

test_logger.init_test_logger()


class DeleteSeekTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_delete_seek_is_ignored(self) -> None:
        lobby = SimpleNamespace(lobby_broadcast_seeks=AsyncMock())
        creator = SimpleNamespace(seeks={})
        invite = object()
        seek = SimpleNamespace(id="seek-1", game_id="game-1", creator=creator)
        creator.seeks[seek.id] = seek
        app_state = SimpleNamespace(
            seeks={seek.id: seek}, invites={seek.game_id: invite}, lobby=lobby
        )

        with patch("wsl.log.error") as error:
            await handle_delete_seek(app_state, creator, {"seekID": seek.id})
            await handle_delete_seek(app_state, creator, {"seekID": seek.id})

        self.assertNotIn(seek.id, app_state.seeks)
        self.assertNotIn(seek.game_id, app_state.invites)
        self.assertNotIn(seek.id, creator.seeks)
        self.assertEqual(lobby.lobby_broadcast_seeks.await_count, 2)
        error.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
