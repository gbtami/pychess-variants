#!/bin/sh

PO2JSON="../node_modules/gettext.js/bin/po2json"

for lang in */; do
mkdir -p ../static/lang/"$lang"/LC_MESSAGES
node --no-deprecation "$PO2JSON" "$lang"/LC_MESSAGES/client.po ../static/lang/"$lang"LC_MESSAGES/client.json -p
done
