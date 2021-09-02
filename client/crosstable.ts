import h from 'snabbdom/h';
import { CT } from "./analysisCtrl";
import {VNode} from "snabbdom/vnode";

export function crosstableView (ctable: CT, gameId: string) {
    const s1 = ctable.s1, s2 = ctable.s2, games = ctable.r;
    let rows : VNode[];
    if (games.length < 20) {
        rows = [h('fill')];
    } else {
        rows = [];
    }
    rows = rows.concat(games.map(game => {
        const ref = game.slice(0, -1);
        let r1, r2;
        switch (game.slice(-1)) {
            case '+':
                r1 = h('a.info-result.win',  { attrs: { href: '/' + ref } }, '1');
                r2 = h('a.info-result.lose', { attrs: { href: '/' + ref } }, '0');
                break
            case '-':
                r1 = h('a.info-result.lose', { attrs: { href: '/' + ref } }, '0');
                r2 = h('a.info-result.win',  { attrs: { href: '/' + ref } }, '1');
                break
            default:
                r1 = h('a.info-result.draw', { attrs: {href: '/' + ref} }, '½');
                r2 = h('a.info-result.draw', { attrs: {href: '/' + ref} }, '½');
        }
        return h('povs', { class: { current: gameId === ref } }, [r1, r2]);
    }));

    const names = ctable._id.split('/');
    const p1 = h('a', { attrs: { href: '/@/' + names[0] } }, names[0]);
    const p2 = h('a', { attrs: { href: '/@/' + names[1] } }, names[1]);

    rows.push(h('div.ct-users', [p1, p2]));

    let lt1, lt2, half;
    half = (s1 % 10 === 5) ? '½' : '';
    lt1 = (s1 === 5) ? '' : Math.floor(s1 / 10);
    lt2 = (s2 === 5) ? '' : Math.floor(s2 / 10);
    if (s1 === s2) {
        lt1 = lt2 = h('span.info-result', lt1 + half);
    } else if (s1 > s2) {
        lt1 = h('span.info-result.win', lt1 + half);
        lt2 = h('span.info-result.lose', lt2 + half);
    } else {
        lt1 = h('span.info-result.lose', lt1 + half);
        lt2 = h('span.info-result.win', lt2 + half);
    }

    rows.push(h('div.ct-score', [lt1, lt2]));

    return h('div#ctable-container', [ h('div.crosstable', rows) ]);
}
