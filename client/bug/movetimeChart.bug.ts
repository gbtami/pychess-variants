import Highcharts from "highcharts";
import type { Options } from "highcharts";

import { selectMove } from './movelist.bug';
import { Step } from "../messages";
import AnalysisControllerBughouse from "@/bug/analysisCtrl.bug";
import { BLACK, WHITE } from "@/chess";
import { BugBoardName } from "../types";

export interface MovePoint {
  y: number;
  x?: number;
  name?: any;
  marker?: any;
  color: string;
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
    let maxMove = 0, maxTotal = 0;

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
    const clocktimeLast = {'a': [0, 0], 'b': [0, 0]};
    ctrl.steps.forEach((step: Step, ply: number) => {
        if (step.boardName === 'a') {
            plyA++;
        } else {
            plyB++;
        }
        const turnA = (plyA + 1) >> 1;
        const turnB = (plyB + 1) >> 1;
        // const colorName = step.turnColor;
        const moveColor = step.turnColor === 'white'? BLACK: WHITE;
        const team = moveColor === WHITE && step.boardName === 'a' || moveColor === BLACK && step.boardName === 'b' ? '1': '2';
        if (ply === 0) {
            //moveSeries[colorName].push({y: 0});
            clocktimeLast['a'][WHITE] = step.clocks![WHITE];
            clocktimeLast['a'][BLACK] = step.clocks![BLACK];
            clocktimeLast['b'][WHITE] = step.clocksB![WHITE];
            clocktimeLast['b'][BLACK] = step.clocksB![BLACK];
            return;
        }

        // const hasClocks = (msg.steps[1].clocks?.white !== undefined);

        // if (ply <= 2) {step.movetime = 0;
        // } else {
        //     step.movetime = (ply % 2 === 1) ?
        //         (ctrl.steps[ply-2].clocks![WHITE] - (ctrl.steps[ply].clocks![WHITE] - ctrl.inc * 1000)) :
        //         (ctrl.steps[ply-2].clocks![BLACK] - (ctrl.steps[ply].clocks![BLACK] - ctrl.inc * 1000));
        // }
        const boardName = step.boardName! as BugBoardName
        const moveClocktime = step.boardName === 'a'? step.clocks![moveColor]: step.clocksB![moveColor];
        const lastClocktime = clocktimeLast[boardName][moveColor];
        clocktimeLast[boardName][moveColor] = moveClocktime;
        step.movetime = lastClocktime - (moveClocktime - ctrl.inc * 1000 );

        const y = Math.pow(Math.log(0.005 * Math.min(step.movetime, 12e4) + 3), 2) - logC;
        maxMove = Math.max(y, maxMove);

        let label = step.boardName === 'a'? turnA + 'A. ' + step.san: turnB + 'B. ' + step.san;

        const movePoint = {
            name: label,
            x: ply,
            y: team === '1' ? y : -y,
            color: moveColor === WHITE? whiteColumnFill: blackColumnFill,
        };
        moveSeries[team].push(movePoint);
        //
        if (step.chat !== undefined) {
            for (const i in step.chat) {
                const chatTime = step.chat[i].time;
                const chatTxt = step.chat[i].message;
                const chatUsr = step.chat[i].username;
                'url(\'../../static/images/bugroundchat/noR.svg\')'
                const yChat = Math.pow(Math.log(0.005 * Math.min(chatTime, 12e4) + 3), 2) - logC;
                const chatPoint = {
                    name: chatUsr + ":" + chatTxt,
                    x: ply,
                    y: team === '1' ? yChat : -yChat,
                    color: moveColor === WHITE? whiteColumnFill: blackColumnFill,
                    marker: {
                            symbol: getChatImagePath(chatTxt.replace('!bug!','')),
                            width: '2em',
                            height: '2em'
                        }
                };
                chatSeries.push(chatPoint);
            }
        }
        //

        let clock = clocktimeLast[boardName][WHITE] + clocktimeLast[boardName][BLACK];
        if (clock !== undefined) {
            label += '<br />' + formatClock(clock);
            maxTotal = Math.max(clock, maxTotal);
            totalSeries[team].push({
                name: label,
                x: ply,
                y: team === '1' ? clock : -clock,
                color: team === '1'? "green": "red",
            });
        }

        labels.push(label);
    });

    const clickableOptions = {
        cursor: 'pointer',
        events: {
            click: function(event: any) {
                if (event.point) {
                    event.point.select();
                    selectMove (ctrl, event.point.x)
                }
            }
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

    ctrl.movetimeChart = Highcharts.chart('chart-movetime', {
        chart: { type: 'column',
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
                    click: function(event) {
                        if (event.point) {
                            event.point.select();
                            selectMove (ctrl, event.point.x)
                        }
                    }
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
                }
            },
            scatter: {
                ...clickableOptions
            }
        },
        tooltip: {
            pointFormatter: function(format: string) {
                format = format.replace('{series.name}', '');
                const self: Highcharts.Point = this;
                const step = ctrl.steps[self.x];
                const movetime = step?.movetime;
                if (movetime === undefined) return '';
                else return format.replace('{point.y}', (movetime / 1000).toFixed(1) + "s");
            } as Highcharts.FormatterCallbackFunction<Highcharts.Point>
        },
        xAxis: {
            title: { text: undefined },
            labels: { enabled: false },
            gridLineWidth: 1,
            lineWidth: 0,
            tickWidth: 0
        },
        yAxis: [
        {
            title: { text: null },
            labels: { enabled: false },
            alternateGridColor: undefined,
            min: -maxMove,
            max: maxMove,
            gridLineWidth: 0,
            plotLines: [{
                color: xAxisColor,
                width: 1,
                value: 0,
                zIndex: 10,
            }]
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
                name: 'Board A Clock Area',
                type: 'area',
                yAxis: 1,
                data: totalSeries['1'],
            },
            {
                name: 'Board B Clock Area',
                type: 'area',
                yAxis: 1,
                data: totalSeries['2'],
            },
            {
                name: 'White Move Time',
                type: 'column',
                yAxis: 0,
                data: moveSeries['1'],
                borderColor: whiteColumnBorder,
            },
            {
                name: 'Black Move Time',
                type: 'column',
                yAxis: 0,
                data: moveSeries['2'],
                borderColor: blackColumnBorder,
            },
            {
                name: 'White Clock Line',
                type: 'line',
                yAxis: 1,
                data: totalSeries['1'],
            },
            {
                name: 'Black Clock Line',
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
        ]
    } as Options);
}

const formatClock = (movetime: number) => {
    return (movetime / 1000).toFixed(1) + "s";
};
