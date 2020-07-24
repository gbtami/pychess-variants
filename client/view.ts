import { VNode } from "snabbdom/vnode";
import { h } from 'snabbdom/h';

import { _ } from './i18n';
import { ISettings } from './settings';

export function radioList(settings: ISettings<string>, name: string, options: { [key: string]: string }, onchange: (evt, key: string) => void): VNode[] {
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

export function slider(settings: ISettings<number>, name: string, min: number = 0, max: number = 100, step: number = 1) {
    const id = name;
    return h(`input#${id}.slider`, {
        props: { name: name, type: "range", min: min, max: max, step: step, value: settings.value },
        on: { input: e => settings.value = Number((e.target as HTMLInputElement).value) },
    });
}

export function checkbox(settings: ISettings<boolean>, name: string, text: string) {
    const id = name;
    return [
        h(`input#${id}`, {
            props: { name: name, type: "checkbox" },
            attrs: { checked: settings.value },
            on: { change: evt => settings.value = (evt.target as HTMLInputElement).checked },
        }),
        h('label', { attrs: { for: id } }, text),
    ];
}

export function timeControlStr(minutes: number, increment: number = 0, byoyomiPeriod: number = 0) {
    switch (byoyomiPeriod) {
        case 0 : return `${minutes}+${increment}`;
        case 1 : return `${minutes}+${increment}(b)`;
        default: return `${minutes}+${byoyomiPeriod}x${increment}(b)`;
    }
}
