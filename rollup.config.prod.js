import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { wasm } from '@rollup/plugin-wasm';
import brotli from 'rollup-plugin-brotli';
import zlib from 'zlib';

export default {
    input: "client/main.ts",
    output: {
        name: "PychessVariants",
        file: "static/pychess-variants.js",
        format: "iife",
    },
    plugins: [
        nodeResolve(),
        commonjs(),
        typescript(),
        brotli({
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
            },
        }),
    ],
}
