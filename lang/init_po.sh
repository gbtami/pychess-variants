#!/bin/sh

LANG=$1
mkdir -p "$LANG"/LC_MESSAGES
msginit --no-translator -l "$LANG" -i client.pot -o "$LANG"/LC_MESSAGES/client.po
msginit --no-translator -l "$LANG" -i server.pot -o "$LANG"/LC_MESSAGES/server.po
