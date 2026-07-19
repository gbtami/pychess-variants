import { beforeEach, expect, jest, test } from '@jest/globals';

type Listener = (line: string) => void;

class MockFairyStockfishEngine {
    private readonly listeners = new Set<Listener>();
    readonly commands: string[] = [];
    readonly checkedInputs: string[] = [];
    private pendingOutput: string[] = [];

    addMessageListener(listener: Listener): void {
        this.listeners.add(listener);
    }

    removeMessageListener(listener: Listener): void {
        this.listeners.delete(listener);
    }

    postMessage(message: string): void {
        this.commands.push(message);

        if (message.startsWith('load <<')) {
            this.readQueuedInput(message);
            this.pendingOutput = [];
            return;
        }

        if (message.startsWith('check <<')) {
            const input = this.readQueuedInput(message).join('\n');
            this.checkedInputs.push(input);
            const nameMatch = input.match(/^\s*\[\s*([A-Za-z0-9_-]+)/m);
            const name = nameMatch?.[1] ?? 'variant';
            this.pendingOutput = [`Parsing variant: ${name}`];
            if (input.includes('capturetohand=')) {
                this.pendingOutput.push('Invalid option: capturetohand');
            }
            return;
        }

        if (message === 'isready') {
            this.pendingOutput.forEach(line => this.emit(line));
            this.emit('readyok');
            this.pendingOutput = [];
        }
    }

    private readQueuedInput(message: string): string[] {
        const marker = message.split('<<')[1]?.trim() ?? '';
        const lines: string[] = [];
        while (true) {
            const line = window.prompt?.('Input: ');
            if (!line || line === marker) break;
            lines.push(line);
        }
        return lines;
    }

    private emit(line: string): void {
        [...this.listeners].forEach(listener => listener(line));
    }
}

beforeEach(() => {
    jest.resetModules();
    delete (window as typeof window & { fsf?: unknown }).fsf;
    delete (window as typeof window & { Stockfish?: unknown }).Stockfish;
});

test('surfaces invalid option diagnostics from Fairy-Stockfish check', async () => {
    const engine = new MockFairyStockfishEngine();
    (window as typeof window & { fsf: unknown }).fsf = engine;

    const { checkRulesWithFsfWasm } = await import('../client/fairyStockfish');

    await expect(checkRulesWithFsfWasm('[crazyhousex:chess]\ncapturetohand=true\n')).rejects.toThrow(
        'Invalid option: capturetohand',
    );
});

test('accepts hyphenated inherited variant names', async () => {
    const engine = new MockFairyStockfishEngine();
    (window as typeof window & { fsf: unknown }).fsf = engine;

    const { checkRulesWithFsfWasm } = await import('../client/fairyStockfish');

    await expect(checkRulesWithFsfWasm('[fsf-tencubed:tencubed]\n')).resolves.toBeUndefined();
    expect(engine.commands.some(command => /^check <<PYCHESS_VARIANT_CHECK_EOF_\d+$/.test(command))).toBe(true);
});

test('disables inherited pieceToCharTable validation only for the temporary check input', async () => {
    const engine = new MockFairyStockfishEngine();
    (window as typeof window & { fsf: unknown }).fsf = engine;

    const { checkRulesWithFsfWasm } = await import('../client/fairyStockfish');
    const ini = '[customvariant:chess]\ncustomPiece1 = a:KN\n';

    await expect(checkRulesWithFsfWasm(ini)).resolves.toBeUndefined();

    expect(engine.checkedInputs).toEqual([
        '[customvariant:chess]\ncustomPiece1 = a:KN\npieceToCharTable = -',
    ]);
    expect(ini).toBe('[customvariant:chess]\ncustomPiece1 = a:KN\n');
});

test('preserves an explicitly configured pieceToCharTable during the check', async () => {
    const engine = new MockFairyStockfishEngine();
    (window as typeof window & { fsf: unknown }).fsf = engine;

    const { checkRulesWithFsfWasm } = await import('../client/fairyStockfish');
    const ini = '[customvariant:chess]\npieceToCharTable = PNBRQKpnbrqk\n';

    await expect(checkRulesWithFsfWasm(ini)).resolves.toBeUndefined();

    expect(engine.checkedInputs).toEqual(['[customvariant:chess]\npieceToCharTable = PNBRQKpnbrqk']);
});

test('loads base variants once and accepts valid rules', async () => {
    const engine = new MockFairyStockfishEngine();
    (window as typeof window & { fsf: unknown }).fsf = engine;

    const { checkRulesWithFsfWasm } = await import('../client/fairyStockfish');

    await expect(checkRulesWithFsfWasm('[crazyhousex:chess]\ncapturesToHand=true\n')).resolves.toBeUndefined();
    await expect(checkRulesWithFsfWasm('[caparules:capablanca]\n')).resolves.toBeUndefined();

    expect(engine.commands.filter(command => command.startsWith('load <<'))).toHaveLength(1);
    expect(engine.commands.filter(command => command.startsWith('check <<'))).toHaveLength(2);
});
