import { afterEach, describe, expect, test } from '@jest/globals';

import { initPracticeIndex, practiceVariantUrl } from '../client/practice';

afterEach(() => {
    document.body.replaceChildren();
});

describe('Practice index variant navigation', () => {
    test('encodes variant keys in Practice URLs', () => {
        expect(practiceVariantUrl('chess960')).toBe('/practice/chess960');
        expect(practiceVariantUrl('custom variant')).toBe('/practice/custom%20variant');
    });

    test('restores the server-selected variant after browser history pageshow', () => {
        document.body.innerHTML = `
            <select data-practice-variant-select data-practice-current-variant="chess">
                <option value="chess">Chess</option>
                <option value="shogi">Shogi</option>
            </select>
        `;
        const select = document.querySelector<HTMLSelectElement>('[data-practice-variant-select]')!;
        select.value = 'shogi';

        initPracticeIndex();
        expect(select.value).toBe('chess');

        // A bfcache restore can preserve the user's pre-navigation selection. The
        // Practice page must instead reflect the variant encoded by the restored URL.
        select.value = 'shogi';
        window.dispatchEvent(new Event('pageshow'));
        expect(select.value).toBe('chess');
    });
});
