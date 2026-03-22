type FlatpickrOptions = {
    enableTime: boolean;
    time_24hr: boolean;
    dateFormat: string;
    altInput: boolean;
    altFormat: string;
    minDate: string;
    maxDate: Date;
    monthSelectorType: string;
    disableMobile: boolean;
};

type FlatpickrFunction = (element: HTMLElement, options: FlatpickrOptions) => void;

declare global {
    interface Window {
        flatpickr?: FlatpickrFunction;
    }
}

const SYSTEM_ARENA = "0";
const SYSTEM_RR = "1";
const SYSTEM_SWISS = "2";

function initializeFlatpickr(): void {
    const flatpickr = window.flatpickr;
    if (typeof flatpickr !== "function") return;

    document.querySelectorAll<HTMLElement>(".flatpickr").forEach((element) => {
        flatpickr(element, {
            enableTime: true,
            time_24hr: true,
            dateFormat: "Z",
            altInput: true,
            altFormat: "Y-m-d h:i K",
            minDate: "today",
            maxDate: new Date(Date.now() + 1000 * 3600 * 24 * 31 * 3),
            monthSelectorType: "static",
            disableMobile: true,
        });
    });
}

function setVisible(element: HTMLElement | null, visible: boolean): void {
    if (element) {
        element.style.display = visible ? "" : "none";
    }
}

function setDisabled(
    elements: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>,
    disabled: boolean,
): void {
    elements.forEach((element) => {
        if (element) {
            element.disabled = disabled;
        }
    });
}

export function initTournamentForm(): void {
    const form = document.getElementById("tournament-form");
    if (!(form instanceof HTMLFormElement)) return;

    initializeFlatpickr();

    const system = document.getElementById("form3-system");
    const systemHelp = document.getElementById("form3-system-help");
    const roundsWrap = document.getElementById("form3-rounds-wrap");
    const roundsLabel = document.getElementById("form3-rounds-label");
    const rounds = document.getElementById("form3-rounds");
    const roundsHelp = document.getElementById("form3-rounds-help");
    const rrMaxPlayersWrap = document.getElementById("form3-rrMaxPlayers-wrap");
    const rrMaxPlayers = document.getElementById("form3-rrMaxPlayers");
    const rrMaxPlayersHelp = document.getElementById("form3-rrMaxPlayers-help");
    const rrApprovalWrap = document.getElementById("form3-rrApproval-wrap");
    const roundIntervalWrap = document.getElementById("form3-roundInterval-wrap");
    const roundInterval = document.getElementById("form3-roundInterval");
    const roundIntervalHelp = document.getElementById("form3-roundInterval-help");
    const minutesLabel = document.getElementById("form3-minutes-label");
    const minutesHelp = document.getElementById("form3-minutes-help");
    const entryWrapA = document.getElementById("form3-entry-wrap-a");
    const entryWrapB = document.getElementById("form3-entry-wrap-b");
    const entryWrapC = document.getElementById("form3-entry-wrap-c");
    const swissPairingsWrapA = document.getElementById("form3-swiss-pairings-wrap-a");
    const entryConditionInputs = [
        document.getElementById("form3-entryTitledOnly"),
        document.getElementById("form3-entryMinRatedGames"),
        document.getElementById("form3-entryMinRating"),
        document.getElementById("form3-entryMaxRating"),
        document.getElementById("form3-entryMinAccountAgeDays"),
    ];
    const swissPairingInputs = [
        document.getElementById("form3-forbiddenPairings"),
        document.getElementById("form3-manualPairings"),
    ];
    const arenaFaq = document.getElementById("tour-faq-arena");
    const rrFaq = document.getElementById("tour-faq-rr");
    const swissFaq = document.getElementById("tour-faq-swiss");

    if (
        !(system instanceof HTMLSelectElement) ||
        !(roundsWrap instanceof HTMLElement) ||
        !(rounds instanceof HTMLSelectElement) ||
        !(rrMaxPlayersWrap instanceof HTMLElement) ||
        !(rrMaxPlayers instanceof HTMLSelectElement) ||
        !(roundIntervalWrap instanceof HTMLElement) ||
        !(roundInterval instanceof HTMLSelectElement)
    ) {
        return;
    }

    const updateFormBySystem = (): void => {
        const systemValue = system.value;
        const isArena = systemValue === SYSTEM_ARENA;
        const isRR = systemValue === SYSTEM_RR;
        const isSwiss = systemValue === SYSTEM_SWISS;

        setVisible(roundsWrap, !isArena && !isRR);
        setVisible(rrMaxPlayersWrap, isRR);
        setVisible(rrApprovalWrap, isRR);
        setVisible(roundIntervalWrap, !isArena);
        rounds.disabled = isArena || isRR;
        rrMaxPlayers.disabled = !isRR;
        roundInterval.disabled = isArena;

        if (isArena) {
            rounds.value = "0";
            roundInterval.value = "auto";
        } else if (isRR) {
            rounds.value = "0";
            if (rrMaxPlayers.value === "0") rrMaxPlayers.value = "10";
        } else if (rounds.value === "0") {
            rounds.value = "5";
        }

        if (systemHelp) {
            if (isArena) {
                systemHelp.textContent =
                    "Arena runs continuously until the clock expires. Players rejoin from the lobby after each game.";
            } else if (isRR) {
                systemHelp.textContent =
                    "Round-Robin uses a maximum player cap. The joined field is frozen at start, then the full single-cycle round count is derived automatically.";
            } else {
                systemHelp.textContent =
                    "Swiss is a fixed-round event. Players are paired by score with color balancing and bye handling when needed.";
            }
        }

        if (roundsLabel) {
            roundsLabel.textContent = "Rounds (Swiss)";
        }

        if (roundsHelp) {
            roundsHelp.textContent = "Choose how many rounds the Swiss tournament will play.";
        }

        if (rrMaxPlayersHelp) {
            rrMaxPlayersHelp.textContent =
                "Choose the maximum Round-Robin field size. When the tournament starts, rounds are derived from the players who joined.";
        }

        if (roundIntervalHelp) {
            roundIntervalHelp.textContent = isArena
                ? "Automatic is based on time control and clamped to 10s-1m."
                : "Automatic is based on time control and clamped to 10s-1m. Manual start waits for the organizer to type /startround in tournament chat.";
        }

        if (minutesLabel) {
            minutesLabel.textContent = isArena ? "Duration" : "Estimated duration";
        }

        if (minutesHelp) {
            minutesHelp.textContent = isArena
                ? "Arena uses this as a hard limit."
                : "Swiss and Round-Robin only use this as an estimate for scheduling and display. The event still finishes by rounds.";
        }

        setVisible(entryWrapA, true);
        setVisible(entryWrapB, true);
        setVisible(entryWrapC, true);
        setVisible(swissPairingsWrapA, isSwiss);
        setDisabled(
            entryConditionInputs.map((element) =>
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement ||
                element instanceof HTMLSelectElement
                    ? element
                    : null
            ),
            false,
        );
        setDisabled(
            swissPairingInputs.map((element) =>
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement ||
                element instanceof HTMLSelectElement
                    ? element
                    : null
            ),
            !isSwiss,
        );

        setVisible(arenaFaq, isArena);
        setVisible(rrFaq, isRR);
        setVisible(swissFaq, isSwiss);
    };

    system.addEventListener("change", updateFormBySystem);
    updateFormBySystem();
}
