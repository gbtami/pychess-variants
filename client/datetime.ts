import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { _, ngettext } from './i18n';

export const localeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
};

export function timeago(date) {
    const TZdate = new Date(date + 'Z');
    const maxLength = { second: 60, minute: 60, hour: 24, day: 7, week: 4.35, month: 12, year: 10000 };
    let val = (Date.now() - TZdate.getTime()) / 1000;

    for (const unit in maxLength) {
        if (Math.floor(val / maxLength[unit]) === 0) {
            const result = Math.floor(val);
            switch (unit) {
                case "year":
                    return ngettext("%1 year ago", "%1 years ago", result);
                case "month":
                    return ngettext("%1 month ago", "%1 months ago", result);
                case "week":
                    return ngettext("%1 week ago", "%1 weeks ago", result);
                case "day":
                    return ngettext("%1 day ago", "%1 days ago", result);
                case "hour":
                    return ngettext("%1 hour ago", "%1 hours ago", result);
                case "minute":
                    return ngettext("%1 minute ago", "%1 minutes ago", result);
                case "second":
                    return ngettext("%1 second ago", "%1 seconds ago", result);
            }
        }
        val = val / maxLength[unit];
    }
    return '';
}

export function renderTimeago() {
    const x = document.getElementsByTagName("info-date");
    for (let i = 0; i < x.length; i++)
        x[i].innerHTML = timeago(x[i].getAttribute('timestamp'));
    setTimeout(renderTimeago, 1200);
}

function getTimeRemaining(endtime: number) {

    const totalSecs = endtime - Date.now();

    const seconds = Math.floor((totalSecs / 1000) % 60);
    const minutes = Math.floor((totalSecs / 1000 / 60) % 60);
    const hours = Math.floor((totalSecs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(totalSecs / (1000 * 60 * 60 * 24));
    console.log('getTimeRemaining()', endtime, '-', totalSecs, '-', days, hours, minutes, seconds);
    return {totalSecs, days, hours, minutes, seconds};
}

export function initializeClock(ctrl) {
    // console.log('initializeClock', ctrl.tournamentStatus, ctrl.secondsToStart, ctrl.secondsToFinish);
    if ('finished|archived'.includes(ctrl.tournamentStatus)) return;

    let endtime;
    if (ctrl.secondsToFinish > 0) {
        endtime = Date.now() + ctrl.secondsToFinish * 1000;
        ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('span#clock')]));
    } else {
        endtime = Date.now() + ctrl.secondsToStart * 1000;
        const remaining = getTimeRemaining(endtime);
        if (remaining.days > 0) {
            const startDate = new Date(ctrl.model["date"]);
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('info-date', startDate.toLocaleString("default", localeOptions))]));
        } else {
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv', [h('span.shy', _('STARTING IN')), h('span#clock')]));
        }
    }

    const clock = document.getElementById('clock');

    function updateClock() {
        const t = getTimeRemaining(endtime);

        clock!.innerHTML = ('0' + t.hours).slice(-2) + ':' + ('0' + t.minutes).slice(-2) + ':' + ('0' + t.seconds).slice(-2);

        if (t.totalSecs <= 1000) {
            clearInterval(timeinterval);
            ctrl.clockdiv = patch(ctrl.clockdiv, h('div#clockdiv'));
        }
    }

    updateClock();
    const timeinterval = setInterval(updateClock, 1000);
}
