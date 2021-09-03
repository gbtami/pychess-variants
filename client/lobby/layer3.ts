import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { IVariant, VARIANTS } from '../chess';
import { variantBoard } from './layer1';
import { layer2chess } from './layer2chess';
import { layer2fairy } from './layer2fairy';
import { layer2army } from './layer2army';
import { layer2makruk } from './layer2makruk';
import { layer2shogi } from './layer2shogi';
import { layer2xiangqi } from './layer2xiangqi';

export function layer3variant (containerId: string, model: string, variantName: string, chess960: boolean): void {
    const variant: IVariant = VARIANTS[variantName];

    let leve2func;
    switch (containerId) {
    case 'layer2chesscont':
        leve2func = layer2chess; break;
    case 'layer2fairycont':
        leve2func = layer2fairy; break;
    case 'layer2armycont':
        leve2func = layer2army; break;
    case 'layer2makrukcont':
        leve2func = layer2makruk; break;
    case 'layer2shogicont':
        leve2func = layer2shogi; break;
    case 'layer2xiangqicont':
        leve2func = layer2xiangqi; break;
    }

    const layer3cont = h('div#chessl3cont.layer-3-container.chess-l3', [
        h('button.layer-2-category lvl3', [
            h('div.variant-title-l2', [
                h('div.iconcontainer.icon', { attrs: { 'data-icon': variant.icon(chess960) } }, variant.displayName(chess960)),
            ]),
            h('ul.l3links-cont', [
                h('li.l3links', 'Create a game'),
                h('li.l3links', 'Challenge a friend'),
                h('li.l3links', 'Play against AI'),
                h('li.l3links', 'Play against RM'),
            ]),
            h('h5#chessl3back', { on: { click: () => leve2func(model, 'chessl3cont') } }, 'Go Back'),
        ]),
        h('button.layer-2-category l3img', [
            variantBoard(variant, variant.startFen),
        ]),
        h('button.layer-2-category l3t', [
            h('p.variant-extra-info', variant.tooltip()),
            h('a.variant-extra-info', { attrs: { href: model['home'] + '/variants/' + variant.name, target: '_blank' } }, 'Rules'),
            h('p.variant-extra-info', 'Tip: You can play more at www.lichess.org'),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer3cont);
}

/*
            <div class="layer-3-container chess-l3 remove-btn" id="chessl3cont">

                <button class="layer-2-category l3v">

                    <div class="variant-title-l2"> <div class="icon-container"> <img src="/images/icons/chess.svg" alt=""></div> <h3>Chess</h3></div>

                    <ul class="l3links-cont">
                     <li class="l3links"><a href="">Create a game</a></li>
                     <li class="l3links"><a href="">Challenge a friend</a></li>
                     <li class="l3links"><a href="">Play against AI</a></li>
                     <li class="l3links"><a href="">Play against RM</a></li>
                     <li class="l3links"><a href="">Analyze</a></li>
                    </ul>

                    <h5 id="chessl3back"> Go Back</h5>
                </button>

                <button class="layer-2-category l3img">
                    <div class="generic-image-container generic-shogi"><img src="/images/Chess.png" alt=""></div>
                </button>

                <button class="layer-2-category l3t">
                <p class="variant-extra-info">Western or International Chess, unmodified, as it's played by FIDE standards.
                </p>
                <a class="variant-extra-info" href="https://www.pychess.org/variants/chess" target="_blank">Rules
                </a>
                <p class="variant-extra-info">Tip: You can play more at www.lichess.org
                </p>

                </button>

            </div>
*/