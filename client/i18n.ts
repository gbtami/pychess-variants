import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { StringSettings } from './settings';
import { radioList } from './view';
import trans from "gettext.js";

export const i18n = new trans();;//simplest workaround i found for the Error TS7009 here: https://stackoverflow.com/a/51622913
export function _(msgid: string, ...vars: any) { return (i18n as any).gettext(msgid, vars); }
export function ngettext(msgid: string, plural: string, ...vars: any) { return (i18n as any).ngettext(msgid, plural, vars); }
export function pgettext(msgctxt: string, msgid: string, ...vars: any) { return (i18n as any).pgettext(msgctxt, msgid, vars); }

export const LANGUAGES = {
    en: "English",
    de: "Deutsch",
    es: "Español",
    fr: "Français",
    gl_ES: "Galego",
    hu: "Magyar",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    pl: "Polskie",
    pt: "Português",
    th: "ไทย",
    tr: "Türkçe",
    zh: "简体中文",
};

const LANGUAGETEXT: {[key:string]: string} = {
    en: "Language",
    de: "Sprache",
    es: "Idioma",
    fr: "Langue",
    gl_ES: "Lingua",
    hu: "Nyelv",
    it: "Lingua",
    ja: "言語",
    ko: "언어",
    pl: "Język ",
    pt: "Lingua",
    th: "ภาษา",
    tr: "Dil",
    zh: "语言",
};

const preferredLang = window.navigator.language.slice(0, 2);
export const translatedLanguage = LANGUAGETEXT[preferredLang] ?? 'Language';

class LanguageSettings extends StringSettings {
    constructor() {
        super('lang', 'en');
    }

    update(): void {
    }

    view(): VNode {
        const langList = radioList(
            this,
            'lang',
            LANGUAGES,
            (evt, key) => {
                this.value = key;
                (evt.target as HTMLInputElement).form!.submit();
            }
        );
        return h('div#settings-lang', [
            h('form.radio-list', { props: { method: "post", action: "/translation/select" } }, langList),
        ]);
    }
}

export const languageSettings = new LanguageSettings();
