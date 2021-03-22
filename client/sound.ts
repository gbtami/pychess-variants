import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';
import { Howl } from 'howler';

import { IVariant } from './chess';
import { StringSettings, NumberSettings } from './settings';
import { radioList, slider } from './view';
import { model } from './main';


class Sounds {

    private static readonly trackNames = {
        GenericNotify: 'GenericNotify',
        SocialNotify: 'SocialNotify',
        Move: 'Move',
        Capture: 'Capture',
        Check: 'Check',
        Draw: 'Draw',
        Victory: 'Victory',
        Defeat: 'Defeat',
        ShogiMove: 'shogisnap',
        ShogiCapture: 'shogislam',
        Chat: 'chat',
        Setup: 'dinding',
        LowTime: 'LowTime',
        Tick: 'Tick',
        Explosion: 'Explosion',
    };

    tracks: { [key: string]: Howl };

    constructor() {
        this.tracks = {};
    }

    updateVolume() {
        const volume = volumeSettings.value;
        Object.keys(this.tracks).forEach(key => {
            this.tracks[key].volume(volume);
        });
    }

    updateSoundTheme() {
        Object.keys(Sounds.trackNames).forEach(key => {
            this.tracks[key] = this.buildSound(Sounds.trackNames[key]);
        });
    }

    private buildSound(trackName: string) {
        const soundTheme = soundThemeSettings.value;
        const soundTrack = (soundTheme === 'silent') ? 'Silence' : trackName;
        const sound = new Howl({
            src: [
                model["asset-url"] + '/sound/' + soundTheme + '/' + soundTrack + '.ogg',
                model["asset-url"] + '/sound/' + soundTheme + '/' + soundTrack + '.mp3'
            ],
            onplayerror: function() {
                sound.once('unlock', function() {
                sound.play();
                });
            },
            volume: volumeSettings.value,
        });
        return sound;
    }

    private audio() {
        return soundThemeSettings.value !== 'silent';
    }

    genericNotify() { if (this.audio()) this.tracks.GenericNotify.play(); }
    socialNotify()  { if (this.audio()) this.tracks.SocialNotify.play(); }
    move()          { if (this.audio()) this.tracks.Move.play(); }
    capture()       { if (this.audio()) this.tracks.Capture.play(); }
    check()         { if (this.audio()) this.tracks.Check.play(); }
    draw()          { if (this.audio()) this.tracks.Draw.play(); }
    victory()       { if (this.audio()) this.tracks.Victory.play(); }
    defeat()        { if (this.audio()) this.tracks.Defeat.play(); }
    shogimove()     { if (this.audio()) this.tracks.ShogiMove.play(); }
    shogicapture()  { if (this.audio()) this.tracks.ShogiCapture.play(); }
    chat()          { if (this.audio()) this.tracks.Chat.play(); }
    setup()         { if (this.audio()) this.tracks.Setup.play(); }
    lowTime()       { if (this.audio()) this.tracks.LowTime.play(); }
    tick()          { if (this.audio()) this.tracks.Tick.play(); }
    explosion()     { if (this.audio()) this.tracks.Explosion.play(); }

    private moveSoundSet = {
        regular: { move: () => this.move(), capture: () => this.capture() },
        shogi: { move: () => this.shogimove(), capture: () => this.shogicapture() },
        atomic: { move: () => this.move(), capture: () => this.explosion() },
    };

    moveSound(variant: IVariant, capture: boolean) {
        const soundSet = this.moveSoundSet[variant.pieceSound];
        if (capture)
            soundSet.capture();
        else
            soundSet.move();
    }

    gameEndSound(result: string, color: string) {
        switch (result) {
            case "1/2-1/2":
                this.draw();
                break;
            case "1-0":
                if (color === "white")
                    this.victory();
                else
                    this.defeat();
                break;
            case "0-1":
                if (color === "black")
                    this.victory();
                else
                    this.defeat();
                break;
        }
    }

}

class VolumeSettings extends NumberSettings {

    constructor() {
        super('volume', 1);
    }

    update(): void {
        sound.updateVolume();
    }

    view(): VNode {
        return slider(this, 'sound-volume', 0, 1, 0.01);
    }
}

const soundThemes = {
    silent: "Silent",
    standard: "Standard",
    robot: "Robot",
};

class SoundThemeSettings extends StringSettings {
    
    constructor() {
        super('soundtheme', 'standard');
    }

    update(): void {
        sound.updateSoundTheme();
    }

    view(): VNode {
        return h('div#soundtheme.radio-list', radioList(this, 'soundtheme', soundThemes, (_, key) => this.value = key));
    }
}

export const sound = new(Sounds);
export const volumeSettings = new VolumeSettings();
export const soundThemeSettings = new SoundThemeSettings();
