import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

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
    delete window.onFSFline;
});

afterEach(() => jest.restoreAllMocks());

test('analysis and rule validation share startup when only Memory objects cannot be posted', async () => {
    const engine = new MockFairyStockfishEngine();
    const factory = jest.fn(async () => engine);
    window.Stockfish = factory;
    const postMessage = jest.spyOn(window, 'postMessage').mockImplementation(message => {
        if (message instanceof WebAssembly.Memory) throw new DOMException('Cannot clone', 'DataCloneError');
    });
    const { initAnalysisEngine, checkRulesWithFsfWasm } = await import('../client/fairyStockfish');

    await Promise.all([initAnalysisEngine(), checkRulesWithFsfWasm('[custom:chess]\n')]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toBeInstanceOf(SharedArrayBuffer);
    expect(window.fsf).toBe(engine);
    expect(engine.checkedInputs).toHaveLength(1);
});

test('analysis output follows the current Study chapter controller', async () => {
    const engine = new MockFairyStockfishEngine();
    window.fsf = engine;
    const firstChapter = jest.fn();
    const nextChapter = jest.fn();
    window.onFSFline = firstChapter;
    const { initAnalysisEngine } = await import('../client/fairyStockfish');
    await initAnalysisEngine();

    engine.postMessage('isready');
    window.onFSFline = nextChapter;
    engine.postMessage('isready');

    expect(firstChapter).toHaveBeenCalledTimes(1);
    expect(nextChapter).toHaveBeenCalledWith('readyok');
});

test.each(['analysis', 'rules'])('%s still rejects browsers that cannot post shared buffers', async mode => {
    const factory = jest.fn(async () => new MockFairyStockfishEngine());
    window.Stockfish = factory;
    jest.spyOn(window, 'postMessage').mockImplementation(() => {
        throw new DOMException('Cannot clone', 'DataCloneError');
    });
    const { initAnalysisEngine, checkRulesWithFsfWasm } = await import('../client/fairyStockfish');

    await expect(
        mode === 'analysis' ? initAnalysisEngine() : checkRulesWithFsfWasm('[custom:chess]\n'),
    ).rejects.toThrow('not supported');
    expect(factory).not.toHaveBeenCalled();
});

test('Safari 26.2 is rejected before attempting the shared-memory operation that can crash WebKit', async () => {
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Version/26.2 Safari/605.1.15');
    const memory = jest.spyOn(WebAssembly, 'Memory');
    const { initAnalysisEngine } = await import('../client/fairyStockfish');

    await expect(initAnalysisEngine()).rejects.toThrow('not supported');
    expect(memory).not.toHaveBeenCalled();
});

test('shared-memory allocation failure is reported as unsupported', async () => {
    jest.spyOn(WebAssembly, 'Memory').mockImplementation(() => {
        throw new RangeError('Shared memory unavailable');
    });
    const { initAnalysisEngine } = await import('../client/fairyStockfish');

    await expect(initAnalysisEngine()).rejects.toThrow('not supported');
});

test('invalid WebAssembly support is rejected before memory allocation', async () => {
    jest.spyOn(WebAssembly, 'validate').mockReturnValue(false);
    const memory = jest.spyOn(WebAssembly, 'Memory');
    const { initAnalysisEngine } = await import('../client/fairyStockfish');

    await expect(initAnalysisEngine()).rejects.toThrow('not supported');
    expect(memory).not.toHaveBeenCalled();
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
