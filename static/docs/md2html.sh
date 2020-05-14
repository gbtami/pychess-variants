#!/bin/sh

export PATH="../../node_modules/.bin/:$PATH"

for f in *.md; do
showdown makehtml -i "$f" -o "$(basename -- "$f" .md).html" --flavor github
done

for f in hu/*.md; do
showdown makehtml -i "$f" -o "$(basename -- "$f" .md).hu.html" --flavor github
done

for f in pt/*.md; do
showdown makehtml -i "$f" -o "$(basename -- "$f" .md).pt.html" --flavor github
done

showdown makehtml -i "zh/intro.md" -o "intro.zh.html" --flavor github
showdown makehtml -i "fr/intro.md" -o "intro.fr.html" --flavor github

SRC='https://github.com/gbtami/pychess-variants/blob/master'; 
DST='https://www.pychess.org';
find . -type f -name "*.html" -exec sed -i 's,'"$SRC"','"$DST"',' {} \;

mv -t ../../templates *.html
