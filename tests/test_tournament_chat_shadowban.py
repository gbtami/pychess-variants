import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from const import ARENA
from tournament.wst import (
    TOURNAMENT_LIFECYCLE_COMMANDS_RETIRED_MESSAGE,
    handle_abort_tournament,
    handle_lobbychat,
    handle_start_next_round,
)


class TournamentChatShadowbanTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_creator_can_start_a_pending_manual_round(self) -> None:
        tournament = SimpleNamespace(
            creator="creator", start_next_round_now=AsyncMock(return_value=True)
        )
        app_state = SimpleNamespace()
        creator = SimpleNamespace(username="creator")
        ws = object()

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.is_tournament_director", return_value=False),
            patch("tournament.wst.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_start_next_round(
                app_state,
                ws,
                creator,
                {"type": "start_next_round", "tournamentId": "tid"},
            )

        tournament.start_next_round_now.assert_awaited_once_with()
        send.assert_not_awaited()

    async def test_non_controller_cannot_start_a_round(self) -> None:
        tournament = SimpleNamespace(creator="creator", start_next_round_now=AsyncMock())
        app_state = SimpleNamespace()
        user = SimpleNamespace(username="spectator")
        ws = object()

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.is_tournament_director", return_value=False),
            patch("tournament.wst.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_start_next_round(
                app_state,
                ws,
                user,
                {"type": "start_next_round", "tournamentId": "tid"},
            )

        tournament.start_next_round_now.assert_not_awaited()
        send.assert_awaited_once_with(ws, {"type": "error", "message": "Permission denied"})

    async def test_director_can_abort_an_active_tournament(self) -> None:
        tournament = SimpleNamespace(creator="creator", status=1, abort=AsyncMock())
        app_state = SimpleNamespace()
        director = SimpleNamespace(username="director")
        ws = object()

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.is_tournament_director", return_value=True),
            patch("tournament.wst.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_abort_tournament(
                app_state,
                ws,
                director,
                {"type": "abort_tournament", "tournamentId": "tid"},
            )

        tournament.abort.assert_awaited_once_with()
        send.assert_not_awaited()

    async def test_creator_cannot_abort_without_director_permission(self) -> None:
        tournament = SimpleNamespace(
            creator="creator", system=ARENA, team_id=None, status=1, abort=AsyncMock()
        )
        app_state = SimpleNamespace()
        creator = SimpleNamespace(username="creator")
        ws = object()

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.is_tournament_director", return_value=False),
            patch("tournament.wst.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_abort_tournament(
                app_state,
                ws,
                creator,
                {"type": "abort_tournament", "tournamentId": "tid"},
            )

        tournament.abort.assert_not_awaited()
        send.assert_awaited_once_with(ws, {"type": "error", "message": "Permission denied"})

    async def test_retired_lifecycle_command_is_not_posted_to_tournament_chat(self) -> None:
        ws = object()
        tournament = SimpleNamespace(
            creator="creator", tourney_chat_save=AsyncMock(), broadcast=AsyncMock()
        )
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            tourneychat={"tid": []},
        )
        director = SimpleNamespace(
            username="director",
            anon=False,
            silence=0,
            shadowban=False,
            tournament_sockets={"tid": {ws}},
        )

        with (
            patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.wst.is_tournament_director", return_value=True),
            patch("tournament.wst.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_lobbychat(
                app_state,
                director,
                {"type": "lobbychat", "tournamentId": "tid", "message": "/abort"},
            )

        send.assert_awaited_once_with(
            ws,
            {"type": "error", "message": TOURNAMENT_LIFECYCLE_COMMANDS_RETIRED_MESSAGE},
        )
        tournament.tourney_chat_save.assert_not_awaited()
        tournament.broadcast.assert_not_awaited()

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
