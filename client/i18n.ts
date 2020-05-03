import trans from './gettext.cjs.min.js';

export const i18n = trans();
export function _(msgid) {return i18n.gettext(msgid)};
