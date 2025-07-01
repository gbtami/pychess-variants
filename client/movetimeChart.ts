import Highcharts from "highcharts";
import type { Options } from "highcharts";

import { selectMove } from './movelist';
import { AnalysisController } from './analysisCtrl';
import { Step } from "./messages";
import { WHITE, BLACK } from './chess';

export interface MovePoint {
  y: number;
  x?: number;
  name?: any;
  marker?: any;
}

export function movetimeChart(ctrl: AnalysisController) {
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
        white: [] as MovePoint[],
        black: [] as MovePoint[],
    };
    const totalSeries = {
        white: [] as MovePoint[],
        black: [] as MovePoint[],
    };
    const labels: string[] = [];

    const logC = Math.pow(Math.log(3), 2);

    ctrl.steps.forEach((step: Step, ply: number) => {
        const turn = (ply + 1) >> 1;
        const color = ((ply & 1) === 1) ? 0 : 1;
        const colorName = color ? 'black' : 'white';

        if (ply === 0) {
            //moveSeries[colorName].push({y: 0});
            return;
        }

        // const hasClocks = (msg.steps[1].clocks?.white !== undefined);

        if (ply <= 2) {step.movetime = 0;
        } else {
            step.movetime = (ply % 2 === 1) ?
                (ctrl.steps[ply-2]?.clocks![WHITE] - (ctrl.steps[ply]?.clocks![WHITE] - ctrl.inc * 1000)) :
                (ctrl.steps[ply-2]?.clocks![BLACK] - (ctrl.steps[ply]?.clocks![BLACK] - ctrl.inc * 1000));
        }

        const y = Math.pow(Math.log(0.005 * Math.min(step.movetime, 12e4) + 3), 2) - logC;
        maxMove = Math.max(y, maxMove);

        let label = turn + (color ? '. ' : '... ') + step.san;
        const movePoint = {
            name: label,
            x: ply,
            y: color ? -y : y,
        };
        moveSeries[colorName].push(movePoint);

        let clock = step.clocks![color];
        if (clock !== undefined) {
            label += '<br />' + formatClock(clock);
            maxTotal = Math.max(clock, maxTotal);
            totalSeries[colorName].push({
                name: label,
                x: ply,
                y: color ? -clock : clock,
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
                negativeColor: blackColumnFill,
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
                name: 'White Clock Area',
                type: 'area',
                yAxis: 1,
                data: totalSeries.white,
            },
            {
                name: 'Black Clock Area',
                type: 'area',
                yAxis: 1,
                data: totalSeries.black,
            },
            {
                name: 'White Move Time',
                type: 'column',
                yAxis: 0,
                data: moveSeries.white,
                borderColor: whiteColumnBorder,
            },
            {
                name: 'Black Move Time',
                type: 'column',
                yAxis: 0,
                data: moveSeries.black,
                borderColor: blackColumnBorder,
            },
            {
                name: 'White Clock Line',
                type: 'line',
                yAxis: 1,
                data: totalSeries.white,
            },
            {
                name: 'Black Clock Line',
                type: 'line',
                yAxis: 1,
                data: totalSeries.black,
            },
        ]
    } as Options);
}

const formatClock = (movetime: number) => {
    return (movetime / 1000).toFixed(1) + "s";
};
