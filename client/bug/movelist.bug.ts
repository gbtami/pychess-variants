import { h, VNode } from 'snabbdom';

import AnalysisControllerBughouse from './analysisCtrl.bug';
import { result } from '../result'
import { patch } from '../document';
import { RoundControllerBughouse } from "./roundCtrl.bug";
import { Step } from "../messages";

export function selectMove (ctrl: AnalysisControllerBughouse | RoundControllerBughouse, ply: number, plyVari = 0): void {
    let plyMax = ctrl.steps.length - 1;
    const vari = "plyVari" in ctrl ? ctrl.steps[ctrl.plyVari]['vari']: undefined;
    if (vari && ctrl.plyVari > 0) plyMax = ctrl.plyVari + vari.length - 1;

    if (ply < 0 || ply > plyMax) {
        return
    }

    if (plyVari > 0 && ply < plyVari) {
        // back to the main line
        plyVari = 0;
    }

    ctrl.goPly(ply, plyVari);
    if (plyVari === 0) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    } else {
        activatePlyVari(ply);
    }

}

function activatePly (ctrl: AnalysisControllerBughouse | RoundControllerBughouse ) {
    const active = document.querySelector('move-bug.active');
    if (active) {
        const p = active.getAttribute("ply");
        active.classList.remove('active');
        document.querySelectorAll('move-bug[_ply="'+p+'"]').forEach(v => v.setAttribute("style", "display: none;"));
    }

    const elPly = document.querySelector(`move-bug[ply="${ctrl.ply}"]`);
    if (elPly) elPly.classList.add('active');
    document.querySelectorAll('move-bug[_ply="'+ctrl.ply+'"]').forEach(v => v.setAttribute("style", "display: block;"));
}

function scrollToPly (ctrl: AnalysisControllerBughouse | RoundControllerBughouse) {
    if (ctrl.steps.length < 9) return;
    const movelistEl = document.getElementById('movelist') as HTMLElement;
    const plyEl = movelistEl.querySelector('move-bug.active') as HTMLElement | null;

    let st: number | undefined = undefined;

    if (ctrl.ply === 0) st = 0;
    else if (ctrl.ply === ctrl.steps.length - 1) st = 99999;
    else if (plyEl) st = plyEl.offsetTop - movelistEl.offsetHeight / 2 + plyEl.offsetHeight / 2;

    if (st !== undefined)
        movelistEl.scrollTop = st;
}

export function activatePlyVari (ply: number) {
    console.log('activatePlyVari()', ply);
    const active = document.querySelector('vari-move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`vari-move[ply="${ply}"]`);
    if (elPly) elPly.classList.add('active');
}

export function createMovelistButtons (ctrl: AnalysisControllerBughouse | RoundControllerBughouse ) {
    const container = document.getElementById('move-controls') as HTMLElement;
    let buttons = [
        h('button', { on: { click: () => ctrl.flipBoards() } }, [ h('i.icon.icon-refresh') ]),
        h('button', { on: { click: () => ctrl.switchBoards() } }, [ h('i.icon.icon-exchange') ]),
        h('button', { on: { click: () => selectMove(ctrl, 0) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.ply - 1, ctrl.plyVari) } }, [ h('i.icon.icon-step-backward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.ply + 1, ctrl.plyVari) } }, [ h('i.icon.icon-step-forward') ]),
        h('button', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [ h('i.icon.icon-fast-forward') ]),
    ];
    ctrl.moveControls = patch(container, h('div#btn-controls-top.btn-controls', buttons));
}

function fillWithEmpty(moves: VNode[], countOfEmptyCellsToAdd: number, cls: string = '', ply: string = '', style: string = '') {
    for (let i = 0; i<countOfEmptyCellsToAdd;i++) {
        moves.push(h('move-bug.counter'+cls, {attrs: { _ply: ply, style: style }}));
        const el = h('move-bug'+cls, {attrs: { _ply: ply, style: style }});
        moves.push(el);
    }
}

export function updateMovelist (ctrl: AnalysisControllerBughouse | RoundControllerBughouse, full = true, activate = true, needResult = true) {
    const plyFrom = (full) ? 1 : ctrl.steps.length -1;
    if (plyFrom === 0) return; // that is the very initial message with single dummy step. No moves yet

    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];
    const prevPly = ctrl.steps[plyFrom-1];
    let lastColIdx = plyFrom ===1? 0: prevPly.boardName === 'a'? prevPly.turnColor === 'white'/*black made the move*/? 2: 1: prevPly.turnColor === 'white'/*black made the move*/? 4: 3;
    let plyA: number = 0;
    let plyB: number = 0;
    let didWeRenderVariSectionAfterLastMove = false;
    let didWeRenderChatSectionAfterLastMove = false;

    // in round mode we only call this for last move, so we need to reconstruct actual per-board ply from history
    for (let ply = 1; ply < plyFrom; ply++) {
        ctrl.steps[ply].boardName === 'a'? plyA++ : plyB++;
    }

    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = ctrl.steps[ply].san;
        if (move === null) continue;

        ctrl.steps[ply].boardName === 'a'? plyA++ : plyB++;

        const colIdx = ctrl.steps[ply].boardName === 'a'? ctrl.steps[ply].turnColor === 'black'/*meaning move was made by white and now black's turn*/? 1 : 2 : ctrl.steps[ply].turnColor === 'black'? 3 : 4 ;

        if (didWeRenderVariSectionAfterLastMove) {
            fillWithEmpty(moves, colIdx-1);
            didWeRenderVariSectionAfterLastMove=false;
        } else {
            const countOfEmptyCellsToAdd = colIdx > lastColIdx? colIdx - lastColIdx - 1: 4 + colIdx - lastColIdx - 1;
            fillWithEmpty(moves, countOfEmptyCellsToAdd);
        }

        if (didWeRenderChatSectionAfterLastMove) {
            // todo: this is really ugly solution for padding ply elems when chat div breaks the list
            //       and tbh the similar padding solution for variations is not best either - consider some
            //       other layout where these things can be done more natural, without all those dummy padding elements
            fillWithEmpty(moves, lastColIdx,'.ch', ''+(ply - 1), 'display: none');
            didWeRenderChatSectionAfterLastMove=false;
        }
        lastColIdx = colIdx;

        const moveEl = [ h('san', move) ];
        const scoreStr = ctrl.steps[ply]['scoreStr'] ?? '';
        moveEl.push(h('eval#ply' + ply, scoreStr));
        var chats: VNode| undefined = undefined;
        if (ctrl.steps[ply].chat) {
            const chatMessages: VNode[] = [];
            for (let x of ctrl.steps[ply].chat!) {
                const min = Math.floor(x.time/60000);
                const sec = Math.floor((x.time - min*60000)/1000);
                const millis = x.time - min*60000 - sec*1000;
                const time = min+":"+(sec.toString().padStart(2, '0'))+"."+(millis.toString().padStart(3, '0'));
                const m = x.message.replace('!bug!','');
                const v = h("li.message",
                    [h("div.time", time), h("user", h("a", { attrs: {href: "/@/" + x.username} }, x.username)),
                        /*h("div.discord-icon-container", h("img.icon-discord-icon", { attrs: { src: '/static/icons/discord.svg' } }))*/
                        x.message.indexOf('!bug')>-1? h('div.bugchat.'+m,[]):h('div',[x.message])
                    ]);

                chatMessages.push(v/*h("div", +" "+x.username+": "+x.message)*/);
            }
            /*moveEl.push(h('bugchat#ply' + ply, [ h("img", { attrs: { src: '/static/icons/bugchatmove.svg' } })]));*/
            chats = h("ol.bugchatpopup.chat",chatMessages);
            didWeRenderChatSectionAfterLastMove = true;
        }

        moves.push(h('move-bug.counter',  Math.floor(ctrl.steps[ply].boardName === 'a'? (plyA + 1) / 2 : (plyB + 1) / 2 ) ) );

        const el = h('move-bug', {
            class: { active: ((ply === plyTo - 1) && activate), haschat: !!ctrl.steps[ply].chat },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        if (chats) moves.push(chats);

        if (ctrl.steps[ply]['vari'] !== undefined && "plyVari" in ctrl) {
            const variMoves = ctrl.steps[ply]['vari'];

            // if (ply % 2 !== 0) moves.push(h('move-bug', '...'));

            let plyAVari = plyA;
            let plyBVari = plyB;

            moves.push(h('vari#vari' + ctrl.plyVari,
                variMoves?
                    variMoves.map((x: Step, idx: number) => {
                    const currPlyGlobal = ctrl.plyVari + idx;
                    const currPlyBoard = x.boardName ==='a'? ++plyAVari: ++plyBVari;
                    const boardName = x.turnColor === 'white'? x.boardName: x.boardName!.toUpperCase();
                    const moveCounter = Math.floor((currPlyBoard + 1) / 2) + boardName! + '. ';
                    return h('vari-move', {
                        attrs: { ply: currPlyGlobal },
                        on: { click: () => selectMove(ctrl, ctrl.plyVari + idx, ctrl.plyVari) },
                        }, [ h('san', moveCounter + x['san']) ]
                    );
                }) : []
            ));

            // if (ply % 4 == 1) {
            //     moves.push(h('move.counter', (ply + 1) / 2));
            //     moves.push(h('move-bug', '...'));
            // }
            didWeRenderVariSectionAfterLastMove = true;
        }
    }

    if (ctrl.status >= 0 && needResult) {
        moves.push(h('div#result', result(ctrl.b1.variant, ctrl.status, ctrl.result)));
    }

    const container = document.getElementById('movelist') as HTMLElement;
    if (full) {
        while (container.lastChild) {
            container.removeChild(container.lastChild);
        }
    }
    ctrl.vmovelist = patch(container, h('div#movelist', moves));

    if (activate) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    }
}

export function updateResult (ctrl: AnalysisControllerBughouse | RoundControllerBughouse) {
    if (ctrl.status < 0) return;

    // Prevent to render it twice
    const resultEl = document.getElementById('result') as HTMLElement;
    if (resultEl) return;

    const container = document.getElementById('movelist') as HTMLElement;
    ctrl.vmovelist = patch(container, h('div#movelist', [h('div#result', result(ctrl.b1.variant, ctrl.status, ctrl.result))]));
    container.scrollTop = 99999;
}
