const CHAT_SPAM_STORAGE_KEY = 'chat-spam';

const spamRegex = new RegExp(
    [
        'xcamweb.com',
        '(^|[^i])chess-bot',
        'chess-cheat',
        'coolteenbitch',
        'letcafa.webcam',
        'tinyurl.com/',
        'wooga.info/',
        'bit.ly/',
        'wbt.link/',
        'eb.by/',
        '001.rs/',
        'shr.name/',
        'u.to/',
        '.3-a.net',
        '.ssl443.org',
        '.ns02.us',
        '.myftp.info',
        '.flinkup.com',
        '.serveusers.com',
        'badoogirls.com',
        'hide.su',
        'wyon.de',
        'sexdatingcz.club',
        'qps.ru',
        'tiny.cc/',
        'trasderk.blogspot.com',
        't.ly/',
        'shorturl.at/',
        'lichess77',
        '77Casino.cfd',
        'Betspin.life',
    ]
        .map(url => url.replace(/\./g, '\\.').replace(/\//g, '\\/'))
        .join('|'),
    'i',
);

const followMeRegex = /follow me|join my team/i;

function safeLocalStorageGet(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage failures in restricted browser contexts.
    }
}

export function isKnownSpammer(): boolean {
    return safeLocalStorageGet(CHAT_SPAM_STORAGE_KEY) === '1';
}

export function hasSuspiciousLink(text: string): boolean {
    return spamRegex.test(text);
}

export function hasSpamPhrase(text: string): boolean {
    return followMeRegex.test(text);
}

export function selfReport(text: string): void {
    if (isKnownSpammer()) return;
    if (hasSuspiciousLink(text) || hasSpamPhrase(text)) {
        safeLocalStorageSet(CHAT_SPAM_STORAGE_KEY, '1');
    }
}

export function shouldSkipMessage(text: string): boolean {
    return (hasSuspiciousLink(text) || hasSpamPhrase(text)) && !isKnownSpammer();
}

export function resetChatSpamStateForTests(): void {
    try {
        window.localStorage.removeItem(CHAT_SPAM_STORAGE_KEY);
    } catch {
        // Ignore storage failures in restricted browser contexts.
    }
}
