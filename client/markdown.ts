import { h, VNode } from 'snabbdom';
import { PyChessModel } from "./types";

import { Converter } from 'showdown';

const SRC = 'https://github.com/gbtami/pychess-variants/blob/master'; 
const DST = 'https://cdn.jsdelivr.net/gh/gbtami/pychess-variants\@1.10.19';

function getMarkdown(vnode: VNode, model: PyChessModel, lang: string, folder: string, contentDiv: string) {
    var url= DST + '/static/' + folder + '/' + lang + '/' + model.markdown;
    const urlEN= DST + '/static/' + folder + '/' + model.markdown;

    function xhrGet(url) {
        var xhrGET = new XMLHttpRequest();
        xhrGET.responseType = 'blob';

        xhrGET.onload = function() {
            var reader = new FileReader();
            reader.readAsText(xhrGET.response);
            reader.onload =  function(e) {
                const content = document.querySelector(`div.${contentDiv}`);
                const converter = new Converter();

                const markdown = e.target.result;
                const parsedHtml = converter.makeHtml(markdown.replaceAll(SRC, DST));

                content.innerHTML = parsedHtml;
            };
        };
        xhrGET.open('GET', url, true);
        xhrGET.send();
    }

    if (lang === 'en') {
        url = urlEN;
        xhrGet(url)
    } else {
        var xhrHEAD = new XMLHttpRequest();
        xhrHEAD.onloadend = function() {
            console.log("OTT", xhrHEAD.status);
            if (xhrHEAD.status == 404) {
                console.log(url + ' replied 404');
                url = urlEN;
            };
            xhrGet(url);
        };
        xhrHEAD.open('HEAD', url, true);
        xhrHEAD.send();
    }

    console.log("ITT", url);


}

export function markdownView(model: PyChessModel, lang: string, folder: string, contentDiv: string) {
    return [
        h('markdown', { hook: { insert: (vnode) => getMarkdown(vnode, model, lang, folder, contentDiv) } }),
    ];
}
