from utils import User


class RandomMover:
    def __init__(self, users):
        self.bot_player = User(bot=True, username="Random-Mover")
        users["Random-Mover"] = self.bot_player

    async def bot(self, loop):
        # process "challenge", "gameStart", "gameEnd" events from event_queue
        while self.bot_player.online:
            answer = await self.bot_player.event_queue.get()
            print("BOT", answer)

    def start(self, loop):
        self.bot_task = loop.create_task(self.bot(loop))
