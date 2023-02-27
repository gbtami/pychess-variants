import { h, VNode } from 'snabbdom';

import { Howl } from 'howler';

import { _ } from './i18n';
import { Variant } from './variants';
import { StringSettings, NumberSettings } from './settings';
import { radioList, slider } from './view';


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
        Berserk: 'Berserk',
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

    updateSoundTheme(assetURL: string) {
        Object.keys(Sounds.trackNames).forEach( (key: keyof typeof Sounds.trackNames) => {
            this.tracks[key] = this.buildSound(assetURL, Sounds.trackNames[key]);
        });
    }

    private buildSound(assetURL: string, trackName: string) {
        const soundTheme = soundThemeSettings.value;
        const soundTrack = (soundTheme === 'silent') ? 'Silence' : trackName;
        const sound = new Howl({
            src: [
                assetURL + '/sound/' + soundTheme + '/' + soundTrack + '.ogg',
                assetURL + '/sound/' + soundTheme + '/' + soundTrack + '.mp3'
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
    berserk()       { if (this.audio()) this.tracks.Berserk.play(); }

    private moveSoundSet: {[k:string]: { move: ()=> void; capture: ()=>void;}} = {
        regular: { move: () => this.move(), capture: () => this.capture() },
        shogi: { move: () => this.shogimove(), capture: () => this.shogicapture() },
        atomic: { move: () => this.move(), capture: () => this.explosion() },
    };

    moveSound(variant: Variant, capture: boolean) {
        const soundSet = variant.ui.pieceSound in this.moveSoundSet? this.moveSoundSet[variant.ui.pieceSound] : this.moveSoundSet.regular;
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
        return h('div', slider(this, 'sound-volume', 0, 1, 0.01, _('Volume')));
    }
}

const soundThemes = {
    silent: "Silent",
    standard: "Standard",
    piano: "Piano",
    nes: "NES",
    sfx: "SFX",
    futuristic: "Futuristic",
    lisp: "Lisp",
    robot: "Robot",
};

class SoundThemeSettings extends StringSettings {
    assetURL: string;

    constructor() {
        super('soundtheme', 'standard');
    }

    update(): void {
        sound.updateSoundTheme(this.assetURL);
    }

    view(): VNode {
        return h('div#soundtheme.radio-list', radioList(this, 'soundtheme', soundThemes, (_, key) => this.value = key));
    }
}

export const sound = new(Sounds);
export const volumeSettings = new VolumeSettings();
export const soundThemeSettings = new SoundThemeSettings();
