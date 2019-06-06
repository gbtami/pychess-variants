// http://jsfiddle.net/MissoulaLorenzo/gfn6ob3j/
// https://github.com/ornicar/lila/blob/master/ui/common/src/resize.ts

import * as cg from 'chessgroundx/types';

export type MouchEvent = MouseEvent & TouchEvent;

//export default function resizeHandle(els: cg.Elements, pref: number, ply: number) {
export default function resizeHandle(els: cg.Elements) {

//  if (!pref) return;
  if (true) return;

  const el = document.createElement('cg-resize');
  els.container.appendChild(el);

  const mousemoveEvent = 'mousemove';
  const mouseupEvent = 'mouseup';

  el.addEventListener('mousedown', (start: MouchEvent) => {

    start.preventDefault();

    const startPos = eventPosition(start)!;
    const initialZoom = 100;  //parseInt(getComputedStyle(document.body).getPropertyValue('--zoom'));
    let zoom = initialZoom;
/*
    const saveZoom = window.lichess.debounce(() => {
      $.ajax({ method: 'post', url: '/pref/zoom?v=' + (100 + zoom) });
    }, 700);
*/

    const setZoom = (zoom: number) => {
        const el = document.querySelector('.cg-wrap') as HTMLElement;
        if (el) {
//            const baseWidth = dimensions[VARIANTS[this.variant].geom].width * (this.variant === "shogi" ? 52 : 64);
//            const baseHeight = dimensions[VARIANTS[this.variant].geom].height * (this.variant === "shogi" ? 60 : 64);
            const baseWidth = parseInt( document.defaultView.getComputedStyle( el ).width || '', 10);
            const baseHeight = parseInt(document.defaultView.getComputedStyle( el ).height || '', 10);
            console.log(baseWidth, baseHeight, zoom);
            const pxw = `${zoom / 100 * baseWidth}px`;
            const pxh = `${zoom / 100 * baseHeight}px`;
            el.style.width = pxw;
            el.style.height = pxh;
            const ev = document.createEvent('Event');
            ev.initEvent('chessground.resize', false, false);
            document.body.dispatchEvent(ev);
        }
    }

    const resize = (move: MouchEvent) => {

      const pos = eventPosition(move)!;
      const delta = pos[0] - startPos[0] + pos[1] - startPos[1];

      zoom = Math.round(Math.min(150, Math.max(0, initialZoom + delta / 10)));

//      document.body.setAttribute('style', '--zoom:' + zoom);
//      window.lichess.dispatchEvent(window, 'resize');
      setZoom(zoom);
//      saveZoom();
    };

    document.body.classList.add('resizing');

    document.addEventListener(mousemoveEvent, resize);

    document.addEventListener(mouseupEvent, () => {
      document.removeEventListener(mousemoveEvent, resize);
      document.body.classList.remove('resizing');
    }, { once: true });
  });
/*
  if (pref == 1) {
    const toggle = (ply: number) => el.classList.toggle('none', ply >= 2);
    toggle(ply);
    window.lichess.pubsub.on('ply', toggle);
  }

  addNag(el);
*/
}

function eventPosition(e: MouchEvent): [number, number] | undefined {
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY];
  if (e.touches && e.targetTouches[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return undefined;
}
/*
function addNag(el: HTMLElement) {

  const storage = window.lichess.storage.makeBoolean('resize-nag');
  if (storage.get()) return;

  window.lichess.loadCssPath('nag-circle');
  el.title = 'Drag to resize';
  el.innerHTML = '<div class="nag-circle"></div>';
  el.addEventListener(window.lichess.mousedownEvent, () => {
    storage.set(true);
    el.innerHTML = '';
  }, { once: true });

  setTimeout(() => storage.set(true), 15000);
}
*/