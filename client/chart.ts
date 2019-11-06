import Highcharts from "highcharts";

import { povChances, selectMove } from './movelist';

export function analysisChart (ctrl) {
    const scores = ctrl.steps.map(
            (step, ply) => {
                if (step.ceval !== undefined) {
                    const score = step.ceval.score;
                    if (score !== undefined) {
                        var turn = Math.floor((ply - 1) / 2) + 1;
                        var dots = step.turnColor === 'black' ? '.' : '...';
                        var point = {
                          name: turn + dots + ' ' + step.san,
                          y: povChances(step.turnColor, score)
                        };
                        if (ply === 0) point.name = 'Initial position';
                        return point;
                    } else return null;
                } else return null;
            })
    ctrl.analysisChart = Highcharts.chart('chart', {
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
          fillColor: 'rgba(255,255,255,0.7)',
          negativeFillColor: 'rgba(0,0,0,0.2)',
          threshold: 0,
          lineWidth: 1,
          color: '#d85000',
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
                lineColor: '#d85000'
              },
              select: {
                radius: 4,
                lineColor: '#d85000'
              }
            }
          }
        }
        },
        tooltip: {
            pointFormatter: function(format: string) {
              format = format.replace('{series.name}', 'Advantage');
              var self: Highcharts.Point = this;
              var ceval = ctrl.steps[self.x].ceval.score;
              if (!ceval) return '';
              else return format.replace('{point.y}', ctrl.steps[self.x].scoreStr);
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
        series: [{ data: scores } as Highcharts.SeriesColumnOptions
        ]
    });
}
