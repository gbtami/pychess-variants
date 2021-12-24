#!/bin/sh

# Learn docs
cd static/docs

export PATH="../../node_modules/.bin/:$PATH"

for f in *.md; do
	showdown makehtml -i "$f" -o "$(basename -- "$f" .md).html" --flavor github
	for lang in es hu it pt fr; do
		if [ -e "$lang/$f" ]; then
			showdown makehtml -i "$lang/$f" -o "$(basename -- "$f" .md).$lang.html" --flavor github
		else
			showdown makehtml -i "$f" -o "$(basename -- "$f" .md).$lang.html" --flavor github
		fi
	done
done


SRC='https://github.com/gbtami/pychess-variants/blob/master'; 
#DST='https://www.pychess.org';
DST='https://cdn.jsdelivr.net/gh/gbtami/pychess-variants\@1.6.70';
find . -type f -name "*.html" -exec perl -pi -e s,$SRC,$DST,g '{}' +

mkdir -p ../../templates/docs
mv *.html ../../templates/docs

# News
cd ../news

for f in *.md; do
showdown makehtml -i "$f" -o "$(basename -- "$f" .md).html" --flavor github
done

find . -type f -name "*.html" -exec perl -pi -e s,$SRC,$DST,g '{}' +

mkdir -p ../../templates/news
mv *.html ../../templates/news
