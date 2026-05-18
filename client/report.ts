import { _ } from './i18n';
import { PyChessModel } from './types';

type ReportSource = 'inbox' | 'profile' | 'game';

interface ReportTarget {
    source: ReportSource;
    suspect: string;
    gameId?: string;
    defaultReason?: string;
}

const VALID_REASONS = ['cheating', 'bad_behavior', 'harassment', 'spam', 'impersonation', 'other'] as const;
type ReportReason = (typeof VALID_REASONS)[number];

function parseReason(input: string): ReportReason | null {
    const normalized = input.trim().toLowerCase().replace(/\s+/g, '_');
    if (normalized === 'cheat') return 'cheating';
    if (normalized === 'abuse') return 'bad_behavior';
    if (normalized === 'bad') return 'bad_behavior';
    if ((VALID_REASONS as readonly string[]).includes(normalized)) return normalized as ReportReason;
    return null;
}

async function parseJsonResponse(res: Response) {
    const text = await res.text();
    if (text.length === 0) return { status: res.status, data: {} as any };
    try {
        return { status: res.status, data: JSON.parse(text) };
    } catch {
        throw new Error(`HTTP ${res.status}`);
    }
}

export async function openReportDialog(model: PyChessModel, target: ReportTarget): Promise<void> {
    if (model.anon === 'True') {
        alert(_('Login required.'));
        return;
    }

    if (!target.suspect) {
        return;
    }

    const rawReason = window.prompt(
        _('Reason (cheating, bad_behavior, harassment, spam, impersonation, other)'),
        target.defaultReason || 'other',
    );
    if (rawReason === null) return;

    const reason = parseReason(rawReason);
    if (reason === null) {
        alert(_('Invalid reason.'));
        return;
    }

    const details = window.prompt(_('Describe what happened (minimum 5 characters).'), '');
    if (details === null) return;
    const trimmedDetails = details.trim();
    if (trimmedDetails.length < 5) {
        alert(_('Report details are too short.'));
        return;
    }

    const formData = new URLSearchParams({
        source: target.source,
        suspect: target.suspect,
        reason,
        details: trimmedDetails,
        url: window.location.pathname,
    });

    if (target.gameId) {
        formData.set('gameId', target.gameId);
    }

    try {
        const res = await fetch('/api/report/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: formData.toString(),
        });
        const { status, data } = await parseJsonResponse(res);
        if (status >= 400 || data.type === 'error') {
            alert(data.message || _('Could not submit report.'));
            return;
        }
        alert(_('Report submitted. Thank you.'));
    } catch (err) {
        console.warn('Failed to submit report.', err);
        alert(_('Could not submit report.'));
    }
}
