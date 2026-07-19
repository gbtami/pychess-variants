import { _ } from './i18n';
import { variantsIni } from './variantsIni';

type FairyStockfishEngine = {
    addMessageListener(listener: (line: string) => void): void;
    removeMessageListener(listener: (line: string) => void): void;
    postMessage(message: string): void;
};

declare global {
    interface Window {
        Stockfish?: () => Promise<FairyStockfishEngine>;
    }
}

const STOCKFISH_SCRIPT_URL = '/static/stockfish.js';
const STOCKFISH_LOAD_TIMEOUT_MS = 15000;
const STOCKFISH_CHECK_TIMEOUT_MS = 10000;
const PIECE_TO_CHAR_TABLE_RULE_RE = /^[ \t]*pieceToCharTable[ \t]*=/m;

let stockfishScriptPromise: Promise<void> | null = null;
let stockfishEnginePromise: Promise<FairyStockfishEngine> | null = null;
let baseVariantsPromise: Promise<void> | null = null;
let engineQueue: Promise<void> = Promise.resolve();
let originalPrompt: typeof window.prompt | null = null;

function wasmThreadsSupported(): boolean {
    const source = Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00);
    if (typeof WebAssembly !== 'object' || typeof WebAssembly.validate !== 'function') return false;
    if (!WebAssembly.validate(source)) return false;
    if (typeof SharedArrayBuffer !== 'function') return false;
    if (typeof Atomics !== 'object') return false;

    let memory: WebAssembly.Memory;
    try {
        memory = new WebAssembly.Memory({ shared: true, initial: 8, maximum: 16 });
    } catch {
        return false;
    }
    if (!(memory.buffer instanceof SharedArrayBuffer)) return false;

    try {
        window.postMessage(memory, '*');
        memory.grow(8);
    } catch {
        return false;
    }

    return true;
}

function loadStockfishScript(): Promise<void> {
    if (window.Stockfish) return Promise.resolve();
    if (stockfishScriptPromise) return stockfishScriptPromise;

    stockfishScriptPromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-fsf-loader="true"]') as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener(
                'error',
                () => reject(new Error(_('Failed to load Fairy-Stockfish WASM support.'))),
                { once: true },
            );
            return;
        }

        const script = document.createElement('script');
        const timeout = window.setTimeout(() => {
            reject(new Error(_('Timed out while loading Fairy-Stockfish WASM support.')));
        }, STOCKFISH_LOAD_TIMEOUT_MS);
        script.src = STOCKFISH_SCRIPT_URL;
        script.async = true;
        script.dataset.fsfLoader = 'true';
        script.onload = () => {
            window.clearTimeout(timeout);
            resolve();
        };
        script.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error(_('Failed to load Fairy-Stockfish WASM support.')));
        };
        document.head.appendChild(script);
    }).catch(error => {
        stockfishScriptPromise = null;
        throw error;
    });

    return stockfishScriptPromise;
}

async function ensureFsfEngine(): Promise<FairyStockfishEngine> {
    if (window.fsf) return window.fsf as FairyStockfishEngine;
    if (!wasmThreadsSupported()) {
        throw new Error(_('Fairy-Stockfish WASM is not supported by this browser.'));
    }
    if (stockfishEnginePromise) return stockfishEnginePromise;

    stockfishEnginePromise = (async () => {
        await loadStockfishScript();
        if (typeof window.Stockfish !== 'function') {
            throw new Error(_('Fairy-Stockfish WASM did not initialize correctly.'));
        }
        const fsf = await window.Stockfish();
        window.fsf = fsf;
        return fsf;
    })().catch(error => {
        stockfishEnginePromise = null;
        throw error;
    });

    return stockfishEnginePromise;
}

function installPromptQueue(lines: string[]): void {
    if (originalPrompt === null) originalPrompt = window.prompt;
    const queue = [...lines];
    window.prompt = ((message?: string, defaultValue?: string): string => {
        const line = queue.shift();
        if (line !== undefined) return line;
        console.warn('Fairy-Stockfish requested unexpected stdin input:', message, defaultValue);
        return '';
    }) as typeof window.prompt;
}

function restorePromptQueue(): void {
    if (originalPrompt !== null) {
        window.prompt = originalPrompt;
    }
}

function queueEngineTask<T>(task: () => Promise<T>): Promise<T> {
    const run = engineQueue.then(task, task);
    engineQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

async function runCommandWithQueuedInput(
    fsf: FairyStockfishEngine,
    {
        command,
        lines,
        completionLine,
        timeoutMs,
    }: {
        command: string;
        lines: string[];
        completionLine: string;
        timeoutMs: number;
    },
): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const output: string[] = [];
        let settled = false;
        let timer = 0;

        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            fsf.removeMessageListener(onLine);
            restorePromptQueue();
            callback();
        };

        const onLine = (line: string) => {
            output.push(String(line ?? ''));
            if (line === completionLine) {
                finish(() => resolve(output));
            }
        };

        timer = window.setTimeout(() => {
            finish(() => reject(new Error(_('Fairy-Stockfish rule check timed out.'))));
        }, timeoutMs);

        fsf.addMessageListener(onLine);
        installPromptQueue(lines);
        try {
            fsf.postMessage(command);
            fsf.postMessage('isready');
        } catch (error) {
            finish(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
    });
}

async function ensureBaseVariantsLoaded(fsf: FairyStockfishEngine): Promise<void> {
    if (baseVariantsPromise) return baseVariantsPromise;

    baseVariantsPromise = (async () => {
        const marker = 'PYCHESS_VARIANTS_INI_EOF_' + Date.now();
        const lines = variantsIni.replace(/\r\n/g, '\n').split('\n');
        await runCommandWithQueuedInput(fsf, {
            command: 'load <<' + marker,
            lines: [...lines, marker],
            completionLine: 'readyok',
            timeoutMs: STOCKFISH_LOAD_TIMEOUT_MS,
        });
    })().catch(error => {
        baseVariantsPromise = null;
        throw error;
    });

    return baseVariantsPromise!;
}

function rulesForFsfCheck(ini: string): string {
    const normalized = ini.replace(/\r\n/g, '\n');
    if (PIECE_TO_CHAR_TABLE_RULE_RE.test(normalized)) return normalized;

    // Pychess does not use XBoard piece images. Disable only that inherited-table
    // consistency check so custom pieces do not produce unrelated diagnostics.
    const separator = normalized.endsWith('\n') ? '' : '\n';
    return `${normalized}${separator}pieceToCharTable = -`;
}

function extractDiagnostics(lines: string[]): string[] {
    return lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => !line.startsWith('Fairy-Stockfish '))
        .filter(line => !line.startsWith('Parsing variant: '))
        .filter(line => line !== 'readyok');
}

export async function checkRulesWithFsfWasm(ini: string): Promise<void> {
    return queueEngineTask(async () => {
        const fsf = await ensureFsfEngine();
        await ensureBaseVariantsLoaded(fsf);

        const marker = 'PYCHESS_VARIANT_CHECK_EOF_' + Date.now();
        const lines = rulesForFsfCheck(ini).split('\n');
        const output = await runCommandWithQueuedInput(fsf, {
            command: 'check <<' + marker,
            lines: [...lines, marker],
            completionLine: 'readyok',
            timeoutMs: STOCKFISH_CHECK_TIMEOUT_MS,
        });
        const diagnostics = extractDiagnostics(output);
        if (diagnostics.length > 0) {
            throw new Error(diagnostics.join('\n'));
        }
    });
}
