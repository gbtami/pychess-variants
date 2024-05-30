import { Api } from 'chessgroundx/api';

import { boardSettings } from '@/boardSettings';
import { PIECE_FAMILIES } from '@/variants';
import { Variant } from '@/variants';


export function boardImageSVG(fen: string, variant: Variant, cg: Api, home: string): void {
    const pieceFamily = variant.pieceFamily;
    const idx = boardSettings.getSettings("PieceStyle", pieceFamily as string).value as number;
    const pieceCSS = PIECE_FAMILIES[pieceFamily].pieceCSS[idx] ?? 'letters';

    const css = `${variant.pieceFamily}_${pieceCSS}`;

    const style = getComputedStyle(document.body);
    const width = parseInt(style.getPropertyValue('--cg-width'));
    const height = parseInt(style.getPropertyValue('--cg-height'));

    const safeFEN = fen.split('[')[0].replace(/\+/g, '.');

    let params: string = `?css=${css}&fen=${safeFEN}&width=${width}&height=${height}`;

    const state = cg.state;
    if (state.drawable.shapes.length > 0) {
        const arrows:string[] = [];
        state.drawable.shapes.forEach(shape => {
            const color = (shape.brush) ? shape.brush.charAt(0).toUpperCase() :'';
            const orig = shape.orig.replace(/:/g, "10");
            const dest = (shape.dest) ? shape.dest.replace(/:/g, "10") : '';
            arrows.push(`${color}${orig}${dest}`);
        });
        params = params + '&arrows=' + arrows.join(',');
    }
    const url = `${home}/board.svg${params}`;
    window.open(url, '_blank')!.focus();
}
