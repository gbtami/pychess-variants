import { sound } from './sound';

export function setVolume(volume : number) {
    localStorage.setItem('volume', volume.toString());
    sound.updateVolume();
}

export function setSoundTheme(soundTheme : string) {
    localStorage.setItem('soundTheme', soundTheme);
    sound.updateSoundTheme();
}
