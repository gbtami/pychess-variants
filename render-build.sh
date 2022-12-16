#!/usr/bin/env bash
set -e # exit on error

pip3 install -r requirements.txt
yarn install
yarn dev
yarn md
