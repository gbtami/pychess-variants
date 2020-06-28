import { _ } from './i18n';

export function getCookie(name) {
    var cookies = document.cookie.split(';');
    for(var i=0 ; i < cookies.length ; ++i) {
        var pair = cookies[i].trim().split('=');
        if(pair[0] == name)
            return pair[1];
    }
    return "";
}

export function setCookie(cname, cvalue, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  var expires = "expires="+ d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

export function changeCSS(cssFile) {
    // css file index in template.html
    console.log("changeCSS()", cssFile);
    var cssLinkIndex = 1;
    if (cssFile.includes("seir")) {
        cssLinkIndex = 2;
    } else if (cssFile.includes("makruk")) {
        cssLinkIndex = 3;
    } else if (cssFile.includes("sittuyin")) {
        cssLinkIndex = 4;
    } else if (cssFile.includes("shogi")) {
        cssLinkIndex = 5;
    } else if (cssFile.includes("kyoto")) {
        cssLinkIndex = 6;
    } else if (cssFile.includes("xiangqi")) {
        cssLinkIndex = 7;
    } else if (cssFile.includes("capa")) {
        cssLinkIndex = 8;
    } else if (cssFile.includes("shako")) {
        cssLinkIndex = 9;
    } else if (cssFile.includes("shogun")) {
        cssLinkIndex = 10;
    } else if (cssFile.includes("janggi")) {
        cssLinkIndex = 11;
    } else if (cssFile.includes("orda")) {
        cssLinkIndex = 12;
    }
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}



// flip
export function toggleOrientation (ctrl) {
    /*
    ctrl.flip = !ctrl.flip;
    ctrl.chessground.toggleOrientation();

    if (ctrl.variant.endsWith('shogi')) {
        const color = ctrl.chessground.state.orientation === "white" ? "white" : "black";
        setPieces(ctrl, color, true);
    };

    console.log("FLIP");
    if (ctrl.hasPockets) {
        const tmp_pocket = ctrl.pockets[0];
        ctrl.pockets[0] = ctrl.pockets[1];
        ctrl.pockets[1] = tmp_pocket;
        ctrl.vpocket0 = patch(ctrl.vpocket0, pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }

    // TODO: moretime button
    if (ctrl instanceof RoundController) {
        const new_running_clck = (ctrl.clocks[0].running) ? ctrl.clocks[1] : ctrl.clocks[0];
        ctrl.clocks[0].pause(false);
        ctrl.clocks[1].pause(false);

        const tmp_clock = ctrl.clocks[0];
        const tmp_clock_time = tmp_clock.duration;
        ctrl.clocks[0].setTime(ctrl.clocks[1].duration);
        ctrl.clocks[1].setTime(tmp_clock_time);
        if (ctrl.status < 0) new_running_clck.start();

        ctrl.vplayer0 = patch(ctrl.vplayer0, player('player0', ctrl.titles[ctrl.flip ? 1 : 0], ctrl.players[ctrl.flip ? 1 : 0], ctrl.ratings[ctrl.flip ? 1 : 0], ctrl.model["level"]));
        ctrl.vplayer1 = patch(ctrl.vplayer1, player('player1', ctrl.titles[ctrl.flip ? 0 : 1], ctrl.players[ctrl.flip ? 0 : 1], ctrl.ratings[ctrl.flip ? 0 : 1], ctrl.model["level"]));

        if (ctrl.variant === 'makruk' || ctrl.variant === 'makpong' || ctrl.variant === 'cambodian' || ctrl.variant === 'sittuyin')
            [ctrl.vmiscInfoW, ctrl.vmiscInfoB] = updateCount(ctrl.fullfen, ctrl.vmiscInfoB, ctrl.vmiscInfoW);

        if (ctrl.variant === 'janggi')
            [ctrl.vmiscInfoW, ctrl.vmiscInfoB] = updatePoint(ctrl.fullfen, ctrl.vmiscInfoB, ctrl.vmiscInfoW);
    }
    */
}
