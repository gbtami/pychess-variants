from const import DRAW, RATED, STARTED
from types import Game


async def draw(game, username, agreement=False):
    """Draw claim or draw offer"""
    if game.is_claimable_draw or agreement:
        result = "1/2-1/2"
        game.update_status(DRAW, result)
        await game.save_game()
        response = {
            "type": "gameEnd",
            "status": game.status,
            "result": game.result,
            "gameId": game.id,
            "pgn": game.pgn,
            "ct": game.crosstable,
            "rdiffs": {"brdiff": game.brdiff, "wrdiff": game.wrdiff}
            if game.status > STARTED and game.rated == RATED
            else "",
        }
    else:
        response = {
            "type": "draw_offer",
            "username": username,
            "message": "Pass" if game.variant == "janggi" else "Draw offer sent",
            "room": "player",
            "user": "",
        }
        game.messages.append(response)

    return response


async def reject_draw(game, opp_name):
    response = None

    if game.board.count_started <= 0:  # Don't send reject_draw message for Makruk BHC
        if opp_name in game.draw_offers:
            game.draw_offers.discard(opp_name)
            response = {"type": "draw_rejected", "message": "Draw offer rejected"}

    return response
