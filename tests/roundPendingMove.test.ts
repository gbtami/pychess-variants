import { beforeEach, describe, expect, test } from '@jest/globals';
import {
    parsePendingMove,
    pendingMoveOnOpenAction,
    pendingMoveStorageKey,
    shouldClearPendingMoveByServerPly,
} from '../client/pendingMove';
import { MsgMove } from '../client/messages';

const gameId = 'game-123';

beforeEach(() => {
    localStorage.clear();
});

const makeMove = (ply: number): MsgMove => ({
    type: 'move',
    gameId,
    move: 'e2e4',
    clocks: [179000, 180000],
    ply,
});

describe('pending move parsing', () => {
    test('parses a valid pending move payload', () => {
        const msg = makeMove(25);
        const parsed = parsePendingMove(JSON.stringify(msg), gameId);
        expect(parsed).toEqual(msg);
    });

    test('rejects malformed or wrong-game payloads', () => {
        expect(parsePendingMove(null, gameId)).toBeUndefined();
        expect(parsePendingMove('not-json', gameId)).toBeUndefined();
        expect(parsePendingMove(JSON.stringify({ type: 'move', gameId: 'other' }), gameId)).toBeUndefined();
        expect(parsePendingMove(JSON.stringify({ type: 'move', gameId, move: 'e2e4', clocks: [], ply: 5 }), gameId)).toBeUndefined();
    });
});

describe('pending move reconnect policy', () => {
    test('resends only when pending ply is exactly one ahead of current ply', () => {
        const pending = makeMove(25);
        expect(pendingMoveOnOpenAction(pending, 24)).toBe('resend');
        expect(pendingMoveOnOpenAction(pending, 25)).toBe('clear');
        expect(pendingMoveOnOpenAction(pending, 23)).toBe('clear');
        expect(pendingMoveOnOpenAction(undefined, 24)).toBe('noop');
    });

    test('clears when server board confirms or passes pending ply', () => {
        const pending = makeMove(25);
        expect(shouldClearPendingMoveByServerPly(pending, 24)).toBe(false);
        expect(shouldClearPendingMoveByServerPly(pending, 25)).toBe(true);
        expect(shouldClearPendingMoveByServerPly(pending, 26)).toBe(true);
    });
});

describe('hard refresh recovery sequence', () => {
    test('simulates persist -> reload -> resend-eligible -> server-confirmed-clear', () => {
        const key = pendingMoveStorageKey(gameId);
        const pending = makeMove(25);

        localStorage.setItem(key, JSON.stringify(pending));

        // New page load restores pending move.
        const restored = parsePendingMove(localStorage.getItem(key), gameId);
        expect(restored).toEqual(pending);

        // Client at ply 24 should attempt resend on socket open.
        expect(pendingMoveOnOpenAction(restored, 24)).toBe('resend');

        // Later board message with ply 25 confirms and cache should be cleared.
        expect(shouldClearPendingMoveByServerPly(restored, 25)).toBe(true);
        if (shouldClearPendingMoveByServerPly(restored, 25)) {
            localStorage.removeItem(key);
        }
        expect(localStorage.getItem(key)).toBeNull();
    });
});
