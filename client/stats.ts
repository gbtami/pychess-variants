import Highcharts from "highcharts";

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';


function createPeriods() {
    var periodList: string[] = [];
    var date = new Date(2019, 6, 1, 0, 0, 0);
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


function buildChart(model) {

    var xmlhttp = new XMLHttpRequest();
    const url = model["home"] + "/api/stats"

    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            var myArr = JSON.parse(this.responseText);

            if (!myArr.length) {
                return;
            }
            myFunction(myArr);
        }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();

    function myFunction(arr) {
        Highcharts.chart('stats-chart', {
            chart: { type: 'line'},
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
            series: arr
        } as any);
    }
}

export function statsView(model): VNode[] {
    return [h('div#stats-chart', { hook: { insert: () => buildChart(model)}})];
}
