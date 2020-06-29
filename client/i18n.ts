import trans from './gettext.cjs.min.js';

export const i18n = trans();
export function _(msgid) {return i18n.gettext(msgid)};

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
