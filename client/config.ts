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
