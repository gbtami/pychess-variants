import trans from './gettext.cjs.min.js';

export const i18n = trans();
export function _(msgid) {return i18n.gettext(msgid)};

export const LANGUAGES = {
    en: "English",
    de: "Deutsch",
    es: "Español",
    fr: "Français",
    hu: "Hungarian", // TODO use native name
    it: "Italiano",
    ja: "日本語",
    ko: "Korean", // TODO use native name
    pt: "Portuguese", // TODO use native name
    th: "ไทย",
    zh: "Traditional Chinese", // TODO use native name
};
