import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { BooleanSettings } from './settings';
import { toggleSwitch } from './view';
import { PuzzleController } from './puzzleCtrl';


export class RatedSettings extends BooleanSettings {
    ctrl: PuzzleController;

    constructor(ctrl: PuzzleController) {
        super('puzzle_rated', true);
        this.ctrl = ctrl;
    }

    update(): void {
        this.ctrl.isRated = this.value;
        this.ctrl.renderRating(this.ctrl.isRated, this.ctrl.color, this.ctrl.wrating, this.ctrl.brating);
    }

    view(): VNode {
        return h(
            'div.rated-toggle',
            toggleSwitch(
                this,
                'puzzle-rated',
                _("Rated"),
                false
            )
        );
    }
}

export class AutoNextSettings extends BooleanSettings {
    ctrl: PuzzleController;

    constructor(ctrl: PuzzleController) {
        super('puzzle_autoNext', false);
        this.ctrl = ctrl;
    }

    update(): void {
        this.ctrl.autoNext = this.value;
    }

    view(): VNode {
        return h(
            'div.auto-next-toggle',
            toggleSwitch(
                this,
                'auto-next',
                _("Jump to next puzzle immediately"),
                false
            )
        );
    }
}
