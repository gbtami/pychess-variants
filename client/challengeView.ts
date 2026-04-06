import { h, VNode } from "snabbdom";

import { _ } from "./i18n";
import { patch } from "./document";
import { VARIANTS } from "./variants";

interface Challenge {
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
    status: string;
}

interface ChallengeEnvelope {
    challenges: Challenge[];
    gameId?: string;
}

function challengeLabel(challenge: Challenge) {
    const prefix = challenge.challengerTitle ? `${challenge.challengerTitle} ` : "";
    if (challenge.status === "declined") {
        return challenge.incoming
            ? `${_("You declined")} ${prefix}${challenge.challenger}`
            : `${challenge.opponent} ${_("declined your challenge")}`;
    }
    if (challenge.status === "canceled") {
        return challenge.incoming
            ? `${prefix}${challenge.challenger} ${_("canceled the challenge")}`
            : `${_("Challenge to")} ${challenge.opponent} ${_("was canceled")}`;
    }
    if (challenge.status === "accepted") {
        return challenge.incoming
            ? `${prefix}${challenge.challenger} ${_("started the game")}`
            : `${_("Challenge accepted by")} ${challenge.opponent}`;
    }
    return challenge.incoming
        ? `${prefix}${challenge.challenger} ${_("challenged you")}`
        : `${_("Challenge sent to")} ${challenge.opponent}`;
}

function challengeMeta(challenge: Challenge) {
    const variant = VARIANTS[challenge.variant];
    const variantName = variant
        ? variant.displayName(Boolean(challenge.chess960))
        : `${challenge.variant}${challenge.chess960 ? "960" : ""}`;
    let status = "";
    if (challenge.status === "offline") status = ` • ${_("Offline")}`;
    else if (challenge.status === "declined") status = ` • ${_("Declined")}`;
    else if (challenge.status === "canceled") status = ` • ${_("Canceled")}`;
    else if (challenge.status === "accepted") status = ` • ${_("Accepted")}`;
    return `${variantName} • ${challenge.tc} • ${challenge.rated ? _("Rated") : _("Casual")}${status}`;
}

export function challengeView() {
    let challenges: Challenge[] = [];
    let appEl: HTMLElement | VNode;
    let evtSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    const pending = new Set<string>();

    const counterEl = () => document.querySelector('#btn-challenge .data-count') as HTMLElement | null;

    function incomingCount() {
        return challenges.reduce(
            (sum, challenge) =>
                sum + (challenge.incoming && ["created", "offline"].includes(challenge.status) ? 1 : 0),
            0
        );
    }

    function redraw() {
        const count = incomingCount();
        const counter = counterEl();
        if (counter) counter.setAttribute("data-count", `${count}`);
        const button = document.getElementById("btn-challenge") as HTMLElement | null;
        if (button) button.setAttribute("aria-label", `Challenges: ${count}`);
        appEl = patch(appEl, h("div#challenge-app", renderChallenges()));
    }

    function applyEnvelope(envelope: ChallengeEnvelope) {
        challenges = envelope.challenges;
        redraw();
        if (envelope.gameId) window.location.assign(`/${envelope.gameId}`);
    }

    function loadChallenges() {
        fetch("/challenges")
            .then(res => res.json())
            .then((payload: ChallengeEnvelope) => applyEnvelope(payload))
            .catch((err) => console.warn("Failed to load challenges.", err));
    }

    function connectChallenges() {
        if (evtSource !== null) evtSource.close();
        evtSource = new EventSource("/challenge/subscribe");
        evtSource.onmessage = (event) => applyEnvelope(JSON.parse(event.data));
        evtSource.onerror = function() {
            if (evtSource !== null) {
                evtSource.close();
                evtSource = null;
            }
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                connectChallenges();
            }, 1500);
        };
    }

    function postAction(challenge: Challenge, action: "accept" | "decline" | "cancel") {
        pending.add(challenge.id);
        redraw();
        fetch(`/api/challenge/seek/${challenge.id}/${action}`, { method: "POST" })
            .then(res => res.json())
            .then((payload) => {
                if (payload.type === "error") {
                    alert(payload.message);
                } else if (payload.type === "new_game" && payload.gameId) {
                    window.location.assign(`/${payload.gameId}`);
                    return;
                }
                loadChallenges();
            })
            .catch((err) => console.warn(`Failed to ${action} challenge.`, err))
            .finally(() => {
                pending.delete(challenge.id);
                redraw();
            });
    }

    function actionButtons(challenge: Challenge) {
        if (!["created", "offline"].includes(challenge.status)) return undefined;
        const disabled = pending.has(challenge.id);
        if (challenge.incoming) {
            return h("div.challenge-actions", [
                h("button.button-primary.challenge-action", {
                    props: { type: "button", disabled },
                    on: { click: () => postAction(challenge, "accept") },
                }, _("Accept")),
                h("button.challenge-action.challenge-secondary", {
                    props: { type: "button", disabled },
                    on: { click: () => postAction(challenge, "decline") },
                }, _("Decline")),
            ]);
        }
        return h("div.challenge-actions", [
            h("button.challenge-action.challenge-secondary", {
                props: { type: "button", disabled },
                on: { click: () => postAction(challenge, "cancel") },
            }, _("Cancel")),
        ]);
    }

    function renderChallenges() {
        if (challenges.length === 0) {
            return [
                h("span.notification.empty", [
                    h("div.icon.icon-crossedswords"),
                    h("span.text", _("No challenges.")),
                ]),
            ];
        }

        return challenges.map(challenge => {
            const actions = actionButtons(challenge);
            return h(`div.notification.challenge${challenge.incoming && ["created", "offline"].includes(challenge.status) ? ".new" : ""}${["declined", "canceled"].includes(challenge.status) ? ".challenge-inactive" : ""}`, [
                h("div.icon.icon-crossedswords"),
                h("span.content", [
                    h("span", [
                        h("strong", challengeLabel(challenge)),
                    ]),
                    h("span.challenge-meta", challengeMeta(challenge)),
                    ...(actions ? [actions] : []),
                ]),
            ]);
        });
    }

    function showChallenge() {
        (document.getElementById("btn-challenge") as HTMLElement).classList.add("shown");
        (document.getElementById("challenge-app") as HTMLElement).style.display = "flex";
    }

    function toggleChallenge() {
        if ((document.getElementById("challenge-app") as HTMLElement).style.display === "flex") {
            hideChallenge();
        } else {
            showChallenge();
        }
    }

    window.setTimeout(() => {
        appEl = document.getElementById("challenge-app") as HTMLElement;
        loadChallenges();
        connectChallenges();
    }, 0);

    return h("div#challenge-panel", [
        h("button#btn-challenge", { on: { click: toggleChallenge }, attrs: { "aria-label": "Challenges: 0" } }, [
            h("div.icon.icon-crossedswords.data-count", { attrs: { "data-count": 0 } }),
        ]),
        h("div#challenge-app"),
    ]);
}

export function hideChallenge() {
    (document.getElementById("btn-challenge") as HTMLElement).classList.remove("shown");
    (document.getElementById("challenge-app") as HTMLElement).style.display = "none";
}
