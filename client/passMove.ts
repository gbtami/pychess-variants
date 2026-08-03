import { Api } from 'chessgroundx/api';
import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

const PASS_MOVE_CLASS = 'pass-move';
const pendingLocalPasses = new WeakMap<Api, cg.Key>();

function isPieceNode(node: Element): node is cg.PieceNode {
    return node.tagName === 'PIECE';
}

export function clearPassMoveAnimation(api: Api): void {
    const animatedPieces = api.state.dom.elements.board.querySelectorAll(`piece.${PASS_MOVE_CLASS}`);
    animatedPieces.forEach(piece => {
        piece.classList.remove(PASS_MOVE_CLASS);
        if (piece instanceof HTMLElement) piece.style.removeProperty('--pass-move-transform');
    });
}

/** Animate the occupied square used to encode a pass move. */
export function animatePassMove(
    api: Api,
    passEnabled: boolean,
    lastMove: readonly cg.Orig[] | undefined,
    optimistic = false,
): void {
    const reducedMotion =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
        !passEnabled ||
        !api.state.animation.enabled ||
        reducedMotion ||
        !lastMove ||
        lastMove.length < 2 ||
        lastMove[0] !== lastMove[1] ||
        !util.isKey(lastMove[0]) ||
        lastMove[0] === 'a0'
    ) {
        pendingLocalPasses.delete(api);
        return;
    }

    const board = api.state.dom.elements.board;
    const key = lastMove[0];

    if (!optimistic && pendingLocalPasses.get(api) === key) {
        pendingLocalPasses.delete(api);
        return;
    }

    const piece = Array.from(board.children).find(
        (node): node is cg.PieceNode => isPieceNode(node) && node.cgKey === key,
    );
    if (!piece) return;
    if (optimistic) pendingLocalPasses.set(api, key);
    if (piece.classList.contains(PASS_MOVE_CLASS)) return;

    clearPassMoveAnimation(api);

    const positionTransform = piece.style.transform || getComputedStyle(piece).transform;
    piece.style.setProperty(
        '--pass-move-transform',
        positionTransform === 'none' ? 'translate(0px, 0px)' : positionTransform,
    );

    // Flush the removed class before starting another pass animation.
    void piece.getBoundingClientRect();
    piece.addEventListener(
        'animationend',
        () => {
            piece.classList.remove(PASS_MOVE_CLASS);
            piece.style.removeProperty('--pass-move-transform');
        },
        { once: true },
    );
    piece.classList.add(PASS_MOVE_CLASS);
}
