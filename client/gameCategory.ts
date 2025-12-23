import { h, VNode } from 'snabbdom';

import { gameCategoryLabel } from './i18n';
import { StringSettings } from './settings';
import { radioList } from './view';
import { variantGroups } from './variants';

function gameCategories() {
    const categories: {[index: string]: string} = {
        all: gameCategoryLabel("all"),
    };
    for (const key in variantGroups) {
        categories[key] = gameCategoryLabel(key);
    }
    return categories;
}

class GameCategorySettings extends StringSettings {

    constructor() {
        super('game_category', 'all');
    }

    update(): void {
    }

    view(): VNode {
        const categoryList = radioList(
            this,
            'game_category',
            gameCategories(),
            (evt, key) => {
                this.value = key;
                (evt.target as HTMLInputElement).form!.submit();
            }
        )
        return h('div#settings-game-category', [
            h('form.radio-list', { props: { method: "post", action: "/pref/game-category" } }, categoryList),
        ]);
    }
}

export const gameCategorySettings = new GameCategorySettings();
