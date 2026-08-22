/**
 * The two square colours of a board theme, so that something drawn ON a square can be
 * given the colour of the other square and stay legible.
 *
 * WHY A TABLE. A board's squares come from an image — `--board-image`, an SVG or a
 * photograph — so there is no colour in the stylesheet to read. The values here were
 * extracted from those images rather than invented: the `fill` attributes for the SVG
 * themes, and the mean of a patch at the centre of two adjacent squares for the
 * photographic ones, which have no flat colour at all.
 *
 * The pairs are ordered light first, decided by luminance rather than by the order the
 * image happens to declare them — `8x8ic` and `8x8purple` both declare the darker colour
 * first, so trusting file order would have inverted them.
 *
 * `8x8santa` is red and green squares. "Light" and "dark" are still the two square
 * colours, so the rule still applies and still contrasts; it just reads as a novelty,
 * which is what that theme is.
 *
 * Only the standard 8x8 family is listed, because that is the family whose page needs
 * this. A theme with no entry publishes nothing and whatever reads these falls back.
 *
 * ADDING A THEME. One line, keyed by the same filename that goes in `boardCSS`. Get the
 * pair from the image rather than by eye, the way these were:
 *
 * ```python
 * # flat SVG themes: the two fills, in declaration order
 * re.findall(r'fill="(#[0-9a-fA-F]{3,6})"', open('8x8blue.svg').read())[:2]
 *
 * # photographic themes: the mean of a patch at the centre of two adjacent squares
 * im = Image.open('8x8maple.jpg').convert('RGB'); sq = im.size[0] // 8
 * [mean_of_patch(im, sq // 2, sq // 2), mean_of_patch(im, sq + sq // 2, sq // 2)]
 * ```
 *
 * Then order the pair by luminance — `0.2126 R + 0.7152 G + 0.0722 B`, light first —
 * and do not trust the order the file gives you: `8x8ic` and `8x8purple` both declare
 * their darker colour first, and taking file order would have inverted them.
 *
 * A theme whose board is not a checkerboard has no pair to give. `8x8dobutsu.svg` is a
 * wooden shogi-style board, so it is deliberately absent and falls back.
 */

type SquarePair = readonly [light: string, dark: string];

const BOARD_SQUARE_COLORS: Readonly<Record<string, SquarePair>> = {
    '8x8brown.svg': ['#f0d9b5', '#b58863'],
    '8x8blue.svg': ['#dee3e6', '#8ca2ad'],
    '8x8green.svg': ['#ffffdd', '#86a666'],
    '8x8maple.jpg': ['#debd91', '#b56f3b'],
    '8x8olive.jpg': ['#ada694', '#847b69'],
    '8x8santa.png': ['#015000', '#c80000'],
    '8x8wood2.jpg': ['#967b4e', '#775d2f'],
    '8x8wood4.jpg': ['#bb9861', '#835834'],
    '8x8ic.svg': ['#ececec', '#c1c18e'],
    '8x8purple.svg': ['#9f90b0', '#7d4a8d'],
};

/**
 * Publish a theme's square colours on an element, for its subtree to use.
 *
 * Set beside `--board-image` and from the same filename, so the colours cannot drift
 * away from the board they describe: changing the theme rewrites both or neither.
 * A theme with no entry — `8x8dobutsu.svg` is a wooden board rather than a
 * checkerboard, and every non-chess family — clears them rather than leaving the
 * previous theme's colours behind.
 */
export function setSquareColors(target: HTMLElement, boardCSS: string): void {
    const pair = BOARD_SQUARE_COLORS[boardCSS];
    if (pair) {
        target.style.setProperty('--cg-light', pair[0]);
        target.style.setProperty('--cg-dark', pair[1]);
    } else {
        target.style.removeProperty('--cg-light');
        target.style.removeProperty('--cg-dark');
    }
}
