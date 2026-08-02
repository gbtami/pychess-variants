import { h } from 'snabbdom';

import { patch } from '../client/document';
import { GameInfoView } from '../client/two-board/common/gameInfo';
import { twoBoardSeats } from '../client/two-board/common/seatConfiguration';
import { VARIANTS } from '../client/variants';
import { PyChessModel } from '../client/types';
import type { TwoBoardController } from '../client/two-board/twoBoardCtrl';

function model(overrides: Partial<PyChessModel> = {}): PyChessModel {
    return {
        variant: 'bughouse',
        chess960: 'False',
        rated: 'Casual',
        base: 5,
        inc: 3,
        byo: 0,
        status: -1,
        date: '2026-08-01T12:00:00Z',
        level: 0,
        tournamentId: '',
        tournamentname: '',
        username: 'Anna',
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
    } as unknown as PyChessModel;
}

// GameInfoView.render only reads gameId/model/variant/base/inc/status/seats off the
// controller, so a plain object stands in for one that cannot be built in jsdom.
function ctrlStub(overrides: Partial<PyChessModel> = {}, gameId = 'abcd1234'): TwoBoardController {
    const m = model(overrides);
    return {
        gameId,
        model: m,
        variant: VARIANTS[m.variant],
        base: Number(m.base),
        inc: Number(m.inc),
        status: Number(m.status),
        seats: twoBoardSeats(m, m.username),
    } as unknown as TwoBoardController;
}

function mount(): GameInfoView {
    const view = new GameInfoView();
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, h('div#root', [view.placeholder()]));
    return view;
}

const rows = () => Array.from(document.querySelectorAll('.game-info .player-data'));

test('team rows come from the controller seats: white-A + black-B, then white-B + black-A', () => {
    const view = mount();
    view.render(ctrlStub());

    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Anna');
    expect(rows()[0].textContent).toContain('Dana');
    expect(rows()[1].textContent).toContain('Carl');
    expect(rows()[1].textContent).toContain('Boris');
});

test('ratings are shown for humans and suppressed for bots', () => {
    const view = mount();
    view.render(ctrlStub());

    expect(rows()[0].textContent).toContain('(2500)');
    expect(rows()[1].textContent).not.toContain('(2000)'); // Carl is a BOT
});

test('an in-progress game says so; a finished one shows its date', () => {
    const live = mount();
    live.render(ctrlStub());
    expect(document.querySelector('.info2')!.textContent).toContain('Playing right now');
    expect(document.querySelector('info-date')).toBeNull();

    const done = mount();
    done.render(ctrlStub({ status: 1 } as Partial<PyChessModel>));
    expect(document.querySelector('info-date')).not.toBeNull();
});

test('time control and game type come from the controller, not a re-parsed model', () => {
    const view = mount();
    view.render(ctrlStub());

    expect(document.querySelector('.tc')!.textContent).toContain('5+3');
    expect(document.querySelector('.tc')!.textContent).toContain('Casual');
});

test('the tournament link only appears for a tournament game', () => {
    const plain = mount();
    plain.render(ctrlStub());
    expect(document.querySelector('.tourney')!.textContent).toBe('');

    const tourney = mount();
    tourney.render(ctrlStub({ tournamentId: 'xyz', tournamentname: 'Bug Arena' } as Partial<PyChessModel>));
    const link = document.querySelector('.tourney a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/tournament/xyz');
    expect(link.textContent).toBe('Bug Arena');
});

test('the plain analysis board (no game) leaves its placeholder untouched', () => {
    const view = mount();
    const before = document.body.innerHTML;

    view.render(ctrlStub({}, ''));

    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector('.game-info')!.children).toHaveLength(0);
});
