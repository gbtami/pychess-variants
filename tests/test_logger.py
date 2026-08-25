import logging
import logging.config
import os
from copy import deepcopy

from logger import DEFAULT_LOGGING_CONFIG


def init_test_logger():
    """Configure quiet test logging, overridable for debugging.

    Production defaults are intentionally verbose, but emitting DEBUG logs from
    hundreds of short-lived aiohttp test apps adds substantial CI I/O overhead.
    Set PYCHESS_TEST_LOG_LEVEL=DEBUG when verbose logs are needed locally.
    """
    level = os.getenv("PYCHESS_TEST_LOG_LEVEL", "WARNING").upper()
    config = deepcopy(DEFAULT_LOGGING_CONFIG)
    config["handlers"]["default"]["level"] = level
    for logger_config in config["loggers"].values():
        logger_config["level"] = level
    logging.config.dictConfig(config)
