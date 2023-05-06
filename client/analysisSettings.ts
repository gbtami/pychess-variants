import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { BooleanSettings } from './settings';
import { toggleSwitch } from './view';
import { AnalysisController } from './analysisCtrl';
import { patch } from './document';


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
