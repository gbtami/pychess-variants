#!/bin/sh

export MONGO_HOST="mongodb://127.0.0.1:27017"

python3 -X dev server/export2pgn.py
