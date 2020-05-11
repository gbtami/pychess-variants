// https://stackoverflow.com/questions/20618355/the-simplest-possible-javascript-countdown-timer

import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { i18n } from './i18n';
import { sound } from './sound';

const HURRY = 10000;


export class Clock {
    duration: number;
    increment: number;
    granularity: number;
    running: boolean;
    connecting: boolean;
    timeout: any;
    startTime: any;
    tickCallbacks: any[];
    flagCallback: any;
    byoyomiCallback: any;
    el: HTMLElement;
    id: string;
    overtime: boolean;
    byoyomi: boolean;
    byoyomiPeriod: number;
    hurry: boolean;
    ticks: boolean[];

    // game baseTime (min) and increment (sec)
    constructor(baseTime, increment, el, id, byoyomiPeriod) {
    this.duration = baseTime * 1000 * 60;
    this.increment = increment * 1000;
    this.granularity = 500;
    this.running = false;
    this.connecting = false;
    this.timeout = null;
    this.startTime = null;
    this.tickCallbacks = [];
    this.flagCallback = null;
    this.byoyomiCallback = null;
    this.el = el;
    this.id = id;
    this.overtime = false;
    this.byoyomi = byoyomiPeriod > 0;
    this.byoyomiPeriod = byoyomiPeriod;
    this.hurry = false;
    this.ticks = [false, false, false, false, false, false, false, false, false, false];

    renderTime(this, this.duration);
    }

    start = (duration) => {
        if (this.running) return;
        if (typeof duration !== "undefined") this.duration = duration;

        this.running = true;
        this.startTime = Date.now();
        var that = this;
        var diff;

        (function timer() {
            diff = that.duration - (Date.now() - that.startTime);
            // console.log("timer()", that.duration, that.startTime, diff, that.hurry);
            if (diff <= HURRY && !that.hurry && !that.byoyomi) {
                that.hurry = true;
                sound.lowTime();
            }

            if (that.byoyomi) {
                var i;
                for (i = 0; i < 10; i++) { 
                    if (diff <= 1000 * (i + 1) && !that.ticks[i]) {
                        that.ticks[i] = true;
                        sound.tick();
                        break;
                    }
                }
            }

            if (diff <= 0) {
                if (that.byoyomi && that.byoyomiPeriod > 0) {
                    sound.lowTime();
                    that.overtime = true;
                    that.byoyomiPeriod -= 1;
                    that.ticks = [false, false, false, false, false, false, false, false, false, false];
                    that.duration = that.increment;
                    that.startTime = Date.now();
                    if (that.byoyomiCallback !== null) {
                        that.byoyomiCallback();
                    }
                } else {
                    if (that.flagCallback !== null) {
                        that.flagCallback();
                    }
                    that.pause(false);
                    return;
                }
            }
            that.timeout = setTimeout(timer, that.granularity);
            that.tickCallbacks.forEach(function(callback) {
                callback.call(that, that, diff);
            }, that);
        }());
    }

    onTick = (callback) => {
        if (typeof callback === 'function') {
            this.tickCallbacks.push(callback);
        }
        return this;
    }

    onFlag = (callback) => {
        if (typeof callback === 'function') {
            this.pause(false);
            this.flagCallback = callback;
        }
        return this;
    }

    onByoyomi = (callback) => {
        if (typeof callback === 'function') {
            this.byoyomiCallback = callback;
        }
        return this;
    }

    pause = (withIncrement) => {
        if (!this.running) return;

        this.running = false;
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = null;

        this.duration -= Date.now() - this.startTime;
        if (withIncrement && this.increment) {
            if (this.byoyomi) {
                if (this.overtime) {
                    this.duration = this.increment;
                    this.ticks = [false, false, false, false, false, false, false, false, false, false];
                }
            } else {
                this.duration += this.increment;
                this.hurry = (this.duration < HURRY);
            }
        }
        renderTime(this, this.duration);
    }

    setTime = (millis) => {
        this.duration = millis;
        renderTime(this, this.duration);
    }

    parseTime = (millis) => {
        let minutes = Math.floor(millis / 60000);
        let seconds = (millis % 60000) / 1000;
        let secs, mins;
        if (Math.floor(seconds) == 60) {
            minutes++;
            seconds = 0;
        }
        minutes = Math.max(0, minutes);
        seconds = Math.max(0, seconds);
        if (millis < 10000) {
            secs = seconds.toFixed(1);
        } else {
            secs = String(Math.floor(seconds));
        }
        mins = (minutes < 10 ? "0" : "") + String(minutes);
        secs = (seconds < 10 && secs.length < 4 ? "0" : "") + secs;
        return {
            minutes: mins,
            seconds: secs,
        };
    }
}

export function renderTime(clock, time) {
    if (clock.granularity > 100 && time < HURRY) clock.granularity = 100;
    const parsed = clock.parseTime(time);
    // console.log("renderTime():", time, parsed);

    const date = new Date(time);
    const millis = date.getUTCMilliseconds();
    clock.el = patch(clock.el, h('div.clock-wrap#' + clock.id, [
        h('div.clock', [
            h('div.clock.time.min', {class: {running: clock.running, hurry: time < HURRY, connecting: clock.connecting, overtime: clock.overtime}}, parsed.minutes),
            h('div.clock.sep', {class: {running: clock.running, hurry: time < HURRY, low: millis < 500, connecting: clock.connecting, overtime: clock.overtime}} , ':'),
            h('div.clock.time.sec', {class: {running: clock.running, hurry: time < HURRY, connecting: clock.connecting, overtime: clock.overtime}}, parsed.seconds),
            h('div.clock.time.byo', {class: {running: clock.running, hurry: time < HURRY, connecting: clock.connecting, overtime: clock.overtime, byoyomi: (clock.byoyomiPeriod > 0 && clock.increment > 0)}}, `+${clock.increment / 1000}s` + ((clock.byoyomiPeriod > 1) ? ` (x${clock.byoyomiPeriod})` : "")),
        ])
    ])
    );
}

export function timeago(date) {
    const TZdate = new Date(date + 'Z');
    var val = 0 | (Date.now() - TZdate.getTime()) / 1000;
    var unit, length = { second: 60, minute: 60, hour: 24, day: 7, week: 4.35,
        month: 12, year: 10000 }, result;

    for (unit in length) {
        result = val % length[unit];
        if (!(val = 0 | val / length[unit])) {
            switch (unit) {
            case "year":
                return i18n.ngettext("%1 year ago", "%1 years ago", result);
            case "month":
                return i18n.ngettext("%1 month ago", "%1 months ago", result);
            case "week":
                return i18n.ngettext("%1 week ago", "%1 weeks ago", result);
            case "day":
                return i18n.ngettext("%1 day ago", "%1 days ago", result);
            case "hour":
                return i18n.ngettext("%1 hour ago", "%1 hours ago", result);
            case "minute":
                return i18n.ngettext("%1 minute ago", "%1 minutes ago", result);
            case "second":
                return i18n.ngettext("%1 second ago", "%1 seconds ago", result);
            }
        }
    }
    return '';
}

export function renderTimeago() {
    var x = document.getElementsByTagName("info-date");
    var i;
    for (i = 0; i < x.length; i++) {
        x[i].innerHTML = timeago(x[i].getAttribute('timestamp'));
    }
    setTimeout(renderTimeago, 1200);
}
