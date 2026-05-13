import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { compress } from 'esbuild-plugin-compress';

const args = process.argv;
const dev = args.includes("dev");
const prod = args.includes("prod");
if (dev === prod)
    throw "There must be one and only one of either 'dev' or 'prod' in the arguments!";

const baseOpts = {
    entryPoints: ['./client/main.ts'],
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    bundle: true,
    outfile: './static/pychess-variants.js',
};

if (dev) {
    for (const staleAsset of [
        './static/pychess-variants.js.br',
        './static/pychess-variants.js.gz',
        './static/pychess-variants.css.br',
        './static/pychess-variants.css.gz',
    ]) {
        rmSync(staleAsset, { force: true });
    }

    await esbuild.build({
        ...baseOpts,
        sourcemap: 'inline',
    });
} else {
    await esbuild.build({
        ...baseOpts,
        minify: true,
        write: false,
        plugins: [
            compress(),
        ],
    });
}
