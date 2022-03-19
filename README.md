# [Liantichess](https://liantichess.herokuapp.com)

[![Nodejs-CI](https://github.com/SriMethan/Liantichess/actions/workflows/nodejs.yml/badge.svg)](https://github.com/SriMethan/Liantichess/actions/workflows/nodejs.yml)
[![Liantichess](https://img.shields.io/badge/Liantichess-%40players-blue.svg)](https://liantichess.herokuapp.com/players)

![Liantichess lobby](liantichess-lobby.png)

Liantichess is a free, open-source antichess variants server designed to play antichess and antichess variants.

All supported games on Liantichess can be seen [here](https://liantichess.herokuapp.com/variants)

For move generation, validation, analysis and engine play it uses
- [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish)
- [fairyfishnet](https://github.com/theyobots/fairyfishnet) fork of [fairyfishnet](https://github.com/gbtami/fairyfishnet)
- [lichess-bot-variants](https://github.com/gbtami/lichess-bot-variants) fork of [lichess-bot](https://github.com/careless25/lichess-bot)

On client side it is based on [chessgroundx](https://github.com/gbtami/chessgroundx) fork of [chessground](https://github.com/ornicar/chessground)

##

liantichess is a free server and it will remain free forever.

## Installation

### Prerequisites
* You need mongodb up and running. [Mongo daemon](https://docs.mongodb.com/manual/installation/)

```
pip3 install -r requirements.txt --user 
yarn install                            
yarn dev                                
yarn md                
python3 server/server.py
```

The Wiki describes [how to setup a development environment](https://github.com/SriMethan/Liantichess/wiki/Setting-up-a-Liantichess-Development-environment-locally).

## Supported browsers

| Name              | Version | Notes                                             |
| ----------------- | ------- | ------------------------------------------------- |
| Chromium / Chrome | last 10 | Full support                                      |
| Firefox           | 61+     | Full support (fastest local analysis since FF 79) |
| Edge              | 91+     | Full support (reasonable support for 17+)         |
| Opera             | 55+     | Reasonable support                                |
| Safari            | 11.1+   | Reasonable support                                |

Older browsers (including any version of Internet Explorer) will not work.
For your own sake, please upgrade. Security and performance, think about it!

## Credits

Credits to @gbtami for the main [code](https://github.com/gbtami/pychess-variants)