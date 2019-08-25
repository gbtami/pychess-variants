class sounds {
    tracks;
    constructor() {
        this.tracks = {
            GenericNotify: { name: 'GenericNotify', qty : 1, pool : [], index : 0},
            Move: { name: 'Move', qty : 6, pool : [], index : 0},
            Capture: { name: 'Capture', qty : 4, pool : [], index : 0},
            Check: { name: 'Check', qty : 2, pool : [], index : 0},
            Draw: { name: 'Draw', qty : 1, pool : [], index : 0},
            Victory: { name: 'Victory', qty : 1, pool : [], index : 0},
            Defeat: { name: 'Defeat', qty : 1, pool : [], index : 0},
            ShogiMove: { name: 'komaoto5', qty : 6, pool : [], index : 0},
            Chat: { name: 'chat', qty : 1, pool : [], index : 0},
        }

        Object.keys(this.tracks).forEach(key => {
            let type = this.tracks[key];
            type.pool = this.buildManySounds(type.name, type.qty);
        });
    }

    private buildManySounds = (file, qty) => {
        var soundArray: HTMLAudioElement[] = [];
        while (soundArray.length < qty) {
            var el = document.createElement("audio");
            if (el.canPlayType('audio/mpeg')) {
                el.src = '/static/sound/' + file + '.mp3';
            } else {
                el.src = '/static/sound/' + file + '.ogg';
            }
            el.setAttribute("preload", "none");
            el.style.display = "none";
            soundArray.push(el);
            document.body.appendChild(el);
        }
        return soundArray;
    }

    private getSound = (type) => {
        let target = this.tracks[type];
        target.index = (target.index + 1) % target.pool.length;
        // console.log("SOUND:", type, target.index);
        return target.pool[target.index];
    }

    genericNotify() { this.getSound('GenericNotify').play(); };
    move() { this.getSound('Move').play(); };
    capture() { this.getSound('Capture').play(); };
    check() { this.getSound('Check').play(); };
    draw() { this.getSound('Draw').play(); };
    victory() { this.getSound('Victory').play(); };
    defeat() { this.getSound('Defeat').play(); };
    shogimove() { this.getSound('ShogiMove').play(); };
    chat() { this.getSound('Chat').play(); };
}

export const sound = new(sounds);

export function changeCSS(cssFile) {
    // css file index in template.html
    var cssLinkIndex = 1;
    if (cssFile.includes("xiangqi")) {
        cssLinkIndex = 3;
    } else if (cssFile.includes("shogi")) {
        cssLinkIndex = 2;
    } else if (cssFile.includes("capasei")) {
        cssLinkIndex = 4;
    }
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}
