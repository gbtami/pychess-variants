// Translated from Python code https://github.com/takaki/kif2pgn

// mirror letters to digits
function l2d(c: string) {
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
function d2l(c: string) {
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

function mirror(p: string) {
    return d2l(p[0]) + l2d(p[1]);
}

const dict = (keys: string[], values: string[]) : {[key: string]: string} => keys.reduce((obj, key, index) => ({ ...obj, [key]: values[index] }), {});

// TODO: add missing handicap types to chess.ts
// recognise more initial handicap positions
// see https://en.wikipedia.org/wiki/Handicap_(shogi)#Types_of_handicap_games
const HC_TYPES = ["香落ち", "右香落ち", "角落ち", "飛車落ち", "飛香落ち", "二枚落ち", "三枚落ち", "四枚落ち", "五枚落ち", "左五枚落ち", "六枚落ち", "八枚落ち", "十枚落ち", "その他"];
const HC_NAMES = ["Lance HC", "RLance HC", "Bishop HC", "Rook HC", "Rook+Lance HC", "2-Piece HC", "3-Piece HC", "4-Piece HC", "5-Piece HC", "LL 5-Piece HC", "6-Piece HC", "8-Piece HC", "10-Piece HC", "Other-HC"];
const hc_map = dict(HC_TYPES, HC_NAMES);

const alpha = 'abcdefghi'.split('');
const zensuji = '１２３４５６７８９'.split('');
const kansuji = '一二三四五六七八九'.split('');

const zen_map: {[key: string]: string} = dict(zensuji, ['1','2','3','4','5','6','7','8','9']);
const kan_map = dict(kansuji, alpha);

const pieces = '歩香桂銀金角飛玉と馬龍竜';
const piece_map = dict('歩香桂銀金角飛玉と馬龍竜'.split(''), 'PLNSGBRK'.split('').concat(['+P', '+B', '+R', '+R']));

const line_re = /(\d+) +([^ ]+)/u;

export function resultString(movingPlayerWin: boolean, ply: number, isHandicap: boolean) {
    if (ply % 2 === ((movingPlayerWin) ? 1 : 0)) {
        return (!isHandicap) ? '1-0' : '0-1';
    } else{
        return (!isHandicap) ? '0-1' : '1-0';
    }
}

export interface KIF{
    date: string;
    place: string;
    tc: string;
    handicap: string;
    sente: string;
    gote: string;
    moves: string[];
    status: number;
    result: string;
}

export function parseKif(text: string): KIF {
    let date: string = '', place: string = '', tc: string = '', sente: string = '', gote: string = '', handicap = '';
    let status = 11; // unknown
    let result = '*'; // unknown
    const move_list: string[] = [];
    let tagsProcessed = false;
    let isHandicap = false;
    let movesStartLineNumber: number = 0, ply: number;

    const lines: string[] = text.split(/\r?\n/u);
    let piace_name: string, prev_position: string, next_position: string = '', rest: string;
    const WIN = true;
    const LOSS = false;

    for (let i = 0; i < lines.length; i++) {
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
                    isHandicap = HC_TYPES.includes(handicap);
                    handicap = (isHandicap) ? hc_map[handicap] : '';
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
            movesStartLineNumber = i;
            continue;
        }

        const res = lines[i].match(line_re);

        if (res) {
            const s = res[2];
            ply = i - movesStartLineNumber - 1;

            if (zensuji.includes(s[0])) {
                next_position = zen_map[s[0]] + kan_map[s[1]];
            } else if (s[0] == '同') {
                // used when the destination coordinate is the same as that of the immediately preceding move
            } else if (s[0] == '反') {
                status = 10; // illegal move
                if (s == '反則勝ち') {
                    // indicates that the immediately preceding move was illegal
                    result = resultString(WIN, ply, isHandicap);
                } else {
                    // indicates that the player whose turn this was supposed to be somehow lost by illegality
                    result = resultString(LOSS, ply, isHandicap);
                }
                break;
            } else if (s[0] == '切') {
                status = 6; // time out/flag drop
                result = resultString(LOSS, ply, isHandicap);
                break;
            } else if (s[0] == '投') {
                status = 2; // resignation
                result = resultString(LOSS, ply, isHandicap);
                break;
            } else if (s[0] == '詰') {
                status = 1; // checkmate
                result = resultString(WIN, ply, isHandicap);
                break;
            } else if (s[0] == '入') {
                status = 12; // entering king (campmate)
                result = resultString(WIN, ply, isHandicap);
                break;
            } else if (s[0] == '千') {
                status = 13; // repetition
                result = '1/2-1/2';
                break;
            } else if (s[0] == '持') {
                status = 5; // impasse
                result = '1/2-1/2';
                break;
            } else if (s[0] == '中') {
                status = 0; // aborted
                break;
            } else {
                console.log('Unknown Move', s[0], lines[i], res);
                throw new Error('Unknown Move '+ s[0]);//return [];
            }

            if (pieces.includes(s[2])) {
                piace_name = piece_map[s[2]];
                rest = s.slice(3);
            } else if (s[2] == '成') {
                piace_name = '+' + piece_map[s[3]];
                rest = s.slice(4);
            } else {
                console.log('Unknown Piece', s[2], lines[i], res);
                throw new Error('Unknown Piece '+ s[2]);//return [];
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
                throw new Error('Unknown ??? '+ rest[0]);//return [];
            }

            //const num = parseInt(res[1]);
            //console.log(num, ply, piace_name, prev_position, next_position, promote);
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
    return {'date': date, 'place': place, 'tc': tc, 'handicap': handicap, 'sente': sente, 'gote': gote, 'moves': move_list, 'status': status, 'result': result};
}
