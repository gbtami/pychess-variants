import { WebsocketHeartbeatJs } from '../../socket/socket';
import { createWebsocket } from '@/socket/webSocketUtils';
import { JSONObject } from '../../types';
import { loadPendingMoves } from './pendingMoves';
import type { RoundControllerBughouse } from '../round/roundCtrl';

// Owns the round page's websocket connection: creating/reconnecting it and
// dispatching incoming messages to the RoundControllerBughouse's handlers.
export class RoundControllerBughouseSocket {
    sock: WebsocketHeartbeatJs;

    private ctrl: RoundControllerBughouse;

    constructor(ctrl: RoundControllerBughouse) {
        this.ctrl = ctrl;

        const onOpen = () => {
            try {
                const msgMovesAfterReconnect = loadPendingMoves(ctrl.gameId);
                console.log('resending unsent move messages ', msgMovesAfterReconnect);
                this.doSend(msgMovesAfterReconnect);
            } catch (e) {
                //TODO:NIKI:now we return false instead of exception
                console.log('could not even REsend unsent messages ', e);
            }
            this.setConnecting(false);
        };

        const onReconnect = () => {
            this.setConnecting(true);
            ctrl.setPresence(ctrl.username, false);
        };

        const onClose = () => {
            this.setConnecting(true);
        };

        // last so when it receive initial messages on connect all dom is ready to be updated
        this.sock = createWebsocket('wsr/' + ctrl.gameId, onOpen, onReconnect, onClose, (e: MessageEvent) =>
            this.onMessage(e),
        );
    }

    // the clocks grey out while the connection is down, so this tracks the socket's
    // own state rather than anything the game does
    private setConnecting(connecting: boolean): void {
        this.ctrl.seats.all.forEach(s => (s.clock!.connecting = connecting));
    }

    doSend = (message: JSONObject): boolean => {
        console.log('---> doSend():', message);
        if (this.sock.ws.readyState === WebSocket.OPEN) {
            try {
                this.sock.send(JSON.stringify(message));
                return true;
            } catch (e) {
                console.error('could not send message ', message, e);
                return false;
            }
        } else {
            console.warn('WebSocket is not open', this.sock.ws.readyState);
            return false;
        }
        //TODO:either here or in the socket code itself toggle error message on the red popup, maybe also reconnect
        // stuff, why else would we have an error if socket is ok - if internal server error still worth
        // reconnecting i guess or at least showing error makes user to refresh
    };

    protected onMessage(evt: MessageEvent) {
        console.log('<+++ onMessage():', evt.data);
        const ctrl = this.ctrl;
        if (evt.data === '/n') return;
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            // copy pated from gameCtl.ts->onMessage, which is otherwise inherited in normal roundCtrl
            case 'spectators':
                // this.onMsgSpectators(msg);
                break;
            case 'bugroundchat':
                ctrl.onMsgChat(msg);
                break;
            // case "fullchat":
            //     this.onMsgFullChat(msg);
            //     break;
            case 'game_not_found':
                // this.onMsgGameNotFound(msg);
                break;
            case 'shutdown':
                // this.onMsgShutdown(msg);
                break;
            case 'logout':
                // this.doSend({type: "logout"});
                break;
            // ~copy pated from gameCtl.ts->onMessage, which is otherwise inherited in normal roundCtrl
            case 'board':
                ctrl.onMsgBoard(msg);
                break;
            case 'gameEnd':
                ctrl.checkStatus(msg);
                this.doSend({ type: 'board', gameId: ctrl.gameId });
                break;
            case 'gameStart':
                ctrl.onMsgGameStart(msg);
                break;
            case 'game_user_connected':
                ctrl.onMsgUserConnected(msg);
                break;
            case 'user_present':
                ctrl.onMsgUserPresent(msg);
                break;
            case 'user_disconnected':
                ctrl.onMsgUserDisconnected(msg);
                break;
            case 'new_game':
                ctrl.onMsgNewGame(msg);
                break;
            case 'view_rematch':
                ctrl.onMsgViewRematch(msg);
                break;
            case 'draw_offer':
                ctrl.onMsgDrawOffer(msg);
                break;
            case 'draw_rejected':
                ctrl.onMsgDrawRejected(msg);
                break;
            case 'resign_offer':
                ctrl.onMsgResignOffer(msg);
                break;
            case 'resign_cancelled':
                ctrl.onMsgResignCancelled(msg);
                break;
            case 'rematch_offer':
                ctrl.onMsgRematchOffer(msg);
                break;
            case 'rematch_rejected':
                ctrl.onMsgRematchRejected(msg);
                break;
            case 'updateTV':
                ctrl.onMsgUpdateTV(msg);
                break;
            case 'setup':
                // this.onMsgSetup(msg);
                break;
            case 'berserk':
                // this.onMsgBerserk(msg);
                break;
        }
    }
}
