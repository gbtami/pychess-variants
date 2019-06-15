// https://stackoverflow.com/questions/20618355/the-simplest-possible-javascript-countdown-timer

import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

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
    el: HTMLElement;

    // game baseTime (min) and increment (sec)
    constructor(baseTime, increment, el) {
    this.duration = baseTime * 1000 * 60;
    this.increment = increment * 1000;
    this.granularity = 500;
    this.running = false;
    this.connecting = false;
    this.timeout = null;
    this.startTime = null;
    this.tickCallbacks = [];
    this.flagCallback = null;
    this.el = el;

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
            // console.log("timer()", that.duration - diff);
            if (diff <= 0) {
                that.flagCallback();
                that.pause(false);
                return;
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

    pause = (withIncrement) => {
        if (!this.running) return;

        this.running = false;
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = null;

        this.duration -= Date.now() - this.startTime;
        if (withIncrement && this.increment) this.duration += this.increment;
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
        secs = (seconds < 10 ? "0" : "") + secs;
        return {
            minutes: mins,
            seconds: secs,
        };
    }
}

export function renderTime(clock, time) {
    if (clock.granularity > 100 && time < 10000) clock.granularity = 100;
    const parsed = clock.parseTime(time);
    // console.log("renderTime():", time, parsed);

    const date = new Date(time);
    const millis = date.getUTCMilliseconds();
    clock.el = patch(clock.el, h('div.clock', [
        h('div.clock.time.min', {class: {running: clock.running, hurry: time < 10000, connecting: clock.connecting}}, parsed.minutes),
        h('div.clock.sep', {class: {running: clock.running, hurry: time < 10000, low: millis < 500, connecting: clock.connecting}} , ':'),
        h('div.clock.time.sec', {class: {running: clock.running, hurry: time < 10000, connecting: clock.connecting}}, parsed.seconds),
        ]));
}
