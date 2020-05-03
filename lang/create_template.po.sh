#!/bin/sh

pybabel extract -F babel_client.ini -o client.pot ../
pybabel extract -F babel_server.ini -o server.pot ../
