import { read as fenRead, write as fenWrite } from 'chessgroundx/fen';
import * as cg from 'chessgroundx/types';

const ALICE_DIMENSIONS: cg.BoardDimensions = { width: 8, height: 8 };

export type AliceBoardName = 'a' | 'b';

/** Return one physical Alice board, with its pieces rendered normally. */
export function aliceBoardFen(fen: string, board: AliceBoardName): cg.FEN {
    const parts = fen.split(' ');
    const boardState = fenRead(parts[0] as cg.FEN, ALICE_DIMENSIONS);
    const mirror = board === 'b';

    for (const [key, piece] of boardState.pieces) {
        if (!!piece.mirror !== mirror) {
            boardState.pieces.delete(key);
        } else if (piece.mirror) {
            boardState.pieces.set(key, { ...piece, mirror: false });
        }
    }

    return [fenWrite(boardState, ALICE_DIMENSIONS), ...parts.slice(1)].join(' ') as cg.FEN;
}
