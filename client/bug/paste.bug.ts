export function importGameBugH(pgn: string, home: string) {
    const XHR = new XMLHttpRequest();
    const FD  = new FormData();
    FD.append("pgn", pgn)
    XHR.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);
            if (response['gameId'] !== undefined) {
                // window.location.assign(model["home"] + '/analysis/' + response['gameId']);
                window.location.assign(home + '/' + response['gameId']);
            } else if (response['error'] !== undefined) {
                alert(response['error']);
            }
        }
    };

    XHR.open("POST", "/import_bpgn", true);
    XHR.send(FD);
}
