import { _ } from './i18n';

export function getDocumentData(name: string) {
    return document.getElementById('pychess-variants')!.getAttribute('data-' + name.toLowerCase());
}

export function getCookie(name) {
    const cookies = document.cookie.split(';');
    for(let i = 0; i < cookies.length; i++) {
        const pair = cookies[i].trim().split('=');
        if(pair[0] == name)
            return pair[1];
    }
    return "";
}

export function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

export function changeCSS(cssFile) {
    // css file index in template.html
    console.log("changeCSS()", cssFile);
    let cssLinkIndex = 1;
    if (cssFile.includes("seir"))
        cssLinkIndex = 2;
    else if (cssFile.includes("makruk"))
        cssLinkIndex = 3;
    else if (cssFile.includes("sittuyin"))
        cssLinkIndex = 4;
    else if (cssFile.includes("shogi"))
        cssLinkIndex = 5;
    else if (cssFile.includes("kyoto"))
        cssLinkIndex = 6;
    else if (cssFile.includes("xiangqi"))
        cssLinkIndex = 7;
    else if (cssFile.includes("capa"))
        cssLinkIndex = 8;
    else if (cssFile.includes("shako"))
        cssLinkIndex = 9;
    else if (cssFile.includes("shogun"))
        cssLinkIndex = 10;
    else if (cssFile.includes("janggi"))
        cssLinkIndex = 11;
    else if (cssFile.includes("orda"))
        cssLinkIndex = 12;
    else if (cssFile.includes("syno"))
        cssLinkIndex = 13;
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}
