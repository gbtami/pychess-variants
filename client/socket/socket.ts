/**
 * WebsocketHeartbeatJs class adapted to TypeScript from https://github.com/zimv/websocket-heartbeat-js.
 * Only added (similar to lichess's, but slightly more sophisticated) logic for showing/hiding connection notifications.
 * Heartbeat timing and direct replacement of stale sockets follow the Lichess
 * implementation in ui/lib/src/socket.ts.
 *
 * @param url
 * @param pingTimeout
 * @param pongTimeout
 * @param reconnectTimeout
 * @param pingMsg
 *
 */
import {
    toggleSocketCssOnClose,
    toggleSocketCssOnCreateWebSocket,
    toggleSocketCssOnError,
    toggleSocketCssOnOpen,
    toggleSocketCssOnPongTimeout,
    toggleSocketCssOnReconnect,
} from '@/socket/webSocketUtils';

export type SocketOpts = {
    url: string;
    protocols?: string | string[];
    pingTimeout?: number;
    pongTimeout?: number;
    reconnectTimeout: number;
    pingMsg?: any;
    repeatLimit?: number | null;
};

export class WebsocketHeartbeatJs {
    ws: WebSocket;
    opts: SocketOpts;
    repeat: number;
    lockReconnect: boolean = false;
    forbidReconnect: boolean = false;

    onclose: (event: CloseEvent) => void;
    onerror: (event: Event) => void;
    onopen: (event: Event) => void;
    onmessage: (event: MessageEvent) => void;
    onreconnect: () => void;

    constructor(opts: SocketOpts) {
        this.opts = {
            url: opts.url,
            protocols: opts.protocols || undefined,
            pingTimeout: opts.pingTimeout || 15000,
            pongTimeout: opts.pongTimeout || 10000,
            reconnectTimeout: opts.reconnectTimeout || 2000,
            pingMsg: opts.pingMsg || 'heartbeat',
            repeatLimit: opts.repeatLimit || null,
        };
        this.repeat = 0;
        this.onclose = () => {};
        this.onerror = () => {};
        this.onopen = () => {};
        this.onmessage = () => {};
        this.onreconnect = () => {};

        this.createWebSocket();
    }

    createWebSocket = function () {
        toggleSocketCssOnCreateWebSocket();
        try {
            if (this.opts.protocols) this.ws = new WebSocket(this.opts.url, this.opts.protocols);
            else this.ws = new WebSocket(this.opts.url);
            this.initEventHandle();
        } catch (e) {
            this.reconnect();
            throw e;
        }
    };

    initEventHandle = function () {
        this.ws.onclose = (e: CloseEvent) => {
            console.log('this.ws.onclose() ' + e.code + ' ' + e.reason + ' ' + e.wasClean);
            if (e.code !== 1000 || !e.wasClean) {
                toggleSocketCssOnClose();
            } else {
                // happens on navigation between pages for example - we dont want the popup when normal close like that
                console.debug('this.ws.onclose() - clean close');
            }
            this.onclose(e); // todo: lichess doesnt have customization for this event.
            //       we only have it for roundCtrl.bug.ts to make clocks blink and in roundCtrl it is
            //       even on onReconnect event and not on onClose
            this.reconnect();
        };
        this.ws.onerror = (e: Event) => {
            toggleSocketCssOnError();
            this.onerror(e);
            this.reconnect(); // todo: liches doesnt call (directly) reconnect (call scheduleConnect() there) in onerror
        };
        this.ws.onopen = (e: Event) => {
            this.repeat = 0;
            toggleSocketCssOnOpen();
            this.onopen(e);
            this.heartCheck();
        };
        this.ws.onmessage = (event: MessageEvent) => {
            this.onmessage(event);
            this.heartCheck();
        };
    };

    reconnect = function (delay = this.opts.reconnectTimeout) {
        console.log(
            'reconnect() ' +
                this.opts.repeatLimit +
                ' ' +
                this.repeat +
                ' ' +
                this.lockReconnect +
                ' ' +
                this.forbidReconnect,
        );
        if (this.opts.repeatLimit !== null && this.opts.repeatLimit <= this.repeat) return; //limit repeat the number
        if (this.lockReconnect || this.forbidReconnect) return;
        this.heartReset();
        this.lockReconnect = true;
        this.repeat++;
        toggleSocketCssOnReconnect(delay);
        this.onreconnect();
        setTimeout(() => {
            if (this.forbidReconnect) {
                this.lockReconnect = false;
                return;
            }
            console.log('Setting timeout to createWebSocket() in ' + delay + ' ms');
            this.disconnect();
            this.lockReconnect = false;
            try {
                this.createWebSocket();
            } catch {
                // createWebSocket schedules the next attempt before rethrowing.
            }
        }, delay);
    };

    send = function (msg: Parameters<WebSocket['send']>[0]) {
        this.ws.send(msg);
    };

    heartCheck = function () {
        this.heartReset();
        this.heartStart();
    };

    heartStart = function () {
        if (this.forbidReconnect) return;
        this.pingTimeoutId = setTimeout(() => {
            this.ws.send(typeof this.opts.pingMsg === 'function' ? this.opts.pingMsg() : this.opts.pingMsg);
            this.pongTimeoutId = setTimeout(() => {
                toggleSocketCssOnPongTimeout();
                // A blackholed socket can remain in CLOSING while waiting for a
                // close handshake. Replace it directly instead of relying on
                // onclose to begin recovery.
                this.reconnect(0);
            }, this.opts.pongTimeout);
        }, this.opts.pingTimeout);
    };

    heartReset = function () {
        clearTimeout(this.pingTimeoutId);
        clearTimeout(this.pongTimeoutId);
    };

    disconnect = function () {
        const ws = this.ws;
        ws.onclose = () => {};
        ws.onerror = () => {};
        ws.onopen = () => {};
        ws.onmessage = () => {};
        ws.close();
    };

    close = function () {
        this.forbidReconnect = true;
        this.heartReset();
        this.ws.close();
    };

    // if(typeof window != 'undefined')
    //     window.WebsocketHeartbeatJs = WebsocketHeartbeatJs;
    // export default WebsocketHeartbeatJs;
}
