#!/bin/sh

export PATH="../node_modules/gettext.js/bin/:$PATH"
#export PATH="../node_modules/po2json/bin/:$PATH"

for lang in */; do
mkdir -p ../static/lang/"$lang"/LC_MESSAGES
po2json "$lang"/LC_MESSAGES/client.po ../static/lang/"$lang"/LC_MESSAGES/client.json -p
done
