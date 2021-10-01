import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: "client/main.ts",
    output: {
        file: "static/pychess-variants.js",
        format: "iife"
    },
    plugins: [nodeResolve(), commonjs(), typescript()],
}
