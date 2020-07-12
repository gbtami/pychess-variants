import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';
import trans from 'gettext.js';

import { Settings } from './settings';
import { radioList } from './view';

export const i18n = trans();
export function _(msgid) { return i18n.gettext(msgid) };

export const LANGUAGES = {
    en: "English",
    de: "Deutsch",
    es: "Español",
    fr: "Français",
    hu: "Magyar",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    pt: "Português",
    th: "ไทย",
    zh: "繁體中文",
};

const LANGUAGETEXT = {
    en: "Language",
    de: "Sprache",
    es: "Idioma",
    fr: "Langue",
    hu: "Nyelv",
    it: "Lingua",
    ja: "言語",
    ko: "언어",
    pt: "Lingua",
    th: "ภาษา",
    zh: "語言",
};

const preferredLang = window.navigator.language.slice(0, 2);
export const translatedLanguage = LANGUAGETEXT[preferredLang] ?? 'Language';

class LanguageSettings extends Settings<string> {
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
