import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { compress } from 'esbuild-plugin-compress';

const args = process.argv;
const dev = args.includes('dev');
const prod = args.includes('prod');
if (dev === prod) throw "There must be one and only one of either 'dev' or 'prod' in the arguments!";

const baseOpts = {
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    bundle: true,
};

const appOpts = {
    ...baseOpts,
    entryPoints: ['./client/main.ts'],
    outfile: './static/pychess-variants.js',
};

const profileRealtimeWorkerOpts = {
    ...baseOpts,
    entryPoints: ['./client/profileRealtimeWorker.ts'],
    outfile: './static/profile-realtime-worker.js',
};

if (dev) {
    for (const staleAsset of [
        './static/pychess-variants.js.br',
        './static/pychess-variants.js.gz',
        './static/pychess-variants.css.br',
        './static/pychess-variants.css.gz',
        './static/profile-realtime-worker.js.br',
        './static/profile-realtime-worker.js.gz',
    ]) {
        rmSync(staleAsset, { force: true });
    }

    await esbuild.build({
        ...appOpts,
        sourcemap: 'inline',
    });
    await esbuild.build({
        ...profileRealtimeWorkerOpts,
        sourcemap: 'inline',
    });
} else {
    await esbuild.build({
        ...appOpts,
        minify: true,
        write: false,
        plugins: [compress()],
    });
    await esbuild.build({
        ...profileRealtimeWorkerOpts,
        minify: true,
        write: false,
        plugins: [compress()],
    });
}
