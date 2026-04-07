import { h, VNode } from "snabbdom";

import { _ } from "./i18n";
import { VARIANTS } from "./variants";
import { patch } from "./document";
import { gameType } from "./result";
import { timeControlStr } from "./view";
import { PyChessModel } from "./types";
import { sanitizeURL } from "./url";

type ChallengeStatus = "created" | "offline" | "canceled" | "declined" | "accepted";

interface HeaderChallenge {
    id: string;
    challenger: string;
    challengerTitle: string;
    opponent: string;
    incoming: boolean;
    variant: string;
    chess960: boolean | null;
    rated: boolean;
    color: string;
    tc: string;
    expireAt: string;
    status: ChallengeStatus;
    declineReason: string;
}

interface ChallengeEnvelope {
    challenges: HeaderChallenge[];
    gameId?: string;
}

function challengeColorText(challenge: HeaderChallenge) {
    const variant = VARIANTS[challenge.variant];
    if (challenge.color === "w") return variant ? _(variant.colors.first) : _("White");
    if (challenge.color === "b") return variant ? _(variant.colors.second) : _("Black");
    return _("Random side");
}

const DECLINE_REASONS: Array<{ key: string; label: string }> = [
    { key: "generic", label: "I'm not accepting challenges at the moment." },
    { key: "later", label: "This is not the right time for me, please ask again later." },
    { key: "tooFast", label: "This time control is too fast for me, please challenge again with a slower game." },
    { key: "tooSlow", label: "This time control is too slow for me, please challenge again with a faster game." },
    { key: "timeControl", label: "I'm not accepting challenges with this time control." },
    { key: "rated", label: "Please send me a rated challenge instead." },
    { key: "casual", label: "Please send me a casual challenge instead." },
    { key: "standard", label: "I'm not accepting variant challenges right now." },
    { key: "variant", label: "I'm not willing to play this variant right now." },
    { key: "noBot", label: "I'm not accepting challenges from bots." },
    { key: "onlyBot", label: "I'm only accepting challenges from bots." },
];

export function directChallengeView(model: PyChessModel): VNode[] {
    const challengeId = model.challengeId;
    let challenge: HeaderChallenge | null = null;
    let appEl: HTMLElement | VNode;
    let evtSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let loading = true;
    let unavailable = false;
    let declineReasonKey = "generic";
    let pendingAction: "accept" | "decline" | "cancel" | null = null;

    function redirectToGame(gameId: string) {
        window.location.assign(sanitizeURL(`/${gameId}`));
    }

    function updateFromEnvelope(envelope: ChallengeEnvelope) {
        if (envelope.gameId) {
            redirectToGame(envelope.gameId);
            return;
        }
        const nextChallenge = envelope.challenges.find(item => item.id === challengeId) ?? null;
        if (nextChallenge) {
            challenge = nextChallenge;
            unavailable = false;
        } else if (challenge === null || pendingAction === null) {
            unavailable = true;
        }
        loading = false;
        redraw();
    }

    function loadChallenge() {
        fetch("/challenges")
            .then(res => res.json())
            .then((payload: ChallengeEnvelope) => updateFromEnvelope(payload))
            .catch((err) => {
                console.warn("Failed to load challenge.", err);
                loading = false;
                unavailable = true;
                redraw();
            });
    }

    function connectChallengeStream() {
        if (evtSource !== null) evtSource.close();
        evtSource = new EventSource("/challenge/subscribe");
        evtSource.onmessage = event => updateFromEnvelope(JSON.parse(event.data));
        evtSource.onerror = () => {
            if (evtSource !== null) {
                evtSource.close();
                evtSource = null;
            }
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                connectChallengeStream();
            }, 1500);
        };
    }

    function postAction(action: "accept" | "decline" | "cancel") {
        pendingAction = action;
        if (action === "cancel" && challenge !== null) {
            challenge = { ...challenge, status: "canceled" };
        } else if (action === "decline" && challenge !== null) {
            const declineReason = DECLINE_REASONS.find(item => item.key === declineReasonKey)?.label ?? "";
            challenge = { ...challenge, status: "declined", declineReason };
        }
        redraw();

        const init: RequestInit = { method: "POST" };
        if (action === "decline") {
            init.headers = { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" };
            init.body = new URLSearchParams({ reason: declineReasonKey }).toString();
        }

        fetch(`/api/challenge/seek/${challengeId}/${action}`, init)
            .then(res => res.json())
            .then(payload => {
                if (payload.type === "error") {
                    alert(payload.message);
                    loadChallenge();
                    return;
                }
                if (payload.type === "new_game" && payload.gameId) {
                    redirectToGame(payload.gameId);
                    return;
                }
                loadChallenge();
            })
            .catch(err => {
                console.warn(`Failed to ${action} challenge.`, err);
                loadChallenge();
            })
            .finally(() => {
                pendingAction = null;
                redraw();
            });
    }

    function challengeTitle(current: HeaderChallenge) {
        if (current.status === "declined") return _("Challenge declined");
        if (current.status === "canceled") return _("Challenge canceled");
        if (current.status === "accepted") return _("Challenge accepted");
        if (current.incoming) return _("Challenge to a game");
        return _("Waiting for the other player");
    }

    function challengeInfo(current: HeaderChallenge) {
        const variant = VARIANTS[current.variant];
        const chess960 = Boolean(current.chess960);
        return h("div.invitegame", [
                h("div.info0.games.icon", { attrs: { "data-icon": variant ? variant.icon(chess960) : "" } }, [
                    h("div.info2", [
                        h("div", variant ? variant.displayName(chess960) : current.variant),
                        h("div.tc", current.tc || timeControlStr(model.base, model.inc, model.byo)),
                        h("div", current.incoming ? current.challenger : current.opponent),
                    ]),
                    h("div.rated", [
                        h("div.challenge-color-choice", challengeColorText(current)),
                        h("div", gameType(current.rated ? 1 : 0)),
                    ]),
                ]),
        ]);
    }

    function activeActions(current: HeaderChallenge) {
        const disabled = pendingAction !== null;
        if (current.incoming) {
            return [
                h("div.inviteinfo", [
                    h("label", { attrs: { for: "decline-reason" } }, _("Decline reason")),
                    h("select#decline-reason", {
                        props: { value: declineReasonKey, disabled },
                        on: {
                            change: (event: Event) => {
                                declineReasonKey = (event.target as HTMLSelectElement).value;
                            },
                        },
                    }, DECLINE_REASONS.map(reason => h("option", { attrs: { value: reason.key } }, reason.label))),
                ]),
                h("form.invite", [
                    h("button.join", {
                        props: { type: "button", disabled },
                        on: { click: () => postAction("accept") },
                    }, _("ACCEPT")),
                    h("button.red", {
                        props: { type: "button", disabled },
                        on: { click: () => postAction("decline") },
                    }, _("DECLINE")),
                ]),
            ];
        }
        return [
            h("form.invite", [
                h("button.red", {
                    props: { type: "button", disabled },
                    on: { click: () => postAction("cancel") },
                }, _("CANCEL")),
            ]),
        ];
    }

    function terminalInfo(current: HeaderChallenge) {
        if (current.status === "declined" && current.declineReason) {
            return h("div.inviteinfo", [h("div", current.declineReason)]);
        }
        if (current.status === "canceled") {
            return h("div");
        }
        if (current.status === "accepted") {
            return h("div.inviteinfo", [h("div", _("Starting game..."))]);
        }
        if (current.status === "offline") {
            return h("div.inviteinfo", [h("div", _("The challenger is currently offline."))]);
        }
        return h("div");
    }

    function redraw() {
        if (loading) {
            appEl = patch(appEl, h("div#main-wrap", [
                h("div.invite", [
                    h("h1", { attrs: { align: "center" } }, _("Loading challenge...")),
                ]),
            ]));
            return;
        }
        if (challenge === null || unavailable) {
            appEl = patch(appEl, h("div#main-wrap", [
                h("div.invite", [
                    h("h1", { attrs: { align: "center" } }, _("This challenge is no longer available")),
                    h("div.inviteinfo", [h("div", _("It may have been accepted, declined, canceled, or expired."))]),
                    h("form", { props: { method: "get", action: "/" }, class: { invite: true } }, [
                        h("button.join", _("BACK TO LOBBY")),
                    ]),
                ]),
            ]));
            return;
        }

        const current = challenge;
        const active = current.status === "created" || current.status === "offline";
        appEl = patch(appEl, h("div#main-wrap", [
            h("div.invite", [
                h("h1", { attrs: { align: "center" } }, challengeTitle(current)),
                challengeInfo(current),
                ...(active ? activeActions(current) : [terminalInfo(current)]),
            ]),
        ]));
    }

    window.setTimeout(() => {
        appEl = document.getElementById("main-wrap") as HTMLElement;
        redraw();
        loadChallenge();
        connectChallengeStream();
    }, 0);

    return [h("div.invite", [h("h1", { attrs: { align: "center" } }, _("Loading challenge..."))])];
}
