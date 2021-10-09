import { h } from 'snabbdom';
import { VNode } from "snabbdom/vnode";

import { ISettings } from "./settings";

export function radioList(settings: ISettings<string>, name: string, options: { [key: string]: string }, onchange: (evt: Event, key: string) => void): VNode[] {
    const result: VNode[] = [];
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

export function slider(settings: ISettings<number>, name: string, min = 0, max = 100, step = 1) {
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

export function timeControlStr(minutes: number | string, increment = 0, byoyomiPeriod = 0): string {
    minutes = Number(minutes);
    byoyomiPeriod = Number(byoyomiPeriod)
    switch (minutes) {
        case 1 / 4:
            minutes = "¼";
            break;
        case 1 / 2:
            minutes = "½";
            break;
        case 3 / 4:
            minutes = "¾"
            break;
        default:
            minutes = String(minutes);
    }
    switch (byoyomiPeriod) {
        case 0 : return `${minutes}+${increment}`;
        case 1 : return `${minutes}+${increment}(b)`;
        default: return `${minutes}+${byoyomiPeriod}×${increment}(b)`;
    }
}
