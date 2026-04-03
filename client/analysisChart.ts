import Highcharts from "highcharts";

import { _ } from './i18n';
import { selectMove } from './movelist';
import { povChances } from './winningChances';
import { AnalysisController } from './analysisCtrl';
import { Step } from "./messages";
import { analysisChartZone } from './variantColor';

export function analysisChart(ctrl: AnalysisController) {
    const firstSide = analysisChartZone(ctrl.variant.colors.first);
    const secondSide = analysisChartZone(ctrl.variant.colors.second);
    const scores = ctrl.steps.map(
        (step: Step, ply: number) => {
            if (step.ceval !== undefined) {
                const score = step.ceval.s;
                const color = step.turnColor;
                if (score !== undefined) {
                    const turn = Math.floor((ply - 1) / 2) + 1;
                    const dots = step.turnColor === 'black' ? '.' : '...';
                    const point = {
                        name: turn + dots + ' ' + step.san,
                        y: povChances(color, score)
                    };
                    if (ply === 0) point.name = _('Initial position');
                    return point;
                }
                else {
                    return null;
                }
            }
            else {
                return null;
            }
        }
    );
    ctrl.analysisChart = Highcharts.chart('chart-analysis', {
        chart: { type: 'area',
            spacing: [3, 0, 3, 0],
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
                threshold: 0,
                zoneAxis: 'y',
                zones: [
                    {
                        value: 0,
                        color: secondSide.color,
                        fillColor: secondSide.fillColor,
                    },
                    {
                        color: firstSide.color,
                        fillColor: firstSide.fillColor,
                    },
                ],
                lineWidth: 1,
                allowPointSelect: true,
                cursor: 'pointer',
                states: {
                    hover: {
                        lineWidth: 1
                    }
                },
                events: {
                    click: function(event) {
                        if (event.point) {
                            event.point.select();
                            selectMove (ctrl, event.point.x)
                        }
                    }
                },
                marker: {
                    radius: 1,
                    states: {
                        hover: {
                            radius: 4,
                        },
                        select: {
                            radius: 4,
                        }
                    }
                }
            }
        },
        tooltip: {
            pointFormatter: function(format: string) {
                format = format.replace('{series.name}', _('Advantage'));
                const self: Highcharts.Point = this;
                const step = ctrl.steps[self.x];
                const ceval = step?.ceval?.s;
                if (!ceval) return '';
                else return format.replace('{point.y}', step.scoreStr || '');
            } as Highcharts.FormatterCallbackFunction<Highcharts.Point>
        },
        xAxis: {
            title: { text: undefined },
            labels: { enabled: false },
            gridLineWidth: 0,
            lineWidth: 0,
            tickWidth: 0
        },
        yAxis: {
            title: { text: undefined },
            labels: { enabled: false },
            min: -1.1,
            max: 1.1,
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
        series: [{ data: scores } as Highcharts.SeriesColumnOptions]
    });
}
