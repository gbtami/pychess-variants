import { init, h } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { _, ngettext } from './i18n';
import TournamentController from "./tournament";

export const localeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
};

export function timeago(date: string) {
    const TZdate = (new Date(date)).getTime();
    const maxLength: {[key:string]: number} = { second: 60, minute: 60, hour: 24, day: 7, week: 4.35, month: 12, year: 10000 };
    let val, inTheFuture;
    if (Date.now() >= TZdate) {
        val = (Date.now() - TZdate) / 1000;
        inTheFuture = false;
    } else {
        val = (TZdate - Date.now()) / 1000;
        inTheFuture = true;
    }

    for (const unit in maxLength) {
        if (Math.floor(val / maxLength[unit]) === 0) {
            const result = Math.floor(val);
            switch (unit) {
                case "year":
                    return inTheFuture ? ngettext("in %1 year", "in %1 years", result) : ngettext("%1 year ago", "%1 years ago", result);
                case "month":
                    return inTheFuture ? ngettext("in %1 month", "in %1 months", result) : ngettext("%1 month ago", "%1 months ago", result);
                case "week":
                    return inTheFuture ? ngettext("in %1 week", "in %1 weeks", result) : ngettext("%1 week ago", "%1 weeks ago", result);
                case "day":
                    return inTheFuture ? ngettext("in %1 day", "in %1 days", result) : ngettext("%1 day ago", "%1 days ago", result);
                case "hour":
                    return inTheFuture ? ngettext("in %1 hour", "in %1 hours", result) : ngettext("%1 hour ago", "%1 hours ago", result);
                case "minute":
                    return inTheFuture ? ngettext("in %1 minute", "in %1 minutes", result) : ngettext("%1 minute ago", "%1 minutes ago", result);
                case "second":
                    return inTheFuture ? ngettext("in %1 second", "in %1 seconds", result) : ngettext("%1 second ago", "%1 seconds ago", result);
            }
        }
        val = val / maxLength[unit];
    }
    return '';
}

export function renderTimeago() {
    const els = document.getElementsByTagName("info-date");
    Array.from(els).forEach((el) => {el.innerHTML = timeago(el.getAttribute('timestamp') ?? "unknown when");});
    setTimeout(renderTimeago, 1200);
}

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

    let endtime: number, timeinterval: number;
    if (ctrl.secondsToFinish > 0) {
        endtime = Date.now() + ctrl.secondsToFinish * 1000;
        ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('span#clock')]));
    } else {
        endtime = Date.now() + ctrl.secondsToStart * 1000;
        const remaining = getTimeRemaining(endtime);
        if (remaining.days > 0) {
            const startDate = new Date(ctrl.model["date"]);
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
