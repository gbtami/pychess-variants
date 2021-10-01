import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
    input: "client/main.ts",
    output: {
        file: "static/pychess-variants.js",
        format: "cjs"
    },
    plugins: [typescript(), nodeResolve()],
}
