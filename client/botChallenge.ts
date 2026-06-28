import { h, VNode } from "snabbdom";

import { _ } from "./i18n";
import { patch } from "./document";
import { gameType } from "./result";
import { timeControlStr } from "./view";
import { PyChessModel } from "./types";
import { VARIANTS } from "./variants";
import { sanitizeURL } from "./url";

type BotChallengeStatus = "created" | "declined" | "accepted" | "expired";

interface BotChallengeEvent {
    gameId: string;
    accept?: boolean;
    declineReason?: string;
}

export function botChallengeView(model: PyChessModel): VNode[] {
    const gameId = model.gameId;
    const opponent = model.botChallengeOpponent;
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === "True";
    let status = (model.botChallengeStatus || "created") as BotChallengeStatus;
    let declineReason = model.botChallengeDeclineReason;
    let appEl: HTMLElement | VNode;
    let evtSource: EventSource | null = null;
    let reconnectTimer: number | null = null;

    function redirectToGame() {
        window.location.assign(sanitizeURL(`/${gameId}`));
    }

    function connect() {
        if (status !== "created") return;
        if (evtSource !== null) evtSource.close();
        evtSource = new EventSource(`/api/bot-challenges/${gameId}`);
        evtSource.onmessage = event => {
            const payload = JSON.parse(event.data) as BotChallengeEvent;
            if (payload.gameId !== gameId) return;
            if (payload.accept) {
                status = "accepted";
                redraw();
                redirectToGame();
                return;
            }
            if (payload.accept === false) {
                status = "declined";
                declineReason = payload.declineReason || "";
                if (evtSource !== null) {
                    evtSource.close();
                    evtSource = null;
                }
                redraw();
            }
        };
        evtSource.onerror = () => {
            if (evtSource !== null) {
                evtSource.close();
                evtSource = null;
            }
            if (status !== "created") return;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, 1500);
        };
    }

    function details() {
        return h("div.invitegame", [
            h("div.info0.games.icon", { attrs: { "data-icon": variant ? variant.icon(chess960) : "" } }, [
                h("div.info2", [
                    h("div", variant ? variant.displayName(chess960) : model.variant),
                    h("div.tc", timeControlStr(model.base, model.inc, model.byo)),
                    h("div", opponent || _("BOT")),
                ]),
                h("div.rated", gameType(model.rated)),
            ]),
        ]);
    }

    function body() {
        if (status === "expired") {
            return [
                h("h1", { attrs: { align: "center" } }, _("This challenge is no longer available")),
                h("div.inviteinfo", [h("div", _("It may have been accepted, declined, canceled, or expired."))]),
                h("form", { props: { method: "get", action: "/" }, class: { invite: true } }, [
                    h("button.join", _("BACK TO LOBBY")),
                ]),
            ];
        }

        if (status === "declined") {
            return [
                h("h1", { attrs: { align: "center" } }, _("Challenge declined")),
                details(),
                h("div.inviteinfo", [h("div", declineReason || _("The challenge was declined."))]),
                h("form", { props: { method: "get", action: "/" }, class: { invite: true } }, [
                    h("button.join", _("NEW OPPONENT")),
                ]),
            ];
        }

        if (status === "accepted") {
            return [
                h("h1", { attrs: { align: "center" } }, _("Challenge accepted")),
                details(),
                h("div.inviteinfo", [h("div", _("Starting game..."))]),
                h("form", { props: { method: "get", action: `/${gameId}` }, class: { invite: true } }, [
                    h("button.join", _("JOIN THE GAME")),
                ]),
            ];
        }

        return [
            h("h1", { attrs: { align: "center" } }, _("Waiting for the other player")),
            details(),
            h("div.inviteinfo", [h("div", _("Challenge sent"))]),
            h("form", { props: { method: "post", action: `/bot-challenge/cancel/${gameId}` }, class: { invite: true } }, [
                h("button.red", _("CANCEL")),
            ]),
        ];
    }

    function redraw() {
        appEl = patch(appEl, h("div.invite", body()));
    }

    window.setTimeout(() => {
        appEl = document.getElementById("main-wrap") as HTMLElement;
        redraw();
        connect();
    }, 0);

    return [h("div.invite", body())];
}
