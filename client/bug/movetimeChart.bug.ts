import Highcharts from "highcharts";

import { selectMove } from './movelist.bug';
import { Step } from "../messages";
import AnalysisControllerBughouse from "@/bug/analysisCtrl.bug";

export interface MovePoint {
  y: number;
  x?: number;
  name?: any;
  marker?: any;
  color: string;
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
    const labels: string[] = [];

    const logC = Math.pow(Math.log(3), 2);

    let plyA = 0;
    let plyB = 0;
    ctrl.steps.forEach((step: Step, ply: number) => {
        if (step.boardName === 'a') {
            plyA++;
        } else {
            plyB++;
        }
        const turnA = (plyA + 1) >> 1;
        const turnB = (plyB + 1) >> 1;
        // const colorName = step.turnColor;
        const moveColor = step.turnColor === 'white'? 'black': 'white';
        const team = moveColor === 'white' && step.boardName === 'a' || moveColor === 'black' && step.boardName === 'b' ? '1': '2';
        if (ply === 0) {
            //moveSeries[colorName].push({y: 0});
            return;
        }

        // const hasClocks = (msg.steps[1].clocks?.white !== undefined);

        // if (ply <= 2) {step.movetime = 0;
        // } else {
        //     step.movetime = (ply % 2 === 1) ?
        //         (ctrl.steps[ply-2].clocks![WHITE] - (ctrl.steps[ply].clocks![WHITE] - ctrl.inc * 1000)) :
        //         (ctrl.steps[ply-2].clocks![BLACK] - (ctrl.steps[ply].clocks![BLACK] - ctrl.inc * 1000));
        // }
        step.movetime = 10000; // TODO:NIKI

        const y = Math.pow(Math.log(0.005 * Math.min(step.movetime, 12e4) + 3), 2) - logC;
        maxMove = Math.max(y, maxMove);

        let label = step.boardName === 'a'? turnA + 'A. ' + step.san: turnB + 'B. ' + step.san;

        const movePoint = {
            name: label,
            x: ply,
            y: team === '1' ? y : -y,
            color: moveColor === 'white'? whiteColumnFill: blackColumnFill,
            marker: {
                symbol: 'url(/static/icons/bugchatmove.svg)'
            }
        };
        moveSeries[team].push(movePoint);

        let clock = 10000; //TODO:NIKI
        if (clock !== undefined) {
            label += '<br />' + formatClock(clock);
            maxTotal = Math.max(clock, maxTotal);
            totalSeries[team].push({
                name: label,
                x: ply,
                y: team === '1' ? clock : -clock,
                color: team === '1'? "green": "red",
                marker: {
                    symbol: 'url(/static/icons/bugchatmove.svg)',
                    width: '1em',
                    height: '1em'
                }
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
        ]
    });
}

const formatClock = (movetime: number) => {
    return (movetime / 1000).toFixed(1) + "s";
};
