import { _ } from '../i18n';

// Adapted from lila public/glyphs.json (copyright the lila authors, AGPL-3.0).
export const GLYPH_GROUPS = {
    move: [
        { id: 1, symbol: '!', name: () => _('Good move') },
        { id: 2, symbol: '?', name: () => _('Mistake') },
        { id: 3, symbol: '!!', name: () => _('Brilliant move') },
        { id: 4, symbol: '??', name: () => _('Blunder') },
        { id: 5, symbol: '!?', name: () => _('Interesting move') },
        { id: 6, symbol: '?!', name: () => _('Dubious move') },
        { id: 7, symbol: '□', name: () => _('Only move') },
        { id: 22, symbol: '⨀', name: () => _('Zugzwang') },
    ],
    position: [
        { id: 10, symbol: '=', name: () => _('Equal position') },
        { id: 13, symbol: '∞', name: () => _('Unclear position') },
        { id: 14, symbol: '⩲', name: () => _('White is slightly better') },
        { id: 15, symbol: '⩱', name: () => _('Black is slightly better') },
        { id: 16, symbol: '±', name: () => _('White is better') },
        { id: 17, symbol: '∓', name: () => _('Black is better') },
        { id: 18, symbol: '+−', name: () => _('White is winning') },
        { id: 19, symbol: '−+', name: () => _('Black is winning') },
    ],
    observation: [
        { id: 146, symbol: 'N', name: () => _('Novelty') },
        { id: 32, symbol: '↑↑', name: () => _('Development') },
        { id: 36, symbol: '↑', name: () => _('Initiative') },
        { id: 40, symbol: '→', name: () => _('Attack') },
        { id: 132, symbol: '⇆', name: () => _('Counterplay') },
        { id: 138, symbol: '⊕', name: () => _('Time trouble') },
        { id: 44, symbol: '=∞', name: () => _('With compensation') },
        { id: 140, symbol: '∆', name: () => _('With the idea') },
    ],
} as const;

export const GLYPHS = Object.values(GLYPH_GROUPS).flat();

export function toggleGlyph(nags: number[], id: number): number[] {
    if (nags.includes(id)) return nags.filter(nag => nag !== id);
    const exclusive = [GLYPH_GROUPS.move, GLYPH_GROUPS.position].find(group => group.some(glyph => glyph.id === id));
    return [...nags.filter(nag => !exclusive?.some(glyph => glyph.id === nag)), id];
}
