// mirror letters to digits
function l2d(c) {
    switch (c) {
    case 'a': return '9';
    case 'b': return '8';
    case 'c': return '7';
    case 'd': return '6';
    case 'e': return '5';
    case 'f': return '4';
    case 'g': return '3';
    case 'h': return '2';
    case 'i': return '1';
    default: return '_'
    }
}

// mirror digits to letters
function d2l(c) {
    switch (c) {
    case '1': return 'i';
    case '2': return 'h';
    case '3': return 'g';
    case '4': return 'f';
    case '5': return 'e';
    case '6': return 'd';
    case '7': return 'c';
    case '8': return 'b';
    case '9': return 'a';
    default: return '_'
    }
}

function mirror(p) {
    return d2l(p[0]) + l2d(p[1]);
}

const dict = (keys, values) => keys.reduce((obj, key, index) => ({ ...obj, [key]: values[index] }), {});

const alpha = 'abcdefghi'.split('');
const zensuji = '１２３４５６７８９'.split('');
const kansuji = '一二三四五六七八九'.split('');

const zen_map = dict(zensuji, [1,2,3,4,5,6,7,8,9]);
const kan_map = dict(kansuji, alpha);

const pieces = '歩香桂銀金角飛玉と馬龍竜';
const piece_map = dict('歩香桂銀金角飛玉と馬龍竜'.split(''), 'PLNSGBRK'.split('').concat(['+P', '+B', '+R', '+R']));

const line_re = /(\d+) +([^ ]+)/u;

export function parseKif(text: string) {
    let date, place, tc, handicap, sente, gote, result = '';
    let move_list: string[] = [];
    let tagsProcessed = false;

    const lines = text.split(/\r?\n/u);
    let piace_name, prev_position, next_position, rest;

    for (var i = 0; i < lines.length; i++) {
        const firstChar = lines[i][0];
        if ( firstChar === '#' || firstChar === '*') continue;

        if (!tagsProcessed) {
            const symbols = [...lines[i]];
            const idx = symbols.indexOf('：'); // Fullwidth Colon!
            if (idx > -1) {
                const tagPair = [symbols.slice(0, idx).join(''), symbols.slice(idx + 1).join('')];
                switch (tagPair[0]) {
                case '開始日時':
                    date = tagPair[1];
                    break;
                case '場所':
                    place = tagPair[1];
                    break;
                case '持ち時間':
                    tc = tagPair[1];
                    break;
                case '手合割':
                    handicap = tagPair[1];
                    break;
                case '先手':
                    sente = tagPair[1];
                    break;
                case '後手':
                    gote = tagPair[1];
                    break;
                }
            } else {
                tagsProcessed = true;
            }
        }

        if (!tagsProcessed) {
            continue;
        }

        const res = lines[i].match(line_re);

        if (res) {
            const s = res[2];

            if (zensuji.includes(s[0])) {
                next_position = zen_map[s[0]] + kan_map[s[1]];
            } else if (s[0] == '同') {
                // used when the destination coordinate is the same as that of the immediately preceding move
            } else if (s[0] == '反' || s[0] == '切' || s[0] == '投') {
                break;
            } else {
                console.log('Unknown Move', s[0], lines[i], res);
                return [];
            }

            if (pieces.includes(s[2])) {
                piace_name = piece_map[s[2]];
                rest = s.slice(3);
            } else if (s[2] == '成') {
                piace_name = '+' + piece_map[s[3]];
                rest = s.slice(4);
            } else {
                console.log('Unknown Piece', s[2], lines[i], res);
                return [];
            }

            let promote = '';
            if (rest[0] == '成') {
                promote = '+';
                prev_position = rest[2] + alpha[parseInt(rest[3])-1];
            } else if (rest[0] == '打') {
                prev_position = '@';
            } else if (rest[0] == '(') {
                prev_position = rest[1] + alpha[parseInt(rest[2])-1];
            } else {
                console.log('Unknown ???', rest[0], lines[i], res);
                return [];
            }

            //const num = parseInt(res[1]);
            //console.log(num, piace_name, prev_position, next_position, promote);
            let move;
            if (prev_position == '@') {
                move = piace_name + prev_position + mirror(next_position) + promote;
            } else {
                move = mirror(prev_position) + mirror(next_position) + promote;
            }
            //console.log(num, move);
            move_list.push(move);
        }
    }
    return {'date': date, 'place': place, 'tc': tc, 'handicap': handicap, 'sente': sente, 'gote': gote, 'moves': move_list, 'result': result};
}