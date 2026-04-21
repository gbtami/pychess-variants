import { hasSpamPhrase, hasSuspiciousLink, resetChatSpamStateForTests, selfReport, shouldSkipMessage } from '../client/chatSpam';

beforeEach(() => {
    resetChatSpamStateForTests();
});

test('detects suspicious spam links', () => {
    expect(hasSuspiciousLink('watch this bit.ly/free-stuff')).toBe(true);
    expect(hasSuspiciousLink('check .3-a.net now')).toBe(true);
    expect(hasSuspiciousLink('check x3-a.net now')).toBe(false);
    expect(hasSuspiciousLink('normal analysis link')).toBe(false);
});

test('detects common spam phrases', () => {
    expect(hasSpamPhrase('Follow me for prizes')).toBe(true);
    expect(hasSpamPhrase('join my team now')).toBe(true);
    expect(hasSpamPhrase('good luck have fun')).toBe(false);
});

test('skips suspicious incoming messages for normal users', () => {
    expect(shouldSkipMessage('join my team for rewards')).toBe(true);
    expect(shouldSkipMessage('bit.ly/free-stuff')).toBe(true);
    expect(shouldSkipMessage('good game')).toBe(false);
});

test('known spammers no longer skip their own suspicious messages', () => {
    selfReport('bit.ly/free-stuff');
    expect(shouldSkipMessage('join my team for rewards')).toBe(false);
    expect(shouldSkipMessage('bit.ly/free-stuff')).toBe(false);
});
