import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cg from 'chessgroundx/types';

import { GameController } from '../client/gameCtrl';
import { ArrowingInput } from '../client/input/arrowing';

describe('Amazons arrow input', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="undo"></div><button id="takeback"></button>';
    });

    test('places a temporary blocker and submits the complete compound move', () => {
        const piece: cg.Piece = { role: 'q-piece', color: 'white' };
        const processInput = jest.fn();
        const pieces = new Map<cg.Key, cg.Piece>([['a1', piece]]);
        const ctrl = {
            variant: { rules: { arrowing: true } },
            legalMoves: jest.fn(() => ['d1a1,a1b1', 'd1a1,a1j:', 'd1b1,b1a1']),
            chessground: {
                state: { boardState: { pieces }, lastMove: undefined },
                set: jest.fn(),
                selectSquare: jest.fn(),
            },
            processInput,
            undo: jest.fn(),
            onArrowingInputStateChange: (active: boolean) => {
                (document.getElementById('takeback') as HTMLElement).hidden = active;
            },
        } as unknown as GameController;
        const input = new ArrowingInput(ctrl);

        input.start(piece, 'd1', 'a1', {} as cg.MoveMetadata);

        expect(input.inputState).toBe('move');
        expect(input.arrowDests).toEqual(['b1', 'j:']);
        expect(pieces.get('a0')).toEqual({ role: '_-piece', color: 'white' });
        expect(ctrl.chessground.set).toHaveBeenCalledWith({
            turnColor: 'white',
            movable: { dests: new Map([['a0', ['b1', 'j:']]]) },
        });
        expect(ctrl.chessground.selectSquare).toHaveBeenCalledWith('a0', false);
        expect((document.getElementById('undo') as HTMLButtonElement).title).toBe('Cancel piece move');
        expect((document.getElementById('takeback') as HTMLElement).hidden).toBe(true);

        // Invalid second-leg clicks keep the temporary arrow selected and the
        // valid destinations active instead of selecting the moved Amazon.
        input.onSelect('a1');
        expect(ctrl.chessground.set).toHaveBeenLastCalledWith({ selectable: { selected: 'a0' } });
        input.onSelect('b1');
        expect(ctrl.chessground.set).toHaveBeenCalledTimes(2);

        input.finish('j:');

        expect(input.inputState).toBeUndefined();
        expect(ctrl.chessground.state.lastMove).toEqual(['d1', 'a1', 'j:']);
        expect(document.getElementById('undo')?.tagName).toBe('DIV');
        expect((document.getElementById('takeback') as HTMLElement).hidden).toBe(false);
        expect(processInput).toHaveBeenCalledWith(piece, 'd1', 'a1', {}, ',a1j:', 'arrowing');
    });
});
