import { afterEach, expect, test } from '@jest/globals';

import { boardSettings } from '../client/boardSettings';
import { pieceStyleClass } from '../client/document';
import { updateMaterial } from '../client/material';
import { VARIANTS } from '../client/variants';

afterEach(() => {
    document.body.innerHTML = '';
});

test('Jieqi material keeps the active piece-style class after re-render', () => {
    const variant = VARIANTS.jieqi;
    const expectedClass = pieceStyleClass(variant.pieceFamily, boardSettings.pieceCSS(variant.pieceFamily, variant));

    const top = document.createElement('div');
    const bottom = document.createElement('div');
    document.body.appendChild(top);
    document.body.appendChild(bottom);

    const [, renderedBottom] = updateMaterial(
        variant,
        variant.startFen,
        top,
        bottom,
        false,
        'white',
        [{ role: 'p-piece', color: 'white', kind: 'covered-hidden' }],
    );

    expect((renderedBottom.elm as HTMLElement).classList.contains(expectedClass)).toBe(true);
});
