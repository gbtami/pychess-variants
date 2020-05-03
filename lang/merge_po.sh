#!/bin/sh

LANG=$1
msgmerge -o "$LANG"/LC_MESSAGES/client.po "$LANG"/LC_MESSAGES/client.po client.pot
msgmerge -o "$LANG"/LC_MESSAGES/server.po "$LANG"/LC_MESSAGES/server.po server.pot
