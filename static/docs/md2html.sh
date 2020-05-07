#!/bin/sh

export PATH="../../node_modules/.bin/:$PATH"

for f in *.md; do
showdown makehtml -i "$f" -o "$(basename -- "$f" .md).html" --flavor github
done

showdown makehtml -i "hu/intro.md" -o "intro.hu.html" --flavor github

SRC='https://github.com/gbtami/pychess-variants/blob/master'; 
DST='https://www.pychess.org';
find . -type f -name "*.html" -exec sed -i 's,'"$SRC"','"$DST"',' {} \;

mv -t ../../templates *.html
