import { TwoBoardPlayers } from '../client/two-board/common/players';
import { playerInfoData } from '../client/two-board/common/gameInfo';
import { PyChessModel } from '../client/types';

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
    const players = new TwoBoardPlayers(model(), 'Anna');

    const wA = players.byBoardAndColor('a', 'white');
    expect(wA.username).toBe('Anna');
    expect(wA.title).toBe('GM');
    expect(wA.rating).toBe('2500');
    expect(wA.color).toBe('white');
    expect(wA.boardName).toBe('a');

    expect(players.byBoardAndColor('a', 'black').username).toBe('Boris');
    expect(players.byBoardAndColor('b', 'white').username).toBe('Carl');
    expect(players.byBoardAndColor('b', 'black').username).toBe('Dana');
    expect(players.all.map(p => p.username)).toEqual(['Anna', 'Boris', 'Carl', 'Dana']);
});

test('relation accessors follow the bughouse team structure', () => {
    const players = new TwoBoardPlayers(model(), 'Anna');
    const wA = players.byBoardAndColor('a', 'white');
    const bA = players.byBoardAndColor('a', 'black');

    expect(players.partnerOf(wA).username).toBe('Dana'); // other board, other color
    expect(players.opponentOf(wA).username).toBe('Boris'); // same board, other color
    expect(players.opponentsPartnerOf(wA).username).toBe('Carl'); // other board, same color

    expect(players.partnerOf(bA).username).toBe('Carl');
    expect(players.opponentOf(bA).username).toBe('Anna');
    expect(players.opponentsPartnerOf(bA).username).toBe('Dana');

    // relations are involutive
    expect(players.partnerOf(players.partnerOf(wA))).toBe(wA);
    expect(players.opponentOf(players.opponentOf(wA))).toBe(wA);
    expect(players.opponentsPartnerOf(players.opponentsPartnerOf(wA))).toBe(wA);
});

test('teams are wA+bB (team 1) and bA+wB (team 2), with teamNumber and name()', () => {
    const players = new TwoBoardPlayers(model(), 'Anna');

    expect(players.teams[0].players.map(p => p.username)).toEqual(['Anna', 'Dana']);
    expect(players.teams[0].teamNumber).toBe('1');
    expect(players.teams[0].name()).toBe('Anna+Dana');

    expect(players.teams[1].players.map(p => p.username)).toEqual(['Boris', 'Carl']);
    expect(players.teams[1].teamNumber).toBe('2');
    expect(players.teams[1].name()).toBe('Boris+Carl');
});

test('teams carry the same data as the legacy teamFirst/teamSecond tuples', () => {
    const m = model();
    const players = new TwoBoardPlayers(m, 'Anna');
    const teamFirst = [playerInfoData(m, 'w', 'a'), playerInfoData(m, 'b', 'b')];
    const teamSecond = [playerInfoData(m, 'b', 'a'), playerInfoData(m, 'w', 'b')];

    [teamFirst, teamSecond].forEach((legacy, t) => {
        legacy.forEach(([username, title, rating], i) => {
            expect(players.teams[t].players[i].username).toBe(username);
            expect(players.teams[t].players[i].title).toBe(title);
            expect(players.teams[t].players[i].rating).toBe(rating);
        });
    });
});

test('viewer-relative accessors for a player', () => {
    const players = new TwoBoardPlayers(model(), 'Dana'); // black on board B, team 1

    expect(players.me('a')).toBeUndefined();
    expect(players.me('b')?.username).toBe('Dana');
    expect(players.myColor('b')).toBe('black');
    expect(players.myColor('a')).toBeUndefined();
    expect(players.isSpectator()).toBe(false);
    expect(players.myTeam().teamNumber).toBe('1');

    const boris = new TwoBoardPlayers(model(), 'Boris'); // black on board A, team 2
    expect(boris.myColor('a')).toBe('black');
    expect(boris.myTeam().teamNumber).toBe('2');
});

test('spectators are team 2 (legacy whichTeamAmI fallthrough)', () => {
    const players = new TwoBoardPlayers(model(), 'Zora');

    expect(players.isSpectator()).toBe(true);
    expect(players.me('a')).toBeUndefined();
    expect(players.me('b')).toBeUndefined();
    expect(players.myTeam().teamNumber).toBe('2');
});

test('simul: one username seated on both boards', () => {
    const players = new TwoBoardPlayers(model({ wplayer: 'Solo', bplayerB: 'Solo' }), 'Solo'); // team 1 twice

    expect(players.me('a')?.color).toBe('white');
    expect(players.me('b')?.color).toBe('black');
    expect(players.isSpectator()).toBe(false);
    expect(players.myTeam().teamNumber).toBe('1');
});
