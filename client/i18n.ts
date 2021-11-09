import { h } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import gettext from 'gettext.js';

import { StringSettings } from './settings';
import { radioList } from './view';

export const i18n = gettext();
export function _(msgid: string, ...vars: any) { return i18n.gettext(msgid, vars); }
export function ngettext(msgid: string, plural: string, ...vars: any) { return i18n.ngettext(msgid, plural, vars); }
export function pgettext(msgctxt: string, msgid: string, ...vars: any) { return i18n.pgettext(msgctxt, msgid, vars); }

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
    nl: "Nederlands",
    pl: "Polskie",
    pt: "Português",
    ru: "Pусский",
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
    nl: "Taal",
    pl: "Język ",
    pt: "Lingua",
    ru: "Язык",
    th: "ภาษา",
    tr: "Dil",
    zh: "语言",
};

const preferredLang = window.navigator.language.slice(0, 2);
export const translatedLanguage = LANGUAGETEXT[preferredLang] ?? 'Language';

// Do not use
// These lists are only here to mark these texts translatable
// Use the regular translate functions if these words are determined at runtime
export const translatedColorNames = [
    _("White"), _("Black"), _("Red"),
    _("Blue"), _("Gold"), _("Pink"),
];

export const translatedVariantDisplayNames = [
    _("chess"), _("crazyhouse"), _("placement"), _("atomic"),

    _("makruk"), _("makpong"), _("ouk chatrang"), _("sittuyin"), _("asean"),

    _("shogi"), _("minishogi"), _("kyoto shogi"),
    _("dobutsu"), _("gorogoro"), _("tori shogi"),

    _("xiangqi"), _("manchu"), _("janggi"), _("minixiangqi"),

    _("capablanca"), _("capahouse"), _("s-chess"), _("s-house"),
    _("grand"), _("grandhouse"), _("shako"), _("shogun"), _("hoppel-poppel"),

    _("orda"), _("synochess"), _("shinobi"), _("empire"), _("orda mirror"),
];

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
