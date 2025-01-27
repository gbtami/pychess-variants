import logging

FORMAT = "%(asctime)s.%(msecs)03d [%(levelname)s] %(name)s:%(lineno)d %(message)s"
DATEFMT = "%z %Y-%m-%d %H:%M:%S"
logging.basicConfig(format=FORMAT, datefmt=DATEFMT)

log = logging.getLogger()
