import asyncio
import logging
import logging.config
import contextvars
from pymongo.asynchronous.database import AsyncDatabase

log = logging.getLogger(__name__)


DEFAULT_LOGGING_CONFIG = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'addPychessContextFilter': {
            '()': 'logger.AddPychessContextFilter'
        }
    },
    'formatters': {
        'standard': {
            'format': '%(asctime)s.%(msecs)03d [%(levelname)s] %(username)s %(gameId)s %(name)s:%(lineno)d %(message)s'
        },
    },
    'handlers': {
        'default': {
            'level': 'INFO',
            'formatter': 'standard',
            'class': 'logging.StreamHandler',
            'stream': 'ext://sys.stdout',  # Default is stderr
            'filters': ['addPychessContextFilter']
        },
    },
    'loggers': {
        # root logger
        '':                           { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        # frameworks:
        'asyncio':                    { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'pymongo':                    { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        # pychess modules:
        'wsr':                        { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'wsl':                        { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'websocket_utils':            { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'views.tournaments':          { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'views.invite':               { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'views':                      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'utils':                      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'users':                      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'user':                       { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'twitch':                     { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'tournament.tournament':      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'tournament.scheduler':       { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'tournament.auto_play_arena': { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'tournament.arena_new':       { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'server':                     { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'seek':                       { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'pychess_global_app_state':   { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'login':                      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'logger':                     { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'lichess_team_msg':           { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'generate_crosstable':        { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'game_api':                   { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'game':                       { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'fishnet':                    { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'fairy.fairy_board':          { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'clock':                      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bugchess.pgn':               { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bugchess.gaviota':           { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bugchess.engine':            { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bug.wsr_bug':                { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bug.utils_bug':              { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bug.import_bugh_game':       { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bug.game_bug':               { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'broadcast':                  { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'bot_api':                    { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'ai':                         { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'admin':                      { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        'export2pgn':                 { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False },
        # if __name__ == '__main__'
        '__main__':                   { 'handlers': ['default'], 'level': 'DEBUG', 'propagate': False }
    }
}
# additional logger context
log_context_data = contextvars.ContextVar('log_context_data', default=dict())

def set_log_context(varname, value):
    context_dict = log_context_data.get()
    context_dict[varname] = value

set_log_context("username", "system")
set_log_context("gameId", "init")

class AddPychessContextFilter(logging.Filter):
    """
    This is a filter which injects contextual information from `contextvars.ContextVar` (log_context_data) into the log.
    """
    def __init__(self):
        super().__init__()

    def filter(self, record):
        context_dict = log_context_data.get()
        # for a in self.attributes:
        setattr(record, "username", context_dict.get("username", 'none-user'))
        setattr(record, "gameId", context_dict.get("gameId", 'none-game'))
        return True
#~ additional logger context

# logging before initializing the Web App's event loop will use this,
# after that it will be re-initialized again with what is in the mongo db if any
def init_default_logger():
    logging.config.dictConfig(DEFAULT_LOGGING_CONFIG)
    log.info("Logging initialized with default config")

# periodic refresh of logging config from mongo:
async def start_config_refresh_timer(db: AsyncDatabase):
    async def periodic_refresh():
        last_logging_config = DEFAULT_LOGGING_CONFIG
        while True:
            logging_config = (await db.config.find_one({"name":"logging.config"}))
            if logging_config is None:
                log.warning("Missing logging config in db. Inserting default")
                await db.config.insert_one({
                    "name": "logging.config",
                    "value": DEFAULT_LOGGING_CONFIG})
            elif last_logging_config != logging_config["value"]:
                log.info("New logging config detected in db")
                last_logging_config = logging_config["value"]
                logging.config.dictConfig(logging_config["value"])
            await asyncio.sleep(60)
    if db:
        asyncio.create_task(periodic_refresh())
    else:
        logging.config.dictConfig(DEFAULT_LOGGING_CONFIG)
