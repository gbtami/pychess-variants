import { expect, test } from '@jest/globals';
import { GLYPHS, toggleGlyph } from '../client/analysis/glyphs';

test('glyph picker uses the Lichess groups and standard PGN IDs', () => {
    expect(GLYPHS).toHaveLength(24);
    expect(GLYPHS.find(g => g.id === 14)?.symbol).toBe('⩲');
    expect(GLYPHS.find(g => g.id === 146)?.symbol).toBe('N');
    expect(toggleGlyph([1, 14, 146, 200], 3)).toEqual([14, 146, 200, 3]);
    expect(toggleGlyph([3, 14, 146], 17)).toEqual([3, 146, 17]);
    expect(toggleGlyph([3, 146], 40)).toEqual([3, 146, 40]);
    expect(toggleGlyph([3, 146], 146)).toEqual([3]);
});
