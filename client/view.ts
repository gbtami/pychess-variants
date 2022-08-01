import { h, VNode } from 'snabbdom';

import * as idb from 'idb-keyval';

import { ISettings } from "./settings";
import { _ } from './i18n';

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

export function slider(settings: ISettings<number>, name: string, min = 0, max = 100, step = 1, text: string) {
    const id = name;
    return [
        h(`input#${id}.slider`, {
            props: { name: name, type: "range", min: min, max: max, step: step, value: settings.value },
            on: { input: e => settings.value = Number((e.target as HTMLInputElement).value) },
        }),
        h('label', { attrs: { for: id } }, text),
    ];
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

export function nnueFile(settings: ISettings<string>, name: string, text: string, variant: string) {
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

function saveNnueFileToIdb (settings: ISettings<string>, variant: string, file: File) {
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