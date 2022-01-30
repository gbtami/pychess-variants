import { Calendar } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import allLocales from '@fullcalendar/core/locales-all';

import { h, VNode } from 'snabbdom';

import { VARIANTS } from './chess';

function buildCalendar() {

    const xmlhttp = new XMLHttpRequest();
    const url = "/api/calendar";

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);

            if (!response.length) {
                return;
            }

            for (const i in response) {
                const variant = response[i].title.replace('960', '');
                const chess960 = response[i].title.includes('960');
                response[i].title = VARIANTS[variant].displayName(chess960);
            }

        // console.log(response);
        let calendarEl: HTMLElement = document.getElementById('fullcalendar')!;

        let calendar = new Calendar(calendarEl, {
            plugins: [ interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin ],
            locales: allLocales,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            },
            initialDate: '2022-01-01',
            firstDay: 1,
            showNonCurrentDates: false,
            fixedWeekCount: false,
            navLinks: true, // can click day/week names to navigate views
            dayMaxEvents: true, // allow "more" link when too many events
            events: response
        });

        let locale = 'en'
        const el = document.getElementById('pychess-variants');
        if (el) {
            const lang = el.getAttribute("data-lang")!;
            if (calendar.getAvailableLocaleCodes().includes(lang)) locale = lang;
            if (lang === 'zh') locale = 'zh-cn';
        }
        calendar.setOption('locale', locale);

        calendar.render();
        }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}

export function calendarView(): VNode[] {
    return [
        h('div#fullcalendar', { hook: { insert: () => buildCalendar() } }),
    ];
}
