import { clockTimeAt, playerInfoData, TwoBoardSeats } from '../client/two-board/common/players';
import { PyChessModel } from '../client/types';
import { Step } from '../client/messages';

function model(overrides: Partial<PyChessModel> = {}): PyChessModel {
    return {
        wplayer: 'Anna',
        wtitle: 'GM',
        wrating: '2500',
        bplayer: 'Boris',
        btitle: '',
        brating: '1800',
        wplayerB: 'Carl',
        wtitleB: 'BOT',
        wratingB: '2000',
        bplayerB: 'Dana',
        btitleB: 'IM',
        bratingB: '2200',
        ...overrides,
    } as PyChessModel;
}

test('seats are built from the model fields', () => {
    const seats = new TwoBoardSeats(model(), 'Anna');

    const wA = seats.byBoardAndColor('a', 'white');
    expect(wA.player.username).toBe('Anna');
    expect(wA.player.title).toBe('GM');
    expect(wA.player.rating).toBe('2500');
    expect(wA.color).toBe('white');
    expect(wA.boardName).toBe('a');

    expect(seats.byBoardAndColor('a', 'black').player.username).toBe('Boris');
    expect(seats.byBoardAndColor('b', 'white').player.username).toBe('Carl');
    expect(seats.byBoardAndColor('b', 'black').player.username).toBe('Dana');
    expect(seats.all.map(s => s.player.username)).toEqual(['Anna', 'Boris', 'Carl', 'Dana']);
});

test('relation accessors follow the bughouse team structure', () => {
    const seats = new TwoBoardSeats(model(), 'Anna');
    const wA = seats.byBoardAndColor('a', 'white');
    const bA = seats.byBoardAndColor('a', 'black');

    expect(seats.partnerOf(wA).player.username).toBe('Dana'); // other board, other color
    expect(seats.opponentOf(wA).player.username).toBe('Boris'); // same board, other color
    expect(seats.opponentsPartnerOf(wA).player.username).toBe('Carl'); // other board, same color

    expect(seats.partnerOf(bA).player.username).toBe('Carl');
    expect(seats.opponentOf(bA).player.username).toBe('Anna');
    expect(seats.opponentsPartnerOf(bA).player.username).toBe('Dana');

    // relations are involutive
    expect(seats.partnerOf(seats.partnerOf(wA))).toBe(wA);
    expect(seats.opponentOf(seats.opponentOf(wA))).toBe(wA);
    expect(seats.opponentsPartnerOf(seats.opponentsPartnerOf(wA))).toBe(wA);
});

test('teams are wA+bB (team 1) and bA+wB (team 2), with teamNumber and name()', () => {
    const seats = new TwoBoardSeats(model(), 'Anna');

    expect(seats.teams[0].seats.map(s => s.player.username)).toEqual(['Anna', 'Dana']);
    expect(seats.teams[0].teamNumber).toBe('1');
    expect(seats.teams[0].name()).toBe('Anna+Dana');

    expect(seats.teams[1].seats.map(s => s.player.username)).toEqual(['Boris', 'Carl']);
    expect(seats.teams[1].teamNumber).toBe('2');
    expect(seats.teams[1].name()).toBe('Boris+Carl');
});

test('teams carry the same data as the legacy teamFirst/teamSecond tuples', () => {
    const m = model();
    const seats = new TwoBoardSeats(m, 'Anna');
    const teamFirst = [playerInfoData(m, 'w', 'a'), playerInfoData(m, 'b', 'b')];
    const teamSecond = [playerInfoData(m, 'b', 'a'), playerInfoData(m, 'w', 'b')];

    [teamFirst, teamSecond].forEach((legacy, t) => {
        legacy.forEach(([username, title, rating], i) => {
            expect(seats.teams[t].seats[i].player.username).toBe(username);
            expect(seats.teams[t].seats[i].player.title).toBe(title);
            expect(seats.teams[t].seats[i].player.rating).toBe(rating);
        });
    });
});

test('viewer-relative accessors return the viewer seat', () => {
    const seats = new TwoBoardSeats(model(), 'Dana'); // black on board B, team 1

    expect(seats.me('a')).toBeUndefined();
    expect(seats.me('b')?.player.username).toBe('Dana');
    expect(seats.myColor('b')).toBe('black');
    expect(seats.myColor('a')).toBeUndefined();
    expect(seats.isSpectator()).toBe(false);
    expect(seats.myTeam().teamNumber).toBe('1');

    const boris = new TwoBoardSeats(model(), 'Boris'); // black on board A, team 2
    expect(boris.myColor('a')).toBe('black');
    expect(boris.myTeam().teamNumber).toBe('2');
});

test('spectators are team 2 (legacy whichTeamAmI fallthrough)', () => {
    const seats = new TwoBoardSeats(model(), 'Zora');

    expect(seats.isSpectator()).toBe(true);
    expect(seats.me('a')).toBeUndefined();
    expect(seats.me('b')).toBeUndefined();
    expect(seats.myTeam().teamNumber).toBe('2');
});

test('simul: one username seated on both boards as two separate seats', () => {
    const seats = new TwoBoardSeats(model({ wplayer: 'Solo', bplayerB: 'Solo' }), 'Solo'); // team 1 twice

    expect(seats.me('a')?.color).toBe('white');
    expect(seats.me('b')?.color).toBe('black');
    expect(seats.me('a')).not.toBe(seats.me('b'));
    expect(seats.isSpectator()).toBe(false);
    expect(seats.myTeam().teamNumber).toBe('1');
});

test('name() accepts a username formatter', () => {
    const seats = new TwoBoardSeats(model(), 'Anna');

    expect(seats.teams[0].name()).toBe('Anna+Dana');
    expect(seats.teams[0].name(u => u.toUpperCase())).toBe('ANNA+DANA');
    expect(seats.teams[1].name(u => `<${u}>`)).toBe('<Boris>+<Carl>');
});

test('teamOf finds the team of each seat', () => {
    const seats = new TwoBoardSeats(model(), 'Zora');

    expect(seats.teamOf(seats.byBoardAndColor('a', 'white'))).toBe(seats.teams[0]);
    expect(seats.teamOf(seats.byBoardAndColor('b', 'black'))).toBe(seats.teams[0]);
    expect(seats.teamOf(seats.byBoardAndColor('a', 'black'))).toBe(seats.teams[1]);
    expect(seats.teamOf(seats.byBoardAndColor('b', 'white'))).toBe(seats.teams[1]);
});

test('initialTopColor: spectators watch board a from white side, board b from black side', () => {
    const seats = new TwoBoardSeats(model(), 'Zora');

    expect(seats.initialTopColor('a')).toBe('black');
    expect(seats.initialTopColor('b')).toBe('white');
});

test('initialTopColor: participants get their own and their partner color at the bottom', () => {
    // Anna is white on board a; her partner Dana is black on board b
    const anna = new TwoBoardSeats(model(), 'Anna');
    expect(anna.initialTopColor('a')).toBe('black'); // Anna (white) at the bottom
    expect(anna.initialTopColor('b')).toBe('white'); // Dana (black) at the bottom

    // Boris is black on board a; his partner Carl is white on board b
    const boris = new TwoBoardSeats(model(), 'Boris');
    expect(boris.initialTopColor('a')).toBe('white');
    expect(boris.initialTopColor('b')).toBe('black');

    // Carl is white on board b; his partner Boris is black on board a
    const carl = new TwoBoardSeats(model(), 'Carl');
    expect(carl.initialTopColor('a')).toBe('white');
    expect(carl.initialTopColor('b')).toBe('black');
});

test('initialTopColor: simul viewer holds both seats of a team', () => {
    const seats = new TwoBoardSeats(model({ wplayer: 'Solo', bplayerB: 'Solo' }), 'Solo');

    expect(seats.initialTopColor('a')).toBe('black'); // own white seat at the bottom
    expect(seats.initialTopColor('b')).toBe('white'); // own black seat at the bottom
});

test('clockTimeAt reads the recorded time of a seat from a step', () => {
    const seats = new TwoBoardSeats(model(), 'Zora');
    const step = { clocks: [111, 222], clocksB: [333, 444] } as unknown as Step;

    expect(clockTimeAt(step, seats.byBoardAndColor('a', 'white'))).toBe(111);
    expect(clockTimeAt(step, seats.byBoardAndColor('a', 'black'))).toBe(222);
    expect(clockTimeAt(step, seats.byBoardAndColor('b', 'white'))).toBe(333);
    expect(clockTimeAt(step, seats.byBoardAndColor('b', 'black'))).toBe(444);
});

test('clockTimeAt is undefined-safe for steps without clocks', () => {
    const seats = new TwoBoardSeats(model(), 'Zora');
    const bare = {} as Step;

    expect(clockTimeAt(bare, seats.byBoardAndColor('a', 'white'))).toBeUndefined();
    expect(clockTimeAt(bare, seats.byBoardAndColor('b', 'black'))).toBeUndefined();

    const onlyA = { clocks: [111, 222] } as unknown as Step;
    expect(clockTimeAt(onlyA, seats.byBoardAndColor('a', 'black'))).toBe(222);
    expect(clockTimeAt(onlyA, seats.byBoardAndColor('b', 'white'))).toBeUndefined();
});
