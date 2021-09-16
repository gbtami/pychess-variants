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
    timeout: number | null;
    startTime: number;
    tickCallbacks: ((diff: number) => void)[];
    flagCallback: (() => void) | null;
    byoyomiCallback: (() => void) | null;
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
        this.startTime = 0;
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

        this.renderTime(this.duration);
    }

    start(duration = 0) {
        if (this.running) return;
        if (duration !== 0) this.duration = duration;

        this.running = true;
        this.startTime = Date.now();

        const timer = () => {
            const diff = this.duration - (Date.now() - this.startTime);
            if (diff <= HURRY && !this.hurry && !this.byoyomi) {
                this.hurry = true;
                sound.lowTime();
            }

            if (this.byoyomi && this.byoyomiPeriod === 0) {
                for (let i = 0; i < 10; i++) {
                    if (diff <= 1000 * (i + 1) && !this.ticks[i]) {
                        this.ticks[i] = true;
                        sound.tick();
                        break;
                    }
                }
            }

            if (diff <= 0) {
                if (this.byoyomi && this.byoyomiPeriod > 0) {
                    sound.lowTime();
                    this.overtime = true;
                    this.byoyomiPeriod -= 1;
                    this.ticks = [false, false, false, false, false, false, false, false, false, false];
                    if (this.granularity === 100 && this.increment > HURRY) this.granularity = 500;
                    this.duration = this.increment;
                    this.startTime = Date.now();
                    if (this.byoyomiCallback !== null)
                        this.byoyomiCallback();
                } else {
                    if (this.flagCallback !== null)
                        this.flagCallback();
                    this.pause(false);
                    return;
                }
            }
            this.timeout = setTimeout(timer, this.granularity);
            this.tickCallbacks.forEach(function(callback) {
                callback.call(this, diff);
            }, this);
        };

        timer();
    }

    onTick(callback: (diff: number) => void) {
        if (typeof callback === 'function') {
            this.tickCallbacks.push(callback);
        }
        return this;
    }

    onFlag(callback: () => void) {
        if (typeof callback === 'function') {
            this.pause(false);
            this.flagCallback = callback;
        }
        return this;
    }

    onByoyomi(callback: () => void) {
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
        this.renderTime(this.duration);
    }

    setTime(millis: number) {
        this.duration = millis;
        this.renderTime(this.duration);
    }

    printTime(millis: number) {
        let minutes = Math.floor(millis / 60000);
        let seconds = (millis % 60000) / 1000;
        let secs, mins;
        if (Math.floor(seconds) === 60) {
            minutes++;
            seconds = 0;
        }
        minutes = Math.max(0, minutes);
        seconds = Math.max(0, seconds);
        if (millis < HURRY && this.byoyomiPeriod === 0)
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
                    hurry: time < HURRY && this.byoyomiPeriod === 0,
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

    renderTime(time: number) {
        if (this.granularity > 100 && time < HURRY)
            this.granularity = 100;
        this.el = patch(this.el, this.view(time));
    }

}
