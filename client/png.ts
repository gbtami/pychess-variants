import { toPng } from 'html-to-image';

export function copyBoardToPNG(fen) {
    const el = document.getElementById('board2png') as HTMLElement;
    const style = getComputedStyle(document.body);
    const width = parseInt(style.getPropertyValue('--cgwrapwidth'));
    const height = parseInt(style.getPropertyValue('--cgwrapheight'));
    toPng(el, {width: width, height: height})
        .then(function (dataUrl) {
            let link = document.createElement('a');
            link.download = fen.split(' ')[0].replace(/\+/g, '.') + '.png';
            link.href = dataUrl;
            link.click();
        });
}
