#!/usr/bin/env bash

cp pyproject.data.toml pyproject.toml
python3 -m build --wheel
git checkout pyproject.toml
