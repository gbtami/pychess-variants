import { ngettext } from './i18n';

export function timeago(date) {
    const TZdate = new Date(date + 'Z');
    const maxLength = { second: 60, minute: 60, hour: 24, day: 7, week: 4.35, month: 12, year: 10000 };
    let val = (Date.now() - TZdate.getTime()) / 1000;

    for (const unit in maxLength) {
        if (Math.floor(val / maxLength[unit]) === 0) {
            const result = Math.floor(val);
            switch (unit) {
                case "year":
                    return ngettext("%1 year ago", "%1 years ago", result);
                case "month":
                    return ngettext("%1 month ago", "%1 months ago", result);
                case "week":
                    return ngettext("%1 week ago", "%1 weeks ago", result);
                case "day":
                    return ngettext("%1 day ago", "%1 days ago", result);
                case "hour":
                    return ngettext("%1 hour ago", "%1 hours ago", result);
                case "minute":
                    return ngettext("%1 minute ago", "%1 minutes ago", result);
                case "second":
                    return ngettext("%1 second ago", "%1 seconds ago", result);
            }
        }
        val = val / maxLength[unit];
    }
    return '';
}

export function renderTimeago() {
    const x = document.getElementsByTagName("info-date");
    for (let i = 0; i < x.length; i++)
        x[i].innerHTML = timeago(x[i].getAttribute('timestamp'));
    setTimeout(renderTimeago, 1200);
}
