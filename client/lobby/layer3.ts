import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { layer2chess } from './layer2chess';

export function layer3chess (assetUrl) {
    const layer3cont = h('div#chessl3cont.layer-3-container.chess-l3', [
        h('button.layer-2-category lvl3', [
            h('div.layer-two-category-info', [
                h('h4', 'Chess Variants'),
                h('div.generic-image-container', [ h('img', { attrs: { src: assetUrl + "/images/Chess.png" } }) ]),
                h('p.variant-category-description', 'Variants using a basic chess set but with different rules'),
                h('h5#chessl3back', { on: { click: () => layer2chess(assetUrl, 'chessl3cont') } }, 'Go Back'),
            ]),
        ]),
    ]);

    const container = document.getElementById('layer2chesscont') as HTMLElement;
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