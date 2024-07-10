export type Counter = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export function CheckCounterSvg(cnt: Counter) {
    const colors = (c: Counter) => {
        switch (c) {
        case '0': return 'darkgrey';
        case '1': return '#df5353';
        case '2': return '#e69f00';
        default: return 'darkkhaki';
        }
    }
    const color = colors(cnt);
    return `
<svg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg' version='1.1' transform='translate(66 0)'>
<defs>
  <filter id="shadow">
    <feDropShadow dx="2" dy="4" stdDeviation="2" flood-opacity="0.5" />
  </filter>
</defs>
<circle cx='16' cy='16' r='16' style='fill:${color};filter:url(#shadow)'/>
<text font-family='Noto Sans, Sans-Serif' font-size='28' font-weight='bold' x='50%' y='50%' dy='.36em' fill='#fff' text-anchor='middle'>${cnt}</text>
</svg>`
}
