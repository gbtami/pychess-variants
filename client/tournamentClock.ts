import { h } from 'snabbdom';

import { _ } from './i18n';
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

export function initializeClock(ctrl: TournamentController) {
    // console.log('initializeClock', ctrl.tournamentStatus, ctrl.secondsToStart, ctrl.secondsToFinish);
    if ('finished|archived'.includes(ctrl.tournamentStatus)) return;

    let endtime: number, timeinterval: ReturnType<typeof setInterval>;
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

        clock!.innerHTML = ('0' + t.hours).slice(-2) + ':' + ('0' + t.minutes).slice(-2) + ':' + ('0' + t.seconds).slice(-2);

        if (t.totalSecs <= 1000 && timeinterval !== undefined) {
            clearInterval(timeinterval);
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv'));
        }
    }

    updateClock();
    timeinterval = setInterval(updateClock, 1000);
}
