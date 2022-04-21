import Highcharts from "highcharts";

import { _ } from './i18n';
import { selectMove } from './movelist';
import AnalysisController from './analysisCtrl';

export interface MovePoint {
  y: number;
  x?: number;
  name?: any;
  marker?: any;
}

export function movetimeChart(ctrl: AnalysisController) {
    let maxMove = 0, maxTotal = 0;

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

    ctrl.steps.forEach((step, ply) => {
        const turn = (ply + 1) >> 1;
        const color = ply & 1;
        const colorName = color ? 'white' : 'black';

        if (ply === 0) {
            //moveSeries[colorName].push({y: 0});
            return;
        }

        // const hasClocks = (msg.steps[1].clocks?.white !== undefined);

        if (ply <= 2) {step.clocks!.movetime = 0;
        } else {
            step.clocks!.movetime = (ply % 2 === 1) ?
                (ctrl.steps[ply-1].clocks?.white! - ctrl.steps[ply].clocks?.white!) :
                (ctrl.steps[ply-1].clocks?.black! - ctrl.steps[ply].clocks?.black!);
        }

        const y = Math.pow(Math.log(0.005 * Math.min(step.clocks!.movetime, 12e4) + 3), 2) - logC;
        maxMove = Math.max(y, maxMove);

        let label = turn + (color ? '. ' : '... ') + step.san;
        const movePoint = {
            name: label,
            x: ply,
            y: color ? y : -y,
        };
        moveSeries[colorName].push(movePoint);

        let clock = step.clocks![colorName];
        if (clock !== undefined) {
            label += '<br />' + formatClock(clock);
            maxTotal = Math.max(clock, maxTotal);
            totalSeries[colorName].push({
                x: ply,
                y: color ? clock : -clock,
            });
        }

        labels.push(label);
    });

    const chart = Highcharts.chart('chart-movetime', {
        chart: { type: 'column',
            alignTicks: false,
            spacing: [2, 0, 2, 0],
            animation: false,
            backgroundColor: undefined,
        },
        credits: { enabled: false },
        legend: { enabled: false },
        title: { text: undefined },
        plotOptions: {
            series: {
                animation: false
            },
            area: {
                trackByArea: true,
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
            column: {
                color: whiteColumnFill,
                negativeColor: blackColumnFill,
                grouping: false,
                groupPadding: 0,
                pointPadding: 0,
                states: {
                    hover: { enabled: false },
                }
            }
        },
        tooltip: {
            pointFormatter: function(format: string) {
                format = format.replace('{series.name}', '');
                const self: Highcharts.Point = this;
                const step = ctrl.steps[self.x];
                const movetime = step?.clocks?.movetime;
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
        yAxis: {
            title: { text: undefined },
            labels: { enabled: false },
            min: -maxMove,
            max: maxMove,
            startOnTick: false,
            endOnTick: false,
            lineWidth: 1,
            gridLineWidth: 0,
            plotLines: [{
                color: '#a0a0a0',
                width: 1,
                value: 0,
            }]
        },
        series: [{
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
        ]
    });

    ctrl.movetimeChart = chart;
}

const formatClock = (movetime: number) => {
    return (movetime / 1000).toFixed(1) + "s";
};
