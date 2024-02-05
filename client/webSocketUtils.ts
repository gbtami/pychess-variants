import { WebsocketHeartbeatJs } from './socket/socket';
import {newWebsocket} from "@/socket";

export function createWebsocket(target: string,
                                onOpen: () => void,
                                onReconnect: () => void,
                                onClose: () => void,
                                onMessage: (e: MessageEvent) => void): WebsocketHeartbeatJs {


    const sock = newWebsocket(target);
    sock.onopen = () => {
        console.log('onOpen');
        const cl = document.body.classList; // removing the "reconnecting" message in lower left corner
        cl.remove('offline-close');
        cl.remove('offline-ping-timeout');
        cl.remove('offline-creating-socket');
        cl.add('reconnected');
        cl.add('online');
        onOpen();
    };
    sock.onreconnect = () => {
        console.log('onReconnect');
        // document.body.classList.add('reconnected'); // this will trigger the animation once we get "online" class added back on reconnect
        onReconnect();
    };
    sock.onclose = () => {
        console.log('onClose');
        onClose();
    };
    sock.onerror = (e) => { // one scenario this gets called is when reconnect fails because we are still offline
        console.error("onError", e);
        document.body.classList.remove('offline-creating-socket');
        document.body.classList.remove('online');
        document.body.classList.add('offline-socket-error');//todo:niki: can we have error but still an ok connection - are we really "offline" if we get error?
        // document.getElementById("reconnecting-ts")!.setAttribute("timestamp", new Date(new Date().getTime() + sock.opts.reconnectTimeout).toISOString());
    };
    sock.onmessage = onMessage;

    //
    const f = sock.ws.onclose!.bind(sock.ws);
    sock.ws.onclose = (e: any) => { console.log("onclose1"); f(e); console.log("onclose2");}
    //
    const f1 = sock.ws.close.bind(sock.ws); //todo:niki:mainly for debug purposes to understand howit works for now. could put logic for the red popup here eventually, because at least when browser trottle is set to offline it never triggers onclose until actually disable trottle back - not sure if same in normal disconnect
    sock.ws.close = () => {
        console.log("close() 1");
        document.body.classList.add('offline-ping-timeout');
        document.body.classList.remove('online');
        // document.body.classList.add('offline-close'); todo:niki: how to differentiate when close was called because of timeout and when from receiving/doing close
        // document.getElementById("reconnecting-ts")!.setAttribute("timestamp", new Date(new Date().getTime() + sock.opts.reconnectTimeout).toISOString());
        f1();
        console.log("close() 2");
    };
    //
    const f2 = sock.reconnect.bind(sock);
    sock.reconnect = () => {
        console.log("reconnect() 1");
        document.body.classList.add('offline-reconnecting-in');
        document.getElementById("reconnecting-ts")!.setAttribute("timestamp", new Date(new Date().getTime() + sock.opts.reconnectTimeout).toISOString());
        document.body.classList.remove('offline-ping-timeout');
        document.body.classList.remove('online');
        document.body.classList.remove('offline-socket-error');
        document.body.classList.remove('offline-creating-socket');
        document.body.classList.remove('offline-close');
        f2();
        console.log("reconnect() 2");
    };
    //
    const f3 = sock.createWebSocket.bind(sock);
    sock.createWebSocket = () => {
        console.log("createWebSocket() 1");
        document.getElementById("reconnecting-ts")!.setAttribute("timestamp", "");
        document.body.classList.remove('offline-creating-socket');
        document.body.classList.remove('offline-reconnecting-in');
        document.body.classList.remove('online');
        document.body.classList.remove('offline-ping-timeout');
        document.body.classList.remove('offline-socket-error');
        document.body.classList.remove('offline-close');
        document.body.classList.add('offline-creating-socket');
        f3();
        console.log("createWebSocket() 2");
    };
    //sock.forbidReconnect = false;
    return sock;
}