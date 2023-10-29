from const import DRAW, RATED, STARTED, CORRESPONDENCE


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

        await save_draw_offer(game)

    return response


async def reject_draw(game):
    response = None

    if game.board.count_started <= 0:  # Don't send reject_draw message for Makruk BHC
        game.draw_offers.clear()
        response = {"type": "draw_rejected", "message": "Draw offer rejected"}

        await save_draw_offer(game)

    return response


async def save_draw_offer(game):
    if game.rated == CORRESPONDENCE and game.db is not None:
        await game.db.game.find_one_and_update(
            {"_id": game.id},
            {
                "$set": {
                    "wd": game.wplayer.username in game.draw_offers,
                    "bd": game.bplayer.username in game.draw_offers,
                }
            },
        )
