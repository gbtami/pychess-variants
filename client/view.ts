import { h, VNode } from 'snabbdom';

import * as idb from 'idb-keyval';

import { Settings } from "./settings";
import { _ } from './i18n';

export function radioList(settings: Settings<string>, name: string, options: { [key: string]: string }, onchange: (evt: Event, key: string) => void): VNode[] {
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

export function slider(settings: Settings<number>, name: string, min = 0, max = 100, step = 1, text: string) {
    const id = name;
    return [
        h(`input#${id}.slider`, {
            props: { name: name, type: "range", min: min, max: max, step: step, value: settings.value },
            on: { input: e => settings.value = Number((e.target as HTMLInputElement).value) },
        }),
        h('label', { attrs: { for: id } }, text),
    ];
}

export function checkbox(settings: Settings<boolean>, name: string, text: string) {
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

export function nnueFile(settings: Settings<string>, name: string, text: string, variant: string) {
    const id = name;
    return [
        h(`input#${id}`, {
            props: { name: name, type: "file", accept: '*.nnue', title: _('Page reload required after change') },
            on: { change: evt => {
                const files = (evt.target as HTMLInputElement).files;
                if (files && files.length > 0) {
                    const fileName = files[0].name;
                    if (possibleNnueFile(fileName, variant)) {
                        settings.value = '';
                        console.log("Selected file:", fileName);

                        idb.get(`${variant}--nnue-file`).then((nnuefile) => {
                            if (nnuefile === undefined) {
                                // First time .nnue file selection ever for this variant
                                saveNnueFileToIdb(settings, variant, files[0]);
                            } else {
                                if (nnuefile === fileName) {
                                    console.log(variant, 'is already in idb.');
                                } else {
                                    // Delete old file name version info
                                    idb.del(`${variant}--nnue-file`);
                                    // Update idb with new .nnue file 
                                    saveNnueFileToIdb(settings, variant, files[0]);
                                }
                            }
                        });
                    }
                }
            }},
        }),
        h('label', { attrs: { for: id } }, text),
    ];
}

function saveNnueFileToIdb (settings: Settings<string>, variant: string, file: File) {
    const fileName = file.name;
    var fileReader = new FileReader();
    fileReader.onload = function(event) {
        idb.set(`${variant}--nnue-data`, event.target!.result)
            .then(() => {
                idb.set(`${variant}--nnue-file`, fileName)
                .then((nnuefile) => {
                    settings.value = fileName;
                    console.log(`${nnuefile} saved!`);
                })
                .catch((err) => {
                    alert(err);
                })
            })
            .catch((err) => {
                alert(err);
            });
    };
    fileReader.readAsArrayBuffer(file);
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

export function spinner(): VNode {
    return h('div#loader', [
        h('svg', { attrs: { viewBox: '0 0 67.81 57.08' } }, [
            h('g', [ 
                h('path.spinner', { attrs: { d: 'M7,13a.73.73,0,0,0,.87.23,14.2,14.2,0,0,0,2.67-1.45,2.39,2.39,0,0,0,1.06-1.37c.16-1.5-1.84-1.34-1-2s2.33-1.5,2.66,0-.85,4-3.08,5.2c0,0-3.89,2.3-5.54,3.59a14.48,14.48,0,0,0-3.29,15c2.91,8.25,8.41,10.46,10.54,11.21S5.81,53.89,5.2,54.77c-.42.6-.31.75,0,1.17s1.17,1,1.69.41,10.44-6,12.44-10,4-8,5.79-8.08,2.79,1.08,1.87,3a15.46,15.46,0,0,1-3,4.54c-.75.59,2.15,1.71,3.31.34s5-6.59,6.15-10.75,1.79-5.3,1.25-8.71-1.23-5.67-.88-7.46,5.88-8.92,7.67-9.88-4.66,6.84-5.25,9.13-.5,4,.17,7.12.17,6.21-1.46,10.21-3.71,7-3,9.29,2.71,3.42,3.67,3.34,9.33-.84,12.17-2,15.42-6.76,18.75-15.25S59.81,11.24,57,8.81C53.83,6,42.37-3.06,32.16,2S17.26,19.93,16.7,22s-2,5.23-3.79,5.42c-2,.21-3.75-.67-4.29-1.8a3.47,3.47,0,0,1,1-4.5C11.53,19.81,16,16.77,17.28,15s3.21-4.08,1.79-8.5-6.75-3.88-6.75-3.88S7.18,3.12,6,5.27a4.59,4.59,0,0,0-.42,4.5A13.74,13.74,0,0,0,7,13Z' } }),
                h('circle.spinner', { attrs: { cx: '25.03', cy: '23', r: '3.07' } }),
            ]),
        ]),
    ]);
}

function possibleNnueFile(fileName: string, variant: string) {
    let possible: boolean;
    let prefix: string;

    switch (variant) {
    case 'chess' :
    case 'placement' :
        prefix = 'nn';
        break;
    case 'cambodian' :
        prefix = 'makruk';
        break;
    default:
        prefix = variant;
    }

    possible = fileName.startsWith(`${prefix}-`);
    if (!possible) {
        alert(`.nnue file name required to start with ${prefix}-`);
    }
    return possible;
}
