import { h, VNode } from 'snabbdom';

import { _ } from '../i18n';
import { alertDialog } from '../alertDialog';
import { confirmDialog } from '../confirmDialog';
import { Settings, BooleanSettings, NumberSettings, StringSettings } from '../settings';
import { nnueFile, slider, sliderFromList, toggleSwitch } from '../view';
import { downloadOfficialNnue, formatNnueSize, requiresLargeNnueConfirmation } from '../nnueDownload';
import { officialNnueNetwork, type OfficialNnueNetwork } from '../nnueManifest';
import { AnalysisController } from './analysisCtrl';
import { patch } from '../document';
import { updateMovelist } from '../movelist';

class AnalysisSettings {
    ctrl: AnalysisController;
    settings: { [key: string]: Settings<number | boolean | string> };
    assetURL: string;

    constructor() {
        this.settings = {};
        this.settings['arrow'] = new ArrowSettings(this);
        this.settings['inlineNotation'] = new InlineNotationSettings(this);
        this.settings['disclosureMode'] = new DisclosureModeSettings(this);
        this.settings['infiniteAnalysis'] = new InfiniteAnalysisSettings(this);
        this.settings['multipv'] = new MultiPVSettings(this);
        this.settings['threads'] = new ThreadsSettings(this);
        this.settings['hash'] = new HashSettings(this);
        this.settings['nnue'] = new NnueSettings(this);
        this.settings['fsfDebug'] = new FsfDebugSettings(this);
    }

    getSettings(family: string) {
        const fullName = family + 'Nnue';
        if (!this.settings[fullName]) {
            this.settings[fullName] = new NnueFileSettings(this, family);
        }
        return this.settings[fullName];
    }

    view(variantName: string) {
        if (!variantName) return h('div.analysis-settings');

        const settingsList: VNode[] = [];

        settingsList.push(this.settings['multipv'].view());

        settingsList.push(this.settings['threads'].view());

        settingsList.push(this.settings['hash'].view());

        settingsList.push(this.settings['arrow'].view());

        settingsList.push(this.settings['inlineNotation'].view());

        settingsList.push(this.settings['disclosureMode'].view());

        settingsList.push(this.settings['infiniteAnalysis'].view());

        settingsList.push(this.getSettings(variantName as string).view());

        settingsList.push(this.settings['nnue'].view());

        settingsList.push(this.settings['fsfDebug'].view());

        settingsList.push();

        return h('div.analysis-settings', settingsList);
    }
}

class InlineNotationSettings extends BooleanSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('inlineNotation', false);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        ctrl.inlineNotation = this.value;
        updateMovelist(ctrl, true, false);
    }

    view(): VNode {
        return h(
            'div.inlineNotation-toggle',
            toggleSwitch(this, 'inlineNotation-enabled', _('Inline notation'), false),
        );
    }
}

class DisclosureModeSettings extends BooleanSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('disclosureMode', false);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        ctrl.disclosureMode = this.value;
        updateMovelist(ctrl, true, false);
    }

    view(): VNode {
        return h(
            'div.disclosureMode-toggle',
            toggleSwitch(this, 'disclosureMode-enabled', _('Disclosure buttons'), false),
        );
    }
}

class ArrowSettings extends BooleanSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('arrow', true);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('arrow' in ctrl) ctrl.arrow = this.value;
    }

    view(): VNode {
        return h('div.arrow-toggle', toggleSwitch(this, 'arrow-enabled', _('Best move arrow'), false));
    }
}

class InfiniteAnalysisSettings extends BooleanSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('infiniteAnalysis', false);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('maxDepth' in ctrl) {
            ctrl.maxDepth = this.value ? 99 : 18;
            ctrl.pvboxIni();
        }
    }

    view(): VNode {
        return h(
            'div.infiniteAnalysis-toggle',
            toggleSwitch(this, 'infiniteAnalysis-enabled', _('Infinite analysis'), false),
        );
    }
}

class MultiPVSettings extends NumberSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('multipv', 1);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('multipv' in ctrl) {
            ctrl.multipv = this.value;
            ctrl.pvboxIni();
            ctrl.autoShapes = Array.from({ length: ctrl.multipv }, () => []);
            ctrl.chessground.setAutoShapes([]);
            const settingsEl = document.querySelector('div.multipv_range_value') as HTMLElement;
            patch(settingsEl, h('div.multipv_range_value', `${this.value} / 5`));
        }
    }

    view(): VNode {
        const els = slider(this, 'multipv', 0, 5, 1, _('Multiple lines'));
        els.push(h('div.multipv_range_value', `${this.value} / 5`));
        return h('div.labelled', els);
    }
}

class ThreadsSettings extends NumberSettings {
    readonly analysisSettings: AnalysisSettings;
    readonly maxThreads: number;

    constructor(analysisSettings: AnalysisSettings) {
        super('threads', 1);
        this.analysisSettings = analysisSettings;
        this.maxThreads = Math.min(Math.max((navigator.hardwareConcurrency || 1) - 1, 1), 32);
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('threads' in ctrl) {
            ctrl.threads = this.value;
            ctrl.pvboxIni();
            const settingsEl = document.querySelector('div.threads_range_value') as HTMLElement;
            patch(settingsEl, h('div.threads_range_value', `${this.value} / ${this.maxThreads}`));
        }
    }

    view(): VNode {
        const els = slider(this, 'threads', 1, this.maxThreads, 1, _('CPUs'));
        els.push(h('div.threads_range_value', `${this.value} / ${this.maxThreads}`));
        return h('div.labelled', els);
    }
}

// Some utility functions are borrowed from lila ui code
const isAndroid = (): boolean => /Android/.test(navigator.userAgent);

const isIOS = (): boolean => /iPhone|iPod/.test(navigator.userAgent) || isIPad();

// some newer iPads pretend to be Macs, hence checking for "Macintosh"
const isIPad = (): boolean => navigator?.maxTouchPoints > 2 && /iPad|Macintosh/.test(navigator.userAgent);

// the numbers returned by maxHashMB seem small, but who knows if wasm stockfish performance even
// scales like native stockfish with increasing hash. prefer smaller, non-crashing values
// steer the high performance crowd towards external engine as it gets better
const maxHashMB = (): number => {
    let maxHash = 512; // allocating 1024 often fails and offers little benefit over 512, or 16 for that matter
    if (isAndroid())
        maxHash = 64; // budget androids are easy to crash @ 128
    else if (isIPad())
        maxHash = 64; // iPadOS safari pretends to be desktop but acts more like iphone
    else if (isIOS()) maxHash = 32;
    return maxHash;
};

class HashSettings extends NumberSettings {
    readonly analysisSettings: AnalysisSettings;
    readonly maxHash: number;

    constructor(analysisSettings: AnalysisSettings) {
        super('hash', 16);
        this.analysisSettings = analysisSettings;
        this.maxHash = maxHashMB();
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('threads' in ctrl) {
            ctrl.hash = this.value;
            ctrl.pvboxIni();
            const settingsEl = document.querySelector('div.hash_range_value') as HTMLElement;
            patch(settingsEl, h('div.hash_range_value', `${this.value}MB`));
        }
    }

    view(): VNode {
        const hashList = [...Array(10).keys()].map(i => 2 ** i).filter(n => n >= 16 && n <= this.maxHash);
        const els = sliderFromList(this, 'hash', _('Memory'), 'hashList', hashList);
        els.push(h('div.hash_range_value', `${this.value}MB`));
        return h('div.labelled', els);
    }
}

class NnueSettings extends BooleanSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('nnue', true);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('nnue' in ctrl) {
            ctrl.nnue = this.value;
            ctrl.pvboxIni();
        }
    }

    view(): VNode {
        return h('div.nnue-toggle', toggleSwitch(this, 'nnue-enabled', _('Use NNUE'), false));
    }
}

class NnueFileSettings extends StringSettings {
    readonly analysisSettings: AnalysisSettings;
    readonly variant: string;

    constructor(analysisSettings: AnalysisSettings, variant: string) {
        super(variant + '-nnue', '');
        this.analysisSettings = analysisSettings;
        this.variant = variant;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('evalFile' in ctrl) {
            ctrl.evalFile = this.value;
            ctrl.nnueIni();
        }
    }

    view(): VNode {
        const children = [h('div.labelled', nnueFile(this, 'evalFile', 'NNUE', this.variant))];
        const network = officialNnueNetwork(this.variant);
        if (network) children.push(this.officialDownloadView(network));
        return h('div.nnue-file-settings', children);
    }

    private officialDownloadView(network: OfficialNnueNetwork): VNode {
        const installed = this.value === network.file;
        return h('div.nnue-download', [
            h(
                'button.button.nnue-download-button',
                {
                    props: { type: 'button', disabled: installed },
                    on: { click: event => void this.downloadOfficial(event, network) },
                },
                installed
                    ? _('Official NNUE installed')
                    : _('Download official NNUE (%1)', formatNnueSize(network.bytes)),
            ),
            h('progress.nnue-download-progress', {
                props: { max: network.bytes, value: 0, hidden: true },
            }),
            h('span.nnue-download-status'),
        ]);
    }

    private async downloadOfficial(event: Event, network: OfficialNnueNetwork): Promise<void> {
        const ctrl = this.analysisSettings.ctrl;
        const button = event.currentTarget as HTMLButtonElement;
        const container = button.closest('.nnue-download') as HTMLElement | null;

        if (!ctrl.nnueDownloadRoot) {
            await alertDialog({ text: _('Official NNUE downloads are not configured on this server.') });
            return;
        }

        if (requiresLargeNnueConfirmation(network)) {
            const size = `${formatNnueSize(network.bytes)} (${network.bytes.toLocaleString()} bytes)`;
            const confirmed = await confirmDialog({
                text: _('This NNUE network is %1. Download it now?', size),
                confirmText: _('Download'),
                cancelText: _('Cancel'),
            });
            if (!confirmed) return;
        }

        button.disabled = true;
        this.updateDownloadStatus(container, _('Downloading NNUE…'));
        try {
            const data = await downloadOfficialNnue(this.variant, network, ctrl.nnueDownloadRoot, progress => {
                this.updateDownloadProgress(container, progress.loaded, progress.total);
            });

            localStorage[this.name] = network.file;
            this._value = network.file;
            ctrl.evalFile = network.file;
            ctrl.nnueIni(data);

            button.textContent = _('Official NNUE installed');
            this.updateDownloadProgress(container, network.bytes, network.bytes);
            this.updateDownloadStatus(container, _('NNUE ready'));
        } catch (error) {
            button.disabled = false;
            this.hideDownloadProgress(container);
            const message = error instanceof Error ? error.message : String(error);
            this.updateDownloadStatus(container, _('Download failed'));
            await alertDialog({ text: _('NNUE download failed: %1', message) });
        }
    }

    private updateDownloadProgress(container: HTMLElement | null, loaded: number, total: number): void {
        const progress = container?.querySelector('progress') as HTMLProgressElement | null;
        if (progress) {
            progress.hidden = false;
            progress.max = total;
            progress.value = Math.min(loaded, total);
        }
        const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        this.updateDownloadStatus(container, _('Downloading NNUE… %1', `${percent}%`));
    }

    private hideDownloadProgress(container: HTMLElement | null): void {
        const progress = container?.querySelector('progress') as HTMLProgressElement | null;
        if (progress) progress.hidden = true;
    }

    private updateDownloadStatus(container: HTMLElement | null, text: string): void {
        const status = container?.querySelector('.nnue-download-status');
        if (status) status.textContent = text;
    }
}

class FsfDebugSettings extends BooleanSettings {
    readonly analysisSettings: AnalysisSettings;

    constructor(analysisSettings: AnalysisSettings) {
        super('fsfDebug', false);
        this.analysisSettings = analysisSettings;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('fsfDebug' in ctrl) {
            ctrl.fsfDebug = this.value;
            ctrl.pvboxIni();
        }
    }

    view(): VNode {
        return h('div.fsfDebug-toggle', toggleSwitch(this, 'fsfDebug-enabled', _('Enable engine debug'), false));
    }
}

export const analysisSettings = new AnalysisSettings();

export class EngineSettings extends BooleanSettings {
    ctrl: AnalysisController;

    constructor(ctrl: AnalysisController) {
        super('localAnalysis', false);
        this.ctrl = ctrl;
    }

    update(): void {
        if (this.value && this.ctrl.isLocalAnalysisBlockedByAntiCheat()) {
            this._value = false;
            localStorage[this.name] = false;
            this.ctrl.disableLocalAnalysisForAntiCheat();
            this.ctrl.refreshLocalAnalysisAvailabilityForAntiCheat();
            return;
        }

        this.ctrl.localAnalysis = this.value;
        if (this.ctrl.localAnalysis) {
            this.ctrl.vinfo = patch(this.ctrl.vinfo, h('info#info', '-'));
        } else {
            this.ctrl.engineStop();
        }
        this.ctrl.pvboxIni();
    }

    view(): VNode {
        return h(
            'div.engine-toggle',
            toggleSwitch(
                this,
                'engine-enabled',
                '',
                this.ctrl.isLocalAnalysisBlockedByAntiCheat() ||
                    !this.ctrl.localEngine ||
                    !this.ctrl.isEngineReady ||
                    !this.ctrl.variantSupportedByFSF,
            ),
        );
    }
}
