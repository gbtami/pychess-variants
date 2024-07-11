import * as cg from 'chessgroundx/types';

import { Board } from 'ffish-es6';

import { Position, castlingSide } from 'chessops/chess';
import { makeBoardFen, parseFen } from 'chessops/fen';
import { makeSquare, parseUci, rookCastlesTo } from 'chessops/util';
import { Setup } from 'chessops/setup';
import { Move, SquareName } from 'chessops/types';

export type Fens = [string, string];
export type BoardId = 0 | 1;
type Boards = [AlicePosition, AlicePosition];

class AlicePosition extends Position {
    private constructor() {
        super('chess');
    }

    static fromSetup(setup: Setup): AlicePosition {
        const pos = new this();
        pos.setupUnchecked(setup);
        return pos;
    }
}  

export class AliceBoard {
    fens: Fens;
    boards: Boards;
    turnColor: cg.Color;
    check: boolean;
    ffishBoard: Board;

    constructor(fullfen: string, ffishBoard: Board) {
        this.ffishBoard = ffishBoard;
        this.fens = fullfen.split(' | ') as Fens;
        this.turnColor = this.fens[0].split(' ')[1] === "w" ? "white" : "black";

        const setup0 = parseFen(this.fens[0]).unwrap();
        const setup1 = parseFen(this.fens[1]).unwrap();

        const pos0 = AlicePosition.fromSetup(setup0);
        const pos1 = AlicePosition.fromSetup(setup1);

        this.boards = [pos0, pos1];
        console.log("new AliceBoard", this.boards);

        this.ffishBoard.setFen(this.fens[0]);
        const check0 = this.ffishBoard.isCheck();

        this.ffishBoard.setFen(this.fens[1]);
        const check1 = this.ffishBoard.isCheck();

        this.check = check0 || check1;
    }

    playMove(afterBoards: Boards, boardId: BoardId, move: Move): void {
        const castlSide = castlingSide(afterBoards[boardId], move);

        afterBoards[boardId].play(move);

        // Remove piece from the target square and put it to the other board
        const piece = afterBoards[boardId].board.take(move.to);
        afterBoards[1 - boardId].board.set(move.to, piece!);

        // Remove the castled rook and put it to the another board
        if (castlSide !== undefined) {
            const rook_to_square = rookCastlesTo(this.turnColor, castlSide);
            const rook = afterBoards[boardId].board.take(rook_to_square);
            afterBoards[1 - boardId].board.set(rook_to_square, rook!);
        }
    }

    getLegalAliceMoves(): string[] {
        let pseudo_legal_moves_0: string[], pseudo_legal_moves_1: string[];

        this.ffishBoard.setFen(this.fens[0]);
        const moves_0 = this.ffishBoard.legalMoves();
        if (moves_0.length > 0) {
            pseudo_legal_moves_0 = moves_0.split(' ').filter(uci => this.boards[1].board.get(parseUci(uci)!.to) === undefined);
        } else {
            pseudo_legal_moves_0 = [];
        }

        this.ffishBoard.setFen(this.fens[1]);
        const moves_1 = this.ffishBoard.legalMoves();
        if (moves_1.length > 0) {
            pseudo_legal_moves_1 = moves_1.split(' ').filter(uci => this.boards[0].board.get(parseUci(uci)!.to) === undefined);
        } else {
            pseudo_legal_moves_1 = [];
        }

        return this.filterOutIllegalMoves(0, pseudo_legal_moves_0).concat(this.filterOutIllegalMoves(1, pseudo_legal_moves_1));
    }

    filterOutIllegalMoves(boardId: BoardId, uciMoves: string[]): string[] {
        const legals: string[] = [];
        for (const uci of uciMoves) {

            const move = parseUci(uci);
            const castlSide = castlingSide(this.boards[boardId], move!);

            const afterBoards: Boards = [this.boards[0].clone(), this.boards[1].clone()];
            this.playMove(afterBoards, boardId, move!);

            this.ffishBoard.setFen(makeBoardFen(afterBoards[0].board) + ' ' + this.turnColor[0]);
            if (this.ffishBoard.isCheck()) continue;

            this.ffishBoard.setFen(makeBoardFen(afterBoards[1].board) + ' ' + this.turnColor[0]);
            if (this.ffishBoard.isCheck()) continue;

            // We have to check that rook_to_square was vacant as well
            if (castlSide !== undefined) {
                const rook_to_square = rookCastlesTo(this.turnColor, castlSide);
                if (this.boards[1 - boardId].board.get(rook_to_square) !== undefined) continue;
            }
            
            legals.push(uci);
        }
        return legals;
    }

    getOccupiedSquares(boardId: BoardId): SquareName[] {
        const squareNames: SquareName[] = [];
        //console.log("occ AliceBoard", boardId, this.boards);
        const occ = this.boards[boardId].board.occupied;
        for (const square of occ) {
            squareNames.push(makeSquare(square));
        }
        return squareNames;
    }

    getUnionFen(boardId: BoardId): string {
        // Make all the other board pieces promoted to let us use variant ui.showPromoted
        // to present the other board piece images differently
        const newBoard = this.boards[boardId].board.clone();
        newBoard.occupied = newBoard.occupied.union(this.boards[1 - boardId].board.occupied);
        newBoard.promoted = this.boards[1 - boardId].board.occupied;
        newBoard.white = newBoard.white.union(this.boards[1 - boardId].board.white);
        newBoard.black = newBoard.black.union(this.boards[1 - boardId].board.black);
        newBoard.pawn = newBoard.pawn.union(this.boards[1 - boardId].board.pawn);
        newBoard.knight = newBoard.knight.union(this.boards[1 - boardId].board.knight);
        newBoard.bishop = newBoard.bishop.union(this.boards[1 - boardId].board.bishop);
        newBoard.rook = newBoard.rook.union(this.boards[1 - boardId].board.rook);
        newBoard.queen = newBoard.queen.union(this.boards[1 - boardId].board.queen);
        newBoard.king = newBoard.king.union(this.boards[1 - boardId].board.king);
        return makeBoardFen(newBoard);
    }
}

export function getUnionFen(fullfen: string): string {
    const fens = fullfen.split(' | ') as Fens;

    const setup0 = parseFen(fens[0]).unwrap();
    const setup1 = parseFen(fens[1]).unwrap();

    const pos0 = AlicePosition.fromSetup(setup0);
    const pos1 = AlicePosition.fromSetup(setup1);

    // Make all the other board pieces promoted to let us use variant ui.showPromoted
    // to present the other board piece images differently
    const newBoard = pos0.board.clone();
    newBoard.occupied = newBoard.occupied.union(pos1.board.occupied);
    newBoard.promoted = pos1.board.occupied;
    newBoard.white = newBoard.white.union(pos1.board.white);
    newBoard.black = newBoard.black.union(pos1.board.black);
    newBoard.pawn = newBoard.pawn.union(pos1.board.pawn);
    newBoard.knight = newBoard.knight.union(pos1.board.knight);
    newBoard.bishop = newBoard.bishop.union(pos1.board.bishop);
    newBoard.rook = newBoard.rook.union(pos1.board.rook);
    newBoard.queen = newBoard.queen.union(pos1.board.queen);
    newBoard.king = newBoard.king.union(pos1.board.king);
    return makeBoardFen(newBoard);
}
