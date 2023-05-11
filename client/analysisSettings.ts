import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { Settings, BooleanSettings, NumberSettings, StringSettings } from './settings';
import { checkbox, nnueFile, slider, toggleSwitch } from './view';
import { AnalysisController } from './analysisCtrl';
import { patch } from './document';


class AnalysisSettings {
    ctrl: AnalysisController;
    settings: { [ key: string]: Settings<number | boolean | string> };
    assetURL: string;

    constructor() {
        this.settings = {};
        this.settings["arrow"] = new ArrowSettings(this);
        this.settings["multipv"] = new MultiPVSettings(this);
    }

    getSettings(family: string) {
        const fullName = family + "Nnue";
        if (!this.settings[fullName]) {
            this.settings[fullName] = new NnueSettings(this, family);
        }
        return this.settings[fullName];
    }

    view(variantName: string) {
        if (!variantName) return h("div.analysis-settings");

        const settingsList : VNode[] = [];

        settingsList.push(this.settings["arrow"].view());

        settingsList.push(this.settings["multipv"].view());

        settingsList.push(this.getSettings(variantName as string).view());

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
        if ('arrow' in ctrl)
            ctrl.arrow = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'arrow', _("Best move arrow in analysis board")));
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
        if ('multipv' in ctrl)
            ctrl.multipv = this.value;
            ctrl.pvboxIni();
    }

    view(): VNode {
        return h('div', slider(this, 'multipv', 1, 5, 1, _('MultiPV')));
    }
}

class NnueSettings extends StringSettings {
    readonly analysisSettings: AnalysisSettings;
    readonly variant: string;

    constructor(analysisSettings: AnalysisSettings, variant: string) {
        super(variant + '-nnue', '');
        this.analysisSettings = analysisSettings;
        this.variant = variant;
    }

    update(): void {
        const ctrl = this.analysisSettings.ctrl;
        if ('evalFile' in ctrl)
            ctrl.evalFile = this.value;
            ctrl.nnueIni();
    }

    view(): VNode {
        return h('div', nnueFile(this, 'evalFile', 'NNUE', this.variant));
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
