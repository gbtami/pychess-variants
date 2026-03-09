import { h } from 'snabbdom';

import { _, ngettext } from './i18n';
import { patch } from './document';
import { TournamentController } from "./tournament";

export const localeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
};

function getTimeRemaining(endtime: number) {

    const totalSecs = endtime - Date.now();

    const seconds = Math.floor((totalSecs / 1000) % 60);
    const minutes = Math.floor((totalSecs / 1000 / 60) % 60);
    const hours = Math.floor((totalSecs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(totalSecs / (1000 * 60 * 60 * 24));
    // console.log('getTimeRemaining()', endtime, '-', totalSecs, '-', days, hours, minutes, seconds);
    return {totalSecs, days, hours, minutes, seconds};
}

function renderHHMMSS(endtime: number) {
    const t = getTimeRemaining(endtime);
    return ('0' + t.hours).slice(-2) + ':' + ('0' + t.minutes).slice(-2) + ':' + ('0' + t.seconds).slice(-2);
}

export function initializeClock(ctrl: TournamentController) {
    // console.log('initializeClock', ctrl.tournamentStatus, ctrl.secondsToStart, ctrl.secondsToFinish);
    if (ctrl.clockInterval !== null) {
        clearInterval(ctrl.clockInterval);
        ctrl.clockInterval = null;
    }

    if ('finished|archived'.includes(ctrl.tournamentStatus)) return;

    if (ctrl.system > 0 && ctrl.tournamentStatus === 'started') {
        if (ctrl.roundOngoingGames > 0) {
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [
                ngettext('%1 ongoing game', '%1 ongoing games', ctrl.roundOngoingGames),
            ]));
            return;
        }

        if (ctrl.manualNextRoundPending) {
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [
                h('span.shy', _('NEXT ROUND READY')),
                h('span', _('waiting for organizer')),
            ]));
            return;
        }

        if (ctrl.secondsToNextRound > 0) {
            const endtime = Date.now() + ctrl.secondsToNextRound * 1000;
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('span.shy', _('NEXT ROUND IN')), h('span#clock')]));
            const clock = document.getElementById('clock');

            const updatePauseClock = () => {
                const t = getTimeRemaining(endtime);
                if (clock) {
                    clock.innerHTML = renderHHMMSS(endtime);
                }
                if (t.totalSecs <= 1000 && ctrl.clockInterval !== null) {
                    clearInterval(ctrl.clockInterval);
                    ctrl.clockInterval = null;
                    ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [
                        ngettext('%1 ongoing game', '%1 ongoing games', 0),
                    ]));
                }
            };

            updatePauseClock();
            ctrl.clockInterval = setInterval(updatePauseClock, 1000);
            return;
        }

        ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [
            ngettext('%1 ongoing game', '%1 ongoing games', 0),
        ]));
        return;
    }

    let endtime: number;
    if (ctrl.secondsToFinish > 0) {
        endtime = Date.now() + ctrl.secondsToFinish * 1000;
        ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('span#clock')]));
    } else {
        endtime = Date.now() + ctrl.secondsToStart * 1000;
        const remaining = getTimeRemaining(endtime);
        if (remaining.days > 0) {
            const startDate = new Date(ctrl.startDate);
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('info-date', { attrs: { 'timestamp': startDate.toLocaleString("default", localeOptions) } })]));
        } else {
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('span.shy', _('STARTING IN')), h('span#clock')]));
        }
    }

    const clock = document.getElementById('clock');

    function updateClock() {
        const t = getTimeRemaining(endtime);

        if (clock) {
            clock.innerHTML = renderHHMMSS(endtime);
        }

        if (t.totalSecs <= 1000 && ctrl.clockInterval !== null) {
            clearInterval(ctrl.clockInterval);
            ctrl.clockInterval = null;
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv'));
        }
    }

    updateClock();
    ctrl.clockInterval = setInterval(updateClock, 1000);
}
