//Javascript bughouse double viewer by Fermy
// modifyied by SKA_cz, Wir,
// last forked by bmacho

// Feel free to use/copy/modify/distribute

// by SKAcz & Wir 2015
//New201801 // V.0003 by SKAcz 201801 Repaired bug in orig Fermy code that was not possible take pawn e.p. when checked king
// V.0005 by SKAcz, Alamar 202001 Found and repaired big bug that illegal moves wasnt be able played cos bad king pos square was checked. In undocastle fixed.

// changelog:

// bmacho:

//	 higlights rewritten, and now they work with every move
//	 new debug window
//	 solved bug that saved the wrong FEN
//	 renamed the "next move" into "variations
//	 removed some buttons, clarified the X button
//	 notes are editable and saveable
//	 prettified,


// SKA
//202104 repair to load also from wild start positions defined by BFEN 2021 SKAcz

//202103 generateRTFTextPosition, RTF double position using bughousechess font

//202011 BPGNImportRepair1 v001 converting from Chess.com (@d4 into P@d4, {[%clk 0:02:59.9]} into {179.9} )

// 2015.03 Load BPGN from disk file, create download link allowing save as text BPGN to disk

// 2015.03 piece.toLowerCase() for valid move fast patch now promoted pawn checking also

// 2015.03.04 by SKAcz
//    FromGameN(bpgntext,ord) ok now
//    Interface for connecting to chat etc
//    Board background,color HTML5, Pref allowing change pieces graphic (gif1 .. gif5)
//    DisabledInput to not focusing and moving chessboard on smartphones and tablets by opening keyboard but holding screen to play or replay
//    Last move square highligted, repaired enpassant move
//    DragDrop and click click on any device pc,even android where no mousedown


// 1.1.2010 modified by SKAcz:
//  added BFEN into save game text, repaired stuff - now added into generated BFEN

// 2003 modified by SKAcz:
//   trying Atomic variant support: indevelop now

// 9.2.2002 Hy version 1.1 Ska:
// Fixed bug when undomove : see function changeturn(step1)

// 2001-04-21 v1.01 Fermy


var viewerversion = '2021-05-06';

function log(...args) {
	// if there is a debugInfo element, it logs there,
	// otherwise ddebugs into the console.log

	if(document.getElementById("debugInfo")){
		let outstring = ''
		for (const arg of args){
			outstring += JSON.stringify(arg) + " "
		}
		document.getElementById("debugInfo").innerHTML += "\n" + outstring
	} else {
		console.log(...args)
	}
}

function saveNote(game_name_string) {
	// saves the note to the current positions cNote

	// saveNote is a global function, so we pass the game name to it in a string
	let game = eval(game_name_string)
	let v = eval('window.document.' + game_name_string) // textarea doesnt have an id, it only has a name, so we must refer it with DOM objects
	game.BPGN[game.currentmove].cNote = v.comment.value// the textarea is called "comment"
}


var ClientLastMadeMove = "00X"; //here will be 10A , 5a, 17B etc.
var BroadscastMove = false;
this.eventedmousedown = false;


function interfaceLogDebug(text) {
	document.getElementById('clientdebug').innerHTML += text;
}

function interfaceOutMove(movefromHyViewer) {

	//chatsendmove is somewhere in page outside viewer
	document.getElementById('clientdebug').innerHTML += ' OutMyNewMove:' + movefromHyViewer + ',';
	chatsendmove(movefromHyViewer);
	ClientLastMadeMove = movefromHyViewer.substring(0, movefromHyViewer.indexOf('.'));

}

function interfaceInUpdateClock(viewer, timeaw, timeab, timebw, timebb) {
	var v = eval(viewer);
	v.a.wclock = Math.floor(timeaw / 1000);
	v.a.bclock = Math.floor(timeab / 1000);
	v.b.wclock = Math.floor(timebw / 1000);
	v.b.bclock = Math.floor(timebb / 1000);

	var formm = eval('window.document.' + viewer);
	if (v.a.flip == 1) {
		formm.upclocka.value = totime(v.a.wclock);
		formm.dnclocka.value = totime(v.a.bclock);
	} else {
		formm.upclocka.value = totime(v.a.bclock);
		formm.dnclocka.value = totime(v.a.wclock);
	}

	if (v.b.flip == 1) {
		formm.upclockb.value = totime(v.b.wclock);
		formm.dnclockb.value = totime(v.b.bclock);
	} else {
		formm.upclockb.value = totime(v.b.bclock);
		formm.dnclockb.value = totime(v.b.wclock);
	}

	document.getElementById('clientdebug').innerHTML += ' TimesF:' + v.a.wclock + ',' + v.a.bclock + ',' + v.b.wclock + ',' + v.b.bclock + ' ';
	//document.getElementById('clientdebug').innerHTML+='a.ExistsLegalMove(w):'+v.a.ExistsLegalMove('w'); //brx
}

function interfaceInUpdateClockAdd(viewer, timeaw, timeab, timebw, timebb) {
	var v = eval(viewer);
	v.a.wclock -= timeaw;
	v.a.bclock -= timeab;
	v.b.wclock -= timebw;
	v.b.bclock -= timebb;

	var formm = eval('window.document.' + viewer);
	if (v.a.flip == 1) {
		formm.upclocka.value = totime(v.a.wclock);
		formm.dnclocka.value = totime(v.a.bclock);
	} else {
		formm.upclocka.value = totime(v.a.bclock);
		formm.dnclocka.value = totime(v.a.wclock);
	}

	if (v.b.flip == 1) {
		formm.upclockb.value = totime(v.b.wclock);
		formm.dnclockb.value = totime(v.b.bclock);
	} else {
		formm.upclockb.value = totime(v.b.bclock);
		formm.dnclockb.value = totime(v.b.wclock);
	}
}


function interfaceInUpdatePlayer(viewer, player, playernick) {
	var v = eval(viewer);
	if (player == 'A') v.whitea = playernick
	else if (player == 'a') v.blacka = playernick
	else if (player == 'B') v.whiteb = playernick
	else if (player == 'b') v.blackb = playernick

	var formm = eval('window.document.' + viewer);
	if (v.a.flip == 1) {
		formm.upa.value = v.whitea;
		formm.dna.value = v.blacka;
	} else {
		formm.upa.value = v.blacka;
		formm.dna.value = v.whitea;
	}

	if (v.b.flip == 1) {
		formm.upb.value = v.whiteb;
		formm.dnb.value = v.blackb;
	} else {
		formm.upb.value = v.blackb;
		formm.dnb.value = v.whiteb;
	}

	document.getElementById('clientdebug').innerHTML += ' Players:' + v.whitea + ',' + v.blacka + ',' + v.whiteb + ',' + v.blackb + ' ';
}

function interfaceSetTC(viewer, time, delay) {
	//document.getElementById('clientdebug').innerHTML+=' setTC,';
}



function interfaceInEndGame() {
	//reset all
	ClientLastMadeMove = "00X";

	//unhighlight all squares
	for (ind = 0; ind <= 63; ind++) {
		sqHighlight('a', ind, false);
		sqHighlight('b', ind, false);
	}
}



function interfaceInMove(movetoHyViewer) {
	var board;

	if (ClientLastMadeMove == movetoHyViewer.substring(0, movetoHyViewer.indexOf('.'))) { // We already made move on our client board
		document.getElementById('clientdebug').innerHTML += "InRefusedMove:" + movetoHyViewer + "[" + ClientLastMadeMove + ' vs ' + movetoHyViewer.substring(0, movetoHyViewer.indexOf('.')) + "]" + ",";
		return;
	}
	document.getElementById('clientdebug').innerHTML += " InMove:" + movetoHyViewer + ',';

	//if we dont ,lets make it, but not send to others
	//better should be done by parameters than switch global variables
	BroadscastMove = false;
	if (movetoHyViewer.indexOf('.') >= 2) {
		board = movetoHyViewer.substring(movetoHyViewer.indexOf('.') - 1, movetoHyViewer.indexOf('.')).toLowerCase();
		assexecmove(movetoHyViewer, board, 'v1');
	}
	BroadscastMove = true;

}

function interfacePtell(txtmsg) {
	socket.emit('sendchat', txtmsg);
}


function Highlight (...indices) {
	// saves highlighted squares
	// handles flips
	// attached to the boards (a and b)

	let brdId = this.boardname
	let flip = this.flip

	this.unHighlightAll()
	this.highlightedSquares = []

	for (let ind of indices) {
		this.highlightedSquares.push(ind)

		ind = (flip) ? (63-ind) : (ind)
		sqHighlight(brdId, ind, true )
	}
}

function sqHighlight(bd, ind, highlight) {
	// highlights or unhighlights a square
	// don't call it direct, use the Highlight function
	//Wir: highlight or unhighlight a square; bd = board, ind = square index, highlight true=highlight, false=unhighlight
	var sqId = 'tdsquare' + bd + String(ind)
	var lobj = document.getElementById(sqId).style.backgroundImage

	if ( highlight ) {
		lobj = lobj.replace('tr.gif', 'fr.gif')
	} else {
		lobj = lobj.replace('fr.gif', 'tr.gif')
	}

	document.getElementById(sqId).style.backgroundImage = lobj
}

function unHighlightAll() {

	let brdId = this.boardname

	for (ind = 0; ind <= 63; ind++) {
		sqHighlight(brdId, ind, false )
	}

	this.highlightedSquares = []
}




function debug() {
	var tmp = '<form name="debug"><p><textarea name="shit" value="" rows="5" cols="70"></textarea></p></form>';
	document.writeln(tmp);
}

function Init() {
	//debug();
	//Defaults that one may want to change.
	DEFAULT_BSQ_COL = "#808080"; //'#A28964';
	DEFAULT_WSQ_COL = "#E4E4E4"; //'#DDC7AC'; '#EEC8B0';
	BPGN_LINE_SIZE = 79;
	RDO = '[';
	RDC = ']'; /* opening and closing delimiters that embrace ratings of players in viewer display */
	DROPBAR = new Array("br", "bq", "bb", "bn", "bp", "wp", "wb", "wn", "wr", "wq");
	PLAY_DELAY = 100;
	MAX_NEXT = 20;
	NEXT_WIDTH = 14;


	BPGN_ROOT = 0; // BPGN root node index
	BPGN_BOARD_A1 = 'A'; // BPGN board 'A'
	BPGN_BOARD_A2 = 'a'; // BPGN board 'a'
	BPGN_BOARD_B1 = 'B'; // BPGN board 'B'
	BPGN_BOARD_B2 = 'b'; // BPGN board 'b'

	BPGN_BOARD_ASTR1 = "A"; // BPGN board 'A' string
	BPGN_BOARD_ASTR2 = "a"; // BPGN board 'a' string
	BPGN_BOARD_BSTR1 = "B"; // BPGN board 'B' string
	BPGN_BOARD_BSTR2 = "b"; // BPGN board 'b' string

	BPGN_MOVE_DSTR = "."; // BPGN move dot string
	BPGN_ANNOTATION = 'A'; // BPGN annotation symbol
	BPGN_NOTE = 'C'; // BPGN note symbol
	BPGN_LAG = 'L'; // BPGN lag symbol


	BPGN_OMITED_TIME = -5;

	BPGN_VIEWER_DIR = '';
	BPGN_NORMAL = 0;
	BPGN_STRING = 1;
	BPGN_INTEGER = 2;
	BPGN_COMMENT1 = 3;
	BPGN_COMMENT2 = 4;
	BPGN_NAG = 5;
	BPGN_SYMBOL = 6;

	BPGN_WHITE_WINS = "1-0";
	BPGN_BLACK_WINS = "0-1";
	BPGN_DRAW = "1/2-1/2";
	BPGN_UNKNOWN = "*";
	BPGN_WHITE_WINS = "1-0"; // BPGN white wins string
	BPGN_BLACK_WINS = "0-1"; // BPGN black wins string
	BPGN_DRAW = "1/2-1/2"; // BPGN draw string
	BPGN_UNKNOWN = "*"; // BPGN unknown result string

	BPGN_EVENT = "Event"; // BPGN event tag string
	BPGN_SITE = "Site"; // BPGN site tag string
	BPGN_DATE = "Date"; // BPGN date tag string
	BPGN_WHITEA = "WhiteA"; // BPGN whitea tag string
	BPGN_BLACKA = "BlackA"; // BPGN blacka tag string
	BPGN_WHITEB = "WhiteB"; // BPGN whiteb tag string
	BPGN_BLACKB = "BlackB"; // BPGN blackb tag string
	BPGN_WHITEAELO = "WhiteAElo"; // BPGN whiteaelo tag string
	BPGN_BLACKAELO = "BlackAElo"; // BPGN blackaelo tag string
	BPGN_WHITEBELO = "WhiteBElo"; // BPGN whitebelo tag string
	BPGN_BLACKBELO = "BlackBElo"; // BPGN blackbelo tag string
	BPGN_TIMECTRL = "TimeControl"; // BPGN timecontrol tag string
	BPGN_RESULT = "Result"; // BPGN result tag string

	DEFAULT_EVENT = "Bughouse study";
	DEFAULT_SITE = "https://bmacho.github.io/bughouse-viewer/view.html";
	DEFAULT_DATE = "????.??.??";
	DEFAULT_WHITEA = "WhiteA";
	DEFAULT_BLACKA = "BlackA";
	DEFAULT_WHITEB = "WhiteB";
	DEFAULT_BLACKB = "BlackB";
	DEFAULT_TIME = "180";
	DEFAULT_INC = "0";
	DEFAULT_RATING = "++++";
	DEFAULT_REASON = "{*}";
	DEFAULT_RESULT = "*";
	TAB_ASCII_NUM = '\t';
	CR_ASCII_NUM = '\r';
	LF_ASCII_NUM = '\n';

	ERROR_NONE = 0 // No error
	ERROR_INCOMPLETE = 1 // Incomplete BPGN file
	ERROR_MISSING_NOTE = 2 // Missing note or annotation
	ERROR_INVALID_NOTE = 3 // Invalid note or annotation
	ERROR_INVALID_ANNOTATION = 4 // Invalid annotation
	ERROR_MISSING_BRACKET = 5 // Missing '}'
	ERROR_MISSING_MOVE_NUMBER = 6 // Missing move number
	ERROR_MISSING_BOARD_SYMBOL = 7 // Missing board symbol
	ERROR_INVALID_BOARD_SYMBOL = 8 // Invalid board symbol
	ERROR_INVALID_MOVE_NUMBER = 9 // Invalid move number
	ERROR_MISSING_MOVE_DOT = 10 // Missing '.'
	ERROR_INVALID_MOVE_DOT = 11 // Missing '.'
	ERROR_MISSING_MOVE = 12 // Missing move
	ERROR_INVALID_MOVE = 13 // Invalid move
	ERROR_MISSING_TIME = 14 // Missing time
	ERROR_INVALID_TIME = 15 // Invalid time
	ERROR_MISSING_RESULT = 16 // Missing result
	ERROR_INVALID_RESULT = 17 // Invalid game result
	ERROR_DOUBLE_NOTE = 18 // Double note
	ERROR_DOUBLE_ANNOTATION = 19 // Double annotation
	ERROR_MISSING_END_VARIATION = 20 // Missing ')'


	NUMB = /[0-9]/;
	SYMB = /\w|[+#=:\-@]/;
	LETT = /[a-zA-z]/;
	RELOAD_BPGN = ''; //global variable containing reference to the loadbpgn window.
	RELOAD_BPGNVIEWER = ''; //global variable containing the name of the viewer that called loadbpgn window.
	BPGN_FILE_NAME = new Array(); //global array containing names of bpgn files to read in readfile.shtml.
	BPGN_FILE_VIEWER = new Array(); //global array containing names of the viewers that requested to read files.
	READ_INTERVAL = false; //timer used to read files;
	READ_WINDOW = false;
	SAVE_STR = '';
	IE = ((navigator.appName.toLowerCase()) == "microsoft internet explorer") ? true : false;



	BTELL1 = 'Sit';
	BTELL2 = 'Go';
	BTELL3 = '+++';
	BTELL4 = '---';
	BTELL5 = ' +Q ';
	BTELL6 = ' -Q ';
	BTELL7 = ' +R ';
	BTELL8 = ' -R ';
	BTELL9 = ' +N ';
	BTELL10 = ' -N ';
	BTELL11 = ' +B ';
	BTELL12 = ' -B ';
	BTELL13 = ' +P ';
	BTELL14 = ' -P ';
	BTELL15 = 'OK now';
	BTELL16 = 'Nevermind';
	BTELL17 = 'Hard';
	BTELL18 = 'Coming';
	BTELL19 = 'Maybe';
	BTELL20 = 'I Sit';
	BTELL21 = 'I See';
	BTELL22 = 'What now?';
	BTELL23 = 'I dead';
	BTELL24 = 'Opp dead';
	BTELL25 = 'We Up';
	BTELL26 = 'We down';
	BTELL27 = 'You attack';
	BTELL28 = 'Survive';
	BTELL29 = 'Keep press';
	BTELL30 = 'Keep Check';
	BTELL31 = ' ';
	BTELL32 = ' ';
	BTELL33 = '';
	BTELL34 = '';
	BTELL35 = '';
	BTELL36 = '';
	BTELL37 = '';
	BTELL38 = '';
	BTELL39 = '';
	BTELL40 = '';
	BTELL41 = '';
	BTELL42 = '';
	BTELL43 = '';
	BTELL44 = '';
	BTELL45 = '';
	BTELL46 = '';
	BTELL47 = '';
	BTELL48 = '';
	BTELL49 = '';
	BTELL50 = '';
	BTELL51 = '';
	BTELL52 = '';
	BTELL53 = '';
	BTELL54 = '';
	BTELL55 = '';
	BTELL56 = '';
	BTELL57 = '';
	BTELL58 = '';
	BTELL59 = '';
	BTELL60 = '';




}

function readfile(viewer, file) {
	BPGN_FILE_NAME[BPGN_FILE_NAME.length] = file;
	BPGN_FILE_VIEWER[BPGN_FILE_VIEWER.length] = viewer;
	if (!READ_INTERVAL) {
		READ_INTERVAL = setInterval("loadfile();", 100);
	};
};

function loadfile() {
	var i;
	var n = BPGN_FILE_NAME.length;
	if (n == 0) {
		clearInterval(READ_INTERVAL);
		READ_INTERVAL = false;
		return;
	};
	var tmp = BPGN_FILE_NAME[0];
	for (i = 0; i < n - 1; i++) BPGN_FILE_NAME[i] = BPGN_FILE_NAME[i + 1];
	BPGN_FILE_NAME[n - 1] = false;
	BPGN_FILE_NAME.length = n - 1;
	if ((!READ_WINDOW) || (READ_WINDOW.closed)) {
		READ_WINDOW = window.open(BPGN_VIEWER_DIR + 'readfile.shtml?' + tmp, 'bpgnfilereadwindow', 'width=300,height=300');
	};
	READ_INTERVAL = setInterval("loadfile();", 100);
}

function setvar(text) {
	var i;
	var n = BPGN_FILE_VIEWER.length;
	var viewer = BPGN_FILE_VIEWER[0];
	for (i = 0; i < n - 1; i++) BPGN_FILE_VIEWER[i] = BPGN_FILE_VIEWER[i - 1];
	BPGN_FILE_VIEWER[n - 1] = false;
	BPGN_FILE_VIEWER.length = n - 1;
	var v = eval(viewer);
	v.reloadgame(text, "", "");
	READ_WINDOW.close();
}


function generatesavehtml() {
	var tmp;
	tmp = '<html><head><title>Save BPGN</title><link href="fonts/TestWebFontsForBughouseChess2021.css" rel="stylesheet" type="text/css"></head>'
	tmp += '<body bgcolor="#FFFFFF" text="#000000">';
	tmp += '<p align="center"><font color="#C0C0C0" size="6">Save BPGN</font></p>';
	tmp += '<form name="saveform">';
	tmp += '<p><textarea id="bpgntextarea" name="bpgn" rows="10" cols="80"></textarea></p>';
	tmp += '<p>' + GenerateSaveTextFile() + '</p>';
	tmp += '<p><strong>BFEN A:</strong><input type="text" size="70"';
	tmp += ' name="bfena"></p>';
	tmp += '<p><strong>BFEN B:</strong><input type="text" size="70"';
	tmp += ' name="bfenb"></p>';
	tmp += ' <p>Here is BPGN text for the game and BFEN for the current';
	tmp += ' position. Cut&amp;Paste them into your favorite text editor';
	tmp += ' and save. Or download and save it on disk. <br/>Click &quot;Close&quot; button to close this';
	tmp += ' window. </p>';
	tmp += '<p><strong>RTF Text of (double) position:</strong></p>';
	tmp += '<p><textarea class="bughousechess24" id="textareaRTFtextposition" name="RTFtextposition" rows="14" cols="30"></textarea></p>';
	//tmp+='<p class="bughousechess24">&nbsp;&nbsp;&nbsp;,t,m, , ,  , , , , , ,<br/>>!""""""""#!""""""""# <br/>&nbsp;$t+ +lVg+%$ Kq+ B R% <br/>&nbsp;$OoOvWoPy%$Pn+b+pPp% <br/>&nbsp;$ +m+oOm+%$ +nOp+ +% <br/>&nbsp;$+ +o+ + %$R Op+ + % <br/>&nbsp;$ + P + +%$oW O V +% <br/>&nbsp;$P N PpP %$+ + +m+ % <br/>&nbsp;$ Pp+ +bP%$ Oo+ OoO% <br/>&nbsp;$R BqK + %$T +l+ +t% <br/>&nbsp;/(((((((()/(((((((()<<br/>&nbsp;  , , , ,p,  , , , ,v<br/></p>';
	tmp += ' <p><input type="button" name="confirm" value="Close"';
	tmp += ' onclick="window.close();"></p>';
	tmp += '</form></body></html>';
	return tmp;
}


function GenerateDownloadLink(fiddownloadlink, contents, file_name, mime_type) {
	var a = document.getElementById(fiddownloadlink);
	mime_type = mime_type || 'application/octet-stream'; // text/html, image/png, et c
	if (file_name) a.setAttribute('download', file_name);
	a.href = 'data:' + mime_type + ';base64,' + btoa(contents || '');
	a.style.display = "inline";
}

function ActDateYYYYMMDDHHMMSS() {
	var d = new Date();
	var s = "";
	s += d.getFullYear() + ("0" + d.getMonth()).slice(-2) + ("0" + d.getDate()).slice(-2) + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + ("0" + d.getSeconds()).slice(-2);
	return s;
}

function GenerateSaveTextFile() {
	var tmp = "";

	tmp += "<SCRIPT>";
	tmp += "function GenerateDownloadLink(fiddownloadlink, contents, file_name, mime_type)";
	tmp += "{";
	tmp += "  var a = document.getElementById(fiddownloadlink);";
	tmp += "  mime_type = mime_type || 'application/octet-stream';";
	tmp += "  if (file_name) a.setAttribute('download', file_name);";
	tmp += "  a.href = 'data:'+ mime_type +';base64,'+ btoa(contents || '');";
	tmp += '  a.style.display="inline";';
	tmp += "}";
	tmp += "</SCRIPT>";

	tmp += '<input type="button" value="Generate download link of BPGN"  onclick="GenerateDownloadLink(\'BPGNdownloadlink\',document.getElementById(\'bpgntextarea\').value, \'DCB' + ActDateYYYYMMDDHHMMSS() + '.bpgn\',\'text/plain\' )"/>';
	tmp += ' <a id="BPGNdownloadlink" style="display:none"  download="myfile.bpgn" href="data:text/plain,nothing">Save BPGN File</a>';

	return tmp;
}



function generateloadhtml(viewer) {
	var tmp;
	tmp = '<html><head><title>Load BPGN</title></head>'
	tmp += '<body bgcolor="#FFFFFF" text="#000000">';
	tmp += '<p align="center"><font color="#C0C0C0" size="6">Load Game</font></p>';
	tmp += '<p>Here you may load a bughouse(holandany)/crazyhouse/chess game into the viewer. Also you may setup initial position! Press "Load" button when you are done. You may leave blank any field</p>';
	tmp += ' <p>Paste (or read from disk) moves in <strong>BPGN</strong> format in the box below. You may paste the whole bgpn file (with tags) here with multiple games. </p>';

	tmp += '<form name="loadform">';
	tmp += GenerateLoadTextFile();
	tmp += '<p><textarea id="bpgntextarea" name="bpgn" rows="5" cols="70"></textarea></p>';
	tmp += '<p>Game number (If more than 1 game in bpgn)</p>';
	tmp += '<p><input name="bpgnord" type="number" value="1"></p>';
	tmp += '<p>If you want to setup position different from the initial, paste it (or type in) below. Position must be in bfen format.</p>';
	tmp += '<p><strong>BFEN A:</strong><input type="text" size="70"';
	tmp += ' name="bfena"></p>';
	tmp += '<p><strong>BFEN B:</strong><input type="text" size="70"';
	tmp += ' name="bfenb"></p>';
	tmp += '<p><input type="button" name="confirm" value="Load" ';
	tmp += 'onClick="opener.assreloadgameN(' + "'" + viewer + "'" + ',document.loadform.bpgn.value,document.loadform.bpgnord.value,document.loadform.bfena.value,document.loadform.bfenb.value);">';
	tmp += ' <input type="button" name="confirm" value="Close"';
	tmp += ' onclick="window.close();"></p>';
	tmp += '</form></body></html>';
	return tmp;
}


function ReadTxtFile(fidinputfile, fidoutput)
//reqires
//  <input type="file" id="inputfiletxt" name="inputfiletxt" />
//  and some output like <textarea id="outtextarea">
//then called as ReadTxtFile(inputfiletxt,outtextarea)
// example <input type="button" value="LoadTXTFile" onclick="ReadTxtFile('inputfiletxt','outtextarea');" />
{
	var files = document.getElementById(fidinputfile).files;
	var file = files[0];
	var reader = new FileReader();
	//var blob = file.slice(0,20);
	reader.onload = function(event) {
		document.getElementById(fidoutput).textContent = event.target.result;
	};
	//reader.readAsBinaryString(blob);
	reader.readAsBinaryString(file);
}

function GenerateLoadTextFile() {
	var tmp = "";

	tmp += "<SCRIPT>";
	tmp += "function ReadTxtFile(fidinputfile,fidoutput)";
	tmp += "{	var files = document.getElementById(fidinputfile).files;";
	tmp += "	var file = files[0];";
	tmp += "	var reader = new FileReader();";
	tmp += "		reader.onload = function (event) ";
	tmp += "		{  document.getElementById(fidoutput).textContent = event.target.result;};";
	tmp += "	reader.readAsBinaryString(file);";
	tmp += "}";
	tmp += "</SCRIPT>";

	tmp += '<p><input type="file" id="inbpgnfile" name="inbpgnfile" />';
	tmp += '<input type="button" value="Read BPGN File" onclick="ReadTxtFile(\'inbpgnfile\',\'bpgntextarea\');" /></p>';
	return tmp;
}




function killleadspace(str) {
	var i;
	str = ' ' + str;
	for (i = 0; str.charAt(i) == " "; i++);
	return str.substr(i);
}

function killtailspace(str) {
	var i;
	for (i = str.length - 1; str.charAt(i) == " "; i--);
	return str.substring(0, i + 1);
}

function FromGameN(bpgntext, gameord) {
	var pos, poslast;
	var ord;

	poslast = bpgntext.lastIndexOf("[Event");
	if (poslast < 0) {
		return '';
	} else {
		pos = bpgntext.indexOf("[Event");
		ord = 1;
		while (pos < poslast && ord < gameord) {
			pos = bpgntext.indexOf("[Event", pos + 6);
			ord++;
		}
		if (ord == gameord) {
			if (pos < poslast) {
				poslast = bpgntext.indexOf("[Event", pos + 6);
				return bpgntext.substring(pos, poslast);
			} else //pos == poslast
			{
				return bpgntext.substring(pos);
			}
		} else
			return '';
	}
}


function isempty(square) {
	var st = this.pos[square];
	return (st.length == 0) ? true : false;
}

function bugmove() {
	this.board = ''; //"a" or "b"
	this.side = ''; //'w' or 'b'
	this.frompiece = ''; //piece that moves
	this.fromsquare = -1; //starting square of the frompiece
	this.tosquare = -1; // destination square of the frompiece
	this.topiece = ''; // captured piece
	this.backupenpassant = ''; //
	this.backupshortcastle = ''; //
	this.backuplongcastle = '';
	this.backuptime = 0;
	this.buckuptime1 = 0;
}



function getdest(move) {
	var cfile = 'abcdefgh';
	var crank = '12345678';
	var i;
	var rank = '';
	var file = '';
	var tmp;
	for (i = move.length - 1; i > 0; i--) {
		if (crank.indexOf(move.charAt(i)) > -1) {
			rank = move.charAt(i);
			break;
		}
	};
	file = move.charAt(i - 1);
	tmp = file.toLowerCase();
	var res = file + rank;
	return ((cfile.indexOf(tmp) < 0) || (rank = '')) ? '' : res;
}

function whosmove(turn) {
	return (turn == turn.toLowerCase()) ? 'b' : 'w'; /*check who's to move*/
}


function incheck(whomove, dest) //New201801
{
	var i;
	var piece;
	op = othercolor(whomove);
	for (i = 0; i < 64; i++) {
		if (this.pos[i].charAt(0) != op) {
			continue;
		};
		piece = this.pos[i].charAt(1);
		if (this.legalmove(piece.toLowerCase(), op, i, dest, 1)) { //alert('checked '+whomove+' '+piece.toLowerCase() +' from '+i+' to '+dest)
			return true;
		}; //legal move by P not checking!! right should be legal taking move
		//piece.toLowerCase()  is just emergency 1case patch - should be solved where Q or N instead of q or n is et on board when promoted pawn
	};
	return false;
}

function inchecks(whomove, dest) //New201801
{
	var i;
	var piece;
	var numberofchecks = 0;
	op = othercolor(whomove);
	for (i = 0; i < 64; i++) {
		if (this.pos[i].charAt(0) != op) {
			continue;
		};
		piece = this.pos[i].charAt(1);
		if (this.legalmove(piece.toLowerCase(), op, i, dest, 1)) {
			numberofchecks++;
			//alert(numberofchecks+'. checked '+whomove+' by '+piece.toLowerCase() +' from '+i+' to '+dest)
			if (numberofchecks == 2) return 2;
		}; //legal move by P not checking!! right should be legal taking move
		//piece.toLowerCase()  is just emergency 1case patch - should be solved where Q or N instead of q or n is et on board when promoted pawn
	};
	return numberofchecks;
}


function moveinboard(sqsrc, sqdest) { //return if supposed move is not out of board
	// ie if like h8h9 etc. return false
	// simply checking if vector is not pointing out of board

	// notworking indev brx

	var sfile = getfile(sqsrc);
	var srank = getrank(sqsrc); //rank return 1..8
	var dfile = getfile(sqdest);
	var drank = getrank(sqdest); //file return 0..7
	var vrank = drank - srank; //rank vector
	var vfile = dfile - sfile; //file vector

	out = (srank == 1 && vrank < 0) || (srank == 8 && vrank > 0) || (sfile == 0 && vfile < 0) || (sfile == 7 && vfile > 0);
	out = out || (srank + vrank > 8) || (srank + vrank < 1) || (sfile + vfile > 7) || (sfile + vfile < 0);
	return (!out);
}

function moveInBoardKing(sqsrc, sqdest) { //return if supposed kings move is not out of board
	// ie if like h8h9 etc. return false

	if (sqdest < 0 || sqdest > 63) return false;

	var sfile = getfile(sqsrc);
	var srank = getrank(sqsrc); //rank return 1..8
	var dfile = getfile(sqdest);
	var drank = getrank(sqdest); //file return 0..7
	var vrank = drank - srank; //rank vector
	var vfile = dfile - sfile; //file vector

	out = (Math.abs(dfile - sfile) > 1 || Math.abs(drank - srank) > 1);

	return (!out);
}


function squareTextToIndex(sqtext) { //in 'a8' out 0  'a' is asc 97 '1' is 49

	var sqid = (sqtext.toLowerCase().charCodeAt(0) - 97) + 8 * (8 - (sqtext.toLowerCase().charCodeAt(1) - 48));

	return sqid;
}

function squareIndexToText(sqindex) { //in 0..63  out 'a8'..'h1' 'a' is asc 97 '1' is 49
	var sqtext = String.fromCharCode(97 + getfile(sqindex)) + getrank(sqindex);
	return sqtext;
}


function enpassantvalid(dest) {
	return (dest == this.enpasssq) ? true : false;
}

function legalmove(piece, whomove, src, dest, mode) //New201801
{
	var srcp = this.pos[src];
	srcp = srcp.toLowerCase();
	if ((mode != 1) && (srcp != (whomove + piece))) {
		return false;
	};
	var sfile = getfile(src);
	var srank = getrank(src);
	var dfile = getfile(dest);
	var drank = getrank(dest);
	var dir;
	var i;
	if (piece == 'p') {
		dir = (whomove == 'w') ? 1 : -1;
		if ((dfile == sfile) && (srank + dir == drank) && (this.isempty(dest))) {
			return true;
		} //noncapture one square ahead
		if ((dfile == sfile) && (whomove == 'w') && (srank == 2) && (drank == 4) && (this.isempty(dest + 8)) && (this.isempty(dest))) return true;
		if ((dfile == sfile) && (whomove == 'b') && (srank == 7) && (drank == 5) && (this.isempty(dest - 8)) && (this.isempty(dest))) return true; //noncapture 2 sq's ahead
		if ((Math.abs(dfile - sfile) == 1) && (srank == drank - dir) && ((this.pos[dest] != '') || (this.enpassantvalid(dest)))) return true;
		/* capture. We don't check if we capture our own piece or opponents */
		return false;
	}
	if (piece == 'k') {
		if ((Math.abs(dfile - sfile) <= 1) && (Math.abs(drank - srank) <= 1) && (src != dest)) {
			return true;
		} else {
			return false
		};
	}
	if (piece == 'n' || piece == 'j') {
		piece = 'n';
		if ((Math.abs(dfile - sfile) + Math.abs(drank - srank) == 3) && (Math.abs(drank - srank) > 0) && (Math.abs(dfile - sfile) > 0)) return true;
		return false;
	}
	if (piece == 'r' || piece == 'v') {
		piece = 'r';
		if (sfile == dfile) {
			dir = (dest > src) ? 1 : -1;
			for (i = 1; i < Math.abs(drank - srank); i++) {
				if (!this.isempty(src + 8 * dir * i)) {
					return false
				};
			};
			return true;
		};
		if (srank == drank) {
			dir = (dest > src) ? 1 : -1;
			for (i = 1; i < Math.abs(dfile - sfile); i++) {
				if (!this.isempty(src + dir * i)) {
					return false
				};
			};
			return true;
		};
		return false;
	}
	if (piece == 'b' || piece == 's') {
		piece = 'b';
		if (Math.abs(dfile - sfile) != Math.abs(drank - srank)) return false;
		dirf = (sfile > dfile) ? -1 : 1;
		dirr = (srank > drank) ? 1 : -1;
		for (i = 1; i < Math.abs(drank - srank); i++) {
			if (!this.isempty(src + (8 * dirr + dirf) * i)) {
				return false
			};
		};
		return true;
	}
	if (piece == 'q' || piece == 'd') {
		piece = 'q';
		return ((this.legalmove('b', whomove, src, dest, 1)) || (this.legalmove('r', whomove, src, dest, 1)));
	}
	return false; /* should never get here */
}

function legalmovechecking(piece, whomove, src, dest, mode) //New201801
{
	var srcp = this.pos[src];
	srcp = srcp.toLowerCase();
	if ((mode != 1) && (srcp != (whomove + piece))) {
		return false;
	};
	var sfile = getfile(src);
	var srank = getrank(src);
	var dfile = getfile(dest);
	var drank = getrank(dest);
	var dir;
	var i;
	if (piece == 'p') {
		dir = (whomove == 'w') ? 1 : -1;
		//if((dfile==sfile)&&(srank+dir==drank)&&(this.isempty(dest))) {return true;} //noncapture one square ahead
		//if ((dfile==sfile)&&(whomove=='w')&&(srank==2)&&(drank==4)&&(this.isempty(dest+8))&&(this.isempty(dest))) return true;
		//if ((dfile==sfile)&&(whomove=='b')&&(srank==7)&&(drank==5)&&(this.isempty(dest-8))&&(this.isempty(dest))) return true; //noncapture 2 sq's ahead
		if ((Math.abs(dfile - sfile) == 1) && (srank == drank - dir) //&&((this.pos[dest]!='')|| (this.enpassantvalid(dest)))
		) return true;
		/* capture. We don't check if we capture our own piece or opponents */
		return false;
	}
	if (piece == 'k') {
		if ((Math.abs(dfile - sfile) <= 1) && (Math.abs(drank - srank) <= 1) && (src != dest)) {
			return true;
		} else {
			return false
		};
	}
	if (piece == 'n' || piece == 'j') {
		piece = 'n';
		if ((Math.abs(dfile - sfile) + Math.abs(drank - srank) == 3) && (Math.abs(drank - srank) > 0) && (Math.abs(dfile - sfile) > 0)) return true;
		return false;
	}
	if (piece == 'r' || piece == 'v') {
		piece = 'r';
		if (sfile == dfile) {
			dir = (dest > src) ? 1 : -1;
			for (i = 1; i < Math.abs(drank - srank); i++) {
				if (!this.isempty(src + 8 * dir * i)) {
					return false
				};
			};
			return true;
		};
		if (srank == drank) {
			dir = (dest > src) ? 1 : -1;
			for (i = 1; i < Math.abs(dfile - sfile); i++) {
				if (!this.isempty(src + dir * i)) {
					return false
				};
			};
			return true;
		};
		return false;
	}
	if (piece == 'b' || piece == 's') {
		piece = 'b';
		if (Math.abs(dfile - sfile) != Math.abs(drank - srank)) return false;
		dirf = (sfile > dfile) ? -1 : 1;
		dirr = (srank > drank) ? 1 : -1;
		for (i = 1; i < Math.abs(drank - srank); i++) {
			if (!this.isempty(src + (8 * dirr + dirf) * i)) {
				return false
			};
		};
		return true;
	}
	if (piece == 'q' || piece == 'd') {
		piece = 'q';
		return ((this.legalmove('b', whomove, src, dest, 1)) || (this.legalmove('r', whomove, src, dest, 1)));
	}
	return false; /* should never get here */
}

function getrank(ind) { //returns 1 to 8 its original Fermy  range //New201801
	var ss = ind - (ind % 8);
	return (8 - ss / 8);
}

function getfile(ind) { //returns 0..7 its original Fermy range //New201801
	return (ind % 8);
}


function findmove(piece, whomove, spec, dest) //New201801 improved
{
	var cfile = 'abcdefgh';
	var crank = '87654321'; /* strange order because index 0 corresposnds to a8 in array this.pos */
	var rmin = 0;
	var rmax = 8;
	var fmin = 0;
	var fmax = 8;
	var r;
	var f;
	var c;
	var f;
	var c2;
	var src = -1;
	var king;
	var dp;
	var sp;
	var ep;
	var eptakingsq = 0;
	var quit = false;
	piece = piece.toLowerCase();
	spec = spec.toLowerCase();
	if (spec.length != 0) {
		/* translate specifier into search restriction */
		c = spec.charAt(0);
		if (cfile.indexOf(c) >= 0) {
			fmin = cfile.indexOf(c);
			fmax = fmin + 1;
		} else {
			rmin = crank.indexOf(c);
			if (rmin >= 0) {
				rmax = rmin + 1
			} else {
				rmin = 0
			};
		};
		if (spec.length > 1) {
			c2 = spec.charAt(1);
			if (crank.indexOf(c2) >= 0) {
				rmin = crank.indexOf(c2);
				rmax = rmin + 1
			};
		}
	}
	/* now find possible move withing restrictions */
	var found = false;
	for (f = fmin; f < fmax; f++) {
		for (r = rmin; r < rmax; r++) {
			src = 8 * r + f;
			if (!this.legalmove(piece, whomove, src, dest, 0)) {
				continue;
			} else {
				king = eval('this.king' + whomove);
				dp = this.pos[dest];
				sp = this.pos[src];
				//make move trick
				this.pos[src] = '';
				this.pos[dest] = whomove + piece;
				//if its e.p. pawn move it need remove attacker from other than destination square
				// otherwise Ke4 Pe5 d7d5 now cannot e5xd6 e.p
				//  here is try to solve it
				//console.log(' piece '+piece+' this.enpasssq '+this.enpasssq+' ');
				if (piece == 'p' && dest == this.enpasssq) {
					eptakingsq = this.enpasssq + ((getrank(this.enpasssq) == 3) ? (-8) : 8);
					ep = this.pos[eptakingsq];
					this.pos[eptakingsq] = '';
					//console.log('FindMove  this.enpasssq '+this.enpasssq+' eptakingsq '+eptakingsq+' ep '+ep);
				}

				if (piece == 'k') king = dest;
				if (!this.incheck(whomove, king)) {
					found = true;
					quit = true;
				};

				this.pos[src] = sp;
				this.pos[dest] = dp;
				if (eptakingsq != 0) {
					this.pos[eptakingsq] = ep;
					eptakingsq = 0
				};
			};
			if (quit == true) break;
		};
		if (quit == true) {
			break;
		};
	}
	if (!found) return -1;
	src = 8 * r + f;
	if (src > 63) {
		return -1
	}; /* no moves found */
	if (piece == 'p') {
		/* check for promotion and enpassant*/
		if (((whomove == 'w') && (getrank(dest) == 8)) || ((whomove == 'b') && (getrank(dest) == 1))) {
			src += 100
		}; //promotion
		if ((f != getfile(dest)) && (this.isempty(dest))) {
			src += 200
		}; //enpassant
	}
	return src;
}


function promdialog(wh) {
	return (confirm('Promote to Q? \n Cancel will promote to N')) ? 'q' : 'n';
}



function getpromotion(wh, move, dest) {
	var i = move.indexOf(dest);
	var t = move.length;
	var j;
	var prompiece = 'qnrb';
	if ((i < 0) || (i > t - 3)) return this.promdialog(wh);
	for (j = i + 2; j < t; j++) {
		if (move.charAt(j) != '=') break;
	};
	var c = move.charAt(j);
	c = c.toLowerCase();
	j = prompiece.indexOf(c);
	return ((j < 0) ? this.promdialog(wh) : c);
}




function decryptmove(bd, move) { // returns bugmove object mv. If something is wrong false is returned;
	//if this is a drop move fromsquare is set to 65;
	//if this is castling fromsquare is set to o-o or o-o-o;
	// if this is En passant frompiece is set to wpx or bpx;
	//if this is promotion fromsquare is set to wpq, wpr, etc,;
	//very little error checking is done. moves better be valid
	var cfile = 'abcdefgh';
	var crank = '12345678';
	var drop = 'rnbqp';
	var cpiece = 'rnbqk';
	var mv = new bugmove();
	var piece;

	move = extractmove(move);
	mv.board = bd.turn.toLowerCase();
	whomove = whosmove(bd.turn);
	mv.side = whomove;
	move = killleadspace(killtailspace(move));

	// castle?
	var tmp = move.toLowerCase();
	if ((tmp.indexOf("o-o-o") != -1) || (move.indexOf("0-0-0") != -1)) {
		mv.fromsquare = 'o-o-o';
		mv.frompiece = whomove + 'k';
		return mv;
	}
	if ((tmp.indexOf("o-o") != -1) || (move.indexOf("0-0") != -1)) {
		mv.fromsquare = 'o-o';
		mv.frompiece = whomove + 'k';
		return mv;
	}

	var dest = getdest(move); // dest is a destination square, e.g. 'c7')
	if (dest == '') return false;
	var des = sqtoind(dest);
	if ((bd.pos[des].charAt(0) == whomove) && (this.rule == 'international')) return false;
	mv.tosquare = des;
	mv.topiece = bd.pos[des];
	// drop move?
	if (move.length < 2) {
		return false;
	}
	if (move.charAt(1) == '@') {
		if ((move.length < 4) || (bd.pos[mv.tosquare] != '')) return false;
		mv.fromsquare = 65;
		piece = move.charAt(0);
		piece = piece.toLowerCase();
		if (drop.indexOf(piece) < 0) return false;
		if ((piece == 'p') && ((dest.charAt(1) == 8) || (dest.charAt(1) == 1))) return false;
		mv.frompiece = whomove + piece;
		return mv;
	};

	// find source square specifier. for ex, in move Raxd1 modifier is 'a'
	var endspec = move.indexOf(dest) - 1;
	if ((move.charAt(endspec) == 'x') || (move.charAt(endspec) == 'X')) endspec--;
	var srcspec = move.substring(1, endspec + 1);

	// is it a pawn move?
	piece = move.charAt(0);
	tmp = srcspec;
	if (cfile.indexOf(piece) >= 0) {
		if (srcspec.length < 2) {
			srcspec = piece + srcspec
		};
		var res = bd.findmove('p', whomove, srcspec, des);
		if (res >= 0) // yes this is pawn move
		{
			mv.fromsquare = res % 100;
			mv.frompiece = (res > 199) ? whomove + 'px' : whomove + 'p'; //check if the move is enpassant
			if ((res < 200) && (res > 99)) {
				mv.frompiece = whomove + 'p' + this.getpromotion(whomove, move, dest);
			};
			return mv;
		};
		// we are here if it's bishop move, but i won't use this.
	};
	srcspec = tmp;
	res = bd.findmove(piece, whomove, srcspec, des);
	if (res < 0) return false; // oh shit, illegal move
	mv.fromsquare = res;
	mv.frompiece = bd.pos[res];
	return mv;
}



function preload(path) {
	var gifs = new Array();
	for (var i = 0; i < 16; i++)
		gifs[i] = new Image();
	gifs[0].src = path + 'wkd.gif';
	gifs[1].src = path + 'bkd.gif';
	gifs[2].src = path + "wbd.gif";
	gifs[3].src = path + "wnd.gif";
	gifs[4].src = path + "wrd.gif";
	gifs[5].src = path + "wqd.gif";
	gifs[6].src = path + "wpd.gif";
	gifs[7].src = path + "bnd.gif";
	gifs[8].src = path + "bbd.gif";
	gifs[9].src = path + "brd.gif";
	gifs[10].src = path + "bqd.gif";
	gifs[11].src = path + "bpd.gif";
	gifs[12].src = path + "d.gif";
	gifs[13].src = path + "mv.gif";
	gifs[14].src = path + "b.gif";
	gifs[15].src = path + "w.gif";
}

function Init1(path, filebg, wsq, bsq) {
	var gifpath = new Array();
	gifpath["wbd"] = path + "wbd.gif";
	gifpath["wnd"] = path + "wnd.gif";
	gifpath["wrd"] = path + "wrd.gif";
	gifpath["wqd"] = path + "wqd.gif";
	gifpath["wpd"] = path + "wpd.gif";
	gifpath["bnd"] = path + "bnd.gif";
	gifpath["bbd"] = path + "bbd.gif";
	gifpath["brd"] = path + "brd.gif";
	gifpath["bqd"] = path + "bqd.gif";
	gifpath["bpd"] = path + "bpd.gif";
	gifpath["wkd"] = path + "wkd.gif";
	gifpath["bkd"] = path + "bkd.gif";
	gifpath["d"] = path + "d.gif";
	gifpath["mv"] = path + "mv.gif";
	gifpath["nmv"] = path + "d.gif";
	gifpath["fr"] = path + "fr.gif";
	gifpath["tr"] = path + "tr.gif";
	if (filebg) {
		gifpath['w'] = path + "w.gif";
		gifpath['b'] = path + "b.gif";
	} else {
		gifpath['w'] = wsq;
		gifpath['b'] = bsq;
	};
	return gifpath;
}


function fixnumber(the_number) //adds leading zero to a one-digit number
{
	if (the_number < 10) {
		the_number = "0" + the_number;
	}
	return the_number;
}

function indelim(str, pos, del1, del2) /* returns a piece of a string str that sits between first occurences of delimiters del1 and del2 after position pos in str */ {
	var p1 = str.indexOf(del1, pos);
	var p2 = str.indexOf(del2, p1 + 1);
	var p3 = str.indexOf(']', pos);
	if (p3 < p2) {
		return '';
	};
	var value = str.substring(p1 + 1, p2);
	return value;
}

function totime(numb) { //numb in secs
	//Math.floor Round a number downward to its nearest integer
	//Math.trunc() function returns the integer part of a number by removing any fractional digits.

	if (numb <= 0) {return "0:00.0"}

	var num = Math.abs(numb);

	num = (num >= 20) ? Math.trunc(num) : num

	var days = Math.trunc( ( num / (24*60*60) ) )

	var hours = Math.trunc( ( num / (24*60) ) %24 )

	var minutes = Math.trunc( ( num / (60) ) %60  )

	var secs = Math.trunc( (num) %60 )

	var tenthofsecs = Math.trunc( (num * 10) %10 )

	var time = '';
	if (days > 0) {
		time = '' + days + ' ' + fixnumber(hours) + ':' + fixnumber(minutes) + ':' + fixnumber(secs);
	} else if (hours > 0) {
		time = '' + hours + ':' + fixnumber(minutes) + ':' + fixnumber(secs);
	} else {
		time = '' + minutes + ':' + fixnumber(secs);
	}
	if (tenthofsecs > 0) time += '.' + tenthofsecs;

	if (numb < 0) time = '-' + time;
	return time;
}

function extracttext(text) {
	var s;
	var pos = text.indexOf('{');
	if (pos < 0) {
		pos = text.lastIndexOf(']')
	} else {
		s = text.substring(0, pos);
		pos = s.lastIndexOf(']');
	};
	return text.substr(pos + 1);
}

function bpgnheader(source, header) /* returns value of a bpgn header (header) in a bpgn text (source). Essentially looks for first occurence of substring header in the string source and returs whatever is in next " " after header */ {
	header = '[' + header;
	var pos = source.indexOf(header);
	if (pos < 0) {
		return '';
	};
	pos = pos + header.length;
	var value = indelim(source, pos, '"', '"');
	return value;
}

function insert(str1, ind1, str2) /* inserts string str2 into string str1 at index ind1 */ {
	var tmp = str1.substr(ind1);
	str1 = str1.substr(0, ind1 + 1);
	return (str1 + str2 + tmp);
}

function sqtoind(sq) /* returns an index in the array pos of a square sq on chess board (e.g. "c7") */ {
	var fc = sq.charAt(0)
	var rc = sq.charAt(1);
	var cfiles = 'abcdefgh';
	var t = cfiles.indexOf(fc);
	var s = eval("8" * rc);
	return (64 - s + t);
}

function generatebfen() {
	var i;
	var t;
	var ec = 0;
	var res = '';
	var col = 0;
	var p;
	for (i = 0; i < 64; i++) {
		t = this.pos[i];
		if (t == '') {
			ec++;
			if (col >= 7) {
				res += ec;
				ec = 0;
			};
		} else {
			if (ec > 0) {
				res += ec;
				ec = 0;
			};
			p = t.charAt(1);
			if (p == p.toUpperCase()) {
				p = p + '~'
			};
			p = (t.charAt(0) == 'w') ? p.toUpperCase() : p.toLowerCase();
			res += p;
		};
		col++;
		if (col >= 8) {
			col = 0;
			res += '/';
		};
	};

	res += holdText(this);

	let castles = ""

	let K = (this.shortcastlew == true) ? "K" : ""
	let Q = (this.longcastlew == true) ? "Q" : ""
	let k = (this.shortcastleb == true) ? "k" : ""
	let q = (this.longcastleb == true) ? "q" : ""

	castles = K + Q + k + q

	res += ' ' + whosmove(this.turn) + ' ' + castles // + ' ' + Math.floor(this.wclock) + ' ' + Math.floor(this.bclock);
	return res;
}

function bfen_to_bracket_notation(bfen) {
	// converts the bfen from "position/hand" format to "position[hand]" format
	// tested on
	// "1/2/3/4/5/6/7/8 a b c d"
	// "1/2/3/4/5/6/7/8/ a b c d"
	// "1/2/3/4/5/6/7/8/hand a b c d"
	// "1/2/3/4/5/6/7/8[hand] a b c d"

	if ( bfen.includes("[") ) {
		return bfen
	} else {

		let board, rest, position, hand

		[board, ...rest] = bfen.split(' ')
		position = board.split('/').slice(0,8).join('/')
		hand = board.split('/').slice(8)

		return position + '[' + hand + '] ' + rest.join(' ')

	}
}


function PiecesToRTF(fsPiece, fiSquareIsBlack)
//BughouseChess or any chess font
{
	var res = "";
	if (fsPiece == '') {
		res += (fiSquareIsBlack) ? '+' : ' '
	} else if (fsPiece == 'wp') {
		res += (fiSquareIsBlack) ? 'P' : 'p'
	} else if (fsPiece == 'wr') {
		res += (fiSquareIsBlack) ? 'R' : 'r'
	} else if (fsPiece == 'wn') {
		res += (fiSquareIsBlack) ? 'N' : 'n'
	} else if (fsPiece == 'wb') {
		res += (fiSquareIsBlack) ? 'B' : 'b'
	} else if (fsPiece == 'wq') {
		res += (fiSquareIsBlack) ? 'Q' : 'q'
	} else if (fsPiece == 'wk') {
		res += (fiSquareIsBlack) ? 'K' : 'k'
	} else if (fsPiece == 'bp') {
		res += (fiSquareIsBlack) ? 'O' : 'o'
	} else if (fsPiece == 'br') {
		res += (fiSquareIsBlack) ? 'T' : 't'
	} else if (fsPiece == 'bn') {
		res += (fiSquareIsBlack) ? 'M' : 'm'
	} else if (fsPiece == 'bb') {
		res += (fiSquareIsBlack) ? 'V' : 'v'
	} else if (fsPiece == 'bq') {
		res += (fiSquareIsBlack) ? 'W' : 'w'
	} else if (fsPiece == 'bk') {
		res += (fiSquareIsBlack) ? 'L' : 'l'
	} else {
		res += ' ';
	};
	return res;
}

function generateRTFTextPosition(fiWhiteUp) {

	/*
	<p class="bughousechess24">
	&nbsp;&nbsp;&nbsp;,t,m, , ,  , , , , , ,<br/>
	>!""""""""#!""""""""# <br/>
	&nbsp;$t+ +lVg+%$ Kq+ B R% <br/>
	&nbsp;$OoOvWoPy%$Pn+b+pPp% <br/>
	&nbsp;$ +m+oOm+%$ +nOp+ +% <br/>
	&nbsp;$+ +o+ + %$R Op+ + % <br/>
	&nbsp;$ + P + +%$oW O V +% <br/>
	&nbsp;$P N PpP %$+ + +m+ % <br/>
	&nbsp;$ Pp+ +bP%$ Oo+ OoO% <br/>
	&nbsp;$R BqK + %$T +l+ +t% <br/>
	&nbsp;/(((((((()/(((((((()<<br/>
	&nbsp;  , , , ,p,  , , , ,v<br/>
	</p>

	Start position
	 !""""""""#!""""""""#<
	 $tMvWlVmT%$rNbKqBnR%
	 $OoOoOoOo%$PpPpPpPp%
	 $ + + + +%$ + + + +%
	 $+ + + + %$+ + + + %
	 $ + + + +%$ + + + +%
	 $+ + + + %$+ + + + %
	 $pPpPpPpP%$oOoOoOoO%
	 $RnBqKbNr%$TmVlWvMt%
	>/(((((((()/(((((((()

	*/

	var i, n;
	var t;
	var ec = 0;
	var res = '';
	var col = 0,
		row = 0;
	var p;
	var lsTmp, lsTmp2;
	var lsHoldBlack = '',
		lsHoldWhite = '';

	lsTmp = holdText(this);
	n = lsTmp.length;
	i = 0;
	while (i < n) {
		lsTmp2 = lsTmp[i].toLowerCase();
		if (lsTmp[i] == lsTmp2) {
			lsHoldBlack += PiecesToRTF('b' + lsTmp2, 0)
		} else {
			lsHoldWhite += PiecesToRTF('w' + lsTmp2, 0)
		}
		i++;
	}
	lsHoldBlack = (lsHoldBlack + ',,,,,,,,,,,,,,,,').substring(0, Math.max(lsHoldBlack.length, 16));
	lsHoldWhite = (lsHoldWhite + ',,,,,,,,,,,,,,,,').substring(0, Math.max(lsHoldWhite.length, 16));

	if (fiWhiteUp == 0) {
		res += '  ' + lsHoldBlack + '\r\n';

		if (this.turn == this.turn.toLowerCase()) {
			res += '>'
		} else {
			res += ' '
		};
		res += '!""""""""#\r\n';
		res += ' $';
		for (i = 0; i < 64; i++) {
			t = this.pos[i];
			res += PiecesToRTF(t, (row + col) % 2)
			col++;
			if (col >= 8) {
				row += 1;
				col = 0;
				res += '%\r\n';
				if (row < 8) {
					res += ' $';
				};
			};
		};
		if (this.turn == this.turn.toUpperCase()) {
			res += '>'
		} else {
			res += ' '
		};
		res += '/(((((((()\r\n';

		res += '  ' + lsHoldWhite + '\r\n';

		//res+=' '+whosmove(this.turn)+' '+this.wclock+' '+this.bclock;

		/*
		  wvoo
		>!""""""""#
		 $tMvWlVmT%
		 $OoOoO Oo%
		 $ + + O +%
		 $+ + N + %
		 $ + + + +%
		 $+ + +n+ %
		 $pPpPpPpP%
		 $RnBqKb+r%
		 /(((((((()
		  qp
		*/
	} else {
		res += '  ' + lsHoldWhite + '\r\n';
		res += ' !""""""""#'
		if (this.turn != this.turn.toLowerCase()) {
			res += '<'
		} else {
			res += ' '
		};
		res += '\r\n $';
		for (i = 63; i > -1; i--) {
			t = this.pos[i];
			res += PiecesToRTF(t, (row + col) % 2)
			col++;
			if (col >= 8) {
				row += 1;
				col = 0;
				res += '%\r\n';
				if (row < 8) {
					res += ' $';
				};
			};
		};
		res += ' /(((((((()';
		if (this.turn != this.turn.toUpperCase()) {
			res += '<'
		} else {
			res += ' '
		};
		res += '\r\n';
		res += '  ' + lsHoldBlack + '\r\n';

		//res+=' '+whosmove(this.turn)+' '+this.wclock+' '+this.bclock;

		/*
		  nqp
		 !""""""""#<
		 $ K + + R%
		 $PpRb+ Pp%
		 $ + + + +%
		 $+ + Op+ %
		 $ B + + +%
		 $+ M + + %
		 $oOo+ OoO%
		 $T Vl+ +t%
		 /(((((((()
		  w
		*/
	}

	return res;
}


function MultilineStringsConcatenate(fsA, fsB) {
	var res = '';
	var lsArrA = fsA.split("\r\n");
	var lsArrB = fsB.split("\r\n");
	var lnA = lsArrA.length;
	var lnB = lsArrB.length;
	var ln;
	ln = lnA;
	if (lnA < lnB) {
		ln = lnB;
		while (lnA < ln) {
			lsArrA[lnA] = '\r\n';
			lnA++;
		}
	} else if (lnB < lnA) {
		while (lnB < ln) {
			lsArrB[lnB] = '\r\n';
			lnB++;
		}
	};
	var li1 = 0;
	while (li1 < ln) {
		res += lsArrA[li1] + lsArrB[li1] + '\r\n';
		li1++;
	};

	return res;
}



function indtosq(ind) {
	var cfiles = 'abcdefgh';
	var rank = getrank(ind);
	var file = getfile(ind);
	var res = cfiles.charAt(file) + rank;
	return res;
}

function indtoind(ind, flip) {
	return (flip == 0) ? ind : (63 - ind);
}

function drawhold() {
	var i;
	var j;
	var t;
	var ind = this.syncpic();
	if (this.flip == 0) {
		for (i = 0; i < 10; i++) {
			if (this.hold[i] > 0) {
				t = this.dropbar[i] + 'd';
				document.images[ind + 64 + i].src = this.gifs[t];
			} else {
				document.images[ind + 64 + i].src = this.gifs["d"];
			};
		}
	} else {
		for (i = 0; i < 10; i++) {
			if (this.hold[i] > 0) {
				t = this.dropbar[i] + 'd';
				document.images[ind + 73 - i].src = this.gifs[t];
			} else {
				document.images[ind + 73 - i].src = this.gifs["d"];
			};
		}
	};
	return;
}


function holdText(fBoard) {
	var ls = '';

	if (fBoard.hold[6] > 0) {
		for (i = 0; i < fBoard.hold[6]; i++) ls += 'B';
	}
	if (fBoard.hold[7] > 0) {
		for (i = 0; i < fBoard.hold[7]; i++) ls += 'N';
	}
	if (fBoard.hold[8] > 0) {
		for (i = 0; i < fBoard.hold[8]; i++) ls += 'R';
	}
	if (fBoard.hold[9] > 0) {
		for (i = 0; i < fBoard.hold[9]; i++) ls += 'Q';
	}

	if (fBoard.hold[0] > 0) {
		for (i = 0; i < fBoard.hold[0]; i++) ls += 'r';
	};
	if (fBoard.hold[1] > 0) {
		for (i = 0; i < fBoard.hold[1]; i++) ls += 'q';
	}
	if (fBoard.hold[2] > 0) {
		for (i = 0; i < fBoard.hold[2]; i++) ls += 'b';
	}
	if (fBoard.hold[3] > 0) {
		for (i = 0; i < fBoard.hold[3]; i++) ls += 'n';
	}
	if (fBoard.hold[4] > 0) {
		for (i = 0; i < fBoard.hold[4]; i++) ls += 'p';
	}
	if (fBoard.hold[5] > 0) {
		for (i = 0; i < fBoard.hold[5]; i++) ls += 'P';
	};



	return ls;
}


function drawpos() /* draws a position and holding (pos and holding respectively) in the viewer, ind is the index of upper left corner of the board in the array document.images[]. That way function doesn't need to know the board name */ {
	var i;
	var st;
	var ltmp1;
	this.brefreshform();
	var ind = this.syncpic();
	if (this.flip == 0) {
		for (i = 0; i < 64; i++) {
			st = this.pos[i].toLowerCase() + 'd';
			ltmp1 = eval('this.gifs["' + st + '"]');
			document.images[ind + i].src = eval('this.gifs["' + st + '"]');
		}
	} else {
		for (i = 0; i < 64; i++) {
			st = this.pos[63 - i].toLowerCase() + 'd';
			document.images[ind + i].src = eval('this.gifs["' + st + '"]');
		}
	};
	this.drawhold();
	return;
}

function refreshinfo() {
	if ((this.displaymode == 'playback') || (this.displaymode == 'diagram')) return;
	var i;
	var j;
	var s = '';
	var bl = '                ';
	var n = this.BPGN[this.currentmove].nNext.length;
	if (n > MAX_NEXT) n = MAX_NEXT;
	var v = eval('window.document.' + this.viewername);
	/* var t='Date: '+this.gamedate+'\n';
	t+='Time: '+this.timecontrol+'\n';
	t+='Result: '+this.gameresult+'\n';
	t+='Event: '+this.gameevent+'\n';
	t+='Site: '+this.gamesite+'\n';
	v.info.value=t;*/

	// this puts the results into the final note, if there is no final note already
	// this definitely should not be cheked and handled by the viewer function
	if (this.currentmove == this.endnode) {
		if (!this.BPGN[this.currentmove].cNote) {
			this.BPGN[this.currentmove].cNote = this.cResult1 + ' ' + this.gameresult
		}
	}

	v.comment.value = this.BPGN[this.currentmove].cNote;
	for (i = 0; i < n; i++) {
		j = this.BPGN[this.currentmove].nNext[i];
		s = this.BPGN[j].cMove + this.BPGN[j].cAnno;
		s += bl;
		v.nextmove.options[i].text = s.substr(0, NEXT_WIDTH);
	};
	bl = bl.substr(0, NEXT_WIDTH);
	for (i = n; i < MAX_NEXT; i++) {
		v.nextmove.options[i].text = bl;
	};
	v.nextmove.options[MAX_NEXT].text = 'XXXXXXXXXXX';
	v.nextmove.options[0].selected = true;


}

function refreshhighlight() {

// we don't want to run our function when things do not exist:

	if (!v1.a) return;
	if (!v1.b) return;

	for (const boardId of "ab".split('')) {

		let boardObj = eval(this.viewername + "." + boardId)

		// unhighlight the board

		boardObj.unHighlightAll()

		// get the moves to highlight:

		let currentNode = this.BPGN[this.currentmove]

		while ( boardId == "a" && currentNode.dmove.board == "b" ||
				boardId == "b" && currentNode.dmove.board == "a") {
			currentNode = this.BPGN[ currentNode.nParent ]
		}

		let fromSquare = currentNode.dmove.fromsquare
		let toSquare = currentNode.dmove.tosquare

	// some cases, according to the move type

		// it's a dropmove:
		if ( typeof fromSquare === 'number' && fromSquare == 65 ) {
			boardObj.Highlight( toSquare )
		}

		// it's a normal move:

		if ( typeof fromSquare === 'number' && fromSquare <= 63 &&
			 typeof toSquare === 'number' && toSquare <= 63) {
			boardObj.Highlight( fromSquare, toSquare )
		}

		// short castle:

		if ( fromSquare == "o-o" ) {
			if ( currentNode.dmove.side == "w" ) {
					boardObj.Highlight(61, 62)
				}

			if ( currentNode.dmove.side == "b" ) {
					boardObj.Highlight(5, 6)
				}
		}

		// long castle:

		if ( fromSquare == "o-o-o" ) { // short castle
			if ( currentNode.dmove.side == "w" ) {
				boardObj.Highlight(58, 59)
			}

			if ( currentNode.dmove.side == "b" ) {
				boardObj.Highlight(2,3)
			}
		}

	}

}

function NODE() {
	this.nParent = BPGN_ROOT; // Partner node index
	this.nMove = 0; // Move counter
	this.cBoard = BPGN_BOARD_A1; // Board type ('A', 'a', 'B', or 'b')
	this.cMove = ''; // Move string size (i.e. "e4")
	this.cTime = ''; // Time (i.e. "300")
	this.cAnno = ''; // Annotation (i.e. "!")
	this.cNote = ''; // Note (i.e. "Interesting move!")
	this.nNext = new Array(); // Next size (next moves)
	this.dmove = false; //decrypted move
	this.cLag = '';
	this.cLagCompensation = ''; //SKAcz Lag and Lag compensation
}

function QUEUE(state, token) {
	this.nlaststate = state; // token queue last state
	this.cToken = token; // token queue token
}

// get new node
function BPGN_GetNewNode() {
	var i = this.BPGN.length;
	this.BPGN[this.BPGN.length] = new NODE();
	return i;
}

// is token queue empty?
function BPGN_QueueIsEmpty() {
	return (this.Queue.length == 0); //return this.nCount;
}

// insert into token queue
function BPGN_InsertQueue(nls, ct) {
	this.nError = ERROR_NONE;
	this.Queue[this.Queue.length] = new QUEUE(nls, ct);
	return true;
}

// remove from token queue
function BPGN_RemoveQueue() {
	var i;
	var n = this.Queue.length;
	if (n > 0) {
		this.nError = ERROR_NONE;
		var res = this.Queue[0];
		for (i = 0; i < n - 1; i++) this.Queue[i] = this.Queue[i - 1];
		this.Queue[n - 1] = false;
		this.Queue.length = n - 1;
		return res;
	} else {
		this.nError = ERROR_QUEUE_IS_EMPTY;
		return false;
	};
}

function gettoken() {
	var ni;
	var ctmp;
	var cttt;
	var x;
	var tmp;

	if (!this.BPGN_QueueIsEmpty()) {
		tmp = this.BPGN_RemoveQueue();
		if (tmp != false) {
			this.ctoken = tmp.cToken;
			this.nlaststate = tmp.nlaststate;
			return true;
		};
		return false;
	};

	if ((this.ngamesize == 0) || (this.ngameindex > this.ngamesize))
	// introduce ngamesize, ngameindex, ctoken;
	{
		this.ctoken = "";
		return 0;
	};
	ni = this.ngameindex - 1;
	while (ni < this.ngamesize) {
		this.ctoken = "";
		ctmp = "";
		while (ni < this.ngamesize) {
			ni = ni + 1;
			// normal state
			// introduce this.nstate, this.cgame
			x = this.cgame.charAt(ni);
			if (this.nstate == BPGN_NORMAL) {
				if ((x == ' ') || (x == TAB_ASCII_NUM) || (x == CR_ASCII_NUM) || (x == LF_ASCII_NUM)) break;
				if ((x == '[') || (x == ']') ||
					(x == '(') || (x == ')') ||
					(x == '<') || (x == '>') ||
					(x == '(') || (x == ')') ||
					(x == '.') || (x == '*') ||
					(x == '}')) {
					this.ctoken = x;
					break;
				}

				if (x == '"') {
					this.nstate = BPGN_STRING;
					continue;
				}
				if (x == '0') {
					if ((ni + 2) <= this.ngamesize) {
						if ((this.cgame.charAt(ni + 1) == '-') && (this.cgame.charAt(ni + 2) == '1')) {
							this.ctoken = "0-1";
							ni = ni + 2;
							break;
						}
					}
				}
				if (x == '1') {
					if ((ni + 2) <= this.ngamesize) {
						if ((this.cgame.charAt(ni + 1) == '-') && (this.cgame.charAt(ni + 2) == '0')) {
							this.ctoken = "1-0";
							ni = ni + 2;
							break;
						}
					}
					if ((ni + 6) <= this.ngamesize) {
						if (this.cgame.substr(ni, 7) == '1/2-1/2') {
							this.ctoken = "1/2-1/2";
							ni = ni + 6;
							break;
						}
					}
				}
				if (x.match(NUMB)) {
					this.nstate = BPGN_INTEGER;
					ctmp = x;
					continue;
				}
				if (x == ';') {
					this.nstate = BPGN_COMMENT1;
					ctmp = "";
					break;
				}
				if (x == '{') {
					this.nstate = BPGN_COMMENT2;
					ctmp = "{";
					break;
				}
				if (x == '$') {
					this.nstate = BPGN_NAG;
					ctmp = "$";
					continue;
				}
				if (x.match(LETT)) {
					this.nstate = BPGN_SYMBOL;
					ctmp = x;
					continue;
				}
			}
			// string token state
			if (this.nstate == BPGN_STRING) {
				if (x == '\\') {
					if (ni < this.ngamesize) {
						ni = ni + 1;
						if (this.cgame.charAt(ni) == '"') {
							cttt = this.cgame.charAt(ni);
							ctmp += cttt;
							continue;
						}
						if (this.cgame.charAt(ni) == '\\') {
							cttt = this.cgame.charAt(ni);
							ctmp += cttt;
							continue;
						}
						cttt = '\\';
						cttt += this.cgame.charAt(ni);
						ctmp += cttt;
						continue;
					}
					cttt = this.cgame.charAt(ni);
					ctmp += cttt;
					break;
				}
				if (this.cgame.charAt(ni) == '"') break;
				cttt = this.cgame.charAt(ni);
				ctmp += cttt;
				continue;
			}
			// integer token state
			if (this.nstate == BPGN_INTEGER) {
				if ((this.cgame.charAt(ni) >= '0') && (this.cgame.charAt(ni) <= '9')) {
					cttt = this.cgame.charAt(ni);
					ctmp += cttt;
					continue;
				}
				ni = ni - 1;
				break;
			}
			// comment token state
			if (this.nstate == BPGN_COMMENT2) {
				// if ((this.cgame.charAt(ni) == CR_ASCII_NUM) || (this.cgame.charAt(ni) == LF_ASCII_NUM)) continue;
				// ^-- it forgets the newline characters in the notes, we don't want that

				if (this.cgame.charAt(ni) == '}') {
					this.nstate = BPGN_NORMAL;
					this.ctoken = ctmp;
					ni = ni - 1;
					break;
				}
				cttt = this.cgame.charAt(ni);
				ctmp += cttt;
				continue;
			}
			// NAG (Numeric Annotation Glyph) token state
			if (this.nstate == BPGN_NAG) {
				if ((this.cgame.charAt(ni) >= '0') && (this.cgame.charAt(ni) <= '9')) {
					cttt = this.cgame.charAt(ni);
					ctmp += cttt;
					continue;
				}
				ni = ni - 1;
				break;
			}
			// symbol token state
			if (this.nstate == BPGN_SYMBOL) {
				if ((this.cgame.charAt(ni) == ' ') || (this.cgame.charAt(ni) == TAB_ASCII_NUM) || (this.cgame.charAt(ni) == CR_ASCII_NUM) || (this.cgame.charAt(ni) == LF_ASCII_NUM)) break;
				if (x.match(SYMB)) {
					cttt = x;
					ctmp = ctmp + cttt;
					continue;
				}
				ni = ni - 1;
				break;
			}
		}
		// set BPGN state
		// introduce this.nlaststate
		this.nlaststate = this.nstate;
		if ((this.nstate == BPGN_STRING) ||
			(this.nstate == BPGN_INTEGER) ||
			(this.nstate == BPGN_COMMENT1) ||
			(this.nstate == BPGN_NAG) ||
			(this.nstate == BPGN_SYMBOL) ||
			(this.nstate == BPGN_COMMENT1)) {
			this.nstate = BPGN_NORMAL;
			this.ctoken = ctmp;
		} else
		if (this.nstate == BPGN_COMMENT2) this.ctoken = ctmp;
		if (this.ctoken.length > 0) break;
	}
	this.ngameindex = ni + 1;
	return (this.ctoken.length > 0);
}

// is the current token a note?
function bpgnisnote() {
	if (this.ctoken.length < 3) return false;
	return ((this.ctoken.charAt(0) == BPGN_NOTE) && (this.ctoken.charAt(1) == ':'));
}

// is the current token an annotation?
function bpgnisannotation() {
	if (this.ctoken.length < 3) return false;
	return ((this.ctoken.charAt(0) == BPGN_ANNOTATION) && (this.ctoken.charAt(1) == ':'));
}

// is the current token an lag? //SKAcz
function bpgnislag() {
	if (this.ctoken.length < 3) return false;
	return ((this.ctoken.charAt(0) == BPGN_LAG) && (this.ctoken.charAt(1) == ':'));
}

// get move
function bpgngetmove(nmovea, nmoveb, aside) {
	var nmove;
	var bboarda1;
	var bboarda2;
	var bboardb1;
	var bboardb2;
	var cboard;
	// document.writeln('getmove recieves: '+nmovea+':'+nmoveb+':'+aside);
	if (!this.gettoken()) {
		this.nError = ERROR_NONE;
		return true;
	};
	if ((this.nlaststate == BPGN_NORMAL) && (this.ctoken == "(")) {
		return '(';
	};
	if ((this.nlaststate == BPGN_NORMAL) && (this.ctoken == ")")) {
		return ')';
	};
	if (this.nlaststate == BPGN_COMMENT2) // '{' symbol
	{
		if (!this.gettoken()) {
			return false;
		};
		if (this.nlaststate != BPGN_NORMAL) {
			return false;
		};
		// maybe it's a game result?
		if (this.bpgngetresult()) {
			return 'res';
		} else {
			return false;
		};
	};
	if (this.nlaststate != BPGN_INTEGER) //we assume that it is move on board 'A'
	{
		this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
		nmove = nmovea;
	}
	// convert move number into integer
	else nmove = parseInt(this.ctoken);
	if (!this.gettoken()) // missing board symbol (i.e. must be 'A', 'a', 'B', or 'b')
	{
		return false;
	};
	if (this.nlaststate != BPGN_SYMBOL) // invalid board symbol (i.e. must be 'A', 'a', 'B', or 'b')
	{
		/*forget about it we insert it later*/ };

	bboarda1 = ((this.ctoken == 'A')) ? true : false;
	bboarda2 = ((this.ctoken == 'a')) ? true : false;
	bboardb1 = ((this.ctoken == 'B')) ? true : false;
	bboardb2 = ((this.ctoken == 'b')) ? true : false;
	if ((!bboarda1) && (!bboarda2) && (!bboardb1) && (!bboardb2)) // invalid board symbol (i.e. must be 'A', 'a', 'B', or 'b')
	{
		//lets assume that board is 'a' or 'A' and put the token back. before was return false
		this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
		if (aside == 'a') {
			bboarda2 = true
		} else {
			bboarda1 = true
		};
	};
	if (bboarda1) {
		if (nmovea != nmove) // invalid move number
			if (this.afirstmove) {
				return false;
			}
		cboard = 'A';
	};
	if (bboarda2) {
		if (nmovea != nmove) // invalid move number
			if (this.afirstmove) {
				return false;
			};
		cboard = 'a';
	};
	if (bboardb1) {
		if (nmoveb != nmove) // invalid move number
			if (this.bfirstmove) {
				return false;
			};
		cboard = 'B';
	};
	if (bboardb2) {
		if (nmoveb != nmove)
			if (this.bfirstmove) {
				return false;
			};
		cboard = 'b';
	};
	if (!this.gettoken()) // missing '.'
	{
		return false;
	};
	if (this.ctoken != BPGN_MOVE_DSTR) // no '.' let's forget it
	{
		this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
	};
	if (!this.gettoken()) // missing move
	{
		return false;
	};
	if (this.nlaststate != BPGN_SYMBOL) // invalid move
	{
		return false;
	};
	// save move number, board, and move string
	var tmp = nmove + cboard + BPGN_MOVE_DSTR + ' ' + this.ctoken;
	// document.writeln(' getmove returns '+tmp+'<br>');
	return (tmp);
}

// get time
function bpgngettime() {
	var ct;
	var lt;
	if (!this.gettoken()) // missing time
	{
		return false;
	};
	if (this.nlaststate != BPGN_COMMENT2) // '{' symbol invalid time
	{
		//We assume that somebody was too lazy to include time. Let's pretend that it's there put the token back
		this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
		return BPGN_OMITED_TIME;
	};
	if (!this.gettoken()) // missing time
	{
		return false;
	};
	if (this.nlaststate != BPGN_NORMAL) // invalid time, probably comment
	{
		this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
		this.BPGN_InsertQueue(BPGN_COMMENT2, '{');
		return BPGN_OMITED_TIME;
	}; // save time
	ct = this.ctoken;
	lt = this.nlaststate;
	if (!this.gettoken()) // missing '}'
	{
		return false;
	};
	if (this.ctoken != "}") // expecting '}' but we got something else
	{
		this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
		this.BPGN_InsertQueue(lt, ct);
		this.BPGN_InsertQueue(BPGN_COMMENT2, '{');
		return BPGN_OMITED_TIME;
	};
	// nError = ERROR_NONE ;
	return Number(ct);
}

// get result
function bpgngetresult() {
	var nTemp;
	var cTemp;
	nTemp = this.nlaststate;
	cTemp = this.ctoken;
	if (!this.gettoken()) // incomplete file
	{
		return false;
	};
	if (this.nlaststate != BPGN_NORMAL) // expecting '}'
	{
		return false;
	};
	if (this.ctoken != "}") // expecting '}'
	{
		return false;
	}
	if (!this.gettoken()) // incomplete file
	{
		return false;
	};
	if (this.nlaststate != BPGN_NORMAL) // expecting game result
	{
		return false;
	};
	if ((this.ctoken != BPGN_WHITE_WINS) &&
		(this.ctoken != BPGN_BLACK_WINS) &&
		(this.ctoken != BPGN_DRAW) &&
		(this.ctoken != BPGN_UNKNOWN)) // invalid game result
	{
		return false;
	};
	// copy results
	this.cResult1 = cTemp;
	this.cResult2 = this.ctoken;
	this.bfinish = true;
	return true;
}

// get note
function bpgngetnote() {
	var bNote;
	var bAnno;
	var bLag;
	if (!this.gettoken()) // incomplete file
	{
		return false;
	};
	if (this.nlaststate != BPGN_NORMAL) // not a note
	{
		return false;
	};
	bNote = this.bpgnisnote();
	bAnno = this.bpgnisannotation();
	bLag = this.bpgnislag(); //SKAcz lag added
	if ((!bNote) && (!bAnno) && (!bLag)) { // maybe it's a game result?
		if (this.bpgngetresult()) {
			return true;
		};
		return false;
	}
	// yes, it's a note or annotation lets save it
	this.note = this.ctoken.substr(2);
	this.bIsNote = (bNote) ? true : false;
	if (!this.gettoken()) // incomplete file
	{
		return false;
	};
	if (this.nlaststate != BPGN_NORMAL) // expecting '}'
	{
		return false;
	};
	if (this.ctoken != "}") // expecting '}'
	{
		return false;
	};
	return true;
}

function bpgngetfirstnote() {
	// there can be a note before the game starts so lets scan for it
	if (this.gettoken()) {
		if (this.nlaststate == BPGN_COMMENT2) // '{' symbol
		{ // get note before game start (if any)
			if (this.bpgngetnote()) {
				if (this.bfinish) // finish
				{} else {
					if (this.bIsNote) // save the note
					{
						this.BPGN[BPGN_ROOT].cNote = this.note;
					} else // invalid annotation
					{
						this.nError = ERROR_INVALID_ANNOTATION;
					};
				};
			};
		} else // no, there is no note before the game starts so lets put the token back
		{
			this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
		};
	};
	return (this.nError == ERROR_NONE);
}

function getboard(move) {
	if (move.length) {
		var i = move.indexOf(BPGN_MOVE_DSTR);
		return (i > 0) ? (move.charAt(i - 1)) : false;
	} else return false;
}

function stuffnode(nNewIndex, nParent, nMove, cBoard, cMove, cTime, cAnno, cNote) {
	this.BPGN[nNewIndex].nParent = nParent;
	this.BPGN[nNewIndex].nMove = nMove;
	this.BPGN[nNewIndex].cBoard = cBoard;
	this.BPGN[nNewIndex].cMove = cMove;
	this.BPGN[nNewIndex].cTime = cTime;
	this.BPGN[nNewIndex].cAnno = cAnno;
	this.BPGN[nNewIndex].cNote = cNote;

	// hook up with parent
	nNext = this.BPGN[nParent].nNext.length;
	this.BPGN[nParent].nNext[nNext] = nNewIndex;
	// this.BPGN[nNewIndex].dmove=false;
}

function dispqueue() {
	var ln = this.Queue.length;
	var i;
	document.writeln('Queue is of length ' + ln + ' <br>');
	for (i = 0; i < ln; i++) document.writeln('#' + i + '|token ' + this.Queue[i].cToken + '|laststate ' + this.Queue[i].nlaststate + '<br>');
}

function getmoven(move) {
	if (move.length) {
		var i = move.indexOf(BPGN_MOVE_DSTR);
		if (i < 2) return false;
		var mv = move.substring(0, i - 1);
		return parseInt(mv);
	} else return false;
}

function getside(move) {
	var i = move.indexOf(BPGN_MOVE_DSTR);
	if (i < 2) return false;
	return move.charAt(i - 1);
}

function changeturnside(side) {
	if (side == side.toLowerCase()) {
		return side.toUpperCase();
	} else {
		return side.toLowerCase();
	};
}

function BPGN_GetBody(nParent, nMoveA, nMoveB, aside) {
	var nMove;
	var cBoard;
	var cMove;
	var cTime;
	var cAnno;
	var cNote;
	var cTemp1;
	var cTemp2;
	var bHasNote;
	var bHasAnno;
	var bIsNote1;
	var bIsNote2;
	var nNewIndex = -1;
	var nI;
	var nNext;
	var cLastBoard = BPGN_BOARD_A1;
	var nMA;
	var nMB;
	var aaside

	while (true) {
		cMove = this.bpgngetmove(nMoveA, nMoveB, aside);
		if (cMove == false) break;
		cBoard = getboard(cMove);
		nMove = getmoven(cMove);
		if (((cBoard == 'a') || (cBoard == 'A')) && (!this.afirstmovea)) {
			nMoveA = nMove;
			this.afirstmovea = true
		};
		if (((cBoard == 'b') || (cBoard == 'B')) && (!this.bfirstmovea)) {
			nMoveB = nMove;
			this.bfirstmovea = true
		};
		if (nMove != false) {
			if ((cBoard == 'a') || (cBoard == 'A')) {
				aside = changeturnside(aside)
			};
		};

		if (this.bfinish) {
			break;
		};
		if (cMove == "(") // variation
		{
			if (cLastBoard == BPGN_BOARD_A2) {
				nMA = nMoveA - 1;
				nMB = nMoveB;
			} else
			if (cLastBoard == BPGN_BOARD_B2) {
				nMA = nMoveA;
				nMB = nMoveB - 1;
			} else {
				nMA = nMoveA;
				nMB = nMoveB;
			};

			if ((cLastBoard == 'a') || (cLastBoard == 'A')) {
				aaside = changeturnside(aside)
			} else {
				aaside = aside
			};
			if (this.BPGN_GetBody(nParent, nMA, nMB, aaside)) {
				if (this.ctoken = ")") {
					continue;
				} else {
					this.nError = ERROR_MISSING_END_VARIATION;
					this.cError = "expecting ')' but got " + this.ctoken;
					break;
				}
			} else {
				break;
			}
		} else { // new to F4.C
			if (nNewIndex != -1) {
				nParent = nNewIndex;
			};
		};

		if (cMove == ")") break;


		cTime = this.bpgngettime();
		if (!cTime) {
			break
		};
		bHasNote = false;
		bHasAnno = false;

		if (this.gettoken()) {
			if (this.nlaststate == BPGN_COMMENT2) // '{' symbol
			{ // get note or annotation
				if (!this.bpgngetnote()) {
					break
				};
				bIsNote1 = this.bIsNote;
				cTemp1 = this.note;
				if (this.bfinish) { // get new node index
					nNewIndex = this.BPGN_GetNewNode();
					// stuff new node
					this.stuffnode(nNewIndex, nParent, nMove, cBoard, cMove, cTime, '', '');
					break;
				};

				if (bIsNote1) {
					bHasNote = 1;
					bHasAnno = 0;
				} else {
					bHasNote = 0;
					bHasAnno = 1;
				};
				if (this.gettoken()) {
					if (this.nlaststate == BPGN_COMMENT2) // '{' symbol
					{ // get note or annotation
						if (!this.bpgngetnote()) {
							break;
						};
						bIsNote2 = this.bIsNote;
						cTemp2 = this.note;
						if (this.bfinish) { // get new node index
							nNewIndex = this.BPGN_GetNewNode();
							// stuff new node
							this.stuffnode(nNewIndex, nParent, nMove, cBoard, cMove, cTime, '', '');

							if (bHasNote) {
								this.BPGN[nNewIndex].cNote = cTemp1
							} else {
								this.BPGN[nNewIndex].cNote = ""
							};
							if (bHasAnno) {
								this.BPGN[nNewIndex].cAnno = cTemp1
							} else {
								this.BPGN[nNewIndex].cAnno = ""
							};

							break;
						};
						if (bHasNote) {
							if (bIsNote2) {
								this.nError = ERROR_DOUBLE_NOTE;
								this.cError = "";
								break;
							} else {
								bHasAnno = 1;
							};
						} else
						if (bHasAnno) {
							if (bIsNote2) {
								bHasNote = 1;
							} else {
								this.nError = ERROR_DOUBLE_ANNOTATION;
								this.cError = "";
								break;
							};
						};
					} else
					if ((this.nlaststate == BPGN_NORMAL) && (this.ctoken == "(")) { // get new node index
						nNewIndex = this.BPGN_GetNewNode();
						this.stuffnode(nNewIndex, nParent, nMove, cBoard, cMove, cTime, '', '');

						if (bHasNote) {
							this.BPGN[nNewIndex].cNote = cTemp1;
							this.BPGN[nNewIndex].cAnno = "";
						} else
						if (bHasAnno) {
							this.BPGN[nNewIndex].cNote = "";
							this.BPGN[nNewIndex].cAnno = cTemp1;
						} else {
							this.BPGN[nNewIndex].cNote = "";
							this.BPGN[nNewIndex].cAnno = "";
						};

						// advance move counter
						cLastBoard = cBoard;
						if (cBoard == BPGN_BOARD_A2) {
							nMoveA = nMoveA + 1;
						} else
						if (cBoard == BPGN_BOARD_B2) {
							nMoveB = nMoveB + 1;
						};

						// variation
						if (cLastBoard == BPGN_BOARD_A2) {
							nMA = nMoveA - 1;
							nMB = nMoveB;
						} else
						if (cBoard == BPGN_BOARD_B2) {
							nMA = nMoveA;
							nMB = nMoveB - 1;
						} else {
							nMA = nMoveA;
							nMB = nMoveB;
						};

						if ((cLastBoard == 'a') || (cLastBoard == 'A')) {
							aaside = changeturnside(aside)
						} else {
							aaside = aside
						};
						if (this.BPGN_GetBody(nParent, nMA, nMB, aaside)) {
							if (this.ctoken == ")") {
								// new to F4.C look ahead
								if (this.gettoken()) {
									if (this.ctoken == "(") {
										this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
									} else // assign new parent
									{
										this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
										nParent = nNewIndex;
									};
								} else {
									nParent = nNewIndex;
								};
								continue;
							} else {
								this.nError = ERROR_MISSING_END_VARIATION;
								this.cError = "expecting ')' but got " + this.ctoken;
								break;
							};
						} else {
							break;
						};
					} else // no note or annotation
					{
						this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
					};
				} else {
					/* no more*/
					break;
				};
			} else
			if ((this.nlaststate == BPGN_NORMAL) && (this.ctoken == "(")) { // get new node index
				nNewIndex = this.BPGN_GetNewNode();
				this.stuffnode(nNewIndex, nParent, nMove, cBoard, cMove, cTime, '', '');

				// advance move counter
				cLastBoard = cBoard;
				if (cBoard == BPGN_BOARD_A2) {
					nMoveA = nMoveA + 1;
				} else
				if (cBoard == BPGN_BOARD_B2) {
					nMoveB = nMoveB + 1;
				};

				// variation
				if (cLastBoard == BPGN_BOARD_A2) {
					nMA = nMoveA - 1;
					nMB = nMoveB;
				} else
				if (cBoard == BPGN_BOARD_B2) {
					nMA = nMoveA;
					nMB = nMoveB - 1;
				} else {
					nMA = nMoveA;
					nMB = nMoveB;
				};

				if ((cLastBoard == 'a') || (cLastBoard == 'A')) {
					aaside = changeturnside(aside)
				} else {
					aaside = aside
				};
				if (this.BPGN_GetBody(nParent, nMA, nMB, aaside)) {
					if (this.ctoken == ")") { // new to F4.C look ahead
						if (this.gettoken()) {
							if (this.ctoken == "(") {
								this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
							} else // assign new parent
							{
								this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
								nParent = nNewIndex;
							};
						} else {
							nParent = nNewIndex;
						};
						continue;
					} else {
						this.nError = ERROR_MISSING_END_VARIATION;
						this.cError = "expecting ')' but got " + this.ctoken;
						break;
					};
				} else {
					break;
				};
			} else {
				/* no note or annotation */
				this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
			};
		} else // no more
		{
			break;
		};

		nNewIndex = this.BPGN_GetNewNode();
		this.stuffnode(nNewIndex, nParent, nMove, cBoard, cMove, cTime, '', '');
		if (bHasNote) {
			if (bIsNote1) {
				this.BPGN[nNewIndex].cNote = cTemp1
			} else
			if (bIsNote2) {
				this.BPGN[nNewIndex].cNote = cTemp2
			} else {
				this.BPGN[nNewIndex].cNote = "";
			}
		} else {
			this.BPGN[nNewIndex].cNote = "";
		};

		if (bHasAnno) {
			if (!bIsNote1) {
				this.BPGN[nNewIndex].cAnno = cTemp1
			} else
			if (!bIsNote2) {
				this.BPGN[nNewIndex].cAnno = cTemp2
			} else {
				this.BPGN[nNewIndex].cAnno = "";
			}
		} else {
			this.BPGN[nNewIndex].cAnno = "";
		};

		// advance move counter
		cLastBoard = cBoard;
		if (cBoard == BPGN_BOARD_A2) {
			nMoveA = nMoveA + 1;
		} else
		if (cBoard == BPGN_BOARD_B2) {
			nMoveB = nMoveB + 1;
		};


		// new to F4.C look ahead
		if (this.gettoken()) {
			if (this.ctoken == "(") {
				this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
			} else // assign new parent
			{
				this.BPGN_InsertQueue(this.nlaststate, this.ctoken);
				nParent = nNewIndex;
			};
		} else {
			nParent = nNewIndex;
		};
	}; //end of while
	return (this.nError == ERROR_NONE)
}

function BPGN_SaveAnno(nNode) {
	var nA;
	var nL;
	var nI;
	var cTmp;
	var nA = this.BPGN[nNode].cAnno.length;
	if (nA == 0) return;
	nL = this.cSaveGameString.length;
	if (this.cSaveGameString.charAt(nL - 1) == ' ') {
		if ((nL + 4) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
	} else {
		if ((nL + 4 + 1) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		} else {
			if (this.cSaveGameString.length > 0) this.cSaveGameString += " ";
		};
	}
	this.cSaveGameString = "{A:" + this.cSaveGameString;
	for (nI = 0; nI < nA; nI++) {
		if (this.cSaveGameString >= BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
		cTmp = this.BPGN[nNode].cAnno.charAt(nI);
		if ((cTmp == ' ') && (cSaveGameString.length + 1 == BPGN_LINE_SIZE)) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
		this.cSaveGameString += cTmp;
	};
	nL = this.cSaveGameString.length;
	if ((nL + 1) > BPGN_LINE_SIZE) {
		this.sgame += this.cSaveGameString + '\n';
		this.cSaveGameString = "";
	};
	this.cSaveGameString += "}";
}

function assdelete(viewer) {
	v = eval(viewer);
	if (v.currentmove == BPGN_ROOT) return;
	v.BPGN_DeleteCurrentMove(v.currentmove);
	v.undomove();
	v.refreshhighlight()
}

function BPGN_DeleteCurrentMove(nCurrent) {
	var nI;
	var nN;
	var nP;
	var ln;
	var tmp;
	// unhook parent's next move to nCurrent
	nP = this.BPGN[nCurrent].nParent;

	// new to F4.C
	// make sure one's parent is an ok index
	if (nP < 0) return;
	if (nP >= this.BPGN.length) return;
	// look for parent's next move pointing to nCurrent
	ln = this.BPGN[nP].nNext.length;
	for (nI = 0; nI < ln; nI++) {
		if (this.BPGN[nP].nNext[nI] == nCurrent) {
			tmp = nI;
			break;
		};
	};
	for (nI = tmp; nI < ln - 2; nI++) {
		this.BPGN[nP].nNext[nI] = this.BPGN[nP].nNext[nI + 1];
	};
	this.BPGN[nP].nNext[ln - 1] = false;
	this.BPGN[nP].nNext.length = ln - 1;
}


function BPGN_SaveTime(nNode) {
	var cTmp;
	var nL;
	var nT;
	// save game time
	cTmp = "{" + this.BPGN[nNode].cTime + "} ";
	nL = this.cSaveGameString.length;
	nT = cTmp.length;
	if (this.cSaveGameString.charAt(nL - 1) == ' ') {
		if ((nL + nT) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
	} else {
		if ((nL + nT + 1) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		} else {
			if (this.cSaveGameString.length > 0) this.cSaveGameString += " ";
		};
	};
	this.cSaveGameString += cTmp;
}

function BPGN_SaveMove(nNode) {
	var cTmp;
	var nL;
	var nT;
	// save game move
	cTmp = this.BPGN[nNode].cMove;
	nL = this.cSaveGameString.length;
	nT = cTmp.length;
	if ((this.cSaveGameString.charAt(nL - 1) == ' ') || (this.cSaveGameString.charAt(nL - 1) == '(')) {
		if ((nL + nT) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
	} else {
		if ((nL + nT + 1) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		} else {
			if (this.cSaveGameString > 0) this.cSaveGameString += " ";
		};
	};
	this.cSaveGameString += cTmp;
}

function BPGN_SaveNote(nNode) {
	var nC;
	var nL;
	var nI;
	var cTmp;
	nC = this.BPGN[nNode].cNote.length;
	if (nC == 0) return false;
	nL = this.cSaveGameString.length;
	if (this.cSaveGameString.charAt(nL - 1) == ' ') {
		if ((nL + 4) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
	} else {
		if ((nL + 4 + 1) > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		} else {
			if (this.cSaveGameString.length > 0) this.cSaveGameString += " ";
		};
	};
	this.cSaveGameString += "{C:";
	for (nI = 0; nI < nC; nI++) {
		if (this.cSaveGameString.length >= BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString;
			this.cSaveGameString = "";
		};
		cTmp = this.BPGN[nNode].cNote.charAt(nI);
		if (this.cSaveGameString.length + 1 >= BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
		this.cSaveGameString += cTmp;
	};
	nL = this.cSaveGameString.length;
	if ((nL + 1) > BPGN_LINE_SIZE) {
		this.sgame += this.cSaveGameString + '\n';
		this.cSaveGameString = "";
	};
	this.cSaveGameString += "}";
	return true;
}

function BPGN_SaveBody(nNode) {
	var nMain;
	var nI;
	var nN;
	var nL;
	// must be a valid index
	if ((nNode < 0) || (nNode >= this.BPGN.length)) return;
	// node must be in use
	if (!this.BPGN[nNode]) return;

	// find the node's next move main line and produce move, time, annotation, and note
	nMain = -1;
	for (nI = 0; nI < this.BPGN[nNode].nNext.length; nI++) {
		nN = this.BPGN[nNode].nNext[nI];
		if ((nN > 0) && (nN < this.BPGN.length)) {
			nMain = nN;
			this.BPGN_SaveMove(nMain);
			this.BPGN_SaveTime(nMain);
			this.BPGN_SaveAnno(nMain);
			this.BPGN_SaveNote(nMain);
			break;
		};
	};

	// process the nodes' variation line and produce move, time, annotation, and note
	for (nI = 0; nI < this.BPGN[nNode].nNext.length; nI++) {
		// get nNode's variation next move index
		nN = this.BPGN[nNode].nNext[nI];
		// must be a valid index
		if ((nN <= 0) || (nN >= this.BPGN.length)) continue;

		// must not be the nNode's main line next move
		if (nN == nMain) continue;
		// begin variation --> add a '(' symbol
		nL = this.cSaveGameString.length;
		if (this.cSaveGameString.charAt(nL - 1) == ' ') {
			if ((nL + 1) > BPGN_LINE_SIZE) {
				this.sgame += this.cSaveGameString + '\n';
				this.cSaveGameString = "";
			};
		} else {
			if ((nL + 1 + 1) > BPGN_LINE_SIZE) {
				this.sgame += this.cSaveGameString + '\n';
				this.cSaveGameString = "";
			} else {
				this.cSaveGameString += " ";
			};
		};
		this.cSaveGameString += "(";

		// process nNode's sibling move
		this.BPGN_SaveMove(nN);
		this.BPGN_SaveTime(nN);
		this.BPGN_SaveAnno(nN);
		this.BPGN_SaveNote(nN);
		// continue the variation processing
		this.BPGN_SaveBody(nN);
		// end variation --> add a ')' symbol
		if (this.cSaveGameString.length + 1 > BPGN_LINE_SIZE) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
		this.cSaveGameString += ")";
	};
	// process nNode's main line's next move
	if (nMain != -1) {
		this.BPGN_SaveBody(nMain);
	};
}

function BPGN_SaveGame() {
	var nL;
	this.cSaveGameString = '';
	this.sgame = '';
	this.sgame += '[Event "' + this.gameevent + '"]\n';
	this.sgame += '[Site "' + this.gamesite + '"]\n';
	this.sgame += '[Date "' + this.gamedate + '"]\n';
	this.sgame += '[WhiteA "' + this.whitea + '"][WhiteAElo "' + this.whiteaelo + '"]\n';
	this.sgame += '[BlackA "' + this.blacka + '"][BlackAElo "' + this.blackaelo + '"]\n';
	this.sgame += '[WhiteB "' + this.whiteb + '"][WhiteBElo "' + this.whitebelo + '"]\n';
	this.sgame += '[BlackB "' + this.blackb + '"][BlackBElo "' + this.blackbelo + '"]\n';
	this.sgame += '[TimeControl "' + this.timecontrol + '"]\n';
	this.sgame += '[Result "' + this.gameresult + '"]\n';

	this.sgame += '[Setup "1"]\n';

	this.sgame += '[FEN "' + this.a.initial_bfen + ' | ' + this.b.initial_bfen + '"]\n';
	this.sgame += '\n';



	// check for before game start note
	if (this.BPGN_SaveNote(BPGN_ROOT)) {
		nL = this.cSaveGameString.length;
		if (nL > 0) {
			this.sgame += this.cSaveGameString + '\n';
			this.cSaveGameString = "";
		};
	};
	// save rest of the game
	this.BPGN_SaveBody(BPGN_ROOT);
	// save remaining line
	if (this.cSaveGameString.length > 0) {
		this.sgame += this.cSaveGameString;
	};
	this.sgame += '\n';
	// save BPGN game result
	this.sgame += '{' + this.cResult1 + '} ' + this.cResult2 + '\n';

	/*
	this.RTFTextPosition=""
	+'<p class="bughousechess24">'
	+'&nbsp;&nbsp;&nbsp;,t,m, , ,  , , , , , ,<br/>'
	+'>!""""""""#!""""""""# <br/>'
	+'&nbsp;$t+ +lVg+%$ Kq+ B R% <br/>'
	+'&nbsp;$OoOvWoPy%$Pn+b+pPp% <br/>'
	+'&nbsp;$ +m+oOm+%$ +nOp+ +% <br/>'
	+'&nbsp;$+ +o+ + %$R Op+ + % <br/>'
	+'&nbsp;$ + P + +%$oW O V +% <br/>'
	+'&nbsp;$P N PpP %$+ + +m+ % <br/>'
	+'&nbsp;$ Pp+ +bP%$ Oo+ OoO% <br/>'
	+'&nbsp;$R BqK + %$T +l+ +t% <br/>'
	+'&nbsp;/(((((((()/(((((((()<<br/>'
	+'&nbsp;  , , , ,p,  , , , ,v<br/>'
	+'</p>';
	*/

	if (this.numboard == 1) {
		this.RTFTextPosition = this.a.generateRTFTextPosition(this.a.flip);
	} else if (this.numboard == 2) {
		if (this.a.flip) {
			this.RTFTextPosition = MultilineStringsConcatenate(this.b.generateRTFTextPosition(0), this.a.generateRTFTextPosition(1));
		} else {
			this.RTFTextPosition = MultilineStringsConcatenate(this.a.generateRTFTextPosition(0), this.b.generateRTFTextPosition(1));
		}
	}

}




function assmdown(ind, viewer, bd) {
	var v = eval(viewer);
	v.mdown(ind, bd);
	return false;
}

function assmup(ind, viewer, bd) {
	var v = eval(viewer);
	v.mup(ind, bd);
	return false;
}

function assmup2(ind, viewer, bd) {
	var v = eval(viewer);
	//if sq src = sq target let sq src

	var lsqorig = v.movestart.substring(v.movestart.length - 2, v.movestart.length);
	var lsqtarget = '' //+bd
		+
		(((bd == 'a' && v.a.flip == 0) || (bd == 'b' && v.b.flip == 0)) ? squareIndexToText(ind) : squareIndexToText(63 - ind));
	//alert(lsqorig+' vs '+lsqtarget);
	if (lsqorig == lsqtarget || ind > 63)
		return false;
	if (v.movestart == '') {
		v.mdown(ind, bd);
	} else {
		v.mup(ind, bd);
	};
	return false;
}


function assclick(ind, viewer, bd) {
	var v = eval(viewer);
	if (v.movestart == '' ||
		ind < 0 || ind > 63) //allowing retaking after touching piece in hand
	{
		v.mdown(ind, bd);
	} else {
		v.mup(ind, bd);
	};
	return false;
}

function BPGNRepairMove(fMove) {
	//correction of bpgn move to be short notation for pawn moves and readabla in BPGNView3 and DCB
	var idx = fMove.indexOf('.') - 1;
	var moveOnly = fMove.substr(idx + 2); //move without move counter, board designation, and dot

	if (moveOnly.charAt(0) == 'p') //moves like p@ to P@
	{
		moveOnly = moveOnly.replace('p', 'P');
	} else if (moveOnly.charAt(0) <= 'h' && moveOnly.charAt(0) >= 'a') {
		if (moveOnly.charAt(2) == 'x') //only pawn takes like d4xe5
		{
			moveOnly = moveOnly.charAt(0) + moveOnly.substr(2);
		} else //only pawn move like d2d4
			moveOnly = moveOnly.substr(2);
	}
	var outBPGNMove = fMove.substr(0, idx + 2) + moveOnly;
	return outBPGNMove;
};

function tobpgn(mv) {
	var bd = mv.board,
		wh = mv.side,
		p = mv.frompiece.charAt(1);
	var c = '',
		fr = mv.fromsquare,
		prom = '';
	if (wh == 'w') bd = bd.toUpperCase();
	//Castling are in code above lowcase
	if (fr == 'o-o-o') return bd + '.O-O-O';
	if (fr == 'o-o') return bd + '.O-O';
	fr = fr < 64 ? indtosq(fr) : '@';
	if (p != 'p') {
		p = p.toUpperCase();
	} else {
		if (fr != '@') p = '';
	}
	if (mv.topiece != '' || mv.frompiece.substr(-2) == "px") c = 'x';
	if (mv.frompiece.length == 3 && mv.frompiece.charAt(2) != 'x') {
		prom = '=' + mv.frompiece.charAt(2);
		prom = prom.toUpperCase();
	}
	var lsMoveText = bd + '.' + p + fr + c + indtosq(mv.tosquare) + prom;
	lsMoveText = BPGNRepairMove(lsMoveText);
	return lsMoveText;
}

function mdown(ind, bd) {
	var src;
	if (this.displaymode == 'diagram') {
		return;
	};
	var out = eval('document.' + this.viewername + '.lastmove' + bd);
	var tbd = eval('this.' + bd);
	var c = '';
	if ((ind < 0) || (ind > 73)) return;
	if (ind < 64) {
		ind = indtoind(ind, tbd.flip);
		if (tbd.isempty(ind)) return;
		if (tbd.pos[ind].charAt(0) != whosmove(tbd.turn)) return;
		src = indtosq(ind);
		c = tbd.pos[ind].charAt(1);
		if (c == 'p') {
			c = '';
		};
		this.movestart = bd + c + src;
		out.value = tbd.turn + '.' + (this.movestart.substr(1, this.movestart.length));
		return;
	};
	ind = ind - 64;
	if (tbd.flip != 0) {
		ind = 9 - ind;
	};
	if (whosmove(tbd.turn) != tbd.dropbar[ind].charAt(0)) {
		return;
	};
	this.movestart = bd + tbd.dropbar[ind].charAt(1) + '@';
	out.value = tbd.turn + '.' + (this.movestart.substr(1, this.movestart.length));
	return;
}

function mup(ind, bd) {
	if (this.displaymode == 'diagram') {
		return;
	};
	var tmp = this.movestart;
	var dest;
	var out = eval('document.' + this.viewername + '.lastmove' + bd);
	this.movestart = '';
	out.value = '';
	var tbd = eval('this.' + bd);
	if (tmp.charAt(0) != bd) return;
	tmp = tmp.substr(1, tmp.length);
	if ((ind < 0) || (ind > 63)) return;
	ind = indtoind(ind, tbd.flip);
	dest = indtosq(ind);
	tmp += dest;
	tmp = tmp.toLowerCase();
	if ((tmp == 'ke1g1') || (tmp == 'ke8g8')) {
		tmp = 'o-o';
	};
	if ((tmp == 'ke1c1') || (tmp == 'ke8c8')) {
		tmp = 'o-o-o';
	};
	if ((tmp.charAt(0) == 'p') && (tmp.charAt(1) != '@')) {
		tmp = tmp.substr(1, tmp.length)
	};
	this.execmove(bd, tmp);
}

function getbpgnheaders(bpgntext) {
	//first initialize properties that come from bpgn header
	this.gameevent = bpgnheader(bpgntext, BPGN_EVENT);
	if (this.gameevent == '') {
		this.gameevent = "bughouse chess game"
	};
	this.gamedate = bpgnheader(bpgntext, BPGN_DATE);
	if (this.gamedate == '') {
		var the_date = new Date();
		this.gamedate = the_date.getFullYear() + '.' + fixnumber(1 + the_date.getMonth()) + '.' + fixnumber(the_date.getDate())
	};
	this.gamesite = bpgnheader(bpgntext, BPGN_SITE);
	if (this.gamesite == '') {
		this.gamesite = DEFAULT_SITE
	};
	this.timecontrol = bpgnheader(bpgntext, BPGN_TIMECTRL);
	if (this.timecontrol == '') {
		this.timecontrol = DEFAULT_TIME + '+' + DEFAULT_INC
	};
	var tmp = this.timecontrol.split('+');
	this.gametime = parseInt(tmp[0]); /* numerical: seconds per game, maybe redundant */
	if (this.gametime == NaN) {
		this.gametime = eval(DEFAULT_TIME)
	};
	this.gameinc = parseInt(tmp[1]); /* numerical: time increment */
	if (this.gameinc == NaN) {
		this.gameinc = eval(DEFAULT_INC);
	};
	this.gameresult = bpgnheader(bpgntext, BPGN_RESULT);
	if (this.gameresult == '') {
		this.gameresult = DEFAULT_RESULT
	};

	this.whitea = bpgnheader(bpgntext, BPGN_WHITEA);
	if (this.whitea == '') {
		this.whitea = DEFAULT_WHITEA
	};
	this.blacka = bpgnheader(bpgntext, BPGN_BLACKA);
	if (this.blacka == '') {
		this.blacka = DEFAULT_BLACKA
	};
	this.whiteb = bpgnheader(bpgntext, BPGN_WHITEB);
	if (this.whiteb == '') {
		this.whiteb = DEFAULT_WHITEB
	};
	this.blackb = bpgnheader(bpgntext, BPGN_BLACKB);
	if (this.blackb == '') {
		this.blackb = DEFAULT_BLACKB
	};

	this.whiteaelo = bpgnheader(bpgntext, BPGN_WHITEAELO);
	if (this.whiteaelo == '') {
		this.whiteaelo = DEFAULT_RATING
	};
	this.blackaelo = bpgnheader(bpgntext, BPGN_BLACKAELO);
	if (this.blackaelo == '') {
		this.blackaelo = DEFAULT_RATING
	};
	this.whitebelo = bpgnheader(bpgntext, BPGN_WHITEBELO);
	if (this.whitebelo == '') {
		this.whitebelo = DEFAULT_RATING
	};
	this.blackbelo = bpgnheader(bpgntext, BPGN_BLACKBELO);
	if (this.blackbelo == '') {
		this.blackbelo = DEFAULT_RATING
	};
	return true;
}

function drawboard() /* generates html for the board */ {
	var size = this.sqsize;
	var sqsize = 'width="' + size + 'px" height="' + size + 'px"';

	var tago = "<b>";
	var tagc = "</b>"; /*opening and closing tags to emphasize players handle and ratings (and times) */
	var up;
	var u;
	var d;
	var dn;
	var s;
	var k;
	var bd = this.boardname;
	if (this.flip == 1) {
		up = "white";
		u = "w";
		dn = "black";
		d = "b"
	} else {
		up = "black";
		dn = "white";
		u = "b";
		d = "w"
	}
	var tmp = '';
	tmp = tmp + '<table border="0" cellpadding="0" width="100%">';
	tmp = tmp + '<tr>';

	tmp += ' <td align="left" valign="bottom">';
	tmp += '<image src="' + this.gifs["nmv"] + '" width="24" height="20" name ="' + this.viewername + 'upmv' + bd + '">';
	if ((this.reloadmode == "noreload") && (this.displaymode == "diagram")) {
		tmp = tmp + tago;
		tmp = tmp + "  " + totime(eval('this.' + u + 'clock')) + tagc;
	} else {
		tmp = tmp + ' <input class="normal" type="text" size="12" name="' + 'upclock' + bd + '" onFocus="this.blur();"> '
	};
	tmp = tmp + '</td>';

	tmp += ' <td align="center" valign="bottom">';
	if (this.reloadmode == "noreload") {
		tmp = tmp + tago + eval('this.' + up) + '   ' + this.rdo + eval('this.' + up + 'elo') + this.rdc + tagc
	} else {
		tmp = tmp + ' <input type="text" size="16" name="up' + bd + '" onFocus="this.blur();"> '
	};
	tmp = tmp + '</td>';

	tmp += ' </tr> </table>';
	tmp = tmp + '<center><table border="1"> <tr> <td rowspan="2">';
	var t = "";
	var i;
	var j;
	var objn = this.viewername + '.' + bd;
	var ind;
	t += '<TABLE BORDER=0 CELLSPACING=0 CELLPADDING=0 COLS=8>';
	for (i = 0; i < 8; i++) {
		t += '<tr>';
		for (j = 0; j < 8; j++) {
			ind = 8 * i + j;
			//t+='<td id="tdsquare'+bd+ind+'"'+ ((this.filebg)?'BACKGROUND="':'BGCOLOR="')+ ((i + j) % 2 ? this.gifs["b"] : this.gifs["w"]);
			t += '<td id="tdsquare' + bd + ind + '"' + 'style="';
			if (this.filebg) {
				t += "background-image:" + "url(" + this.gifs["tr"] + '),' +
					"url(" + ((i + j) % 2 ? this.gifs["b"] : this.gifs["w"]) + '); background-size: 100% 100%; background-repeat:no-repeat;';
			} else {
				t += 'background-color:' + ((i + j) % 2 ? this.gifs["b"] : this.gifs["w"]);
			};
			t += '">';
			t += '<a href="javascript:void(0)" onclick="if (!eventedmousedown) assclick(' + ind + ",'" + this.viewername + "','" + bd + "');" + '" onmousedown=\"eventedmousedown=true;assclick(' + ind + ",'" + this.viewername + "','" + bd + "');event.preventDefault();" + '" onmouseup="assmup2(' + ind + ",'" + this.viewername + "','" + bd + "');" + '">'; //works click click and also drag move on pc and android where no mousedown

			t += '<img id="imgsquare' + bd + ind + '" src="' + this.gifs["d"] + '" border="0" ' + sqsize + '></a></td>';
			//style=\"border: 0px outset green;\"
		};
		/* onMouseDown="assmdown('+ind+",'"+this.viewername+"','"+bd+"');"+'" onMouseUp="assmup('+ind+",'"+this.viewername+"','"+bd+"');"+'" */
		t += '</tr>';
	};
	t += '</table>';
	t.length -= 4;
	insert(t, t.indexOf("height") + 11, ' name="' + this.viewername + bd + 'uleft">');
	tmp += t;
	t = "";
	tmp = tmp + '</td>'; // <td rowspan="2">&nbsp;</td>
	tmp += ' <td NOWRAP rowspan="2">';
	for (i = 0; i < 5; i++) {
		for (j = 0; j < 2; j++) {
			ind = 64 + i * 2 + j;
			//t+='<a href="javascript:void(0)" onmousedown="assclick('+ind+",'"+this.viewername+"','"+bd+"');"+'">'; //click click on any device
			t += '<a href="javascript:void(0)" onclick="if (!eventedmousedown) assclick(' + ind + ",'" + this.viewername + "','" + bd + "');" + '" onmousedown=\"eventedmousedown=true;assclick(' + ind + ",'" + this.viewername + "','" + bd + "');event.preventDefault();" + '" onmouseup="assmup2(' + ind + ",'" + this.viewername + "','" + bd + "');" + '">'; //works click click and also drag move on pc and also android without mousedown

			t += '<img id="imgsquare' + bd + ind + '" src="' + this.gifs["d"] + '" border="0"' + sqsize + '></a>';
			if ((this.displaymode != "diagram") || (this.reloadmode != "noreload")) {
				k = i * 2 + j;
				s = 'h' + bd + k;
				t += '<input type="text" size="1" name="' + s + '" value=" " onFocus="this.blur();">';
			} else {
				if (this.flip == 0) {
					s = this.hold[2 * i + j];
				} else {
					s = this.hold[9 - 2 * i - j];
				}
				if (s > 1) {
					t += s
				} else {
					t += ' '
				}
			};
		}
		t += '<br>';
	};
	tmp += t;
	tmp += "<textarea style='display: none;' readonly disabled id='dntells" + bd + "' rows=2 cols=10 value=\"bubu\"></textarea>";
	tmp = tmp + '</td> </tr> </table> </center> ';
	tmp = tmp + '<table border="0" cellpadding="0" width="100%">';
	tmp = tmp + '<tr>';

	tmp += ' <td align="left" valign="top">';
	tmp += '<image src="' + this.gifs["nmv"] + '" width="24" height="20" name ="' + this.viewername + 'dnmv' + bd + '">';
	if ((this.reloadmode == "noreload") && (this.displaymode == "diagram")) {
		tmp = tmp + tago;
		tmp = tmp + "  " + totime(eval('this.' + d + 'clock')) + tagc;
	} else {
		tmp = tmp + ' <input class="normal" type="text" size="12" name="' + 'dnclock' + bd + '" onFocus="this.blur();"> '
	};
	tmp = tmp + '</td>';

	tmp += ' <td align="center" valign="top">';
	//here is readonly and disabled because of smartphones and android tablets to no focus and opening keyboard but hold playing board arranged on screeen!
	if (this.displaymode != 'diagram') {
		tmp += '<input hidden readonly type="text" size="12" name="lastmove' + bd + '" value=" " onChange="assexecmove(this.value,\'' + bd + '\',\'' + this.viewername + "'" + ')"> ';
	};

	if (this.reloadmode == "noreload") {
		tmp = tmp + tago + eval('this.' + dn) + '   ' + this.rdo + eval('this.' + dn + 'elo') + this.rdc + tagc
	} else {
		if (this.displaymode != "diagram") {
			tmp += ' <input type="text" size="16" name="dn' + bd + '" onFocus="assexecmove(document.' + this.viewername + '.lastmove' + bd + '.value,' + "'" + bd + "','" + this.viewername + "'" + '); this.blur();"> '
		} else {
			tmp += ' <input type="text" size="16" name="dn' + bd + '" onFocus="this.blur();"> '
		};
	};
	tmp = tmp + '</td>';


	tmp += ' </tr> </table>';
	return tmp;
}

function brefreshform() {
	if (!this.redraw) return;
	var bd = this.boardname;
	var wh = whosmove(this.turn);
	var upmove;
	if (((this.flip == 0) && (wh == 'b')) || ((this.flip == 1) && (wh == 'w'))) {
		upmove = true
	} else {
		upmove = false
	};
	var t = eval('window.document.' + this.viewername);
	var i;
	var s;
	var k;
	var outc;

	s = eval('document.' + this.viewername + 'upmv' + bd); /* show whose move is now */
	k = eval('document.' + this.viewername + 'dnmv' + bd);
	if (upmove) {
		s.src = this.gifs["mv"];
		k.src = this.gifs["nmv"]
	} else {
		k.src = this.gifs["mv"];
		s.src = this.gifs["nmv"]
	};

	if ((this.displaymode != "diagram") || (this.reloadmode != "noreload")) {
		s = eval('document.' + this.viewername + '.upclock' + bd); /*refresh clocks */
		k = eval('document.' + this.viewername + '.dnclock' + bd);
		if (this.flip == 1) {
			s.value = totime(this.wclock);
			k.value = totime(this.bclock);
		} else {
			s.value = totime(this.bclock);
			k.value = totime(this.wclock);
		}

		/* if (upmove) {outc=eval('document.'+this.viewername+'.upclock'+bd)}
		else{outc=eval('document.'+this.viewername+'.dnclock'+bd);};
		outc.select();*/

		for (i = 0; i < 10; i++) {
			/*refresh holdings */
			s = eval('t.h' + bd + i);
			if (this.flip == 0) {
				k = this.hold[i];
			} else {
				k = this.hold[9 - i]
			};
			if (k > 0) {
				s.value = k
			} else {
				s.value = ""
			};
		}

	};

	if ((this.reloadmode) != "noreload") /*refresh handles */ {
		s = eval('document.' + this.viewername + '.up' + bd);
		k = eval('document.' + this.viewername + '.dn' + bd);
		if (this.flip == 1) {
			s.value = this.white + ' ' + this.rdo + this.whiteelo + this.rdc;
			k.value = this.black + ' ' + this.rdo + this.blackelo + this.rdc;
		} else {
			s.value = this.black + ' ' + this.rdo + this.blackelo + this.rdc;
			k.value = this.white + ' ' + this.rdo + this.whiteelo + this.rdc;
		};
	};

}


function setauleft() {
	this.a.uleft = (this.numboard == 2) ? document.images.length - 151 : document.images.length - 75;
	this.b.uleft = this.a.uleft + 76;
}

function redrawhold(piece, inc) {
	if (!this.redraw) return;
	var ind = this.syncpic();
	var i;
	var tmp;
	for (i = 0; i < 10; i++) {
		if (this.dropbar[i] == piece) break;
	}
	if (i > 9) return;
	this.hold[i] += inc;
	if (this.flip == 0) {
		if (this.hold[i] > 0) {
			document.images[ind + 64 + i].src = this.gifs[piece + 'd']
		} else {
			document.images[ind + 64 + i].src = this.gifs['d']
		};
		tmp = i;
	} else {
		if (this.hold[i] > 0) {
			document.images[ind + 73 - i].src = this.gifs[piece + 'd']
		} else {
			document.images[ind + 73 - i].src = this.gifs['d']
		};
		tmp = 9 - i;
	};

	tmp = 'window.document.' + this.viewername + '.h' + this.boardname + tmp;
	s = eval(tmp);
	if (this.displaymode != 'diagram') {
		(this.hold[i] == 0) ? (s.value = '') : (s.value = this.hold[i]);
	};
}

function dropmove(mv) {
	var wh = whosmove(this.turn);
	var king = ((wh == 'w') ? this.kingw : this.kingb);
	this.pos[mv.tosquare] = mv.frompiece;
	if (this.incheck(wh, king)) {
		this.pos[mv.tosquare] = '';
		return false;
	};
	this.redrawsquare(mv.tosquare);
	this.redrawhold(mv.frompiece, -1);
	if (mv.frompiece == 'br') {
		if ((mv.tosquare == sqtoind('h8')) && (this.shortcastleb == 'rook')) {
			this.shortcastleb = true;
		};
		if ((mv.tosquare == sqtoind('a8')) && (this.longcastleb == 'rook')) {
			this.longcastleb = true;
		};
	};
	if (mv.frompiece == 'wr') {
		if ((mv.tosquare == sqtoind('h1')) && (this.shortcastlew == 'rook')) {
			this.shortcastlew = true;
		};
		if ((mv.tosquare == sqtoind('a1')) && (this.longcastlew == 'rook')) {
			this.longcastlew = true;
		};
	};
	return true;
}

function undodropmove(mv) {
	var wh = mv.side;
	this.pos[mv.tosquare] = '';
	this.redrawsquare(mv.tosquare);
	this.redrawhold(mv.frompiece, 1);
}

function enpassant(bd, mv) {
	var cp = mv.frompiece.charAt(0) + mv.frompiece.charAt(1);
	var tbd = eval('this.' + bd);
	var wh = whosmove(tbd.turn);
	var king = eval('this.' + bd + '.king' + wh);
	tbd.pos[mv.tosquare] = cp;
	tbd.pos[mv.fromsquare] = '';
	var enpass = ((wh == 'w') ? (mv.tosquare + 8) : (mv.tosquare - 8));
	if (tbd.pos[enpass] != othercolor(wh) + 'p') {
		return false;
	};
	tbd.pos[enpass] = '';
	if (tbd.incheck(wh, king)) {
		tbd.pos[mv.fromsquare] = cp;
		tbd.pos[mv.tosquare] = mv.topiece;
		tbd.pos[enpass] = othercolor(wh) + 'p';
		return false
	};
	this.capture(bd, othercolor(wh) + 'p', 1);
	tbd.redrawsquare(mv.fromsquare);
	tbd.redrawsquare(mv.tosquare);
	tbd.redrawsquare(enpass);
	return true;
}

function undoenpassant(mv) {
	var tbd = eval('this.' + mv.board);
	var wh = mv.side;
	var cp = wh + 'p';
	var bd = mv.board;
	tbd.pos[mv.fromsquare] = cp;
	tbd.pos[mv.tosquare] = '';
	var enpass = ((wh == 'w') ? (mv.tosquare + 8) : (mv.tosquare - 8));
	tbd.pos[enpass] = othercolor(wh) + 'p';
	this.capture(bd, othercolor(wh) + 'p', -1);
	tbd.redrawsquare(enpass);
	tbd.redrawsquare(mv.tosquare);
	tbd.redrawsquare(mv.fromsquare);
}

function promotion(bd, mv) {
	var tbd = eval('this.' + bd);
	var wh = whosmove(tbd.turn);
	var king = eval('this.' + bd + '.king' + wh);
	var p = mv.frompiece.charAt(2);
	p = p.toUpperCase();
	tbd.pos[mv.tosquare] = mv.frompiece.charAt(0) + p;
	tbd.pos[mv.fromsquare] = '';
	if (tbd.incheck(wh, king)) {
		tbd.pos[mv.fromsquare] = mv.frompiece;
		tbd.pos[mv.tosquare] = mv.topiece;
		return false
	}
	tbd.redrawsquare(mv.fromsquare);
	tbd.redrawsquare(mv.tosquare);
	if (mv.topiece != '') {
		this.capture(bd, mv.topiece, 1);
	};
	return true;
}

function undopromotion(mv) {
	var tbd = eval('this.' + mv.board);
	var bd = mv.board;
	var wh = mv.side;
	tbd.pos[mv.fromsquare] = wh + 'p';
	tbd.pos[mv.tosquare] = mv.topiece;
	tbd.redrawsquare(mv.tosquare);
	tbd.redrawsquare(mv.fromsquare);
	if (mv.topiece != '') {
		this.capture(bd, mv.topiece, -1);
	};
}

function regularmove(mv) {
	var bd = mv.board;
	var tbd = eval('this.' + bd);
	var wh = mv.side;
	tbd.pos[mv.fromsquare] = '';
	tbd.pos[mv.tosquare] = mv.frompiece;
	tbd.redrawsquare(mv.fromsquare);
	tbd.redrawsquare(mv.tosquare);
	if (mv.topiece != '') {
		this.capture(bd, mv.topiece, 1);
	};
	return true;
}

function undoregularmove(mv) {
	var tbd = eval('this.' + mv.board);
	var wh = mv.side;
	if (mv.frompiece.charAt(1) == 'k') {
		if (wh == 'w') {
			tbd.kingw = mv.fromsquare
		} else {
			tbd.kingb = mv.fromsquare
		};
	};
	tbd.pos[mv.fromsquare] = mv.frompiece;
	tbd.pos[mv.tosquare] = mv.topiece;
	if (mv.topiece != '') {
		this.capture(mv.board, mv.topiece, -1);
	};
	tbd.redrawsquare(mv.tosquare);
	tbd.redrawsquare(mv.fromsquare);
}

function shortcastle(color) {
	var tmp = eval('this.shortcastle' + color);
	return tmp;
}

function longcastle(color) {
	var tmp = eval('this.longcastle' + color);
	return tmp;
}


function setking(mv) {
	var t = mv.fromsquare + 's';
	t = t.substr(0, t.length - 1);
	var wh = whosmove(this.turn);
	if (this.pos[sqtoind('e1')] != 'wk') {
		this.shortcastlew = 'king';
		this.longcastlew = 'king';
	};
	if (this.pos[sqtoind('e8')] != 'bk') {
		this.shortcastleb = 'king';
		this.longcastleb = 'king';
	};
	if (mv.frompiece == 'wk') {
		if (t.charAt(0) != 'o') {
			this.kingw = mv.tosquare;
		};
		if (t == 'o-o-o') {
			this.kingw = sqtoind('c1');
		};
		if (t == 'o-o') {
			this.kingw = sqtoind('g1');
		};
	};
	if (mv.frompiece == 'bk') {
		if (t.charAt(0) != 'o') {
			this.kingb = mv.tosquare;
		};
		if (t == 'o-o-o') {
			this.kingb = sqtoind('c8');
		};
		if (t == 'o-o') {
			this.kingb = sqtoind('g8');
		};
	};
	if (this.shortcastlew != 'king') {
		if (this.pos[sqtoind('h1')] != 'wr') {
			this.shortcastlew = 'rook';
		};
		if (this.pos[sqtoind('a1')] != 'wr') {
			this.longcastlew = 'rook';
		};
	};
	if (this.shortcastleb != 'king') {
		if (this.pos[sqtoind('h8')] != 'br') {
			this.shortcastleb = 'rook';
		};
		if (this.pos[sqtoind('a8')] != 'br') {
			this.longcastleb = 'rook';
		};
	};
	return;
}

function castle(bd, mode) {
	var d = ((mode == 'short') ? 4 : 5);
	var dir = ((mode == 'short') ? 1 : -1);
	var s = new Array(d);
	var i;
	var tbd = eval('this.' + bd);
	var wh = whosmove(tbd.turn);
	var cc = ((mode == 'short') ? tbd.shortcastle(wh) : tbd.longcastle(wh));
	var king = eval('this.' + bd + '.king' + wh);
	var rr;
	if (wh == 'w') {
		s[0] = sqtoind('e1');
	} else {
		s[0] = sqtoind('e8');
	};
	for (i = 1; i < d; i++) s[i] = s[i - 1] + dir;
	rr = tbd.pos[s[d - 1]];
	if (this.rule == 'international') {
		if (cc != true) return false;
		for (i = 1; i < d - 1; i++) {
			if (!tbd.isempty(s[i])) {
				return false;
			};
		};
		for (i = 0; i < 3; i++) {
			if (tbd.incheck(wh, s[i])) {
				return false;
			};
		};
		for (i = 0; i < d; i++) {
			tbd.pos[s[i]] = '';
		};
		tbd.pos[s[2]] = wh + 'k';
		tbd.pos[s[1]] = rr;
	};
	if (this.rule == 'swedish') {
		if ((king != s[0]) || (rr.toLowerCase() != (wh + 'r'))) {
			return false;
		};
		var tmp = new Array(d);
		for (i = 0; i < d; i++) {
			tmp[i] = tbd.pos[s[i]];
			tbd.pos[s[i]] = '';
		}
		tbd.pos[s[2]] = wh + 'k';
		tbd.pos[s[1]] = rr;
		if (tbd.incheck(wh, s[2])) {
			for (i = 0; i < d; i++) {
				tbd.pos[s[i]] = tmp[i];
			};
			return false;
		};
		for (i = 1; i < d - 1; i++) {
			this.capture(bd, tmp[i], 1);
		};
	};
	for (i = 0; i < d; i++) {
		tbd.redrawsquare(s[i]);
	};
	delete s;
	return true;
}

/*
function undocastle(bd,mode,dpiece,wh)
{
 var d=((mode=='short')?4:5);
 var dir=((mode=='short')?1:-1);
 var i;
 var s=new Array(d);
 var tbd=eval('this.'+bd);
 if (wh=='w') {s[0]=sqtoind('e1');} else {s[0]=sqtoind('e8');};
 for (i=1;i<d;i++) {s[i]=s[i-1]+dir};
 tbd.pos[s[0]]=wh+'k'; tbd.pos[s[d-1]]=wh+'r';
 for (i=1;i<d-1;i++) {tbd.pos[s[i]]='';};
 if (this.rule=='swedish') {;};
 for (i=0;i<d;i++) {tbd.redrawsquare(s[i]);};
}
*/

function undocastle(bd, mode, dpiece, wh) {
	var d = ((mode == 'short') ? 4 : 5);
	var dir = ((mode == 'short') ? 1 : -1);
	var i;
	var s = new Array(d);
	var tbd = eval('this.' + bd);
	if (wh == 'w') {
		s[0] = sqtoind('e1');
		tbd.kingw = s[0]; //SKAcz 2020 repairing bug in undo castling which caused bad square "checked"
	} else {
		s[0] = sqtoind('e8');
		tbd.kingb = s[0]; //SKAcz 2020 repairing bug in undo castling which caused bad square "checked"
	};
	for (i = 1; i < d; i++) {
		s[i] = s[i - 1] + dir
	};
	tbd.pos[s[0]] = wh + 'k';
	tbd.pos[s[d - 1]] = wh + 'r';
	for (i = 1; i < d - 1; i++) {
		tbd.pos[s[i]] = '';
	};
	if (this.rule == 'swedish') {
		;
	};
	for (i = 0; i < d; i++) {
		tbd.redrawsquare(s[i]);
	};
}


function setenpasssq(mv) {
	if ((mv.frompiece.charAt(1) == 'p') && (Math.abs(mv.fromsquare - mv.tosquare) == 16)) {
		this.enpasssq = (mv.fromsquare + mv.tosquare) / 2
	} else {
		this.enpasssq = ''
	}
}

function backupmove(mv) {
	var obd = this.otherbd(mv.board);
	mv.backuptime = (whosmove(obd.turn) == 'w') ? obd.wclock : obd.bclock;
	var bd = eval('this.' + mv.board);
	mv.backuptime1 = (whosmove(bd.turn) == 'w') ? bd.wclock : bd.bclock;
	var wh = whosmove(bd.turn);
	if (wh == 'w') {
		mv.backuplongcastle = bd.longcastlew;
		mv.backupshortcastle = bd.shortcastlew;
	} else {
		mv.backuplongcastle = bd.longcastleb;
		mv.backupshortcastle = bd.shortcastleb;
	}
	mv.backupenpassant = bd.enpasssq;
	return mv;
}

function refreshclock() {
	var v = eval(this.viewername);
	var formm = eval('window.document.' + this.viewername);
	if (v.a.flip == 1) {
		formm.upclocka.value = totime(v.a.wclock);
		formm.dnclocka.value = totime(v.a.bclock)
	} else {
		formm.upclocka.value = totime(v.a.bclock);
		formm.dnclocka.value = totime(v.a.wclock);
	};
	if (v.numboard != 1) {
		if (v.b.flip == 1) {
			formm.upclockb.value = totime(v.b.wclock);
			formm.dnclockb.value = totime(v.b.bclock)
		} else {
			formm.upclockb.value = totime(v.b.bclock);
			formm.dnclockb.value = totime(v.b.wclock);
		};
	};
}

function updateclock(viewer) {
	var v = eval(viewer);

	if (whosmove(v.a.turn) == 'w') {
		v.a.wclock += -1
	} else {
		v.a.bclock += -1
	};
	if (whosmove(v.b.turn) == 'w') {
		v.b.wclock += -1
	} else {
		v.b.bclock += -1
	};
	v.refreshclock();
	v.playtimeout = setTimeout("updateclock('" + viewer + "')", 1000);
}

function playmove(viewer) {
	var v = eval(viewer);
	assforward(1, 'c', viewer, 0);
	if (v.BPGN[v.currentmove].nNext.length == 0) {
		clearTimeout(v.playtimeout1);
		clearTimeout(v.playtimeout);
		var ob = eval('window.document.' + viewer);
		ob.play.value = 'Play';
		return;
	};
	var ind = v.BPGN[v.currentmove].nNext[0];
	var time = v.BPGN[ind].cTime;
	var bd = v.BPGN[ind].cBoard;
	var dif;
	if (bd == 'A') dif = v.a.wclock - time;
	if (bd == 'a') dif = v.a.bclock - time;
	if (bd == 'B') dif = v.b.wclock - time;
	if (bd == 'b') dif = v.b.bclock - time;
	if (time == BPGN_OMITED_TIME) dif = 0;
	if (dif < 0) {
		dif = 0
	};
	v.playtimeout1 = setTimeout("playmove('" + viewer + "')", dif * 1000 + PLAY_DELAY);
}

function assplay(viewer) {
	var v = eval(viewer);
	var ob = eval('window.document.' + viewer);
	if (ob.play.value == 'Play') {
		v.playtimeout = setTimeout("updateclock('" + viewer + "')", 1000);
		ob.play.value = 'Stop';
		playmove(viewer);
	} else {
		clearTimeout(v.playtimeout1);
		clearTimeout(v.playtimeout);
		ob.play.value = 'Play';
	};
}


function assforward(num, bd, viewer, opt) {
	var v = eval(viewer);
	var t;
	var f = 0;
	var mv;
	var moveind;
	var x;
	var tbd;
	if ((bd != 'a') && (bd != 'b')) {
		t = 'ab'
	} else {
		t = bd
	};
	while (f < num) {
		if (v.BPGN[v.currentmove].nNext.length < opt + 1) {
			v.refreshinfo();
			v.refreshhighlight()
			return;
		};

		moveind = v.BPGN[v.currentmove].nNext[opt];
		if (!v.BPGN[moveind].dmove) {
			tbd = eval('v.' + v.BPGN[moveind].cBoard.toLowerCase());
			move = v.decryptmove(tbd, v.BPGN[moveind].cMove);
			if (move == false) {
				return
			}; //illegal move
			v.BPGN[moveind].dmove = move;
		} else {
			move = v.BPGN[moveind].dmove
		};
		if (t.indexOf(move.board) >= 0) {
			f++;
		};
		v.forwardmove(moveind);
	};
	v.refreshclock();
	v.refreshinfo();
	v.refreshhighlight()
}

function assundomove(num, bd, viewer) {
	var f = 0;
	var t;
	var ind;
	var mbd;
	if ((bd != 'a') && (bd != 'b')) {
		t = 'ab'
	} else {
		t = bd
	};
	var v = eval(viewer);
	while (f < num) {
		if (v.currentmove == BPGN_ROOT) {
			v.refreshhighlight()
			return;
		}

		mbd = v.BPGN[v.currentmove].dmove.board;
		if (t.indexOf(mbd) >= 0) {
			f++;
		};
		v.undomove();
	};
	v.refreshhighlight()
}

function analysis(viewer) {
	var v = eval(viewer);
}



function assexecmove(text, bd, viewer) {
	var v = eval(viewer);
	v.execmove(bd, text);
	v.refreshhighlight()
}

function forwardmove(ind) {
	var mv = this.BPGN[ind].dmove; //mv = decrypted move
	var res;
	var bd = mv.board;
	var tbd = eval('this.' + bd);
	var tdif;
	mv = this.backupmove(mv);
	variouscases: {
		if (mv.fromsquare == 'o-o') {
			res = this.castle(bd, 'short');
			break variouscases;
		};
		if (mv.fromsquare == 'o-o-o') {
			res = this.castle(bd, 'long');
			break variouscases;
		};
		if (mv.fromsquare > 63) {
			res = tbd.dropmove(mv);
			break variouscases;
		};
		if ((mv.frompiece.length > 2) && (mv.frompiece.charAt(1) == 'p')) { //nonregular pawn move
			if (mv.frompiece.charAt(2) == 'x') {
				res = this.enpassant(bd, mv);
				break variouscases;
			} else {
				res = this.promotion(bd, mv);
				break variouscases;
			};
		}; /* now only regular moves are left */
		res = this.regularmove(mv);
		break variouscases;
	};
	if (res == false) return false;
	this.BPGN[ind].dmove = mv;
	var out = eval('document.' + this.viewername + '.lastmove' + bd);
	out.value = this.BPGN[ind].nMove + tobpgn(this.BPGN[ind].dmove);
	this.currentmove = ind;
	out.select();
	tbd.setenpasssq(mv);
	tbd.setking(mv);
	if (whosmove(tbd.turn) == 'w') {
		tdif = tbd.wclock - this.BPGN[ind].cTime;
		tbd.wclock += -tdif
	} else {
		tdif = tbd.bclock - this.BPGN[ind].cTime;
		tbd.bclock += -tdif
	};
	if (tdif < 0) tdif = 0;
	var obd = this.otherbd(bd);
	if (whosmove(obd.turn) == 'w') {
		obd.wclock += -tdif
	} else {
		obd.bclock += -tdif
	};
	tbd.changeturn(1);
	return true;
}


function execmove(bd, text) {
	/* function gets board name('a' or 'b') and text move (e.g. 37. rae1) and tries to execute the move if it's legal.
	 First it calls decryptmove which returns the move in the bugmove format( fromsquare, tosquare, frompiece, topiece).
	 Decryptmove doesn't check legality that is king related (i.e. if king is in check and castling is valid).
	 However, it allows or disallows taking your own pieces depending on this.rule variable.
	 King related legality checking is done inside the functions that handle special cases
	 (dropmove, enpassant, regularmove, promotion, castle)
	*/

	saveNote(this.viewername) // for some reason the comment textarea onchange doesn't call when we move a piece by hand, so we call savenote here

	var move = extractmove(text);
	var tbd = eval('this.' + bd);
	var mv = this.decryptmove(tbd, move);
	var res, lid, lobj, tmp1, ltmp;
	if (mv == false || mv.fromsquare == -1) return;
	/* special cases */
	mv.board = bd;
	//mv.side=whosmove(tbd.turn);
	var nNewIndex = this.BPGN_GetNewNode();
	var nMove = tbd.movecount;
	var cTime = (mv.side == 'w') ? tbd.wclock : tbd.bclock;
	this.stuffnode(nNewIndex, this.currentmove, nMove, tbd.turn, nMove + tobpgn(mv), cTime, '', '');
	this.BPGN[nNewIndex].dmove = mv;
	var x = this.BPGN[this.currentmove].nNext.length;
	if (!this.forwardmove(nNewIndex)) {
		this.BPGN[this.currentmove].nNext[x - 1] = false;
		this.BPGN[this.currentmove].nNext.length--;
		this.BPGN[nNewIndex] = false;
		this.BPGN.length--;

	} else {
		tmp1 = (mv.board == 'a' && this.a.flip == 0) ||
			(mv.board == 'b' && this.b.flip == 0);

		//try
		//{

		// }
		// catch(err)
		// { interfaceLogDebug(err.message);
		// }


		if (BroadscastMove)
			interfaceOutMove(nMove + tobpgn(mv));
		else
			var brx = 'nic';

		if (tbd.incheck('w', tbd.kingw)) {
			document.getElementById('clientdebug').innerHTML += " IsCheck";
		}
	}
	this.refreshclock();
	this.refreshinfo();
	this.refreshhighlight()
}


function changeturn(step1) {
	var t = this.turn;
	if ((t == t.toLowerCase() && step1 > 0) || (t != t.toLowerCase() && step1 < 0)) {
		this.movecount += step1;
	}
	if (t == t.toLowerCase()) {
		this.turn = t.toUpperCase();
	} else {
		this.turn = t.toLowerCase();
	};
	this.brefreshform();
}

function undomove() {
	if (this.currentmove == BPGN_ROOT) {
		return;
	};
	var mv = this.BPGN[this.currentmove].dmove;
	var tbd = eval('this.' + mv.board);
	var bd = mv.board;
	var obd = this.otherbd(mv.board);
	var wh = mv.side;
	variouscases: {
		if (mv.fromsquare == 'o-o') {
			this.undocastle(bd, 'short', mv.topiece, wh);
			break variouscases;
		};
		if (mv.fromsquare == 'o-o-o') {
			this.undocastle(bd, 'long', mv.topiece, wh);
			break variouscases;
		};
		if (mv.fromsquare > 63) {
			tbd.undodropmove(mv);
			break variouscases;
		};
		if ((mv.frompiece.length > 2) && (mv.frompiece.charAt(1) == 'p')) { //nonregular pawn move
			if (mv.frompiece.charAt(2) == 'x') {
				this.undoenpassant(mv);
				break variouscases;
			} else {
				this.undopromotion(mv);
				break variouscases;
			};
		}; /* now only regular moves are left */
		this.undoregularmove(mv);
		break variouscases;
	};
	var x = this.BPGN[this.currentmove].nParent;
	this.currentmove = x;
	if (mv.side == 'w') {
		tbd.shortcastlew = mv.backupshortcastle;
		tbd.longcastlew = mv.backuplongcastle;
	} else {
		tbd.shortcastleb = mv.backupshortcastle;
		tbd.longcastleb = mv.backuplongcastle;
	};
	tbd.enpasssq = mv.backupenpassant;
	tbd.changeturn(-1);
	var out = eval('document.' + this.viewername + '.lastmove' + bd);
	out.value = '';
	if (whosmove(tbd.turn) == 'w') {
		tbd.wclock = mv.backuptime1
	} else {
		tbd.bclock = mv.backuptime1
	};
	if (whosmove(obd.turn) == 'w') {
		obd.wclock = mv.backuptime
	} else {
		obd.bclock = mv.backuptime
	};
	this.refreshclock();
	this.refreshinfo();
}

function bugorzh(viewer) {
	var v = eval(viewer);
	var c;
	var out = eval('document.' + v.viewername + '.bugzh');
	if (v.capturemode == 'bug') {
		c = 'zh';
		out.value = 'Z=>C';
	};
	if (v.capturemode == 'zh') {
		c = 'chess';
		if (v.numboard == 1) {
			out.value = 'C=>Z';
		} else {
			out.value = 'C=>B';
		};
	};
	if (v.capturemode == 'chess') {
		if (v.numboard == 1) {
			c = 'zh';
			out.value = 'Z=>C';
		} else {
			c = 'bug';
			out.value = 'B=>Z';
		};
	};
	v.capturemode = c;
}

function flipboard(viewer) {
	var v = eval(viewer);
	var lid, lobj, ltmp;
	if (v.reloadmode == 'noreload') return;

	//try
	//{


	// }
	// catch(err)
	// { interfaceLogDebug(err.message);
	// }



	if (v.a.flip == 0) {
		v.a.flip = 1
	} else {
		v.a.flip = 0
	};
	// v.a.brefreshform();
	v.a.drawpos();
	if (v.numboard != 1) {
		if (v.b.flip == 0) {
			v.b.flip = 1
		} else {
			v.b.flip = 0
		};
		v.b.drawpos();
	};
	// v.b.brefreshform();}  for (i=0;i<64;i++) {v.a.redrawsquare(i);if (v.numboard!=1) {v.b.redrawsquare (i)};};

	//Flipped players set
	var formm = eval('window.document.' + viewer);
	if (v.a.flip == 1) {
		formm.upa.value = v.whitea;
		formm.dna.value = v.blacka;
	} else {
		formm.upa.value = v.blacka;
		formm.dna.value = v.whitea;
	}

	if (v.b.flip == 1) {
		formm.upb.value = v.whiteb;
		formm.dnb.value = v.blackb;
	} else {
		formm.upb.value = v.blackb;
		formm.dnb.value = v.whiteb;
	}

	// redraw the highlights:

	a_highlights = [...v.a.highlightedSquares]
	v.a.Highlight(...a_highlights)

	b_highlights = [...v.b.highlightedSquares]
	v.b.Highlight(...b_highlights)
}


function Preferences(viewer) //SKAcz
{

	var lviewer = eval(viewer);
	/*
	var v=eval(viewer);
	v.whitesq='White';
	v.blacksq='#ECC72E';
	v.filebg=false;
	v.bg_color='White';
	//preload("/public/play/gif1/");
	v.gifs=Init1("/public/play/gif1/", v.filebg, v.whitesq, v.blacksq);
	alert('v.gifs[wbd]:'+v.gifs["wbd"]);
	//v.drawhold();
	v.a.drawpos();
	v.b.drawpos();
	//v.drawviewer('White');
	*/

	/*
   Preferences:<select id="selNewGameLayout">
  <option selected="selected" value="1">default</option>
  <option value="2">SKAcz's</option>
  <option value="3">Wired</option>
  </select>
<input type="button" value="Set Layout"
     OnClick="NewGameWithLayout(document.getElementById('selNewGameLayout').value);">
     */



	//Rotate layout gif1,2,  N,1
	var lGifNumberMax = 26;
	var lGifDir, lGifDirOrig, lGifPath, lGifNumber;
	var lobj = document.getElementById('imgsquarea0').src;

	lGifPath = lobj.substring(0, lobj.indexOf('gif'));
	lGifNumber = parseInt(lobj.substring(lobj.indexOf('gif') + 3, lobj.indexOf('/', lobj.indexOf('gif') + 3)));

	if (lGifNumber > -1 && lGifNumber < lGifNumberMax) {
		lGifDirOrig = "gif" + lGifNumber;
		lGifNumber++;
		lGifDir = "gif" + lGifNumber;
	} else if (lGifNumber >= lGifNumberMax) {
		lGifDirOrig = "gif" + lGifNumber;
		lGifNumber = 1;
		lGifDir = "gif" + lGifNumber;
	} else {
		lGifNumber = 1;
		lGifDirOrig = lGifDir = "gif" + lGifNumber;
	};


	document.getElementById('Pref').value = "Pref:" + lGifDir.substr(3);

	//Change background squares
	var lid;
	var ltmp, ltmp2;

	for (i = 0; i < 8; i++) {
		for (j = 0; j < 8; j++) {
			ind = 8 * i + j;
			lid = "tdsquare" + "a" + ind;
			lobj = document.getElementById(lid).style.backgroundImage;
			ltmp = lobj.replace(lGifDirOrig, lGifDir);
			ltmp = ltmp.replace(lGifDirOrig, lGifDir);
			document.getElementById(lid).style.backgroundImage = ltmp;

			//document.getElementById(lid).style.border="2px inset white";


			lid = "tdsquare" + "b" + ind;
			//document.getElementById(lid).style.backgroundImage="url('/public/play/"+lGifDir+"/"+((i + j) % 2 ? "b" : "w")+".gif')";
			lobj = document.getElementById(lid).style.backgroundImage;
			ltmp = lobj.replace(lGifDirOrig, lGifDir);
			ltmp = ltmp.replace(lGifDirOrig, lGifDir);
			//ltmp=ltmp.replace("tr.gif","fr.gif");//brx tak to bude vypadat zvyrazneni pole

			document.getElementById(lid).style.backgroundImage = ltmp;

			//document.getElementById(lid).style.backgroundSize="110% 110%";
			//document.getElementById(lid).style.backgroundSize="44px 44px";
			//document.getElementById(lid).style.backgroundSize="44px 44px";
			//document.getElementById(lid).style.borderStyle="dotted double";
			//document.getElementById(lid).style.border="2px inset green";
			//document.getElementById(lid).style.border="2px inset green";




		};
	};

	//Change pieces
	var lid;

	for (i = 0; i < 8; i++) {
		for (j = 0; j < 8; j++) {
			ind = 8 * i + j;
			lid = "imgsquare" + "a" + ind;
			lobj = document.getElementById(lid).src;
			ltmp = lobj.replace(lGifDirOrig, lGifDir);
			document.getElementById(lid).src = ltmp;

			if (lGifNumber >= 15 && lGifNumber <= 20) {
				document.getElementById(lid).style.width = "42px";
				document.getElementById(lid).style.height = "42px";
			} else {
				document.getElementById(lid).style.width = "45px";
				document.getElementById(lid).style.height = "45px";
			}


			lid = "imgsquare" + "b" + ind;
			lobj = document.getElementById(lid).src;
			ltmp = lobj.replace(lGifDirOrig, lGifDir);
			document.getElementById(lid).src = ltmp;


			//document.getElementById(lid).style.backgroundSize="40px 40px";
			//document.getElementById(lid).style.border="2px inset green";
			if (lGifNumber >= 15 && lGifNumber <= 20) {
				document.getElementById(lid).style.width = "42px";
				document.getElementById(lid).style.height = "42px";
			} else {
				document.getElementById(lid).style.width = "45px";
				document.getElementById(lid).style.height = "45px";
			}

		};
	};
	for (i = 0; i < 5; i++) {
		for (j = 0; j < 2; j++) {
			ind = 64 + i * 2 + j;

			lid = "imgsquare" + "a" + ind;
			lobj = document.getElementById(lid).src;
			ltmp = lobj.replace(lGifDirOrig, lGifDir);
			document.getElementById(lid).src = ltmp;

			if (lGifNumber >= 15 && lGifNumber <= 20) {
				document.getElementById(lid).style.width = "42px";
				document.getElementById(lid).style.height = "42px";
			} else {
				document.getElementById(lid).style.width = "45px";
				document.getElementById(lid).style.height = "45px";
			}


			lid = "imgsquare" + "b" + ind;
			lobj = document.getElementById(lid).src;
			ltmp = lobj.replace(lGifDirOrig, lGifDir);
			document.getElementById(lid).src = ltmp;

			if (lGifNumber >= 15 && lGifNumber <= 20) {
				document.getElementById(lid).style.width = "42px";
				document.getElementById(lid).style.height = "42px";
			} else {
				document.getElementById(lid).style.width = "45px";
				document.getElementById(lid).style.height = "45px";
			}


		}
	};

	//Change pieces
	lviewer.gifs = Init1(lGifPath + lGifDir + "/", lviewer.filebg, lviewer.whitesq, lviewer.blacksq);
	lviewer.a.gifs = Init1(lGifPath + lGifDir + "/", lviewer.filebg, lviewer.whitesq, lviewer.blacksq);
	lviewer.b.gifs = Init1(lGifPath + lGifDir + "/", lviewer.filebg, lviewer.whitesq, lviewer.blacksq);
	lviewer.a.drawpos();
	lviewer.b.drawpos();


}

function fReplaceAll(fStr, fWhat, fWith) {
	var fStrOut = fStr;
	var intIndexOfMatch = fStrOut.indexOf(fWhat);
	while (intIndexOfMatch != -1) {
		fStrOut = fStrOut.replace(fWhat, fWith)
		intIndexOfMatch = fStrOut.indexOf(fWhat);
	}
	return fStrOut;
}

function hmsToSecondsOnly(str) {
	var p = str.split(':'),
		s = 0,
		m = 1;
	while (p.length > 0) { //s += m * parseInt(p.pop(), 10);
		s += m * parseFloat((p.pop()).replace(",", "."));
		m *= 60;
	}
	return s;
}

function TimeFormatToBpgnReplaceClkBySecs(fsBpgnGame) {
	var lsBody = fsBpgnGame;
	li1 = 0;
	li1 = lsBody.indexOf('{[%clk', li1);
	while (li1 > -1) {
		li2 = (lsBody + '}').indexOf('}', li1);
		numbTmp1 = hmsToSecondsOnly(lsBody.substring(li1 + 6, li2 - 1));
		lsBody = lsBody.substring(0, li1 + 1) + numbTmp1 + lsBody.substring(li2);
		li1 = lsBody.indexOf('{[%clk', li1 + 1);
	}
	return lsBody;
}

function BPGNImportRepair1(fsBPGN) {
	var lsOut = fsBPGN;
	//Some conversions to get old good BPGN
	//lsOut=fReplaceAll(fsBPGN,'\n',' ');
	//converting from Chess.com @d5 into P@d5
	lsOut = fReplaceAll(lsOut, " @", " P@");
	lsOut = fReplaceAll(lsOut, ".@", ".P@");
	//converting from Chess.com times {[%clk 0:02:59.9]} into {179.9}
	lsOut = TimeFormatToBpgnReplaceClkBySecs(lsOut);
	return lsOut;
}

function setcapture(bpgntext, mode) {
	var tmp = bpgnheader(bpgntext, "Event");
	tmp = tmp.toLowerCase();
	var pos = tmp.indexOf('bughouse');
	if (pos > -1) return 'bug';
	pos = tmp.indexOf('crazyhouse');
	if (pos > -1) return 'zh';
	pos = tmp.indexOf('atomic');
	if (pos > -1) return 'atomic';
	pos = tmp.indexOf('chess');
	if (pos > -1) return 'chess';
	return (mode == 1) ? 'zh' : 'bug';
}

function assreloadgame(viewer, bpgntext, bfena, bfenb) {
	var v = eval(viewer);
	window.focus();
	v.reloadgame(BPGNImportRepair1(bpgntext), bfena, bfenb);
	v.reloadwindow.close();
}

function assreloadgameN(viewer, bpgntext, gameord, bfena, bfenb) {
	var v = eval(viewer);
	window.focus();
	v.reloadgame(FromGameN(BPGNImportRepair1(bpgntext), gameord), bfena, bfenb);
	v.reloadwindow.close();
}


function bpgnfindend() {
	var i = BPGN_ROOT;
	var n = this.BPGN.length
	while (i < n) {
		if (this.BPGN[i].nNext.length == 0) return i;
		i = this.BPGN[i].nNext[0];
	};
}

function reloadgame(bpgntext, bfena, bfenb) {
	// repair to load also from wild start positions defined by BFEN 2021 SKAcz
	var lsBFEN = '';
	if (bpgntext.indexOf('[Setup "1"]') > -1)
		if (bpgntext.indexOf('[FEN "') > -1) {
			var liBFEN1 = bpgntext.indexOf('[FEN "') + 6;
			var liBFEN2 = bpgntext.indexOf('"]', liBFEN1);
			lsBFEN = bpgntext.substring(liBFEN1, liBFEN2);
			bfena = lsBFEN.split('|')[0];
			bfenb = lsBFEN.split('|')[1];
		}


	var m;
	var i;
	var n;
	var tmp;
	this.note = '';
	this.bIsNote = false;
	this.bfinish = false;
	this.nError = ERROR_NONE;
	this.cError = '';
	this.cResult1 = '';
	this.cResult2 = '';
	this.afirstmove = false;
	this.bfirstmove = false;

	// gettoken vars
	this.ngameindex = 0;
	this.nstate = BPGN_NORMAL;
	this.nlaststate = BPGN_NORMAL;
	this.ctoken = '';

	this.capturemode = setcapture(bpgntext, this.numboard);
	var bz;
	if (this.capturemode == 'bug') {
		bz = 'B=>Z';
	};
	if (this.capturemode == 'zh') {
		bz = 'Z=>C';
	};
	if (this.caputremode == 'chess') {
		if (this.numboard == 1) {
			bz = 'C=>Z';
		} else {
			bz = 'C=>B'
		};
	};
	var out = eval('document.' + this.viewername + '.bugzh');
	if (this.displaymode != 'diagram') out.value = bz;
	tmp = this.getbpgnheaders(bpgntext);
	this.cgame = extracttext(bpgntext);
	this.ngamesize = this.cgame.length;
	n = this.BPGN.length;
	var ba = this.a.pos;
	this.a.pos = startposition();
	this.a.hold = emptyhold();
	this.a.loadboard(bfena, this.whitea, this.blacka, this.whiteaelo, this.blackaelo, this.gametime);
	bfena = killleadspace(bfena);
	if (ba != this.a.pos) this.a.drawpos();
	var bb = this.b.pos;
	this.b.pos = startposition();
	this.b.hold = emptyhold();
	this.b.loadboard(bfenb, this.whiteb, this.blackb, this.whitebelo, this.blackbelo, this.gametime);
	bfenb = killleadspace(bfenb);
	if ((this.numboard != 1) && (bb != this.b.pos)) {
		this.b.drawpos();
	};
	for (i = 0; i < n; i++) {
		this.BPGN[i] = false;
	};
	this.BPGN.length = 0;
	m = this.Queue.length;
	for (i = 0; i < m; i++) {
		this.Queue[i] = false;
	};
	this.Queue.length = 0;

	this.BPGN[BPGN_ROOT] = new NODE();
	this.bpgngetfirstnote();
	this.BPGN_GetBody(BPGN_ROOT, 1, 1, 'A');
	this.endnode = this.bpgnfindend();
	this.currentmove = BPGN_ROOT;
	this.setmoven();
	this.a.brefreshform();
	if (this.numboard != 1) {
		this.b.brefreshform();
	};
	this.refreshinfo();
	this.refreshhighlight()
}


function loadboard(bfen, whitepl, blackpl, welo, belo, timecontrol) {
	var i;
	var fform = eval('window.document.' + this.viewername);
	this.white = whitepl;
	this.black = blackpl;
	this.whiteelo = welo;
	this.blackelo = belo;
	this.turn = this.boardname.toUpperCase();
	this.wclock = timecontrol;
	this.bclock = timecontrol;
	this.getfen(bfen);
	if (this.pos.length != 64) {
		this.pos = startposition();
		this.hold = emptyhold()
	};
	if (this.pos[sqtoind('e1')] == 'wk') {
		if (this.pos[sqtoind('h1')] == 'wr') {
			this.shortcastlew = true
		} else {
			this.shortcastlew = 'rook'
		};
		if (this.pos[sqtoind('a1')] == 'wr') {
			this.longcastlew = true
		} else {
			this.longcastlew = 'rook'
		};
	} else {
		this.shortcastlew = 'king';
		this.longcastlew = 'king'
	};
	if (this.pos[sqtoind('e8')] == 'bk') {
		if (this.pos[sqtoind('h8')] == 'br') {
			this.shortcastleb = true
		} else {
			this.shortcastleb = 'rook'
		};
		if (this.pos[sqtoind('a8')] == 'br') {
			this.longcastleb = true
		} else {
			this.longcastleb = 'rook'
		};
	} else {
		this.shortcastleb = 'king';
		this.longcastleb = 'king'
	};
	this.kingw = this.findpiece('wk', 0);
	this.kingb = this.findpiece('bk', 0);

	this.initial_bfen = this.generatebfen()
}

function asssave(viewer) {
	var v = eval(viewer);
	if ((!v.savewindow) || (v.savewindow.closed)) {
		v.savewindow = window.open("", "save_bpgnave_bpgn", "width=750,height=500,scrollbars");
	} else {
		v.savewindow.focus();
		return;
	};
	v.savewindow.document.writeln(generatesavehtml());
	v.BPGN_SaveGame();
	SAVE_STR = v.sgame;
	v.savewindow.document.saveform.bpgn.value = self.parent.SAVE_STR;
	SAVE_STR = v.a.generatebfen();
	v.savewindow.document.saveform.bfena.value = self.parent.SAVE_STR;
	SAVE_STR = v.b.generatebfen();
	v.savewindow.document.saveform.bfenb.value = self.parent.SAVE_STR;
	SAVE_STR = v.RTFTextPosition; //RTF
	v.savewindow.document.saveform.RTFtextposition.value = self.parent.SAVE_STR;
	v.savewindow.focus();
}

function assloadgame(viewer) {
	var v = eval(viewer);
	if ((!v.reloadwindow) || (v.reloadwindow.closed)) {
		v.reloadwindow = window.open("", "load_bpgn", "width=750,height=500,scrollbars");
	} else {
		v.reloadwindow.focus();
		return;
	};
	v.reloadwindow.document.writeln(generateloadhtml(viewer));
	v.reloadwindow.focus();
	v.refreshhighlight()

}

function drawcontrol(color, mode) {
	var vd = (this.numboard == 1) ? this.vwidth : 2 * this.vwidth;
	var bc = 5;

	var t = '<center style="display: none;"><table border="0" cellpadding="0" cellspacing="0" width="' + vd + '" bgcolor="' + color + '">';

	t += '<tr>';
	t += '<td align="left" valign="top" style="font: 13px arial narrow, sans-serif;">';
	t += '<p style="font: 10px"></p>';

	//t+='<p style="font: 8px"></p>';
	t += '<input style="width:64px; height:40px;"  id="BTELL1" type="button" value="' + BTELL1 + '" onclick="interfacePtell(\'' + BTELL1 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL3" type="button" value="' + BTELL3 + '" onclick="interfacePtell(\'' + BTELL3 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL5" type="button" value="' + BTELL5 + '" onclick="interfacePtell(\'' + BTELL5 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL7" type="button" value="' + BTELL7 + '" onclick="interfacePtell(\'' + BTELL7 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL9" type="button" value="' + BTELL9 + '" onclick="interfacePtell(\'' + BTELL9 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL11" type="button" value="' + BTELL11 + '" onclick="interfacePtell(\'' + BTELL11 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL13" type="button" value="' + BTELL13 + '" onclick="interfacePtell(\'' + BTELL13 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL15" type="button" value="' + BTELL15 + '" onclick="interfacePtell(\'' + BTELL15 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL17" type="button" value="' + BTELL17 + '" onclick="interfacePtell(\'' + BTELL17 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL19" type="button" value="' + BTELL19 + '" onclick="interfacePtell(\'' + BTELL19 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL21" type="button" value="' + BTELL21 + '" onclick="interfacePtell(\'' + BTELL21 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL23" type="button" value="' + BTELL23 + '" onclick="interfacePtell(\'' + BTELL23 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL25" type="button" value="' + BTELL25 + '" onclick="interfacePtell(\'' + BTELL25 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL27" type="button" value="' + BTELL27 + '" onclick="interfacePtell(\'' + BTELL27 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL29" type="button" value="' + BTELL29 + '" onclick="interfacePtell(\'' + BTELL29 + '\')">';




	t += '<input style="width:64px; height:40px;"  id="BTELL2" type="button" value="' + BTELL2 + '" onclick="interfacePtell(\'' + BTELL2 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL4" type="button" value="' + BTELL4 + '" onclick="interfacePtell(\'' + BTELL4 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL6" type="button" value="' + BTELL6 + '" onclick="interfacePtell(\'' + BTELL6 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL8" type="button" value="' + BTELL8 + '" onclick="interfacePtell(\'' + BTELL8 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL10" type="button" value="' + BTELL10 + '" onclick="interfacePtell(\'' + BTELL10 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL12" type="button" value="' + BTELL12 + '" onclick="interfacePtell(\'' + BTELL12 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL14" type="button" value="' + BTELL14 + '" onclick="interfacePtell(\'' + BTELL14 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL16" type="button" value="' + BTELL16 + '" onclick="interfacePtell(\'' + BTELL16 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL18" type="button" value="' + BTELL18 + '" onclick="interfacePtell(\'' + BTELL18 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL20" type="button" value="' + BTELL20 + '" onclick="interfacePtell(\'' + BTELL20 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL22" type="button" value="' + BTELL22 + '" onclick="interfacePtell(\'' + BTELL22 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL24" type="button" value="' + BTELL24 + '" onclick="interfacePtell(\'' + BTELL24 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL26" type="button" value="' + BTELL26 + '" onclick="interfacePtell(\'' + BTELL26 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL28" type="button" value="' + BTELL28 + '" onclick="interfacePtell(\'' + BTELL28 + '\')">';
	t += '<input style="width:64px; height:40px;"  id="BTELL30" type="button" value="' + BTELL30 + '" onclick="interfacePtell(\'' + BTELL30 + '\')">';

	/*
	t+='<input style="width:64px; height:40px;"  id="BTELL31" type="button" value="'+BTELL31+'" onclick="interfacePtell(\''+BTELL31+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL32" type="button" value="'+BTELL32+'" onclick="interfacePtell(\''+BTELL32+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL33" type="button" value="'+BTELL33+'" onclick="interfacePtell(\''+BTELL33+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL34" type="button" value="'+BTELL34+'" onclick="interfacePtell(\''+BTELL34+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL35" type="button" value="'+BTELL35+'" onclick="interfacePtell(\''+BTELL35+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL36" type="button" value="'+BTELL36+'" onclick="interfacePtell(\''+BTELL36+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL37" type="button" value="'+BTELL37+'" onclick="interfacePtell(\''+BTELL37+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL38" type="button" value="'+BTELL38+'" onclick="interfacePtell(\''+BTELL38+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL39" type="button" value="'+BTELL39+'" onclick="interfacePtell(\''+BTELL39+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL40" type="button" value="'+BTELL40+'" onclick="interfacePtell(\''+BTELL40+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL41" type="button" value="'+BTELL41+'" onclick="interfacePtell(\''+BTELL41+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL42" type="button" value="'+BTELL42+'" onclick="interfacePtell(\''+BTELL42+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL43" type="button" value="'+BTELL43+'" onclick="interfacePtell(\''+BTELL43+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL44" type="button" value="'+BTELL44+'" onclick="interfacePtell(\''+BTELL44+'\')">';
	t+='<input style="width:64px; height:40px;"  id="BTELL45" type="button" value="'+BTELL45+'" onclick="interfacePtell(\''+BTELL45+'\')">';
	*/

	t += '</td>';
	t += '</tr>';
	t += '<tr>';
	t += '<td align="center" valign="top">';
	t += '<BR/>';
	t += '</td>';
	t += '</tr>';

	t = t + '</table></center>';




	t += '<center><table border="0" cellpadding="0" cellspacing="0" width="' + vd + '" bgcolor="' + color + '">';

	t += '<tr>';

	if (this.numboard != 1) {
		t += '<td align="center" valign="top">';

		t += '<input type="button" value=" &lt;&lt;" onclick="assundomove(' + bc + ',' + "'a','" + this.viewername + "'" + ')">';
		t += '<input type="button" value=" &lt; " onclick="assundomove(1,' + "'a','" + this.viewername + "'" + ')">';

		t += '<input type="button" value="analyse" onclick="window.open('  ;
		t += " 'https://online-drophouse-stockfish.herokuapp.com/analysis.html?fen=' + bfen_to_bracket_notation( window.v1.a.generatebfen() " ;
		t += "),'_blank'" + ')">';

		t += '<input type="button" value=" &gt; " onclick="assforward(1,' + "'a','" + this.viewername + "'" + ',0)">';
		t += '<input type="button" value="&gt;&gt; " onclick="assforward(' + bc + ',' + "'a','" + this.viewername + "'" + ',0)">';

		t += '</td>';
	};
	t += '<td align="center" valign="bottom">';
	t += '<input id="undo999" type="button" value=" |< " onclick="assundomove(999,' + "'c','" + this.viewername + "'" + ')">';
	t += '<input type="button" value=" &lt; " onclick="assundomove(1,' + "'c','" + this.viewername + "'" + ')">';
	t += '<input type="button" name="play" value="Play" onclick="assplay(' + "'" + this.viewername + "'" + ')">';
	t += '<input type="button" value=" &gt; " onclick="assforward(1,' + "'c','" + this.viewername + "'" + ',0)">';
	t += '<input type="button" value=" >| " onclick="assforward(999,' + "'c','" + this.viewername + "'" + ',0)">';
	t += '</td>';
	t += '<td align="center" valign="bottom">';
	t += '<input style="display: none;" type="button" value=" X " onclick="assdelete(' + "'" + this.viewername + "'" + ')">';
	var bz;
	if (this.capturemode == 'bug') {
		bz = 'B=>Z';
	};
	if (this.capturemode == 'zh') {
		bz = 'Z=>C';
	};
	if (this.capturemode == 'chess') {
		if (this.numboard == 1) {
			bz = 'C=>Z';
		} else {
			bz = 'C=>B'
		};
	};
	t += '<input style="display: none;" type="button" name="bugzh" value="' + bz + '" onclick="bugorzh(' + "'" + this.viewername + "'" + ')">';
	t += '<input type="button" value="Flip" onclick="flipboard(' + "'" + this.viewername + "'" + ')">';
	t += '<input style="display: none;" type="button" id="Pref" value="Pref" onclick="Preferences(' + "'" + this.viewername + "'" + ')">';
	t += '<input type="button" value="Save" onclick="asssave(' + "'" + this.viewername + "'" + ')">';
	t += '<input type="button" value="Load" onclick="assloadgame(\'' + this.viewername + '\')">';
	t += '</td>';
	if (this.numboard != 1) {
		t += '<td align="center" valign="top">';
		t += '<input type="button" value=" &lt;&lt;" onclick="assundomove(' + bc + ',' + "'b','" + this.viewername + "'" + ')">';
		t += '<input type="button" value=" &lt; " onclick="assundomove(1,' + "'b','" + this.viewername + "'" + ')">';

		t += '<input type="button" value="analyse" onclick="window.open('  ;
		t += " 'https://online-drophouse-stockfish.herokuapp.com/analysis.html?fen=' + bfen_to_bracket_notation( window.v1.b.generatebfen() " ;
		t += "),'_blank'" + ')">';

		t += '<input type="button" value=" &gt; " onclick="assforward(1,' + "'b','" + this.viewername + "'" + ',0)">';
		t += '<input type="button" value="&gt;&gt; " onclick="assforward(' + bc + ',' + "'b','" + this.viewername + "'" + ',0)">';
		t += '</td>';
	};
	t = t + '</tr></table></center>';
	return t;
}

function drawinfo(color) {
	var t = "";
	var ph = "";
	var opt = '';
	var i;
	for (i = 0; i < NEXT_WIDTH; i++) ph += 'x';
	t = t + '<center><table border="0" cellpadding="0" cellspacing="0" bgcolor="' + color + '">';
	t = t + '<tr>';
	t = t + '<td align="center" valign="top"><strong>Variations</strong></td>';
	t = t + '<td align="center" valign="top"><strong>Comment</strong></td>';
	t = t + '</tr>';
	t = t + '<tr>';
	t = t + '<td valign="top">';
	t += '<select name="nextmove"  size="5" onChange="assforward(1,' + "'c','" + this.viewername + "'" + ',document.' + this.viewername + '.nextmove.selectedIndex);" >';
	for (i = 0; i < MAX_NEXT; i++) opt = opt + '<option>';
	t = t + '<option>' + ph + opt;
	t = t + '</select></td>';
	t = t + '<td rowspan="2" valign="top"><textarea onchange="saveNote(' + "'" + this.viewername + "'" + ')" name="comment"' + ((IE) ? ' ' : ' WRAP="SOFT" ') + 'value="" rows="5" cols="' + this.cwidth + '"></textarea></td>';
	t = t + '</tr>';
	t = t + '<tr>';
	t = t + '<td align="center" valign="top"> <a href="javascript:void(0)" onclick="assdelete(' + "'" + "v1" + "'" + ')">Delete move</a> </td>';
	t = t + '</tr>';
	t = t + '</table></center>';
	return t;
}

function drawdebug(){
	var out = ''
	out += '<a href="javascript:void(0)" onclick="toggleDebugInfo();">Show/hide debug</a>'
	out += '<script>\
			function toggleDebugInfo() {\
				var x = document.getElementById("debugInfo");\
				if (x.style.display === "block") {\
					x.style.display = "none";\
				} else {\
					x.style.display = "block";\
				}\
			}\
			</script>'
	out += '<div id="debugInfo" style="\
				display: block;  /* default visibility of the console, block or none */\
				width: auto;\
				padding: 10px 0px 10px 20px;\
				text-align: left;\
				background-color: lightgray;\
				font-family: \'Courier New\', monospace;\
				white-space: pre;"\
			>Debug log:\
			</div>'
	return out
}

function drawviewer(color) {
	var tmp = '';
	tmp += '<table id="tabledrawviewer" border="0" cellpadding="0" bgcolor="' + color + '"><form name="' + this.viewername + '">'; /*head of big table */
	tmp += '<tr>';
	tmp += '<td><table border="0" cellpadding="2" bgcolor="' + color + '">'; /* head of board's table */
	tmp += '<tr>';
	tmp += '<td  width="' + this.vwidth + '">' + this.a.drawboard() + '</td>'; /* drawing board A */
	if (this.numboard != 1) tmp += '<td width="' + this.vwidth + '">' + this.b.drawboard() + '</td>'; /* drawing board B */
	tmp += '</tr></table></td>'; /* closing board's table */
	tmp += '</tr>';
	if (this.displaymode != 'diagram') {
		tmp += '<tr><td>' + this.drawcontrol(color, this.displaymode) + '</td></tr>'; /* drawing controls */
		if (this.displaymode != 'playback') {
			tmp += '<tr><td>' + this.drawinfo(color) + '</td></tr>'
		}; /*drawing info */
	}
	tmp += '<tr class="debug"><td>' + this.drawdebug() + '</td></tr>'
	tmp += '</form> </table> '; /* closing big table */
	document.writeln(tmp);
	this.setauleft();
	this.refreshinfo();
	this.refreshhighlight()
	this.a.drawpos();
	if (this.numboard != 1) {
		this.b.drawpos();
	};
}

function startposition() {
	var i;
	var pos = new Array(64);
	pos[0] = "br";
	pos[1] = "bn";
	pos[2] = "bb";
	pos[3] = "bq";
	pos[4] = "bk";
	pos[5] = "bb";
	pos[6] = "bn";
	pos[7] = "br";
	for (i = 8; i < 16; i++) {
		pos[i] = "bp";
	};
	for (i = 16; i < 48; i++) {
		pos[i] = '';
	};
	for (i = 48; i < 56; i++) {
		pos[i] = "wp";
	};
	pos[56] = "wr";
	pos[57] = "wn";
	pos[58] = "wb";
	pos[59] = "wq";
	pos[60] = "wk";
	pos[61] = "wb";
	pos[62] = "wn";
	pos[63] = "wr";
	return pos;
}

function emptyhold() {
	var t = new Array(10);
	var i;
	for (i = 0; i < 10; i++) {
		t[i] = 0
	};
	return t;
}


function syncpic() {
	return this.uleft;
}


function isnum(str) {
	var digs = '1234567890';
	var i;
	for (i = 0; i < str.length; i++) {
		if (digs.indexOf(str.charAt(i)) < 0) {
			return false
		};
	};
	return true;
}

function spacesplit(str) {
	var t = new Array();
	t.length = 0;
	var s = true;
	var i;
	var j = 0;
	do {
		str = killleadspace(str);
		if (str.length == 0) return t;
		i = str.indexOf(" ");
		if (i < 0) {
			t[t.length] = str;
			return t
		};
		t[j] = str.substr(0, i);
		str = str.substr(i + 1);
		j++;
	} while (s);
}

function piecetoind(piece) {
	var i = 0;
	for (i = 0; i < 10; i++) {
		if (this.dropbar[i] == piece) return i
	};
	return -1;
}

function tocol(ch) {
	var pieces = "rnbqkp";
	var t = ch.toLowerCase();
	if (pieces.lastIndexOf(t) >= 0) {
		return (t == ch) ? "b" + ch : "w" + t;
	} else return "";
}

function othercolor(color) {
	return (color == 'w') ? 'b' : 'w';
}

function otherbd(bd) {
	return (bd == 'a') ? this.b : this.a;
}

function extractmove(text) {
	var t = killleadspace(killtailspace(text));
	t = spacesplit(text);
	if (t.length == 0) return '';
	var mv = t[t.length - 1];
	if (mv.length == 0) return '';
	t = mv.split('.');
	mv = t[t.length - 1];
	return mv;
}



function capture(bd, piece, num) {
	var cbd;
	var i;
	var tmp = piece.charAt(1);
	var s;
	var k;
	if (tmp != tmp.toLowerCase()) {
		piece = piece.charAt(0) + 'p'
	}; /* captured piece is a promoted one */
	if (this.capturemode == 'chess') {
		return
	};
	if (this.capturemode == 'atomic') {
		explosion(5)
	};
	if (this.capturemode == "zh") {
		cbd = eval('this.' + bd);
		piece = othercolor(piece.charAt(0)) + piece.charAt(1);
	} else {
		cbd = this.otherbd(bd)
	};
	cbd.redrawhold(piece, num);
}

function explosion(ind) {
	if (ind - 9 > -1) {
		this.pos[ind - 9] = ''
	};
	if (ind - 8 > -1) {
		this.pos[ind - 8] = ''
	};
	if (ind - 7 > -1) {
		this.pos[ind - 7] = ''
	};
	if (ind - 1 > -1) {
		this.pos[ind - 1] = ''
	};
	if (ind + 1 < 65) {
		this.pos[ind + 1] = ''
	};
	if (ind + 7 < 65) {
		this.pos[ind + 7] = ''
	};
	if (ind + 8 < 65) {
		this.pos[ind + 8] = ''
	};
	if (ind + 9 < 65) {
		this.pos[ind + 9] = ''
	};
}

function redrawsquare(i) {
	if (!this.redraw) return;
	var ind = this.syncpic();
	var st = this.pos[i].toLowerCase() + 'd';
	if (this.flip == 0) {
		document.images[ind + i].src = eval('this.gifs["' + st + '"]');
	} else {
		document.images[ind + 63 - i].src = eval('this.gifs["' + st + '"]');
	}
}

function getfen(fen) {
	var u;
	var bd = this.boardname;
	var t = spacesplit(fen);
	var l = t.length;
	if (l == 0) return;
	var s;
	var i;
	var j;
	var k;
	var h;
	var hold = emptyhold();
	var pos = new Array(64);
	if ((l > 0) && (isnum(t[l - 1]))) {
		this.bclock = Number(t[l - 1])
	}; //202104 Number by SKAcz
	if ((l > 1) && (isnum(t[l - 2]))) {
		this.wclock = Number(t[l - 2])
	};
	if ((l > 1) && (t[1] == "w")) {
		this.turn = bd.toUpperCase()
	};
	if ((l > 1) && (t[1] == "b")) {
		this.turn = bd
	};
	t = t[0].split('/');
	l = t.length;
	if ((l > 9) || (l < 8)) return;
	if (l == 9) {
		for (i = 0; i < t[8].length; i++) {
			s = tocol(t[8].charAt(i));
			j = this.piecetoind(s);
			if (j != -1) hold[j]++;
		};
	};
	k = 0;
	for (i = 0; i < 8; i++) {
		l = t[i].length;
		//if (l>8) return;
		for (j = 0; j < l; j++) {
			s = t[i].charAt(j);
			if (isnum(s)) {
				m = parseInt(s);
				if (m > 8) return;
				for (h = 0; h < m; h++) {
					pos[k + h] = ''
				};
				k += m;
			} else {
				if ((s == '~') && (k > 0) && (pos[k - 1].length > 1)) {
					s = pos[k - 1].charAt(1);
					u = pos[k - 1].charAt(0);
					pos[k - 1] = u + s.toUpperCase();
				} else {
					s = tocol(t[i].charAt(j));
					if (s != "") {
						pos[k] = s;
						k++
					};
				};
			}
		};
	};
	if (k < 64) return;
	this.pos = pos;
	this.hold = hold;
}

function findpiece(piece, ind) {
	var i;
	for (i = ind; i < 64; i++) {
		if (this.pos[i] == piece) {
			break;
		};
	};
	return i;
}


function board(name, dropbar, gifs, viewername, whitepl, blackpl, welo, belo, displaym, reloadm, bfen, timecontrol, flip, size, file_bg, redrawmode) {
	this.filebg = file_bg;
	this.redraw = redrawmode;
	this.sqsize = size;
	this.boardname = name;
	this.cfiles = 'abcdefgh';
	this.dropbar = dropbar;
	this.gifs = gifs;
	this.viewername = viewername;
	this.pos = new Array();
	this.hold = new Array();
	/* if (this.white=='') {this.white='White '+this.boardname.toUpperCase() };
	if (this.whiteelo=='') {this.whiteelo='++++'};
	if (this.black=='') {this.black='Black '+this.boardname.toUpperCase() };
	if (this.blackelo=='') {this.blackelo='++++'}; */

	this.displaymode = displaym;
	this.reloadmode = reloadm;
	this.uleft = -1;
	this.flip = flip;
	this.rdo = RDO;
	this.rdc = RDC;
	this.movecount = 1;
	this.kingw = -1;
	this.kingb = -1;

	this.highligtedsqfrom = -1;
	this.highligtedsqto = -1;


	this.startpos = new Array();
	this.starthold = new Array();
	this.enpasssq = '';
	this.needredraw = true;

	this.syncpic = syncpic; /* returns the index of the upper left corner of board one in array document.images[]. In fact returns this.uleft */

	this.getfen = getfen;
	this.brefreshform = brefreshform;
	this.drawpos = drawpos;
	this.drawhold = drawhold;
	this.piecetoind = piecetoind;
	this.drawboard = drawboard;
	this.isempty = isempty;
	this.incheck = incheck;
	this.inchecks = inchecks; //New201801
	this.legalmove = legalmove;
	this.legalmovechecking = legalmovechecking; //New201801
	this.findmove = findmove;
	this.redrawsquare = redrawsquare;
	this.redrawhold = redrawhold;
	this.enpassantvalid = enpassantvalid;
	this.setenpasssq = setenpasssq;
	this.shortcastle = shortcastle;
	this.longcastle = longcastle;
	this.setking = setking;
	this.dropmove = dropmove;
	this.undodropmove = undodropmove;
	this.findpiece = findpiece;
	this.changeturn = changeturn;
	this.loadboard = loadboard;
	this.generatebfen = generatebfen;
	this.generateRTFTextPosition = generateRTFTextPosition;

	this.loadboard(bfen, whitepl, blackpl, welo, belo, timecontrol);

	this.Highlight = Highlight
	this.unHighlightAll = unHighlightAll;
	this.highlightedSquares = []
}

function setmoven() {
	var n = this.BPGN.length;
	var i;
	var fa = false;
	var fb = false;
	var an;
	var bn;
	var bd;
	for (i = BPGN_ROOT + 1; i < n; i++) {
		if ((fa) & (fb)) return;
		bd = this.BPGN[i].cBoard;
		if ((!fa) && ((bd = 'A') || (bd = 'a'))) {
			this.a.movecount = this.BPGN[i].nMove;
			fa = true;
		};
		if ((!fa) && ((bd = 'B') || (bd = 'b'))) {
			this.b.movecount = this.BPGN[i].nMove;
			fb = true;
		};
	};
	if (!fa) {
		this.a.movecount = 1;
	};
	if (!fb) {
		this.b.movecount = 1;
	};
}

function game(the_viewer_name, bpgntext, bfen_pos, capture_mode, number_of_boards, display_mode, reload_mode, gif_file_path, sq_size, bg_color, flip) /* constructor of the game object */ {
	var size = sq_size;

	var col = bg_color.split('|');
	var filebg = false;
	this.whitesq = DEFAULT_WSQ_COL;
	this.blacksq = DEFAULT_BSQ_COL;
	if (col.length == 0) {
		filebg = true;
	};
	if (col.length == 1) {
		filebg = true;
	};
	if (col.length == 2) {
		bg_color = col[0];
	};
	if (col.length > 2) {
		bg_color = col[0];
		this.whitesq = col[1];
		this.blacksq = col[2];
	};
	if (bg_color.length < 1) {
		bg_color = "silver"
	};


	this.cfiles = "abcdefgh";
	this.rule = 'international';
	this.dropbar = DROPBAR;
	this.playtimeout = false;
	this.playtimeout1 = false;

	this.viewername = the_viewer_name; /* prefix of the names of all the elements (forms, images, etc.) of a viewer on which the game is displayed. E.g.  if names of the forms are ...viewwhitea, viewwhiteb,... then viewername=="view" */

	/* bpgntext is a string with bpgn text (including headers) of ONE game to load into viewer the_viewer_name
	start_move is a string with a move number, board and side to move in the position to be initially displayed in a viewer. Format is: Board (A or B) / Move Number / Side to move (B or W). For example B24B will display a position just BEFORE 24-th move of black on board B. Move number is the same as in the numbering of moves in bpgntext.

	number_of_boards controls number of boards in the viewer: eithter one (iff number_of_boards=="oneboard") or two

	bfen_pos is a string with initial position in bfen format*/

	var tmp = number_of_boards;
	if (tmp.toLowerCase() == "oneboard") {
		this.numboard = 1
	} else {
		this.numboard = 2
	};
	var x = 32 * 22 / 78;
	var z = 11 * sq_size;
	this.vwidth = z;
	z = (this.numboard == 1) ? z : 2 * z;
	this.cwidth = Math.floor(z / x - 15);
	if (this.cwidth > 60) this.cwidth = 60;


	this.displaymode = display_mode.toLowerCase(); /* Defines appearance of the viewer. displaymode=="Diagram" <=>Only diagram with position, no control buttons, no information window (info+ next move + comments); displaymode=="Playback" <=> no information window, but controls are present. By default full configuration, i.e. both controls and information are present */

	this.reloadmode = reload_mode.toLowerCase(); /* Determines whether this viewer will be able to show different games. reloadmode=="NoReload" <=> handles+ratings will be displayed via html rather than input form and thus would look better, but be unchangeable */


	this.capturemode = capture_mode.toLowerCase(); /* 3 possibilities to handle captures: bughouse(holandany), crazyhouse, and chess(i.e. captured pieces vanish), 'bug', 'zh' and 'chess' respectively if none is selected we the mode is choosed based on bpgn loaded */
	if ((this.capturemode != 'bug') && (this.capturemode != 'zh') && (this.capturemode != 'chess')) {
		this.capturemode = setcapture(bpgntext, this.numboard);
	};

	this.gifs = Init1(gif_file_path, filebg, this.whitesq, this.blacksq); /* associative array with names of gif files used to draw pieces and board*/
	//alert('this.gifs[wbd]:'+this.gifs["wbd"]+",");

	this.flip = (flip == "flip") ? 1 : 0; /* this.flip == 0 <=> no flip, this.flip==1 <=> flipped display */
	this.movestart = '';


	this.gameevent = "";
	this.gamedate = "";
	this.gamesite = "";
	this.timecontrol = "";
	this.gametime = 0; /* numerical: seconds per game, maybe redundant */
	this.gameinc = 0; /* numerical: time increment */
	this.gameresult = "";
	this.whitea = '';
	this.blacka = '';
	this.whiteb = '';
	this.blackb = '';
	this.whiteaelo = '';
	this.whitebelo = '';
	this.blackaelo = '';
	this.blackbelo = '';

	//savegame vars
	this.sgame = '';
	this.cSaveGameString = '';
	this.RTFTextPosition = '';

	//loadgame/savegame vars
	this.reloadwindow = false;
	this.savewindow = false;

	//f3 vars
	this.note = '';
	this.bIsNote = false;
	this.bfinish = false;
	this.nError = ERROR_NONE;
	this.cError = '';
	this.cResult1 = '';
	this.cResult2 = '';
	this.BPGN = new Array();
	this.BPGN[BPGN_ROOT] = new NODE();
	// initialize token queue
	this.Queue = new Array();
	this.afirstmove = false;
	this.bfirstmove = false;

	// gettoken vars
	this.ngamesize = 0;
	this.ngameindex = 0;
	this.cgame = '';
	this.nstate = BPGN_NORMAL;
	this.nlaststate = BPGN_NORMAL;
	this.ctoken = '';
	this.gettoken = gettoken;

	//savegame functions
	this.BPGN_SaveMove = BPGN_SaveMove;
	this.BPGN_SaveTime = BPGN_SaveTime;
	this.BPGN_SaveAnno = BPGN_SaveAnno;
	this.BPGN_SaveNote = BPGN_SaveNote;
	this.BPGN_SaveBody = BPGN_SaveBody;
	this.BPGN_SaveGame = BPGN_SaveGame;

	//f3 functions
	this.getbpgnheaders = getbpgnheaders; /* method that initializes above properties from the bpgn header. Returns true */
	this.BPGN_GetNewNode = BPGN_GetNewNode; // BPGN get new node
	this.BPGN_QueueIsEmpty = BPGN_QueueIsEmpty; // BPGN is token queue empty?
	this.BPGN_InsertQueue = BPGN_InsertQueue; // BPGN insert into token queue
	this.BPGN_RemoveQueue = BPGN_RemoveQueue; // BPGN remove from token queue
	this.gettoken = gettoken; // BPGN token parsing
	this.bpgnisnote = bpgnisnote; // BPGN is current token a note?
	this.bpgnisannotation = bpgnisannotation; // BPGN is current token an annotation?
	this.bpgnislag = bpgnislag; // BPGN is current token an annotation?
	this.bpgngetmove = bpgngetmove; // BPGN get move
	this.bpgngettime = bpgngettime; // BPGN get time
	this.bpgngetresult = bpgngetresult; // BPGN get result
	this.bpgngetnote = bpgngetnote; // BPGN get note or annotation
	this.bpgngetfirstnote = bpgngetfirstnote; // BPGN first note retrieval
	this.BPGN_GetBody = BPGN_GetBody; // BPGN get body
	this.bpgnfindend = bpgnfindend; // returns the index of last note of main line
	this.BPGN_DeleteCurrentMove = BPGN_DeleteCurrentMove;
	this.stuffnode = stuffnode;

	// draw functions
	this.drawviewer = drawviewer; /* method that generates html to display the viewer */
	this.setauleft = setauleft;
	this.drawinfo = drawinfo;
	this.drawdebug = drawdebug;
	this.drawcontrol = drawcontrol;
	this.otherbd = otherbd;
	this.execmove = execmove;
	this.decryptmove = decryptmove;
	this.castle = castle;
	this.undocastle = undocastle;
	this.capture = capture;
	this.enpassant = enpassant;
	this.undoenpassant = undoenpassant;
	this.promotion = promotion;
	this.undopromotion = undopromotion;
	this.regularmove = regularmove;
	this.undoregularmove = undoregularmove;
	this.backupmove = backupmove;
	this.undomove = undomove;
	this.forwardmove = forwardmove;
	this.mup = mup;
	this.mdown = mdown;
	this.getpromotion = getpromotion;
	this.promdialog = promdialog;
	this.reloadgame = reloadgame;
	this.refreshclock = refreshclock;
	this.refreshinfo = refreshinfo;
	this.refreshhighlight = refreshhighlight

	if (bpgntext.charAt(0) != '@') {
		tmp = this.getbpgnheaders(bpgntext);
	} else {
		tmp = "LOADING file";
		this.whitea = tmp;
		this.blacka = tmp;
		this.whiteb = tmp;
		this.blackb = tmp;
		readfile(this.viewername, bpgntext.substr(1));
	};

	this.cgame = extracttext(bpgntext);
	this.ngamesize = this.cgame.length;
	this.bpgngetfirstnote();
	this.BPGN_GetBody(BPGN_ROOT, 1, 1, 'A');
	this.endnode = this.bpgnfindend();

	var s = bfen_pos.split('|');

	this.a = new board("a", this.dropbar, this.gifs, this.viewername, this.whitea, this.blacka, this.whiteaelo, this.whitebelo, this.displaymode, this.reloadmode, s[0], this.gametime, this.flip, size, filebg, true);

	var redrawmode = (this.numboard == 1) ? false : true;
	this.b = new board("b", this.dropbar, this.gifs, this.viewername, this.whiteb, this.blackb, this.whitebelo, this.blackbelo, this.displaymode, this.reloadmode, s[1], this.gametime, (this.flip + 1) % 2, size, filebg, redrawmode);

	this.setmoven = setmoven;
	this.currentmove = BPGN_ROOT;
	this.setmoven();
	this.drawviewer(bg_color);
}
