import { VNode } from "snabbdom/vnode";
import { h } from 'snabbdom/h';

import { Settings } from './settings';

export function radioList(settings: Settings<string>, name: string, options: { [key: string]: string }, onchange: (evt, key: string) => void): VNode[] {
    let result: VNode[] = [];
    Object.keys(options).forEach(key => {
        const id = name + "-" + key;
        result.push(h(`input#${id}`, {
            props: { name: name, type: "radio", value: key },
            attrs: { checked: settings.value === key },
            on: { change: evt => onchange(evt, key) },
        }));
        result.push(h('label', { attrs: { for: id } }, options[key]));
    });
    return result;
}

export function slider(settings: Settings<number>, name: string, min: number = 0, max: number = 100, step: number = 1) {
    return h(`input#${name}.slider`, {
        props: { name: name, type: "range", min: min, max: max, step: step, value: settings.value },
        on: { change: e => settings.value = parseFloat((e.target as HTMLInputElement).value) },
    });
}
