#!/bin/sh

showdown makehtml -i Variants-Guide.md -o Variants-Guide.html
showdown makehtml -i Makruk-Guide.md -o Makruk-Guide.html
showdown makehtml -i Sittuyin-Guide.md -o Sittuyin-Guide.html
showdown makehtml -i Shogi-Guide.md -o Shogi-Guide.html
showdown makehtml -i Xiangqi-Guide.md -o Xiangqi-Guide.html
showdown makehtml -i Shako-Guide.md -o Shako-Guide.html

SRC='https://github.com/gbtami/pychess-variants/blob/master'; 
DST='https://pychess-variants.herokuapp.com';
find . -type f -name "*.html" -exec sed -i 's,'"$SRC"','"$DST"',' {} \;

mv -t ../../templates *.html