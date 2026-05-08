import { h, VNode } from 'snabbdom';

import { _ } from '@/i18n';
import AnalysisControllerBughouse from './analysisCtrl.bug';
import { result } from '../result'
import { patch } from '../document';
import { RoundControllerBughouse } from "./roundCtrl.bug";
import {Step, StepChat} from "../messages";
import { displayUsername, isAnonUsername } from "@/user";
import { AnalysisTreeNode, mainlinePathAtPly, nodeAtPath } from "../analysis/analysisTree";
import { bugMovePrefix } from "./analysisTreeBug";

type TreeCtrl = AnalysisControllerBughouse & {
    analysisTree?: { root: AnalysisTreeNode };
    hasAnalysisTree?: () => boolean;
    getTreeActivePath?: () => string;
    getTreeSelectedChildPath?: () => string | undefined;
    activateTreePath?: (path: string) => void;
    activateTreeMainlinePly?: (ply: number) => void;
    getTreeLineStartPath?: () => string;
    getTreeLineEndPath?: () => string;
    getTreeParentPath?: () => string;
    getTreeMainChildPath?: () => string | undefined;
};

function asTreeCtrl(ctrl: AnalysisControllerBughouse | RoundControllerBughouse): TreeCtrl | undefined {
    const treeCtrl = ctrl as TreeCtrl;
    return treeCtrl.hasAnalysisTree?.() ? treeCtrl : undefined;
}

export function selectMove (ctrl: AnalysisControllerBughouse | RoundControllerBughouse, ply: number, _plyVari = 0): void {
    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl) {
        if (ply < 0) return;
        ctrl.goPly(ply, 0);
        updateMovelist(ctrl, true, false);
        scrollToPly(ctrl);
        return;
    }

    if (ply < 0 || ply > ctrl.steps.length - 1) {
        return
    }

    ctrl.goPly(ply, 0);
    activatePly(ctrl);
    scrollToPly(ctrl);
}

export function selectMainlineMove(ctrl: AnalysisControllerBughouse | RoundControllerBughouse, ply: number): void {
    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl?.activateTreeMainlinePly) {
        treeCtrl.activateTreeMainlinePly(ply);
        return;
    }
    selectMove(ctrl, ply, 0);
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
    const plyEl = movelistEl.querySelector('move-bug.active, vari-move.active') as HTMLElement | null;

    let st: number | undefined = undefined;

    if (ctrl.ply === 0) st = 0;
    else if (ctrl.ply === ctrl.steps.length - 1) st = 99999;
    else if (plyEl) st = plyEl.offsetTop - movelistEl.offsetHeight / 2 + plyEl.offsetHeight / 2;

    if (st !== undefined)
        movelistEl.scrollTop = st;
}

export function createMovelistButtons (ctrl: AnalysisControllerBughouse | RoundControllerBughouse ) {
    const container = document.getElementById('move-controls') as HTMLElement;

    const selectVariationBound = (goToStart: boolean) => {
        const treeCtrl = asTreeCtrl(ctrl);
        if (treeCtrl) {
            const target = goToStart ? treeCtrl.getTreeLineStartPath?.() : treeCtrl.getTreeLineEndPath?.();
            if (target !== undefined) treeCtrl.activateTreePath?.(target);
            return;
        }
        selectMove(ctrl, goToStart ? 0 : ctrl.steps.length - 1);
    };

    let buttons = [
        h('button', { on: { click: () => ctrl.flipBoards() }, props: { title: _('Flip boards')} }, [ h('i.icon.icon-refresh') ]),
        h('button', { on: { click: () => ctrl.switchBoards() }, props: { title: _('Switch boards')} }, [ h('i.icon.icon-exchange') ]),
        h('button', { on: { click: () => selectVariationBound(true) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', { on: { click: () => {
            const treeCtrl = asTreeCtrl(ctrl);
            if (treeCtrl) {
                const target = treeCtrl.getTreeParentPath?.();
                if (target !== undefined) treeCtrl.activateTreePath?.(target);
            } else {
                selectMove(ctrl, ctrl.ply - 1, 0);
            }
        } } }, [ h('i.icon.icon-step-backward') ]),
        h('button', { on: { click: () => {
            const treeCtrl = asTreeCtrl(ctrl);
            if (treeCtrl) {
                const target = treeCtrl.getTreeMainChildPath?.();
                if (target !== undefined) treeCtrl.activateTreePath?.(target);
            } else {
                selectMove(ctrl, ctrl.ply + 1, 0);
            }
        } } }, [ h('i.icon.icon-step-forward') ]),
        h('button', { on: { click: () => selectVariationBound(false) } }, [ h('i.icon.icon-fast-forward') ]),
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

function renderTreeVariationMove(ctrl: TreeCtrl, node: AnalysisTreeNode): VNode {
    return h('vari-move', {
        class: {
            active: node.path === ctrl.getTreeActivePath?.(),
            selected: node.path === ctrl.getTreeSelectedChildPath?.(),
        },
        attrs: { ply: node.ply, 'data-path': node.path },
        on: { click: () => ctrl.activateTreePath?.(node.path) },
    }, [h('san', `${bugMovePrefix(node.step)} ${node.step.san ?? ''}`)]);
}

function renderTreeVariationSequence(ctrl: TreeCtrl, nodes: AnalysisTreeNode[]): VNode[] {
    const [child, ...siblings] = nodes;
    if (!child) return [];

    const moves: VNode[] = [];
    let current: AnalysisTreeNode | undefined = child;
    let branchSiblings = siblings;

    while (current) {
        moves.push(renderTreeVariationMove(ctrl, current));
        branchSiblings.forEach((sideline) => {
            moves.push(h('inline', renderTreeVariationSequence(ctrl, [sideline])));
        });
        branchSiblings = [];
        current.children.slice(1).forEach((sideline) => {
            moves.push(h('inline', renderTreeVariationSequence(ctrl, [sideline])));
        });
        current = current.children[0];
    }

    return moves;
}

function renderTreeVariationRows(ctrl: TreeCtrl, nodes: AnalysisTreeNode[]): VNode[] {
    return nodes.map((node, idx) =>
        h(`vari#tree-vari-${idx}-${node.path.replace(/\./g, '-')}`, { class: { 'tree-variation': true } }, [
            ...renderTreeVariationSequence(ctrl, [node]),
        ])
    );
}

export function updateMovelist (ctrl: AnalysisControllerBughouse | RoundControllerBughouse, full = true, activate = true, needResult = true) {
    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl) {
        const plyFrom = full ? 1 : ctrl.steps.length - 1;
        if (plyFrom === 0 && ctrl.steps.length <= 1) {
            const container = document.getElementById('movelist') as HTMLElement;
            ctrl.vmovelist = patch(container, h('div#movelist', { class: { 'bug-analysis-tree': true } }));
            return;
        }

        const plyTo = ctrl.steps.length;
        const moves: VNode[] = [];
        const prevPly = ctrl.steps[Math.max(0, plyFrom - 1)];
        let lastColIdx = plyFrom === 1
            ? 0
            : prevPly.boardName === 'a'
                ? prevPly.turnColor === 'white' ? 2 : 1
                : prevPly.turnColor === 'white' ? 4 : 3;
        let didWeRenderVariSectionAfterLastMove = false;
        let didWeRenderChatSectionAfterLastMove = false;

        if (full && treeCtrl.analysisTree) {
            moves.push(...renderTreeVariationRows(treeCtrl, treeCtrl.analysisTree.root.children.slice(1)));
        }

        for (let ply = plyFrom; ply < plyTo; ply++) {
            const step = ctrl.steps[ply];
            const move = step.san;
            if (move === null) continue;

            const colIdx = step.boardName === 'a'
                ? step.turnColor === 'black' ? 1 : 2
                : step.turnColor === 'black' ? 3 : 4;

            if (didWeRenderVariSectionAfterLastMove) {
                fillWithEmpty(moves, colIdx - 1);
                didWeRenderVariSectionAfterLastMove = false;
            } else {
                const countOfEmptyCellsToAdd = colIdx > lastColIdx ? colIdx - lastColIdx - 1 : 4 + colIdx - lastColIdx - 1;
                fillWithEmpty(moves, countOfEmptyCellsToAdd);
            }

            if (didWeRenderChatSectionAfterLastMove) {
                fillWithEmpty(moves, lastColIdx, '.ch', '' + (ply - 1), 'display: none');
                didWeRenderChatSectionAfterLastMove = false;
            }
            lastColIdx = colIdx;

            const moveEl = [h('san', move)];
            const scoreStr = step['scoreStr'] ?? '';
            moveEl.push(h('eval#ply' + ply, scoreStr));
            let chats: VNode | undefined = undefined;
            if (step.chat) {
                const chatMessages: VNode[] = [];
                for (const x of step.chat) {
                    const time = formatChatMessageTime(x);
                    const m = x.message.replace('!bug!', '');
                    const displayUser = displayUsername(x.username);
                    const userNode = isAnonUsername(x.username)
                        ? h("span", displayUser)
                        : h("a", { attrs: { href: "/@/" + x.username } }, displayUser);
                    chatMessages.push(h("li.message", [
                        h("div.time", time),
                        h("user", userNode),
                        x.message.indexOf('!bug') > -1 ? h('div.bugchat.' + m, []) : h('div', [x.message]),
                    ]));
                }
                chats = h("ol.bugchatpopup.chat", chatMessages);
                didWeRenderChatSectionAfterLastMove = true;
            }

            const mainlineNode = treeCtrl.analysisTree
                ? nodeAtPath(treeCtrl.analysisTree, mainlinePathAtPly(treeCtrl.analysisTree, ply))
                : undefined;
            moves.push(h('move-bug.counter', getLocalMoveNum(step)));
            moves.push(h('move-bug', {
                class: {
                    active: mainlineNode?.path === treeCtrl.getTreeActivePath?.(),
                    haschat: !!step.chat,
                },
                attrs: { ply: ply },
                on: { click: () => selectMainlineMove(ctrl, ply) },
            }, moveEl));
            if (chats) moves.push(chats);

            if (mainlineNode && mainlineNode.children.length > 1) {
                moves.push(...renderTreeVariationRows(treeCtrl, mainlineNode.children.slice(1)));
                didWeRenderVariSectionAfterLastMove = true;
            }
        }

        if (ctrl.status >= 0 && needResult) {
            const teamFirst = displayUsername(ctrl.teamFirst[0][0]) + "+" + displayUsername(ctrl.teamFirst[1][0]);
            const teamSecond = displayUsername(ctrl.teamSecond[0][0]) + "+" + displayUsername(ctrl.teamSecond[1][0]);
            moves.push(h('div.result', ctrl.result));
            moves.push(h('div.status', result(ctrl.b1.variant, ctrl.status, ctrl.result, teamFirst, teamSecond)));
        }

        const container = document.getElementById('movelist') as HTMLElement;
        if (full) {
            while (container.lastChild) {
                container.removeChild(container.lastChild);
            }
        }
        ctrl.vmovelist = patch(container, h('div#movelist', { class: { 'bug-analysis-tree': true } }, moves));
        if (activate) scrollToPly(ctrl);
        return;
    }

    const plyFrom = (full) ? 1 : ctrl.steps.length -1;
    if (plyFrom === 0) return; // that is the very initial message with single dummy step. No moves yet

    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];
    const prevPly = ctrl.steps[plyFrom-1];
    let lastColIdx = plyFrom ===1? 0: prevPly.boardName === 'a'? prevPly.turnColor === 'white'/*black made the move*/? 2: 1: prevPly.turnColor === 'white'/*black made the move*/? 4: 3;
    let didWeRenderVariSectionAfterLastMove = false;
    let didWeRenderChatSectionAfterLastMove = false;

    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = ctrl.steps[ply].san;
        if (move === null) continue;

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
                const time = formatChatMessageTime(x)
                const m = x.message.replace('!bug!','');
                const displayUser = displayUsername(x.username);
                const userNode = isAnonUsername(x.username)
                    ? h("span", displayUser)
                    : h("a", { attrs: {href: "/@/" + x.username} }, displayUser);
                const v = h("li.message",
                    [h("div.time", time), h("user", userNode),
                        /*h("div.discord-icon-container", h("img.icon-discord-icon", { attrs: { src: '/static/icons/discord.svg' } }))*/
                        x.message.indexOf('!bug')>-1? h('div.bugchat.'+m,[]):h('div',[x.message])
                    ]);

                chatMessages.push(v/*h("div", +" "+x.username+": "+x.message)*/);
            }
            /*moveEl.push(h('bugchat#ply' + ply, [ h("img", { attrs: { src: '/static/icons/bugchatmove.svg' } })]));*/
            chats = h("ol.bugchatpopup.chat",chatMessages);
            didWeRenderChatSectionAfterLastMove = true;
        }

        moves.push(h('move-bug.counter',  getLocalMoveNum(ctrl.steps[ply])));

        const el = h('move-bug', {
            class: { active: ((ply === plyTo - 1) && activate), haschat: !!ctrl.steps[ply].chat },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        if (chats) moves.push(chats);

    }

    if (ctrl.status >= 0 && needResult) {
        const teamFirst = displayUsername(ctrl.teamFirst[0][0]) + "+" + displayUsername(ctrl.teamFirst[1][0]);
        const teamSecond = displayUsername(ctrl.teamSecond[0][0]) + "+" + displayUsername(ctrl.teamSecond[1][0]);
        moves.push(h('div.result', ctrl.result));
        moves.push(h('div.status', result(ctrl.b1.variant, ctrl.status, ctrl.result, teamFirst, teamSecond)));
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

export function getLocalMoveNum(step: Step) {
    return Math.floor(step.boardName === 'a'? (step.plyA! + 1) / 2 : (step.plyB! + 1) / 2 );
}

export function formatChatMessageTime(x: StepChat) {
    const min = Math.floor(x.time/60000);
    const sec = Math.floor((x.time - min*60000)/1000);
    const millis = x.time - min*60000 - sec*1000;
    const time = min+":"+(sec.toString().padStart(2, '0'))+"."+(millis.toString().padStart(3, '0'));
    return time;
}

export function updateResult (ctrl: AnalysisControllerBughouse | RoundControllerBughouse) {
    if (ctrl.status < 0) return;

    // Prevent to render it twice
    const resultEl = document.querySelector('.result');
    if (resultEl) return;

    const container = document.getElementById('movelist') as HTMLElement;

    const teamFirst = ctrl.teamFirst[0][0] + "+" + ctrl.teamFirst[1][0];
    const teamSecond = ctrl.teamSecond[0][0] + "+" + ctrl.teamSecond[1][0];

    ctrl.vmovelist = patch(container, h('div#movelist', [
        h('div.result', ctrl.result),
        h('div.status', result(ctrl.b1.variant, ctrl.status, ctrl.result, teamFirst, teamSecond))
    ]));
    container.scrollTop = 99999;
}
