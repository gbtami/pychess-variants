import { h, VNode } from 'snabbdom';

import { _ } from '@/i18n';
import { BooleanSettings } from '@/settings';
import { toggleSwitch } from '@/view';
import { EditorController } from './editorCtrl';


export class AliceMirrorSettings extends BooleanSettings {
    ctrl: EditorController;

    constructor(ctrl: EditorController) {
        super('aliceMirror', false);
        this.ctrl = ctrl;
    }

    update(): void {
        this.ctrl.aliceMirror = this.value;
    }

    view(): VNode {
        return h(
            'div.alice-mirror-toggle',
            toggleSwitch(
                this,
                'alice-mirror',
                _("Move pieces through the looking glass"),
                false
            )
        );
    }
}
