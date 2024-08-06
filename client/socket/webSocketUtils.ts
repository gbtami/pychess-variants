import { WebsocketHeartbeatJs } from './socket';

export function newWebsocket(target: string) {
    const ws = (location.protocol.indexOf('https') > -1) ? 'wss' : 'ws';
    const options = {
        url: `${ws}://${location.host}/${target}`,
        pingTimeout: 2500/*2500*/,
        pongTimeout: 9000/*9000*/,
        reconnectTimeout: 4000/*3500*/,
        pingMsg: "/n"
    }
    const socket = new WebsocketHeartbeatJs(options);
    window.addEventListener('beforeunload', () => socket.close());
    return socket;
}

export function toggleSocketCssOnOpen() {
    console.log("toggleSocketCssOnOpen()");
    const wasOffline = clearSocketCss();
    if (wasOffline) { // dont trigger animation on first connect
        document.body.classList.add('reconnected');
    }
    document.body.classList.add('online');
}

export function toggleSocketCssOnError() {
    //todo: Not sure if server ws is closed with error flag when we have serverside error. Check serverside code and
    //      make sure error is communicated and also check if ws.onerror is how it is supposed ot be handled on client
    console.log("toggleSocketCssOnError()");
    clearSocketCss();
    document.body.classList.add('offline-socket-error');
}

export function toggleSocketCssOnReconnect(reconnectTimeoutMs: number) {
    console.log("toggleSocketCssOnReconnect()");
    clearSocketCss();
    document.body.classList.add('offline-reconnecting-in');
    document.getElementById("reconnecting-ts")!.setAttribute("timestamp", new Date(new Date().getTime() + reconnectTimeoutMs).toISOString());

}

export function toggleSocketCssOnCreateWebSocket() {
    console.log("toggleSocketCssOnCreateWebSocket()");
    const wasOffline = clearSocketCss();
    if (wasOffline) { // on first connect we dont do notification popups
        document.getElementById("reconnecting-ts")!.setAttribute("timestamp", "");
        document.body.classList.add('offline-creating-socket');
    }
}

export function toggleSocketCssOnClose() {
    console.log("toggleSocketCssOnClose()");
    if (document.body.classList.contains("offline-ping-timeout")) {
        console.log("toggleSocketCssOnClose() - offline-ping-timeout");
        return; // when close is called after ping timeout, we dont want to show offline-close
    }
    clearSocketCss();
    document.body.classList.add('offline-close');
}

export function toggleSocketCssOnPongTimeout() {
    console.log("toggleSocketCssOnPongTimeout()");
    clearSocketCss();
    document.body.classList.add('offline-ping-timeout');
}

function clearSocketCss(): boolean {
    const offlineClasses = ['offline-creating-socket',
                                     'offline-reconnecting-in',
                                     'offline-ping-timeout',
                                     'offline-socket-error',
                                     'offline-close'];
    document.body.classList.remove('online');
    document.body.classList.remove('reconnected');
    let wasOffline = false;
    for (const c in offlineClasses) {
        wasOffline = wasOffline || document.body.classList.contains(offlineClasses[c]);
        document.body.classList.remove(offlineClasses[c]);
    }
    return wasOffline;
}

export function createWebsocket(target: string,
                                onOpen: (event: Event) => void,
                                onReconnect: () => void,
                                onClose: (event: CloseEvent) => void,
                                onMessage: (e: MessageEvent) => void): WebsocketHeartbeatJs {


    const sock = newWebsocket(target);
    sock.onopen = onOpen;
    sock.onreconnect = onReconnect;
    sock.onclose = onClose;
    sock.onerror = (e) => {
        // one scenario this gets called is when reconnect fails because we are still offline
        console.error("onError", e);
    };
    sock.onmessage = onMessage;
    return sock;
}