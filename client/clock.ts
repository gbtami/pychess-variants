// https://stackoverflow.com/questions/20618355/the-simplest-possible-javascript-countdown-timer

import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

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
    el: HTMLElement | VNode;
    id: string;
    overtime: boolean;
    byoyomi: boolean;
    byoyomiPeriod: number;
    hurry: boolean;
    ticks: boolean[];

    // game baseTime (min) and increment (sec)
    constructor(baseTime: number, increment: number, byoyomiPeriod: number, el: HTMLElement | VNode, id: string) {
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

    start(duration: number) {
        if (this.running) return;
        if (typeof duration !== "undefined") this.duration = duration;

        this.running = true;
        this.startTime = Date.now();

        var that = this;
        (function timer() {
            const diff = that.duration - (Date.now() - that.startTime);
            // console.log("timer()", that.duration, that.startTime, diff, that.hurry);
            if (diff <= HURRY && !that.hurry && !that.byoyomi) {
                that.hurry = true;
                sound.lowTime();
            }

            if (that.byoyomi) {
                for (let i = 0; i < 10; i++) {
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
                    if (that.granularity === 100 && that.increment > HURRY) that.granularity = 500;
                    that.duration = that.increment;
                    that.startTime = Date.now();
                    if (that.byoyomiCallback !== null)
                        that.byoyomiCallback();
                } else {
                    if (that.flagCallback !== null)
                        that.flagCallback();
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

    onTick(callback) {
        if (typeof callback === 'function') {
            this.tickCallbacks.push(callback);
        }
        return this;
    }

    onFlag(callback) {
        if (typeof callback === 'function') {
            this.pause(false);
            this.flagCallback = callback;
        }
        return this;
    }

    onByoyomi(callback) {
        if (typeof callback === 'function') {
            this.byoyomiCallback = callback;
        }
        return this;
    }

    pause(withIncrement: boolean) {
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

    setTime(millis: number) {
        this.duration = millis;
        renderTime(this, this.duration);
    }

    printTime(millis: number) {
        let minutes = Math.floor(millis / 60000);
        let seconds = (millis % 60000) / 1000;
        let secs, mins;
        if (Math.floor(seconds) == 60) {
            minutes++;
            seconds = 0;
        }
        minutes = Math.max(0, minutes);
        seconds = Math.max(0, seconds);
        if (millis < 10000)
            secs = seconds.toFixed(1);
        else
            secs = Math.floor(seconds).toString();
        mins = (minutes < 10 ? "0" : "") + minutes;
        secs = (seconds < 10 && secs.length < 4 ? "0" : "") + secs;
        return {
            minutes: mins,
            seconds: secs,
        };
    }

    view(time: number) {
        const printed = this.printTime(time);
        const millis = new Date(time).getUTCMilliseconds();
        return h('div#' + this.id, [
            h('div.clock', {
                class: {
                    running: this.running,
                    hurry: time < HURRY,
                    connecting: this.connecting,
                    overtime: this.overtime,
                },
            }, [
                h('div.clock-time.min', printed.minutes),
                h('div.clock-sep', { class: { low: millis < 500 } }, ':'),
                h('div.clock-time.sec', printed.seconds),
                h('div.clock-time.byo', { class: { byoyomi: (this.byoyomiPeriod > 0 && this.increment > 0) } }, `+${this.increment / 1000}s` + ((this.byoyomiPeriod > 1) ? ` (x${this.byoyomiPeriod})` : "")),
            ]),
        ]);
    }

}

export function renderTime(clock: Clock, time: number) {
    if (clock.granularity > 100 && time < HURRY) clock.granularity = 100;
    // console.log("renderTime():", time, parsed);

    clock.el = patch(clock.el, clock.view(time));
}
