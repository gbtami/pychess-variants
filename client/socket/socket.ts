/**
 * WebsocketHeartbeatJs class adapted to TypeScript from https://github.com/zimv/websocket-heartbeat-js.
 * Only added (similar to lichess's, but slightly more sophisticated) logic for showing/hiding connection notifications.
 * TODO: compare to the similar lichess class here: https://github.com/lichess-org/lila/blob/master/ui/site/src/socket.ts
 *       general ping/reconnect approach is the same, but there are some differences, not sure how important yet.
 *       consider also adopting the other logic for queueing messages, etc.
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
    toggleSocketCssOnOpen, toggleSocketCssOnPongTimeout,
    toggleSocketCssOnReconnect
} from "@/socket/webSocketUtils";

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
    lockReconnect: boolean = false;
    forbidReconnect: boolean = false;

    onclose : (event: CloseEvent) => void;
    onerror : (event: Event) => void;
    onopen : (event: Event) => void;
    onmessage : (event: MessageEvent) =>  void;
    onreconnect : () => void;

    constructor( opts: SocketOpts) {
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
            console.log("this.ws.onclose() " + e.code + " " + e.reason + " " + e.wasClean);
            if (e.code !== 1000 || !e.wasClean) {
                toggleSocketCssOnClose();
            } else {
                // happens on navigation between pages for example - we dont want the popup when normal close like that
                console.debug("this.ws.onclose() - clean close");
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

    reconnect = function () {
        // todo: lichess calls clearTimeout-s here (the stuff in heartReset() in our code), we don't,
        //       i guess in our case lockReconnect prevents for second reconnect getting triggered, but lichess approach
        //       seems simpler/cleaner to me
        console.log("reconnect() " + this.opts.repeatLimit + " " + this.repeat + " " + this.lockReconnect + " " + this.forbidReconnect);
        if (this.opts.repeatLimit !== null && this.opts.repeatLimit <= this.repeat) return;//limit repeat the number
        if (this.lockReconnect || this.forbidReconnect) return;
        this.lockReconnect = true;
        this.repeat++;
        toggleSocketCssOnReconnect(this.opts.reconnectTimeout);
        this.onreconnect();
        setTimeout(() => {
            console.log("Setting timeout to createWebSocket() in "+this.opts.reconnectTimeout+" ms");
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
                toggleSocketCssOnPongTimeout();
                this.ws.close(); // todo: I am not sure if closing is good. If we postpone closing right before
                                 //       reconnect we give it more time to have a chance to recover -
                                 //       maybe test like that as well
            }, this.opts.pongTimeout);
        }, this.opts.pingTimeout);
    };


    heartReset = function () {
        clearTimeout(this.pingTimeoutId);
        clearTimeout(this.pongTimeoutId);
        // todo: here lichess has also a disconnect call and usets this.ws. see method destroy()
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