#!/bin/sh

export PATH="../node_modules/gettext.js/bin/:$PATH"

for lang in */; do
po2json "$lang"/LC_MESSAGES/client.po ../static/lang/"$lang"/LC_MESSAGES/client.json -p
msgfmt "$lang"/LC_MESSAGES/server.po -o "$lang"/LC_MESSAGES/server.mo
done
