import { Variant, VARIANTS } from "@/variants";
import { CreateMode, Seek } from "@/lobbyType";
import { h } from "snabbdom";
import { _ } from "@/i18n";
import { timeControlStr } from "@/view";
import { disableCorr, LobbyController } from "@/lobby";

export function switchEnablingLobbyControls(mode: CreateMode, variant: Variant, anon: boolean){
        const rated = document.getElementById('rated')! as HTMLInputElement;
        const casual = document.getElementById('casual')! as HTMLInputElement;
        if (variant.twoBoards) {
            rated.disabled = true;
            rated.checked = false;
            casual.checked = true;
            disableCorr(true);
        } else {
            const vRated = localStorage.seek_rated ?? "0";
            rated.disabled = false;
            rated.checked = vRated === "1";
            casual.checked = vRated === "0";
            disableCorr(mode === 'playAI' || anon);
        }
}

export function bugJoinSeek(ctrl: LobbyController, e: Event, seek: Seek, joinAs: string) {
    e.stopPropagation();
    // seek[player] = ctrl.username;
    if (ctrl.anon) {
        alert(_("Anon users cannot join two board games"));
    }
    ctrl.doSend({ type: "accept_seek", seekID: seek["seekID"], player: ctrl.username, joinAs: joinAs });
}

function onClickSeekBughouse(ctrl: LobbyController, seek: Seek) {
    if (seek["user"] === ctrl.username) {
        ctrl.doSend({ type: "delete_seek", seekID: seek["seekID"], player: ctrl.username });
    } else {
        if ([seek.player2, seek.bugPlayer1, seek.bugPlayer2].includes(ctrl.username)) {
            ctrl.doSend({ type: "leave_seek", seekID: seek["seekID"], player: ctrl.username });
        }
    }
}

export function seekViewBughouse(ctrl: LobbyController, seek:Seek) {
    const variant = VARIANTS[seek.variant];
    const chess960 = seek.chess960;

    return h('tr', { on: { click: () => onClickSeekBughouse(ctrl, seek) } }, [
        h('td.bugseek1', [
            h('div.bugseekteam1', h("div", "+")),
            h('div', "A"), colorIconBug(seek.color, "player1"),
            h('div', "B"), colorIconBug(seek.color, "bugPlayer1"),
            h('div.bugseekvs',"vs."),
            h('div.bugseekteam2', h("div", "+")),
            h('div', "A"), colorIconBug(seek.color, "player2"),
            h('div', "B"), colorIconBug(seek.color, "bugPlayer2"),
        ]),
        h('td', h("div.bugseek", [
                        h('div', [ ctrl.seekTitle(seek), seek.user ]),
                        h('div', [ ctrl.challengeIcon(seek), ctrl.seekTitle(seek), seek.bugPlayer1 === ""?
                            [seek.player2, seek.bugPlayer2].includes(ctrl.username)? h("div.bugwaiting", "Waiting..."):
                            h('button.bug-join-button', { on: { click: (e:Event) => bugJoinSeek(ctrl, e, seek, "bugPlayer1") } }, _("Join")): seek.bugPlayer1 ]),
                        h('div.bugseekvs1',""),
                        h('div', [ ctrl.challengeIcon(seek), ctrl.seekTitle(seek), seek.player2 === ""?
                            [seek.user, seek.bugPlayer1].includes(ctrl.username)? h("div.bugwaiting", "Waiting..."):
                            h('button.bug-join-button', { on: { click: (e:Event) => bugJoinSeek(ctrl, e, seek, "player2") } }, _("Join")): seek.player2 ]),
                        h('div', [ ctrl.challengeIcon(seek), ctrl.seekTitle(seek), seek.bugPlayer2 === ""?
                            [seek.user, seek.bugPlayer1].includes(ctrl.username)? h("div.bugwaiting", "Waiting..."):
                            h('button.bug-join-button', { on: { click: (e:Event) => bugJoinSeek(ctrl, e, seek, "bugPlayer2") } }, _("Join")): seek.bugPlayer2 ]) ]
         ) ),
        h('td', seek.rating),
        h('td', timeControlStr(seek.base, seek.inc, seek.byoyomi)),
        h('td.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [h('variant-name', " " + variant.displayName(chess960))]),
        h('td', { class: { tooltip: seek.fen !== '' } }, [
            ctrl.tooltip(seek, variant),
            ctrl.mode(seek),
        ]),
    ]);
}

function colorIconBug(color: string, slot:string) {
    return h('i-side.icon', {
        class: {
            "icon-adjust": color === "r" && ["player1", "bugPlayer2"].includes(slot),
            "icon-adjust-rev": color === "r" && ["player2", "bugPlayer1"].includes(slot),
            "icon-white":  (color === "w" && ["player1", "bugPlayer2"].includes(slot)) || (color === "b" && ["player2", "bugPlayer1"].includes(slot)),
            "icon-black":  (color === "b" && ["player1", "bugPlayer2"].includes(slot)) || (color === "w" && ["player2", "bugPlayer1"].includes(slot)),
        }
    });
}
