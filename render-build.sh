#!/usr/bin/env bash
set -e # exit on error

pip3 install .
yarn install
yarn dev
yarn md
