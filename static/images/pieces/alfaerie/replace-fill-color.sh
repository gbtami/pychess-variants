#!/bin/sh

SRC='#f9f9f9'; 
DST='#5984bd';
find . -type f -name "*.svg" -exec perl -pi -e s,$SRC,$DST,g '{}' +
