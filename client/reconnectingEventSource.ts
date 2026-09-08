// Native EventSource retries interrupted streams, but stops on HTTP errors such
// as a temporary 503. Restart CLOSED sources in both windows and workers.
export function reconnectingEventSource(url: string, onMessage: (data: string) => void) {
    let source: EventSource;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1500;
    let closed = false;

    function connect() {
        source = new EventSource(url);
        source.onmessage = event => onMessage(event.data);
        source.onopen = () => {
            retryDelay = 1500;
        };
        source.onerror = () => {
            // Leave recoverable failures to the browser's native retry loop.
            if (closed || source.readyState !== EventSource.CLOSED || retryTimer !== undefined) return;
            source.close();
            retryTimer = setTimeout(() => {
                retryTimer = undefined;
                connect();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
        };
    }

    connect();
    return {
        close: () => {
            closed = true;
            clearTimeout(retryTimer);
            source.onopen = null;
            source.onmessage = null;
            source.onerror = null;
            source.close();
        },
    };
}
