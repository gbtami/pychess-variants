import { Api } from 'chessgroundx/api';
import * as cg from 'chessgroundx/types';

import { animatePassMove, clearPassMoveAnimation } from '@/passMove';

function setup(animationEnabled = true): { api: Api; pieces: Record<string, cg.PieceNode> } {
    document.body.innerHTML = '<cg-board><piece></piece><piece></piece></cg-board>';
    const board = document.querySelector('cg-board') as HTMLElement;
    const [first, second] = Array.from(board.querySelectorAll('piece')) as cg.PieceNode[];
    first.cgKey = 'a1';
    second.cgKey = 'b2';
    first.style.transform = 'translate(0px, 0px)';
    second.style.transform = 'translate(448px, 448px)';

    const api = {
        state: {
            animation: { enabled: animationEnabled },
            dom: { elements: { board } },
        },
    } as Api;

    return { api, pieces: { a1: first, b2: second } };
}

test('animates the piece on the pass square when passing is enabled', () => {
    const { api, pieces } = setup();

    animatePassMove(api, true, ['b2', 'b2']);

    expect(pieces.a1.classList.contains('pass-move')).toBe(false);
    expect(pieces.b2.classList.contains('pass-move')).toBe(true);
    expect(pieces.b2.style.getPropertyValue('--pass-move-transform')).toBe('translate(448px, 448px)');
});

test('does not animate same-square moves for variants without pass moves', () => {
    const { api, pieces } = setup();

    animatePassMove(api, false, ['b2', 'b2']);

    expect(pieces.b2.classList.contains('pass-move')).toBe(false);
});

test('does not animate ordinary moves or when animations are disabled', () => {
    const enabled = setup();
    animatePassMove(enabled.api, true, ['a1', 'b2']);
    expect(enabled.pieces.b2.classList.contains('pass-move')).toBe(false);

    const disabled = setup(false);
    animatePassMove(disabled.api, true, ['b2', 'b2']);
    expect(disabled.pieces.b2.classList.contains('pass-move')).toBe(false);
});

test('lets a pass animation finish across a subsequent ordinary move', () => {
    const { api, pieces } = setup();
    animatePassMove(api, true, ['a1', 'a1']);
    expect(pieces.a1.classList.contains('pass-move')).toBe(true);

    animatePassMove(api, true, ['a1', 'b2']);

    expect(pieces.a1.classList.contains('pass-move')).toBe(true);
});

test('does not replay an optimistic pass animation for the server echo', () => {
    const { api, pieces } = setup();
    animatePassMove(api, true, ['a1', 'a1'], true);
    pieces.a1.dispatchEvent(new Event('animationend'));
    expect(pieces.a1.classList.contains('pass-move')).toBe(false);

    animatePassMove(api, true, ['a1', 'a1']);

    expect(pieces.a1.classList.contains('pass-move')).toBe(false);
});

test('removes the transient class when the animation finishes', () => {
    const { api, pieces } = setup();
    animatePassMove(api, true, ['a1', 'a1']);

    pieces.a1.dispatchEvent(new Event('animationend'));

    expect(pieces.a1.classList.contains('pass-move')).toBe(false);
    expect(pieces.a1.style.getPropertyValue('--pass-move-transform')).toBe('');
});

test('can cancel a running pass animation before changing orientation', () => {
    const { api, pieces } = setup();
    animatePassMove(api, true, ['a1', 'a1']);

    clearPassMoveAnimation(api);

    expect(pieces.a1.classList.contains('pass-move')).toBe(false);
});
