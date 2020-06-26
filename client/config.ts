import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { toVNode } from 'snabbdom/tovnode';

import { boardSettings } from './board';
import { sound } from './sound';

export function toggleSettings() {
    const settings = document.getElementById('settings') as HTMLElement;
    if (settings.style.display === 'none') {
        settings.style.display = 'flex';
        Array.from(settings.children).forEach((e : HTMLElement) => e.style.display = 'none');
        (document.getElementById('settings-main') as HTMLElement).style.display = 'flex';
    }
    else
        settings.style.display = 'none';
}

export function showSettings(settingsName) {
    const main = document.getElementById('settings-main') as HTMLElement;
    const settings = document.getElementById('settings-' + settingsName) as HTMLElement;
    main.style.display = 'none';
    settings.style.display = 'flex';
}

export function setVolume(volume) {
    localStorage.volume = volume;
    sound.updateVolume();
}

export function setSoundTheme(soundTheme) {
    localStorage.soundTheme = soundTheme;
    sound.updateSoundTheme();
}

export function setTheme(theme) {
    const oldTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.theme = theme;
    if (oldTheme != theme) {
        var alliside = document.getElementsByTagName('i-side');
        for (var j = 0; j < alliside.length; j++) {
            // take care of random color seek icons
            if (!alliside[j].classList.contains('icon-adjust')) {
                alliside[j].classList.toggle("icon-white");
                alliside[j].classList.toggle("icon-black");
            }
        }
    }
}

export function showGameSettings(variant) {
    const settings = document.getElementById('board-settings') as HTMLElement;
    patch(toVNode(settings), boardSettings.view(variant));
}

export function changeCSS(cssFile) {
    // css file index in template.html
    let cssLinkIndex = 1;
    if (cssFile.includes("seir")) {
        cssLinkIndex = 2;
    } else if (cssFile.includes("makruk")) {
        cssLinkIndex = 3;
    } else if (cssFile.includes("sittuyin")) {
        cssLinkIndex = 4;
    } else if (cssFile.includes("shogi")) {
        cssLinkIndex = 5;
    } else if (cssFile.includes("kyoto")) {
        cssLinkIndex = 6;
    } else if (cssFile.includes("xiangqi")) {
        cssLinkIndex = 7;
    } else if (cssFile.includes("capa")) {
        cssLinkIndex = 8;
    } else if (cssFile.includes("shako")) {
        cssLinkIndex = 9;
    } else if (cssFile.includes("shogun")) {
        cssLinkIndex = 10;
    } else if (cssFile.includes("janggi")) {
        cssLinkIndex = 11;
    } else if (cssFile.includes("orda")) {
        cssLinkIndex = 12;
    }
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}
