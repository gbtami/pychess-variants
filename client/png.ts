import { toPng } from 'html-to-image';
import * as cg from 'chessgroundx/types';

export function copyBoardToPNG(fen: cg.FEN) {
    const el = document.getElementsByTagName('cg-board')[0] as HTMLElement;
    const style = getComputedStyle(document.body);
    const width = parseInt(style.getPropertyValue('--cg-width'));
    const height = parseInt(style.getPropertyValue('--cg-height'));
 
    const filter = (node: HTMLElement)=>{
        return (node.tagName !== 'coords');
    }

    toPng(el, {width: width, height: height, filter: filter, skipFonts: true})
        .then(dataUrl => {
            const link = document.createElement('a');
            link.download = fen.split(' ')[0].replace(/\+/g, '.') + '.png';
            link.href = dataUrl;
            link.click();
        });
}
