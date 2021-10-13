import { toPng } from 'html-to-image';
import * as cg from 'chessgroundx/types';

export function copyBoardToPNG(fen: cg.FEN) {
    const el = document.getElementById('mainboard') as HTMLElement;
    const style = getComputedStyle(document.body);
    const width = parseInt(style.getPropertyValue('--cg-width'));
    const height = parseInt(style.getPropertyValue('--cg-height'));
    toPng(el, {width: width, height: height})
        .then(dataUrl => {
            const link = document.createElement('a');
            link.download = fen.split(' ')[0].replace(/\+/g, '.') + '.png';
            link.href = dataUrl;
            link.click();
        });
}
