import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { Settings, BooleanSettings, NumberSettings, StringSettings } from './settings';
import { nnueFile, slider, toggleSwitch } from './view';
import { AnalysisController } from './analysisCtrl';
import { patch } from './document';


class AnalysisSettings {
    ctrl: AnalysisController;
    settings: { [ key: string]: Settings<number | boolean | string> };
    assetURL: string;

    constructor() {
        this.settings = {};
        this.settings["arrow"] = new ArrowSettings(this);
        this.settings["infiniteAnalysis"] = new InfiniteAnalysisSettings(this);
        this.settings["multipv"] = new MultiPVSettings(this);
        this.settings["threads"] = new ThreadsSettings(this);
        this.settings["hash"] = new HashSettings(this);
        this.settings["nnue"] = new NnueSettings(this);
        this.settings["fsfDebug"] = new FsfDebugSettings(this);
    }

    getSettings(family: string) {
        const fullName = family + "Nnue";
        if (!this.settings[fullName]) {
            this.settings[fullName] = new NnueFileSettings(this, family);
        }
        return this.settings[fullName];
    }

    view(variantName: string) {
        if (!variantName) return h("div.analysis-settings");

        const settingsList : VNode[] = [];

        settingsList.push(this.settings["arrow"].view());

        settingsList.push(this.settings["infiniteAnalysis"].view());

        settingsList.push(this.settings["multipv"].view());

        settingsList.push(this.settings["threads"].view());

        settingsList.push(this.settings["hash"].view());

        settingsList.push(this.settings["nnue"].view());

        settingsList.push(this.getSettings(variantName as string).view());

        settingsList.push(this.settings["fsfDebug"].view());

        settingsList.push();

        return h('div.analysis-settings', settingsList);
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
        return h(
            'div.arrow-toggle',
            toggleSwitch(
                this,
                'arrow-enabled',
                _("Best move arrow"),
                false,
            )
        );
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
            ctrl.maxDepth = (this.value) ? 99 : 18;
            ctrl.pvboxIni();
        }
    }

    view(): VNode {
        return h(
            'div.infiniteAnalysis-toggle',
            toggleSwitch(
                this,
                'infiniteAnalysis-enabled',
                _("Infinite analysis"),
                false,
            )
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
            const settingsEl = document.querySelector('div.multipv_range_value') as HTMLElement;
            patch(settingsEl, h('div.multipv_range_value', `${this.value} / 5`));
        }
    }

    view(): VNode {
        const els = slider(this, 'multipv', 1, 5, 1, _('Multiple lines')); 
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
    let maxHash = 256; // this is conservative but safe, mostly desktop firefox / mac safari users here
    if (isAndroid()) maxHash = 64; // budget androids are easy to crash @ 128
    else if (isIPad()) maxHash = 64; // iPadOS safari pretends to be desktop but acts more like iphone
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
        const els = slider(this, 'hash', 16, this.maxHash, 16, _('Memory')); 
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
        return h(
            'div.nnue-toggle',
            toggleSwitch(
                this,
                'nnue-enabled',
                _("Use NNUE"),
                false,
            )
        );
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
        return h('div.labelled', nnueFile(this, 'evalFile', 'NNUE', this.variant));
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
        return h(
            'div.fsfDebug-toggle',
            toggleSwitch(
                this,
                'fsfDebug-enabled',
                _("Enable engine debug"),
                false,
            )
        );
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
                !this.ctrl.localEngine || !this.ctrl.isEngineReady
            )
        );
    }
}
