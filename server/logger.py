import logging

from log4mongo.handlers import MongoHandler
from settings import MONGO_HOST

FORMAT = "%(asctime)s.%(msecs)03d [%(levelname)s] %(name)s:%(lineno)d %(message)s"
DATEFMT = "%z %Y-%m-%d %H:%M:%S"
logging.basicConfig(format=FORMAT, datefmt=DATEFMT)

log = logging.getLogger()

handler = MongoHandler(host=MONGO_HOST, capped=True)
handler.setLevel(logging.CRITICAL)

log.addHandler(handler)
