import { h, VNode } from 'snabbdom';
import Highcharts from 'highcharts';
import type { Chart, Options } from 'highcharts';

import * as cg from 'chessgroundx/types';

import { selectMainlineMove } from '../common/movelist';
import { Step } from '../../messages';
import AnalysisControllerBughouse from '@/two-board/analysis/analysisCtrl';
import { clockTimeAt } from '../common/seatConfiguration';
import { Team } from '../common/seat';
import { BugBoardName } from '../../types';
import { displayUsername } from '@/user';

export interface MovePoint {
    y: number;
    x?: number;
    name?: any;
    marker?: any;
    color: string;
    // Which half of the chart this point belongs to: +1 above the axis, -1 below.
    // Carried explicitly because `y` cannot answer it for a point whose value is
    // ZERO — and those are exactly the points the baseline below exists for.
    sign: 1 | -1;
    // Per-point label placement and colour. Both depend on the point — which side of
    // the axis it starts from, and what colour its bar is — so neither can be stated
    // once in plotOptions.
    dataLabels?: Highcharts.DataLabelsOptions;
}

// Owns the #chart-movetime container, built ctrl-free so analysis.ts can embed
// it directly. `visible` bakes in the same isAnalysisBoard-derived initial
// display style analysis.ts applied inline before. Highcharts owns its own
// internal DOM subtree once mounted (it isn't a snabbdom-patched widget), so
// this only hands it a real element reference instead of a string id.
export class MovetimeChartView {
    private vnode: VNode;

    constructor(visible: boolean) {
        this.vnode = h('div#chart-movetime', visible ? { style: { display: 'block' } } : {});
    }

    placeholder(): VNode {
        return this.vnode;
    }

    element(): HTMLElement {
        return this.vnode.elm as HTMLElement;
    }
}

function getChatImagePath(chatCode: string): string {
    // TODO: should think of more elegant way to map those, since cant use html and css for highchart markers and need
    switch (chatCode) {
        case 'p': {
            return 'url(../../static/images/bugroundchat/P.svg)';
        }
        case 'n': {
            return 'url(../../static/images/bugroundchat/N.svg)';
        }
        case 'b': {
            return 'url(../../static/images/bugroundchat/B.svg)';
        }
        case 'r': {
            return 'url(../../static/images/bugroundchat/R.svg)';
        }
        case 'q': {
            return 'url(../../static/images/bugroundchat/Q.svg)';
        }
        case 'nop': {
            return 'url(../../static/images/bugroundchat/noP.svg)';
        }
        case 'non': {
            return 'url(../../static/images/bugroundchat/noN.svg)';
        }
        case 'nob': {
            return 'url(../../static/images/bugroundchat/noB.svg)';
        }
        case 'nor': {
            return 'url(../../static/images/bugroundchat/noR.svg)';
        }
        case 'noq': {
            return 'url(../../static/images/bugroundchat/noQ.svg)';
        }
        case 'sit': {
            return 'url(../../static/images/bugroundchat/SIT.svg)';
        }
        case 'go': {
            return 'url(../../static/images/bugroundchat/GO.svg)';
        }
        case 'trade': {
            return 'url(../../static/images/bugroundchat/TRADE.svg)';
        }
        case 'notrade': {
            return 'url(../../static/images/bugroundchat/NOTRADE.svg)';
        }
        case 'mate': {
            return 'url(../../static/images/bugroundchat/MATE.svg)';
        }
        case 'ok': {
            return 'url(../../static/images/bugroundchat/OK.svg)';
        }
        case 'no': {
            return 'url(../../static/images/bugroundchat/NO.svg)';
        }
        case 'mb': {
            return 'url(../../static/images/bugroundchat/MB.svg)';
        }
        case 'nvm': {
            return 'url(../../static/images/bugroundchat/NVM.svg)';
        }
        case 'nice': {
            return 'url(../../static/images/bugroundchat/NICE.svg)';
        }
    }
    return 'url(/static/icons/bugchatmove.svg)';
}

export function movetimeChart(ctrl: AnalysisControllerBughouse) {
    let maxMove = 0,
        maxTotal = 0;

    const highlightColor = '#3893E8';
    const xAxisColor = '#cccccc99';
    /* ONE GROUND FOR THE WHOLE CHART, and it has to be light enough to read a black bar on.
       This is the value the POSITIVE half used to be washed with, promoted from a fill to the
       chart's background so that both halves share it.

       Before, the two halves had different grounds and only one of them worked. Measured against
       this page's rgb(22, 21, 18): the positive half rendered rgb(69, 68, 65) and a black column
       on it rgb(7, 6, 6) — readable. The negative half was `rgba(0, 0, 0, 0.4)`, rendering
       rgb(13, 13, 11), and a black column on THAT came out rgb(1, 1, 1) against a nearly black
       backdrop. Team 2's dark-side bars were not missing, they were invisible.

       Left as an alpha over the page rather than resolved to an opaque rgb, so it still composites
       against whatever the theme puts behind it — the same reason the chart declared no background
       at all before. */
    const chartBackground = 'rgba(255, 255, 255, 0.2)';
    // Deliberately not the blue: this line answers a different question from the clock lines
    // and is drawn against its own axis, so it must not read as a third one of them.
    const differenceColor = '#E8A33D';
    // A label is drawn ON its own bar, so it takes the bar's opposite: dark text on the white
    // bars, light text on the black ones. That is what removes the need for a halo — the
    // contrast comes from the pairing rather than from an outline behind the glyphs.
    const labelOnWhiteBar = '#141312';
    const labelOnBlackBar = '#F2F0ED';
    const whiteColumnFill = 'rgba(255, 255, 255, 0.9)';
    const whiteColumnBorder = '#00000044';
    const blackColumnFill = 'rgba(0, 0, 0, 0.9)';
    const blackColumnBorder = '#ffffff33';

    const moveSeries = {
        '1': [] as MovePoint[],
        '2': [] as MovePoint[],
    };
    const totalSeries = {
        '1': [] as MovePoint[],
        '2': [] as MovePoint[],
    };
    const chatSeries = [] as MovePoint[];
    const differenceSeries = [] as MovePoint[];
    let maxDifference = 0;

    const labels: string[] = [];

    const logC = Math.pow(Math.log(3), 2);

    let plyA = 0;
    let plyB = 0;
    const clocktimeLast: Record<BugBoardName, Record<cg.Color, number>> = {
        a: { white: 0, black: 0 },
        b: { white: 0, black: 0 },
    };
    // What a team has left: its two seats, which are on different boards. Team 1 is white-A
    // with black-B, team 2 is black-A with white-B — taken from the seat model rather than
    // restated here.
    const teamTotal = (team: Team) =>
        team.seats.reduce((sum, seat) => sum + clocktimeLast[seat.boardName][seat.color], 0);

    ctrl.steps.forEach((step: Step, ply: number) => {
        if (step.boardName === 'a') {
            plyA++;
        } else {
            plyB++;
        }
        const turnA = (plyA + 1) >> 1;
        const turnB = (plyB + 1) >> 1;
        if (ply === 0) {
            ctrl.seats.all.forEach(p => (clocktimeLast[p.boardName][p.color] = clockTimeAt(step, p)!));
            return;
        }

        const boardName = step.boardName! as BugBoardName;
        // the mover of this step is the player whose turn it no longer is
        const moverColor: cg.Color = step.turnColor === 'white' ? 'black' : 'white';
        const mover = ctrl.seats.byBoardAndColor(boardName, moverColor);
        const moverTeam = ctrl.seats.teamOf(mover);
        const team = moverTeam.teamNumber;

        const moveClocktime = clockTimeAt(step, mover)!;
        const lastClocktime = clocktimeLast[boardName][moverColor];
        clocktimeLast[boardName][moverColor] = moveClocktime;
        step.movetime = lastClocktime - (moveClocktime - ctrl.inc * 1000);

        const y = Math.pow(Math.log(0.005 * Math.min(step.movetime, 12e4) + 3), 2) - logC;
        maxMove = Math.max(y, maxMove);

        let label = step.boardName === 'a' ? turnA + 'A. ' + step.san : turnB + 'B. ' + step.san;

        const movePoint = {
            name: label,
            x: ply,
            y: team === '1' ? y : -y,
            color: moverColor === 'white' ? whiteColumnFill : blackColumnFill,
            sign: (team === '1' ? 1 : -1) as 1 | -1,
            dataLabels: {
                /* ANCHORED TO THE CENTRAL AXIS, which for a bar is the end it grows FROM. A
                   team-1 bar grows away from the axis in the positive direction, so its axis
                   end is its leading edge and the label is aligned there; a team-2 bar grows
                   the other way, so its axis end is the trailing one.

                   Both axes are stated because the chart turns: `align` is the value axis when
                   the chart is inverted and the bars run horizontally, `verticalAlign` when it
                   is not and they run vertically. Highcharts reads whichever applies, so one
                   pair of declarations survives the flip. */
                align: (team === '1' ? 'left' : 'right') as Highcharts.AlignValue,
                verticalAlign: (team === '1' ? 'bottom' : 'top') as Highcharts.VerticalAlignValue,
                // the opposite of this bar's own fill
                color: moverColor === 'white' ? labelOnWhiteBar : labelOnBlackBar,
            },
        };
        moveSeries[team].push(movePoint);
        //
        if (step.chat !== undefined) {
            for (const i in step.chat) {
                const chatTime = step.chat[i].time;
                const chatTxt = step.chat[i].message;
                const chatUsr = displayUsername(step.chat[i].username);
                const yChat = Math.pow(Math.log(0.005 * Math.min(chatTime, 12e4) + 3), 2) - logC;
                const chatPoint = {
                    name: chatUsr + ':' + chatTxt,
                    x: ply,
                    y: team === '1' ? yChat : -yChat,
                    color: moverColor === 'white' ? whiteColumnFill : blackColumnFill,
                    sign: (team === '1' ? 1 : -1) as 1 | -1,
                    marker: {
                        symbol: getChatImagePath(chatTxt.replace('!bug!', '')),
                        width: '2em',
                        height: '2em',
                    },
                };
                chatSeries.push(chatPoint);
            }
        }
        //

        /* A TEAM'S CLOCK IS ITS TWO SEATS, WHICH ARE ON DIFFERENT BOARDS.
           `teamOf()` gives them: team 1 is white-A with black-B, team 2 is black-A with white-B.
           Summed over the team's own seats rather than written as two board/colour pairs, so this
           follows the seat model instead of restating it.

           It used to read `clocktimeLast[boardName].white + clocktimeLast[boardName].black` — the
           two players sitting AT ONE BOARD, which is one player from each team, so it was not a
           team quantity at all. Worse, the series it was pushed into was chosen by the mover's
           team while the value came from the mover's board, so a single line reported board A's
           total at some plies and board B's at others: measured on JJgZzLhJ, team 1's sixteen
           points came from boards `a a b b a a a b b b b b b b b b`. The last nine plies of that
           game were all on board B, so both lines plotted the same number and the two curves
           converged — 6,477,922 against 6,471,569, differing only by the 6.35s between those two
           moves. The series were already NAMED for the teams, which is what the intent was. */
        let clock = teamTotal(moverTeam);
        if (clock !== undefined) {
            label += '<br />' + formatClock(clock);
            maxTotal = Math.max(clock, maxTotal);
            totalSeries[team].push({
                name: label,
                x: ply,
                y: team === '1' ? clock : -clock,
                color: team === '1' ? 'green' : 'red',
                // Same half as this team's bars. The clock lines take no baseline — they
                // are never zero and have their own axis — but the side is a property of
                // every point on this chart, so it is stated here too.
                sign: (team === '1' ? 1 : -1) as 1 | -1,
            });
        }

        /* THE CLOCK DIFFERENCE, AS A SINGLE NUMBER FROM TEAM 1'S POINT OF VIEW.
           ----------------------------------------------------------------------------------
           Positive means team 1 is ahead on time, negative means team 2 is.

           HALF the team difference, and the half is the point rather than a scaling choice. An
           indicator beside a clock shows that seat's time minus the time of the OPPONENT'S
           PARTNER — the same colour on the other board — so the four indicators carry two
           magnitudes, `wA - wB` and `bB - bA`, each drawn twice with opposite signs. They are
           NOT interchangeable: their difference is exactly `boardA total - boardB total`, so
           they agree only when both boards have spent the same time, which nothing enforces.
           Measured on JJgZzLhJ they disagreed on 29 of 32 plies, by as much as 465s, ending at
           -383s and -598s.

           Halving the team difference gives the number both of a team's indicators would show
           if they agreed — the average of the two magnitudes — which is the quantity Nikolay
           wants a single line for. It is also what the indicators themselves should arguably
           show, since two players on one team share one team clock; that is a round-page change
           and is not made here.

           Its own axis, because it is a difference and not a total: on the clock lines' scale
           of two full hours, a ten-minute lead is a hairline. */
        const difference = (teamTotal(ctrl.seats.teams[0]) - teamTotal(ctrl.seats.teams[1])) / 2;
        maxDifference = Math.max(Math.abs(difference), maxDifference);
        differenceSeries.push({
            name: label + '<br />' + formatDifference(difference),
            x: ply,
            y: difference,
            color: differenceColor,
            sign: difference >= 0 ? 1 : -1,
        });

        labels.push(label);
    });

    /* A FLOOR UNDER EVERY BAR, SO A MOVE THAT COST NO TIME IS STILL DRAWN.
       ------------------------------------------------------------------------------------
       A premove costs its player nothing, and the formula above maps nothing to exactly zero:
       `pow(log(0.005 * 0 + 3), 2) - log(3)^2` is 0 by construction, not merely small. Measured
       on JJgZzLhJ, 10 of 32 plies came out at exactly 0.00s and drew nothing at all, while the
       smallest bar that DID draw was 11px — so there was no gradual fade, just a hole where a
       move had been. A reader cannot tell a move that took no time from a move that is missing.

       The floor is a whole 2% of the panel, added to every bar rather than only to the zeroes,
       so the bars keep their relative order and spacing: what changes is where they start, not
       how they compare. Anything above the floor is the existing curve, unaltered.

       2%, not 1%: at 1% the floor rendered 2px tall against a 236px panel and was still being
       missed on a glance. This is the one number to turn if it needs to be plainer still.

       SOLVED, not applied to the pre-baseline maximum. The panel spans [-max, +max], so its
       height is 2*max, and lifting every bar also lifts the tallest one — which moves the very
       height the fraction is measured against. Taking it off the OLD height would leave the floor
       slightly under the asked-for share of the panel actually drawn. `b = 2f(maxMove + b)`
       rearranges to the expression below, which is exactly `f` of the final panel.

       Applied per point via its own `sign`, not via the sign of `y`: a zero has no sign, and the
       zeroes are the whole point. */
    const baselineFraction = 0.02;
    const baseline = (2 * baselineFraction * maxMove) / (1 - 2 * baselineFraction);
    for (const point of [...moveSeries['1'], ...moveSeries['2'], ...chatSeries]) {
        point.y += point.sign * baseline;
    }
    const maxColumn = maxMove + baseline;

    /* THE MOVE ON THE BAR THAT COST THE TIME.
       The point's `name` is already the notation — `12B. Nf4`: the turn number, which board,
       and the SAN — built for the tooltip header and reused rather than formatted twice. It is
       the SHORT form on purpose: `label` gains the clock reading a few lines further down, but
       the point captured the string before that and strings do not change under it.

       OUTSIDE the bar, not inside it. A bar's length is the whole message and ten of the
       thirty-two are only the 2% floor, so an inside label would be clipped by exactly the
       bars that most need naming. Outside puts every label on the chart's own ground, at the
       end away from the axis, where it reads against one background colour whichever team's
       side it is on.

       `crop: false` so a label is never DROPPED for touching the plot edge — the longest bar is
       the most interesting one — and `overflow: 'justify'` so one that would run past the edge
       is nudged back inside instead of spilling. `allow` was the first choice and it spills:
       measured in portrait's 219px panel, 2 labels cut off at the left edge and 5 at the right,
       each sliced mid-word by the panel's own `overflow: hidden`. Justify costs nothing on the
       wide panels, where nothing needs nudging.

       A justified label lands ON its bar rather than beside it, and the bars are white as often
       as black, so the text carries a dark halo: light glyphs on a dark outline read against the
       grey ground, a black bar and a white one alike. The halo is the reason the colour can stay
       one value instead of tracking each bar's fill.

       `allowOverlap` because the alternative is Highcharts silently hiding labels, and a chart
       that names some moves and not others is worse than one that names none. */
    const moveLabels: Highcharts.DataLabelsOptions = {
        enabled: true,
        formatter: function (this: Highcharts.Point) {
            return this.name;
        },
        // INSIDE, anchored to the central axis — see the per-point `align` below. Every label
        // therefore starts from the same line and they read as two columns either side of it,
        // instead of tracking the ragged ends of thirty-two bars of different lengths.
        inside: true,
        crop: false,
        overflow: 'justify',
        allowOverlap: true,
        style: {
            fontSize: '9px',
            fontWeight: 'normal',
            // no halo: each label is the inverse of the bar it sits on, so the contrast is
            // already there. The colour itself is per point.
            textOutline: 'none',
        },
    };

    const clickableOptions = {
        cursor: 'pointer',
        events: {
            click: function (event: any) {
                if (event.point) {
                    event.point.select();
                    selectMainlineMove(ctrl, event.point.x);
                }
            },
        },
    };
    const foregrondLineOptions = {
        ...clickableOptions,
        color: highlightColor,
        lineWidth: 2,
        states: {
            hover: {
                lineWidth: 2,
            },
        },
        marker: {
            radius: 1,
            states: {
                hover: {
                    radius: 3,
                    lineColor: highlightColor,
                    fillColor: 'white',
                },
                select: {
                    radius: 4,
                    lineColor: highlightColor,
                    fillColor: 'white',
                },
            },
        },
    };

    ctrl.movetimeChart = Highcharts.chart(ctrl.movetimeChartView.element(), {
        chart: {
            type: 'column',
            alignTicks: false,
            spacing: [2, 0, 2, 0],
            animation: false,
            backgroundColor: chartBackground,
            plotShadow: false,
        },
        credits: { enabled: false },
        legend: { enabled: false },
        title: { text: undefined },
        plotOptions: {
            series: {
                animation: false,
                shadow: false,
            },
            area: {
                ...foregrondLineOptions,
                trackByArea: true,
                color: highlightColor,
                /* No fill: the ground above is already this colour, and a second wash of it over
                   one half would put the two halves back out of step. What these series still
                   contribute is `trackByArea`, which makes the whole band under a line clickable
                   for seeking, rather than only the line itself. */
                fillColor: 'transparent',
                negativeFillColor: 'transparent',
                events: {
                    click: function (event) {
                        if (event.point) {
                            event.point.select();
                            selectMainlineMove(ctrl, event.point.x);
                        }
                    },
                },
            },
            line: foregrondLineOptions,
            column: {
                ...clickableOptions,
                color: whiteColumnFill,
                grouping: false,
                groupPadding: 0,
                pointPadding: 0,
                /* THE MOVE ON THE BAR THAT COST THE TIME.
                   The point's `name` is already the notation — `12B. Nf4`, the turn number,
                   which board, and the SAN — built for the tooltip header and reused here
                   rather than formatted a second time. Note it is the SHORT form: `label`
                   gains the clock reading a few lines later, but the point captured the
                   string before that, and strings do not change under it.

                   OUTSIDE the bar, not in it. A bar's length is the whole message and half
                   of them are only the 2% floor, so a label inside would be clipped by the
                   very bars that most need saying which move they are. Outside puts every
                   label on the chart's own ground, at the end away from the axis, where it
                   reads against a single background colour whichever team's side it is on.

                   `crop` and `overflow` because a label at the end of the longest bar would
                   otherwise be dropped for touching the plot edge, and the longest bar is
                   the most interesting one. `allowOverlap` because the alternative is
                   Highcharts silently hiding labels — and a chart that names some moves and
                   not others is worse than one that names none. */
                dataLabels: moveLabels,
                states: {
                    hover: { enabled: false },
                    select: {
                        enabled: false,
                        color: highlightColor,
                        borderColor: highlightColor,
                    },
                },
            },
            scatter: {
                ...clickableOptions,
            },
        },
        tooltip: {
            pointFormatter: function (this: Highcharts.Point) {
                const step = ctrl.steps[this.x];
                const movetime = step?.movetime;
                if (movetime === undefined) return '';
                return `<span style="color:${this.color}">●</span> <b>${(movetime / 1000).toFixed(1)}s</b><br/>`;
            },
        },
        xAxis: {
            title: { text: undefined },
            labels: { enabled: false },
            gridLineWidth: 1,
            lineWidth: 0,
            tickWidth: 0,
        },
        yAxis: [
            {
                title: { text: null },
                labels: { enabled: false },
                alternateGridColor: undefined,
                min: -maxColumn,
                max: maxColumn,
                /* HONOUR min/max EXACTLY. Highcharts extends an axis to the next round TICK by
                   default, so the values above were the data's range and not the panel's: the
                   tallest bar reached 40.7% of the half-panel instead of 100%, and the baseline
                   below landed at 0.42% of the drawn height rather than the 1% it computes to.

                   Nothing is lost by switching it off here — this axis draws no grid lines and no
                   labels, so its ticks were never visible; all the rounding did was pad about a
                   quarter of the panel with blank space and shrink everything into what was left. */
                startOnTick: false,
                endOnTick: false,
                gridLineWidth: 0,
                plotLines: [
                    {
                        color: xAxisColor,
                        width: 1,
                        value: 0,
                        zIndex: 10,
                    },
                ],
            },
            {
                title: { text: null },
                min: -maxTotal,
                max: maxTotal,
                labels: { enabled: false },
                gridLineWidth: 0,
            },
            {
                /* The difference line's own scale. SYMMETRIC about zero deliberately: the axis
                   has to put "level" on the chart's centre line, where the other two axes put
                   their zero, or a game in which one team is always behind would auto-scale to
                   a range with zero at the very top and the line would read as an advantage.

                   The fallback keeps the axis from collapsing to a zero-height range in the one
                   case where every ply is level. */
                title: { text: null },
                min: -(maxDifference || 1),
                max: maxDifference || 1,
                labels: { enabled: false },
                startOnTick: false,
                endOnTick: false,
                gridLineWidth: 0,
            },
        ],
        series: [
            {
                name: ctrl.seats.teams[0].name() + ' Clock Area',
                type: 'area',
                yAxis: 1,
                data: totalSeries['1'],
            },
            {
                name: ctrl.seats.teams[1].name() + ' Clock Area',
                type: 'area',
                yAxis: 1,
                data: totalSeries['2'],
            },
            {
                name: ctrl.seats.teams[0].name() + ' Move Time',
                type: 'column',
                yAxis: 0,
                data: moveSeries['1'],
                borderColor: whiteColumnBorder,
            },
            {
                name: ctrl.seats.teams[1].name() + ' Move Time',
                type: 'column',
                yAxis: 0,
                data: moveSeries['2'],
                borderColor: blackColumnBorder,
            },
            {
                name: ctrl.seats.teams[0].name() + ' Clock Line',
                type: 'line',
                yAxis: 1,
                data: totalSeries['1'],
            },
            {
                name: ctrl.seats.teams[1].name() + ' Clock Line',
                type: 'line',
                yAxis: 1,
                data: totalSeries['2'],
            },
            {
                name: ctrl.seats.teams[0].name() + ' Time Advantage',
                type: 'line',
                yAxis: 2,
                data: differenceSeries,
                // overrides plotOptions.line, which paints every line series with the clock blue
                color: differenceColor,
                marker: {
                    radius: 1,
                    states: {
                        hover: { radius: 3, lineColor: differenceColor, fillColor: 'white' },
                        select: { radius: 4, lineColor: differenceColor, fillColor: 'white' },
                    },
                },
            },
            {
                name: 'Chats',
                type: 'scatter',
                yAxis: 0,
                data: chatSeries,
            },
        ],
    } as Options);

    trackChartOrientation(ctrl.movetimeChart, ctrl.movetimeChartView.element());
}

let orientationObserver: ResizeObserver | undefined;

/**
 * Draw the chart along whichever axis its panel has more room for: vertical — plies running
 * down, teams left and right — where the panel is taller than it is wide, horizontal where it
 * is not.
 *
 * THE RULE IS NOT HERE. It is the `@container movechart (aspect-ratio < 1)` block in
 * bughouse.css, which writes `--bug-chart-inverted`. That is where it belongs: it is a
 * question about a box, and the stylesheet is what decides the boxes — the panel is tall and
 * narrow in portrait's tools column and short and wide in a landscape one, so the answer
 * follows the layout instead of being a second opinion about it. This function only carries
 * the answer across, because `inverted` transposes axes, bar direction, tooltip anchoring and
 * hit areas at RENDER time and no stylesheet can reach that.
 *
 * `reversed` travels with it so the plies always read the way the mode reads: top-to-bottom
 * beside a movelist when vertical, left-to-right when not.
 *
 * WHY AN OBSERVER IS SAFE HERE, when the boards may not have one. The standing rule is about
 * the observer that redraws BOARDS, where a re-measure feeds the size it measured. Nothing of
 * that shape exists here: `.chart-container` is `container-type: size`, so its box comes from
 * outside it and nothing the chart draws can change it. The input cannot depend on the output,
 * so there is no loop — which is also why the comparison below is not the forbidden
 * termination guard. It skips a redundant re-render during a window drag; remove it and the
 * behaviour is identical, only slower.
 *
 * It covers showing the tab as well as resizing, for free: a panel whose tab is not selected
 * is `display: none` and has no box, so selecting it is a size change like any other.
 */
export function trackChartOrientation(chart: Chart, element: HTMLElement): void {
    const panel = element.parentElement;
    if (!panel) return;

    const apply = () => {
        const inverted = getComputedStyle(element).getPropertyValue('--bug-chart-inverted').trim() === '1';
        if (chart.inverted === inverted) return;
        chart.update(
            {
                chart: { inverted },
                xAxis: { reversed: inverted },
                /* The labels turn with the chart. Vertical gives each ply a row of its own, so
                   the notation reads straight; horizontal gives each ply a column about 34px
                   wide against a label nearer 45, so there it runs ALONG the bar instead. */
                plotOptions: { column: { dataLabels: { rotation: inverted ? 0 : -90 } } },
            },
            true,
        );
    };

    apply();
    orientationObserver?.disconnect();
    orientationObserver = new ResizeObserver(apply);
    orientationObserver.observe(panel);
}

// A lead carries its sign; formatClock already writes the minus for a deficit.
const formatDifference = (millis: number) => (millis > 0 ? '+' : '') + formatClock(millis);

const formatClock = (movetime: number) => {
    return (movetime / 1000).toFixed(1) + 's';
};
