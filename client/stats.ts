import Highcharts from "highcharts";

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';


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
                categories: [
                    '2019-07', '2019-08', '2019-09', '2019-10', '2019-11', '2019-12', 
                    '2020-01', '2020-02', '2020-03', '2020-04', '2020-05', '2020-06', '2020-07',],  
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
