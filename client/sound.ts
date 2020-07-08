import { Howl } from 'howler';

import { volumeSettings } from './settings';

class Sounds {

    private static trackName = {
        GenericNotify: 'GenericNotify',
        SocialNotify: 'SocialNotify',
        Move: 'Move',
        Capture: 'Capture',
        Check: 'Check',
        Draw: 'Draw',
        Victory: 'Victory',
        Defeat: 'Defeat',
        ShogiMove: 'komaoto5',
        Chat: 'chat',
        Setup: 'dinding',
        LowTime: 'LowTime',
        Tick: 'Tick',
    };

    tracks;
    constructor() {
        this.tracks = {
            GenericNotify: 'GenericNotify',
            SocialNotify: 'SocialNotify',
            Move: 'Move',
            Capture: 'Capture',
            Check: 'Check',
            Draw: 'Draw',
            Victory: 'Victory',
            Defeat: 'Defeat',
            ShogiMove: 'komaoto5',
            Chat: 'chat',
            Setup: 'dinding',
            LowTime: 'LowTime',
            Tick: 'Tick',
        }
    }

    private buildSound = (file) => {
        var soundTheme = localStorage.soundTheme ?? 'standard';
        var sound = new Howl({
          src: ['/static/sound/' + soundTheme + '/' + file + '.ogg', '/static/sound/' + soundTheme + '/' + file + '.mp3'],
          onplayerror: function() {
            sound.once('unlock', function() {
              sound.play();
            });
          },
          volume: localStorage.volume ?? 1
        });
        return sound;
    }

    updateVolume() {
        const volume = volumeSettings.value;
        Object.keys(this.tracks).forEach(key => {
            this.tracks[key].volume(volume);
        });
    }

    updateSoundTheme() {
        Object.keys(this.tracks).forEach(key => {
            this.tracks[key] = this.buildSound(Sounds.trackName[key]);
        });
    }

    private audio = () => localStorage.soundTheme !== 'silent';

    genericNotify() { if ((this.audio())) {this.tracks.GenericNotify.play();} };
    socialNotify() { if ((this.audio())) {this.tracks.SocialNotify.play();} };
    move() { if ((this.audio())) {this.tracks.Move.play();} };
    capture() { if ((this.audio())) {this.tracks.Capture.play();} };
    check() { if ((this.audio())) {this.tracks.Check.play();} };
    draw() { if ((this.audio())) {this.tracks.Draw.play();} };
    victory() { if ((this.audio())) {this.tracks.Victory.play();} };
    defeat() { if ((this.audio())) {this.tracks.Defeat.play();} };
    shogimove() { if ((this.audio())) {this.tracks.ShogiMove.play();} };
    chat() { if ((this.audio())) {this.tracks.Chat.play();} };
    setup() { if ((this.audio())) {this.tracks.Setup.play();} };
    lowTime() { if ((this.audio())) {this.tracks.LowTime.play();} };
    tick() { if ((this.audio())) {this.tracks.Tick.play();} };
}

export const sound = new(Sounds);
