import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from tournament.wst import handle_lobbychat


class TournamentChatShadowbanTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_director_can_silence_user_in_tournament_chat(self) -> None:
        target = SimpleNamespace(set_silence=Mock())
        tournament = SimpleNamespace(
            creator="creator",
            tourneychat=[
                {"type": "lobbychat", "user": "target", "message": "spam"},
                {"type": "lobbychat", "user": "other", "message": "hello"},
            ],
            broadcast=AsyncMock(),
        )
        app_state = SimpleNamespace(users={"target": target})
        director = SimpleNamespace(username="director", anon=False, shadowban=False)

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.is_tournament_director", return_value=True),
        ):
            await handle_lobbychat(
                app_state,
                director,
                {"type": "lobbychat", "tournamentId": "tid", "message": "/silence target"},
            )

        target.set_silence.assert_called_once_with()
        self.assertEqual(["other", ""], [line["user"] for line in tournament.tourneychat])
        tournament.broadcast.assert_awaited_once_with(
            {"type": "fullchat", "lines": tournament.tourneychat}
        )

    async def test_shadowbanned_user_only_sees_own_tournament_chat_message(self) -> None:
        ws = object()
        tournament = SimpleNamespace(
            creator="creator",
            tourney_chat_save=AsyncMock(),
            broadcast=AsyncMock(),
        )
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            tourneychat={"tid": []},
        )
        user = SimpleNamespace(
            username="shadowed",
            anon=False,
            silence=0,
            shadowban=True,
            tournament_sockets={"tid": {ws}},
        )

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.ws_send_json", new=AsyncMock()) as send,
            patch("tournament.wst.is_tournament_director", return_value=False),
        ):
            await handle_lobbychat(
                app_state,
                user,
                {"type": "lobbychat", "tournamentId": "tid", "message": "hello arena"},
            )

        send.assert_awaited_once()
        sent_ws, sent_payload = send.await_args.args
        self.assertIs(ws, sent_ws)
        self.assertEqual("hello arena", sent_payload["message"])
        tournament.tourney_chat_save.assert_not_awaited()
        tournament.broadcast.assert_not_awaited()


if __name__ == "__main__":
    unittest.main(verbosity=2)
