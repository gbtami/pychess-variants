import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MsgMove } from "../client/messages";
import { pendingMoveStorageKey } from "../client/pendingMove";

type MethodMap = Record<string, (...args: any[]) => any>;
type SentMessage = { type: string; [key: string]: unknown };

jest.unstable_mockModule("chessgroundx", () => ({
    Chessground: jest.fn(),
}));

const { RoundController } = await import("../client/roundCtrl");
const roundProto = RoundController.prototype as unknown as MethodMap;

function callRoundMethod(ctx: Record<string, unknown>, name: string, ...args: unknown[]): unknown {
    return roundProto[name].call(ctx, ...args);
}

beforeEach(() => {
    localStorage.clear();
});

describe("round move validation", () => {
    test("rejects stale move only after clock calculation, then requests board sync", () => {
        const callOrder: string[] = [];
        const sent: SentMessage[] = [];
        const persistPendingMove = jest.fn();

        const ctrl = {
            gameId: "game-stale",
            clearDialog: jest.fn(),
            corr: false,
            flipped: () => false,
            base: 5,
            ply: 12,
            clocks: [
                { duration: 180000, pause: jest.fn(), setTime: jest.fn(), start: jest.fn() },
                {
                    duration: 179500,
                    pause: jest.fn(() => callOrder.push("pause")),
                    setTime: jest.fn(),
                    start: jest.fn(),
                },
            ],
            mycolor: "white",
            berserked: { wberserk: false, bberserk: false },
            inc: 2,
            byoyomi: false,
            preaction: false,
            clocktimes: [180000, 179500],
            ffishBoard: {
                legalMoves: jest.fn(() => {
                    callOrder.push("legalMoves");
                    return "a2a3 b2b3";
                }),
            },
            clearLocalMoveQueueState: jest.fn(),
            doSend: jest.fn((msg: SentMessage) => sent.push(msg)),
            persistPendingMove,
            clockOn: false,
            oppcolor: "black",
        } as unknown as Record<string, unknown>;

        callRoundMethod(ctrl, "doSendMove", "f7f8k");

        expect(callOrder).toEqual(["pause", "legalMoves"]);
        expect(ctrl.clearLocalMoveQueueState).toHaveBeenCalledTimes(1);
        expect(persistPendingMove).not.toHaveBeenCalled();
        expect(sent).toEqual([{ type: "board", gameId: "game-stale" }]);
    });

    test("takeback-style local queue clear removes stale premove state and blocks stale resend", () => {
        const gameId = "game-antichess";
        const key = pendingMoveStorageKey(gameId);
        const pending: MsgMove = {
            type: "move",
            gameId,
            move: "f7f8k",
            clocks: [12000, 11000],
            ply: 32,
        };
        localStorage.setItem(key, JSON.stringify(pending));

        const sent: SentMessage[] = [];
        const persistPendingMove = jest.fn();
        const cancelPremove = jest.fn();
        const unsetPremove = jest.fn();

        const ctrl = {
            gameId,
            lastMaybeSentMsgMove: pending,
            chessground: { cancelPremove },
            unsetPremove,
            pendingMoveStorageKey: roundProto.pendingMoveStorageKey,
            clearPendingMoveCache: roundProto.clearPendingMoveCache,
            clearLocalMoveQueueState: roundProto.clearLocalMoveQueueState,
            clearDialog: jest.fn(),
            corr: false,
            flipped: () => false,
            base: 0,
            ply: 31,
            clocks: [
                { duration: 12000, pause: jest.fn(), setTime: jest.fn(), start: jest.fn() },
                { duration: 11000, pause: jest.fn(), setTime: jest.fn(), start: jest.fn() },
            ],
            mycolor: "white",
            berserked: { wberserk: false, bberserk: false },
            inc: 3,
            byoyomi: false,
            preaction: false,
            clocktimes: [12000, 11000],
            ffishBoard: { legalMoves: jest.fn(() => "a2a3 h2h3") },
            doSend: jest.fn((msg: SentMessage) => sent.push(msg)),
            persistPendingMove,
            clockOn: false,
            oppcolor: "black",
        } as unknown as Record<string, unknown>;

        // takeback and board-takeback paths both use this helper to invalidate local queued move intent.
        callRoundMethod(ctrl, "clearLocalMoveQueueState");

        expect(cancelPremove).toHaveBeenCalledTimes(1);
        expect(unsetPremove).toHaveBeenCalledTimes(1);
        expect(ctrl.lastMaybeSentMsgMove).toBeUndefined();
        expect(localStorage.getItem(key)).toBeNull();

        callRoundMethod(ctrl, "doSendMove", "f7f8k");

        expect(sent).toEqual([{ type: "board", gameId }]);
        expect(sent.some((msg) => msg.type === "move")).toBe(false);
        expect(persistPendingMove).not.toHaveBeenCalled();
    });
});
