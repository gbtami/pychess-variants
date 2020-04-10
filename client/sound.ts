import { Howl } from 'howler';


class sounds {
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
        }

        Object.keys(this.tracks).forEach(key => {
            this.tracks[key] = this.buildSound(this.tracks[key]);
        });
    }

    private buildSound = (file) => {
        var soundTheme = localStorage.soundTheme === undefined ? 'standard' : localStorage.soundTheme;
        var sound = new Howl({
          src: ['/static/sound/' + soundTheme + '/' + file + '.ogg', '/static/sound/' + soundTheme + '/' + file + '.mp3'],
          onplayerror: function() {
            sound.once('unlock', function() {
              sound.play();
            });
          }
        });
        return sound;
    }

    private audio = () => { return (localStorage.getItem('audio') === undefined ? true : localStorage.getItem('audio') === 'true') };

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
}

export const sound = new(sounds);
