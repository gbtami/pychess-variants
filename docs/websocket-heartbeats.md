# WebSocket heartbeat and reconnect policy

This document records the WebSocket liveness decisions made after production
started showing periodic reconnects following the Python 3.14 and aiohttp
upgrade.

## Responsibilities

WebSocket liveness has two separate directions:

- The browser must notice when its connection to the server is silently dead
  and establish a replacement.
- The server must eventually remove a client connection that disappeared
  without completing a TCP or WebSocket close handshake.

Normal TCP resets and WebSocket close frames are detected immediately. The
timeouts below are fallbacks for half-open or blackholed connections.

## PyChess policy

The browser heartbeat remains configured in
`client/socket/webSocketUtils.ts`:

- Send the application-level `/n` ping after 2.5 seconds without an incoming
  message.
- Wait 9 seconds for any response before declaring the socket stale.
- Wait 4 seconds before reconnecting after an ordinary close or error.
- On pong timeout, replace the stale socket immediately. Do not wait for its
  close handshake or `onclose` event.

The server echoes `/n` from `server/websocket_utils.py` and uses a 30-second
`receive_timeout` to clean up silent clients. It does not configure aiohttp's
protocol-level `heartbeat`.

This means a silently dead server connection is normally detected by the
browser in approximately 9–11.5 seconds. A silently dead client connection is
removed by the server after approximately 30 seconds.

## Why aiohttp `heartbeat=3` was removed

For aiohttp's server-side `WebSocketResponse`, a heartbeat value of `N` sends a
WebSocket PING after about `N` seconds without incoming traffic and allows only
`N / 2` seconds for its PONG.

The previous configuration combined:

```python
WebSocketResponse(heartbeat=3.0, receive_timeout=10.0)
```

with a browser application ping after 2.5 seconds. The timers were close enough
to race under ordinary scheduling or network jitter. Once the three-second
protocol heartbeat fired, the browser had only about 1.5 seconds to return its
PONG. This was too aggressive for production and duplicated the existing
application heartbeat.

The aiohttp 3.14.2/3.14.3 compressed-frame regression is a separate issue. The
dependency remains pinned to 3.14.1 until aio-libs/aiohttp#12988 is fixed, but
the heartbeat policy should remain conservative after upgrading.

## Lichess comparison

The values and separation of responsibilities follow the current Lichess
design inspected on 2026-07-27:

- `lila/ui/lib/src/socket.ts` uses a 2.5-second ping delay, a 9-second pong
  timeout, and a 3.5-second ordinary reconnect delay.
- The browser reconnect timer directly replaces an unresponsive socket.
- `lila-ws/src/main/scala/LilaWs.scala` removes clients whose application ping
  is more than 30 seconds old. Its periodic sweep makes the practical cleanup
  window approximately 30–37 seconds.
- `lila/modules/round/src/main/RoundSocket.scala` separately gives bullet and
  faster games a 30-second gameplay disconnect timeout. Transport detection,
  online presence, and game adjudication are intentionally different clocks.
- Lichess sends a WebSocket protocol PING after a played move to measure trusted
  lag. That frame is not its recurring keepalive mechanism.

Reference revisions:

- lila: `10e211914c04964ae7ab6cb34f0aca2e9b45b24e`
- lila-ws: `5180f1be9bb1f97e2a4388617c6b890207a2af6a`

## Changing the intervals

Do not shorten these values solely because bullet games are short. The game
clock remains authoritative while the heartbeat handles transport recovery.
Very short timeouts turn transient event-loop stalls, mobile network changes,
browser throttling, and latency spikes into false reconnects.

When changing the policy, test at least:

- a clean close;
- an immediate connection refusal;
- a silent blackhole where neither close nor error fires;
- a delayed pong near the timeout;
- navigation or shutdown where reconnection is forbidden;
- a reconnect while a move is pending.
