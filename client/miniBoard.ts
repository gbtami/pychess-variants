export function readMiniBoardWidth(boardWrap: HTMLElement): string {
    const computedStyle = getComputedStyle(boardWrap);
    const miniWidth = computedStyle.getPropertyValue('--mini-board-width').trim();
    if (miniWidth !== '') return miniWidth;

    const width = computedStyle.width.trim();
    if (width !== '' && width !== 'auto') return width;

    const measuredWidth = boardWrap.getBoundingClientRect().width;
    return measuredWidth > 0 ? `${measuredWidth}px` : '256px';
}

export function sizeMiniBoardHost(boardWrap: HTMLElement): HTMLElement | undefined {
    const miniWidth = readMiniBoardWidth(boardWrap);
    boardWrap.style.width = miniWidth;
    boardWrap.style.maxWidth = '100%';

    const boardHost = boardWrap.parentElement;
    if (boardHost instanceof HTMLElement) {
        boardHost.style.width = miniWidth;
        boardHost.style.maxWidth = '100%';
        return boardHost;
    }

    return undefined;
}
