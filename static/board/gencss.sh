#!/bin/sh

family=$1
shift

mkdir -p "${family}"
for img in "$@"; do
    echo "creating ${family}/${img}.css..."
    echo \
".${family} .cg-wrap {
    background-image: url(../../images/board/${img});
}" \
    > "${family}/${img}.css"
done
