import logging

from logger import DEFAULT_LOGGING_CONFIG

log = logging.getLogger(__name__)


def init_test_logger():
    # for now, putting the same DEFAULT_LOGGING_CONFIG as for the app,
    # but can be changed if useful to have a separate one
    # for unit tests
    logging.config.dictConfig(DEFAULT_LOGGING_CONFIG)
    log.info("Logging initialized with test config")
