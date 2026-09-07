/* The decision tree in `reconnectController.ts`, one test per path through it.
 *
 * Each test names the branch it covers. The numbers are the tree's, so a failure points at a branch
 * rather than at a method, and a branch with no number quoted here has no test.
 *
 * Each name is a sentence read off that tree, so a failure says which branch broke rather than which
 * method did. What these cannot reach is everything below "send the move again": whether the server
 * plays, ignores, refuses or rejects it is the SERVER's behaviour, and no amount of unit testing here
 * can observe it. Nor can they reach the seam between this controller and its caller — which of the
 * two applies a message first, and therefore which position a decision is measured against. Both were
 * verified by driving real browsers through the reconnection. */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { ReconnectController } from '@/two-board/socket/reconnectController';
import { pendingMovesStorageKey, pendingMove } from '@/two-board/socket/pendingMoves';
import { MsgMove } from '@/messages';

const GAME = 'testgame';
const anything = () => true;
const nothing = () => false;

const move = (board: 'a' | 'b', uci: string, ply = 1): MsgMove =>
    ({ type: 'move', gameId: GAME, move: uci, clocks: [0, 0], clocksB: [0, 0], ply, board }) as MsgMove;

const stored = () => localStorage.getItem(pendingMovesStorageKey(GAME));

beforeEach(() => localStorage.clear());

describe('a connection is established, nothing was waiting to be sent', () => {
    // 1.1.2 — nothing changed while we were away.
    test('1.1.2  the board stays ours to play', () => {
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: [], b: [] }, anything);
        expect(decision.a.playable).toBe(true);
        expect(decision.b.playable).toBe(true);
    });

    // 1.1.3 — moves happened while we were away.
    test('1.1.3  moves by others change nothing about our right to play', () => {
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: ['d2d4'] }, anything);
        expect(decision.a.playable).toBe(true);
    });
});

describe('a connection is established, the position went backwards', () => {
    // 1.1.4 — a move we have already been shown is missing from the position that arrived. Reachable
    // only from a server that acknowledged a move and then lost the write it had queued, which is
    // what `bughouse-persist-moves-as-played` made possible and scenario T5 stages.

    test('1.1.4  a position missing a move we were shown is reported, not obeyed in silence', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'g1f3'));
        ctrl.moveArrived('a', 'g1f3', true, 'next'); // the server said it had it

        // ...and then comes back without it.
        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything);

        expect(decision.a.rolledBack).toBe(true);
        expect(decision.a.because).toContain('1.1.4');
    });

    test('1.1.4  the board STAYS PLAYABLE, because replaying the move is the only repair', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'g1f3'));
        ctrl.moveArrived('a', 'g1f3', true, 'next');

        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything);

        // Unlike 1.2.3, which shuts the board because a move of ours is in flight. Nothing is in
        // flight here, and shutting it would stop the reader playing the lost move again.
        expect(decision.a.playable).toBe(true);
    });

    test('1.1.4  only the board that went backwards is reported', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'g1f3'));
        ctrl.moveArrived('a', 'g1f3', true, 'next');
        ctrl.moveSent(move('b', 'd2d4'));
        ctrl.moveArrived('b', 'd2d4', true, 'next');

        const decision = ctrl.snapshot({ a: ['e2e4'], b: ['d2d4'] }, anything);

        expect(decision.a.rolledBack).toBe(true);
        expect(decision.b.rolledBack).toBe(false);
    });

    test('1.1.3  a position that merely moved ON is not a rollback', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'g1f3'));
        ctrl.moveArrived('a', 'g1f3', true, 'next');

        // Our move is still there, with the opponent's reply on top of it.
        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], b: [] }, anything);

        expect(decision.a.rolledBack).toBe(false);
        expect(decision.a.playable).toBe(true);
    });

    test('1.1.4  a page that has seen nothing cannot be surprised', () => {
        // A RELOADED PAGE CANNOT DETECT THIS, and that is deliberate: `seen` is in memory, like
        // `ahead`, because it records what THIS page has witnessed. A fresh page has witnessed
        // nothing and has no earlier position to weigh the new one against.
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: ['e2e4'], b: [] }, anything);
        expect(decision.a.rolledBack).toBe(false);
    });

    test('1.1.4  a rollback is an event, not a state that sticks', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'g1f3'));
        ctrl.moveArrived('a', 'g1f3', true, 'next');

        expect(ctrl.snapshot({ a: ['e2e4'], b: [] }, anything).a.rolledBack).toBe(true);
        // The next snapshot is judged against the position we have now been shown, not the one we
        // lost — otherwise every later message would repeat the same complaint.
        expect(ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything).a.rolledBack).toBe(false);
    });
});

describe('a connection is established, a move was waiting to be sent', () => {
    // 1.2.1
    test('1.2.1  the new position already contains it: forget it, the board is ours', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: ['e2e4'], b: [] }, anything);
        expect(ctrl.waiting('a')).toBe(false);
        expect(decision.a.playable).toBe(true);
        expect(stored()).toBeNull();
    });

    // 1.2.1, reached the way branch 1.2.3.2 reaches it: the server said nothing, and the move is
    // in the history under the opponent's reply rather than as the last move.
    test('1.2.1  it is in the position but not as the last move: still forgotten', () => {
        // The opponent has replied on top of ours. Looking only at the last move missed this, and
        // the entry then sat in storage until the game ended.
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything);
        expect(ctrl.waiting('a')).toBe(false);
        expect(stored()).toBeNull();
    });

    // 1.2.2 — and the branch that makes 1.2.3.4 survivable: a rejected move must be droppable.
    test('1.2.2  the new position cannot accept it: the move is dropped and the board comes back', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: ['d2d4'] }, nothing);
        expect(ctrl.waiting('a')).toBe(false);
        expect(decision.a.playable).toBe(true);
        expect(stored()).toBeNull();
    });

    // 1.2.3
    test('1.2.3  the position does not contain it but could accept it: the board is taken away', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: [], b: [] }, anything);
        expect(ctrl.waiting('a')).toBe(true);
        expect(decision.a.playable).toBe(false);
        expect(decision.b.playable).toBe(true); // the other board is untouched
    });

    // 1.2.3 reached from a page with no memory of sending: the case that used to be treated as
    // though nothing were waiting.
    test('1.2.3  a reloaded page is as careful as one that never stopped', () => {
        // The page that sent the move is gone; only storage remembers it. This used to be treated
        // as though nothing were waiting, which handed the board back with a move still in flight.
        const sender = new ReconnectController(GAME);
        sender.moveSent(move('a', 'e2e4'));

        const reloaded = new ReconnectController(GAME); // no memory of having sent anything
        expect(reloaded.waiting('a')).toBe(true);
        expect(reloaded.snapshot({ a: [], b: [] }, anything).a.playable).toBe(false);
    });

    // 1.2.3 — the sending half.
    test('1.2.3  the move survives the page, so it can still be sent', () => {
        new ReconnectController(GAME).moveSent(move('a', 'e2e4'));
        const reloaded = new ReconnectController(GAME);
        expect(reloaded.socketOpened().movesQueued.map(m => m.move)).toEqual(['e2e4']);
    });

    // 1.2.3 — the showing half. The snapshot cannot carry our move, so the decision names it and
    // the caller puts it back; without this the reader watches their own move vanish and return.
    test('1.2.3  the waiting move is named for replay, so it does not vanish', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: [], b: [] }, anything);
        expect(decision.a.replay).toBe('e2e4');
        expect(decision.a.playable).toBe(false); // shown again, and still not ours to play into
        expect(decision.b.replay).toBeUndefined();
    });

    // 1.2.3 from a reloaded page: the durable record is enough to show the move again, which is
    // what makes a refresh mid-move look like nothing happened.
    test('1.2.3  a reloaded page replays the move storage remembers', () => {
        new ReconnectController(GAME).moveSent(move('a', 'e2e4'));
        const reloaded = new ReconnectController(GAME);
        expect(reloaded.snapshot({ a: [], b: [] }, anything).a.replay).toBe('e2e4');
    });

    // 1.2.2 — nothing is replayed for a move the position cannot take. This is the pairing that
    // makes the replay safe: `replay` is only ever a move that is legal in the position that
    // arrived, because `reconcile()` has already dropped the ones that are not.
    test('1.2.2  a move the position cannot accept is not replayed', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: ['d2d4'] }, nothing);
        expect(decision.a.replay).toBeUndefined();
        expect(decision.a.playable).toBe(true);
    });

    // 1.2.1 — nor for one the server already has: it is in the position that just arrived.
    test('1.2.1  a move the server already holds is not replayed', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        expect(ctrl.snapshot({ a: ['e2e4'], b: [] }, anything).a.replay).toBeUndefined();
    });

    // 1.1.1 — and not into a finished game, where nothing of ours is waiting any more.
    test('1.1.1  a finished game replays nothing', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        ctrl.gameEnded();
        expect(ctrl.snapshot({ a: [], b: [] }, anything).a.replay).toBeUndefined();
    });

    /* 1.2.2's ORDERING, asserted as the contract it is.
     *
     * The controller cannot see a board, so it cannot enforce which position the caller consults —
     * it can only be given the answer. What this pins is that the answer is USED: a callback that
     * says "no" must drop the move and clear storage, because that is the whole of 1.2.3.4's
     * recovery. The resync arrives on a socket that never broke, so there is no later reconnection
     * to try again on; if this message does not drop the move, nothing ever will.
     *
     * The other half of the contract — that the caller applies the message before asking — lives in
     * `roundCtrl.updateBothBoardsAndClocksOnFullBoardMsg`, and scenario Q11 is what holds it. */
    test('1.2.3.4  a refusal seen on a live socket strands nothing', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));

        // The server has handed back a position our move does not fit. No reconnection follows.
        const decision = ctrl.snapshot({ a: ['d2d4'] }, nothing);

        expect(decision.a.replay).toBeUndefined(); // nothing is shown that cannot be played
        expect(decision.a.playable).toBe(true); // the board comes back to the reader
        expect(ctrl.waiting('a')).toBe(false); // and nothing is left waiting
        expect(stored()).toBeNull(); // so no later reconnection resends it
    });
});

describe('a premove waiting behind a reconnection', () => {
    /* Decided 2026-09-07: a premove SURVIVES a full board message. It is an intention about a
     * position that has not arrived, not a copy of anything the server holds, so a snapshot has
     * nothing to restate about it. What a snapshot decides is only whether to RELEASE it.
     *
     * `ourTurn` is the fact the controller cannot hold — it has no board — so these pass it in the
     * way `roundCtrl` does, reading the position the message just applied. */
    const ourTurn = () => true;
    const theirTurn = () => false;

    // 1.1.3 — THE CASE A PREMOVE IS FOR. We were away, the opponent replied, and the first thing we
    // are told is already our move.
    test('1.1.3  away, the opponent replied: the premove goes as the snapshot lands', () => {
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything, ourTurn);
        expect(decision.a.releasePremove).toBe(true);
        expect(decision.a.playable).toBe(true);
    });

    // 1.1.3 — the same snapshot when the opponent has NOT replied. Nothing fires, and nothing is
    // thrown away either: 2.1.1 releases it when their move arrives.
    test('1.1.3  away, nobody replied: the premove waits rather than fires', () => {
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: ['e2e4'], b: [] }, anything, theirTurn);
        expect(decision.a.releasePremove).toBe(false);
        expect(ctrl.moveArrived('a', 'e7e5', false, 'next').releasePremove).toBe(true);
    });

    // 1.2.1 — our move reached the server but we never heard; the opponent has since replied. The
    // move is forgotten AND the premove goes, both off the one message.
    test('1.2.1  our unacknowledged move landed and was answered: forget it, fire the premove', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything, ourTurn);
        expect(ctrl.waiting('a')).toBe(false);
        expect(decision.a.releasePremove).toBe(true);
    });

    // 1.2.1 — our move landed, nobody has replied. Our own move landing does not make it our turn.
    test('1.2.1  our unacknowledged move landed and stands alone: the premove waits', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: ['e2e4'], b: [] }, anything, theirTurn);
        expect(ctrl.waiting('a')).toBe(false);
        expect(decision.a.releasePremove).toBe(false);
    });

    /* 1.2.3 — THE ONE THAT MUST NOT FIRE, and the position lies about it.
     *
     * Our move never reached the server, so the snapshot predates it and says "your turn" quite
     * truthfully. Releasing into that would put a second move in flight behind the first, which is
     * the overwrite race the shut board exists to prevent. Only the controller knows. */
    test('1.2.3  our move is still unsent: the premove is held even though the position says our turn', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: [], b: [] }, anything, ourTurn);
        expect(decision.a.releasePremove).toBe(false);
        expect(decision.a.playable).toBe(false);
        expect(decision.a.replay).toBe('e2e4'); // shown again, but not played into
    });

    // 1.2.3 then 2.2 then 2.1.1 — the whole journey for a move that had to be resent. The premove
    // is not released by our own move coming back; it waits for the opponent's.
    test('1.2.3 -> 2.2 -> 2.1.1  a resent move does not fire the premove; the reply does', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        expect(ctrl.snapshot({ a: [], b: [] }, anything, ourTurn).a.releasePremove).toBe(false);

        // Our own move comes back from the server. Still not our turn.
        expect(ctrl.ourMoveCameBack('a', 'e2e4').releasePremove).toBe(false);
        // The opponent replies. Now it is.
        expect(ctrl.moveArrived('a', 'e7e5', false, 'next').releasePremove).toBe(true);
    });

    /* 1.1.2 — nothing changed while we were away, and a premove still goes.
     *
     * It reads oddly until you place it: the opponent's move reached us BEFORE the break, so there
     * is genuinely nothing new in the snapshot, and the premove armed behind that move has been
     * waiting all along. The branch with the least happening in it still has an answer. */
    test('1.1.2  nothing changed, but it is our turn: the waiting premove goes', () => {
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything, ourTurn);
        expect(decision.a.releasePremove).toBe(true);
    });

    // 1.2.2 — the move is dropped, so nothing of ours is in flight and the premove is released on
    // the same terms as 1.1. The board coming back and the premove coming back are one decision.
    test('1.2.2  the dropped move releases the board and the premove together', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const decision = ctrl.snapshot({ a: ['d2d4'] }, nothing, ourTurn);
        expect(ctrl.waiting('a')).toBe(false);
        expect(decision.a.playable).toBe(true);
        expect(decision.a.releasePremove).toBe(true);
    });

    // 2.1.1 — branch 2 asks no turn question, and that is not an oversight: their move IS the proof
    // that it is our turn. Asserted so the asymmetry with branch 1 is deliberate rather than noticed.
    test('2.1.1  a single move releases a premove with no turn check', () => {
        const ctrl = new ReconnectController(GAME);
        expect(ctrl.moveArrived('a', 'e7e5', false, 'next').releasePremove).toBe(true);
    });

    // 1.1.1 — a finished game releases nothing, whatever the turn says.
    test('1.1.1  the game ended while we were away: no premove goes', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.gameEnded();
        expect(ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything, ourTurn).a.releasePremove).toBe(false);
    });

    // 1.1.4 — a rollback hands the board back, so it hands the premove back too.
    test('1.1.4  a rolled-back position still releases a premove when it is our turn', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.snapshot({ a: ['e2e4', 'e7e5'], b: [] }, anything, theirTurn); // this is what we were shown
        const decision = ctrl.snapshot({ a: ['e2e4'], b: [] }, anything, ourTurn); // the reply is gone
        expect(decision.a.rolledBack).toBe(true);
        expect(decision.a.playable).toBe(true);
        expect(decision.a.releasePremove).toBe(true);
    });

    // The boards are independent here as everywhere: a premove on one is not released by the other.
    test('the other board’s turn does not release this board’s premove', () => {
        const ctrl = new ReconnectController(GAME);
        const decision = ctrl.snapshot({ a: [], b: [] }, anything, board => board === 'b');
        expect(decision.a.releasePremove).toBe(false);
        expect(decision.b.releasePremove).toBe(true);
    });

    // 2.2.1 / 2.2.2 — our own move coming back is never a reason to fire. Asserted because the
    // decision says so in one place and nothing was checking it.
    test('2.2  our own move coming back never releases a premove', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        expect(ctrl.ourMoveCameBack('a', 'e2e4').releasePremove).toBe(false);
    });
});

describe('the two boards are decided separately', () => {
    // 1.2.3 on one board while 1.1 holds on the other: the tree is walked per board.
    test('1.2.3 + 1.1  a move waiting on one board does not shut the other', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('b', 'e2e4'));
        const decision = ctrl.snapshot({ a: [], b: [] }, anything);
        expect(decision.a.playable).toBe(true);
        expect(decision.b.playable).toBe(false);
    });

    // 1.2.3 on both boards at once, which only a player holding two seats can reach.
    test('1.2.3  one waiting move on each, as a player holding two seats can have', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4', 1));
        ctrl.moveSent(move('b', 'd2d4', 2));
        expect(ctrl.socketOpened().movesQueued.map(m => m.move)).toEqual(['e2e4', 'd2d4']);
        const decision = ctrl.snapshot({ a: [], b: [] }, anything);
        expect(decision.a.playable).toBe(false);
        expect(decision.b.playable).toBe(false);
    });
});

describe('one move arrives', () => {
    // Branch 2, which the controller only started owning on 2026-09-07. Before that 2.1 was decided
    // inline in `roundCtrl` and nothing here could reach it.

    test('2.1.1  the next move: show it, take that board’s clocks, let a premove go', () => {
        const ctrl = new ReconnectController(GAME);
        const d = ctrl.moveArrived('a', 'e7e5', false, 'next');
        expect(d.applyPosition).toBe(true);
        expect(d.takeClocks).toBe(true);
        expect(d.releasePremove).toBe(true);
        expect(d.movesMissing).toBe(false);
        expect(d.because).toContain('2.1.1');
    });

    test('2.1.2  older than what we show: the clocks, and nothing else', () => {
        const ctrl = new ReconnectController(GAME);
        const d = ctrl.moveArrived('a', 'e7e5', false, 'older');
        expect(d.takeClocks).toBe(true);
        expect(d.applyPosition).toBe(false);
        expect(d.releasePremove).toBe(false);
        expect(d.because).toContain('2.1.2');
    });

    test('2.1.3  further ahead than the next move: reported, and not applied', () => {
        const ctrl = new ReconnectController(GAME);
        const d = ctrl.moveArrived('a', 'g8f6', false, 'ahead');
        // No premove either: a move is missing in front of us, so we do not know the position one
        // would land in. The only branch under 2.1 that does release is 2.1.1.
        expect(d.releasePremove).toBe(false);
        expect(d.movesMissing).toBe(true);
        // Applying it would skip a ply the reader was never shown.
        expect(d.applyPosition).toBe(false);
        expect(d.takeClocks).toBe(true);
        expect(d.because).toContain('2.1.3');
    });

    test('2.1.3  a move we skipped is NOT remembered as seen', () => {
        // Otherwise the hole we just reported becomes invisible to 1.1.4: a later position missing
        // that move would look like a rollback of something we had actually been shown.
        const ctrl = new ReconnectController(GAME);
        ctrl.moveArrived('a', 'g8f6', false, 'ahead');
        expect(ctrl.snapshot({ a: ['e2e4'], b: [] }, anything).a.rolledBack).toBe(false);
    });

    test('2.1.1  somebody else’s move IS remembered, so 1.1.4 can miss it later', () => {
        // The whole point of moving branch 2.1 into this class: a rollback that loses only an
        // opponent's move used to be undetectable, because the class never heard about it.
        const ctrl = new ReconnectController(GAME);
        ctrl.moveArrived('a', 'e7e5', false, 'next');
        expect(ctrl.snapshot({ a: ['e2e4'], b: [] }, anything).a.rolledBack).toBe(true);
    });

    test('2.2.1  our own move, sent once and waited: keep every clock we have', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        const d = ctrl.moveArrived('a', 'e2e4', true, 'next');
        expect(d.applyPosition).toBe(true);
        expect(d.takeClocks).toBe(false);
        expect(d.because).toContain('2.2.1');
        expect(ctrl.waiting('a')).toBe(false);
    });

    test('2.2.2  our own move, sent again after a break: the server’s clocks win', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        ctrl.socketOpened(); // marks the entry as resent
        const d = ctrl.moveArrived('a', 'e2e4', true, 'next');
        expect(d.takeClocks).toBe(true);
        expect(d.because).toContain('2.2.2');
    });

    test('2.2  our own move is applied whatever its place, because it made this position', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        expect(ctrl.moveArrived('a', 'e2e4', true, 'older').applyPosition).toBe(true);
    });

    test('2.2.1  a confirmation for a move we were not holding changes nothing', () => {
        const ctrl = new ReconnectController(GAME);
        const d = ctrl.moveArrived('a', 'e2e4', true, 'next');
        expect(d.takeClocks).toBe(false);
        expect(stored()).toBe(null);
    });
});

describe('the game has finished', () => {
    // 1.1.1, and what makes 1.2.3.3 harmless: a refused move is forgotten with everything else.
    test('1.1.1  nothing is waiting any more, and nothing is left in storage', () => {
        const ctrl = new ReconnectController(GAME);
        ctrl.moveSent(move('a', 'e2e4'));
        ctrl.gameEnded();
        expect(ctrl.waiting('a')).toBe(false);
        expect(stored()).toBeNull();
        expect(ctrl.snapshot({ a: [], b: [] }, anything).a.playable).toBe(false);
    });
});

describe('storage that refuses to work', () => {
    // 1.2.3 when storage refuses to help: the in-memory record alone has to carry it.
    test('1.2.3  the board is still kept shut for as long as this page lives', () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage is blocked');
        });
        // the module warns on purpose when storage fails; that is the behaviour, not noise to fix
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const ctrl = new ReconnectController(GAME);
            ctrl.moveSent(move('a', 'e2e4'));
            expect(pendingMove(GAME, 'a')).toBeUndefined(); // nothing was stored
            expect(ctrl.waiting('a')).toBe(true); // and it still knows
        } finally {
            setItem.mockRestore();
            warn.mockRestore();
        }
    });
});
