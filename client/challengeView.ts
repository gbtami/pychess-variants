import { h, VNode } from "snabbdom";

import { colorIcon } from "./chess";
import { _ } from "./i18n";
import { patch } from "./document";
import { sound } from "./sound";
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
    return challenge.incoming ? `${prefix}${challenge.challenger}` : challenge.opponent;
}

function challengeVariantIcon(challenge: Challenge) {
    const variant = VARIANTS[challenge.variant];
    return variant ? variant.icon(Boolean(challenge.chess960)) : "";
}

function challengeColorIconClass(challenge: Challenge) {
    const variant = VARIANTS[challenge.variant];
    if (!variant) return "";
    if (challenge.color === "w") return colorIcon(challenge.variant, variant.colors.first);
    if (challenge.color === "b") return colorIcon(challenge.variant, variant.colors.second);
    return "";
}

function challengeMetaView(challenge: Challenge) {
    const colorClass = challengeColorIconClass(challenge);
    const colorIconVNode = colorClass
        ? [h("span.challenge-color", [h("span.is", { class: { [colorClass]: true } })]), h("span.challenge-dot", "•")]
        : [];
    const variant = VARIANTS[challenge.variant];
    const variantName = variant
        ? variant.displayName(Boolean(challenge.chess960))
        : `${challenge.variant}${challenge.chess960 ? "960" : ""}`;

    const parts = [
        challenge.rated ? _("Rated") : _("Casual"),
        challenge.tc,
        variantName,
    ];

    if (challenge.status === "offline") parts.push(_("Offline"));
    else if (challenge.status === "declined") parts.push(_("Declined"));
    else if (challenge.status === "accepted") parts.push(_("Accepted"));

    return h("span.challenge-meta", [
        ...colorIconVNode,
        ...parts.flatMap((part, index) => index === 0 ? [part] : [h("span.challenge-dot", "•"), part]),
    ]);
}

export function challengeView() {
    let challenges: Challenge[] = [];
    let appEl: HTMLElement | VNode;
    let evtSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let challengeStreamReady = false;
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
        if (button) {
            const label = `Challenges: ${count}`;
            button.setAttribute("aria-label", label);
            button.setAttribute("title", label);
        }
        appEl = patch(appEl, h("div#challenge-app", renderChallenges()));
    }

    function activeIncomingChallengeIds(items: Challenge[]) {
        return new Set(
            items
                .filter(challenge => challenge.incoming && ["created", "offline"].includes(challenge.status))
                .map(challenge => challenge.id)
        );
    }

    function applyEnvelope(envelope: ChallengeEnvelope, allowSound = false) {
        const previousActiveIncoming = activeIncomingChallengeIds(challenges);
        challenges = envelope.challenges;
        const nextActiveIncoming = activeIncomingChallengeIds(challenges);
        if (
            allowSound &&
            [...nextActiveIncoming].some(challengeId => !previousActiveIncoming.has(challengeId))
        ) {
            sound.newChallenge();
        }
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
        evtSource.onmessage = (event) => {
            applyEnvelope(JSON.parse(event.data), challengeStreamReady);
            challengeStreamReady = true;
        };
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
        if (action === "cancel" || action === "decline") {
            challenges = challenges.filter(item => item.id !== challenge.id);
        }
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
                h("button.challenge-action.challenge-action-accept", {
                    props: { type: "button", disabled },
                    attrs: { title: _("Accept"), "aria-label": _("Accept") },
                    on: { click: () => postAction(challenge, "accept") },
                }, [h("i.icon.icon-check")]),
                h("button.challenge-action.challenge-action-decline", {
                    props: { type: "button", disabled },
                    attrs: { title: _("Decline"), "aria-label": _("Decline") },
                    on: { click: () => postAction(challenge, "decline") },
                }, [h("i.icon.icon-abort")]),
            ]);
        }
        return h("div.challenge-actions", [
            h("div.challenge-owner", _("Waiting")),
            h("button.challenge-action.challenge-action-decline", {
                props: { type: "button", disabled },
                attrs: { title: _("Cancel"), "aria-label": _("Cancel") },
                on: { click: () => postAction(challenge, "cancel") },
            }, [h("i.icon.icon-abort")]),
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
            return h(`div.notification.challenge${challenge.incoming && ["created", "offline"].includes(challenge.status) ? ".new" : ""}${challenge.status === "declined" ? ".challenge-inactive" : ""}`, {
                attrs: { tabindex: 0 },
            }, [
                h("div.content", [
                    h("div.challenge-main", [
                        h("div.challenge-text", [
                            h("span.challenge-head", [
                                h("strong", challengeLabel(challenge)),
                            ]),
                            challengeMetaView(challenge),
                        ]),
                        h("div.icon.challenge-variant-icon", { attrs: { "data-icon": challengeVariantIcon(challenge) } }),
                    ]),
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
        h("button#btn-challenge", { on: { click: toggleChallenge }, attrs: { "aria-label": "Challenges: 0", "title": "Challenges: 0" } }, [
            h("div.icon.icon-crossedswords.data-count", { attrs: { "data-count": 0 } }),
        ]),
        h("div#challenge-app"),
    ]);
}

export function hideChallenge() {
    (document.getElementById("btn-challenge") as HTMLElement).classList.remove("shown");
    (document.getElementById("challenge-app") as HTMLElement).style.display = "none";
}
