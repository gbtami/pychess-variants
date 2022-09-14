import WebsocketHeartbeatJs from 'websocket-heartbeat-js';

export function newWebsocket(target:string) {
    const ws = (location.protocol.indexOf('https') > -1) ? 'wss' : 'ws';
    const options = {
        url: `${ws}://${location.host}/${target}`,
        pingTimeout: 2500, 
        pongTimeout: 9000, 
        reconnectTimeout: 3500,
        pingMsg: "/n"
    }
    const socket = new WebsocketHeartbeatJs(options);
    window.addEventListener('beforeunload', () => socket.close());
    return socket;
}
