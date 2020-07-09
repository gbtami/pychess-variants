import { Howl } from 'howler';

import { volumeSettings, soundThemeSettings } from './settings';

class Sounds {

    private static trackNames = {
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
        const sound = new Howl({
          src: ['/static/sound/' + soundTheme + '/' + trackName + '.ogg', '/static/sound/' + soundTheme + '/' + trackName + '.mp3'],
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
    chat()          { if (this.audio()) this.tracks.Chat.play(); }
    setup()         { if (this.audio()) this.tracks.Setup.play(); }
    lowTime()       { if (this.audio()) this.tracks.LowTime.play(); }
    tick()          { if (this.audio()) this.tracks.Tick.play(); }
}

export const sound = new(Sounds);
