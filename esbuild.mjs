import * as esbuild from 'esbuild';
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
    bundle: true,
    outfile: './static/pychess-variants.js',
};

if (dev) {
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
