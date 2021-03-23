export function notify(title, options) {
    // Let's check whether notification permissions have already been granted
    if (title && Notification.permission === "granted") {
        // If it's okay let's create a notification
        new Notification(title, options);

    // Otherwise, we need to ask the user for permission
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function (permission) {
            // If the user accepts, let's create a notification
            if (title && permission === "granted") {
                new Notification(title, options);
            }
        });
    }
}
