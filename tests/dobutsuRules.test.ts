/** @jest-environment node */

import { beforeAll, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ffishModule, { FairyStockfish, ModuleOptions } from 'ffish-es6';

type WasmModuleOptions = ModuleOptions & { wasmBinary: Uint8Array };
type FfishModuleFactory = typeof ffishModule;

let ffish: FairyStockfish;

beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const modulePath = require.resolve('ffish-es6');
    const wasmBinary = new Uint8Array(readFileSync(resolve(dirname(modulePath), 'ffish.wasm')));
    const moduleFactory =
        typeof ffishModule === 'function'
            ? ffishModule
            : (ffishModule as unknown as { default: FfishModuleFactory }).default;

    ffish = await moduleFactory({ wasmBinary } as WasmModuleOptions);
});

test.each([
    ['b2a2', '0-1'],
    ['b4a4', '1-0'],
    ['b2b3', '1/2-1/2'],
    ['b4b3', '*'],
] as const)('Dobutsu move %s produces result %s', (move, expected) => {
    const board = new ffish.Board('dobutsu', '1L1/1g1/1G1/1l1[] w - - 0 1');

    try {
        expect(board.push(move)).toBe(true);
        expect(board.result()).toBe(expected);
    } finally {
        board.delete();
    }
});
