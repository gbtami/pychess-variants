import { h } from 'snabbdom';

import { _, ngettext } from './i18n';
import { patch } from './document';
import { TournamentController } from './tournament';
import { sound } from './sound';
import { notifyTournamentStarting } from './tournamentAlerts';

export const localeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
};

let countDownTimeout: ReturnType<typeof setTimeout> | null = null;

function stopStartCountDown() {
    if (countDownTimeout !== null) clearTimeout(countDownTimeout);
    countDownTimeout = null;
}

function startCountDown(targetTime: number) {
    let notified = false;

    const tick = () => {
        const secondsToStart = (targetTime - window.performance.now()) / 1000;
        const bestTick = Math.max(0, Math.round(secondsToStart));

        if (bestTick <= 10) sound.countDown(bestTick);
        if (!notified && bestTick <= 10) {
            notified = true;
            notifyTournamentStarting(_('The tournament is starting!'));
        }

        if (bestTick > 0) {
            const nextTick = Math.min(10, bestTick - 1);
            countDownTimeout = window.setTimeout(
                tick,
                1000 * Math.min(1.1, Math.max(0.8, secondsToStart - nextTick)),
            );
        } else {
            countDownTimeout = null;
        }
    };

    return tick;
}

export function syncTournamentStartAlerts(ctrl: TournamentController) {
    const startsAt = new Date(ctrl.startDate).getTime();
    const secondsToStart = Number.isFinite(startsAt)
        ? Math.max(0, (startsAt - Date.now()) / 1000)
        : ctrl.secondsToStart;

    if (ctrl.tournamentStatus !== 'created' || ctrl.userStatus !== 'joined' || secondsToStart <= 0) {
        stopStartCountDown();
        return;
    }

    if (countDownTimeout !== null || secondsToStart > 60 * 60 * 24) return;

    sound.preloadCountDown();
    countDownTimeout = window.setTimeout(
        startCountDown(window.performance.now() + 1000 * secondsToStart - 100),
        900,
    );
}

function getTimeRemaining(endtime: number) {
    const totalSecs = endtime - Date.now();

    const seconds = Math.floor((totalSecs / 1000) % 60);
    const minutes = Math.floor((totalSecs / 1000 / 60) % 60);
    const hours = Math.floor((totalSecs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(totalSecs / (1000 * 60 * 60 * 24));
    // console.log('getTimeRemaining()', endtime, '-', totalSecs, '-', days, hours, minutes, seconds);
    return { totalSecs, days, hours, minutes, seconds };
}

function renderHHMMSS(endtime: number) {
    const t = getTimeRemaining(endtime);
    return ('0' + t.hours).slice(-2) + ':' + ('0' + t.minutes).slice(-2) + ':' + ('0' + t.seconds).slice(-2);
}

export function initializeClock(ctrl: TournamentController) {
    // console.log('initializeClock', ctrl.tournamentStatus, ctrl.secondsToStart, ctrl.secondsToFinish);
    syncTournamentStartAlerts(ctrl);
    if (ctrl.clockInterval !== null) {
        clearInterval(ctrl.clockInterval);
        ctrl.clockInterval = null;
    }

    if ('finished|archived'.includes(ctrl.tournamentStatus)) return;

    if (ctrl.system > 0 && ctrl.tournamentStatus === 'started') {
        if (ctrl.roundOngoingGames > 0) {
            ctrl.clockdiv = patch(
                ctrl.clockdiv,
                h('div#clockdiv', [ngettext('%1 ongoing game', '%1 ongoing games', ctrl.roundOngoingGames)]),
            );
            return;
        }

        if (ctrl.manualNextRoundPending) {
            ctrl.clockdiv = patch(
                ctrl.clockdiv,
                h('div#clockdiv', [h('span.shy', _('NEXT ROUND READY')), h('span', _('waiting for organizer'))]),
            );
            return;
        }

        if (ctrl.secondsToNextRound > 0) {
            const endtime = Date.now() + ctrl.secondsToNextRound * 1000;
            ctrl.clockdiv = patch(
                ctrl.clockdiv,
                h('div#clockdiv', [h('span.shy', _('NEXT ROUND IN')), h('span#clock')]),
            );
            const clock = document.getElementById('clock');

            const updatePauseClock = () => {
                const t = getTimeRemaining(endtime);
                if (clock) {
                    clock.innerHTML = renderHHMMSS(endtime);
                }
                if (t.totalSecs <= 1000 && ctrl.clockInterval !== null) {
                    clearInterval(ctrl.clockInterval);
                    ctrl.clockInterval = null;
                    ctrl.clockdiv = patch(
                        ctrl.clockdiv,
                        h('div#clockdiv', [ngettext('%1 ongoing game', '%1 ongoing games', 0)]),
                    );
                }
            };

            updatePauseClock();
            ctrl.clockInterval = setInterval(updatePauseClock, 1000);
            return;
        }

        ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [ngettext('%1 ongoing game', '%1 ongoing games', 0)]));
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
            ctrl.clockdiv = patch(
                ctrl.clockdiv,
                h('div#clockdiv', [
                    h('info-date', { attrs: { timestamp: startDate.toLocaleString('default', localeOptions) } }),
                ]),
            );
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
