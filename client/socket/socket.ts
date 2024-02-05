/**
 * WebsocketHeartbeatJs constructor.
 *
 * @param url
 * @param pingTimeout
 * @param pongTimeout
 * @param reconnectTimeout
 * @param pingMsg
 *
 */

export type SocketOpts =  {
          url: string
          protocols?: string | string[]
          pingTimeout?: number
          pongTimeout?: number
          reconnectTimeout: number
          pingMsg?: any
          repeatLimit?: number | null
        };

export class WebsocketHeartbeatJs {

    ws: WebSocket;
    opts: SocketOpts;
    repeat: number

    onclose : (event: CloseEvent) => void;
    onerror : (event: Event) => void;
    onopen : (event: Event) => void;
    onmessage : (event: MessageEvent) =>  void;
    onreconnect : () => void;

    constructor( opts: SocketOpts /*url: string,
                 protocols = '',
                 pingTimeout = 15000,
                 pongTimeout = 10000,
                 reconnectTimeout = 2000,
                 pingMsg = 'heartbeat',
                 repeatLimit = null*/) {
        this.opts = {
            url: opts.url,
            protocols: opts.protocols || undefined,
            pingTimeout: opts.pingTimeout || 15000,
            pongTimeout: opts.pongTimeout || 10000,
            reconnectTimeout: opts.reconnectTimeout || 2000,
            pingMsg: opts.pingMsg || 'heartbeat',
            repeatLimit: opts.repeatLimit || null
        };
        this.repeat = 0;

        this.createWebSocket();
    }

    createWebSocket = function () {
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
            this.onclose(e);
            this.reconnect();
        };
        this.ws.onerror = (e: Event) => {
            this.onerror(e);
            this.reconnect();
        };
        this.ws.onopen = (e: Event) => {
            this.repeat = 0;
            this.onopen(e);
            this.heartCheck();
        };
        this.ws.onmessage = (event: MessageEvent) => {
            this.onmessage(event);
            this.heartCheck();
        };
    };

    reconnect = function () {
        if (this.opts.repeatLimit !== null && this.opts.repeatLimit <= this.repeat) return;//limit repeat the number
        if (this.lockReconnect || this.forbidReconnect) return;
        this.lockReconnect = true;
        this.repeat++;
        this.onreconnect();
        setTimeout(() => {
            this.createWebSocket();
            this.lockReconnect = false;
        }, this.opts.reconnectTimeout);
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
                this.ws.close();
            }, this.opts.pongTimeout);
        }, this.opts.pingTimeout);
    };


    heartReset = function () {
        clearTimeout(this.pingTimeoutId);
        clearTimeout(this.pongTimeoutId);
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