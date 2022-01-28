import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import brotli from 'rollup-plugin-brotli';
import zlib from 'zlib';
const postcss = require('rollup-plugin-postcss')

export default {
    input: "client/main.ts",
    output: {
        name: "PychessVariants",
        file: "static/pychess-variants.js",
        format: "iife",
    },
    plugins: [
        nodeResolve(),
        postcss({
          config: false, // don't attempt to load a postcss config
          // extract: true
          // ^^^ for writing CSS to a separate file (dist/main.css).
          // in rollup v2, this writes CSS rules in wrong order (https://github.com/egoist/rollup-plugin-postcss/issues/96)
          // so, disable for now, and allow the CSS to be embedded in the JS
        }),
        commonjs(),
        typescript(),
        terser(),
        brotli({
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
            },
        }),
    ],
}
