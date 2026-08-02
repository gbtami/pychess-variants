import { h, VNode } from 'snabbdom';
import Highcharts from 'highcharts';
import type { Options } from 'highcharts';

import * as cg from 'chessgroundx/types';

import { selectMainlineMove } from '../common/movelist';
import { Step } from '../../messages';
import AnalysisControllerBughouse from '@/two-board/analysis/analysisCtrl';
import { clockTimeAt } from '../common/seatConfiguration';
import { BugBoardName } from '../../types';
import { displayUsername } from '@/user';

export interface MovePoint {
    y: number;
    x?: number;
    name?: any;
    marker?: any;
    color: string;
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
    const whiteAreaFill = 'rgba(255, 255, 255, 0.2)';
    const whiteColumnFill = 'rgba(255, 255, 255, 0.9)';
    const whiteColumnBorder = '#00000044';
    const blackAreaFill = 'rgba(0, 0, 0, 0.4)';
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

    const labels: string[] = [];

    const logC = Math.pow(Math.log(3), 2);

    let plyA = 0;
    let plyB = 0;
    const clocktimeLast: Record<BugBoardName, Record<cg.Color, number>> = {
        a: { white: 0, black: 0 },
        b: { white: 0, black: 0 },
    };
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
        const team = ctrl.seats.teamOf(mover).teamNumber;

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

        let clock = clocktimeLast[boardName].white + clocktimeLast[boardName].black;
        if (clock !== undefined) {
            label += '<br />' + formatClock(clock);
            maxTotal = Math.max(clock, maxTotal);
            totalSeries[team].push({
                name: label,
                x: ply,
                y: team === '1' ? clock : -clock,
                color: team === '1' ? 'green' : 'red',
            });
        }

        labels.push(label);
    });

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
            backgroundColor: undefined,
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
                fillColor: whiteAreaFill,
                negativeFillColor: blackAreaFill,
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
                min: -maxMove,
                max: maxMove,
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
                name: 'Chats',
                type: 'scatter',
                yAxis: 0,
                data: chatSeries,
            },
        ],
    } as Options);
}

const formatClock = (movetime: number) => {
    return (movetime / 1000).toFixed(1) + 's';
};
