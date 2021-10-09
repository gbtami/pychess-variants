import Highcharts from "highcharts";

import { h } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';

function createPeriods() {
    const periodList: string[] = [];
    const date = new Date(2019, 5, 1, 0, 0, 0);  // (2019-06-01) the month is 0-indexed
    const endDate = new Date();
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

    while (date <= endDate) {
        const year = date.getFullYear().toString();
        const month = months[date.getMonth()];
        periodList.push(year + '-' + month);
        date.setMonth(date.getMonth() + 1);
    }
    return periodList;
}

function buildChart() {
    const xmlhttp = new XMLHttpRequest();
    const url = "/api/stats"

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);

            if (!response.length) {
                return;
            }
            Highcharts.chart('stats-chart', {
                chart: { type: 'line' },
                credits: { enabled: false },
                title: { text: undefined },
                legend: {
                    layout: 'vertical',
                    align: 'right',
                    verticalAlign: 'top',
                },
                xAxis: {
                    categories: createPeriods(),  
                },
                yAxis: {
                    type: 'logarithmic',
                },
                responsive: {
                    rules: [{
                        condition: {
                            maxWidth: 1200
                        },
                        chartOptions: {
                            legend: {
                                align: 'center',
                                verticalAlign: 'bottom',
                                layout: 'horizontal'
                            }
                        }
                    }]
                },
                series: response
            });
        }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}

export function statsView(): VNode[] {
    return [ h('div#stats-chart', { hook: { insert: () => buildChart() } }) ];
}
