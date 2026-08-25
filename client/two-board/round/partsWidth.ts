/**
 * The width of the column the tools parts share, published as `--bug-parts-w`.
 *
 * A preset button is sized from this rather than from the part it is in. A part is one
 * width beside the board and another once it has dropped below it, so sizing from the
 * part draws the same control at two sizes on one screen — measured at 41.6px and
 * 24.9px, which is what fixed tracks were introduced to stop. The column is the same
 * width in both states: dropping changes which areas a part spans, never the tracks.
 *
 * WHY THIS IS NOT CIRCULAR. Every mode sizes the parts track with a zero minimum —
 * `minmax(0, 1fr)` in portrait and short landscape, `minmax(0, 20vw)` in tall landscape
 * — so the track takes no minimum from its contents and a button can never widen the
 * column that decides the button. This is the same property that makes bare `1fr`
 * banned in `bughouse.css`, used deliberately.
 *
 * WHY THE TRACK AND NOT AN ELEMENT. The chat would serve, being the one part that never
 * moves, but it is a proxy: it is *in* the column and so reports the column's width
 * until the day something gives it a margin. `grid-template-columns` computes to used
 * pixel values, so the track can be read as itself.
 */

const APP = '.round-app.bug';
const COLUMN = '.bug-right-column';

/** The last track of the merged column is the one the parts share; the first is the board. */
function publish(app: HTMLElement, column: HTMLElement): void {
    const tracks = getComputedStyle(column)
        .gridTemplateColumns.split(/\s+/)
        .filter(track => track.endsWith('px'));
    const parts = parseFloat(tracks[tracks.length - 1]);

    // `none` before the grid resolves, and NaN from anything unexpected: leave the
    // variable unset rather than publishing a wrong width. The CSS falls back to the
    // button floor, which is a smaller button and never a broken track.
    if (Number.isFinite(parts)) app.style.setProperty('--bug-parts-w', `${parts}px`);
}

let observer: ResizeObserver | undefined;

/**
 * Keep it in step. The parts track changes when the column changes and when the partner
 * board does — a zoom slider moves the board's track and hands the difference to the
 * parts, leaving the column itself exactly as wide as it was. Observing only the column
 * would miss every zoom.
 */
export function trackPartsWidth(): void {
    const app = document.querySelector<HTMLElement>(APP);
    const column = app?.querySelector<HTMLElement>(COLUMN);
    if (!app || !column) return;

    publish(app, column);

    observer?.disconnect();
    observer = new ResizeObserver(() => publish(app, column));
    observer.observe(app);
    observer.observe(column);
    const stack = app.querySelector<HTMLElement>('.bug-partner-stack');
    if (stack) observer.observe(stack);
}
