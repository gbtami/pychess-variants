import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { wasm } from '@rollup/plugin-wasm';

export default {
    input: "client/main.ts",
    output: {
        name: "PychessVariants",
        file: "static/pychess-variants.js",
        format: "iife",
        sourcemap: "inline",
    },
    plugins: [nodeResolve(), commonjs(), typescript(), wasm()],
}
