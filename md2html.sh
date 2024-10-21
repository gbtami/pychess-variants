#!/bin/sh

# Learn docs
cd static/docs
node ../../md2html.js

SRC='https://github.com/gbtami/pychess-variants/blob/master'; 
#DST='https://www.pychess.org';
DST='https://cdn.jsdelivr.net/gh/gbtami/pychess-variants\@1.10.40';
find . -type f -name "*.html" -exec perl -pi -e s,$SRC,$DST,g '{}' +

mkdir -p ../../templates/docs
mv *.html ../../templates/docs

# Blogs
cd ../blogs
node ../../md2html.js

find . -type f -name "*.html" -exec perl -pi -e s,$SRC,$DST,g '{}' +

mkdir -p ../../templates/blogs
mv *.html ../../templates/blogs
