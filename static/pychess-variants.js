(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.PychessVariants = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("./util");
function anim(mutation, state) {
    return state.animation.enabled ? animate(mutation, state) : render(mutation, state);
}
exports.anim = anim;
function render(mutation, state) {
    const result = mutation(state);
    state.dom.redraw();
    return result;
}
exports.render = render;
function makePiece(key, piece, firstRankIs0) {
    return {
        key: key,
        pos: util.key2pos(key, firstRankIs0),
        piece: piece
    };
}
function closer(piece, pieces) {
    return pieces.sort((p1, p2) => {
        return util.distanceSq(piece.pos, p1.pos) - util.distanceSq(piece.pos, p2.pos);
    })[0];
}
function computePlan(prevPieces, current) {
    const firstRankIs0 = current.dimensions.height === 10;
    const anims = {}, animedOrigs = [], fadings = {}, missings = [], news = [], prePieces = {};
    let curP, preP, i, vector;
    for (i in prevPieces) {
        prePieces[i] = makePiece(i, prevPieces[i], firstRankIs0);
    }
    for (const key of util.allKeys[current.geometry]) {
        curP = current.pieces[key];
        preP = prePieces[key];
        if (curP) {
            if (preP) {
                if (!util.samePiece(curP, preP.piece)) {
                    missings.push(preP);
                    news.push(makePiece(key, curP, firstRankIs0));
                }
            }
            else
                news.push(makePiece(key, curP, firstRankIs0));
        }
        else if (preP)
            missings.push(preP);
    }
    news.forEach(newP => {
        preP = closer(newP, missings.filter(p => util.samePiece(newP.piece, p.piece)));
        if (preP) {
            vector = [preP.pos[0] - newP.pos[0], preP.pos[1] - newP.pos[1]];
            anims[newP.key] = vector.concat(vector);
            animedOrigs.push(preP.key);
        }
    });
    missings.forEach(p => {
        if (!util.containsX(animedOrigs, p.key))
            fadings[p.key] = p.piece;
    });
    return {
        anims: anims,
        fadings: fadings
    };
}
function step(state, now) {
    const cur = state.animation.current;
    if (cur === undefined) {
        if (!state.dom.destroyed)
            state.dom.redrawNow();
        return;
    }
    const rest = 1 - (now - cur.start) * cur.frequency;
    if (rest <= 0) {
        state.animation.current = undefined;
        state.dom.redrawNow();
    }
    else {
        const ease = easing(rest);
        for (let i in cur.plan.anims) {
            const cfg = cur.plan.anims[i];
            cfg[2] = cfg[0] * ease;
            cfg[3] = cfg[1] * ease;
        }
        state.dom.redrawNow(true);
        requestAnimationFrame((now = performance.now()) => step(state, now));
    }
}
function animate(mutation, state) {
    const prevPieces = Object.assign({}, state.pieces);
    const result = mutation(state);
    const plan = computePlan(prevPieces, state);
    if (!isObjectEmpty(plan.anims) || !isObjectEmpty(plan.fadings)) {
        const alreadyRunning = state.animation.current && state.animation.current.start;
        state.animation.current = {
            start: performance.now(),
            frequency: 1 / state.animation.duration,
            plan: plan
        };
        if (!alreadyRunning)
            step(state, performance.now());
    }
    else {
        state.dom.redraw();
    }
    return result;
}
function isObjectEmpty(o) {
    for (let _ in o)
        return false;
    return true;
}
function easing(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

},{"./util":17}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const board = require("./board");
const fen_1 = require("./fen");
const config_1 = require("./config");
const anim_1 = require("./anim");
const drag_1 = require("./drag");
const explosion_1 = require("./explosion");
function start(state, redrawAll) {
    function toggleOrientation() {
        board.toggleOrientation(state);
        redrawAll();
    }
    ;
    return {
        set(config) {
            if (config.orientation && config.orientation !== state.orientation)
                toggleOrientation();
            (config.fen ? anim_1.anim : anim_1.render)(state => config_1.configure(state, config), state);
        },
        state,
        getFen: () => fen_1.write(state.pieces, state.geometry),
        toggleOrientation,
        setPieces(pieces) {
            anim_1.anim(state => board.setPieces(state, pieces), state);
        },
        selectSquare(key, force) {
            if (key)
                anim_1.anim(state => board.selectSquare(state, key, force), state);
            else if (state.selected) {
                board.unselect(state);
                state.dom.redraw();
            }
        },
        move(orig, dest) {
            anim_1.anim(state => board.baseMove(state, orig, dest), state);
        },
        newPiece(piece, key) {
            anim_1.anim(state => board.baseNewPiece(state, piece, key), state);
        },
        playPremove() {
            if (state.premovable.current) {
                if (anim_1.anim(board.playPremove, state))
                    return true;
                state.dom.redraw();
            }
            return false;
        },
        playPredrop(validate) {
            if (state.predroppable.current) {
                const result = board.playPredrop(state, validate);
                state.dom.redraw();
                return result;
            }
            return false;
        },
        cancelPremove() {
            anim_1.render(board.unsetPremove, state);
        },
        cancelPredrop() {
            anim_1.render(board.unsetPredrop, state);
        },
        cancelMove() {
            anim_1.render(state => { board.cancelMove(state); drag_1.cancel(state); }, state);
        },
        stop() {
            anim_1.render(state => { board.stop(state); drag_1.cancel(state); }, state);
        },
        explode(keys) {
            explosion_1.default(state, keys);
        },
        setAutoShapes(shapes) {
            anim_1.render(state => state.drawable.autoShapes = shapes, state);
        },
        setShapes(shapes) {
            anim_1.render(state => state.drawable.shapes = shapes, state);
        },
        getKeyAtDomPos(pos) {
            return board.getKeyAtDomPos(pos, state.orientation === 'white', state.dom.bounds(), state.geometry);
        },
        redrawAll,
        dragNewPiece(piece, event, force) {
            drag_1.dragNewPiece(state, piece, event, force);
        },
        destroy() {
            board.stop(state);
            state.dom.unbind && state.dom.unbind();
            state.dom.destroyed = true;
        }
    };
}
exports.start = start;

},{"./anim":1,"./board":3,"./config":5,"./drag":6,"./explosion":10,"./fen":11}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const premove_1 = require("./premove");
const cg = require("./types");
function callUserFunction(f, ...args) {
    if (f)
        setTimeout(() => f(...args), 1);
}
exports.callUserFunction = callUserFunction;
function toggleOrientation(state) {
    state.orientation = util_1.opposite(state.orientation);
    state.animation.current =
        state.draggable.current =
            state.selected = undefined;
}
exports.toggleOrientation = toggleOrientation;
function reset(state) {
    state.lastMove = undefined;
    unselect(state);
    unsetPremove(state);
    unsetPredrop(state);
}
exports.reset = reset;
function setPieces(state, pieces) {
    for (let key in pieces) {
        const piece = pieces[key];
        if (piece)
            state.pieces[key] = piece;
        else
            delete state.pieces[key];
    }
}
exports.setPieces = setPieces;
function setCheck(state, color) {
    state.check = undefined;
    if (color === true)
        color = state.turnColor;
    if (color)
        for (let k in state.pieces) {
            if (state.pieces[k].role === 'king' && state.pieces[k].color === color) {
                state.check = k;
            }
        }
}
exports.setCheck = setCheck;
function setPremove(state, orig, dest, meta) {
    unsetPredrop(state);
    state.premovable.current = [orig, dest];
    callUserFunction(state.premovable.events.set, orig, dest, meta);
}
function unsetPremove(state) {
    if (state.premovable.current) {
        state.premovable.current = undefined;
        callUserFunction(state.premovable.events.unset);
    }
}
exports.unsetPremove = unsetPremove;
function setPredrop(state, role, key) {
    unsetPremove(state);
    state.predroppable.current = {
        role: role,
        key: key
    };
    callUserFunction(state.predroppable.events.set, role, key);
}
function unsetPredrop(state) {
    const pd = state.predroppable;
    if (pd.current) {
        pd.current = undefined;
        callUserFunction(pd.events.unset);
    }
}
exports.unsetPredrop = unsetPredrop;
function tryAutoCastle(state, orig, dest) {
    if (!state.autoCastle)
        return false;
    const king = state.pieces[orig];
    if (!king || king.role !== 'king')
        return false;
    const firstRankIs0 = state.dimensions.height === 10;
    const origPos = util_1.key2pos(orig, firstRankIs0);
    if (origPos[0] !== 5)
        return false;
    if (origPos[1] !== 1 && origPos[1] !== 8)
        return false;
    const destPos = util_1.key2pos(dest, firstRankIs0);
    let oldRookPos, newRookPos, newKingPos;
    if (destPos[0] === 7 || destPos[0] === 8) {
        oldRookPos = util_1.pos2key([8, origPos[1]], state.geometry);
        newRookPos = util_1.pos2key([6, origPos[1]], state.geometry);
        newKingPos = util_1.pos2key([7, origPos[1]], state.geometry);
    }
    else if (destPos[0] === 3 || destPos[0] === 1) {
        oldRookPos = util_1.pos2key([1, origPos[1]], state.geometry);
        newRookPos = util_1.pos2key([4, origPos[1]], state.geometry);
        newKingPos = util_1.pos2key([3, origPos[1]], state.geometry);
    }
    else
        return false;
    const rook = state.pieces[oldRookPos];
    if (!rook || rook.role !== 'rook')
        return false;
    delete state.pieces[orig];
    delete state.pieces[oldRookPos];
    state.pieces[newKingPos] = king;
    state.pieces[newRookPos] = rook;
    return true;
}
function baseMove(state, orig, dest) {
    const origPiece = state.pieces[orig], destPiece = state.pieces[dest];
    if (orig === dest || !origPiece)
        return false;
    const captured = (destPiece && destPiece.color !== origPiece.color) ? destPiece : undefined;
    if (dest == state.selected)
        unselect(state);
    callUserFunction(state.events.move, orig, dest, captured);
    if (!tryAutoCastle(state, orig, dest)) {
        state.pieces[dest] = origPiece;
        delete state.pieces[orig];
    }
    state.lastMove = [orig, dest];
    state.check = undefined;
    callUserFunction(state.events.change);
    return captured || true;
}
exports.baseMove = baseMove;
function baseNewPiece(state, piece, key, force) {
    if (state.pieces[key]) {
        if (force)
            delete state.pieces[key];
        else
            return false;
    }
    callUserFunction(state.events.dropNewPiece, piece, key);
    state.pieces[key] = piece;
    state.lastMove = [key];
    state.check = undefined;
    callUserFunction(state.events.change);
    state.movable.dests = undefined;
    state.turnColor = util_1.opposite(state.turnColor);
    return true;
}
exports.baseNewPiece = baseNewPiece;
function baseUserMove(state, orig, dest) {
    const result = baseMove(state, orig, dest);
    if (result) {
        state.movable.dests = undefined;
        state.turnColor = util_1.opposite(state.turnColor);
        state.animation.current = undefined;
    }
    return result;
}
function userMove(state, orig, dest) {
    if (canMove(state, orig, dest)) {
        const result = baseUserMove(state, orig, dest);
        if (result) {
            const holdTime = state.hold.stop();
            unselect(state);
            const metadata = {
                premove: false,
                ctrlKey: state.stats.ctrlKey,
                holdTime: holdTime,
            };
            if (result !== true)
                metadata.captured = result;
            callUserFunction(state.movable.events.after, orig, dest, metadata);
            return true;
        }
    }
    else if (canPremove(state, orig, dest)) {
        setPremove(state, orig, dest, {
            ctrlKey: state.stats.ctrlKey
        });
        unselect(state);
    }
    else if (isMovable(state, dest) || isPremovable(state, dest)) {
        setSelected(state, dest);
        state.hold.start();
    }
    else
        unselect(state);
    return false;
}
exports.userMove = userMove;
function dropNewPiece(state, orig, dest, force) {
    if (canDrop(state, orig, dest) || force) {
        const piece = state.pieces[orig];
        delete state.pieces[orig];
        baseNewPiece(state, piece, dest, force);
        callUserFunction(state.movable.events.afterNewPiece, piece.role, dest, {
            predrop: false
        });
    }
    else if (canPredrop(state, orig, dest)) {
        setPredrop(state, state.pieces[orig].role, dest);
    }
    else {
        unsetPremove(state);
        unsetPredrop(state);
    }
    delete state.pieces[orig];
    unselect(state);
}
exports.dropNewPiece = dropNewPiece;
function selectSquare(state, key, force) {
    if (state.selected) {
        if (state.selected === key && !state.draggable.enabled) {
            unselect(state);
            state.hold.cancel();
        }
        else if ((state.selectable.enabled || force) && state.selected !== key) {
            if (userMove(state, state.selected, key))
                state.stats.dragged = false;
        }
        else
            state.hold.start();
    }
    else if (isMovable(state, key) || isPremovable(state, key)) {
        setSelected(state, key);
        state.hold.start();
    }
    callUserFunction(state.events.select, key);
}
exports.selectSquare = selectSquare;
function setSelected(state, key) {
    state.selected = key;
    if (isPremovable(state, key)) {
        state.premovable.dests = premove_1.default(state.pieces, key, state.premovable.castle, state.geometry);
    }
    else
        state.premovable.dests = undefined;
}
exports.setSelected = setSelected;
function unselect(state) {
    state.selected = undefined;
    state.premovable.dests = undefined;
    state.hold.cancel();
}
exports.unselect = unselect;
function isMovable(state, orig) {
    const piece = state.pieces[orig];
    return !!piece && (state.movable.color === 'both' || (state.movable.color === piece.color &&
        state.turnColor === piece.color));
}
function canMove(state, orig, dest) {
    return orig !== dest && isMovable(state, orig) && (state.movable.free || (!!state.movable.dests && util_1.containsX(state.movable.dests[orig], dest)));
}
exports.canMove = canMove;
function canDrop(state, orig, dest) {
    const piece = state.pieces[orig];
    return !!piece && dest && (orig === dest || !state.pieces[dest]) && (state.movable.color === 'both' || (state.movable.color === piece.color &&
        state.turnColor === piece.color));
}
function isPremovable(state, orig) {
    const piece = state.pieces[orig];
    return !!piece && state.premovable.enabled &&
        state.movable.color === piece.color &&
        state.turnColor !== piece.color;
}
function canPremove(state, orig, dest) {
    return orig !== dest &&
        isPremovable(state, orig) &&
        util_1.containsX(premove_1.default(state.pieces, orig, state.premovable.castle, state.geometry), dest);
}
function canPredrop(state, orig, dest) {
    const piece = state.pieces[orig];
    const destPiece = state.pieces[dest];
    return !!piece && dest &&
        (!destPiece || destPiece.color !== state.movable.color) &&
        state.predroppable.enabled &&
        (piece.role !== 'pawn' || (dest[1] !== '1' && dest[1] !== '8')) &&
        state.movable.color === piece.color &&
        state.turnColor !== piece.color;
}
function isDraggable(state, orig) {
    const piece = state.pieces[orig];
    return !!piece && state.draggable.enabled && (state.movable.color === 'both' || (state.movable.color === piece.color && (state.turnColor === piece.color || state.premovable.enabled)));
}
exports.isDraggable = isDraggable;
function playPremove(state) {
    const move = state.premovable.current;
    if (!move)
        return false;
    const orig = move[0], dest = move[1];
    let success = false;
    if (canMove(state, orig, dest)) {
        const result = baseUserMove(state, orig, dest);
        if (result) {
            const metadata = { premove: true };
            if (result !== true)
                metadata.captured = result;
            callUserFunction(state.movable.events.after, orig, dest, metadata);
            success = true;
        }
    }
    unsetPremove(state);
    return success;
}
exports.playPremove = playPremove;
function playPredrop(state, validate) {
    let drop = state.predroppable.current, success = false;
    if (!drop)
        return false;
    if (validate(drop)) {
        const piece = {
            role: drop.role,
            color: state.movable.color
        };
        if (baseNewPiece(state, piece, drop.key)) {
            callUserFunction(state.movable.events.afterNewPiece, drop.role, drop.key, {
                predrop: true
            });
            success = true;
        }
    }
    unsetPredrop(state);
    return success;
}
exports.playPredrop = playPredrop;
function cancelMove(state) {
    unsetPremove(state);
    unsetPredrop(state);
    unselect(state);
}
exports.cancelMove = cancelMove;
function stop(state) {
    state.movable.color =
        state.movable.dests =
            state.animation.current = undefined;
    cancelMove(state);
}
exports.stop = stop;
function getKeyAtDomPos(pos, asWhite, bounds, geom) {
    const bd = cg.dimensions[geom];
    let file = Math.ceil(bd.width * ((pos[0] - bounds.left) / bounds.width));
    if (!asWhite)
        file = bd.width + 1 - file;
    let rank = Math.ceil(bd.height - (bd.height * ((pos[1] - bounds.top) / bounds.height)));
    if (!asWhite)
        rank = bd.height + 1 - rank;
    return (file > 0 && file < bd.width + 1 && rank > 0 && rank < bd.height + 1) ? util_1.pos2key([file, rank], geom) : undefined;
}
exports.getKeyAtDomPos = getKeyAtDomPos;

},{"./premove":12,"./types":16,"./util":17}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("./api");
const config_1 = require("./config");
const state_1 = require("./state");
const wrap_1 = require("./wrap");
const events = require("./events");
const render_1 = require("./render");
const svg = require("./svg");
const util = require("./util");
function Chessground(element, config) {
    const state = state_1.defaults();
    config_1.configure(state, config || {});
    function redrawAll() {
        let prevUnbind = state.dom && state.dom.unbind;
        element.classList.add('cg-wrap');
        const relative = state.viewOnly && !state.drawable.visible;
        const elements = wrap_1.default(element, state, relative);
        const bounds = util.memo(() => elements.board.getBoundingClientRect());
        const redrawNow = (skipSvg) => {
            render_1.default(state);
            if (!skipSvg && elements.svg)
                svg.renderSvg(state, elements.svg);
        };
        state.dom = {
            elements: elements,
            bounds: bounds,
            redraw: debounceRedraw(redrawNow),
            redrawNow: redrawNow,
            unbind: prevUnbind,
            relative
        };
        state.drawable.prevSvgHash = '';
        redrawNow(false);
        events.bindBoard(state);
        if (!prevUnbind)
            state.dom.unbind = events.bindDocument(state, redrawAll);
        state.events.insert && state.events.insert(elements);
    }
    redrawAll();
    const api = api_1.start(state, redrawAll);
    return api;
}
exports.Chessground = Chessground;
;
function debounceRedraw(redrawNow) {
    let redrawing = false;
    return () => {
        if (redrawing)
            return;
        redrawing = true;
        requestAnimationFrame(() => {
            redrawNow();
            redrawing = false;
        });
    };
}

},{"./api":2,"./config":5,"./events":9,"./render":13,"./state":14,"./svg":15,"./util":17,"./wrap":18}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const board_1 = require("./board");
const fen_1 = require("./fen");
const cg = require("./types");
function configure(state, config) {
    if (config.movable && config.movable.dests)
        state.movable.dests = undefined;
    merge(state, config);
    if (config.geometry)
        state.dimensions = cg.dimensions[config.geometry];
    if (config.fen) {
        state.pieces = fen_1.read(config.fen);
        state.drawable.shapes = [];
    }
    if (config.hasOwnProperty('check'))
        board_1.setCheck(state, config.check || false);
    if (config.hasOwnProperty('lastMove') && !config.lastMove)
        state.lastMove = undefined;
    else if (config.lastMove)
        state.lastMove = config.lastMove;
    if (state.selected)
        board_1.setSelected(state, state.selected);
    if (!state.animation.duration || state.animation.duration < 100)
        state.animation.enabled = false;
    if (!state.movable.rookCastle && state.movable.dests) {
        const rank = state.movable.color === 'white' ? 1 : 8;
        const kingStartPos = 'e' + rank;
        const dests = state.movable.dests[kingStartPos];
        const king = state.pieces[kingStartPos];
        if (!dests || !king || king.role !== 'king')
            return;
        state.movable.dests[kingStartPos] = dests.filter(d => !((d === 'a' + rank) && dests.indexOf('c' + rank) !== -1) &&
            !((d === 'h' + rank) && dests.indexOf('g' + rank) !== -1));
    }
}
exports.configure = configure;
;
function merge(base, extend) {
    for (let key in extend) {
        if (isObject(base[key]) && isObject(extend[key]))
            merge(base[key], extend[key]);
        else
            base[key] = extend[key];
    }
}
function isObject(o) {
    return typeof o === 'object';
}

},{"./board":3,"./fen":11,"./types":16}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const board = require("./board");
const util = require("./util");
const draw_1 = require("./draw");
const anim_1 = require("./anim");
function start(s, e) {
    if (e.button !== undefined && e.button !== 0)
        return;
    if (e.touches && e.touches.length > 1)
        return;
    const asWhite = s.orientation === 'white', bounds = s.dom.bounds(), position = util.eventPosition(e), orig = board.getKeyAtDomPos(position, asWhite, bounds, s.geometry);
    if (!orig)
        return;
    const piece = s.pieces[orig];
    const previouslySelected = s.selected;
    if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || (!piece || piece.color !== s.turnColor)))
        draw_1.clear(s);
    if (e.cancelable !== false &&
        (!e.touches || !s.movable.color || piece || previouslySelected || pieceCloseTo(s, position)))
        e.preventDefault();
    const hadPremove = !!s.premovable.current;
    const hadPredrop = !!s.predroppable.current;
    s.stats.ctrlKey = e.ctrlKey;
    if (s.selected && board.canMove(s, s.selected, orig)) {
        anim_1.anim(state => board.selectSquare(state, orig), s);
    }
    else {
        board.selectSquare(s, orig);
    }
    const stillSelected = s.selected === orig;
    const element = pieceElementByKey(s, orig);
    const firstRankIs0 = s.dimensions.height === 10;
    if (piece && element && stillSelected && board.isDraggable(s, orig)) {
        const squareBounds = computeSquareBounds(orig, asWhite, bounds, s.dimensions);
        s.draggable.current = {
            orig: orig,
            origPos: util.key2pos(orig, firstRankIs0),
            piece: piece,
            rel: position,
            epos: position,
            pos: [0, 0],
            dec: s.draggable.centerPiece ? [
                position[0] - (squareBounds.left + squareBounds.width / 2),
                position[1] - (squareBounds.top + squareBounds.height / 2)
            ] : [0, 0],
            started: s.draggable.autoDistance && s.stats.dragged,
            element: element,
            previouslySelected: previouslySelected,
            originTarget: e.target
        };
        element.cgDragging = true;
        element.classList.add('dragging');
        const ghost = s.dom.elements.ghost;
        if (ghost) {
            ghost.className = `ghost ${piece.color} ${piece.role}`;
            util.translateAbs(ghost, util.posToTranslateAbs(bounds, s.dimensions)(util.key2pos(orig, firstRankIs0), asWhite));
            util.setVisible(ghost, true);
        }
        processDrag(s);
    }
    else {
        if (hadPremove)
            board.unsetPremove(s);
        if (hadPredrop)
            board.unsetPredrop(s);
    }
    s.dom.redraw();
}
exports.start = start;
function pieceCloseTo(s, pos) {
    const asWhite = s.orientation === 'white', bounds = s.dom.bounds(), radiusSq = Math.pow(bounds.width / 8, 2);
    for (let key in s.pieces) {
        const squareBounds = computeSquareBounds(key, asWhite, bounds, s.dimensions), center = [
            squareBounds.left + squareBounds.width / 2,
            squareBounds.top + squareBounds.height / 2
        ];
        if (util.distanceSq(center, pos) <= radiusSq)
            return true;
    }
    return false;
}
exports.pieceCloseTo = pieceCloseTo;
function dragNewPiece(s, piece, e, force) {
    const key = 'a0';
    s.pieces[key] = piece;
    s.dom.redraw();
    const position = util.eventPosition(e), asWhite = s.orientation === 'white', bounds = s.dom.bounds(), squareBounds = computeSquareBounds(key, asWhite, bounds, s.dimensions);
    const rel = [
        (asWhite ? 0 : s.dimensions.width - 1) * squareBounds.width + bounds.left,
        (asWhite ? s.dimensions.height : -1) * squareBounds.height + bounds.top
    ];
    const firstRankIs0 = s.dimensions.height === 10;
    s.draggable.current = {
        orig: key,
        origPos: util.key2pos(key, firstRankIs0),
        piece: piece,
        rel: rel,
        epos: position,
        pos: [position[0] - rel[0], position[1] - rel[1]],
        dec: [-squareBounds.width / 2, -squareBounds.height / 2],
        started: true,
        element: () => pieceElementByKey(s, key),
        originTarget: e.target,
        newPiece: true,
        force: force || false
    };
    processDrag(s);
}
exports.dragNewPiece = dragNewPiece;
function processDrag(s) {
    requestAnimationFrame(() => {
        const cur = s.draggable.current;
        if (!cur)
            return;
        if (s.animation.current && s.animation.current.plan.anims[cur.orig])
            s.animation.current = undefined;
        const origPiece = s.pieces[cur.orig];
        if (!origPiece || !util.samePiece(origPiece, cur.piece))
            cancel(s);
        else {
            if (!cur.started && util.distanceSq(cur.epos, cur.rel) >= Math.pow(s.draggable.distance, 2))
                cur.started = true;
            if (cur.started) {
                if (typeof cur.element === 'function') {
                    const found = cur.element();
                    if (!found)
                        return;
                    cur.element = found;
                    cur.element.cgDragging = true;
                    cur.element.classList.add('dragging');
                }
                const asWhite = s.orientation === 'white', bounds = s.dom.bounds();
                cur.pos = [
                    cur.epos[0] - cur.rel[0],
                    cur.epos[1] - cur.rel[1]
                ];
                const translation = util.posToTranslateAbs(bounds, s.dimensions)(cur.origPos, asWhite);
                translation[0] += cur.pos[0] + cur.dec[0];
                translation[1] += cur.pos[1] + cur.dec[1];
                util.translateAbs(cur.element, translation);
            }
        }
        processDrag(s);
    });
}
function move(s, e) {
    if (s.draggable.current && (!e.touches || e.touches.length < 2)) {
        s.draggable.current.epos = util.eventPosition(e);
    }
}
exports.move = move;
function end(s, e) {
    const cur = s.draggable.current;
    if (!cur)
        return;
    if (e.type === 'touchend' && e.cancelable !== false)
        e.preventDefault();
    if (e.type === 'touchend' && cur && cur.originTarget !== e.target && !cur.newPiece) {
        s.draggable.current = undefined;
        return;
    }
    board.unsetPremove(s);
    board.unsetPredrop(s);
    const eventPos = util.eventPosition(e) || cur.epos;
    const dest = board.getKeyAtDomPos(eventPos, s.orientation === 'white', s.dom.bounds(), s.geometry);
    if (dest && cur.started) {
        if (cur.newPiece)
            board.dropNewPiece(s, cur.orig, dest, cur.force);
        else {
            s.stats.ctrlKey = e.ctrlKey;
            if (board.userMove(s, cur.orig, dest))
                s.stats.dragged = true;
        }
    }
    else if (cur.newPiece) {
        delete s.pieces[cur.orig];
    }
    else if (s.draggable.deleteOnDropOff) {
        delete s.pieces[cur.orig];
        board.callUserFunction(s.events.change);
    }
    if (cur && cur.orig === cur.previouslySelected && (cur.orig === dest || !dest))
        board.unselect(s);
    else if (!s.selectable.enabled)
        board.unselect(s);
    removeDragElements(s);
    s.draggable.current = undefined;
    s.dom.redraw();
}
exports.end = end;
function cancel(s) {
    const cur = s.draggable.current;
    if (cur) {
        if (cur.newPiece)
            delete s.pieces[cur.orig];
        s.draggable.current = undefined;
        board.unselect(s);
        removeDragElements(s);
        s.dom.redraw();
    }
}
exports.cancel = cancel;
function removeDragElements(s) {
    const e = s.dom.elements;
    if (e.ghost)
        util.setVisible(e.ghost, false);
}
function computeSquareBounds(key, asWhite, bounds, bd) {
    const firstRankIs0 = bd.height === 10;
    const pos = util.key2pos(key, firstRankIs0);
    if (!asWhite) {
        pos[0] = bd.width + 1 - pos[0];
        pos[1] = bd.height + 1 - pos[1];
    }
    return {
        left: bounds.left + bounds.width * (pos[0] - 1) / bd.width,
        top: bounds.top + bounds.height * (bd.height - pos[1]) / bd.height,
        width: bounds.width / bd.width,
        height: bounds.height / bd.height
    };
}
function pieceElementByKey(s, key) {
    let el = s.dom.elements.board.firstChild;
    while (el) {
        if (el.cgKey === key && el.tagName === 'PIECE')
            return el;
        el = el.nextSibling;
    }
    return undefined;
}

},{"./anim":1,"./board":3,"./draw":7,"./util":17}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const board_1 = require("./board");
const util_1 = require("./util");
const brushes = ['green', 'red', 'blue', 'yellow'];
function start(state, e) {
    if (e.touches && e.touches.length > 1)
        return;
    e.stopPropagation();
    e.preventDefault();
    e.ctrlKey ? board_1.unselect(state) : board_1.cancelMove(state);
    const position = util_1.eventPosition(e);
    const orig = board_1.getKeyAtDomPos(position, state.orientation === 'white', state.dom.bounds(), state.geometry);
    if (!orig)
        return;
    state.drawable.current = {
        orig: orig,
        pos: position,
        brush: eventBrush(e)
    };
    processDraw(state);
}
exports.start = start;
function processDraw(state) {
    requestAnimationFrame(() => {
        const cur = state.drawable.current;
        if (cur) {
            const mouseSq = board_1.getKeyAtDomPos(cur.pos, state.orientation === 'white', state.dom.bounds(), state.geometry);
            if (mouseSq !== cur.mouseSq) {
                cur.mouseSq = mouseSq;
                cur.dest = mouseSq !== cur.orig ? mouseSq : undefined;
                state.dom.redrawNow();
            }
            processDraw(state);
        }
    });
}
exports.processDraw = processDraw;
function move(state, e) {
    if (state.drawable.current)
        state.drawable.current.pos = util_1.eventPosition(e);
}
exports.move = move;
function end(state) {
    const cur = state.drawable.current;
    if (cur) {
        if (cur.mouseSq)
            addShape(state.drawable, cur);
        cancel(state);
    }
}
exports.end = end;
function cancel(state) {
    if (state.drawable.current) {
        state.drawable.current = undefined;
        state.dom.redraw();
    }
}
exports.cancel = cancel;
function clear(state) {
    if (state.drawable.shapes.length) {
        state.drawable.shapes = [];
        state.dom.redraw();
        onChange(state.drawable);
    }
}
exports.clear = clear;
function eventBrush(e) {
    const a = e.shiftKey && util_1.isRightButton(e) ? 1 : 0;
    const b = e.altKey ? 2 : 0;
    return brushes[a + b];
}
function not(f) {
    return (x) => !f(x);
}
function addShape(drawable, cur) {
    const sameShape = (s) => {
        return s.orig === cur.orig && s.dest === cur.dest;
    };
    const similar = drawable.shapes.filter(sameShape)[0];
    if (similar)
        drawable.shapes = drawable.shapes.filter(not(sameShape));
    if (!similar || similar.brush !== cur.brush)
        drawable.shapes.push(cur);
    onChange(drawable);
}
function onChange(drawable) {
    if (drawable.onChange)
        drawable.onChange(drawable.shapes);
}

},{"./board":3,"./util":17}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const board = require("./board");
const util = require("./util");
const drag_1 = require("./drag");
function setDropMode(s, piece) {
    s.dropmode = {
        active: true,
        piece
    };
    drag_1.cancel(s);
}
exports.setDropMode = setDropMode;
function cancelDropMode(s) {
    s.dropmode = {
        active: false
    };
}
exports.cancelDropMode = cancelDropMode;
function drop(s, e) {
    if (!s.dropmode.active)
        return;
    board.unsetPremove(s);
    board.unsetPredrop(s);
    const piece = s.dropmode.piece;
    if (piece) {
        s.pieces.a0 = piece;
        const position = util.eventPosition(e);
        const dest = position && board.getKeyAtDomPos(position, s.orientation === 'white', s.dom.bounds(), s.geometry);
        if (dest)
            board.dropNewPiece(s, 'a0', dest);
    }
    s.dom.redraw();
}
exports.drop = drop;

},{"./board":3,"./drag":6,"./util":17}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drag = require("./drag");
const draw = require("./draw");
const drop_1 = require("./drop");
const util_1 = require("./util");
function bindBoard(s) {
    if (s.viewOnly)
        return;
    const boardEl = s.dom.elements.board, onStart = startDragOrDraw(s);
    boardEl.addEventListener('touchstart', onStart, { passive: false });
    boardEl.addEventListener('mousedown', onStart, { passive: false });
    if (s.disableContextMenu || s.drawable.enabled) {
        boardEl.addEventListener('contextmenu', e => e.preventDefault());
    }
}
exports.bindBoard = bindBoard;
function bindDocument(s, redrawAll) {
    const unbinds = [];
    if (!s.dom.relative && s.resizable) {
        const onResize = () => {
            s.dom.bounds.clear();
            requestAnimationFrame(redrawAll);
        };
        unbinds.push(unbindable(document.body, 'chessground.resize', onResize));
    }
    if (!s.viewOnly) {
        const onmove = dragOrDraw(s, drag.move, draw.move);
        const onend = dragOrDraw(s, drag.end, draw.end);
        ['touchmove', 'mousemove'].forEach(ev => unbinds.push(unbindable(document, ev, onmove)));
        ['touchend', 'mouseup'].forEach(ev => unbinds.push(unbindable(document, ev, onend)));
        const onScroll = () => s.dom.bounds.clear();
        unbinds.push(unbindable(window, 'scroll', onScroll, { passive: true }));
        unbinds.push(unbindable(window, 'resize', onScroll, { passive: true }));
    }
    return () => unbinds.forEach(f => f());
}
exports.bindDocument = bindDocument;
function unbindable(el, eventName, callback, options) {
    el.addEventListener(eventName, callback, options);
    return () => el.removeEventListener(eventName, callback);
}
function startDragOrDraw(s) {
    return e => {
        if (s.draggable.current)
            drag.cancel(s);
        else if (s.drawable.current)
            draw.cancel(s);
        else if (e.shiftKey || util_1.isRightButton(e)) {
            if (s.drawable.enabled)
                draw.start(s, e);
        }
        else if (!s.viewOnly) {
            if (s.dropmode.active)
                drop_1.drop(s, e);
            else
                drag.start(s, e);
        }
    };
}
function dragOrDraw(s, withDrag, withDraw) {
    return e => {
        if (e.shiftKey || util_1.isRightButton(e)) {
            if (s.drawable.enabled)
                withDraw(s, e);
        }
        else if (!s.viewOnly)
            withDrag(s, e);
    };
}

},{"./drag":6,"./draw":7,"./drop":8,"./util":17}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function explosion(state, keys) {
    state.exploding = {
        stage: 1,
        keys: keys
    };
    state.dom.redraw();
    setTimeout(() => {
        setStage(state, 2);
        setTimeout(() => setStage(state, undefined), 120);
    }, 120);
}
exports.default = explosion;
function setStage(state, stage) {
    if (state.exploding) {
        if (stage)
            state.exploding.stage = stage;
        else
            state.exploding = undefined;
        state.dom.redraw();
    }
}

},{}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const cg = require("./types");
exports.initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const roles8 = {
    p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king', m: 'met', f: 'ferz', s: 'silver', c: 'cancellor', a: 'archbishop', h: 'hawk', e: 'elephant'
};
const roles9 = {
    p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', k: 'king', g: 'gold', s: 'silver', l: 'lance'
};
const roles10 = {
    p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', k: 'king', c: 'cannon', a: 'advisor'
};
const letters8 = {
    pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', queen: 'q', king: 'k', met: 'm', ferz: 'f', silver: 's', cancellor: 'c', archbishop: 'a', hawk: 'h', elephant: 'e'
};
const letters9 = {
    pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', king: 'k', gold: 'g', silver: 's', lance: 'l',
    ppawn: '+p', pknight: '+n', pbishop: '+b', prook: '+r', psilver: '+s', plance: '+l'
};
const letters10 = {
    pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', king: 'k', cannon: 'c', advisor: 'a'
};
function read(fen) {
    if (fen === 'start')
        fen = exports.initial;
    if (fen.indexOf('[') !== -1)
        fen = fen.slice(0, fen.indexOf('['));
    const pieces = {};
    let row = fen.split("/").length;
    let col = 0;
    let promoted = false;
    const roles = row === 10 ? roles10 : row === 9 ? roles9 : roles8;
    const firstRankIs0 = row === 10;
    const shogi = row === 9;
    for (const c of fen) {
        switch (c) {
            case ' ': return pieces;
            case '/':
                --row;
                if (row === 0)
                    return pieces;
                col = 0;
                break;
            case '+':
                promoted = true;
                break;
            case '~':
                const piece = pieces[cg.files[col] + cg.ranks[firstRankIs0 ? row : row + 1]];
                if (piece)
                    piece.promoted = true;
                break;
            default:
                const nb = c.charCodeAt(0);
                if (nb < 58)
                    col += (c === '0') ? 9 : nb - 48;
                else {
                    ++col;
                    const role = c.toLowerCase();
                    let piece = {
                        role: roles[role],
                        color: (c === role ? shogi ? 'white' : 'black' : shogi ? 'black' : 'white')
                    };
                    if (promoted) {
                        piece.role = 'p' + piece.role;
                        piece.promoted = true;
                        promoted = false;
                    }
                    ;
                    if (shogi) {
                        pieces[cg.files[10 - col - 1] + cg.ranks[10 - row]] = piece;
                    }
                    else {
                        pieces[cg.files[col - 1] + cg.ranks[firstRankIs0 ? row - 1 : row]] = piece;
                    }
                    ;
                }
        }
    }
    return pieces;
}
exports.read = read;
function write(pieces, geom) {
    const height = cg.dimensions[geom].height;
    var letters = {};
    switch (height) {
        case 10:
            letters = letters10;
            break;
        case 9:
            letters = letters9;
            break;
        default:
            letters = letters8;
            break;
    }
    ;
    return util_1.invNRanks.map(y => util_1.NRanks.map(x => {
        const piece = pieces[util_1.pos2key([x, y], geom)];
        if (piece) {
            const letter = letters[piece.role];
            return piece.color === 'white' ? letter.toUpperCase() : letter;
        }
        else
            return '1';
    }).join('')).join('/').replace(/1{2,}/g, s => s.length.toString());
}
exports.write = write;

},{"./types":16,"./util":17}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("./util");
const cg = require("./types");
function diff(a, b) {
    return Math.abs(a - b);
}
function pawn(color) {
    return (x1, y1, x2, y2) => diff(x1, x2) < 2 && (color === 'white' ? (y2 === y1 + 1 || (y1 <= 2 && y2 === (y1 + 2) && x1 === x2)) : (y2 === y1 - 1 || (y1 >= 7 && y2 === (y1 - 2) && x1 === x2)));
}
const knight = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === 1 && yd === 2) || (xd === 2 && yd === 1);
};
const bishop = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2);
};
const rook = (x1, y1, x2, y2) => {
    return x1 === x2 || y1 === y2;
};
const queen = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2);
};
function king(color, rookFiles, canCastle) {
    return (x1, y1, x2, y2) => (diff(x1, x2) < 2 && diff(y1, y2) < 2) || (canCastle && y1 === y2 && y1 === (color === 'white' ? 1 : 8) && ((x1 === 5 && (x2 === 3 || x2 === 7)) || util.containsX(rookFiles, x2)));
}
const met = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 1;
};
const archbishop = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
const cancellor = (x1, y1, x2, y2) => {
    return rook(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
function lance(color) {
    return (x1, y1, x2, y2) => (x2 === x1 && (color === 'white' ? y2 > y1 : y2 < y1));
}
function silver(color) {
    return (x1, y1, x2, y2) => (met(x1, y1, x2, y2) || (x1 === x2 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1)));
}
function gold(color) {
    return (x1, y1, x2, y2) => (diff(x1, x2) < 2 && diff(y1, y2) < 2 && (color === 'white' ?
        !((x2 === x1 - 1 && y2 === y1 - 1) || (x2 === x1 + 1 && y2 === y1 - 1)) :
        !((x2 === x1 + 1 && y2 === y1 + 1) || (x2 === x1 - 1 && y2 === y1 + 1))));
}
function spawn(color) {
    return (x1, y1, x2, y2) => (x2 === x1 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1));
}
function sknight(color) {
    return (x1, y1, x2, y2) => color === 'white' ?
        (y2 === y1 + 2 && x2 === x1 - 1 || y2 === y1 + 2 && x2 === x1 + 1) :
        (y2 === y1 - 2 && x2 === x1 - 1 || y2 === y1 - 2 && x2 === x1 + 1);
}
const prook = (x1, y1, x2, y2) => {
    return rook(x1, y1, x2, y2) || (diff(x1, x2) < 2 && diff(y1, y2) < 2);
};
const pbishop = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || (diff(x1, x2) < 2 && diff(y1, y2) < 2);
};
const sking = (x1, y1, x2, y2) => {
    return diff(x1, x2) < 2 && diff(y1, y2) < 2;
};
function xpawn(color) {
    return (x1, y1, x2, y2) => ((x2 === x1 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1)) ||
        (y2 === y1 && (x2 === x1 + 1 || x2 === x1 - 1) && (color === 'white' ? y1 > 5 : y1 < 6)));
}
const xbishop = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 2;
};
const advisor = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 1;
};
const xking = (x1, y1, x2, y2) => {
    return (x1 === x2 || y1 === y2) && diff(x1, x2) === 1;
};
function rookFilesOf(pieces, color, firstRankIs0) {
    return Object.keys(pieces).filter(key => {
        const piece = pieces[key];
        return piece && piece.color === color && piece.role === 'rook';
    }).map((key) => util.key2pos(key, firstRankIs0)[0]);
}
function premove(pieces, key, canCastle, geom) {
    const firstRankIs0 = cg.dimensions[geom].height === 10;
    const piece = pieces[key], pos = util.key2pos(key, firstRankIs0);
    let mobility;
    switch (geom) {
        case 3:
            switch (piece.role) {
                case 'pawn':
                    mobility = xpawn(piece.color);
                    break;
                case 'cannon':
                case 'rook':
                    mobility = rook;
                    break;
                case 'knight':
                    mobility = knight;
                    break;
                case 'bishop':
                    mobility = xbishop;
                    break;
                case 'advisor':
                    mobility = advisor;
                    break;
                case 'king':
                    mobility = xking;
                    break;
            }
            ;
            break;
        case 1:
            switch (piece.role) {
                case 'pawn':
                    mobility = spawn(piece.color);
                    break;
                case 'knight':
                    mobility = sknight(piece.color);
                    break;
                case 'bishop':
                    mobility = bishop;
                    break;
                case 'rook':
                    mobility = rook;
                    break;
                case 'king':
                    mobility = sking;
                    break;
                case 'silver':
                    mobility = silver(piece.color);
                    break;
                case 'ppawn':
                case 'plance':
                case 'pknight':
                case 'psilver':
                case 'gold':
                    mobility = gold(piece.color);
                    break;
                case 'lance':
                    mobility = lance(piece.color);
                    break;
                case 'prook':
                    mobility = prook;
                    break;
                case 'pbishop':
                    mobility = pbishop;
                    break;
            }
            ;
            break;
        default:
            switch (piece.role) {
                case 'pawn':
                    mobility = pawn(piece.color);
                    break;
                case 'knight':
                    mobility = knight;
                    break;
                case 'bishop':
                    mobility = bishop;
                    break;
                case 'rook':
                    mobility = rook;
                    break;
                case 'queen':
                    mobility = queen;
                    break;
                case 'king':
                    mobility = king(piece.color, rookFilesOf(pieces, piece.color, firstRankIs0), canCastle);
                    break;
                case 'hawk':
                case 'archbishop':
                    mobility = archbishop;
                    break;
                case 'elephant':
                case 'cancellor':
                    mobility = cancellor;
                    break;
                case 'met':
                case 'ferz':
                    mobility = met;
                    break;
                case 'silver':
                    mobility = silver(piece.color);
                    break;
            }
            ;
            break;
    }
    ;
    const allkeys = util.allKeys[geom];
    const pos2keyGeom = (geom) => ((pos) => util.pos2key(pos, geom));
    const pos2key = pos2keyGeom(geom);
    const key2posRank0 = (firstrank0) => ((key) => util.key2pos(key, firstrank0));
    const key2pos = key2posRank0(firstRankIs0);
    return allkeys.map(key2pos).filter(pos2 => {
        return (pos[0] !== pos2[0] || pos[1] !== pos2[1]) && mobility(pos[0], pos[1], pos2[0], pos2[1]);
    }).map(pos2key);
}
exports.default = premove;
;

},{"./types":16,"./util":17}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const util = require("./util");
function render(s) {
    const firstRankIs0 = s.dimensions.height === 10;
    const asWhite = s.orientation === 'white', posToTranslate = s.dom.relative ? util.posToTranslateRel : util.posToTranslateAbs(s.dom.bounds(), s.dimensions), translate = s.dom.relative ? util.translateRel : util.translateAbs, boardEl = s.dom.elements.board, pieces = s.pieces, curAnim = s.animation.current, anims = curAnim ? curAnim.plan.anims : {}, fadings = curAnim ? curAnim.plan.fadings : {}, curDrag = s.draggable.current, squares = computeSquareClasses(s), samePieces = {}, sameSquares = {}, movedPieces = {}, movedSquares = {}, piecesKeys = Object.keys(pieces);
    let k, p, el, pieceAtKey, elPieceName, anim, fading, pMvdset, pMvd, sMvdset, sMvd;
    el = boardEl.firstChild;
    while (el) {
        k = el.cgKey;
        if (isPieceNode(el)) {
            pieceAtKey = pieces[k];
            anim = anims[k];
            fading = fadings[k];
            elPieceName = el.cgPiece;
            if (el.cgDragging && (!curDrag || curDrag.orig !== k)) {
                el.classList.remove('dragging');
                translate(el, posToTranslate(util_1.key2pos(k, firstRankIs0), asWhite, s.dimensions));
                el.cgDragging = false;
            }
            if (!fading && el.cgFading) {
                el.cgFading = false;
                el.classList.remove('fading');
            }
            if (pieceAtKey) {
                if (anim && el.cgAnimating && elPieceName === pieceNameOf(pieceAtKey)) {
                    const pos = util_1.key2pos(k, firstRankIs0);
                    pos[0] += anim[2];
                    pos[1] += anim[3];
                    el.classList.add('anim');
                    translate(el, posToTranslate(pos, asWhite, s.dimensions));
                }
                else if (el.cgAnimating) {
                    el.cgAnimating = false;
                    el.classList.remove('anim');
                    translate(el, posToTranslate(util_1.key2pos(k, firstRankIs0), asWhite, s.dimensions));
                    if (s.addPieceZIndex)
                        el.style.zIndex = posZIndex(util_1.key2pos(k, firstRankIs0), asWhite);
                }
                if (elPieceName === pieceNameOf(pieceAtKey) && (!fading || !el.cgFading)) {
                    samePieces[k] = true;
                }
                else {
                    if (fading && elPieceName === pieceNameOf(fading)) {
                        el.classList.add('fading');
                        el.cgFading = true;
                    }
                    else {
                        if (movedPieces[elPieceName])
                            movedPieces[elPieceName].push(el);
                        else
                            movedPieces[elPieceName] = [el];
                    }
                }
            }
            else {
                if (movedPieces[elPieceName])
                    movedPieces[elPieceName].push(el);
                else
                    movedPieces[elPieceName] = [el];
            }
        }
        else if (isSquareNode(el)) {
            const cn = el.className;
            if (squares[k] === cn)
                sameSquares[k] = true;
            else if (movedSquares[cn])
                movedSquares[cn].push(el);
            else
                movedSquares[cn] = [el];
        }
        el = el.nextSibling;
    }
    for (const sk in squares) {
        if (!sameSquares[sk]) {
            sMvdset = movedSquares[squares[sk]];
            sMvd = sMvdset && sMvdset.pop();
            const translation = posToTranslate(util_1.key2pos(sk, firstRankIs0), asWhite, s.dimensions);
            if (sMvd) {
                sMvd.cgKey = sk;
                translate(sMvd, translation);
            }
            else {
                const squareNode = util_1.createEl('square', squares[sk]);
                squareNode.cgKey = sk;
                translate(squareNode, translation);
                boardEl.insertBefore(squareNode, boardEl.firstChild);
            }
        }
    }
    for (const j in piecesKeys) {
        k = piecesKeys[j];
        p = pieces[k];
        anim = anims[k];
        if (!samePieces[k]) {
            pMvdset = movedPieces[pieceNameOf(p)];
            pMvd = pMvdset && pMvdset.pop();
            if (pMvd) {
                pMvd.cgKey = k;
                if (pMvd.cgFading) {
                    pMvd.classList.remove('fading');
                    pMvd.cgFading = false;
                }
                const pos = util_1.key2pos(k, firstRankIs0);
                if (s.addPieceZIndex)
                    pMvd.style.zIndex = posZIndex(pos, asWhite);
                if (anim) {
                    pMvd.cgAnimating = true;
                    pMvd.classList.add('anim');
                    pos[0] += anim[2];
                    pos[1] += anim[3];
                }
                translate(pMvd, posToTranslate(pos, asWhite, s.dimensions));
            }
            else {
                const pieceName = pieceNameOf(p), pieceNode = util_1.createEl('piece', pieceName), pos = util_1.key2pos(k, firstRankIs0);
                pieceNode.cgPiece = pieceName;
                pieceNode.cgKey = k;
                if (anim) {
                    pieceNode.cgAnimating = true;
                    pos[0] += anim[2];
                    pos[1] += anim[3];
                }
                translate(pieceNode, posToTranslate(pos, asWhite, s.dimensions));
                if (s.addPieceZIndex)
                    pieceNode.style.zIndex = posZIndex(pos, asWhite);
                boardEl.appendChild(pieceNode);
            }
        }
    }
    for (const i in movedPieces)
        removeNodes(s, movedPieces[i]);
    for (const i in movedSquares)
        removeNodes(s, movedSquares[i]);
}
exports.default = render;
function isPieceNode(el) {
    return el.tagName === 'PIECE';
}
function isSquareNode(el) {
    return el.tagName === 'SQUARE';
}
function removeNodes(s, nodes) {
    for (const i in nodes)
        s.dom.elements.board.removeChild(nodes[i]);
}
function posZIndex(pos, asWhite) {
    let z = 2 + (pos[1] - 1) * 8 + (8 - pos[0]);
    if (asWhite)
        z = 67 - z;
    return z + '';
}
function pieceNameOf(piece) {
    return `${piece.color} ${piece.role}`;
}
function computeSquareClasses(s) {
    const squares = {};
    let i, k;
    if (s.lastMove && s.highlight.lastMove)
        for (i in s.lastMove) {
            if (s.lastMove[i] != 'a0') {
                addSquare(squares, s.lastMove[i], 'last-move');
            }
        }
    if (s.check && s.highlight.check)
        addSquare(squares, s.check, 'check');
    if (s.selected) {
        if (s.selected != 'a0') {
            addSquare(squares, s.selected, 'selected');
        }
        if (s.movable.showDests) {
            const dests = s.movable.dests && s.movable.dests[s.selected];
            if (dests)
                for (i in dests) {
                    k = dests[i];
                    addSquare(squares, k, 'move-dest' + (s.pieces[k] ? ' oc' : ''));
                }
            const pDests = s.premovable.dests;
            if (pDests)
                for (i in pDests) {
                    k = pDests[i];
                    addSquare(squares, k, 'premove-dest' + (s.pieces[k] ? ' oc' : ''));
                }
        }
    }
    const premove = s.premovable.current;
    if (premove)
        for (i in premove)
            addSquare(squares, premove[i], 'current-premove');
    else if (s.predroppable.current)
        addSquare(squares, s.predroppable.current.key, 'current-premove');
    const o = s.exploding;
    if (o)
        for (i in o.keys)
            addSquare(squares, o.keys[i], 'exploding' + o.stage);
    return squares;
}
function addSquare(squares, key, klass) {
    if (squares[key])
        squares[key] += ' ' + klass;
    else
        squares[key] = klass;
}

},{"./util":17}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fen = require("./fen");
const util_1 = require("./util");
function defaults() {
    return {
        pieces: fen.read(fen.initial),
        orientation: 'white',
        turnColor: 'white',
        coordinates: true,
        autoCastle: true,
        viewOnly: false,
        disableContextMenu: false,
        resizable: true,
        addPieceZIndex: false,
        pieceKey: false,
        highlight: {
            lastMove: true,
            check: true
        },
        animation: {
            enabled: true,
            duration: 200
        },
        movable: {
            free: true,
            color: 'both',
            showDests: true,
            events: {},
            rookCastle: true
        },
        premovable: {
            enabled: true,
            showDests: true,
            castle: true,
            events: {}
        },
        predroppable: {
            enabled: false,
            events: {}
        },
        draggable: {
            enabled: true,
            distance: 3,
            autoDistance: true,
            centerPiece: true,
            showGhost: true,
            deleteOnDropOff: false
        },
        dropmode: {
            active: false
        },
        selectable: {
            enabled: true
        },
        stats: {
            dragged: !('ontouchstart' in window)
        },
        events: {},
        drawable: {
            enabled: true,
            visible: true,
            eraseOnClick: true,
            shapes: [],
            autoShapes: [],
            brushes: {
                green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
                red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
                blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
                yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
                paleBlue: { key: 'pb', color: '#003088', opacity: 0.4, lineWidth: 15 },
                paleGreen: { key: 'pg', color: '#15781B', opacity: 0.4, lineWidth: 15 },
                paleRed: { key: 'pr', color: '#882020', opacity: 0.4, lineWidth: 15 },
                paleGrey: { key: 'pgr', color: '#4a4a4a', opacity: 0.35, lineWidth: 15 }
            },
            pieces: {
                baseUrl: 'https://lichess1.org/assets/piece/cburnett/'
            },
            prevSvgHash: ''
        },
        hold: util_1.timer(),
        dimensions: { width: 8, height: 8 },
        geometry: 0,
    };
}
exports.defaults = defaults;

},{"./fen":11,"./util":17}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
function createElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
exports.createElement = createElement;
function renderSvg(state, root) {
    const d = state.drawable, curD = d.current, cur = curD && curD.mouseSq ? curD : undefined, arrowDests = {};
    d.shapes.concat(d.autoShapes).concat(cur ? [cur] : []).forEach(s => {
        if (s.dest)
            arrowDests[s.dest] = (arrowDests[s.dest] || 0) + 1;
    });
    const shapes = d.shapes.concat(d.autoShapes).map((s) => {
        return {
            shape: s,
            current: false,
            hash: shapeHash(s, arrowDests, false)
        };
    });
    if (cur)
        shapes.push({
            shape: cur,
            current: true,
            hash: shapeHash(cur, arrowDests, true)
        });
    const fullHash = shapes.map(sc => sc.hash).join('');
    if (fullHash === state.drawable.prevSvgHash)
        return;
    state.drawable.prevSvgHash = fullHash;
    const defsEl = root.firstChild;
    syncDefs(d, shapes, defsEl);
    syncShapes(state, shapes, d.brushes, arrowDests, root, defsEl);
}
exports.renderSvg = renderSvg;
function syncDefs(d, shapes, defsEl) {
    const brushes = {};
    let brush;
    shapes.forEach(s => {
        if (s.shape.dest) {
            brush = d.brushes[s.shape.brush];
            if (s.shape.modifiers)
                brush = makeCustomBrush(brush, s.shape.modifiers);
            brushes[brush.key] = brush;
        }
    });
    const keysInDom = {};
    let el = defsEl.firstChild;
    while (el) {
        keysInDom[el.getAttribute('cgKey')] = true;
        el = el.nextSibling;
    }
    for (let key in brushes) {
        if (!keysInDom[key])
            defsEl.appendChild(renderMarker(brushes[key]));
    }
}
function syncShapes(state, shapes, brushes, arrowDests, root, defsEl) {
    const bounds = state.dom.bounds(), hashesInDom = {}, toRemove = [];
    shapes.forEach(sc => { hashesInDom[sc.hash] = false; });
    let el = defsEl.nextSibling, elHash;
    while (el) {
        elHash = el.getAttribute('cgHash');
        if (hashesInDom.hasOwnProperty(elHash))
            hashesInDom[elHash] = true;
        else
            toRemove.push(el);
        el = el.nextSibling;
    }
    toRemove.forEach(el => root.removeChild(el));
    shapes.forEach(sc => {
        if (!hashesInDom[sc.hash])
            root.appendChild(renderShape(state, sc, brushes, arrowDests, bounds));
    });
}
function shapeHash({ orig, dest, brush, piece, modifiers }, arrowDests, current) {
    return [current, orig, dest, brush, dest && arrowDests[dest] > 1,
        piece && pieceHash(piece),
        modifiers && modifiersHash(modifiers)
    ].filter(x => x).join('');
}
function pieceHash(piece) {
    return [piece.color, piece.role, piece.scale].filter(x => x).join('');
}
function modifiersHash(m) {
    return '' + (m.lineWidth || '');
}
function renderShape(state, { shape, current, hash }, brushes, arrowDests, bounds) {
    const firstRankIs0 = state.dimensions.height === 10;
    let el;
    if (shape.piece)
        el = renderPiece(state.drawable.pieces.baseUrl, orient(util_1.key2pos(shape.orig, firstRankIs0), state.orientation, state.dimensions), shape.piece, bounds, state.dimensions);
    else {
        const orig = orient(util_1.key2pos(shape.orig, firstRankIs0), state.orientation, state.dimensions);
        if (shape.orig && shape.dest) {
            let brush = brushes[shape.brush];
            if (shape.modifiers)
                brush = makeCustomBrush(brush, shape.modifiers);
            el = renderArrow(brush, orig, orient(util_1.key2pos(shape.dest, firstRankIs0), state.orientation, state.dimensions), current, arrowDests[shape.dest] > 1, bounds, state.dimensions);
        }
        else
            el = renderCircle(brushes[shape.brush], orig, current, bounds, state.dimensions);
    }
    el.setAttribute('cgHash', hash);
    return el;
}
function renderCircle(brush, pos, current, bounds, bd) {
    const o = pos2px(pos, bounds, bd), widths = circleWidth(bounds, bd), radius = (bounds.width / bd.width) / 2;
    return setAttributes(createElement('circle'), {
        stroke: brush.color,
        'stroke-width': widths[current ? 0 : 1],
        fill: 'none',
        opacity: opacity(brush, current),
        cx: o[0],
        cy: o[1],
        r: radius - widths[1] / 2
    });
}
function renderArrow(brush, orig, dest, current, shorten, bounds, bd) {
    const m = arrowMargin(bounds, shorten && !current, bd), a = pos2px(orig, bounds, bd), b = pos2px(dest, bounds, bd), dx = b[0] - a[0], dy = b[1] - a[1], angle = Math.atan2(dy, dx), xo = Math.cos(angle) * m, yo = Math.sin(angle) * m;
    return setAttributes(createElement('line'), {
        stroke: brush.color,
        'stroke-width': lineWidth(brush, current, bounds, bd),
        'stroke-linecap': 'round',
        'marker-end': 'url(#arrowhead-' + brush.key + ')',
        opacity: opacity(brush, current),
        x1: a[0],
        y1: a[1],
        x2: b[0] - xo,
        y2: b[1] - yo
    });
}
function renderPiece(baseUrl, pos, piece, bounds, bd) {
    const o = pos2px(pos, bounds, bd), width = bounds.width / bd.width * (piece.scale || 1), height = bounds.width / bd.height * (piece.scale || 1), name = piece.color[0] + (piece.role === 'knight' ? 'n' : piece.role[0]).toUpperCase();
    return setAttributes(createElement('image'), {
        className: `${piece.role} ${piece.color}`,
        x: o[0] - width / 2,
        y: o[1] - height / 2,
        width: width,
        height: height,
        href: baseUrl + name + '.svg'
    });
}
function renderMarker(brush) {
    const marker = setAttributes(createElement('marker'), {
        id: 'arrowhead-' + brush.key,
        orient: 'auto',
        markerWidth: 4,
        markerHeight: 8,
        refX: 2.05,
        refY: 2.01
    });
    marker.appendChild(setAttributes(createElement('path'), {
        d: 'M0,0 V4 L3,2 Z',
        fill: brush.color
    }));
    marker.setAttribute('cgKey', brush.key);
    return marker;
}
function setAttributes(el, attrs) {
    for (let key in attrs)
        el.setAttribute(key, attrs[key]);
    return el;
}
function orient(pos, color, bd) {
    return color === 'white' ? pos : [bd.width + 1 - pos[0], bd.height + 1 - pos[1]];
}
function makeCustomBrush(base, modifiers) {
    const brush = {
        color: base.color,
        opacity: Math.round(base.opacity * 10) / 10,
        lineWidth: Math.round(modifiers.lineWidth || base.lineWidth)
    };
    brush.key = [base.key, modifiers.lineWidth].filter(x => x).join('');
    return brush;
}
function circleWidth(bounds, bd) {
    const base = bounds.width / (bd.width * 64);
    return [3 * base, 4 * base];
}
function lineWidth(brush, current, bounds, bd) {
    return (brush.lineWidth || 10) * (current ? 0.85 : 1) / (bd.width * 64) * bounds.width;
}
function opacity(brush, current) {
    return (brush.opacity || 1) * (current ? 0.9 : 1);
}
function arrowMargin(bounds, shorten, bd) {
    return (shorten ? 20 : 10) / (bd.width * 64) * bounds.width;
}
function pos2px(pos, bounds, bd) {
    return [(pos[0] - 0.5) * bounds.width / bd.width, (bd.height + 0.5 - pos[1]) * bounds.height / bd.height];
}

},{"./util":17}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
exports.ranks = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
;
exports.dimensions = [{ width: 8, height: 8 }, { width: 9, height: 9 }, { width: 10, height: 8 }, { width: 9, height: 10 }];

},{}],17:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cg = require("./types");
exports.colors = ['white', 'black'];
exports.NRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
exports.invNRanks = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const files8 = cg.files.slice(0, 8);
const files9 = cg.files.slice(0, 9);
const files10 = cg.files.slice(0, 10);
const ranks8 = cg.ranks.slice(1, 9);
const ranks9 = cg.ranks.slice(1, 10);
const ranks10 = cg.ranks.slice(0, 10);
const allKeys8x8 = Array.prototype.concat(...files8.map(c => ranks8.map(r => c + r)));
const allKeys9x9 = Array.prototype.concat(...files9.map(c => ranks9.map(r => c + r)));
const allKeys10x8 = Array.prototype.concat(...files10.map(c => ranks8.map(r => c + r)));
const allKeys9x10 = Array.prototype.concat(...files9.map(c => ranks10.map(r => c + r)));
exports.allKeys = [allKeys8x8, allKeys9x9, allKeys10x8, allKeys9x10];
function pos2key(pos, geom) {
    const bd = cg.dimensions[geom];
    return exports.allKeys[geom][bd.height * pos[0] + pos[1] - bd.height - 1];
}
exports.pos2key = pos2key;
function key2pos(k, firstRankIs0) {
    const shift = firstRankIs0 ? 1 : 0;
    return [k.charCodeAt(0) - 96, k.charCodeAt(1) - 48 + shift];
}
exports.key2pos = key2pos;
function memo(f) {
    let v;
    const ret = () => {
        if (v === undefined)
            v = f();
        return v;
    };
    ret.clear = () => { v = undefined; };
    return ret;
}
exports.memo = memo;
exports.timer = () => {
    let startAt;
    return {
        start() { startAt = Date.now(); },
        cancel() { startAt = undefined; },
        stop() {
            if (!startAt)
                return 0;
            const time = Date.now() - startAt;
            startAt = undefined;
            return time;
        }
    };
};
exports.opposite = (c) => c === 'white' ? 'black' : 'white';
function containsX(xs, x) {
    return xs !== undefined && xs.indexOf(x) !== -1;
}
exports.containsX = containsX;
exports.distanceSq = (pos1, pos2) => {
    return Math.pow(pos1[0] - pos2[0], 2) + Math.pow(pos1[1] - pos2[1], 2);
};
exports.samePiece = (p1, p2) => p1.role === p2.role && p1.color === p2.color;
const posToTranslateBase = (pos, asWhite, xFactor, yFactor, bt) => [
    (asWhite ? pos[0] - 1 : bt.width - pos[0]) * xFactor,
    (asWhite ? bt.height - pos[1] : pos[1] - 1) * yFactor
];
exports.posToTranslateAbs = (bounds, bt) => {
    const xFactor = bounds.width / bt.width, yFactor = bounds.height / bt.height;
    return (pos, asWhite) => posToTranslateBase(pos, asWhite, xFactor, yFactor, bt);
};
exports.posToTranslateRel = (pos, asWhite, bt) => posToTranslateBase(pos, asWhite, 100 / bt.width, 100 / bt.height, bt);
exports.translateAbs = (el, pos) => {
    el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};
exports.translateRel = (el, percents) => {
    el.style.left = percents[0] + '%';
    el.style.top = percents[1] + '%';
};
exports.setVisible = (el, v) => {
    el.style.visibility = v ? 'visible' : 'hidden';
};
exports.eventPosition = e => {
    if (e.clientX || e.clientX === 0)
        return [e.clientX, e.clientY];
    if (e.touches && e.targetTouches[0])
        return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return undefined;
};
exports.isRightButton = (e) => e.buttons === 2 || e.button === 2;
exports.createEl = (tagName, className) => {
    const el = document.createElement(tagName);
    if (className)
        el.className = className;
    return el;
};

},{"./types":16}],18:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const types_1 = require("./types");
const svg_1 = require("./svg");
function wrap(element, s, relative) {
    element.innerHTML = '';
    element.classList.add('cg-wrap');
    util_1.colors.forEach(c => {
        element.classList.toggle('orientation-' + c, s.orientation === c);
    });
    element.classList.toggle('manipulable', !s.viewOnly);
    const helper = util_1.createEl('cg-helper');
    element.appendChild(helper);
    const container = util_1.createEl('cg-container');
    helper.appendChild(container);
    const extension = util_1.createEl('extension');
    container.appendChild(extension);
    const board = util_1.createEl('cg-board');
    container.appendChild(board);
    let svg;
    if (s.drawable.visible && !relative) {
        svg = svg_1.createElement('svg');
        svg.appendChild(svg_1.createElement('defs'));
        container.appendChild(svg);
    }
    if (s.coordinates) {
        const orientClass = s.orientation === 'black' ? ' black' : '';
        const firstRankIs0 = s.dimensions.height === 10;
        const shift = firstRankIs0 ? 0 : 1;
        container.appendChild(renderCoords(types_1.ranks.slice(shift, s.dimensions.height + shift), 'ranks' + orientClass));
        container.appendChild(renderCoords(types_1.files.slice(0, s.dimensions.width), 'files' + orientClass));
    }
    let ghost;
    if (s.draggable.showGhost && !relative) {
        ghost = util_1.createEl('piece', 'ghost');
        util_1.setVisible(ghost, false);
        container.appendChild(ghost);
    }
    return {
        board,
        container,
        ghost,
        svg
    };
}
exports.default = wrap;
function renderCoords(elems, className) {
    const el = util_1.createEl('coords', className);
    let f;
    for (let i in elems) {
        f = util_1.createEl('coord');
        f.textContent = elems[i];
        el.appendChild(f);
    }
    return el;
}

},{"./svg":15,"./types":16,"./util":17}],19:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vnode_1 = require("./vnode");
var is = require("./is");
function addNS(data, children, sel) {
    data.ns = 'http://www.w3.org/2000/svg';
    if (sel !== 'foreignObject' && children !== undefined) {
        for (var i = 0; i < children.length; ++i) {
            var childData = children[i].data;
            if (childData !== undefined) {
                addNS(childData, children[i].children, children[i].sel);
            }
        }
    }
}
function h(sel, b, c) {
    var data = {}, children, text, i;
    if (c !== undefined) {
        data = b;
        if (is.array(c)) {
            children = c;
        }
        else if (is.primitive(c)) {
            text = c;
        }
        else if (c && c.sel) {
            children = [c];
        }
    }
    else if (b !== undefined) {
        if (is.array(b)) {
            children = b;
        }
        else if (is.primitive(b)) {
            text = b;
        }
        else if (b && b.sel) {
            children = [b];
        }
        else {
            data = b;
        }
    }
    if (children !== undefined) {
        for (i = 0; i < children.length; ++i) {
            if (is.primitive(children[i]))
                children[i] = vnode_1.vnode(undefined, undefined, undefined, children[i], undefined);
        }
    }
    if (sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
        (sel.length === 3 || sel[3] === '.' || sel[3] === '#')) {
        addNS(data, children, sel);
    }
    return vnode_1.vnode(sel, data, children, text, undefined);
}
exports.h = h;
;
exports.default = h;

},{"./is":21,"./vnode":29}],20:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function createElement(tagName) {
    return document.createElement(tagName);
}
function createElementNS(namespaceURI, qualifiedName) {
    return document.createElementNS(namespaceURI, qualifiedName);
}
function createTextNode(text) {
    return document.createTextNode(text);
}
function createComment(text) {
    return document.createComment(text);
}
function insertBefore(parentNode, newNode, referenceNode) {
    parentNode.insertBefore(newNode, referenceNode);
}
function removeChild(node, child) {
    node.removeChild(child);
}
function appendChild(node, child) {
    node.appendChild(child);
}
function parentNode(node) {
    return node.parentNode;
}
function nextSibling(node) {
    return node.nextSibling;
}
function tagName(elm) {
    return elm.tagName;
}
function setTextContent(node, text) {
    node.textContent = text;
}
function getTextContent(node) {
    return node.textContent;
}
function isElement(node) {
    return node.nodeType === 1;
}
function isText(node) {
    return node.nodeType === 3;
}
function isComment(node) {
    return node.nodeType === 8;
}
exports.htmlDomApi = {
    createElement: createElement,
    createElementNS: createElementNS,
    createTextNode: createTextNode,
    createComment: createComment,
    insertBefore: insertBefore,
    removeChild: removeChild,
    appendChild: appendChild,
    parentNode: parentNode,
    nextSibling: nextSibling,
    tagName: tagName,
    setTextContent: setTextContent,
    getTextContent: getTextContent,
    isElement: isElement,
    isText: isText,
    isComment: isComment,
};
exports.default = exports.htmlDomApi;

},{}],21:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.array = Array.isArray;
function primitive(s) {
    return typeof s === 'string' || typeof s === 'number';
}
exports.primitive = primitive;

},{}],22:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var xlinkNS = 'http://www.w3.org/1999/xlink';
var xmlNS = 'http://www.w3.org/XML/1998/namespace';
var colonChar = 58;
var xChar = 120;
function updateAttrs(oldVnode, vnode) {
    var key, elm = vnode.elm, oldAttrs = oldVnode.data.attrs, attrs = vnode.data.attrs;
    if (!oldAttrs && !attrs)
        return;
    if (oldAttrs === attrs)
        return;
    oldAttrs = oldAttrs || {};
    attrs = attrs || {};
    // update modified attributes, add new attributes
    for (key in attrs) {
        var cur = attrs[key];
        var old = oldAttrs[key];
        if (old !== cur) {
            if (cur === true) {
                elm.setAttribute(key, "");
            }
            else if (cur === false) {
                elm.removeAttribute(key);
            }
            else {
                if (key.charCodeAt(0) !== xChar) {
                    elm.setAttribute(key, cur);
                }
                else if (key.charCodeAt(3) === colonChar) {
                    // Assume xml namespace
                    elm.setAttributeNS(xmlNS, key, cur);
                }
                else if (key.charCodeAt(5) === colonChar) {
                    // Assume xlink namespace
                    elm.setAttributeNS(xlinkNS, key, cur);
                }
                else {
                    elm.setAttribute(key, cur);
                }
            }
        }
    }
    // remove removed attributes
    // use `in` operator since the previous `for` iteration uses it (.i.e. add even attributes with undefined value)
    // the other option is to remove all attributes with value == undefined
    for (key in oldAttrs) {
        if (!(key in attrs)) {
            elm.removeAttribute(key);
        }
    }
}
exports.attributesModule = { create: updateAttrs, update: updateAttrs };
exports.default = exports.attributesModule;

},{}],23:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function updateClass(oldVnode, vnode) {
    var cur, name, elm = vnode.elm, oldClass = oldVnode.data.class, klass = vnode.data.class;
    if (!oldClass && !klass)
        return;
    if (oldClass === klass)
        return;
    oldClass = oldClass || {};
    klass = klass || {};
    for (name in oldClass) {
        if (!klass[name]) {
            elm.classList.remove(name);
        }
    }
    for (name in klass) {
        cur = klass[name];
        if (cur !== oldClass[name]) {
            elm.classList[cur ? 'add' : 'remove'](name);
        }
    }
}
exports.classModule = { create: updateClass, update: updateClass };
exports.default = exports.classModule;

},{}],24:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function invokeHandler(handler, vnode, event) {
    if (typeof handler === "function") {
        // call function handler
        handler.call(vnode, event, vnode);
    }
    else if (typeof handler === "object") {
        // call handler with arguments
        if (typeof handler[0] === "function") {
            // special case for single argument for performance
            if (handler.length === 2) {
                handler[0].call(vnode, handler[1], event, vnode);
            }
            else {
                var args = handler.slice(1);
                args.push(event);
                args.push(vnode);
                handler[0].apply(vnode, args);
            }
        }
        else {
            // call multiple handlers
            for (var i = 0; i < handler.length; i++) {
                invokeHandler(handler[i], vnode, event);
            }
        }
    }
}
function handleEvent(event, vnode) {
    var name = event.type, on = vnode.data.on;
    // call event handler(s) if exists
    if (on && on[name]) {
        invokeHandler(on[name], vnode, event);
    }
}
function createListener() {
    return function handler(event) {
        handleEvent(event, handler.vnode);
    };
}
function updateEventListeners(oldVnode, vnode) {
    var oldOn = oldVnode.data.on, oldListener = oldVnode.listener, oldElm = oldVnode.elm, on = vnode && vnode.data.on, elm = (vnode && vnode.elm), name;
    // optimization for reused immutable handlers
    if (oldOn === on) {
        return;
    }
    // remove existing listeners which no longer used
    if (oldOn && oldListener) {
        // if element changed or deleted we remove all existing listeners unconditionally
        if (!on) {
            for (name in oldOn) {
                // remove listener if element was changed or existing listeners removed
                oldElm.removeEventListener(name, oldListener, false);
            }
        }
        else {
            for (name in oldOn) {
                // remove listener if existing listener removed
                if (!on[name]) {
                    oldElm.removeEventListener(name, oldListener, false);
                }
            }
        }
    }
    // add new listeners which has not already attached
    if (on) {
        // reuse existing listener or create new
        var listener = vnode.listener = oldVnode.listener || createListener();
        // update vnode for listener
        listener.vnode = vnode;
        // if element changed or added we add all needed listeners unconditionally
        if (!oldOn) {
            for (name in on) {
                // add listener if element was changed or new listeners added
                elm.addEventListener(name, listener, false);
            }
        }
        else {
            for (name in on) {
                // add listener if new listener added
                if (!oldOn[name]) {
                    elm.addEventListener(name, listener, false);
                }
            }
        }
    }
}
exports.eventListenersModule = {
    create: updateEventListeners,
    update: updateEventListeners,
    destroy: updateEventListeners
};
exports.default = exports.eventListenersModule;

},{}],25:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function updateProps(oldVnode, vnode) {
    var key, cur, old, elm = vnode.elm, oldProps = oldVnode.data.props, props = vnode.data.props;
    if (!oldProps && !props)
        return;
    if (oldProps === props)
        return;
    oldProps = oldProps || {};
    props = props || {};
    for (key in oldProps) {
        if (!props[key]) {
            delete elm[key];
        }
    }
    for (key in props) {
        cur = props[key];
        old = oldProps[key];
        if (old !== cur && (key !== 'value' || elm[key] !== cur)) {
            elm[key] = cur;
        }
    }
}
exports.propsModule = { create: updateProps, update: updateProps };
exports.default = exports.propsModule;

},{}],26:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vnode_1 = require("./vnode");
var is = require("./is");
var htmldomapi_1 = require("./htmldomapi");
function isUndef(s) { return s === undefined; }
function isDef(s) { return s !== undefined; }
var emptyNode = vnode_1.default('', {}, [], undefined, undefined);
function sameVnode(vnode1, vnode2) {
    return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}
function isVnode(vnode) {
    return vnode.sel !== undefined;
}
function createKeyToOldIdx(children, beginIdx, endIdx) {
    var i, map = {}, key, ch;
    for (i = beginIdx; i <= endIdx; ++i) {
        ch = children[i];
        if (ch != null) {
            key = ch.key;
            if (key !== undefined)
                map[key] = i;
        }
    }
    return map;
}
var hooks = ['create', 'update', 'remove', 'destroy', 'pre', 'post'];
var h_1 = require("./h");
exports.h = h_1.h;
var thunk_1 = require("./thunk");
exports.thunk = thunk_1.thunk;
function init(modules, domApi) {
    var i, j, cbs = {};
    var api = domApi !== undefined ? domApi : htmldomapi_1.default;
    for (i = 0; i < hooks.length; ++i) {
        cbs[hooks[i]] = [];
        for (j = 0; j < modules.length; ++j) {
            var hook = modules[j][hooks[i]];
            if (hook !== undefined) {
                cbs[hooks[i]].push(hook);
            }
        }
    }
    function emptyNodeAt(elm) {
        var id = elm.id ? '#' + elm.id : '';
        var c = elm.className ? '.' + elm.className.split(' ').join('.') : '';
        return vnode_1.default(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm);
    }
    function createRmCb(childElm, listeners) {
        return function rmCb() {
            if (--listeners === 0) {
                var parent_1 = api.parentNode(childElm);
                api.removeChild(parent_1, childElm);
            }
        };
    }
    function createElm(vnode, insertedVnodeQueue) {
        var i, data = vnode.data;
        if (data !== undefined) {
            if (isDef(i = data.hook) && isDef(i = i.init)) {
                i(vnode);
                data = vnode.data;
            }
        }
        var children = vnode.children, sel = vnode.sel;
        if (sel === '!') {
            if (isUndef(vnode.text)) {
                vnode.text = '';
            }
            vnode.elm = api.createComment(vnode.text);
        }
        else if (sel !== undefined) {
            // Parse selector
            var hashIdx = sel.indexOf('#');
            var dotIdx = sel.indexOf('.', hashIdx);
            var hash = hashIdx > 0 ? hashIdx : sel.length;
            var dot = dotIdx > 0 ? dotIdx : sel.length;
            var tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel;
            var elm = vnode.elm = isDef(data) && isDef(i = data.ns) ? api.createElementNS(i, tag)
                : api.createElement(tag);
            if (hash < dot)
                elm.setAttribute('id', sel.slice(hash + 1, dot));
            if (dotIdx > 0)
                elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '));
            for (i = 0; i < cbs.create.length; ++i)
                cbs.create[i](emptyNode, vnode);
            if (is.array(children)) {
                for (i = 0; i < children.length; ++i) {
                    var ch = children[i];
                    if (ch != null) {
                        api.appendChild(elm, createElm(ch, insertedVnodeQueue));
                    }
                }
            }
            else if (is.primitive(vnode.text)) {
                api.appendChild(elm, api.createTextNode(vnode.text));
            }
            i = vnode.data.hook; // Reuse variable
            if (isDef(i)) {
                if (i.create)
                    i.create(emptyNode, vnode);
                if (i.insert)
                    insertedVnodeQueue.push(vnode);
            }
        }
        else {
            vnode.elm = api.createTextNode(vnode.text);
        }
        return vnode.elm;
    }
    function addVnodes(parentElm, before, vnodes, startIdx, endIdx, insertedVnodeQueue) {
        for (; startIdx <= endIdx; ++startIdx) {
            var ch = vnodes[startIdx];
            if (ch != null) {
                api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
            }
        }
    }
    function invokeDestroyHook(vnode) {
        var i, j, data = vnode.data;
        if (data !== undefined) {
            if (isDef(i = data.hook) && isDef(i = i.destroy))
                i(vnode);
            for (i = 0; i < cbs.destroy.length; ++i)
                cbs.destroy[i](vnode);
            if (vnode.children !== undefined) {
                for (j = 0; j < vnode.children.length; ++j) {
                    i = vnode.children[j];
                    if (i != null && typeof i !== "string") {
                        invokeDestroyHook(i);
                    }
                }
            }
        }
    }
    function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
        for (; startIdx <= endIdx; ++startIdx) {
            var i_1 = void 0, listeners = void 0, rm = void 0, ch = vnodes[startIdx];
            if (ch != null) {
                if (isDef(ch.sel)) {
                    invokeDestroyHook(ch);
                    listeners = cbs.remove.length + 1;
                    rm = createRmCb(ch.elm, listeners);
                    for (i_1 = 0; i_1 < cbs.remove.length; ++i_1)
                        cbs.remove[i_1](ch, rm);
                    if (isDef(i_1 = ch.data) && isDef(i_1 = i_1.hook) && isDef(i_1 = i_1.remove)) {
                        i_1(ch, rm);
                    }
                    else {
                        rm();
                    }
                }
                else {
                    api.removeChild(parentElm, ch.elm);
                }
            }
        }
    }
    function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue) {
        var oldStartIdx = 0, newStartIdx = 0;
        var oldEndIdx = oldCh.length - 1;
        var oldStartVnode = oldCh[0];
        var oldEndVnode = oldCh[oldEndIdx];
        var newEndIdx = newCh.length - 1;
        var newStartVnode = newCh[0];
        var newEndVnode = newCh[newEndIdx];
        var oldKeyToIdx;
        var idxInOld;
        var elmToMove;
        var before;
        while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
            if (oldStartVnode == null) {
                oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
            }
            else if (oldEndVnode == null) {
                oldEndVnode = oldCh[--oldEndIdx];
            }
            else if (newStartVnode == null) {
                newStartVnode = newCh[++newStartIdx];
            }
            else if (newEndVnode == null) {
                newEndVnode = newCh[--newEndIdx];
            }
            else if (sameVnode(oldStartVnode, newStartVnode)) {
                patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
                oldStartVnode = oldCh[++oldStartIdx];
                newStartVnode = newCh[++newStartIdx];
            }
            else if (sameVnode(oldEndVnode, newEndVnode)) {
                patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
                oldEndVnode = oldCh[--oldEndIdx];
                newEndVnode = newCh[--newEndIdx];
            }
            else if (sameVnode(oldStartVnode, newEndVnode)) {
                patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
                api.insertBefore(parentElm, oldStartVnode.elm, api.nextSibling(oldEndVnode.elm));
                oldStartVnode = oldCh[++oldStartIdx];
                newEndVnode = newCh[--newEndIdx];
            }
            else if (sameVnode(oldEndVnode, newStartVnode)) {
                patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
                api.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);
                oldEndVnode = oldCh[--oldEndIdx];
                newStartVnode = newCh[++newStartIdx];
            }
            else {
                if (oldKeyToIdx === undefined) {
                    oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
                }
                idxInOld = oldKeyToIdx[newStartVnode.key];
                if (isUndef(idxInOld)) {
                    api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);
                    newStartVnode = newCh[++newStartIdx];
                }
                else {
                    elmToMove = oldCh[idxInOld];
                    if (elmToMove.sel !== newStartVnode.sel) {
                        api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);
                    }
                    else {
                        patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
                        oldCh[idxInOld] = undefined;
                        api.insertBefore(parentElm, elmToMove.elm, oldStartVnode.elm);
                    }
                    newStartVnode = newCh[++newStartIdx];
                }
            }
        }
        if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
            if (oldStartIdx > oldEndIdx) {
                before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
                addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
            }
            else {
                removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
            }
        }
    }
    function patchVnode(oldVnode, vnode, insertedVnodeQueue) {
        var i, hook;
        if (isDef(i = vnode.data) && isDef(hook = i.hook) && isDef(i = hook.prepatch)) {
            i(oldVnode, vnode);
        }
        var elm = vnode.elm = oldVnode.elm;
        var oldCh = oldVnode.children;
        var ch = vnode.children;
        if (oldVnode === vnode)
            return;
        if (vnode.data !== undefined) {
            for (i = 0; i < cbs.update.length; ++i)
                cbs.update[i](oldVnode, vnode);
            i = vnode.data.hook;
            if (isDef(i) && isDef(i = i.update))
                i(oldVnode, vnode);
        }
        if (isUndef(vnode.text)) {
            if (isDef(oldCh) && isDef(ch)) {
                if (oldCh !== ch)
                    updateChildren(elm, oldCh, ch, insertedVnodeQueue);
            }
            else if (isDef(ch)) {
                if (isDef(oldVnode.text))
                    api.setTextContent(elm, '');
                addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
            }
            else if (isDef(oldCh)) {
                removeVnodes(elm, oldCh, 0, oldCh.length - 1);
            }
            else if (isDef(oldVnode.text)) {
                api.setTextContent(elm, '');
            }
        }
        else if (oldVnode.text !== vnode.text) {
            if (isDef(oldCh)) {
                removeVnodes(elm, oldCh, 0, oldCh.length - 1);
            }
            api.setTextContent(elm, vnode.text);
        }
        if (isDef(hook) && isDef(i = hook.postpatch)) {
            i(oldVnode, vnode);
        }
    }
    return function patch(oldVnode, vnode) {
        var i, elm, parent;
        var insertedVnodeQueue = [];
        for (i = 0; i < cbs.pre.length; ++i)
            cbs.pre[i]();
        if (!isVnode(oldVnode)) {
            oldVnode = emptyNodeAt(oldVnode);
        }
        if (sameVnode(oldVnode, vnode)) {
            patchVnode(oldVnode, vnode, insertedVnodeQueue);
        }
        else {
            elm = oldVnode.elm;
            parent = api.parentNode(elm);
            createElm(vnode, insertedVnodeQueue);
            if (parent !== null) {
                api.insertBefore(parent, vnode.elm, api.nextSibling(elm));
                removeVnodes(parent, [oldVnode], 0, 0);
            }
        }
        for (i = 0; i < insertedVnodeQueue.length; ++i) {
            insertedVnodeQueue[i].data.hook.insert(insertedVnodeQueue[i]);
        }
        for (i = 0; i < cbs.post.length; ++i)
            cbs.post[i]();
        return vnode;
    };
}
exports.init = init;

},{"./h":19,"./htmldomapi":20,"./is":21,"./thunk":27,"./vnode":29}],27:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var h_1 = require("./h");
function copyToThunk(vnode, thunk) {
    thunk.elm = vnode.elm;
    vnode.data.fn = thunk.data.fn;
    vnode.data.args = thunk.data.args;
    thunk.data = vnode.data;
    thunk.children = vnode.children;
    thunk.text = vnode.text;
    thunk.elm = vnode.elm;
}
function init(thunk) {
    var cur = thunk.data;
    var vnode = cur.fn.apply(undefined, cur.args);
    copyToThunk(vnode, thunk);
}
function prepatch(oldVnode, thunk) {
    var i, old = oldVnode.data, cur = thunk.data;
    var oldArgs = old.args, args = cur.args;
    if (old.fn !== cur.fn || oldArgs.length !== args.length) {
        copyToThunk(cur.fn.apply(undefined, args), thunk);
        return;
    }
    for (i = 0; i < args.length; ++i) {
        if (oldArgs[i] !== args[i]) {
            copyToThunk(cur.fn.apply(undefined, args), thunk);
            return;
        }
    }
    copyToThunk(oldVnode, thunk);
}
exports.thunk = function thunk(sel, key, fn, args) {
    if (args === undefined) {
        args = fn;
        fn = key;
        key = undefined;
    }
    return h_1.h(sel, {
        key: key,
        hook: { init: init, prepatch: prepatch },
        fn: fn,
        args: args
    });
};
exports.default = exports.thunk;

},{"./h":19}],28:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vnode_1 = require("./vnode");
var htmldomapi_1 = require("./htmldomapi");
function toVNode(node, domApi) {
    var api = domApi !== undefined ? domApi : htmldomapi_1.default;
    var text;
    if (api.isElement(node)) {
        var id = node.id ? '#' + node.id : '';
        var cn = node.getAttribute('class');
        var c = cn ? '.' + cn.split(' ').join('.') : '';
        var sel = api.tagName(node).toLowerCase() + id + c;
        var attrs = {};
        var children = [];
        var name_1;
        var i = void 0, n = void 0;
        var elmAttrs = node.attributes;
        var elmChildren = node.childNodes;
        for (i = 0, n = elmAttrs.length; i < n; i++) {
            name_1 = elmAttrs[i].nodeName;
            if (name_1 !== 'id' && name_1 !== 'class') {
                attrs[name_1] = elmAttrs[i].nodeValue;
            }
        }
        for (i = 0, n = elmChildren.length; i < n; i++) {
            children.push(toVNode(elmChildren[i], domApi));
        }
        return vnode_1.default(sel, { attrs: attrs }, children, undefined, node);
    }
    else if (api.isText(node)) {
        text = api.getTextContent(node);
        return vnode_1.default(undefined, undefined, undefined, text, node);
    }
    else if (api.isComment(node)) {
        text = api.getTextContent(node);
        return vnode_1.default('!', {}, [], text, node);
    }
    else {
        return vnode_1.default('', {}, [], undefined, node);
    }
}
exports.toVNode = toVNode;
exports.default = toVNode;

},{"./htmldomapi":20,"./vnode":29}],29:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function vnode(sel, data, children, text, elm) {
    var key = data === undefined ? undefined : data.key;
    return { sel: sel, data: data, children: children,
        text: text, elm: elm, key: key };
}
exports.vnode = vnode;
exports.default = vnode;

},{}],30:[function(require,module,exports){
function noop() {}

module.exports = function (url, opts) {
	opts = opts || {};

	var ws, num=0, timer=1, $={};
	var max = opts.maxAttempts || Infinity;

	$.open = function () {
		ws = new WebSocket(url, opts.protocols || []);

		ws.onmessage = opts.onmessage || noop;

		ws.onopen = function (e) {
			(opts.onopen || noop)(e);
			num = 0;
		};

		ws.onclose = function (e) {
			e.code === 1e3 || e.code === 1001 || e.code === 1005 || $.reconnect(e);
			(opts.onclose || noop)(e);
		};

		ws.onerror = function (e) {
			(e && e.code==='ECONNREFUSED') ? $.reconnect(e) : (opts.onerror || noop)(e);
		};
	};

	$.reconnect = function (e) {
		if (timer && num++ < max) {
			timer = setTimeout(function () {
				(opts.onreconnect || noop)(e);
				$.open();
			}, opts.timeout || 1e3);
		} else {
			(opts.onmaximum || noop)(e);
		}
	};

	$.json = function (x) {
		ws.send(JSON.stringify(x));
	};

	$.send = function (x) {
		ws.send(x);
	};

	$.close = function (x, y) {
		timer = clearTimeout(timer);
		ws.close(x || 1e3, y);
	};

	$.open(); // init

	return $;
}

},{}],31:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const h_1 = __importDefault(require("snabbdom/h"));
function chatView(ctrl, chatType) {
    function onKeyPress(e) {
        const message = e.target.value;
        if ((e.keyCode == 13 || e.which == 13) && message.length > 0) {
            ctrl.sock.send(JSON.stringify({ "type": chatType, "message": message, "gameId": ctrl.model["gameId"] }));
            e.target.value = "";
        }
    }
    return h_1.default(`div.${chatType}#${chatType}`, { class: { "chat": true } }, [
        h_1.default(`ol#${chatType}-messages`, [h_1.default("div#messages")]),
        h_1.default('input#chat-entry', {
            props: {
                type: "text",
                name: "entry",
                autocomplete: "off",
                placeholder: "Please be nice in the chat!",
                maxlength: "140",
            },
            on: { keypress: (e) => onKeyPress(e) },
        })
    ]);
}
exports.chatView = chatView;
function chatMessage(user, message, chatType) {
    const myDiv = document.getElementById(chatType + '-messages');
    // You must add border widths, padding and margins to the right.
    const isScrolled = myDiv.scrollTop == myDiv.scrollHeight - myDiv.offsetHeight;
    var container = document.getElementById('messages');
    if (user.length === 0) {
        patch(container, h_1.default('div#messages', [h_1.default("li.message.offer", [h_1.default("t", message)])]));
    }
    else {
        patch(container, h_1.default('div#messages', [h_1.default("li.message", [h_1.default("user", user), h_1.default("t", message)])]));
    }
    ;
    if (isScrolled)
        myDiv.scrollTop = myDiv.scrollHeight;
}
exports.chatMessage = chatMessage;

},{"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],32:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("chessgroundx/util");
exports.variants = ["makruk", "sittuyin", "placement", "crazyhouse", "standard", "shogi", "xiangqi", "capablanca", "seirawan"];
exports.VARIANTS = {
    makruk: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "grid", pieces: "makruk", css: ["makruk"], icon: "Q" },
    sittuyin: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "gridx", pieces: "makruk", css: ["makruk"], icon: "R" },
    shogi: { geom: 1 /* dim9x9 */, cg: "cg-576", board: "grid9x9", pieces: "shogi", css: ["shogi0", "shogi0w", "shogi0p"], icon: "K" },
    xiangqi: { geom: 3 /* dim9x10 */, cg: "cg-576-640", board: "river", pieces: "xiangqi", css: ["xiangqi", "xiangqie", "xiangqict"], icon: "O" },
    placement: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["standard"], icon: "S" },
    crazyhouse: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["standard"], icon: "H" },
    capablanca: { geom: 2 /* dim10x8 */, cg: "cg-640", board: "capablanca", pieces: "merida", css: ["standard"], icon: "P" },
    seirawan: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["standard"], icon: "L" },
    standard: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["standard"], icon: "M" },
};
function pocketRoles(variant) {
    switch (variant) {
        case "sittuyin":
            return ["rook", "knight", "silver", "ferz", "king"];
        case "crazyhouse":
            return ["pawn", "knight", "bishop", "rook", "queen"];
        case "shogi":
            return ["pawn", "lance", "knight", "bishop", "rook", "silver", "gold"];
        case "seirawan":
            return ["elephant", "hawk"];
        default:
            return ["rook", "knight", "bishop", "queen", "king"];
    }
}
exports.pocketRoles = pocketRoles;
function promotionZone(variant, color) {
    switch (variant) {
        case 'shogi':
            return color === 'white' ? 'a9b9c9d9e9f9g9h9i9a8b8c8d8e8f8g8h8i8a7b7c7d7e7f7g7h7i7' : 'a1b1c1d1e1f1g1h1i1a2b2c2d2e2f2g2h2i2a3b3c3d3e3f3g3h3i3';
        case 'makruk':
            return color === 'white' ? 'a6b6c6d6e6f6g6h6' : 'a3b3c3d3e3f3g3h3';
        case 'sittuyin':
            return color === 'white' ? 'a8b7c6d5e5f6g7h8' : 'a1b2c3d4e4f3g2h1';
        default:
            return color === 'white' ? 'a8b8c8d8e8f8g8h8i8j8' : 'a1b1c1d1e1f1g1h1i1j1';
    }
}
function promotionRoles(variant, role) {
    switch (variant) {
        case "capablanca":
            return ["queen", "knight", "rook", "bishop", "archbishop", "cancellor"];
        case "seirawan":
            return ["queen", "knight", "rook", "bishop", "elephant", "hawk"];
        case "shogi":
            return ["p" + role, role];
        default:
            return ["queen", "knight", "rook", "bishop"];
    }
}
exports.promotionRoles = promotionRoles;
function mandatoryPromotion(role, dest, color) {
    switch (role) {
        case "pawn":
        case "lance":
            if (color === "white") {
                return dest[1] === "9";
            }
            else {
                return dest[1] === "1";
            }
        case "knight":
            if (color === "white") {
                return dest[1] === "9" || dest[1] === "8";
            }
            else {
                return dest[1] === "1" || dest[1] === "2";
            }
        default:
            return false;
    }
}
exports.mandatoryPromotion = mandatoryPromotion;
function needPockets(variant) {
    return variant === 'placement' || variant === 'crazyhouse' || variant === 'sittuyin' || variant === 'shogi' || variant === 'seirawan';
}
exports.needPockets = needPockets;
function hasEp(variant) {
    return variant === 'standard' || variant === 'placement' || variant === 'crazyhouse' || variant === 'capablanca' || variant === 'seirawan';
}
exports.hasEp = hasEp;
function diff(a, b) {
    return Math.abs(a - b);
}
function diagonalMove(pos1, pos2) {
    const xd = diff(pos1[0], pos2[0]);
    const yd = diff(pos1[1], pos2[1]);
    return xd === yd && xd === 1;
}
function canGate(fen, piece, orig, dest, meta) {
    console.log("   isGating()", piece, orig, dest, meta);
    if ((piece.color === "white" && orig.slice(1) !== "1") ||
        (piece.color === "black" && orig.slice(1) !== "8") ||
        (piece.role === "hawk") ||
        (piece.role === "elephant"))
        return [false, false];
    // In starting position king and(!) rook virginity is encoded in KQkq
    // "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1"
    // but after kings moved rook virginity is encoded in AHah
    // rnbq1bnr/ppppkppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR[HEhe] w ABCDFGHabcdfgh - 2 3
    const parts = fen.split(" ");
    const placement = parts[0];
    const color = parts[1];
    const castl = parts[2];
    // console.log("isGating()", orig, placement, color, castl);
    switch (orig) {
        case "a1":
            if (castl.indexOf("A") === -1 && castl.indexOf("Q") === -1)
                return [false, false];
            break;
        case "b1":
            if (castl.indexOf("B") === -1)
                return [false, false];
            break;
        case "c1":
            if (castl.indexOf("C") === -1)
                return [false, false];
            break;
        case "d1":
            if (castl.indexOf("D") === -1)
                return [false, false];
            break;
        case "e1":
            if (piece.role !== "king")
                return [false, false];
            break;
        case "f1":
            if (castl.indexOf("F") === -1)
                return [false, false];
            break;
        case "g1":
            if (castl.indexOf("G") === -1)
                return [false, false];
            break;
        case "h1":
            if (castl.indexOf("H") === -1 && castl.indexOf("K") === -1)
                return [false, false];
            break;
        case "a8":
            if (castl.indexOf("a") === -1 && castl.indexOf("q") === -1)
                return [false, false];
            break;
        case "b8":
            if (castl.indexOf("b") === -1)
                return [false, false];
            break;
        case "c8":
            if (castl.indexOf("c") === -1)
                return [false, false];
            break;
        case "d8":
            if (castl.indexOf("d") === -1)
                return [false, false];
            break;
        case "e8":
            if (piece.role !== "king")
                return [false, false];
            break;
        case "f8":
            if (castl.indexOf("f") === -1)
                return [false, false];
            break;
        case "g8":
            if (castl.indexOf("g") === -1)
                return [false, false];
            break;
        case "h8":
            if (castl.indexOf("h") === -1 && castl.indexOf("k") === -1)
                return [false, false];
            break;
    }
    ;
    const bracketPos = placement.indexOf("[");
    const pockets = placement.slice(bracketPos);
    const ph = lc(pockets, "h", color === 'w') === 1;
    const pe = lc(pockets, "e", color === 'w') === 1;
    return [ph, pe];
}
exports.canGate = canGate;
function isPromotion(variant, piece, orig, dest, meta) {
    if (variant === 'xiangqi')
        return false;
    const pz = promotionZone(variant, piece.color);
    switch (variant) {
        case 'shogi':
            return ['king', 'gold', 'ppawn', 'pknight', 'pbishop', 'prook', 'psilver', 'plance'].indexOf(piece.role) === -1
                && (pz.indexOf(orig) !== -1 || pz.indexOf(dest) !== -1);
        case 'sittuyin':
            // See https://vdocuments.net/how-to-play-myanmar-traditional-chess-eng-book-1.html
            const firstRankIs0 = false;
            const dm = diagonalMove(util_1.key2pos(orig, firstRankIs0), util_1.key2pos(dest, firstRankIs0));
            return piece.role === "pawn" && (orig === dest || (!meta.captured && dm));
        default:
            return piece.role === "pawn" && pz.indexOf(dest) !== -1;
    }
}
exports.isPromotion = isPromotion;
function uci2usi(move) {
    const parts = move.split("");
    if (parts[1] === "@") {
        parts[1] = "*";
        parts[2] = String.fromCharCode(parts[2].charCodeAt() - 48);
        parts[3] = String.fromCharCode(parts[3].charCodeAt() + 48);
    }
    else {
        parts[0] = String.fromCharCode(parts[0].charCodeAt() - 48);
        parts[1] = String.fromCharCode(parts[1].charCodeAt() + 48);
        parts[2] = String.fromCharCode(parts[2].charCodeAt() - 48);
        parts[3] = String.fromCharCode(parts[3].charCodeAt() + 48);
    }
    return parts.join("");
}
exports.uci2usi = uci2usi;
function usi2uci(move) {
    const parts = move.split("");
    if (parts[1] === "*") {
        parts[1] = "@";
        parts[2] = String.fromCharCode(parts[2].charCodeAt() + 48);
        parts[3] = String.fromCharCode(parts[3].charCodeAt() - 48);
    }
    else {
        parts[0] = String.fromCharCode(parts[0].charCodeAt() + 48);
        parts[1] = String.fromCharCode(parts[1].charCodeAt() - 48);
        parts[2] = String.fromCharCode(parts[2].charCodeAt() + 48);
        parts[3] = String.fromCharCode(parts[3].charCodeAt() - 48);
    }
    return parts.join("");
}
exports.usi2uci = usi2uci;
exports.roleToSan = {
    pawn: 'P',
    knight: 'N',
    bishop: 'B',
    rook: 'R',
    queen: 'Q',
    king: 'K',
    archbishop: 'A',
    cancellor: 'C',
    elephant: "E",
    hawk: "H",
    ferz: 'F',
    met: 'M',
    gold: 'G',
    silver: 'S',
    lance: 'L',
};
exports.sanToRole = {
    P: 'pawn',
    N: 'knight',
    B: 'bishop',
    R: 'rook',
    Q: 'queen',
    K: 'king',
    A: 'archbishop',
    C: 'cancellor',
    E: 'elephant',
    H: 'hawk',
    F: 'ferz',
    M: 'met',
    G: 'gold',
    S: 'silver',
    L: 'lance',
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
    a: 'archbishop',
    c: 'cancellor',
    e: 'elephant',
    h: 'hawk',
    f: 'ferz',
    m: 'met',
    g: 'gold',
    s: 'silver',
    l: 'lance',
};
// Count given letter occurences in a string
function lc(str, letter, uppercase) {
    var letterCount = 0;
    if (uppercase)
        letter = letter.toUpperCase();
    for (var position = 0; position < str.length; position++) {
        if (str.charAt(position) === letter)
            letterCount += 1;
    }
    return letterCount;
}
exports.lc = lc;

},{"chessgroundx/util":17}],33:[function(require,module,exports){
"use strict";
// https://stackoverflow.com/questions/20618355/the-simplest-possible-javascript-countdown-timer
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
class Clock {
    // game baseTime (min) and increment (sec)
    constructor(baseTime, increment, el) {
        this.start = (duration) => {
            if (this.running)
                return;
            if (typeof duration !== "undefined")
                this.duration = duration;
            this.running = true;
            this.startTime = Date.now();
            var that = this;
            var diff;
            (function timer() {
                diff = that.duration - (Date.now() - that.startTime);
                // console.log("timer()", that.duration - diff);
                if (diff <= 0) {
                    that.flagCallback();
                    that.pause(false);
                    return;
                }
                that.timeout = setTimeout(timer, that.granularity);
                that.tickCallbacks.forEach(function (callback) {
                    callback.call(that, that, diff);
                }, that);
            }());
        };
        this.onTick = (callback) => {
            if (typeof callback === 'function') {
                this.tickCallbacks.push(callback);
            }
            return this;
        };
        this.onFlag = (callback) => {
            if (typeof callback === 'function') {
                this.pause(false);
                this.flagCallback = callback;
            }
            return this;
        };
        this.pause = (withIncrement) => {
            if (!this.running)
                return;
            this.running = false;
            if (this.timeout)
                clearTimeout(this.timeout);
            this.timeout = null;
            this.duration -= Date.now() - this.startTime;
            if (withIncrement && this.increment)
                this.duration += this.increment;
            renderTime(this, this.duration);
        };
        this.setTime = (millis) => {
            this.duration = millis;
            renderTime(this, this.duration);
        };
        this.parseTime = (millis) => {
            let minutes = Math.floor(millis / 60000);
            let seconds = (millis % 60000) / 1000;
            let secs, mins;
            if (Math.floor(seconds) == 60) {
                minutes++;
                seconds = 0;
            }
            minutes = Math.max(0, minutes);
            seconds = Math.max(0, seconds);
            if (millis < 10000) {
                secs = seconds.toFixed(1);
            }
            else {
                secs = String(Math.floor(seconds));
            }
            mins = (minutes < 10 ? "0" : "") + String(minutes);
            secs = (seconds < 10 ? "0" : "") + secs;
            return {
                minutes: mins,
                seconds: secs,
            };
        };
        this.duration = baseTime * 1000 * 60;
        this.increment = increment * 1000;
        this.granularity = 500;
        this.running = false;
        this.connecting = false;
        this.timeout = null;
        this.startTime = null;
        this.tickCallbacks = [];
        this.flagCallback = null;
        this.el = el;
        renderTime(this, this.duration);
    }
}
exports.Clock = Clock;
function renderTime(clock, time) {
    if (clock.granularity > 100 && time < 10000)
        clock.granularity = 100;
    const parsed = clock.parseTime(time);
    // console.log("renderTime():", time, parsed);
    const date = new Date(time);
    const millis = date.getUTCMilliseconds();
    clock.el = patch(clock.el, snabbdom_1.h('div.clock-wrap', [snabbdom_1.h('div.clock', [
            snabbdom_1.h('div.clock.time.min', { class: { running: clock.running, hurry: time < 10000, connecting: clock.connecting } }, parsed.minutes),
            snabbdom_1.h('div.clock.sep', { class: { running: clock.running, hurry: time < 10000, low: millis < 500, connecting: clock.connecting } }, ':'),
            snabbdom_1.h('div.clock.time.sec', { class: { running: clock.running, hurry: time < 10000, connecting: clock.connecting } }, parsed.seconds),
        ])]));
}
exports.renderTime = renderTime;

},{"snabbdom":26,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],34:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sockette_1 = __importDefault(require("sockette"));
const snabbdom_1 = require("snabbdom");
const h_1 = require("snabbdom/h");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const util_1 = require("chessgroundx/util");
const chessgroundx_1 = require("chessgroundx");
const types_1 = require("chessgroundx/types");
const clock_1 = require("./clock");
const gating_1 = __importDefault(require("./gating"));
const promotion_1 = __importDefault(require("./promotion"));
const pocket_1 = require("./pocket");
const sound_1 = require("./sound");
const chess_1 = require("./chess");
const user_1 = require("./user");
const chat_1 = require("./chat");
const movelist_1 = require("./movelist");
const resize_1 = __importDefault(require("./resize"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
class RoundController {
    constructor(el, model) {
        this.getGround = () => this.chessground;
        this.getDests = () => this.dests;
        this.setZoom = (zoom) => {
            const el = document.querySelector('.cg-wrap');
            if (el) {
                const baseWidth = types_1.dimensions[chess_1.VARIANTS[this.variant].geom].width * (this.variant === "shogi" ? 52 : 64);
                const baseHeight = types_1.dimensions[chess_1.VARIANTS[this.variant].geom].height * (this.variant === "shogi" ? 60 : 64);
                const pxw = `${zoom / 100 * baseWidth}px`;
                const pxh = `${zoom / 100 * baseHeight}px`;
                el.style.width = pxw;
                el.style.height = pxh;
                document.body.setAttribute('style', '--cgwrapwidth:' + pxw);
                document.body.setAttribute('style', '--cgwrapheight:' + pxh);
                document.body.dispatchEvent(new Event('chessground.resize'));
                localStorage.setItem("zoom", String(zoom));
            }
        };
        this.onMsgGameStart = (msg) => {
            // console.log("got gameStart msg:", msg);
            if (msg.gameId !== this.model["gameId"])
                return;
            if (!this.spectator)
                sound_1.sound.genericNotify();
        };
        this.onMsgNewGame = (msg) => {
            console.log("GameController.onMsgNewGame()", this.model["gameId"]);
            window.location.assign(this.model["home"] + '/' + msg["gameId"]);
        };
        this.rematch = () => {
            console.log("REMATCH");
            this.doSend({ type: "rematch", gameId: this.model["gameId"] });
            // window.location.assign(home);
        };
        this.newOpponent = (home) => {
            window.location.assign(home);
        };
        this.gameOver = () => {
            this.gameControls = patch(this.gameControls, h_1.h('div'));
            var container = document.getElementById('after-game');
            if (this.spectator) {
                patch(container, h_1.h('div.after-game', [h_1.h('result', this.result)]));
            }
            else {
                patch(container, h_1.h('div.after-game', [
                    h_1.h('result', this.result),
                    h_1.h('button.rematch', { on: { click: () => this.rematch() } }, "REMATCH"),
                    h_1.h('button.newopp', { on: { click: () => this.newOpponent(this.model["home"]) } }, "NEW OPPONENT"),
                ]));
            }
        };
        this.checkStatus = (msg) => {
            if (msg.gameId !== this.model["gameId"])
                return;
            if (msg.status >= 0 && this.result === "") {
                this.clocks[0].pause(false);
                this.clocks[1].pause(false);
                this.result = msg.result;
                switch (msg.result) {
                    case "1/2-1/2":
                        sound_1.sound.draw();
                        break;
                    case "1-0":
                        if (!this.spectator) {
                            if (this.mycolor === "white") {
                                sound_1.sound.victory();
                            }
                            else {
                                sound_1.sound.defeat();
                            }
                        }
                        break;
                    case "0-1":
                        if (!this.spectator) {
                            if (this.mycolor === "black") {
                                sound_1.sound.victory();
                            }
                            else {
                                sound_1.sound.defeat();
                            }
                        }
                        break;
                    // ABORTED
                    default:
                        break;
                }
                this.gameOver();
                var container = document.getElementById('under-board');
                patch(container, h_1.h('under-board', [h_1.h('textarea', { attrs: { rows: 13 } }, msg.pgn)]));
                if (this.tv) {
                    setInterval(() => { this.doSend({ type: "updateTV", gameId: this.model["gameId"] }); }, 2000);
                }
            }
        };
        this.onMsgUpdateTV = (msg) => {
            if (msg.gameId !== this.model["gameId"]) {
                window.location.assign(this.model["home"] + '/tv');
            }
        };
        this.setPieces = (color) => {
            console.log("setPieces()", this.variant, color);
            const idx = this.CSSindexes[chess_1.variants.indexOf(this.variant)];
            switch (this.variant) {
                case "xiangqi":
                    sound_1.changeCSS('/static/' + chess_1.VARIANTS[this.variant].css[idx] + '.css');
                    break;
                case "shogi":
                    var css = chess_1.VARIANTS[this.variant].css[idx];
                    // change shogi piece colors according to board orientation
                    if (color === "black")
                        css = css.replace('0', '1');
                    sound_1.changeCSS('/static/' + css + '.css');
                    break;
            }
        };
        // In Capablanca we have to finelize castling because
        // chessground autoCastle works for standard chess only
        this.castleRook = (kingDest, color) => {
            const diff = {};
            if (kingDest === "c") {
                diff[color === 'white' ? "a1" : "a8"] = undefined;
                diff[color === 'white' ? "d1" : "d8"] = { color: color, role: "rook" };
                this.chessground.setPieces(diff);
            }
            ;
            if (kingDest === "i") {
                diff[color === 'white' ? "j1" : "j8"] = undefined;
                diff[color === 'white' ? "h1" : "h8"] = { color: color, role: "rook" };
                this.chessground.setPieces(diff);
            }
            ;
        };
        this.onMsgBoard = (msg) => {
            if (msg.gameId !== this.model["gameId"])
                return;
            // Game aborted.
            if (msg["status"] === 0)
                return;
            // console.log("got board msg:", msg);
            this.ply = msg.ply;
            this.fullfen = msg.fen;
            this.dests = msg.dests;
            const clocks = msg.clocks;
            const parts = msg.fen.split(" ");
            this.turnColor = parts[1] === "w" ? "white" : "black";
            if (msg.steps.length > 1) {
                this.steps = [];
                var container = document.getElementById('movelist');
                patch(container, h_1.h('div#movelist'));
                msg.steps.forEach((step) => {
                    this.steps.push(step);
                    movelist_1.updateMovelist(this);
                });
            }
            else {
                if (msg.ply === this.steps.length) {
                    const step = {
                        'fen': msg.fen,
                        'move': msg.lastMove[0] + msg.lastMove[1],
                        'check': msg.check,
                        'turnColor': this.turnColor,
                        'san': msg.steps[0].san,
                    };
                    this.steps.push(step);
                    movelist_1.updateMovelist(this);
                }
            }
            this.abortable = Number(parts[parts.length - 1]) <= 1;
            if (!this.spectator && !this.abortable && this.result === "") {
                var container = document.getElementById('abort');
                patch(container, h_1.h('button#abort', { props: { disabled: true } }));
            }
            var lastMove = msg.lastMove;
            if (lastMove !== null && this.variant === "shogi") {
                lastMove = chess_1.usi2uci(lastMove[0] + lastMove[1]);
                lastMove = [lastMove.slice(0, 2), lastMove.slice(2, 4)];
            }
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            if (lastMove !== null && lastMove[0][1] === '@')
                lastMove = [lastMove[1]];
            // save capture state before updating chessground
            const capture = lastMove !== null && this.chessground.state.pieces[lastMove[1]];
            if (lastMove !== null && (this.turnColor === this.mycolor || this.spectator)) {
                if (this.variant === "shogi") {
                    sound_1.sound.shogimove();
                }
                else {
                    if (capture) {
                        sound_1.sound.capture();
                    }
                    else {
                        sound_1.sound.move();
                    }
                }
            }
            else {
                lastMove = [];
            }
            this.checkStatus(msg);
            if (msg.check) {
                sound_1.sound.check();
            }
            const oppclock = !this.flip ? 0 : 1;
            const myclock = 1 - oppclock;
            if (this.spectator) {
                this.chessground.set({
                    fen: parts[0],
                    turnColor: this.turnColor,
                    check: msg.check,
                    lastMove: lastMove,
                });
                pocket_1.updatePockets(this, this.vpocket0, this.vpocket1);
                this.clocks[0].pause(false);
                this.clocks[1].pause(false);
                this.clocks[oppclock].setTime(clocks[this.oppcolor]);
                this.clocks[myclock].setTime(clocks[this.mycolor]);
                if (!this.abortable && msg.status < 0) {
                    if (this.turnColor === this.mycolor) {
                        this.clocks[myclock].start();
                    }
                    else {
                        this.clocks[oppclock].start();
                    }
                }
            }
            else {
                if (this.turnColor === this.mycolor) {
                    this.chessground.set({
                        fen: parts[0],
                        turnColor: this.turnColor,
                        movable: {
                            free: false,
                            color: this.mycolor,
                            dests: msg.dests,
                        },
                        check: msg.check,
                        lastMove: lastMove,
                    });
                    pocket_1.updatePockets(this, this.vpocket0, this.vpocket1);
                    this.clocks[oppclock].pause(false);
                    this.clocks[oppclock].setTime(clocks[this.oppcolor]);
                    if (!this.abortable && msg.status < 0) {
                        this.clocks[myclock].start(clocks[this.mycolor]);
                        console.log('MY CLOCK STARTED');
                    }
                    // console.log("trying to play premove....");
                    if (this.premove)
                        this.performPremove();
                    if (this.predrop)
                        this.performPredrop();
                }
                else {
                    this.chessground.set({
                        turnColor: this.turnColor,
                        premovable: {
                            dests: msg.dests,
                        },
                        check: msg.check,
                    });
                    this.clocks[myclock].pause(false);
                    this.clocks[myclock].setTime(clocks[this.mycolor]);
                    if (!this.abortable && msg.status < 0) {
                        this.clocks[oppclock].start(clocks[this.oppcolor]);
                        console.log('OPP CLOCK  STARTED');
                    }
                    if (this.oppIsRandomMover && msg.rm !== "") {
                        this.doSend({ type: "move", gameId: this.model["gameId"], move: msg.rm, clocks: clocks });
                    }
                    ;
                }
                ;
            }
            ;
        };
        this.goPly = (ply) => {
            const step = this.steps[ply];
            // TODO: update pockets !!!
            this.chessground.set({
                fen: step.fen,
                turnColor: step.turnColor,
                movable: {
                    free: false,
                    color: this.spectator ? undefined : step.turnColor,
                    dests: this.result === "" && ply === this.steps.length - 1 ? this.dests : undefined,
                },
                check: step.check,
                lastMove: step.move === undefined ? undefined : [step.move.slice(0, 2), step.move.slice(2, 4)],
            });
            this.fullfen = step.fen;
            pocket_1.updatePockets(this, this.vpocket0, this.vpocket1);
            // TODO: play sound if ply == this.ply + 1
            this.ply = ply;
        };
        this.doSend = (message) => {
            console.log("---> doSend():", message);
            this.sock.send(JSON.stringify(message));
        };
        this.sendMove = (orig, dest, promo) => {
            // pause() will add increment!
            const oppclock = !this.flip ? 0 : 1;
            const myclock = 1 - oppclock;
            const movetime = (this.clocks[myclock].running) ? Date.now() - this.clocks[myclock].startTime : 0;
            this.clocks[myclock].pause(true);
            // console.log("sendMove(orig, dest, prom)", orig, dest, promo);
            const uci_move = orig + dest + promo;
            const move = this.variant === "shogi" ? chess_1.uci2usi(uci_move) : uci_move;
            // console.log("sendMove(move)", move);
            // TODO: if premoved, send 0 time
            let bclock, clocks;
            if (!this.flip) {
                bclock = this.mycolor === "black" ? 1 : 0;
            }
            else {
                bclock = this.mycolor === "black" ? 0 : 1;
            }
            const wclock = 1 - bclock;
            clocks = { movetime: movetime, black: this.clocks[bclock].duration, white: this.clocks[wclock].duration };
            this.doSend({ type: "move", gameId: this.model["gameId"], move: move, clocks: clocks });
            if (!this.abortable)
                this.clocks[oppclock].start();
        };
        this.onMove = () => {
            return (orig, dest, capturedPiece) => {
                console.log("   ground.onMove()", orig, dest, capturedPiece);
                if (this.variant === "shogi") {
                    sound_1.sound.shogimove();
                }
                else {
                    if (capturedPiece) {
                        sound_1.sound.capture();
                    }
                    else {
                        sound_1.sound.move();
                    }
                }
            };
        };
        this.onDrop = () => {
            return (piece, dest) => {
                console.log("ground.onDrop()", piece, dest);
                if (dest != "a0" && piece.role && pocket_1.dropIsValid(this.dests, piece.role, dest)) {
                    if (this.variant === "shogi") {
                        sound_1.sound.shogimove();
                    }
                    else {
                        sound_1.sound.move();
                    }
                }
                else {
                    this.clickDrop = piece;
                }
            };
        };
        this.setPremove = (orig, dest, meta) => {
            this.premove = { orig, dest, meta };
            console.log("setPremove() to:", orig, dest, meta);
        };
        this.unsetPremove = () => {
            this.premove = null;
        };
        this.setPredrop = (role, key) => {
            this.predrop = { role, key };
            console.log("setPredrop() to:", role, key);
        };
        this.unsetPredrop = () => {
            this.predrop = null;
        };
        this.performPremove = () => {
            const { orig, dest, meta } = this.premove;
            // TODO: promotion?
            console.log("performPremove()", orig, dest, meta);
            this.chessground.playPremove();
            this.premove = null;
        };
        this.performPredrop = () => {
            const { role, key } = this.predrop;
            console.log("performPredrop()", role, key);
            this.chessground.playPredrop(drop => { return pocket_1.dropIsValid(this.dests, drop.role, drop.key); });
            this.predrop = null;
        };
        this.onUserMove = (orig, dest, meta) => {
            // chessground doesn't knows about ep, so we have to remove ep captured pawn
            const pieces = this.chessground.state.pieces;
            const geom = this.chessground.state.geometry;
            console.log("ground.onUserMove()", orig, dest, meta, pieces);
            const moved = pieces[dest];
            const firstRankIs0 = this.chessground.state.dimensions.height === 10;
            if (meta.captured === undefined && moved.role === "pawn" && orig[0] != dest[0] && chess_1.hasEp(this.variant)) {
                const pos = util_1.key2pos(dest, firstRankIs0), pawnPos = [pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)];
                const diff = {};
                diff[util_1.pos2key(pawnPos, geom)] = undefined;
                this.chessground.setPieces(diff);
                meta.captured = { role: "pawn" };
            }
            ;
            // increase pocket count
            if ((this.variant === "crazyhouse" || this.variant === "shogi") && meta.captured) {
                var role = meta.captured.role;
                if (meta.captured.promoted)
                    role = this.variant === "shogi" ? meta.captured.role.slice(1) : "pawn";
                if (this.flip) {
                    this.pockets[0][role]++;
                    this.vpocket0 = patch(this.vpocket0, pocket_1.pocketView(this, this.mycolor, "top"));
                }
                else {
                    this.pockets[1][role]++;
                    this.vpocket1 = patch(this.vpocket1, pocket_1.pocketView(this, this.mycolor, "bottom"));
                }
            }
            ;
            // chessground autoCastle works for standard chess only
            if (this.variant === "capablanca" && moved.role === "king" && orig[0] === "f")
                this.castleRook(dest[0], this.mycolor);
            //  gating elephant/hawk
            if (this.variant === "seirawan") {
                if (!this.promotion.start(orig, dest, meta) && !this.gating.start(this.fullfen, orig, dest, meta))
                    this.sendMove(orig, dest, '');
            }
            else {
                if (!this.promotion.start(orig, dest, meta))
                    this.sendMove(orig, dest, '');
            }
            ;
        };
        this.onUserDrop = (role, dest) => {
            // console.log("ground.onUserDrop()", role, dest);
            // decrease pocket count
            if (pocket_1.dropIsValid(this.dests, role, dest)) {
                if (this.flip) {
                    this.pockets[0][role]--;
                    this.vpocket0 = patch(this.vpocket0, pocket_1.pocketView(this, this.mycolor, "top"));
                }
                else {
                    this.pockets[1][role]--;
                    this.vpocket1 = patch(this.vpocket1, pocket_1.pocketView(this, this.mycolor, "bottom"));
                }
                this.sendMove(chess_1.roleToSan[role] + "@", dest, '');
                // console.log("sent move", move);
            }
            else {
                console.log("!!! invalid move !!!", role, dest);
                // restore board
                this.clickDrop = undefined;
                this.chessground.set({
                    fen: this.fullfen,
                    lastMove: this.lastmove,
                    turnColor: this.mycolor,
                    movable: {
                        dests: this.dests,
                        showDests: true,
                    },
                });
            }
        };
        // use this for sittuyin in place promotion ?
        // Or implement ondblclick handler to emit move in chessground?
        // https://www.w3schools.com/jsref/event_ondblclick.asp
        this.onChange = (selected) => {
            return () => {
                console.log("   ground.onChange()", selected);
            };
        };
        // use this for sittuyin in place promotion ?
        this.onSelect = (selected) => {
            return (key) => {
                console.log("   ground.onSelect()", key, selected, this.clickDrop, this.chessground.state);
                // If drop selection was set dropDests we have to restore dests here
                if (this.chessground.state.movable.dests === undefined)
                    return;
                if (key != "a0" && "a0" in this.chessground.state.movable.dests) {
                    if (this.clickDrop !== undefined && pocket_1.dropIsValid(this.dests, this.clickDrop.role, key)) {
                        this.chessground.newPiece(this.clickDrop, key);
                        this.onUserDrop(this.clickDrop.role, key);
                    }
                    this.clickDrop = undefined;
                    this.chessground.set({ movable: { dests: this.dests } });
                }
                ;
            };
        };
        this.onMsgUserConnected = (msg) => {
            this.model["username"] = msg["username"];
            user_1.renderUsername(this.model["home"], this.model["username"]);
            if (this.spectator) {
                this.doSend({ type: "is_user_online", username: this.wplayer });
                this.doSend({ type: "is_user_online", username: this.bplayer });
                // we want to know lastMove and check status
                this.doSend({ type: "board", gameId: this.model["gameId"] });
            }
            else {
                const opp_name = this.model["username"] === this.wplayer ? this.bplayer : this.wplayer;
                this.doSend({ type: "is_user_online", username: opp_name });
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));
                // prevent sending gameStart message when user just reconecting
                if (msg.ply === 0) {
                    this.doSend({ type: "ready", gameId: this.model["gameId"] });
                }
                this.doSend({ type: "board", gameId: this.model["gameId"] });
            }
        };
        this.onMsgUserOnline = (msg) => {
            console.log(msg);
            if (msg.username === this.players[0]) {
                var container = document.getElementById('top-player');
                patch(container, h_1.h('i-side.online#top-player', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));
            }
            else {
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));
            }
        };
        this.onMsgUserDisconnected = (msg) => {
            console.log(msg);
            if (msg.username === this.players[0]) {
                var container = document.getElementById('top-player');
                patch(container, h_1.h('i-side.online#top-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }));
            }
            else {
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }));
            }
        };
        this.onMsgChat = (msg) => {
            chat_1.chatMessage(msg.user, msg.message, "roundchat");
        };
        this.onMsgOffer = (msg) => {
            chat_1.chatMessage("", msg.message, "roundchat");
        };
        this.onMessage = (evt) => {
            console.log("<+++ onMessage():", evt.data);
            var msg = JSON.parse(evt.data);
            switch (msg.type) {
                case "board":
                    this.onMsgBoard(msg);
                    break;
                case "gameEnd":
                    this.checkStatus(msg);
                    break;
                case "gameStart":
                    this.onMsgGameStart(msg);
                    break;
                case "game_user_connected":
                    this.onMsgUserConnected(msg);
                    break;
                case "user_online":
                    this.onMsgUserOnline(msg);
                    break;
                case "user_disconnected":
                    this.onMsgUserDisconnected(msg);
                    break;
                case "roundchat":
                    this.onMsgChat(msg);
                    break;
                case "new_game":
                    this.onMsgNewGame(msg);
                    break;
                case "offer":
                    this.onMsgOffer(msg);
                    break;
                case "updateTV":
                    this.onMsgUpdateTV(msg);
                    break;
            }
        };
        const onOpen = (evt) => {
            console.log("ctrl.onOpen()", evt);
            this.clocks[0].connecting = false;
            this.clocks[1].connecting = false;
            this.doSend({ type: "game_user_connected", username: this.model["username"], gameId: this.model["gameId"] });
        };
        const opts = {
            maxAttempts: 10,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => {
                this.clocks[0].connecting = true;
                this.clocks[1].connecting = true;
                console.log('Reconnecting in round...', e);
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }));
            },
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => console.log('Closed!', e),
            onerror: e => console.log('Error:', e),
        };
        try {
            this.sock = new sockette_1.default("ws://" + location.host + "/wsr", opts);
        }
        catch (err) {
            this.sock = new sockette_1.default("wss://" + location.host + "/wsr", opts);
        }
        this.model = model;
        this.variant = model["variant"];
        this.fullfen = model["fen"];
        this.wplayer = model["wplayer"];
        this.bplayer = model["bplayer"];
        this.base = model["base"];
        this.inc = model["inc"];
        this.status = model["status"];
        this.tv = model["tv"];
        this.steps = [];
        this.ply = 0;
        this.flip = false;
        this.CSSindexes = chess_1.variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));
        this.spectator = this.model["username"] !== this.wplayer && this.model["username"] !== this.bplayer;
        // orientation = this.mycolor
        if (this.spectator) {
            this.mycolor = this.variant === 'shogi' ? 'black' : 'white';
            this.oppcolor = this.variant === 'shogi' ? 'white' : 'black';
        }
        else {
            this.mycolor = this.model["username"] === this.wplayer ? 'white' : 'black';
            this.oppcolor = this.model["username"] === this.wplayer ? 'black' : 'white';
        }
        this.oppIsRandomMover = ((this.mycolor === "white" && this.bplayer === "Random-Mover") ||
            (this.mycolor === "black" && this.wplayer === "Random-Mover"));
        // players[0] is top player, players[1] is bottom player
        this.players = [
            this.mycolor === "white" ? this.bplayer : this.wplayer,
            this.mycolor === "white" ? this.wplayer : this.bplayer
        ];
        this.premove = null;
        this.predrop = null;
        this.result = "";
        const parts = this.fullfen.split(" ");
        this.abortable = Number(parts[parts.length - 1]) <= 1;
        const fen_placement = parts[0];
        this.turnColor = parts[1] === "w" ? "white" : "black";
        if (this.variant === "shogi" || this.variant === "xiangqi") {
            this.setPieces(this.mycolor);
        }
        else {
            // TODO:save/restore preferences
            sound_1.changeCSS('/static/' + chess_1.VARIANTS[this.variant].css[0] + '.css');
        }
        ;
        this.steps.push({
            'fen': fen_placement,
            'move': undefined,
            'check': false,
            'turnColor': this.turnColor,
        });
        this.chessground = chessgroundx_1.Chessground(el, {
            fen: fen_placement,
            geometry: chess_1.VARIANTS[this.variant].geom,
            orientation: this.mycolor,
            turnColor: this.turnColor,
            animation: {
                enabled: true,
            },
            events: {
                insert(elements) { resize_1.default(elements); }
            }
        });
        if (localStorage.zoom !== undefined && localStorage.zoom !== 100) {
            this.setZoom(Number(localStorage.zoom));
        }
        if (this.spectator) {
            this.chessground.set({
                viewOnly: true,
                events: {
                    move: this.onMove(),
                }
            });
        }
        else {
            this.chessground.set({
                movable: {
                    free: false,
                    color: this.mycolor,
                    showDests: true,
                    events: {
                        after: this.onUserMove,
                        afterNewPiece: this.onUserDrop,
                    }
                },
                premovable: {
                    enabled: true,
                    events: {
                        set: this.setPremove,
                        unset: this.unsetPremove,
                    }
                },
                predroppable: {
                    enabled: true,
                    events: {
                        set: this.setPredrop,
                        unset: this.unsetPredrop,
                    }
                },
                events: {
                    move: this.onMove(),
                    dropNewPiece: this.onDrop(),
                    change: this.onChange(this.chessground.state.selected),
                    select: this.onSelect(this.chessground.state.selected),
                }
            });
        }
        ;
        this.gating = gating_1.default(this);
        this.promotion = promotion_1.default(this);
        // initialize pockets
        if (chess_1.needPockets(this.variant)) {
            const pocket0 = document.getElementById('pocket0');
            const pocket1 = document.getElementById('pocket1');
            pocket_1.updatePockets(this, pocket0, pocket1);
        }
        // initialize clocks
        const c0 = new clock_1.Clock(this.base, this.inc, document.getElementById('clock0'));
        const c1 = new clock_1.Clock(this.base, this.inc, document.getElementById('clock1'));
        this.clocks = [c0, c1];
        this.clocks[0].onTick(clock_1.renderTime);
        this.clocks[1].onTick(clock_1.renderTime);
        const flagCallback = () => {
            if (this.turnColor === this.mycolor && !this.spectator) {
                this.chessground.stop();
                console.log("Flag");
                this.doSend({ type: "flag", gameId: this.model["gameId"] });
            }
        };
        this.clocks[1].onFlag(flagCallback);
        if (Number(this.status) < 0) {
            console.log("GAME is ONGOING...");
        }
        else {
            console.log("GAME was ENDED...");
        }
        // TODO: add dark/light theme buttons (icon-sun-o/icon-moon-o)
        const togglePieces = () => {
            var idx = this.CSSindexes[chess_1.variants.indexOf(this.variant)];
            idx += 1;
            idx = idx % chess_1.VARIANTS[this.variant].css.length;
            this.CSSindexes[chess_1.variants.indexOf(this.variant)] = idx;
            localStorage.setItem(this.variant + "_pieces", String(idx));
            this.setPieces(this.mycolor);
        };
        if (this.variant === "shogi" || this.variant === "xiangqi") {
            var container = document.getElementById('btn-pieces');
            patch(container, h_1.h('button', { on: { click: () => togglePieces() }, props: { title: 'Toggle pieces' } }, [h_1.h('i', { class: { "icon": true, "icon-cog": true } }),]));
        }
        var container = document.getElementById('zoom');
        patch(container, h_1.h('input', { class: { "slider": true },
            attrs: { width: '280px', type: 'range', value: Number(localStorage.zoom), min: 60, max: 140 },
            on: { input: (e) => { this.setZoom(parseFloat(e.target.value)); } } }));
        //const onResize = () => {console.log("onResize()");}
        //var elmnt = document.getElementById('cgwrap') as HTMLElement;
        //elmnt.addEventListener("resize", onResize);
        const abort = () => {
            // TODO: disable when ply > 2
            console.log("Abort");
            this.doSend({ type: "abort", gameId: this.model["gameId"] });
        };
        const draw = () => {
            console.log("Draw");
            this.doSend({ type: "draw", gameId: this.model["gameId"] });
        };
        const resign = () => {
            console.log("Resign");
            this.doSend({ type: "resign", gameId: this.model["gameId"] });
        };
        /*
                const disconnect = () => {
                    console.log("Testing socket disconnect...");
                    this.doSend({ type: "disconnect", gameId: this.model["gameId"] });
                }
        */
        var container = document.getElementById('game-controls');
        if (!this.spectator) {
            this.gameControls = patch(container, h_1.h('div.btn-controls', [
                h_1.h('button#abort', { on: { click: () => abort() }, props: { title: 'Abort' } }, [h_1.h('i', { class: { "icon": true, "icon-abort": true } }),]),
                h_1.h('button#draw', { on: { click: () => draw() }, props: { title: "Draw" } }, [h_1.h('i', { class: { "icon": true, "icon-hand-paper-o": true } }),]),
                h_1.h('button#resign', { on: { click: () => resign() }, props: { title: "Resign" } }, [h_1.h('i', { class: { "icon": true, "icon-flag-o": true } }),]),
            ]));
        }
        else {
            this.gameControls = patch(container, h_1.h('div'));
        }
        patch(document.getElementById('movelist'), movelist_1.movelistView(this));
        patch(document.getElementById('roundchat'), chat_1.chatView(this, "roundchat"));
    }
}
exports.default = RoundController;

},{"./chat":31,"./chess":32,"./clock":33,"./gating":35,"./movelist":38,"./pocket":39,"./promotion":41,"./resize":42,"./sound":44,"./user":45,"chessgroundx":4,"chessgroundx/types":16,"chessgroundx/util":17,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25,"sockette":30}],35:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const tovnode_1 = __importDefault(require("snabbdom/tovnode"));
const util_1 = require("chessgroundx/util");
const chess_1 = require("./chess");
const pocket_1 = require("./pocket");
const patch = snabbdom_1.init([class_1.default, attributes_1.default, eventlisteners_1.default]);
function default_1(ctrl) {
    let gating = false;
    var roles = ["hawk", "elephant", ""];
    function start(fen, orig, dest, meta) {
        const ground = ctrl.getGround();
        const gatable = chess_1.canGate(fen, ground.state.pieces[dest], orig, dest, meta);
        if (gatable[0] || gatable[1]) {
            const color = ctrl.mycolor;
            const orientation = ground.state.orientation;
            if (roles.indexOf("hawk") !== -1 && !gatable[0])
                roles.splice(roles.indexOf("hawk"), 1);
            if (roles.indexOf("elephant") !== -1 && !gatable[1])
                roles.splice(roles.indexOf("elephant"), 1);
            var origs = [orig];
            const castling = ground.state.pieces[dest].role === "king" && orig[0] === "e" && dest[0] !== "d" && dest[0] !== "e" && dest[0] !== "f";
            var rookDest = "";
            if (castling) {
                // O-O
                if (dest[0] > "e") {
                    origs.push("h" + orig[1]);
                    rookDest = "e" + orig[1];
                    // O-O-O
                }
                else {
                    origs.push("a" + orig[1]);
                    rookDest = "e" + orig[1];
                }
                ;
            }
            ;
            draw_gating(origs, color, orientation);
            gating = {
                origs: origs,
                dest: dest,
                rookDest: rookDest,
                callback: ctrl.sendMove,
            };
            return true;
        }
        return false;
    }
    ;
    function gate(ctrl, orig, dest, role) {
        const g = ctrl.getGround();
        const color = g.state.pieces[dest].color;
        g.newPiece({ "role": role, "color": color }, orig);
        ctrl.pockets[color === 'white' ? 0 : 1][role]--;
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocket_1.pocketView(ctrl, color, "bottom"));
    }
    function draw_gating(origs, color, orientation) {
        var container = tovnode_1.default(document.querySelector('extension'));
        patch(container, renderGating(origs, color, orientation));
    }
    function draw_no_gating() {
        var container = document.getElementById('extension_choice');
        patch(container, snabbdom_1.h('extension'));
    }
    function finish(role, index) {
        if (gating) {
            draw_no_gating();
            if (role)
                gate(ctrl, gating.origs[index], gating.dest, role);
            else
                index = 0;
            const gated = role ? chess_1.roleToSan[role].toLowerCase() : "";
            if (gating.callback)
                gating.callback(gating.origs[index], index === 0 ? gating.dest : gating.rookDest, gated);
            gating = false;
        }
    }
    ;
    function cancel() {
        return;
    }
    function bind(eventName, f, redraw) {
        return {
            insert(vnode) {
                vnode.elm.addEventListener(eventName, e => {
                    const res = f(e);
                    if (redraw)
                        redraw();
                    return res;
                });
            }
        };
    }
    function renderSquares(orig, color, orientation, index) {
        const firstRankIs0 = false;
        var left = (8 - util_1.key2pos(orig, firstRankIs0)[0]) * 12.5;
        if (orientation === "white")
            left = 87.5 - left;
        return roles.map((serverRole, i) => {
            var top = (color === orientation ? 7 - i : i) * 12.5;
            return snabbdom_1.h("square", {
                attrs: { style: "top: " + top + "%;left: " + left + "%" },
                hook: bind("click", e => {
                    e.stopPropagation();
                    finish(serverRole, index);
                }, false)
            }, [snabbdom_1.h("piece." + serverRole + "." + color)]);
        });
    }
    function renderGating(origs, color, orientation) {
        var vertical = color === orientation ? "top" : "bottom";
        var squares = renderSquares(origs[0], color, orientation, 0);
        if (origs.length > 1)
            squares = squares.concat(renderSquares(origs[1], color, orientation, 1));
        return snabbdom_1.h("div#extension_choice." + vertical, {
            hook: {
                insert: vnode => {
                    const el = vnode.elm;
                    el.addEventListener("click", () => cancel());
                    el.addEventListener("contextmenu", e => {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        }, squares);
    }
    return {
        start,
    };
}
exports.default = default_1;

},{"./chess":32,"./pocket":39,"chessgroundx/util":17,"snabbdom":26,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/tovnode":28}],36:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sockette_1 = __importDefault(require("sockette"));
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const h_1 = __importDefault(require("snabbdom/h"));
const user_1 = require("./user");
const chat_1 = require("./chat");
const chess_1 = require("./chess");
class LobbyController {
    constructor(el, model) {
        this.onMsgGetSeeks = (msg) => {
            this.seeks = msg.seeks;
            // console.log("!!!! got get_seeks msg:", msg);
            const oldVNode = document.getElementById('seeks');
            if (oldVNode instanceof Element) {
                oldVNode.innerHTML = '';
                patch(oldVNode, h_1.default('table#seeks', this.renderSeeks(msg.seeks)));
            }
        };
        this.onMsgNewGame = (msg) => {
            console.log("LobbyController.onMsgNewGame()", this.model["gameId"]);
            window.location.assign(this.model["home"] + '/' + msg["gameId"]);
        };
        this.onMsgUserConnected = (msg) => {
            this.model["username"] = msg["username"];
            user_1.renderUsername(this.model["home"], this.model["username"]);
        };
        this.onMsgChat = (msg) => {
            chat_1.chatMessage(msg.user, msg.message, "lobbychat");
        };
        this.onMsgPing = (msg) => {
            this.doSend({ type: "pong", timestamp: msg.timestamp });
        };
        this.onMsgShutdown = (msg) => {
            alert(msg.message);
        };
        console.log("LobbyController constructor", el, model);
        this.model = model;
        this.challengeAI = false;
        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log("---CONNECTED", evt);
            this.doSend({ type: "lobby_user_connected", username: this.model["username"] });
            this.doSend({ type: "get_seeks" });
        };
        this._ws = { "readyState": -1 };
        const opts = {
            maxAttempts: 20,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in lobby...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => { console.log('Closed!', e); },
            onerror: e => console.log('Error:', e),
        };
        try {
            this.sock = new sockette_1.default("ws://" + location.host + "/wsl", opts);
        }
        catch (err) {
            this.sock = new sockette_1.default("wss://" + location.host + "/wsl", opts);
        }
        // get seeks when we are coming back after a game
        if (this._ws.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        }
        ;
        patch(document.getElementById('seekbuttons'), h_1.default('ul#seekbuttons', this.renderSeekButtons()));
        patch(document.getElementById('lobbychat'), chat_1.chatView(this, "lobbychat"));
    }
    doSend(message) {
        console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }
    createSeekMsg(variant, color, fen, minutes, increment) {
        this.doSend({
            type: "create_seek",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            rated: false,
            color: color
        });
    }
    createBotChallengeMsg(variant, color, fen, minutes, increment, level) {
        this.doSend({
            type: "create_ai_challenge",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            rated: false,
            level: level,
            color: color
        });
    }
    isNewSeek(variant, color, fen, minutes, increment) {
        return !this.seeks.some(seek => {
            return seek.user === this.model["username"] && seek.variant === variant && seek.fen === fen && seek.color === color && seek.tc === minutes + "+" + increment;
        });
    }
    createSeek(color) {
        document.getElementById('id01').style.display = 'none';
        let e;
        e = document.getElementById('variant');
        const variant = e.options[e.selectedIndex].value;
        localStorage.setItem("seek_variant", variant);
        e = document.getElementById('fen');
        const fen = e.value;
        localStorage.setItem("seek_fen", e.value);
        e = document.getElementById('min');
        const minutes = parseInt(e.value);
        localStorage.setItem("seek_min", e.value);
        e = document.getElementById('inc');
        const increment = parseInt(e.value);
        localStorage.setItem("seek_inc", e.value);
        if (this.challengeAI) {
            const form = document.getElementById('ailevel');
            const level = parseInt(form.elements['level'].value);
            localStorage.setItem("seek_level", form.elements['level'].value);
            this.createBotChallengeMsg(variant, color, fen, minutes, increment, level);
        }
        else {
            if (this.isNewSeek(variant, color, fen, minutes, increment)) {
                this.createSeekMsg(variant, color, fen, minutes, increment);
            }
        }
    }
    renderSeekButtons() {
        const setMinutes = (minutes) => {
            var el = document.getElementById("minutes");
            if (el)
                el.innerHTML = minutes;
        };
        const setIncrement = (increment) => {
            var el = document.getElementById("increment");
            if (el)
                el.innerHTML = increment;
        };
        const vIdx = localStorage.seek_variant === undefined ? 0 : chess_1.variants.indexOf(localStorage.seek_variant);
        const vFen = localStorage.seek_fen === undefined ? "" : localStorage.seek_fen;
        const vMin = localStorage.seek_min === undefined ? "5" : localStorage.seek_min;
        const vInc = localStorage.seek_inc === undefined ? "3" : localStorage.seek_inc;
        const vLevel = localStorage.seek_level === undefined ? "1" : localStorage.seek_level;
        return [
            h_1.default('div#id01', { class: { "modal": true } }, [
                h_1.default('form.modal-content', [
                    h_1.default('div#closecontainer', [
                        h_1.default('span.close', { on: { click: () => document.getElementById('id01').style.display = 'none' }, attrs: { 'data-icon': 'j' }, props: { title: "Cancel" } }),
                    ]),
                    h_1.default('div.container', [
                        h_1.default('label', { attrs: { for: "variant" } }, "Variant"),
                        h_1.default('select#variant', { props: { name: "variant" } }, chess_1.variants.map((variant, idx) => h_1.default('option', { props: { value: variant, selected: (idx === vIdx) ? "selected" : "" } }, variant))),
                        h_1.default('label', { attrs: { for: "fen" } }, "Start position"),
                        h_1.default('input#fen', { props: { name: 'fen', placeholder: 'Paste the FEN text here', value: vFen } }),
                        //h('label', { attrs: {for: "tc"} }, "Time Control"),
                        //h('select#timecontrol', { props: {name: "timecontrol"} }, [
                        //    h('option', { props: {value: "1", selected: true} }, "Real time"),
                        //    h('option', { props: {value: "2"} }, "Unlimited"),
                        //]),
                        h_1.default('label', { attrs: { for: "min" } }, "Minutes per side:"),
                        h_1.default('span#minutes'),
                        h_1.default('input#min', { class: { "slider": true },
                            props: { name: "min", type: "range", min: 0, max: 60, value: vMin },
                            on: { input: (e) => setMinutes(e.target.value) },
                            hook: { insert: (vnode) => setMinutes(vnode.elm.value) },
                        }),
                        h_1.default('label', { attrs: { for: "inc" } }, "Increment in seconds:"),
                        h_1.default('span#increment'),
                        h_1.default('input#inc', { class: { "slider": true },
                            props: { name: "inc", type: "range", min: 0, max: 15, value: vInc },
                            on: { input: (e) => setIncrement(e.target.value) },
                            hook: { insert: (vnode) => setIncrement(vnode.elm.value) },
                        }),
                        // if play with the machine
                        // A.I.Level (1-8 buttons)
                        h_1.default('form#ailevel', [
                            h_1.default('h4', "A.I. Level"),
                            h_1.default('div.radio-group', [
                                h_1.default('input#ai1', { props: { type: "radio", name: "level", value: "1", checked: vLevel === "1" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai1', { attrs: { for: "ai1" } }, "1"),
                                h_1.default('input#ai2', { props: { type: "radio", name: "level", value: "2", checked: vLevel === "2" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai2', { attrs: { for: "ai2" } }, "2"),
                                h_1.default('input#ai3', { props: { type: "radio", name: "level", value: "3", checked: vLevel === "3" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai3', { attrs: { for: "ai3" } }, "3"),
                                h_1.default('input#ai4', { props: { type: "radio", name: "level", value: "4", checked: vLevel === "4" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai4', { attrs: { for: "ai4" } }, "4"),
                                h_1.default('input#ai5', { props: { type: "radio", name: "level", value: "5", checked: vLevel === "5" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai5', { attrs: { for: "ai5" } }, "5"),
                                h_1.default('input#ai6', { props: { type: "radio", name: "level", value: "6", checked: vLevel === "6" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai6', { attrs: { for: "ai6" } }, "6"),
                                h_1.default('input#ai7', { props: { type: "radio", name: "level", value: "7", checked: vLevel === "7" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai7', { attrs: { for: "ai7" } }, "7"),
                                h_1.default('input#ai8', { props: { type: "radio", name: "level", value: "8", checked: vLevel === "8" ? "checked" : "" } }),
                                h_1.default('label.level-ai.ai8', { attrs: { for: "ai8" } }, "8"),
                            ]),
                        ]),
                        h_1.default('div.button-group', [
                            h_1.default('button.icon.icon-black', { props: { type: "button", title: "Black" }, on: { click: () => this.createSeek('b') } }),
                            h_1.default('button.icon.icon-adjust', { props: { type: "button", title: "Random" }, on: { click: () => this.createSeek('r') } }),
                            h_1.default('button.icon.icon-white', { props: { type: "button", title: "White" }, on: { click: () => this.createSeek('w') } }),
                        ]),
                    ]),
                ]),
            ]),
            h_1.default('button', { class: { 'lobby-button': true }, on: {
                    click: () => {
                        this.challengeAI = false;
                        document.getElementById('ailevel').style.display = 'none';
                        document.getElementById('id01').style.display = 'block';
                    }
                } }, "Create a game"),
            h_1.default('button', { class: { 'lobby-button': true }, on: {
                    click: () => {
                        this.challengeAI = true;
                        document.getElementById('ailevel').style.display = 'inline-block';
                        document.getElementById('id01').style.display = 'block';
                    }
                } }, "Play with the machine"),
        ];
    }
    onClickSeek(seek) {
        if (seek["user"] === this.model["username"]) {
            this.doSend({ type: "delete_seek", seekID: seek["seekID"], player: this.model["username"] });
        }
        else {
            this.doSend({ type: "accept_seek", seekID: seek["seekID"], player: this.model["username"] });
        }
    }
    renderSeeks(seeks) {
        // TODO: fix header and data row colomns
        // https://stackoverflow.com/questions/37272331/html-table-with-fixed-header-and-footer-and-scrollable-body-without-fixed-widths
        const header = h_1.default('thead', [h_1.default('tr', [h_1.default('th', 'Player'),
                h_1.default('th', 'Color'),
                h_1.default('th', 'Rating'),
                h_1.default('th', 'Time'),
                h_1.default('th', '    '),
                h_1.default('th', 'Variant'),
                h_1.default('th', 'Mode')])]);
        const colorIcon = (color) => { return h_1.default('i', { attrs: { "data-icon": color === "w" ? "c" : color === "b" ? "b" : "a" } }); };
        var rows = seeks.map((seek) => h_1.default('tr', { on: { click: () => this.onClickSeek(seek) } }, [h_1.default('td', seek["user"]),
            h_1.default('td', [colorIcon(seek["color"])]),
            h_1.default('td', '1500?'),
            h_1.default('td', seek["tc"]),
            h_1.default('td', { attrs: { "data-icon": chess_1.VARIANTS[seek["variant"]].icon }, class: { "icon": true } }),
            h_1.default('td', seek["variant"]),
            h_1.default('td', seek["rated"])]));
        return [header, h_1.default('tbody', rows)];
    }
    onMessage(evt) {
        console.log("<+++ lobby onMessage():", evt.data);
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "get_seeks":
                this.onMsgGetSeeks(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "lobby_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "lobbychat":
                this.onMsgChat(msg);
                break;
            case "ping":
                this.onMsgPing(msg);
                break;
            case "shutdown":
                this.onMsgShutdown(msg);
                break;
        }
    }
}
function runSeeks(vnode, model) {
    const el = vnode.elm;
    const ctrl = new LobbyController(el, model);
    console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}
function lobbyView(model) {
    // Get the modal
    const modal = document.getElementById('id01');
    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };
    return [h_1.default('aside.sidebar-first', [h_1.default('div.lobbychat#lobbychat')]),
        h_1.default('main.main', [h_1.default('table#seeks', { hook: { insert: (vnode) => runSeeks(vnode, model) } })]),
        h_1.default('aside.sidebar-second', [h_1.default('ul#seekbuttons')]),
        h_1.default('under-left', "# of users"),
        h_1.default('under-lobby'),
        h_1.default('under-right'),
    ];
}
exports.lobbyView = lobbyView;

},{"./chat":31,"./chess":32,"./user":45,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25,"sockette":30}],37:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const h_1 = __importDefault(require("snabbdom/h"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const lobby_1 = require("./lobby");
const round_1 = require("./round");
const profile_1 = require("./profile");
const model = { home: "", username: "", anon: "", variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "", profileid: "", status: "" };
var getCookie = function (name) {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; ++i) {
        var pair = cookies[i].trim().split('=');
        if (pair[0] == name)
            return pair[1];
    }
    return "";
};
function view(model) {
    const user = getCookie("user");
    if (user !== "")
        model["username"] = user;
    var el = document.getElementById('pychess-variants');
    if (el instanceof Element && el.hasAttribute("data-home")) {
        model["home"] = el.getAttribute("data-home");
        model["anon"] = el.getAttribute("data-anon");
    }
    if (el instanceof Element && el.hasAttribute("data-variant")) {
        const variant = el.getAttribute("data-variant");
        console.log("site.view() data-variant=", variant);
        if (variant) {
            model["variant"] = variant;
            model["username"] = user !== "" ? user : el.getAttribute("data-username");
            model["gameId"] = el.getAttribute("data-gameid");
            model["wplayer"] = el.getAttribute("data-wplayer");
            model["bplayer"] = el.getAttribute("data-bplayer");
            model["fen"] = el.getAttribute("data-fen");
            model["base"] = el.getAttribute("data-base");
            model["inc"] = el.getAttribute("data-inc");
            model["status"] = el.getAttribute("data-status");
            model["tv"] = el.getAttribute("data-tv");
        }
        ;
        if (el instanceof Element && el.hasAttribute("data-profileid")) {
            model["profileid"] = el.getAttribute("data-profileid");
        }
    }
    if (model.profileid) {
        return h_1.default('div#placeholder.profile-wrapper', profile_1.profileView(model));
    }
    else {
        return h_1.default('div#placeholder.main-wrapper', model.variant ? round_1.roundView(model) : lobby_1.lobbyView(model));
    }
}
exports.view = view;
patch(document.getElementById('placeholder'), view(model));

},{"./lobby":36,"./profile":40,"./round":43,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],38:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const h_1 = __importDefault(require("snabbdom/h"));
const pocket_1 = require("./pocket");
const chess_1 = require("./chess");
function selectMove(ctrl, ply) {
    const active = document.querySelector('li.move.active');
    if (active)
        active.classList.remove('active');
    const elPly = document.querySelector(`li.move[ply="${ply}"]`);
    if (elPly)
        elPly.classList.add('active');
    ctrl.goPly(ply);
    scrollToPly(ctrl);
}
function scrollToPly(ctrl) {
    if (ctrl.steps.length < 9)
        return;
    const movesEl = document.getElementById('moves');
    let st = undefined;
    const plyEl = movesEl.querySelector('li.move.active');
    if (ctrl.ply == 0)
        st = 0;
    else if (ctrl.ply == ctrl.steps.length - 1)
        st = 99999;
    else {
        if (plyEl)
            st = plyEl.offsetTop - movesEl.offsetHeight + plyEl.offsetHeight;
    }
    console.log("scrollToPly", ctrl.ply, st);
    if (typeof st == 'number') {
        if (st == 0 || st == 99999)
            movesEl.scrollTop = st;
        else if (plyEl) {
            var isSmoothScrollSupported = 'scrollBehavior' in document.documentElement.style;
            if (isSmoothScrollSupported) {
                plyEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            else {
                plyEl.scrollIntoView(false);
            }
        }
    }
}
// flip
// TODO: players, clocks
function toggleOrientation(ctrl) {
    ctrl.flip = !ctrl.flip;
    ctrl.chessground.toggleOrientation();
    if (ctrl.variant === "shogi") {
        const color = ctrl.chessground.state.orientation === "white" ? "white" : "black";
        ctrl.setPieces(color);
    }
    ;
    const name_tmp = ctrl.players[0];
    ctrl.players[0] = ctrl.players[1];
    ctrl.players[1] = name_tmp;
    console.log("FLIP");
    if (chess_1.needPockets(ctrl.variant)) {
        const tmp = ctrl.pockets[0];
        ctrl.pockets[0] = ctrl.pockets[1];
        ctrl.pockets[1] = tmp;
        ctrl.vpocket0 = patch(ctrl.vpocket0, pocket_1.pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocket_1.pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }
}
function movelistView(ctrl) {
    var container = document.getElementById('move-controls');
    ctrl.moveControls = patch(container, h_1.default('div.btn-controls', [
        h_1.default('button#flip-board', { on: { click: () => toggleOrientation(ctrl) } }, [h_1.default('i', { props: { title: 'Flip board' }, class: { "icon": true, "icon-refresh": true } }),]),
        h_1.default('button#fastbackward', { on: { click: () => selectMove(ctrl, 0) } }, [h_1.default('i', { class: { "icon": true, "icon-fast-backward": true } }),]),
        h_1.default('button#stepbackward', { on: { click: () => selectMove(ctrl, Math.max(ctrl.ply - 1, 0)) } }, [h_1.default('i', { class: { "icon": true, "icon-step-backward": true } }),]),
        h_1.default('button#stepforward', { on: { click: () => selectMove(ctrl, Math.min(ctrl.ply + 1, ctrl.steps.length - 1)) } }, [h_1.default('i', { class: { "icon": true, "icon-step-forward": true } }),]),
        h_1.default('button#fastforward', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [h_1.default('i', { class: { "icon": true, "icon-fast-forward": true } }),]),
    ]));
    return h_1.default('div#moves', [h_1.default('ol.movelist#movelist')]);
}
exports.movelistView = movelistView;
function updateMovelist(ctrl) {
    var container = document.getElementById('movelist');
    const ply = ctrl.steps.length - 1;
    const move = ctrl.steps[ply]['san'];
    const active = document.querySelector('li.move.active');
    if (active)
        active.classList.remove('active');
    const el = h_1.default('li.move', { class: { active: true }, attrs: { ply: ply }, on: { click: () => selectMove(ctrl, ply) } }, move);
    if (ply % 2 == 0) {
        patch(container, h_1.default('ol.movelist#movelist', [el]));
    }
    else {
        patch(container, h_1.default('ol.movelist#movelist', [h_1.default('li.move.counter', (ply + 1) / 2), el]));
    }
    scrollToPly(ctrl);
}
exports.updateMovelist = updateMovelist;

},{"./chess":32,"./pocket":39,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],39:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const drag_1 = require("chessgroundx/drag");
const chess_1 = require("./chess");
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const eventNames = ['mousedown', 'touchstart'];
function pocketView(ctrl, color, position) {
    const pocket = ctrl.pockets[position === 'top' ? 0 : 1];
    const pieceRoles = Object.keys(pocket);
    return snabbdom_1.h('div.pocket.' + position, {
        class: { usable: true },
        hook: {
            insert: vnode => {
                eventNames.forEach(name => {
                    vnode.elm.addEventListener(name, (e) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom'))
                            drag(ctrl, e);
                    });
                });
            }
        }
    }, pieceRoles.map(role => {
        let nb = pocket[role] || 0;
        return snabbdom_1.h('piece.' + role + '.' + color, {
            attrs: {
                'data-role': role,
                'data-color': color,
                'data-nb': nb,
            }
        });
    }));
}
exports.pocketView = pocketView;
function drag(ctrl, e) {
    if (e.button !== undefined && e.button !== 0)
        return; // only touch or left click
    const el = e.target, role = el.getAttribute('data-role'), color = el.getAttribute('data-color'), number = el.getAttribute('data-nb');
    if (!role || !color || number === '0')
        return;
    if (ctrl.clickDrop !== undefined && role === ctrl.clickDrop.role) {
        ctrl.clickDrop = undefined;
        ctrl.chessground.selectSquare(null);
        return;
    }
    // Show possible drop dests on my turn only not to mess up predrop
    if (ctrl.turnColor === ctrl.mycolor) {
        const dropDests = { "a0": ctrl.dests[chess_1.roleToSan[role] + "@"] };
        ctrl.chessground.newPiece({ "role": role, "color": color }, "a0");
        ctrl.chessground.set({
            turnColor: color,
            movable: {
                dests: dropDests,
                showDests: true,
            },
        });
        ctrl.chessground.selectSquare("a0");
        ctrl.chessground.set({ lastMove: ctrl.lastmove });
    }
    e.stopPropagation();
    e.preventDefault();
    drag_1.dragNewPiece(ctrl.chessground.state, { color, role }, e);
}
exports.drag = drag;
function dropIsValid(dests, role, key) {
    // console.log("dropDests:", dests, role, key)
    const drops = dests[chess_1.roleToSan[role] + "@"];
    // console.log("drops:", drops)
    if (drops === undefined || drops === null)
        return false;
    return drops.indexOf(key) !== -1;
}
exports.dropIsValid = dropIsValid;
// TODO: afre 1 move made only 1 pocket update needed at once, no need to update both
function updatePockets(ctrl, vpocket0, vpocket1) {
    // update pockets from fen
    if (chess_1.needPockets(ctrl.variant)) {
        const parts = ctrl.fullfen.split(" ");
        const fen_placement = parts[0];
        var pockets = "";
        const bracketPos = fen_placement.indexOf("[");
        if (bracketPos !== -1) {
            pockets = fen_placement.slice(bracketPos);
        }
        const c = ctrl.mycolor[0];
        const o = ctrl.oppcolor[0];
        const roles = chess_1.pocketRoles(ctrl.variant);
        var po = {};
        var pc = {};
        roles.forEach(role => pc[role] = chess_1.lc(pockets, chess_1.roleToSan[role].toLowerCase(), c === (ctrl.variant === 'shogi' ? 'b' : 'w')));
        roles.forEach(role => po[role] = chess_1.lc(pockets, chess_1.roleToSan[role].toLowerCase(), o === (ctrl.variant === 'shogi' ? 'b' : 'w')));
        if (ctrl.flip) {
            ctrl.pockets = [pc, po];
        }
        else {
            ctrl.pockets = [po, pc];
        }
        console.log(o, c, po, pc);
        ctrl.vpocket0 = patch(vpocket0, pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(vpocket1, pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }
}
exports.updatePockets = updatePockets;

},{"./chess":32,"chessgroundx/drag":6,"snabbdom":26,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],40:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const h_1 = __importDefault(require("snabbdom/h"));
const chessgroundx_1 = require("chessgroundx");
const user_1 = require("./user");
const chess_1 = require("./chess");
// TODO: save FEN and lastmove to db and reuse them in miniboards
function renderGames(model, games) {
    const header = h_1.default('thead', [h_1.default('tr', [h_1.default('th', model["profileid"]),])]);
    var rows = games.map((game) => h_1.default('tr', { on: { click: () => { window.location.assign(model["home"] + '/' + game["_id"]); } },
    }, [
        h_1.default('td.board', [
            h_1.default('selection.' + chess_1.VARIANTS[game["v"]].board + '.' + chess_1.VARIANTS[game["v"]].pieces, [
                h_1.default('div.cg-wrap.' + chess_1.VARIANTS[game["v"]].cg + '.mini', { hook: {
                        insert: (vnode) => {
                            chessgroundx_1.Chessground(vnode.elm, {
                                coordinates: false,
                                viewOnly: true,
                                fen: game["f"],
                                geometry: chess_1.VARIANTS[game["v"]].geom
                            });
                        }
                    } }),
            ]),
        ]),
        h_1.default('td.games-info', [
            h_1.default('div', [
                h_1.default('i-variant', { attrs: { "data-icon": chess_1.VARIANTS[game["v"]].icon }, class: { "icon": true } }),
                h_1.default('tc', game["b"] + "+" + game["i"] + " • Casual • " + game["v"])
            ]),
            h_1.default('div', [
                h_1.default('player', [
                    h_1.default('a.user-link', { attrs: { href: '/@/' + game["us"][0] } }, game["us"][0]),
                ]),
                h_1.default('vs', '-'),
                h_1.default('player', [
                    h_1.default('a.user-link', { attrs: { href: '/@/' + game["us"][1] } }, game["us"][1]),
                ]),
            ]),
            h_1.default('div', game["d"]),
        ])
    ]));
    return [header, h_1.default('tbody', rows)];
}
function profileView(model) {
    user_1.renderUsername(model["home"], model["username"]);
    var xmlhttp = new XMLHttpRequest();
    var url = model["home"] + "/api/" + model["profileid"] + "/games";
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            var myArr = JSON.parse(this.responseText);
            myFunction(myArr);
        }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
    function myFunction(arr) {
        const oldVNode = document.getElementById('games');
        console.log(arr);
        if (oldVNode instanceof Element) {
            patch(oldVNode, h_1.default('table#games', renderGames(model, arr)));
        }
    }
    console.log(model);
    return [h_1.default('aside.sidebar-first'),
        h_1.default('main.main', [h_1.default('table#games')]),
        h_1.default('aside.sidebar-second'),
    ];
}
exports.profileView = profileView;

},{"./chess":32,"./user":45,"chessgroundx":4,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],41:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const tovnode_1 = __importDefault(require("snabbdom/tovnode"));
const util_1 = require("chessgroundx/util");
const chess_1 = require("./chess");
const patch = snabbdom_1.init([class_1.default, attributes_1.default, eventlisteners_1.default]);
function default_1(ctrl) {
    let promoting = false;
    let roles = [];
    function start(orig, dest, meta) {
        const ground = ctrl.getGround();
        if (chess_1.isPromotion(ctrl.variant, ground.state.pieces[dest], orig, dest, meta)) {
            const color = ctrl.mycolor;
            const orientation = ground.state.orientation;
            const movingRole = ground.state.pieces[dest].role;
            roles = chess_1.promotionRoles(ctrl.variant, movingRole);
            switch (ctrl.variant) {
                case "shogi":
                    if (chess_1.mandatoryPromotion(movingRole, dest, color)) {
                        promote(ground, dest, 'p' + ground.state.pieces[dest].role);
                        ctrl.sendMove(orig, dest, '+');
                    }
                    else {
                        draw_promo(dest, color, orientation);
                        promoting = {
                            orig: orig,
                            dest: dest,
                            callback: ctrl.sendMove,
                        };
                    }
                    ;
                    break;
                case 'makruk':
                    promote(ground, dest, 'met');
                    ctrl.sendMove(orig, dest, 'm');
                    break;
                case 'sittuyin':
                    promote(ground, dest, 'ferz');
                    ctrl.sendMove(orig, dest, 'f');
                    break;
                default:
                    draw_promo(dest, color, orientation);
                    promoting = {
                        orig: orig,
                        dest: dest,
                        callback: ctrl.sendMove,
                    };
            }
            ;
            return true;
        }
        return false;
    }
    ;
    function promote(g, key, role) {
        var pieces = {};
        var piece = g.state.pieces[key];
        if (g.state.pieces[key].role === role) {
            return false;
        }
        else {
            pieces[key] = {
                color: piece.color,
                role: role,
                promoted: true
            };
            g.setPieces(pieces);
            return true;
        }
    }
    function draw_promo(dest, color, orientation) {
        var container = tovnode_1.default(document.querySelector('extension'));
        patch(container, renderPromotion(dest, color, orientation));
    }
    function draw_no_promo() {
        var container = document.getElementById('extension_choice');
        patch(container, snabbdom_1.h('extension'));
    }
    function finish(role) {
        if (promoting) {
            draw_no_promo();
            const promoted = promote(ctrl.getGround(), promoting.dest, role);
            const promo = ctrl.variant === "shogi" ? promoted ? "+" : "" : chess_1.roleToSan[role].toLowerCase();
            if (promoting.callback)
                promoting.callback(promoting.orig, promoting.dest, promo);
            promoting = false;
        }
    }
    ;
    function cancel() {
        return;
    }
    function bind(eventName, f, redraw) {
        return {
            insert(vnode) {
                vnode.elm.addEventListener(eventName, e => {
                    const res = f(e);
                    if (redraw)
                        redraw();
                    return res;
                });
            }
        };
    }
    function renderPromotion(dest, color, orientation) {
        const dim = ctrl.getGround().state.dimensions;
        const firstRankIs0 = dim.height === 10;
        var left = (dim.width - util_1.key2pos(dest, firstRankIs0)[0]) * (100 / dim.width);
        if (orientation === "white")
            left = (100 / dim.width) * (dim.width - 1) - left;
        var vertical = color === orientation ? "top" : "bottom";
        return snabbdom_1.h("div#extension_choice." + vertical, {
            hook: {
                insert: vnode => {
                    const el = vnode.elm;
                    el.addEventListener("click", () => cancel());
                    el.addEventListener("contextmenu", e => {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        }, roles.map((serverRole, i) => {
            var top = (color === orientation ? i : dim.height - 1 - i) * (100 / dim.height);
            return snabbdom_1.h("square", {
                attrs: { style: "top: " + top + "%;left: " + left + "%" },
                hook: bind("click", e => {
                    e.stopPropagation();
                    finish(serverRole);
                }, false)
            }, [snabbdom_1.h("piece." + serverRole + "." + color)]);
        }));
    }
    return {
        start,
    };
}
exports.default = default_1;

},{"./chess":32,"chessgroundx/util":17,"snabbdom":26,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/tovnode":28}],42:[function(require,module,exports){
"use strict";
// http://jsfiddle.net/MissoulaLorenzo/gfn6ob3j/
// https://github.com/ornicar/lila/blob/master/ui/common/src/resize.ts
Object.defineProperty(exports, "__esModule", { value: true });
//export default function resizeHandle(els: cg.Elements, pref: number, ply: number) {
function resizeHandle(els) {
    //  if (!pref) return;
    if (true)
        return;
    const el = document.createElement('cg-resize');
    els.container.appendChild(el);
    const mousemoveEvent = 'mousemove';
    const mouseupEvent = 'mouseup';
    el.addEventListener('mousedown', (start) => {
        start.preventDefault();
        const startPos = eventPosition(start);
        const initialZoom = 100; //parseInt(getComputedStyle(document.body).getPropertyValue('--zoom'));
        let zoom = initialZoom;
        /*
            const saveZoom = window.lichess.debounce(() => {
              $.ajax({ method: 'post', url: '/pref/zoom?v=' + (100 + zoom) });
            }, 700);
        */
        const setZoom = (zoom) => {
            const el = document.querySelector('.cg-wrap');
            if (el) {
                //            const baseWidth = dimensions[VARIANTS[this.variant].geom].width * (this.variant === "shogi" ? 52 : 64);
                //            const baseHeight = dimensions[VARIANTS[this.variant].geom].height * (this.variant === "shogi" ? 60 : 64);
                const baseWidth = parseInt(document.defaultView.getComputedStyle(el).width || '', 10);
                const baseHeight = parseInt(document.defaultView.getComputedStyle(el).height || '', 10);
                console.log(baseWidth, baseHeight, zoom);
                const pxw = `${zoom / 100 * baseWidth}px`;
                const pxh = `${zoom / 100 * baseHeight}px`;
                el.style.width = pxw;
                el.style.height = pxh;
                const ev = document.createEvent('Event');
                ev.initEvent('chessground.resize', false, false);
                document.body.dispatchEvent(ev);
            }
        };
        const resize = (move) => {
            const pos = eventPosition(move);
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
exports.default = resizeHandle;
function eventPosition(e) {
    if (e.clientX || e.clientX === 0)
        return [e.clientX, e.clientY];
    if (e.touches && e.targetTouches[0])
        return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
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

},{}],43:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const ctrl_1 = __importDefault(require("./ctrl"));
const chess_1 = require("./chess");
function runGround(vnode, model) {
    const el = vnode.elm;
    const ctrl = new ctrl_1.default(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}
function roundView(model) {
    var playerTop, playerBottom, dataIcon;
    dataIcon = chess_1.VARIANTS[model["variant"]].icon;
    if (model["username"] !== model["wplayer"] && model["username"] !== model["bplayer"]) {
        // spectator game view
        playerTop = model["variant"] === 'shogi' ? model["wplayer"] : model["bplayer"];
        playerBottom = model["variant"] === 'shogi' ? model["bplayer"] : model["wplayer"];
    }
    else {
        playerTop = model["username"] === model["wplayer"] ? model["bplayer"] : model["wplayer"];
        playerBottom = model["username"];
    }
    return [snabbdom_1.h('aside.sidebar-first', [
            snabbdom_1.h('div.game-info', [
                snabbdom_1.h('div', [
                    snabbdom_1.h('i-variant', { attrs: { "data-icon": dataIcon }, class: { "icon": true } }),
                    snabbdom_1.h('tc', model["base"] + "+" + model["inc"] + " • Casual • " + model["variant"])
                ]),
                snabbdom_1.h('div', [
                    snabbdom_1.h('i-side', { class: { "icon": true, "icon-white": true } }),
                    snabbdom_1.h('player', [
                        snabbdom_1.h('a.user-link', { attrs: { href: '/@/' + model["wplayer"] } }, model["wplayer"]),
                        snabbdom_1.h('rating', " (1500?)"),
                    ]),
                ]),
                snabbdom_1.h('div', [
                    snabbdom_1.h('i-side', { class: { "icon": true, "icon-black": true } }),
                    snabbdom_1.h('player', [
                        snabbdom_1.h('a.user-link', { attrs: { href: '/@/' + model["bplayer"] } }, model["bplayer"]),
                        snabbdom_1.h('rating', " (1500?)"),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div.roundchat#roundchat'),
        ]),
        snabbdom_1.h('main.main', [
            snabbdom_1.h('selection.' + chess_1.VARIANTS[model["variant"]].board + '.' + chess_1.VARIANTS[model["variant"]].pieces, [
                snabbdom_1.h('div.cg-wrap.' + chess_1.VARIANTS[model["variant"]].cg, { hook: { insert: (vnode) => runGround(vnode, model) },
                }),
            ]),
        ]),
        snabbdom_1.h('aside.sidebar-second', [
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h('div.' + chess_1.VARIANTS[model["variant"]].pieces, [
                    snabbdom_1.h('div.cg-wrap.pocket', [
                        snabbdom_1.h('div#pocket0'),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#clock0'),
            snabbdom_1.h('div.round-data', [
                snabbdom_1.h('div.player-data', [
                    snabbdom_1.h('i-side.online#top-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }),
                    snabbdom_1.h('player', [
                        snabbdom_1.h('a.user-link', { attrs: { href: '/@/' + playerTop } }, playerTop),
                        snabbdom_1.h('rating', "1500?"),
                    ]),
                ]),
                snabbdom_1.h('div#move-controls'),
                snabbdom_1.h('div#movelist'),
                snabbdom_1.h('div#after-game'),
                snabbdom_1.h('div#game-controls'),
                snabbdom_1.h('div.player-data', [
                    snabbdom_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }),
                    snabbdom_1.h('player', [
                        snabbdom_1.h('a.user-link', { attrs: { href: '/@/' + playerBottom } }, playerBottom),
                        snabbdom_1.h('rating', "1500?"),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#clock1'),
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h('div.' + chess_1.VARIANTS[model["variant"]].pieces, [
                    snabbdom_1.h('div.cg-wrap.pocket', [
                        snabbdom_1.h('div#pocket1'),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#flip'),
        ]),
        snabbdom_1.h('under-left', "Spectators"),
        snabbdom_1.h('under-board', [snabbdom_1.h('div.#under-board')]),
        snabbdom_1.h('under-right', [snabbdom_1.h('div#zoom')]),
    ];
}
exports.roundView = roundView;

},{"./chess":32,"./ctrl":34,"snabbdom":26}],44:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class sounds {
    constructor() {
        this.buildManySounds = (file, qty) => {
            var soundArray = [];
            while (soundArray.length < qty) {
                var el = document.createElement("audio");
                if (el.canPlayType('audio/mpeg')) {
                    el.src = '/static/sound/' + file + '.mp3';
                }
                else {
                    el.src = '/static/sound/' + file + '.ogg';
                }
                el.setAttribute("preload", "auto");
                el.style.display = "none";
                soundArray.push(el);
                document.body.appendChild(el);
            }
            return soundArray;
        };
        this.getSound = (type) => {
            let target = this.tracks[type];
            target.index = (target.index + 1) % target.pool.length;
            // console.log("SOUND:", type, target.index);
            return target.pool[target.index];
        };
        this.tracks = {
            GenericNotify: { name: 'GenericNotify', qty: 1, pool: [], index: 0 },
            Move: { name: 'Move', qty: 8, pool: [], index: 0 },
            Capture: { name: 'Capture', qty: 4, pool: [], index: 0 },
            Check: { name: 'Check', qty: 2, pool: [], index: 0 },
            Draw: { name: 'Draw', qty: 1, pool: [], index: 0 },
            Victory: { name: 'Victory', qty: 1, pool: [], index: 0 },
            Defeat: { name: 'Defeat', qty: 1, pool: [], index: 0 },
            ShogiMove: { name: 'komaoto5', qty: 8, pool: [], index: 0 },
        };
        Object.keys(this.tracks).forEach(key => {
            let type = this.tracks[key];
            type.pool = this.buildManySounds(type.name, type.qty);
        });
    }
    genericNotify() { this.getSound('GenericNotify').play(); }
    ;
    move() { this.getSound('Move').play(); }
    ;
    capture() { this.getSound('Capture').play(); }
    ;
    check() { this.getSound('Check').play(); }
    ;
    draw() { this.getSound('Draw').play(); }
    ;
    victory() { this.getSound('Victory').play(); }
    ;
    defeat() { this.getSound('Defeat').play(); }
    ;
    shogimove() { this.getSound('ShogiMove').play(); }
    ;
}
exports.sound = new (sounds);
function changeCSS(cssFile) {
    // css file index in template.html
    var cssLinkIndex = 1;
    if (cssFile.includes("xiangqi")) {
        cssLinkIndex = 3;
    }
    else if (cssFile.includes("shogi")) {
        cssLinkIndex = 2;
    }
    document.getElementsByTagName("link").item(cssLinkIndex).setAttribute("href", cssFile);
}
exports.changeCSS = changeCSS;

},{}],45:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const class_1 = __importDefault(require("snabbdom/modules/class"));
const attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
const props_1 = __importDefault(require("snabbdom/modules/props"));
const eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
const patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
const h_1 = __importDefault(require("snabbdom/h"));
// TODO: create logout button when logged in
/*
function login(home) {
    console.log("LOGIN WITH LICHESS");
    window.location.assign(home + '/login');
};
*/
function renderUsername(home, username) {
    console.log("renderUsername()", username, home);
    var oldVNode = document.getElementById('username');
    if (oldVNode instanceof Element) {
        oldVNode.innerHTML = '';
        patch(oldVNode, h_1.default('div#username', h_1.default('a.nav-link', { attrs: { href: '/@/' + username } }, username)));
    }
    ;
    /*
        // if username is not a logged in name login else logout button
        var oldVNode = document.getElementById('login');
        if (oldVNode instanceof Element) {
            oldVNode.innerHTML = '';
            patch(oldVNode as HTMLElement, h('button', { on: { click: () => login(home) }, props: {title: 'Login with Lichess'} }, [h('i', {class: {"icon": true, "icon-sign-in": true} } ), ]));
        };
    */
}
exports.renderUsername = renderUsername;

},{"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}]},{},[37])(37)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FuaW0uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FwaS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvYm9hcmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2NoZXNzZ3JvdW5kLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9jb25maWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYXcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2Ryb3AuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2V2ZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvZXhwbG9zaW9uLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9mZW4uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3ByZW1vdmUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3JlbmRlci5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvc3RhdGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3N2Zy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvdHlwZXMuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3V0aWwuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3dyYXAuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vaC5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9odG1sZG9tYXBpLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL2lzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL2NsYXNzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vbW9kdWxlcy9wcm9wcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9zbmFiYmRvbS5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90aHVuay5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90b3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NvY2tldHRlL2Rpc3Qvc29ja2V0dGUuanMiLCJzcmMvY2hhdC50cyIsInNyYy9jaGVzcy50cyIsInNyYy9jbG9jay50cyIsInNyYy9jdHJsLnRzIiwic3JjL2dhdGluZy50cyIsInNyYy9sb2JieS50cyIsInNyYy9tYWluLnRzIiwic3JjL21vdmVsaXN0LnRzIiwic3JjL3BvY2tldC50cyIsInNyYy9wcm9maWxlLnRzIiwic3JjL3Byb21vdGlvbi50cyIsInNyYy9yZXNpemUudHMiLCJzcmMvcm91bmQudHMiLCJzcmMvc291bmQudHMiLCJzcmMvdXNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3hEQSx1Q0FBZ0M7QUFDaEMsbUVBQTJDO0FBQzNDLDZFQUFxRDtBQUNyRCxtRUFBZ0Q7QUFDaEQscUZBQXdEO0FBRXhELE1BQU0sS0FBSyxHQUFHLGVBQUksQ0FBQyxDQUFDLGVBQUssRUFBRSxvQkFBVSxFQUFFLGVBQVUsRUFBRSx3QkFBUyxDQUFDLENBQUMsQ0FBQztBQUUvRCxtREFBMkI7QUFFM0IsU0FBZ0IsUUFBUSxDQUFFLElBQUksRUFBRSxRQUFRO0lBQ3BDLFNBQVMsVUFBVSxDQUFFLENBQUM7UUFDbEIsTUFBTSxPQUFPLEdBQUksQ0FBQyxDQUFDLE1BQTJCLENBQUMsS0FBSyxDQUFBO1FBQ3BELElBQUksQ0FBQyxDQUFD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QUFDLENBQUE7UUFDMUQsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO0tBQzdEO1NBQU07UUFDSCxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUE7UUFDMUQsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO1FBQzFELEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQTtRQUMxRCxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUE7S0FDN0Q7SUFDRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQWJELDBCQWFDO0FBRVksUUFBQSxTQUFTLEdBQUc7SUFDckIsSUFBSSxFQUFFLEdBQUc7SUFDVCxNQUFNLEVBQUUsR0FBRztJQUNYLE1BQU0sRUFBRSxHQUFHO0lBQ1gsSUFBSSxFQUFFLEdBQUc7SUFDVCxLQUFLLEVBQUUsR0FBRztJQUNWLElBQUksRUFBRSxHQUFHO0lBQ1QsVUFBVSxFQUFFLEdBQUc7SUFDZixTQUFTLEVBQUUsR0FBRztJQUNkLFFBQVEsRUFBRSxHQUFHO0lBQ2IsSUFBSSxFQUFFLEdBQUc7SUFDVCxJQUFJLEVBQUUsR0FBRztJQUNULEdBQUcsRUFBRSxHQUFHO0lBQ1IsSUFBSSxFQUFFLEdB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Q0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUM7Z0NBQ2hILFdBQUMsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztnQ0FDckQsV0FBQyxDQUFDLFdBQVcsRUFB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QixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2xELElBQUksT0FBTyxFQUFFO1lBQ1QsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUMzQixLQUFLLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzFFLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2pELEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ25ELEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ25ELEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzNDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzdDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzNDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2pELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1NBQzVDO1FBQUEsQ0FBQztRQUNOLElBQUksRUFBRSxZQUFZLE9BQU8sSUFBSSxFQUFFLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEVBQUU7WUFDNUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztTQUMxRDtLQUNBO0lBQ0QsSUFBSSxL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QUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUE7UUF2Q0csSUFBSSxDQUFDLE1BQU0sR0FBRztZQUNWLGFBQWEsRUFBRSxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsR0FBRyxFQUFHLENBQUMsRUFBRSxJQUFJLEVBQUcsRUFBRSxFQUFFLEtBQUssRUFBRyxDQUFDLEVBQUM7WUFDdEUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUcsQ0FBQyxFQUFFLElBQUksRUFBRyxFQUFFLEVBQUUsS0FBSyxFQUFHLENBQUMsRUFBQztZQUNwRCxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRyxDQUFDLEVBQUUsSUFBSSxFQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUcsQ0FBQyxFQUFDO1lBQzFELEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFHLENBQUMsRUFBRSxJQUFJLEVBQUcsRUFBRSxFQUFFLEtBQUssRUFBRyxDQUFDLEVBQUM7WUFDdEQsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUcsQ0FBQyxFQUFFLElBQUksRUFBRyxFQUFFLEVBQUUsS0FBSyxFQUFHLENBQUMsRUFBQztZQUNwRCxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRyxDQUFDLEVBQUUsSUFBSSxFQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUcsQ0FBQyxFQUFDO1lBQzFELE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFHLENBQUMsRUFBRSxJQUFJLEVBQUcsRUFBRSxFQUFFLEtBQUssRUFBRyxDQUFDLEVBQUM7WUFDeEQsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUcsQ0FBQyxFQUFFLElBQUksRUFBRyxFQUFFLEVBQUUsS0FBSyxFQUFHLENBQUMsRUFBQztTQUNoRSxDQUFBO1FBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ25DLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDNUIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFELENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQTBCRCxhQUFhLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFBQSxDQUFDO0lBQzNELElBQUksS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUFBLENBQUM7SUFDekMsT0FBTyxLQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQUEsQ0FBQztJQUMvQyxLQUFLLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFBQSxDQUFDO0lBQzNDLElBQUksS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUFBLENBQUM7SUFDekMsT0FBTyxLQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQUEsQ0FBQztJQUMvQyxNQUFNLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFBQSxDQUFDO0lBQzdDLFNBQVMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUFBLENBQUM7Q0FDdEQ7QUFFWSxRQUFBLEtBQUssR0FBRyxJQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFakMsU0FBZ0IsU0FBUyxDQUFDLE9BQU87SUFDN0Isa0NBQWtDO0lBQ2xDLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztJQUNyQixJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUU7UUFDN0IsWUFBWSxHQUFHLENBQUMsQ0FBQztLQUNwQjtTQUFNLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNsQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO0tBQ3BCO0lBQ0QsUUFBUSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQzVGLENBQUM7QUFURCw4QkFTQzs7Ozs7Ozs7QUNqRUQsdUNBQWdDO0FBQ2hDLG1FQUEyQztBQUMzQyw2RUFBcUQ7QUFDckQsbUVBQWdEO0FBQ2hELHFGQUF3RDtBQUV4RCxNQUFNLEtBQUssR0FBRyxlQUFJLENBQUMsQ0FBQyxlQUFLLEVBQUUsb0JBQVUsRUFBRSxlQUFVLEVBQUUsd0JBQVMsQ0FBQyxDQUFDLENBQUM7QUFFL0QsbURBQTJCO0FBRTNCLDRDQUE0QztBQUM1Qzs7Ozs7RUFLRTtBQUNGLFNBQWdCLGNBQWMsQ0FBQyxJQUFJLEVBQUUsUUFBUTtJQUN6QyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNoRCxJQUFJLFFBQVEsR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ25ELElBQUksUUFBUSxZQUFZLE9BQU8sRUFBRTtRQUM3QixRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUN4QixLQUFLLENBQUMsUUFBdUIsRUFBRSxXQUFDLENBQUMsY0FBYyxFQUFFLFdBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBQyxLQUFLLEVBQUUsRUFBQyxJQUFJLEVBQUUsS0FBSyxHQUFHLFFBQVEsRUFBQyxFQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ25IO0lBQUEsQ0FBQztJQUNOOzs7Ozs7O01BT0U7QUFDRixDQUFDO0FBZkQsd0NBZUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gYW5pbShtdXRhdGlvbiwgc3RhdGUpIHtcbiAgICByZXR1cm4gc3RhdGUuYW5pbWF0aW9uLmVuYWJsZWQgPyBhbmltYXRlKG11dGF0aW9uLCBzdGF0ZSkgOiByZW5kZXIobXV0YXRpb24sIHN0YXRlKTtcbn1cbmV4cG9ydHMuYW5pbSA9IGFuaW07XG5mdW5jdGlvbiByZW5kZXIobXV0YXRpb24sIHN0YXRlKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gbXV0YXRpb24oc3RhdGUpO1xuICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xufVxuZXhwb3J0cy5yZW5kZXIgPSByZW5kZXI7XG5mdW5jdGlvbiBtYWtlUGllY2Uoa2V5LCBwaWVjZSwgZmlyc3RSYW5rSXMwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHBvczogdXRpbC5rZXkycG9zKGtleSwgZmlyc3RSYW5rSXMwKSxcbiAgICAgICAgcGllY2U6IHBpZWNlXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGNsb3NlcihwaWVjZSwgcGllY2VzKSB7XG4gICAgcmV0dXJuIHBpZWNlcy5zb3J0KChwMSwgcDIpID0+IHtcbiAgICAgICAgcmV0dXJuIHV0aWwuZGlzdGFuY2VTcShwaWVjZS5wb3MsIHAxLnBvcykgLSB1dGlsLmRpc3RhbmNlU3EocGllY2UucG9zLCBwMi5wb3MpO1xuICAgIH0pWzBdO1xufVxuZnVuY3Rpb24gY29tcHV0ZVBsYW4ocHJldlBpZWNlcywgY3VycmVudCkge1xuICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IGN1cnJlbnQuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIGNvbnN0IGFuaW1zID0ge30sIGFuaW1lZE9yaWdzID0gW10sIGZhZGluZ3MgPSB7fSwgbWlzc2luZ3MgPSBbXSwgbmV3cyA9IFtdLCBwcmVQaWVjZXMgPSB7fTtcbiAgICBsZXQgY3VyUCwgcHJlUCwgaSwgdmVjdG9yO1xuICAgIGZvciAoaSBpbiBwcmV2UGllY2VzKSB7XG4gICAgICAgIHByZVBpZWNlc1tpXSA9IG1ha2VQaWVjZShpLCBwcmV2UGllY2VzW2ldLCBmaXJzdFJhbmtJczApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1dGlsLmFsbEtleXNbY3VycmVudC5nZW9tZXRyeV0pIHtcbiAgICAgICAgY3VyUCA9IGN1cnJlbnQucGllY2VzW2tleV07XG4gICAgICAgIHByZVAgPSBwcmVQaWVjZXNba2V5XTtcbiAgICAgICAgaWYgKGN1clApIHtcbiAgICAgICAgICAgIGlmIChwcmVQKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF1dGlsLnNhbWVQaWVjZShjdXJQLCBwcmVQLnBpZWNlKSkge1xuICAgICAgICAgICAgICAgICAgICBtaXNzaW5ncy5wdXNoKHByZVApO1xuICAgICAgICAgICAgICAgICAgICBuZXdzLnB1c2gobWFrZVBpZWNlKGtleSwgY3VyUCwgZmlyc3RSYW5rSXMwKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG5ld3MucHVzaChtYWtlUGllY2Uoa2V5LCBjdXJQLCBmaXJzdFJhbmtJczApKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChwcmVQKVxuICAgICAgICAgICAgbWlzc2luZ3MucHVzaChwcmVQKTtcbiAgICB9XG4gICAgbmV3cy5mb3JFYWNoKG5ld1AgPT4ge1xuICAgICAgICBwcmVQID0gY2xvc2VyKG5ld1AsIG1pc3NpbmdzLmZpbHRlcihwID0+IHV0aWwuc2FtZVBpZWNlKG5ld1AucGllY2UsIHAucGllY2UpKSk7XG4gICAgICAgIGlmIChwcmVQKSB7XG4gICAgICAgICAgICB2ZWN0b3IgPSBbcHJlUC5wb3NbMF0gLSBuZXdQLnBvc1swXSwgcHJlUC5wb3NbMV0gLSBuZXdQLnBvc1sxXV07XG4gICAgICAgICAgICBhbmltc1tuZXdQLmtleV0gPSB2ZWN0b3IuY29uY2F0KHZlY3Rvcik7XG4gICAgICAgICAgICBhbmltZWRPcmlncy5wdXNoKHByZVAua2V5KTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIG1pc3NpbmdzLmZvckVhY2gocCA9PiB7XG4gICAgICAgIGlmICghdXRpbC5jb250YWluc1goYW5pbWVkT3JpZ3MsIHAua2V5KSlcbiAgICAgICAgICAgIGZhZGluZ3NbcC5rZXldID0gcC5waWVjZTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgICBhbmltczogYW5pbXMsXG4gICAgICAgIGZhZGluZ3M6IGZhZGluZ3NcbiAgICB9O1xufVxuZnVuY3Rpb24gc3RlcChzdGF0ZSwgbm93KSB7XG4gICAgY29uc3QgY3VyID0gc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQ7XG4gICAgaWYgKGN1ciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmICghc3RhdGUuZG9tLmRlc3Ryb3llZClcbiAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3coKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXN0ID0gMSAtIChub3cgLSBjdXIuc3RhcnQpICogY3VyLmZyZXF1ZW5jeTtcbiAgICBpZiAocmVzdCA8PSAwKSB7XG4gICAgICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjb25zdCBlYXNlID0gZWFzaW5nKHJlc3QpO1xuICAgICAgICBmb3IgKGxldCBpIGluIGN1ci5wbGFuLmFuaW1zKSB7XG4gICAgICAgICAgICBjb25zdCBjZmcgPSBjdXIucGxhbi5hbmltc1tpXTtcbiAgICAgICAgICAgIGNmZ1syXSA9IGNmZ1swXSAqIGVhc2U7XG4gICAgICAgICAgICBjZmdbM10gPSBjZmdbMV0gKiBlYXNlO1xuICAgICAgICB9XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3codHJ1ZSk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgobm93ID0gcGVyZm9ybWFuY2Uubm93KCkpID0+IHN0ZXAoc3RhdGUsIG5vdykpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSB7XG4gICAgY29uc3QgcHJldlBpZWNlcyA9IE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLnBpZWNlcyk7XG4gICAgY29uc3QgcmVzdWx0ID0gbXV0YXRpb24oc3RhdGUpO1xuICAgIGNvbnN0IHBsYW4gPSBjb21wdXRlUGxhbihwcmV2UGllY2VzLCBzdGF0ZSk7XG4gICAgaWYgKCFpc09iamVjdEVtcHR5KHBsYW4uYW5pbXMpIHx8ICFpc09iamVjdEVtcHR5KHBsYW4uZmFkaW5ncykpIHtcbiAgICAgICAgY29uc3QgYWxyZWFkeVJ1bm5pbmcgPSBzdGF0ZS5hbmltYXRpb24uY3VycmVudCAmJiBzdGF0ZS5hbmltYXRpb24uY3VycmVudC5zdGFydDtcbiAgICAgICAgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgPSB7XG4gICAgICAgICAgICBzdGFydDogcGVyZm9ybWFuY2Uubm93KCksXG4gICAgICAgICAgICBmcmVxdWVuY3k6IDEgLyBzdGF0ZS5hbmltYXRpb24uZHVyYXRpb24sXG4gICAgICAgICAgICBwbGFuOiBwbGFuXG4gICAgICAgIH07XG4gICAgICAgIGlmICghYWxyZWFkeVJ1bm5pbmcpXG4gICAgICAgICAgICBzdGVwKHN0YXRlLCBwZXJmb3JtYW5jZS5ub3coKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiBpc09iamVjdEVtcHR5KG8pIHtcbiAgICBmb3IgKGxldCBfIGluIG8pXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGVhc2luZyh0KSB7XG4gICAgcmV0dXJuIHQgPCAwLjUgPyA0ICogdCAqIHQgKiB0IDogKHQgLSAxKSAqICgyICogdCAtIDIpICogKDIgKiB0IC0gMikgKyAxO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCBib2FyZCA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xuY29uc3QgZmVuXzEgPSByZXF1aXJlKFwiLi9mZW5cIik7XG5jb25zdCBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbmNvbnN0IGFuaW1fMSA9IHJlcXVpcmUoXCIuL2FuaW1cIik7XG5jb25zdCBkcmFnXzEgPSByZXF1aXJlKFwiLi9kcmFnXCIpO1xuY29uc3QgZXhwbG9zaW9uXzEgPSByZXF1aXJlKFwiLi9leHBsb3Npb25cIik7XG5mdW5jdGlvbiBzdGFydChzdGF0ZSwgcmVkcmF3QWxsKSB7XG4gICAgZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24oKSB7XG4gICAgICAgIGJvYXJkLnRvZ2dsZU9yaWVudGF0aW9uKHN0YXRlKTtcbiAgICAgICAgcmVkcmF3QWxsKCk7XG4gICAgfVxuICAgIDtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXQoY29uZmlnKSB7XG4gICAgICAgICAgICBpZiAoY29uZmlnLm9yaWVudGF0aW9uICYmIGNvbmZpZy5vcmllbnRhdGlvbiAhPT0gc3RhdGUub3JpZW50YXRpb24pXG4gICAgICAgICAgICAgICAgdG9nZ2xlT3JpZW50YXRpb24oKTtcbiAgICAgICAgICAgIChjb25maWcuZmVuID8gYW5pbV8xLmFuaW0gOiBhbmltXzEucmVuZGVyKShzdGF0ZSA9PiBjb25maWdfMS5jb25maWd1cmUoc3RhdGUsIGNvbmZpZyksIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIGdldEZlbjogKCkgPT4gZmVuXzEud3JpdGUoc3RhdGUucGllY2VzLCBzdGF0ZS5nZW9tZXRyeSksXG4gICAgICAgIHRvZ2dsZU9yaWVudGF0aW9uLFxuICAgICAgICBzZXRQaWVjZXMocGllY2VzKSB7XG4gICAgICAgICAgICBhbmltXzEuYW5pbShzdGF0ZSA9PiBib2FyZC5zZXRQaWVjZXMoc3RhdGUsIHBpZWNlcyksIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0U3F1YXJlKGtleSwgZm9yY2UpIHtcbiAgICAgICAgICAgIGlmIChrZXkpXG4gICAgICAgICAgICAgICAgYW5pbV8xLmFuaW0oc3RhdGUgPT4gYm9hcmQuc2VsZWN0U3F1YXJlKHN0YXRlLCBrZXksIGZvcmNlKSwgc3RhdGUpO1xuICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc2VsZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICBib2FyZC51bnNlbGVjdChzdGF0ZSk7XG4gICAgICAgICAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBtb3ZlKG9yaWcsIGRlc3QpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKHN0YXRlID0+IGJvYXJkLmJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBuZXdQaWVjZShwaWVjZSwga2V5KSB7XG4gICAgICAgICAgICBhbmltXzEuYW5pbShzdGF0ZSA9PiBib2FyZC5iYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBrZXkpLCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHBsYXlQcmVtb3ZlKCkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnByZW1vdmFibGUuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIGlmIChhbmltXzEuYW5pbShib2FyZC5wbGF5UHJlbW92ZSwgc3RhdGUpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgIHBsYXlQcmVkcm9wKHZhbGlkYXRlKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUucHJlZHJvcHBhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBib2FyZC5wbGF5UHJlZHJvcChzdGF0ZSwgdmFsaWRhdGUpO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxQcmVtb3ZlKCkge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihib2FyZC51bnNldFByZW1vdmUsIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgY2FuY2VsUHJlZHJvcCgpIHtcbiAgICAgICAgICAgIGFuaW1fMS5yZW5kZXIoYm9hcmQudW5zZXRQcmVkcm9wLCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGNhbmNlbE1vdmUoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKHN0YXRlID0+IHsgYm9hcmQuY2FuY2VsTW92ZShzdGF0ZSk7IGRyYWdfMS5jYW5jZWwoc3RhdGUpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKHN0YXRlID0+IHsgYm9hcmQuc3RvcChzdGF0ZSk7IGRyYWdfMS5jYW5jZWwoc3RhdGUpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGV4cGxvZGUoa2V5cykge1xuICAgICAgICAgICAgZXhwbG9zaW9uXzEuZGVmYXVsdChzdGF0ZSwga2V5cyk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldEF1dG9TaGFwZXMoc2hhcGVzKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKHN0YXRlID0+IHN0YXRlLmRyYXdhYmxlLmF1dG9TaGFwZXMgPSBzaGFwZXMsIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0U2hhcGVzKHNoYXBlcykge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihzdGF0ZSA9PiBzdGF0ZS5kcmF3YWJsZS5zaGFwZXMgPSBzaGFwZXMsIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0S2V5QXREb21Qb3MocG9zKSB7XG4gICAgICAgICAgICByZXR1cm4gYm9hcmQuZ2V0S2V5QXREb21Qb3MocG9zLCBzdGF0ZS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgc3RhdGUuZG9tLmJvdW5kcygpLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZHJhd0FsbCxcbiAgICAgICAgZHJhZ05ld1BpZWNlKHBpZWNlLCBldmVudCwgZm9yY2UpIHtcbiAgICAgICAgICAgIGRyYWdfMS5kcmFnTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBldmVudCwgZm9yY2UpO1xuICAgICAgICB9LFxuICAgICAgICBkZXN0cm95KCkge1xuICAgICAgICAgICAgYm9hcmQuc3RvcChzdGF0ZSk7XG4gICAgICAgICAgICBzdGF0ZS5kb20udW5iaW5kICYmIHN0YXRlLmRvbS51bmJpbmQoKTtcbiAgICAgICAgICAgIHN0YXRlLmRvbS5kZXN0cm95ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IHByZW1vdmVfMSA9IHJlcXVpcmUoXCIuL3ByZW1vdmVcIik7XG5jb25zdCBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZnVuY3Rpb24gY2FsbFVzZXJGdW5jdGlvbihmLCAuLi5hcmdzKSB7XG4gICAgaWYgKGYpXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gZiguLi5hcmdzKSwgMSk7XG59XG5leHBvcnRzLmNhbGxVc2VyRnVuY3Rpb24gPSBjYWxsVXNlckZ1bmN0aW9uO1xuZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24oc3RhdGUpIHtcbiAgICBzdGF0ZS5vcmllbnRhdGlvbiA9IHV0aWxfMS5vcHBvc2l0ZShzdGF0ZS5vcmllbnRhdGlvbik7XG4gICAgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgPVxuICAgICAgICBzdGF0ZS5kcmFnZ2FibGUuY3VycmVudCA9XG4gICAgICAgICAgICBzdGF0ZS5zZWxlY3RlZCA9IHVuZGVmaW5lZDtcbn1cbmV4cG9ydHMudG9nZ2xlT3JpZW50YXRpb24gPSB0b2dnbGVPcmllbnRhdGlvbjtcbmZ1bmN0aW9uIHJlc2V0KHN0YXRlKSB7XG4gICAgc3RhdGUubGFzdE1vdmUgPSB1bmRlZmluZWQ7XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgdW5zZXRQcmVkcm9wKHN0YXRlKTtcbn1cbmV4cG9ydHMucmVzZXQgPSByZXNldDtcbmZ1bmN0aW9uIHNldFBpZWNlcyhzdGF0ZSwgcGllY2VzKSB7XG4gICAgZm9yIChsZXQga2V5IGluIHBpZWNlcykge1xuICAgICAgICBjb25zdCBwaWVjZSA9IHBpZWNlc1trZXldO1xuICAgICAgICBpZiAocGllY2UpXG4gICAgICAgICAgICBzdGF0ZS5waWVjZXNba2V5XSA9IHBpZWNlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBkZWxldGUgc3RhdGUucGllY2VzW2tleV07XG4gICAgfVxufVxuZXhwb3J0cy5zZXRQaWVjZXMgPSBzZXRQaWVjZXM7XG5mdW5jdGlvbiBzZXRDaGVjayhzdGF0ZSwgY29sb3IpIHtcbiAgICBzdGF0ZS5jaGVjayA9IHVuZGVmaW5lZDtcbiAgICBpZiAoY29sb3IgPT09IHRydWUpXG4gICAgICAgIGNvbG9yID0gc3RhdGUudHVybkNvbG9yO1xuICAgIGlmIChjb2xvcilcbiAgICAgICAgZm9yIChsZXQgayBpbiBzdGF0ZS5waWVjZXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5waWVjZXNba10ucm9sZSA9PT0gJ2tpbmcnICYmIHN0YXRlLnBpZWNlc1trXS5jb2xvciA9PT0gY29sb3IpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5jaGVjayA9IGs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbn1cbmV4cG9ydHMuc2V0Q2hlY2sgPSBzZXRDaGVjaztcbmZ1bmN0aW9uIHNldFByZW1vdmUoc3RhdGUsIG9yaWcsIGRlc3QsIG1ldGEpIHtcbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xuICAgIHN0YXRlLnByZW1vdmFibGUuY3VycmVudCA9IFtvcmlnLCBkZXN0XTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZW1vdmFibGUuZXZlbnRzLnNldCwgb3JpZywgZGVzdCwgbWV0YSk7XG59XG5mdW5jdGlvbiB1bnNldFByZW1vdmUoc3RhdGUpIHtcbiAgICBpZiAoc3RhdGUucHJlbW92YWJsZS5jdXJyZW50KSB7XG4gICAgICAgIHN0YXRlLnByZW1vdmFibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5wcmVtb3ZhYmxlLmV2ZW50cy51bnNldCk7XG4gICAgfVxufVxuZXhwb3J0cy51bnNldFByZW1vdmUgPSB1bnNldFByZW1vdmU7XG5mdW5jdGlvbiBzZXRQcmVkcm9wKHN0YXRlLCByb2xlLCBrZXkpIHtcbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHN0YXRlLnByZWRyb3BwYWJsZS5jdXJyZW50ID0ge1xuICAgICAgICByb2xlOiByb2xlLFxuICAgICAgICBrZXk6IGtleVxuICAgIH07XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5wcmVkcm9wcGFibGUuZXZlbnRzLnNldCwgcm9sZSwga2V5KTtcbn1cbmZ1bmN0aW9uIHVuc2V0UHJlZHJvcChzdGF0ZSkge1xuICAgIGNvbnN0IHBkID0gc3RhdGUucHJlZHJvcHBhYmxlO1xuICAgIGlmIChwZC5jdXJyZW50KSB7XG4gICAgICAgIHBkLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIGNhbGxVc2VyRnVuY3Rpb24ocGQuZXZlbnRzLnVuc2V0KTtcbiAgICB9XG59XG5leHBvcnRzLnVuc2V0UHJlZHJvcCA9IHVuc2V0UHJlZHJvcDtcbmZ1bmN0aW9uIHRyeUF1dG9DYXN0bGUoc3RhdGUsIG9yaWcsIGRlc3QpIHtcbiAgICBpZiAoIXN0YXRlLmF1dG9DYXN0bGUpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBraW5nID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIGlmICgha2luZyB8fCBraW5nLnJvbGUgIT09ICdraW5nJylcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IHN0YXRlLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICBjb25zdCBvcmlnUG9zID0gdXRpbF8xLmtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKTtcbiAgICBpZiAob3JpZ1Bvc1swXSAhPT0gNSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChvcmlnUG9zWzFdICE9PSAxICYmIG9yaWdQb3NbMV0gIT09IDgpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBkZXN0UG9zID0gdXRpbF8xLmtleTJwb3MoZGVzdCwgZmlyc3RSYW5rSXMwKTtcbiAgICBsZXQgb2xkUm9va1BvcywgbmV3Um9va1BvcywgbmV3S2luZ1BvcztcbiAgICBpZiAoZGVzdFBvc1swXSA9PT0gNyB8fCBkZXN0UG9zWzBdID09PSA4KSB7XG4gICAgICAgIG9sZFJvb2tQb3MgPSB1dGlsXzEucG9zMmtleShbOCwgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgbmV3Um9va1BvcyA9IHV0aWxfMS5wb3Mya2V5KFs2LCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgICAgICBuZXdLaW5nUG9zID0gdXRpbF8xLnBvczJrZXkoWzcsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGRlc3RQb3NbMF0gPT09IDMgfHwgZGVzdFBvc1swXSA9PT0gMSkge1xuICAgICAgICBvbGRSb29rUG9zID0gdXRpbF8xLnBvczJrZXkoWzEsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIG5ld1Jvb2tQb3MgPSB1dGlsXzEucG9zMmtleShbNCwgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgbmV3S2luZ1BvcyA9IHV0aWxfMS5wb3Mya2V5KFszLCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByb29rID0gc3RhdGUucGllY2VzW29sZFJvb2tQb3NdO1xuICAgIGlmICghcm9vayB8fCByb29rLnJvbGUgIT09ICdyb29rJylcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvbGRSb29rUG9zXTtcbiAgICBzdGF0ZS5waWVjZXNbbmV3S2luZ1Bvc10gPSBraW5nO1xuICAgIHN0YXRlLnBpZWNlc1tuZXdSb29rUG9zXSA9IHJvb2s7XG4gICAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBiYXNlTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IG9yaWdQaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXSwgZGVzdFBpZWNlID0gc3RhdGUucGllY2VzW2Rlc3RdO1xuICAgIGlmIChvcmlnID09PSBkZXN0IHx8ICFvcmlnUGllY2UpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBjYXB0dXJlZCA9IChkZXN0UGllY2UgJiYgZGVzdFBpZWNlLmNvbG9yICE9PSBvcmlnUGllY2UuY29sb3IpID8gZGVzdFBpZWNlIDogdW5kZWZpbmVkO1xuICAgIGlmIChkZXN0ID09IHN0YXRlLnNlbGVjdGVkKVxuICAgICAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5ldmVudHMubW92ZSwgb3JpZywgZGVzdCwgY2FwdHVyZWQpO1xuICAgIGlmICghdHJ5QXV0b0Nhc3RsZShzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgc3RhdGUucGllY2VzW2Rlc3RdID0gb3JpZ1BpZWNlO1xuICAgICAgICBkZWxldGUgc3RhdGUucGllY2VzW29yaWddO1xuICAgIH1cbiAgICBzdGF0ZS5sYXN0TW92ZSA9IFtvcmlnLCBkZXN0XTtcbiAgICBzdGF0ZS5jaGVjayA9IHVuZGVmaW5lZDtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5jaGFuZ2UpO1xuICAgIHJldHVybiBjYXB0dXJlZCB8fCB0cnVlO1xufVxuZXhwb3J0cy5iYXNlTW92ZSA9IGJhc2VNb3ZlO1xuZnVuY3Rpb24gYmFzZU5ld1BpZWNlKHN0YXRlLCBwaWVjZSwga2V5LCBmb3JjZSkge1xuICAgIGlmIChzdGF0ZS5waWVjZXNba2V5XSkge1xuICAgICAgICBpZiAoZm9yY2UpXG4gICAgICAgICAgICBkZWxldGUgc3RhdGUucGllY2VzW2tleV07XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5ldmVudHMuZHJvcE5ld1BpZWNlLCBwaWVjZSwga2V5KTtcbiAgICBzdGF0ZS5waWVjZXNba2V5XSA9IHBpZWNlO1xuICAgIHN0YXRlLmxhc3RNb3ZlID0gW2tleV07XG4gICAgc3RhdGUuY2hlY2sgPSB1bmRlZmluZWQ7XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5ldmVudHMuY2hhbmdlKTtcbiAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xuICAgIHN0YXRlLnR1cm5Db2xvciA9IHV0aWxfMS5vcHBvc2l0ZShzdGF0ZS50dXJuQ29sb3IpO1xuICAgIHJldHVybiB0cnVlO1xufVxuZXhwb3J0cy5iYXNlTmV3UGllY2UgPSBiYXNlTmV3UGllY2U7XG5mdW5jdGlvbiBiYXNlVXNlck1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpIHtcbiAgICBjb25zdCByZXN1bHQgPSBiYXNlTW92ZShzdGF0ZSwgb3JpZywgZGVzdCk7XG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xuICAgICAgICBzdGF0ZS50dXJuQ29sb3IgPSB1dGlsXzEub3Bwb3NpdGUoc3RhdGUudHVybkNvbG9yKTtcbiAgICAgICAgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiB1c2VyTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGlmIChjYW5Nb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBiYXNlVXNlck1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpO1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICBjb25zdCBob2xkVGltZSA9IHN0YXRlLmhvbGQuc3RvcCgpO1xuICAgICAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgICAgICAgICAgY29uc3QgbWV0YWRhdGEgPSB7XG4gICAgICAgICAgICAgICAgcHJlbW92ZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgY3RybEtleTogc3RhdGUuc3RhdHMuY3RybEtleSxcbiAgICAgICAgICAgICAgICBob2xkVGltZTogaG9sZFRpbWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gdHJ1ZSlcbiAgICAgICAgICAgICAgICBtZXRhZGF0YS5jYXB0dXJlZCA9IHJlc3VsdDtcbiAgICAgICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXIsIG9yaWcsIGRlc3QsIG1ldGFkYXRhKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGNhblByZW1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHNldFByZW1vdmUoc3RhdGUsIG9yaWcsIGRlc3QsIHtcbiAgICAgICAgICAgIGN0cmxLZXk6IHN0YXRlLnN0YXRzLmN0cmxLZXlcbiAgICAgICAgfSk7XG4gICAgICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoaXNNb3ZhYmxlKHN0YXRlLCBkZXN0KSB8fCBpc1ByZW1vdmFibGUoc3RhdGUsIGRlc3QpKSB7XG4gICAgICAgIHNldFNlbGVjdGVkKHN0YXRlLCBkZXN0KTtcbiAgICAgICAgc3RhdGUuaG9sZC5zdGFydCgpO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICByZXR1cm4gZmFsc2U7XG59XG5leHBvcnRzLnVzZXJNb3ZlID0gdXNlck1vdmU7XG5mdW5jdGlvbiBkcm9wTmV3UGllY2Uoc3RhdGUsIG9yaWcsIGRlc3QsIGZvcmNlKSB7XG4gICAgaWYgKGNhbkRyb3Aoc3RhdGUsIG9yaWcsIGRlc3QpIHx8IGZvcmNlKSB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgICAgICBkZWxldGUgc3RhdGUucGllY2VzW29yaWddO1xuICAgICAgICBiYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBkZXN0LCBmb3JjZSk7XG4gICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgcGllY2Uucm9sZSwgZGVzdCwge1xuICAgICAgICAgICAgcHJlZHJvcDogZmFsc2VcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNhblByZWRyb3Aoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHNldFByZWRyb3Aoc3RhdGUsIHN0YXRlLnBpZWNlc1tvcmlnXS5yb2xlLCBkZXN0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgfVxuICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xufVxuZXhwb3J0cy5kcm9wTmV3UGllY2UgPSBkcm9wTmV3UGllY2U7XG5mdW5jdGlvbiBzZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpIHtcbiAgICBpZiAoc3RhdGUuc2VsZWN0ZWQpIHtcbiAgICAgICAgaWYgKHN0YXRlLnNlbGVjdGVkID09PSBrZXkgJiYgIXN0YXRlLmRyYWdnYWJsZS5lbmFibGVkKSB7XG4gICAgICAgICAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgICAgICAgICBzdGF0ZS5ob2xkLmNhbmNlbCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKChzdGF0ZS5zZWxlY3RhYmxlLmVuYWJsZWQgfHwgZm9yY2UpICYmIHN0YXRlLnNlbGVjdGVkICE9PSBrZXkpIHtcbiAgICAgICAgICAgIGlmICh1c2VyTW92ZShzdGF0ZSwgc3RhdGUuc2VsZWN0ZWQsIGtleSkpXG4gICAgICAgICAgICAgICAgc3RhdGUuc3RhdHMuZHJhZ2dlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0YXRlLmhvbGQuc3RhcnQoKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoaXNNb3ZhYmxlKHN0YXRlLCBrZXkpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwga2V5KSkge1xuICAgICAgICBzZXRTZWxlY3RlZChzdGF0ZSwga2V5KTtcbiAgICAgICAgc3RhdGUuaG9sZC5zdGFydCgpO1xuICAgIH1cbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5zZWxlY3QsIGtleSk7XG59XG5leHBvcnRzLnNlbGVjdFNxdWFyZSA9IHNlbGVjdFNxdWFyZTtcbmZ1bmN0aW9uIHNldFNlbGVjdGVkKHN0YXRlLCBrZXkpIHtcbiAgICBzdGF0ZS5zZWxlY3RlZCA9IGtleTtcbiAgICBpZiAoaXNQcmVtb3ZhYmxlKHN0YXRlLCBrZXkpKSB7XG4gICAgICAgIHN0YXRlLnByZW1vdmFibGUuZGVzdHMgPSBwcmVtb3ZlXzEuZGVmYXVsdChzdGF0ZS5waWVjZXMsIGtleSwgc3RhdGUucHJlbW92YWJsZS5jYXN0bGUsIHN0YXRlLmdlb21ldHJ5KTtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgICBzdGF0ZS5wcmVtb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xufVxuZXhwb3J0cy5zZXRTZWxlY3RlZCA9IHNldFNlbGVjdGVkO1xuZnVuY3Rpb24gdW5zZWxlY3Qoc3RhdGUpIHtcbiAgICBzdGF0ZS5zZWxlY3RlZCA9IHVuZGVmaW5lZDtcbiAgICBzdGF0ZS5wcmVtb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xuICAgIHN0YXRlLmhvbGQuY2FuY2VsKCk7XG59XG5leHBvcnRzLnVuc2VsZWN0ID0gdW5zZWxlY3Q7XG5mdW5jdGlvbiBpc01vdmFibGUoc3RhdGUsIG9yaWcpIHtcbiAgICBjb25zdCBwaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICByZXR1cm4gISFwaWVjZSAmJiAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gJ2JvdGgnIHx8IChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxuICAgICAgICBzdGF0ZS50dXJuQ29sb3IgPT09IHBpZWNlLmNvbG9yKSk7XG59XG5mdW5jdGlvbiBjYW5Nb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgcmV0dXJuIG9yaWcgIT09IGRlc3QgJiYgaXNNb3ZhYmxlKHN0YXRlLCBvcmlnKSAmJiAoc3RhdGUubW92YWJsZS5mcmVlIHx8ICghIXN0YXRlLm1vdmFibGUuZGVzdHMgJiYgdXRpbF8xLmNvbnRhaW5zWChzdGF0ZS5tb3ZhYmxlLmRlc3RzW29yaWddLCBkZXN0KSkpO1xufVxuZXhwb3J0cy5jYW5Nb3ZlID0gY2FuTW92ZTtcbmZ1bmN0aW9uIGNhbkRyb3Aoc3RhdGUsIG9yaWcsIGRlc3QpIHtcbiAgICBjb25zdCBwaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICByZXR1cm4gISFwaWVjZSAmJiBkZXN0ICYmIChvcmlnID09PSBkZXN0IHx8ICFzdGF0ZS5waWVjZXNbZGVzdF0pICYmIChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmXG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciA9PT0gcGllY2UuY29sb3IpKTtcbn1cbmZ1bmN0aW9uIGlzUHJlbW92YWJsZShzdGF0ZSwgb3JpZykge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIHN0YXRlLnByZW1vdmFibGUuZW5hYmxlZCAmJlxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxuICAgICAgICBzdGF0ZS50dXJuQ29sb3IgIT09IHBpZWNlLmNvbG9yO1xufVxuZnVuY3Rpb24gY2FuUHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHJldHVybiBvcmlnICE9PSBkZXN0ICYmXG4gICAgICAgIGlzUHJlbW92YWJsZShzdGF0ZSwgb3JpZykgJiZcbiAgICAgICAgdXRpbF8xLmNvbnRhaW5zWChwcmVtb3ZlXzEuZGVmYXVsdChzdGF0ZS5waWVjZXMsIG9yaWcsIHN0YXRlLnByZW1vdmFibGUuY2FzdGxlLCBzdGF0ZS5nZW9tZXRyeSksIGRlc3QpO1xufVxuZnVuY3Rpb24gY2FuUHJlZHJvcChzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIGNvbnN0IGRlc3RQaWVjZSA9IHN0YXRlLnBpZWNlc1tkZXN0XTtcbiAgICByZXR1cm4gISFwaWVjZSAmJiBkZXN0ICYmXG4gICAgICAgICghZGVzdFBpZWNlIHx8IGRlc3RQaWVjZS5jb2xvciAhPT0gc3RhdGUubW92YWJsZS5jb2xvcikgJiZcbiAgICAgICAgc3RhdGUucHJlZHJvcHBhYmxlLmVuYWJsZWQgJiZcbiAgICAgICAgKHBpZWNlLnJvbGUgIT09ICdwYXduJyB8fCAoZGVzdFsxXSAhPT0gJzEnICYmIGRlc3RbMV0gIT09ICc4JykpICYmXG4gICAgICAgIHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmXG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciAhPT0gcGllY2UuY29sb3I7XG59XG5mdW5jdGlvbiBpc0RyYWdnYWJsZShzdGF0ZSwgb3JpZykge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIHN0YXRlLmRyYWdnYWJsZS5lbmFibGVkICYmIChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmIChzdGF0ZS50dXJuQ29sb3IgPT09IHBpZWNlLmNvbG9yIHx8IHN0YXRlLnByZW1vdmFibGUuZW5hYmxlZCkpKTtcbn1cbmV4cG9ydHMuaXNEcmFnZ2FibGUgPSBpc0RyYWdnYWJsZTtcbmZ1bmN0aW9uIHBsYXlQcmVtb3ZlKHN0YXRlKSB7XG4gICAgY29uc3QgbW92ZSA9IHN0YXRlLnByZW1vdmFibGUuY3VycmVudDtcbiAgICBpZiAoIW1vdmUpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBvcmlnID0gbW92ZVswXSwgZGVzdCA9IG1vdmVbMV07XG4gICAgbGV0IHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICBpZiAoY2FuTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYmFzZVVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgY29uc3QgbWV0YWRhdGEgPSB7IHByZW1vdmU6IHRydWUgfTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQgIT09IHRydWUpXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEuY2FwdHVyZWQgPSByZXN1bHQ7XG4gICAgICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLm1vdmFibGUuZXZlbnRzLmFmdGVyLCBvcmlnLCBkZXN0LCBtZXRhZGF0YSk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHJldHVybiBzdWNjZXNzO1xufVxuZXhwb3J0cy5wbGF5UHJlbW92ZSA9IHBsYXlQcmVtb3ZlO1xuZnVuY3Rpb24gcGxheVByZWRyb3Aoc3RhdGUsIHZhbGlkYXRlKSB7XG4gICAgbGV0IGRyb3AgPSBzdGF0ZS5wcmVkcm9wcGFibGUuY3VycmVudCwgc3VjY2VzcyA9IGZhbHNlO1xuICAgIGlmICghZHJvcClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGlmICh2YWxpZGF0ZShkcm9wKSkge1xuICAgICAgICBjb25zdCBwaWVjZSA9IHtcbiAgICAgICAgICAgIHJvbGU6IGRyb3Aucm9sZSxcbiAgICAgICAgICAgIGNvbG9yOiBzdGF0ZS5tb3ZhYmxlLmNvbG9yXG4gICAgICAgIH07XG4gICAgICAgIGlmIChiYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBkcm9wLmtleSkpIHtcbiAgICAgICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgZHJvcC5yb2xlLCBkcm9wLmtleSwge1xuICAgICAgICAgICAgICAgIHByZWRyb3A6IHRydWVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc3VjY2VzcyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdW5zZXRQcmVkcm9wKHN0YXRlKTtcbiAgICByZXR1cm4gc3VjY2Vzcztcbn1cbmV4cG9ydHMucGxheVByZWRyb3AgPSBwbGF5UHJlZHJvcDtcbmZ1bmN0aW9uIGNhbmNlbE1vdmUoc3RhdGUpIHtcbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xufVxuZXhwb3J0cy5jYW5jZWxNb3ZlID0gY2FuY2VsTW92ZTtcbmZ1bmN0aW9uIHN0b3Aoc3RhdGUpIHtcbiAgICBzdGF0ZS5tb3ZhYmxlLmNvbG9yID1cbiAgICAgICAgc3RhdGUubW92YWJsZS5kZXN0cyA9XG4gICAgICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICBjYW5jZWxNb3ZlKHN0YXRlKTtcbn1cbmV4cG9ydHMuc3RvcCA9IHN0b3A7XG5mdW5jdGlvbiBnZXRLZXlBdERvbVBvcyhwb3MsIGFzV2hpdGUsIGJvdW5kcywgZ2VvbSkge1xuICAgIGNvbnN0IGJkID0gY2cuZGltZW5zaW9uc1tnZW9tXTtcbiAgICBsZXQgZmlsZSA9IE1hdGguY2VpbChiZC53aWR0aCAqICgocG9zWzBdIC0gYm91bmRzLmxlZnQpIC8gYm91bmRzLndpZHRoKSk7XG4gICAgaWYgKCFhc1doaXRlKVxuICAgICAgICBmaWxlID0gYmQud2lkdGggKyAxIC0gZmlsZTtcbiAgICBsZXQgcmFuayA9IE1hdGguY2VpbChiZC5oZWlnaHQgLSAoYmQuaGVpZ2h0ICogKChwb3NbMV0gLSBib3VuZHMudG9wKSAvIGJvdW5kcy5oZWlnaHQpKSk7XG4gICAgaWYgKCFhc1doaXRlKVxuICAgICAgICByYW5rID0gYmQuaGVpZ2h0ICsgMSAtIHJhbms7XG4gICAgcmV0dXJuIChmaWxlID4gMCAmJiBmaWxlIDwgYmQud2lkdGggKyAxICYmIHJhbmsgPiAwICYmIHJhbmsgPCBiZC5oZWlnaHQgKyAxKSA/IHV0aWxfMS5wb3Mya2V5KFtmaWxlLCByYW5rXSwgZ2VvbSkgOiB1bmRlZmluZWQ7XG59XG5leHBvcnRzLmdldEtleUF0RG9tUG9zID0gZ2V0S2V5QXREb21Qb3M7XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IGFwaV8xID0gcmVxdWlyZShcIi4vYXBpXCIpO1xuY29uc3QgY29uZmlnXzEgPSByZXF1aXJlKFwiLi9jb25maWdcIik7XG5jb25zdCBzdGF0ZV8xID0gcmVxdWlyZShcIi4vc3RhdGVcIik7XG5jb25zdCB3cmFwXzEgPSByZXF1aXJlKFwiLi93cmFwXCIpO1xuY29uc3QgZXZlbnRzID0gcmVxdWlyZShcIi4vZXZlbnRzXCIpO1xuY29uc3QgcmVuZGVyXzEgPSByZXF1aXJlKFwiLi9yZW5kZXJcIik7XG5jb25zdCBzdmcgPSByZXF1aXJlKFwiLi9zdmdcIik7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIENoZXNzZ3JvdW5kKGVsZW1lbnQsIGNvbmZpZykge1xuICAgIGNvbnN0IHN0YXRlID0gc3RhdGVfMS5kZWZhdWx0cygpO1xuICAgIGNvbmZpZ18xLmNvbmZpZ3VyZShzdGF0ZSwgY29uZmlnIHx8IHt9KTtcbiAgICBmdW5jdGlvbiByZWRyYXdBbGwoKSB7XG4gICAgICAgIGxldCBwcmV2VW5iaW5kID0gc3RhdGUuZG9tICYmIHN0YXRlLmRvbS51bmJpbmQ7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2ctd3JhcCcpO1xuICAgICAgICBjb25zdCByZWxhdGl2ZSA9IHN0YXRlLnZpZXdPbmx5ICYmICFzdGF0ZS5kcmF3YWJsZS52aXNpYmxlO1xuICAgICAgICBjb25zdCBlbGVtZW50cyA9IHdyYXBfMS5kZWZhdWx0KGVsZW1lbnQsIHN0YXRlLCByZWxhdGl2ZSk7XG4gICAgICAgIGNvbnN0IGJvdW5kcyA9IHV0aWwubWVtbygoKSA9PiBlbGVtZW50cy5ib2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSk7XG4gICAgICAgIGNvbnN0IHJlZHJhd05vdyA9IChza2lwU3ZnKSA9PiB7XG4gICAgICAgICAgICByZW5kZXJfMS5kZWZhdWx0KHN0YXRlKTtcbiAgICAgICAgICAgIGlmICghc2tpcFN2ZyAmJiBlbGVtZW50cy5zdmcpXG4gICAgICAgICAgICAgICAgc3ZnLnJlbmRlclN2ZyhzdGF0ZSwgZWxlbWVudHMuc3ZnKTtcbiAgICAgICAgfTtcbiAgICAgICAgc3RhdGUuZG9tID0ge1xuICAgICAgICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgICAgICAgYm91bmRzOiBib3VuZHMsXG4gICAgICAgICAgICByZWRyYXc6IGRlYm91bmNlUmVkcmF3KHJlZHJhd05vdyksXG4gICAgICAgICAgICByZWRyYXdOb3c6IHJlZHJhd05vdyxcbiAgICAgICAgICAgIHVuYmluZDogcHJldlVuYmluZCxcbiAgICAgICAgICAgIHJlbGF0aXZlXG4gICAgICAgIH07XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnByZXZTdmdIYXNoID0gJyc7XG4gICAgICAgIHJlZHJhd05vdyhmYWxzZSk7XG4gICAgICAgIGV2ZW50cy5iaW5kQm9hcmQoc3RhdGUpO1xuICAgICAgICBpZiAoIXByZXZVbmJpbmQpXG4gICAgICAgICAgICBzdGF0ZS5kb20udW5iaW5kID0gZXZlbnRzLmJpbmREb2N1bWVudChzdGF0ZSwgcmVkcmF3QWxsKTtcbiAgICAgICAgc3RhdGUuZXZlbnRzLmluc2VydCAmJiBzdGF0ZS5ldmVudHMuaW5zZXJ0KGVsZW1lbnRzKTtcbiAgICB9XG4gICAgcmVkcmF3QWxsKCk7XG4gICAgY29uc3QgYXBpID0gYXBpXzEuc3RhcnQoc3RhdGUsIHJlZHJhd0FsbCk7XG4gICAgcmV0dXJuIGFwaTtcbn1cbmV4cG9ydHMuQ2hlc3Nncm91bmQgPSBDaGVzc2dyb3VuZDtcbjtcbmZ1bmN0aW9uIGRlYm91bmNlUmVkcmF3KHJlZHJhd05vdykge1xuICAgIGxldCByZWRyYXdpbmcgPSBmYWxzZTtcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBpZiAocmVkcmF3aW5nKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICByZWRyYXdpbmcgPSB0cnVlO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgICAgcmVkcmF3Tm93KCk7XG4gICAgICAgICAgICByZWRyYXdpbmcgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgYm9hcmRfMSA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xuY29uc3QgZmVuXzEgPSByZXF1aXJlKFwiLi9mZW5cIik7XG5jb25zdCBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZnVuY3Rpb24gY29uZmlndXJlKHN0YXRlLCBjb25maWcpIHtcbiAgICBpZiAoY29uZmlnLm1vdmFibGUgJiYgY29uZmlnLm1vdmFibGUuZGVzdHMpXG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgbWVyZ2Uoc3RhdGUsIGNvbmZpZyk7XG4gICAgaWYgKGNvbmZpZy5nZW9tZXRyeSlcbiAgICAgICAgc3RhdGUuZGltZW5zaW9ucyA9IGNnLmRpbWVuc2lvbnNbY29uZmlnLmdlb21ldHJ5XTtcbiAgICBpZiAoY29uZmlnLmZlbikge1xuICAgICAgICBzdGF0ZS5waWVjZXMgPSBmZW5fMS5yZWFkKGNvbmZpZy5mZW4pO1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5zaGFwZXMgPSBbXTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eSgnY2hlY2snKSlcbiAgICAgICAgYm9hcmRfMS5zZXRDaGVjayhzdGF0ZSwgY29uZmlnLmNoZWNrIHx8IGZhbHNlKTtcbiAgICBpZiAoY29uZmlnLmhhc093blByb3BlcnR5KCdsYXN0TW92ZScpICYmICFjb25maWcubGFzdE1vdmUpXG4gICAgICAgIHN0YXRlLmxhc3RNb3ZlID0gdW5kZWZpbmVkO1xuICAgIGVsc2UgaWYgKGNvbmZpZy5sYXN0TW92ZSlcbiAgICAgICAgc3RhdGUubGFzdE1vdmUgPSBjb25maWcubGFzdE1vdmU7XG4gICAgaWYgKHN0YXRlLnNlbGVjdGVkKVxuICAgICAgICBib2FyZF8xLnNldFNlbGVjdGVkKHN0YXRlLCBzdGF0ZS5zZWxlY3RlZCk7XG4gICAgaWYgKCFzdGF0ZS5hbmltYXRpb24uZHVyYXRpb24gfHwgc3RhdGUuYW5pbWF0aW9uLmR1cmF0aW9uIDwgMTAwKVxuICAgICAgICBzdGF0ZS5hbmltYXRpb24uZW5hYmxlZCA9IGZhbHNlO1xuICAgIGlmICghc3RhdGUubW92YWJsZS5yb29rQ2FzdGxlICYmIHN0YXRlLm1vdmFibGUuZGVzdHMpIHtcbiAgICAgICAgY29uc3QgcmFuayA9IHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICd3aGl0ZScgPyAxIDogODtcbiAgICAgICAgY29uc3Qga2luZ1N0YXJ0UG9zID0gJ2UnICsgcmFuaztcbiAgICAgICAgY29uc3QgZGVzdHMgPSBzdGF0ZS5tb3ZhYmxlLmRlc3RzW2tpbmdTdGFydFBvc107XG4gICAgICAgIGNvbnN0IGtpbmcgPSBzdGF0ZS5waWVjZXNba2luZ1N0YXJ0UG9zXTtcbiAgICAgICAgaWYgKCFkZXN0cyB8fCAha2luZyB8fCBraW5nLnJvbGUgIT09ICdraW5nJylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgc3RhdGUubW92YWJsZS5kZXN0c1traW5nU3RhcnRQb3NdID0gZGVzdHMuZmlsdGVyKGQgPT4gISgoZCA9PT0gJ2EnICsgcmFuaykgJiYgZGVzdHMuaW5kZXhPZignYycgKyByYW5rKSAhPT0gLTEpICYmXG4gICAgICAgICAgICAhKChkID09PSAnaCcgKyByYW5rKSAmJiBkZXN0cy5pbmRleE9mKCdnJyArIHJhbmspICE9PSAtMSkpO1xuICAgIH1cbn1cbmV4cG9ydHMuY29uZmlndXJlID0gY29uZmlndXJlO1xuO1xuZnVuY3Rpb24gbWVyZ2UoYmFzZSwgZXh0ZW5kKSB7XG4gICAgZm9yIChsZXQga2V5IGluIGV4dGVuZCkge1xuICAgICAgICBpZiAoaXNPYmplY3QoYmFzZVtrZXldKSAmJiBpc09iamVjdChleHRlbmRba2V5XSkpXG4gICAgICAgICAgICBtZXJnZShiYXNlW2tleV0sIGV4dGVuZFtrZXldKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgYmFzZVtrZXldID0gZXh0ZW5kW2tleV07XG4gICAgfVxufVxuZnVuY3Rpb24gaXNPYmplY3Qobykge1xuICAgIHJldHVybiB0eXBlb2YgbyA9PT0gJ29iamVjdCc7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IGJvYXJkID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IGRyYXdfMSA9IHJlcXVpcmUoXCIuL2RyYXdcIik7XG5jb25zdCBhbmltXzEgPSByZXF1aXJlKFwiLi9hbmltXCIpO1xuZnVuY3Rpb24gc3RhcnQocywgZSkge1xuICAgIGlmIChlLmJ1dHRvbiAhPT0gdW5kZWZpbmVkICYmIGUuYnV0dG9uICE9PSAwKVxuICAgICAgICByZXR1cm47XG4gICAgaWYgKGUudG91Y2hlcyAmJiBlLnRvdWNoZXMubGVuZ3RoID4gMSlcbiAgICAgICAgcmV0dXJuO1xuICAgIGNvbnN0IGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKSwgcG9zaXRpb24gPSB1dGlsLmV2ZW50UG9zaXRpb24oZSksIG9yaWcgPSBib2FyZC5nZXRLZXlBdERvbVBvcyhwb3NpdGlvbiwgYXNXaGl0ZSwgYm91bmRzLCBzLmdlb21ldHJ5KTtcbiAgICBpZiAoIW9yaWcpXG4gICAgICAgIHJldHVybjtcbiAgICBjb25zdCBwaWVjZSA9IHMucGllY2VzW29yaWddO1xuICAgIGNvbnN0IHByZXZpb3VzbHlTZWxlY3RlZCA9IHMuc2VsZWN0ZWQ7XG4gICAgaWYgKCFwcmV2aW91c2x5U2VsZWN0ZWQgJiYgcy5kcmF3YWJsZS5lbmFibGVkICYmIChzLmRyYXdhYmxlLmVyYXNlT25DbGljayB8fCAoIXBpZWNlIHx8IHBpZWNlLmNvbG9yICE9PSBzLnR1cm5Db2xvcikpKVxuICAgICAgICBkcmF3XzEuY2xlYXIocyk7XG4gICAgaWYgKGUuY2FuY2VsYWJsZSAhPT0gZmFsc2UgJiZcbiAgICAgICAgKCFlLnRvdWNoZXMgfHwgIXMubW92YWJsZS5jb2xvciB8fCBwaWVjZSB8fCBwcmV2aW91c2x5U2VsZWN0ZWQgfHwgcGllY2VDbG9zZVRvKHMsIHBvc2l0aW9uKSkpXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBoYWRQcmVtb3ZlID0gISFzLnByZW1vdmFibGUuY3VycmVudDtcbiAgICBjb25zdCBoYWRQcmVkcm9wID0gISFzLnByZWRyb3BwYWJsZS5jdXJyZW50O1xuICAgIHMuc3RhdHMuY3RybEtleSA9IGUuY3RybEtleTtcbiAgICBpZiAocy5zZWxlY3RlZCAmJiBib2FyZC5jYW5Nb3ZlKHMsIHMuc2VsZWN0ZWQsIG9yaWcpKSB7XG4gICAgICAgIGFuaW1fMS5hbmltKHN0YXRlID0+IGJvYXJkLnNlbGVjdFNxdWFyZShzdGF0ZSwgb3JpZyksIHMpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYm9hcmQuc2VsZWN0U3F1YXJlKHMsIG9yaWcpO1xuICAgIH1cbiAgICBjb25zdCBzdGlsbFNlbGVjdGVkID0gcy5zZWxlY3RlZCA9PT0gb3JpZztcbiAgICBjb25zdCBlbGVtZW50ID0gcGllY2VFbGVtZW50QnlLZXkocywgb3JpZyk7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gcy5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgaWYgKHBpZWNlICYmIGVsZW1lbnQgJiYgc3RpbGxTZWxlY3RlZCAmJiBib2FyZC5pc0RyYWdnYWJsZShzLCBvcmlnKSkge1xuICAgICAgICBjb25zdCBzcXVhcmVCb3VuZHMgPSBjb21wdXRlU3F1YXJlQm91bmRzKG9yaWcsIGFzV2hpdGUsIGJvdW5kcywgcy5kaW1lbnNpb25zKTtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHtcbiAgICAgICAgICAgIG9yaWc6IG9yaWcsXG4gICAgICAgICAgICBvcmlnUG9zOiB1dGlsLmtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKSxcbiAgICAgICAgICAgIHBpZWNlOiBwaWVjZSxcbiAgICAgICAgICAgIHJlbDogcG9zaXRpb24sXG4gICAgICAgICAgICBlcG9zOiBwb3NpdGlvbixcbiAgICAgICAgICAgIHBvczogWzAsIDBdLFxuICAgICAgICAgICAgZGVjOiBzLmRyYWdnYWJsZS5jZW50ZXJQaWVjZSA/IFtcbiAgICAgICAgICAgICAgICBwb3NpdGlvblswXSAtIChzcXVhcmVCb3VuZHMubGVmdCArIHNxdWFyZUJvdW5kcy53aWR0aCAvIDIpLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uWzFdIC0gKHNxdWFyZUJvdW5kcy50b3AgKyBzcXVhcmVCb3VuZHMuaGVpZ2h0IC8gMilcbiAgICAgICAgICAgIF0gOiBbMCwgMF0sXG4gICAgICAgICAgICBzdGFydGVkOiBzLmRyYWdnYWJsZS5hdXRvRGlzdGFuY2UgJiYgcy5zdGF0cy5kcmFnZ2VkLFxuICAgICAgICAgICAgZWxlbWVudDogZWxlbWVudCxcbiAgICAgICAgICAgIHByZXZpb3VzbHlTZWxlY3RlZDogcHJldmlvdXNseVNlbGVjdGVkLFxuICAgICAgICAgICAgb3JpZ2luVGFyZ2V0OiBlLnRhcmdldFxuICAgICAgICB9O1xuICAgICAgICBlbGVtZW50LmNnRHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgICBlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgICAgIGNvbnN0IGdob3N0ID0gcy5kb20uZWxlbWVudHMuZ2hvc3Q7XG4gICAgICAgIGlmIChnaG9zdCkge1xuICAgICAgICAgICAgZ2hvc3QuY2xhc3NOYW1lID0gYGdob3N0ICR7cGllY2UuY29sb3J9ICR7cGllY2Uucm9sZX1gO1xuICAgICAgICAgICAgdXRpbC50cmFuc2xhdGVBYnMoZ2hvc3QsIHV0aWwucG9zVG9UcmFuc2xhdGVBYnMoYm91bmRzLCBzLmRpbWVuc2lvbnMpKHV0aWwua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLCBhc1doaXRlKSk7XG4gICAgICAgICAgICB1dGlsLnNldFZpc2libGUoZ2hvc3QsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHByb2Nlc3NEcmFnKHMpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGhhZFByZW1vdmUpXG4gICAgICAgICAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgICAgIGlmIChoYWRQcmVkcm9wKVxuICAgICAgICAgICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIH1cbiAgICBzLmRvbS5yZWRyYXcoKTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbmZ1bmN0aW9uIHBpZWNlQ2xvc2VUbyhzLCBwb3MpIHtcbiAgICBjb25zdCBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgYm91bmRzID0gcy5kb20uYm91bmRzKCksIHJhZGl1c1NxID0gTWF0aC5wb3coYm91bmRzLndpZHRoIC8gOCwgMik7XG4gICAgZm9yIChsZXQga2V5IGluIHMucGllY2VzKSB7XG4gICAgICAgIGNvbnN0IHNxdWFyZUJvdW5kcyA9IGNvbXB1dGVTcXVhcmVCb3VuZHMoa2V5LCBhc1doaXRlLCBib3VuZHMsIHMuZGltZW5zaW9ucyksIGNlbnRlciA9IFtcbiAgICAgICAgICAgIHNxdWFyZUJvdW5kcy5sZWZ0ICsgc3F1YXJlQm91bmRzLndpZHRoIC8gMixcbiAgICAgICAgICAgIHNxdWFyZUJvdW5kcy50b3AgKyBzcXVhcmVCb3VuZHMuaGVpZ2h0IC8gMlxuICAgICAgICBdO1xuICAgICAgICBpZiAodXRpbC5kaXN0YW5jZVNxKGNlbnRlciwgcG9zKSA8PSByYWRpdXNTcSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5leHBvcnRzLnBpZWNlQ2xvc2VUbyA9IHBpZWNlQ2xvc2VUbztcbmZ1bmN0aW9uIGRyYWdOZXdQaWVjZShzLCBwaWVjZSwgZSwgZm9yY2UpIHtcbiAgICBjb25zdCBrZXkgPSAnYTAnO1xuICAgIHMucGllY2VzW2tleV0gPSBwaWVjZTtcbiAgICBzLmRvbS5yZWRyYXcoKTtcbiAgICBjb25zdCBwb3NpdGlvbiA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKSwgYXNXaGl0ZSA9IHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIGJvdW5kcyA9IHMuZG9tLmJvdW5kcygpLCBzcXVhcmVCb3VuZHMgPSBjb21wdXRlU3F1YXJlQm91bmRzKGtleSwgYXNXaGl0ZSwgYm91bmRzLCBzLmRpbWVuc2lvbnMpO1xuICAgIGNvbnN0IHJlbCA9IFtcbiAgICAgICAgKGFzV2hpdGUgPyAwIDogcy5kaW1lbnNpb25zLndpZHRoIC0gMSkgKiBzcXVhcmVCb3VuZHMud2lkdGggKyBib3VuZHMubGVmdCxcbiAgICAgICAgKGFzV2hpdGUgPyBzLmRpbWVuc2lvbnMuaGVpZ2h0IDogLTEpICogc3F1YXJlQm91bmRzLmhlaWdodCArIGJvdW5kcy50b3BcbiAgICBdO1xuICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIG9yaWc6IGtleSxcbiAgICAgICAgb3JpZ1BvczogdXRpbC5rZXkycG9zKGtleSwgZmlyc3RSYW5rSXMwKSxcbiAgICAgICAgcGllY2U6IHBpZWNlLFxuICAgICAgICByZWw6IHJlbCxcbiAgICAgICAgZXBvczogcG9zaXRpb24sXG4gICAgICAgIHBvczogW3Bvc2l0aW9uWzBdIC0gcmVsWzBdLCBwb3NpdGlvblsxXSAtIHJlbFsxXV0sXG4gICAgICAgIGRlYzogWy1zcXVhcmVCb3VuZHMud2lkdGggLyAyLCAtc3F1YXJlQm91bmRzLmhlaWdodCAvIDJdLFxuICAgICAgICBzdGFydGVkOiB0cnVlLFxuICAgICAgICBlbGVtZW50OiAoKSA9PiBwaWVjZUVsZW1lbnRCeUtleShzLCBrZXkpLFxuICAgICAgICBvcmlnaW5UYXJnZXQ6IGUudGFyZ2V0LFxuICAgICAgICBuZXdQaWVjZTogdHJ1ZSxcbiAgICAgICAgZm9yY2U6IGZvcmNlIHx8IGZhbHNlXG4gICAgfTtcbiAgICBwcm9jZXNzRHJhZyhzKTtcbn1cbmV4cG9ydHMuZHJhZ05ld1BpZWNlID0gZHJhZ05ld1BpZWNlO1xuZnVuY3Rpb24gcHJvY2Vzc0RyYWcocykge1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgICAgIGlmICghY3VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAocy5hbmltYXRpb24uY3VycmVudCAmJiBzLmFuaW1hdGlvbi5jdXJyZW50LnBsYW4uYW5pbXNbY3VyLm9yaWddKVxuICAgICAgICAgICAgcy5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgb3JpZ1BpZWNlID0gcy5waWVjZXNbY3VyLm9yaWddO1xuICAgICAgICBpZiAoIW9yaWdQaWVjZSB8fCAhdXRpbC5zYW1lUGllY2Uob3JpZ1BpZWNlLCBjdXIucGllY2UpKVxuICAgICAgICAgICAgY2FuY2VsKHMpO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghY3VyLnN0YXJ0ZWQgJiYgdXRpbC5kaXN0YW5jZVNxKGN1ci5lcG9zLCBjdXIucmVsKSA+PSBNYXRoLnBvdyhzLmRyYWdnYWJsZS5kaXN0YW5jZSwgMikpXG4gICAgICAgICAgICAgICAgY3VyLnN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKGN1ci5zdGFydGVkKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXIuZWxlbWVudCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGN1ci5lbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZm91bmQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGN1ci5lbGVtZW50ID0gZm91bmQ7XG4gICAgICAgICAgICAgICAgICAgIGN1ci5lbGVtZW50LmNnRHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjdXIuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgYm91bmRzID0gcy5kb20uYm91bmRzKCk7XG4gICAgICAgICAgICAgICAgY3VyLnBvcyA9IFtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVwb3NbMF0gLSBjdXIucmVsWzBdLFxuICAgICAgICAgICAgICAgICAgICBjdXIuZXBvc1sxXSAtIGN1ci5yZWxbMV1cbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRyYW5zbGF0aW9uID0gdXRpbC5wb3NUb1RyYW5zbGF0ZUFicyhib3VuZHMsIHMuZGltZW5zaW9ucykoY3VyLm9yaWdQb3MsIGFzV2hpdGUpO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0aW9uWzBdICs9IGN1ci5wb3NbMF0gKyBjdXIuZGVjWzBdO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0aW9uWzFdICs9IGN1ci5wb3NbMV0gKyBjdXIuZGVjWzFdO1xuICAgICAgICAgICAgICAgIHV0aWwudHJhbnNsYXRlQWJzKGN1ci5lbGVtZW50LCB0cmFuc2xhdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcHJvY2Vzc0RyYWcocyk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiBtb3ZlKHMsIGUpIHtcbiAgICBpZiAocy5kcmFnZ2FibGUuY3VycmVudCAmJiAoIWUudG91Y2hlcyB8fCBlLnRvdWNoZXMubGVuZ3RoIDwgMikpIHtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudC5lcG9zID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpO1xuICAgIH1cbn1cbmV4cG9ydHMubW92ZSA9IG1vdmU7XG5mdW5jdGlvbiBlbmQocywgZSkge1xuICAgIGNvbnN0IGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKCFjdXIpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAoZS50eXBlID09PSAndG91Y2hlbmQnICYmIGUuY2FuY2VsYWJsZSAhPT0gZmFsc2UpXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBpZiAoZS50eXBlID09PSAndG91Y2hlbmQnICYmIGN1ciAmJiBjdXIub3JpZ2luVGFyZ2V0ICE9PSBlLnRhcmdldCAmJiAhY3VyLm5ld1BpZWNlKSB7XG4gICAgICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYm9hcmQudW5zZXRQcmVtb3ZlKHMpO1xuICAgIGJvYXJkLnVuc2V0UHJlZHJvcChzKTtcbiAgICBjb25zdCBldmVudFBvcyA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKSB8fCBjdXIuZXBvcztcbiAgICBjb25zdCBkZXN0ID0gYm9hcmQuZ2V0S2V5QXREb21Qb3MoZXZlbnRQb3MsIHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIHMuZG9tLmJvdW5kcygpLCBzLmdlb21ldHJ5KTtcbiAgICBpZiAoZGVzdCAmJiBjdXIuc3RhcnRlZCkge1xuICAgICAgICBpZiAoY3VyLm5ld1BpZWNlKVxuICAgICAgICAgICAgYm9hcmQuZHJvcE5ld1BpZWNlKHMsIGN1ci5vcmlnLCBkZXN0LCBjdXIuZm9yY2UpO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHMuc3RhdHMuY3RybEtleSA9IGUuY3RybEtleTtcbiAgICAgICAgICAgIGlmIChib2FyZC51c2VyTW92ZShzLCBjdXIub3JpZywgZGVzdCkpXG4gICAgICAgICAgICAgICAgcy5zdGF0cy5kcmFnZ2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChjdXIubmV3UGllY2UpIHtcbiAgICAgICAgZGVsZXRlIHMucGllY2VzW2N1ci5vcmlnXTtcbiAgICB9XG4gICAgZWxzZSBpZiAocy5kcmFnZ2FibGUuZGVsZXRlT25Ecm9wT2ZmKSB7XG4gICAgICAgIGRlbGV0ZSBzLnBpZWNlc1tjdXIub3JpZ107XG4gICAgICAgIGJvYXJkLmNhbGxVc2VyRnVuY3Rpb24ocy5ldmVudHMuY2hhbmdlKTtcbiAgICB9XG4gICAgaWYgKGN1ciAmJiBjdXIub3JpZyA9PT0gY3VyLnByZXZpb3VzbHlTZWxlY3RlZCAmJiAoY3VyLm9yaWcgPT09IGRlc3QgfHwgIWRlc3QpKVxuICAgICAgICBib2FyZC51bnNlbGVjdChzKTtcbiAgICBlbHNlIGlmICghcy5zZWxlY3RhYmxlLmVuYWJsZWQpXG4gICAgICAgIGJvYXJkLnVuc2VsZWN0KHMpO1xuICAgIHJlbW92ZURyYWdFbGVtZW50cyhzKTtcbiAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgIHMuZG9tLnJlZHJhdygpO1xufVxuZXhwb3J0cy5lbmQgPSBlbmQ7XG5mdW5jdGlvbiBjYW5jZWwocykge1xuICAgIGNvbnN0IGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKGN1cikge1xuICAgICAgICBpZiAoY3VyLm5ld1BpZWNlKVxuICAgICAgICAgICAgZGVsZXRlIHMucGllY2VzW2N1ci5vcmlnXTtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgYm9hcmQudW5zZWxlY3Qocyk7XG4gICAgICAgIHJlbW92ZURyYWdFbGVtZW50cyhzKTtcbiAgICAgICAgcy5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuZXhwb3J0cy5jYW5jZWwgPSBjYW5jZWw7XG5mdW5jdGlvbiByZW1vdmVEcmFnRWxlbWVudHMocykge1xuICAgIGNvbnN0IGUgPSBzLmRvbS5lbGVtZW50cztcbiAgICBpZiAoZS5naG9zdClcbiAgICAgICAgdXRpbC5zZXRWaXNpYmxlKGUuZ2hvc3QsIGZhbHNlKTtcbn1cbmZ1bmN0aW9uIGNvbXB1dGVTcXVhcmVCb3VuZHMoa2V5LCBhc1doaXRlLCBib3VuZHMsIGJkKSB7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gYmQuaGVpZ2h0ID09PSAxMDtcbiAgICBjb25zdCBwb3MgPSB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApO1xuICAgIGlmICghYXNXaGl0ZSkge1xuICAgICAgICBwb3NbMF0gPSBiZC53aWR0aCArIDEgLSBwb3NbMF07XG4gICAgICAgIHBvc1sxXSA9IGJkLmhlaWdodCArIDEgLSBwb3NbMV07XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIGxlZnQ6IGJvdW5kcy5sZWZ0ICsgYm91bmRzLndpZHRoICogKHBvc1swXSAtIDEpIC8gYmQud2lkdGgsXG4gICAgICAgIHRvcDogYm91bmRzLnRvcCArIGJvdW5kcy5oZWlnaHQgKiAoYmQuaGVpZ2h0IC0gcG9zWzFdKSAvIGJkLmhlaWdodCxcbiAgICAgICAgd2lkdGg6IGJvdW5kcy53aWR0aCAvIGJkLndpZHRoLFxuICAgICAgICBoZWlnaHQ6IGJvdW5kcy5oZWlnaHQgLyBiZC5oZWlnaHRcbiAgICB9O1xufVxuZnVuY3Rpb24gcGllY2VFbGVtZW50QnlLZXkocywga2V5KSB7XG4gICAgbGV0IGVsID0gcy5kb20uZWxlbWVudHMuYm9hcmQuZmlyc3RDaGlsZDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgaWYgKGVsLmNnS2V5ID09PSBrZXkgJiYgZWwudGFnTmFtZSA9PT0gJ1BJRUNFJylcbiAgICAgICAgICAgIHJldHVybiBlbDtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgYm9hcmRfMSA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IGJydXNoZXMgPSBbJ2dyZWVuJywgJ3JlZCcsICdibHVlJywgJ3llbGxvdyddO1xuZnVuY3Rpb24gc3RhcnQoc3RhdGUsIGUpIHtcbiAgICBpZiAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPiAxKVxuICAgICAgICByZXR1cm47XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5jdHJsS2V5ID8gYm9hcmRfMS51bnNlbGVjdChzdGF0ZSkgOiBib2FyZF8xLmNhbmNlbE1vdmUoc3RhdGUpO1xuICAgIGNvbnN0IHBvc2l0aW9uID0gdXRpbF8xLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgY29uc3Qgb3JpZyA9IGJvYXJkXzEuZ2V0S2V5QXREb21Qb3MocG9zaXRpb24sIHN0YXRlLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBzdGF0ZS5kb20uYm91bmRzKCksIHN0YXRlLmdlb21ldHJ5KTtcbiAgICBpZiAoIW9yaWcpXG4gICAgICAgIHJldHVybjtcbiAgICBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50ID0ge1xuICAgICAgICBvcmlnOiBvcmlnLFxuICAgICAgICBwb3M6IHBvc2l0aW9uLFxuICAgICAgICBicnVzaDogZXZlbnRCcnVzaChlKVxuICAgIH07XG4gICAgcHJvY2Vzc0RyYXcoc3RhdGUpO1xufVxuZXhwb3J0cy5zdGFydCA9IHN0YXJ0O1xuZnVuY3Rpb24gcHJvY2Vzc0RyYXcoc3RhdGUpIHtcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICBjb25zdCBjdXIgPSBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50O1xuICAgICAgICBpZiAoY3VyKSB7XG4gICAgICAgICAgICBjb25zdCBtb3VzZVNxID0gYm9hcmRfMS5nZXRLZXlBdERvbVBvcyhjdXIucG9zLCBzdGF0ZS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgc3RhdGUuZG9tLmJvdW5kcygpLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgICAgICBpZiAobW91c2VTcSAhPT0gY3VyLm1vdXNlU3EpIHtcbiAgICAgICAgICAgICAgICBjdXIubW91c2VTcSA9IG1vdXNlU3E7XG4gICAgICAgICAgICAgICAgY3VyLmRlc3QgPSBtb3VzZVNxICE9PSBjdXIub3JpZyA/IG1vdXNlU3EgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgc3RhdGUuZG9tLnJlZHJhd05vdygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJvY2Vzc0RyYXcoc3RhdGUpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5leHBvcnRzLnByb2Nlc3NEcmF3ID0gcHJvY2Vzc0RyYXc7XG5mdW5jdGlvbiBtb3ZlKHN0YXRlLCBlKSB7XG4gICAgaWYgKHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQpXG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQucG9zID0gdXRpbF8xLmV2ZW50UG9zaXRpb24oZSk7XG59XG5leHBvcnRzLm1vdmUgPSBtb3ZlO1xuZnVuY3Rpb24gZW5kKHN0YXRlKSB7XG4gICAgY29uc3QgY3VyID0gc3RhdGUuZHJhd2FibGUuY3VycmVudDtcbiAgICBpZiAoY3VyKSB7XG4gICAgICAgIGlmIChjdXIubW91c2VTcSlcbiAgICAgICAgICAgIGFkZFNoYXBlKHN0YXRlLmRyYXdhYmxlLCBjdXIpO1xuICAgICAgICBjYW5jZWwoc3RhdGUpO1xuICAgIH1cbn1cbmV4cG9ydHMuZW5kID0gZW5kO1xuZnVuY3Rpb24gY2FuY2VsKHN0YXRlKSB7XG4gICAgaWYgKHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgc3RhdGUuZHJhd2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIH1cbn1cbmV4cG9ydHMuY2FuY2VsID0gY2FuY2VsO1xuZnVuY3Rpb24gY2xlYXIoc3RhdGUpIHtcbiAgICBpZiAoc3RhdGUuZHJhd2FibGUuc2hhcGVzLmxlbmd0aCkge1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5zaGFwZXMgPSBbXTtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgICAgICBvbkNoYW5nZShzdGF0ZS5kcmF3YWJsZSk7XG4gICAgfVxufVxuZXhwb3J0cy5jbGVhciA9IGNsZWFyO1xuZnVuY3Rpb24gZXZlbnRCcnVzaChlKSB7XG4gICAgY29uc3QgYSA9IGUuc2hpZnRLZXkgJiYgdXRpbF8xLmlzUmlnaHRCdXR0b24oZSkgPyAxIDogMDtcbiAgICBjb25zdCBiID0gZS5hbHRLZXkgPyAyIDogMDtcbiAgICByZXR1cm4gYnJ1c2hlc1thICsgYl07XG59XG5mdW5jdGlvbiBub3QoZikge1xuICAgIHJldHVybiAoeCkgPT4gIWYoeCk7XG59XG5mdW5jdGlvbiBhZGRTaGFwZShkcmF3YWJsZSwgY3VyKSB7XG4gICAgY29uc3Qgc2FtZVNoYXBlID0gKHMpID0+IHtcbiAgICAgICAgcmV0dXJuIHMub3JpZyA9PT0gY3VyLm9yaWcgJiYgcy5kZXN0ID09PSBjdXIuZGVzdDtcbiAgICB9O1xuICAgIGNvbnN0IHNpbWlsYXIgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKHNhbWVTaGFwZSlbMF07XG4gICAgaWYgKHNpbWlsYXIpXG4gICAgICAgIGRyYXdhYmxlLnNoYXBlcyA9IGRyYXdhYmxlLnNoYXBlcy5maWx0ZXIobm90KHNhbWVTaGFwZSkpO1xuICAgIGlmICghc2ltaWxhciB8fCBzaW1pbGFyLmJydXNoICE9PSBjdXIuYnJ1c2gpXG4gICAgICAgIGRyYXdhYmxlLnNoYXBlcy5wdXNoKGN1cik7XG4gICAgb25DaGFuZ2UoZHJhd2FibGUpO1xufVxuZnVuY3Rpb24gb25DaGFuZ2UoZHJhd2FibGUpIHtcbiAgICBpZiAoZHJhd2FibGUub25DaGFuZ2UpXG4gICAgICAgIGRyYXdhYmxlLm9uQ2hhbmdlKGRyYXdhYmxlLnNoYXBlcyk7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IGJvYXJkID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IGRyYWdfMSA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG5mdW5jdGlvbiBzZXREcm9wTW9kZShzLCBwaWVjZSkge1xuICAgIHMuZHJvcG1vZGUgPSB7XG4gICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgcGllY2VcbiAgICB9O1xuICAgIGRyYWdfMS5jYW5jZWwocyk7XG59XG5leHBvcnRzLnNldERyb3BNb2RlID0gc2V0RHJvcE1vZGU7XG5mdW5jdGlvbiBjYW5jZWxEcm9wTW9kZShzKSB7XG4gICAgcy5kcm9wbW9kZSA9IHtcbiAgICAgICAgYWN0aXZlOiBmYWxzZVxuICAgIH07XG59XG5leHBvcnRzLmNhbmNlbERyb3BNb2RlID0gY2FuY2VsRHJvcE1vZGU7XG5mdW5jdGlvbiBkcm9wKHMsIGUpIHtcbiAgICBpZiAoIXMuZHJvcG1vZGUuYWN0aXZlKVxuICAgICAgICByZXR1cm47XG4gICAgYm9hcmQudW5zZXRQcmVtb3ZlKHMpO1xuICAgIGJvYXJkLnVuc2V0UHJlZHJvcChzKTtcbiAgICBjb25zdCBwaWVjZSA9IHMuZHJvcG1vZGUucGllY2U7XG4gICAgaWYgKHBpZWNlKSB7XG4gICAgICAgIHMucGllY2VzLmEwID0gcGllY2U7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpO1xuICAgICAgICBjb25zdCBkZXN0ID0gcG9zaXRpb24gJiYgYm9hcmQuZ2V0S2V5QXREb21Qb3MocG9zaXRpb24sIHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIHMuZG9tLmJvdW5kcygpLCBzLmdlb21ldHJ5KTtcbiAgICAgICAgaWYgKGRlc3QpXG4gICAgICAgICAgICBib2FyZC5kcm9wTmV3UGllY2UocywgJ2EwJywgZGVzdCk7XG4gICAgfVxuICAgIHMuZG9tLnJlZHJhdygpO1xufVxuZXhwb3J0cy5kcm9wID0gZHJvcDtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgZHJhZyA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG5jb25zdCBkcmF3ID0gcmVxdWlyZShcIi4vZHJhd1wiKTtcbmNvbnN0IGRyb3BfMSA9IHJlcXVpcmUoXCIuL2Ryb3BcIik7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gYmluZEJvYXJkKHMpIHtcbiAgICBpZiAocy52aWV3T25seSlcbiAgICAgICAgcmV0dXJuO1xuICAgIGNvbnN0IGJvYXJkRWwgPSBzLmRvbS5lbGVtZW50cy5ib2FyZCwgb25TdGFydCA9IHN0YXJ0RHJhZ09yRHJhdyhzKTtcbiAgICBib2FyZEVsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBvblN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25TdGFydCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICBpZiAocy5kaXNhYmxlQ29udGV4dE1lbnUgfHwgcy5kcmF3YWJsZS5lbmFibGVkKSB7XG4gICAgICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCBlID0+IGUucHJldmVudERlZmF1bHQoKSk7XG4gICAgfVxufVxuZXhwb3J0cy5iaW5kQm9hcmQgPSBiaW5kQm9hcmQ7XG5mdW5jdGlvbiBiaW5kRG9jdW1lbnQocywgcmVkcmF3QWxsKSB7XG4gICAgY29uc3QgdW5iaW5kcyA9IFtdO1xuICAgIGlmICghcy5kb20ucmVsYXRpdmUgJiYgcy5yZXNpemFibGUpIHtcbiAgICAgICAgY29uc3Qgb25SZXNpemUgPSAoKSA9PiB7XG4gICAgICAgICAgICBzLmRvbS5ib3VuZHMuY2xlYXIoKTtcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShyZWRyYXdBbGwpO1xuICAgICAgICB9O1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudC5ib2R5LCAnY2hlc3Nncm91bmQucmVzaXplJywgb25SZXNpemUpKTtcbiAgICB9XG4gICAgaWYgKCFzLnZpZXdPbmx5KSB7XG4gICAgICAgIGNvbnN0IG9ubW92ZSA9IGRyYWdPckRyYXcocywgZHJhZy5tb3ZlLCBkcmF3Lm1vdmUpO1xuICAgICAgICBjb25zdCBvbmVuZCA9IGRyYWdPckRyYXcocywgZHJhZy5lbmQsIGRyYXcuZW5kKTtcbiAgICAgICAgWyd0b3VjaG1vdmUnLCAnbW91c2Vtb3ZlJ10uZm9yRWFjaChldiA9PiB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudCwgZXYsIG9ubW92ZSkpKTtcbiAgICAgICAgWyd0b3VjaGVuZCcsICdtb3VzZXVwJ10uZm9yRWFjaChldiA9PiB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudCwgZXYsIG9uZW5kKSkpO1xuICAgICAgICBjb25zdCBvblNjcm9sbCA9ICgpID0+IHMuZG9tLmJvdW5kcy5jbGVhcigpO1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZSh3aW5kb3csICdzY3JvbGwnLCBvblNjcm9sbCwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcbiAgICAgICAgdW5iaW5kcy5wdXNoKHVuYmluZGFibGUod2luZG93LCAncmVzaXplJywgb25TY3JvbGwsIHsgcGFzc2l2ZTogdHJ1ZSB9KSk7XG4gICAgfVxuICAgIHJldHVybiAoKSA9PiB1bmJpbmRzLmZvckVhY2goZiA9PiBmKCkpO1xufVxuZXhwb3J0cy5iaW5kRG9jdW1lbnQgPSBiaW5kRG9jdW1lbnQ7XG5mdW5jdGlvbiB1bmJpbmRhYmxlKGVsLCBldmVudE5hbWUsIGNhbGxiYWNrLCBvcHRpb25zKSB7XG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGNhbGxiYWNrLCBvcHRpb25zKTtcbiAgICByZXR1cm4gKCkgPT4gZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGNhbGxiYWNrKTtcbn1cbmZ1bmN0aW9uIHN0YXJ0RHJhZ09yRHJhdyhzKSB7XG4gICAgcmV0dXJuIGUgPT4ge1xuICAgICAgICBpZiAocy5kcmFnZ2FibGUuY3VycmVudClcbiAgICAgICAgICAgIGRyYWcuY2FuY2VsKHMpO1xuICAgICAgICBlbHNlIGlmIChzLmRyYXdhYmxlLmN1cnJlbnQpXG4gICAgICAgICAgICBkcmF3LmNhbmNlbChzKTtcbiAgICAgICAgZWxzZSBpZiAoZS5zaGlmdEtleSB8fCB1dGlsXzEuaXNSaWdodEJ1dHRvbihlKSkge1xuICAgICAgICAgICAgaWYgKHMuZHJhd2FibGUuZW5hYmxlZClcbiAgICAgICAgICAgICAgICBkcmF3LnN0YXJ0KHMsIGUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFzLnZpZXdPbmx5KSB7XG4gICAgICAgICAgICBpZiAocy5kcm9wbW9kZS5hY3RpdmUpXG4gICAgICAgICAgICAgICAgZHJvcF8xLmRyb3AocywgZSk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgZHJhZy5zdGFydChzLCBlKTtcbiAgICAgICAgfVxuICAgIH07XG59XG5mdW5jdGlvbiBkcmFnT3JEcmF3KHMsIHdpdGhEcmFnLCB3aXRoRHJhdykge1xuICAgIHJldHVybiBlID0+IHtcbiAgICAgICAgaWYgKGUuc2hpZnRLZXkgfHwgdXRpbF8xLmlzUmlnaHRCdXR0b24oZSkpIHtcbiAgICAgICAgICAgIGlmIChzLmRyYXdhYmxlLmVuYWJsZWQpXG4gICAgICAgICAgICAgICAgd2l0aERyYXcocywgZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXMudmlld09ubHkpXG4gICAgICAgICAgICB3aXRoRHJhZyhzLCBlKTtcbiAgICB9O1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiBleHBsb3Npb24oc3RhdGUsIGtleXMpIHtcbiAgICBzdGF0ZS5leHBsb2RpbmcgPSB7XG4gICAgICAgIHN0YWdlOiAxLFxuICAgICAgICBrZXlzOiBrZXlzXG4gICAgfTtcbiAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHNldFN0YWdlKHN0YXRlLCAyKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBzZXRTdGFnZShzdGF0ZSwgdW5kZWZpbmVkKSwgMTIwKTtcbiAgICB9LCAxMjApO1xufVxuZXhwb3J0cy5kZWZhdWx0ID0gZXhwbG9zaW9uO1xuZnVuY3Rpb24gc2V0U3RhZ2Uoc3RhdGUsIHN0YWdlKSB7XG4gICAgaWYgKHN0YXRlLmV4cGxvZGluZykge1xuICAgICAgICBpZiAoc3RhZ2UpXG4gICAgICAgICAgICBzdGF0ZS5leHBsb2Rpbmcuc3RhZ2UgPSBzdGFnZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc3RhdGUuZXhwbG9kaW5nID0gdW5kZWZpbmVkO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmV4cG9ydHMuaW5pdGlhbCA9ICdybmJxa2Juci9wcHBwcHBwcC84LzgvOC84L1BQUFBQUFBQL1JOQlFLQk5SJztcbmNvbnN0IHJvbGVzOCA9IHtcbiAgICBwOiAncGF3bicsIHI6ICdyb29rJywgbjogJ2tuaWdodCcsIGI6ICdiaXNob3AnLCBxOiAncXVlZW4nLCBrOiAna2luZycsIG06ICdtZXQnLCBmOiAnZmVyeicsIHM6ICdzaWx2ZXInLCBjOiAnY2FuY2VsbG9yJywgYTogJ2FyY2hiaXNob3AnLCBoOiAnaGF3aycsIGU6ICdlbGVwaGFudCdcbn07XG5jb25zdCByb2xlczkgPSB7XG4gICAgcDogJ3Bhd24nLCByOiAncm9vaycsIG46ICdrbmlnaHQnLCBiOiAnYmlzaG9wJywgazogJ2tpbmcnLCBnOiAnZ29sZCcsIHM6ICdzaWx2ZXInLCBsOiAnbGFuY2UnXG59O1xuY29uc3Qgcm9sZXMxMCA9IHtcbiAgICBwOiAncGF3bicsIHI6ICdyb29rJywgbjogJ2tuaWdodCcsIGI6ICdiaXNob3AnLCBrOiAna2luZycsIGM6ICdjYW5ub24nLCBhOiAnYWR2aXNvcidcbn07XG5jb25zdCBsZXR0ZXJzOCA9IHtcbiAgICBwYXduOiAncCcsIHJvb2s6ICdyJywga25pZ2h0OiAnbicsIGJpc2hvcDogJ2InLCBxdWVlbjogJ3EnLCBraW5nOiAnaycsIG1ldDogJ20nLCBmZXJ6OiAnZicsIHNpbHZlcjogJ3MnLCBjYW5jZWxsb3I6ICdjJywgYXJjaGJpc2hvcDogJ2EnLCBoYXdrOiAnaCcsIGVsZXBoYW50OiAnZSdcbn07XG5jb25zdCBsZXR0ZXJzOSA9IHtcbiAgICBwYXduOiAncCcsIHJvb2s6ICdyJywga25pZ2h0OiAnbicsIGJpc2hvcDogJ2InLCBraW5nOiAnaycsIGdvbGQ6ICdnJywgc2lsdmVyOiAncycsIGxhbmNlOiAnbCcsXG4gICAgcHBhd246ICcrcCcsIHBrbmlnaHQ6ICcrbicsIHBiaXNob3A6ICcrYicsIHByb29rOiAnK3InLCBwc2lsdmVyOiAnK3MnLCBwbGFuY2U6ICcrbCdcbn07XG5jb25zdCBsZXR0ZXJzMTAgPSB7XG4gICAgcGF3bjogJ3AnLCByb29rOiAncicsIGtuaWdodDogJ24nLCBiaXNob3A6ICdiJywga2luZzogJ2snLCBjYW5ub246ICdjJywgYWR2aXNvcjogJ2EnXG59O1xuZnVuY3Rpb24gcmVhZChmZW4pIHtcbiAgICBpZiAoZmVuID09PSAnc3RhcnQnKVxuICAgICAgICBmZW4gPSBleHBvcnRzLmluaXRpYWw7XG4gICAgaWYgKGZlbi5pbmRleE9mKCdbJykgIT09IC0xKVxuICAgICAgICBmZW4gPSBmZW4uc2xpY2UoMCwgZmVuLmluZGV4T2YoJ1snKSk7XG4gICAgY29uc3QgcGllY2VzID0ge307XG4gICAgbGV0IHJvdyA9IGZlbi5zcGxpdChcIi9cIikubGVuZ3RoO1xuICAgIGxldCBjb2wgPSAwO1xuICAgIGxldCBwcm9tb3RlZCA9IGZhbHNlO1xuICAgIGNvbnN0IHJvbGVzID0gcm93ID09PSAxMCA/IHJvbGVzMTAgOiByb3cgPT09IDkgPyByb2xlczkgOiByb2xlczg7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gcm93ID09PSAxMDtcbiAgICBjb25zdCBzaG9naSA9IHJvdyA9PT0gOTtcbiAgICBmb3IgKGNvbnN0IGMgb2YgZmVuKSB7XG4gICAgICAgIHN3aXRjaCAoYykge1xuICAgICAgICAgICAgY2FzZSAnICc6IHJldHVybiBwaWVjZXM7XG4gICAgICAgICAgICBjYXNlICcvJzpcbiAgICAgICAgICAgICAgICAtLXJvdztcbiAgICAgICAgICAgICAgICBpZiAocm93ID09PSAwKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGllY2VzO1xuICAgICAgICAgICAgICAgIGNvbCA9IDA7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICcrJzpcbiAgICAgICAgICAgICAgICBwcm9tb3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd+JzpcbiAgICAgICAgICAgICAgICBjb25zdCBwaWVjZSA9IHBpZWNlc1tjZy5maWxlc1tjb2xdICsgY2cucmFua3NbZmlyc3RSYW5rSXMwID8gcm93IDogcm93ICsgMV1dO1xuICAgICAgICAgICAgICAgIGlmIChwaWVjZSlcbiAgICAgICAgICAgICAgICAgICAgcGllY2UucHJvbW90ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBjb25zdCBuYiA9IGMuY2hhckNvZGVBdCgwKTtcbiAgICAgICAgICAgICAgICBpZiAobmIgPCA1OClcbiAgICAgICAgICAgICAgICAgICAgY29sICs9IChjID09PSAnMCcpID8gOSA6IG5iIC0gNDg7XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICsrY29sO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gYy50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgcGllY2UgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlc1tyb2xlXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiAoYyA9PT0gcm9sZSA/IHNob2dpID8gJ3doaXRlJyA6ICdibGFjaycgOiBzaG9naSA/ICdibGFjaycgOiAnd2hpdGUnKVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvbW90ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBpZWNlLnJvbGUgPSAncCcgKyBwaWVjZS5yb2xlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGllY2UucHJvbW90ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvbW90ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICA7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzaG9naSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGllY2VzW2NnLmZpbGVzWzEwIC0gY29sIC0gMV0gKyBjZy5yYW5rc1sxMCAtIHJvd11dID0gcGllY2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZXNbY2cuZmlsZXNbY29sIC0gMV0gKyBjZy5yYW5rc1tmaXJzdFJhbmtJczAgPyByb3cgLSAxIDogcm93XV0gPSBwaWVjZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwaWVjZXM7XG59XG5leHBvcnRzLnJlYWQgPSByZWFkO1xuZnVuY3Rpb24gd3JpdGUocGllY2VzLCBnZW9tKSB7XG4gICAgY29uc3QgaGVpZ2h0ID0gY2cuZGltZW5zaW9uc1tnZW9tXS5oZWlnaHQ7XG4gICAgdmFyIGxldHRlcnMgPSB7fTtcbiAgICBzd2l0Y2ggKGhlaWdodCkge1xuICAgICAgICBjYXNlIDEwOlxuICAgICAgICAgICAgbGV0dGVycyA9IGxldHRlcnMxMDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDk6XG4gICAgICAgICAgICBsZXR0ZXJzID0gbGV0dGVyczk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGxldHRlcnMgPSBsZXR0ZXJzODtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICA7XG4gICAgcmV0dXJuIHV0aWxfMS5pbnZOUmFua3MubWFwKHkgPT4gdXRpbF8xLk5SYW5rcy5tYXAoeCA9PiB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0gcGllY2VzW3V0aWxfMS5wb3Mya2V5KFt4LCB5XSwgZ2VvbSldO1xuICAgICAgICBpZiAocGllY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IGxldHRlciA9IGxldHRlcnNbcGllY2Uucm9sZV07XG4gICAgICAgICAgICByZXR1cm4gcGllY2UuY29sb3IgPT09ICd3aGl0ZScgPyBsZXR0ZXIudG9VcHBlckNhc2UoKSA6IGxldHRlcjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gJzEnO1xuICAgIH0pLmpvaW4oJycpKS5qb2luKCcvJykucmVwbGFjZSgvMXsyLH0vZywgcyA9PiBzLmxlbmd0aC50b1N0cmluZygpKTtcbn1cbmV4cG9ydHMud3JpdGUgPSB3cml0ZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5jb25zdCBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZnVuY3Rpb24gZGlmZihhLCBiKSB7XG4gICAgcmV0dXJuIE1hdGguYWJzKGEgLSBiKTtcbn1cbmZ1bmN0aW9uIHBhd24oY29sb3IpIHtcbiAgICByZXR1cm4gKHgxLCB5MSwgeDIsIHkyKSA9PiBkaWZmKHgxLCB4MikgPCAyICYmIChjb2xvciA9PT0gJ3doaXRlJyA/ICh5MiA9PT0geTEgKyAxIHx8ICh5MSA8PSAyICYmIHkyID09PSAoeTEgKyAyKSAmJiB4MSA9PT0geDIpKSA6ICh5MiA9PT0geTEgLSAxIHx8ICh5MSA+PSA3ICYmIHkyID09PSAoeTEgLSAyKSAmJiB4MSA9PT0geDIpKSk7XG59XG5jb25zdCBrbmlnaHQgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICBjb25zdCB4ZCA9IGRpZmYoeDEsIHgyKTtcbiAgICBjb25zdCB5ZCA9IGRpZmYoeTEsIHkyKTtcbiAgICByZXR1cm4gKHhkID09PSAxICYmIHlkID09PSAyKSB8fCAoeGQgPT09IDIgJiYgeWQgPT09IDEpO1xufTtcbmNvbnN0IGJpc2hvcCA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPT09IGRpZmYoeTEsIHkyKTtcbn07XG5jb25zdCByb29rID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIHgxID09PSB4MiB8fCB5MSA9PT0geTI7XG59O1xuY29uc3QgcXVlZW4gPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gYmlzaG9wKHgxLCB5MSwgeDIsIHkyKSB8fCByb29rKHgxLCB5MSwgeDIsIHkyKTtcbn07XG5mdW5jdGlvbiBraW5nKGNvbG9yLCByb29rRmlsZXMsIGNhbkNhc3RsZSkge1xuICAgIHJldHVybiAoeDEsIHkxLCB4MiwgeTIpID0+IChkaWZmKHgxLCB4MikgPCAyICYmIGRpZmYoeTEsIHkyKSA8IDIpIHx8IChjYW5DYXN0bGUgJiYgeTEgPT09IHkyICYmIHkxID09PSAoY29sb3IgPT09ICd3aGl0ZScgPyAxIDogOCkgJiYgKCh4MSA9PT0gNSAmJiAoeDIgPT09IDMgfHwgeDIgPT09IDcpKSB8fCB1dGlsLmNvbnRhaW5zWChyb29rRmlsZXMsIHgyKSkpO1xufVxuY29uc3QgbWV0ID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpICYmIGRpZmYoeDEsIHgyKSA9PT0gMTtcbn07XG5jb25zdCBhcmNoYmlzaG9wID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIGJpc2hvcCh4MSwgeTEsIHgyLCB5MikgfHwga25pZ2h0KHgxLCB5MSwgeDIsIHkyKTtcbn07XG5jb25zdCBjYW5jZWxsb3IgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gcm9vayh4MSwgeTEsIHgyLCB5MikgfHwga25pZ2h0KHgxLCB5MSwgeDIsIHkyKTtcbn07XG5mdW5jdGlvbiBsYW5jZShjb2xvcikge1xuICAgIHJldHVybiAoeDEsIHkxLCB4MiwgeTIpID0+ICh4MiA9PT0geDEgJiYgKGNvbG9yID09PSAnd2hpdGUnID8geTIgPiB5MSA6IHkyIDwgeTEpKTtcbn1cbmZ1bmN0aW9uIHNpbHZlcihjb2xvcikge1xuICAgIHJldHVybiAoeDEsIHkxLCB4MiwgeTIpID0+IChtZXQoeDEsIHkxLCB4MiwgeTIpIHx8ICh4MSA9PT0geDIgJiYgKGNvbG9yID09PSAnd2hpdGUnID8geTIgPT09IHkxICsgMSA6IHkyID09PSB5MSAtIDEpKSk7XG59XG5mdW5jdGlvbiBnb2xkKGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMiAmJiAoY29sb3IgPT09ICd3aGl0ZScgP1xuICAgICAgICAhKCh4MiA9PT0geDEgLSAxICYmIHkyID09PSB5MSAtIDEpIHx8ICh4MiA9PT0geDEgKyAxICYmIHkyID09PSB5MSAtIDEpKSA6XG4gICAgICAgICEoKHgyID09PSB4MSArIDEgJiYgeTIgPT09IHkxICsgMSkgfHwgKHgyID09PSB4MSAtIDEgJiYgeTIgPT09IHkxICsgMSkpKSk7XG59XG5mdW5jdGlvbiBzcGF3bihjb2xvcikge1xuICAgIHJldHVybiAoeDEsIHkxLCB4MiwgeTIpID0+ICh4MiA9PT0geDEgJiYgKGNvbG9yID09PSAnd2hpdGUnID8geTIgPT09IHkxICsgMSA6IHkyID09PSB5MSAtIDEpKTtcbn1cbmZ1bmN0aW9uIHNrbmlnaHQoY29sb3IpIHtcbiAgICByZXR1cm4gKHgxLCB5MSwgeDIsIHkyKSA9PiBjb2xvciA9PT0gJ3doaXRlJyA/XG4gICAgICAgICh5MiA9PT0geTEgKyAyICYmIHgyID09PSB4MSAtIDEgfHwgeTIgPT09IHkxICsgMiAmJiB4MiA9PT0geDEgKyAxKSA6XG4gICAgICAgICh5MiA9PT0geTEgLSAyICYmIHgyID09PSB4MSAtIDEgfHwgeTIgPT09IHkxIC0gMiAmJiB4MiA9PT0geDEgKyAxKTtcbn1cbmNvbnN0IHByb29rID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIHJvb2soeDEsIHkxLCB4MiwgeTIpIHx8IChkaWZmKHgxLCB4MikgPCAyICYmIGRpZmYoeTEsIHkyKSA8IDIpO1xufTtcbmNvbnN0IHBiaXNob3AgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gYmlzaG9wKHgxLCB5MSwgeDIsIHkyKSB8fCAoZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyKTtcbn07XG5jb25zdCBza2luZyA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPCAyICYmIGRpZmYoeTEsIHkyKSA8IDI7XG59O1xuZnVuY3Rpb24geHBhd24oY29sb3IpIHtcbiAgICByZXR1cm4gKHgxLCB5MSwgeDIsIHkyKSA9PiAoKHgyID09PSB4MSAmJiAoY29sb3IgPT09ICd3aGl0ZScgPyB5MiA9PT0geTEgKyAxIDogeTIgPT09IHkxIC0gMSkpIHx8XG4gICAgICAgICh5MiA9PT0geTEgJiYgKHgyID09PSB4MSArIDEgfHwgeDIgPT09IHgxIC0gMSkgJiYgKGNvbG9yID09PSAnd2hpdGUnID8geTEgPiA1IDogeTEgPCA2KSkpO1xufVxuY29uc3QgeGJpc2hvcCA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPT09IGRpZmYoeTEsIHkyKSAmJiBkaWZmKHgxLCB4MikgPT09IDI7XG59O1xuY29uc3QgYWR2aXNvciA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPT09IGRpZmYoeTEsIHkyKSAmJiBkaWZmKHgxLCB4MikgPT09IDE7XG59O1xuY29uc3QgeGtpbmcgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gKHgxID09PSB4MiB8fCB5MSA9PT0geTIpICYmIGRpZmYoeDEsIHgyKSA9PT0gMTtcbn07XG5mdW5jdGlvbiByb29rRmlsZXNPZihwaWVjZXMsIGNvbG9yLCBmaXJzdFJhbmtJczApIHtcbiAgICByZXR1cm4gT2JqZWN0LmtleXMocGllY2VzKS5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgcGllY2UgPSBwaWVjZXNba2V5XTtcbiAgICAgICAgcmV0dXJuIHBpZWNlICYmIHBpZWNlLmNvbG9yID09PSBjb2xvciAmJiBwaWVjZS5yb2xlID09PSAncm9vayc7XG4gICAgfSkubWFwKChrZXkpID0+IHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMClbMF0pO1xufVxuZnVuY3Rpb24gcHJlbW92ZShwaWVjZXMsIGtleSwgY2FuQ2FzdGxlLCBnZW9tKSB7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gY2cuZGltZW5zaW9uc1tnZW9tXS5oZWlnaHQgPT09IDEwO1xuICAgIGNvbnN0IHBpZWNlID0gcGllY2VzW2tleV0sIHBvcyA9IHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMCk7XG4gICAgbGV0IG1vYmlsaXR5O1xuICAgIHN3aXRjaCAoZ2VvbSkge1xuICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICBzd2l0Y2ggKHBpZWNlLnJvbGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdwYXduJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSB4cGF3bihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Nhbm5vbic6XG4gICAgICAgICAgICAgICAgY2FzZSAncm9vayc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcm9vaztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna25pZ2h0JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBrbmlnaHQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0geGJpc2hvcDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYWR2aXNvcic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gYWR2aXNvcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna2luZyc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0geGtpbmc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgIHN3aXRjaCAocGllY2Uucm9sZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Bhd24nOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNwYXduKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna25pZ2h0JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBza25pZ2h0KHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYmlzaG9wJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Jvb2snOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHJvb2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tpbmcnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNraW5nO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzaWx2ZXInOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNpbHZlcihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3BwYXduJzpcbiAgICAgICAgICAgICAgICBjYXNlICdwbGFuY2UnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3BrbmlnaHQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3BzaWx2ZXInOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2dvbGQnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGdvbGQocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdsYW5jZSc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gbGFuY2UocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdwcm9vayc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcHJvb2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3BiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHBiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBzd2l0Y2ggKHBpZWNlLnJvbGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdwYXduJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBwYXduKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna25pZ2h0JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBrbmlnaHQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gYmlzaG9wO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdyb29rJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSByb29rO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdxdWVlbic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcXVlZW47XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tpbmcnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGtpbmcocGllY2UuY29sb3IsIHJvb2tGaWxlc09mKHBpZWNlcywgcGllY2UuY29sb3IsIGZpcnN0UmFua0lzMCksIGNhbkNhc3RsZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2hhd2snOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2FyY2hiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGFyY2hiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2VsZXBoYW50JzpcbiAgICAgICAgICAgICAgICBjYXNlICdjYW5jZWxsb3InOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGNhbmNlbGxvcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbWV0JzpcbiAgICAgICAgICAgICAgICBjYXNlICdmZXJ6JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBtZXQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NpbHZlcic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gc2lsdmVyKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICA7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgO1xuICAgIGNvbnN0IGFsbGtleXMgPSB1dGlsLmFsbEtleXNbZ2VvbV07XG4gICAgY29uc3QgcG9zMmtleUdlb20gPSAoZ2VvbSkgPT4gKChwb3MpID0+IHV0aWwucG9zMmtleShwb3MsIGdlb20pKTtcbiAgICBjb25zdCBwb3Mya2V5ID0gcG9zMmtleUdlb20oZ2VvbSk7XG4gICAgY29uc3Qga2V5MnBvc1JhbmswID0gKGZpcnN0cmFuazApID0+ICgoa2V5KSA9PiB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdHJhbmswKSk7XG4gICAgY29uc3Qga2V5MnBvcyA9IGtleTJwb3NSYW5rMChmaXJzdFJhbmtJczApO1xuICAgIHJldHVybiBhbGxrZXlzLm1hcChrZXkycG9zKS5maWx0ZXIocG9zMiA9PiB7XG4gICAgICAgIHJldHVybiAocG9zWzBdICE9PSBwb3MyWzBdIHx8IHBvc1sxXSAhPT0gcG9zMlsxXSkgJiYgbW9iaWxpdHkocG9zWzBdLCBwb3NbMV0sIHBvczJbMF0sIHBvczJbMV0pO1xuICAgIH0pLm1hcChwb3Mya2V5KTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IHByZW1vdmU7XG47XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIHJlbmRlcihzKSB7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gcy5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgY29uc3QgYXNXaGl0ZSA9IHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIHBvc1RvVHJhbnNsYXRlID0gcy5kb20ucmVsYXRpdmUgPyB1dGlsLnBvc1RvVHJhbnNsYXRlUmVsIDogdXRpbC5wb3NUb1RyYW5zbGF0ZUFicyhzLmRvbS5ib3VuZHMoKSwgcy5kaW1lbnNpb25zKSwgdHJhbnNsYXRlID0gcy5kb20ucmVsYXRpdmUgPyB1dGlsLnRyYW5zbGF0ZVJlbCA6IHV0aWwudHJhbnNsYXRlQWJzLCBib2FyZEVsID0gcy5kb20uZWxlbWVudHMuYm9hcmQsIHBpZWNlcyA9IHMucGllY2VzLCBjdXJBbmltID0gcy5hbmltYXRpb24uY3VycmVudCwgYW5pbXMgPSBjdXJBbmltID8gY3VyQW5pbS5wbGFuLmFuaW1zIDoge30sIGZhZGluZ3MgPSBjdXJBbmltID8gY3VyQW5pbS5wbGFuLmZhZGluZ3MgOiB7fSwgY3VyRHJhZyA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQsIHNxdWFyZXMgPSBjb21wdXRlU3F1YXJlQ2xhc3NlcyhzKSwgc2FtZVBpZWNlcyA9IHt9LCBzYW1lU3F1YXJlcyA9IHt9LCBtb3ZlZFBpZWNlcyA9IHt9LCBtb3ZlZFNxdWFyZXMgPSB7fSwgcGllY2VzS2V5cyA9IE9iamVjdC5rZXlzKHBpZWNlcyk7XG4gICAgbGV0IGssIHAsIGVsLCBwaWVjZUF0S2V5LCBlbFBpZWNlTmFtZSwgYW5pbSwgZmFkaW5nLCBwTXZkc2V0LCBwTXZkLCBzTXZkc2V0LCBzTXZkO1xuICAgIGVsID0gYm9hcmRFbC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChlbCkge1xuICAgICAgICBrID0gZWwuY2dLZXk7XG4gICAgICAgIGlmIChpc1BpZWNlTm9kZShlbCkpIHtcbiAgICAgICAgICAgIHBpZWNlQXRLZXkgPSBwaWVjZXNba107XG4gICAgICAgICAgICBhbmltID0gYW5pbXNba107XG4gICAgICAgICAgICBmYWRpbmcgPSBmYWRpbmdzW2tdO1xuICAgICAgICAgICAgZWxQaWVjZU5hbWUgPSBlbC5jZ1BpZWNlO1xuICAgICAgICAgICAgaWYgKGVsLmNnRHJhZ2dpbmcgJiYgKCFjdXJEcmFnIHx8IGN1ckRyYWcub3JpZyAhPT0gaykpIHtcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShlbCwgcG9zVG9UcmFuc2xhdGUodXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKSwgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICAgICAgZWwuY2dEcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmYWRpbmcgJiYgZWwuY2dGYWRpbmcpIHtcbiAgICAgICAgICAgICAgICBlbC5jZ0ZhZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2ZhZGluZycpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBpZWNlQXRLZXkpIHtcbiAgICAgICAgICAgICAgICBpZiAoYW5pbSAmJiBlbC5jZ0FuaW1hdGluZyAmJiBlbFBpZWNlTmFtZSA9PT0gcGllY2VOYW1lT2YocGllY2VBdEtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcG9zID0gdXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdhbmltJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShlbCwgcG9zVG9UcmFuc2xhdGUocG9zLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoZWwuY2dBbmltYXRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgZWwuY2dBbmltYXRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnYW5pbScpO1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCksIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocy5hZGRQaWVjZVpJbmRleClcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLnN0eWxlLnpJbmRleCA9IHBvc1pJbmRleCh1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGVsUGllY2VOYW1lID09PSBwaWVjZU5hbWVPZihwaWVjZUF0S2V5KSAmJiAoIWZhZGluZyB8fCAhZWwuY2dGYWRpbmcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNhbWVQaWVjZXNba10gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZhZGluZyAmJiBlbFBpZWNlTmFtZSA9PT0gcGllY2VOYW1lT2YoZmFkaW5nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnZmFkaW5nJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5jZ0ZhZGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXS5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0gPSBbZWxdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXSlcbiAgICAgICAgICAgICAgICAgICAgbW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdLnB1c2goZWwpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgbW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdID0gW2VsXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc1NxdWFyZU5vZGUoZWwpKSB7XG4gICAgICAgICAgICBjb25zdCBjbiA9IGVsLmNsYXNzTmFtZTtcbiAgICAgICAgICAgIGlmIChzcXVhcmVzW2tdID09PSBjbilcbiAgICAgICAgICAgICAgICBzYW1lU3F1YXJlc1trXSA9IHRydWU7XG4gICAgICAgICAgICBlbHNlIGlmIChtb3ZlZFNxdWFyZXNbY25dKVxuICAgICAgICAgICAgICAgIG1vdmVkU3F1YXJlc1tjbl0ucHVzaChlbCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbW92ZWRTcXVhcmVzW2NuXSA9IFtlbF07XG4gICAgICAgIH1cbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yIChjb25zdCBzayBpbiBzcXVhcmVzKSB7XG4gICAgICAgIGlmICghc2FtZVNxdWFyZXNbc2tdKSB7XG4gICAgICAgICAgICBzTXZkc2V0ID0gbW92ZWRTcXVhcmVzW3NxdWFyZXNbc2tdXTtcbiAgICAgICAgICAgIHNNdmQgPSBzTXZkc2V0ICYmIHNNdmRzZXQucG9wKCk7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2xhdGlvbiA9IHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKHNrLCBmaXJzdFJhbmtJczApLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpO1xuICAgICAgICAgICAgaWYgKHNNdmQpIHtcbiAgICAgICAgICAgICAgICBzTXZkLmNnS2V5ID0gc2s7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHNNdmQsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNxdWFyZU5vZGUgPSB1dGlsXzEuY3JlYXRlRWwoJ3NxdWFyZScsIHNxdWFyZXNbc2tdKTtcbiAgICAgICAgICAgICAgICBzcXVhcmVOb2RlLmNnS2V5ID0gc2s7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHNxdWFyZU5vZGUsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgICAgICBib2FyZEVsLmluc2VydEJlZm9yZShzcXVhcmVOb2RlLCBib2FyZEVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgaiBpbiBwaWVjZXNLZXlzKSB7XG4gICAgICAgIGsgPSBwaWVjZXNLZXlzW2pdO1xuICAgICAgICBwID0gcGllY2VzW2tdO1xuICAgICAgICBhbmltID0gYW5pbXNba107XG4gICAgICAgIGlmICghc2FtZVBpZWNlc1trXSkge1xuICAgICAgICAgICAgcE12ZHNldCA9IG1vdmVkUGllY2VzW3BpZWNlTmFtZU9mKHApXTtcbiAgICAgICAgICAgIHBNdmQgPSBwTXZkc2V0ICYmIHBNdmRzZXQucG9wKCk7XG4gICAgICAgICAgICBpZiAocE12ZCkge1xuICAgICAgICAgICAgICAgIHBNdmQuY2dLZXkgPSBrO1xuICAgICAgICAgICAgICAgIGlmIChwTXZkLmNnRmFkaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIHBNdmQuY2xhc3NMaXN0LnJlbW92ZSgnZmFkaW5nJyk7XG4gICAgICAgICAgICAgICAgICAgIHBNdmQuY2dGYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcG9zID0gdXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKTtcbiAgICAgICAgICAgICAgICBpZiAocy5hZGRQaWVjZVpJbmRleClcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5zdHlsZS56SW5kZXggPSBwb3NaSW5kZXgocG9zLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICBpZiAoYW5pbSkge1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNnQW5pbWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5jbGFzc0xpc3QuYWRkKCdhbmltJyk7XG4gICAgICAgICAgICAgICAgICAgIHBvc1swXSArPSBhbmltWzJdO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMV0gKz0gYW5pbVszXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHBNdmQsIHBvc1RvVHJhbnNsYXRlKHBvcywgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaWVjZU5hbWUgPSBwaWVjZU5hbWVPZihwKSwgcGllY2VOb2RlID0gdXRpbF8xLmNyZWF0ZUVsKCdwaWVjZScsIHBpZWNlTmFtZSksIHBvcyA9IHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCk7XG4gICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnUGllY2UgPSBwaWVjZU5hbWU7XG4gICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnS2V5ID0gaztcbiAgICAgICAgICAgICAgICBpZiAoYW5pbSkge1xuICAgICAgICAgICAgICAgICAgICBwaWVjZU5vZGUuY2dBbmltYXRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMF0gKz0gYW5pbVsyXTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzFdICs9IGFuaW1bM107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShwaWVjZU5vZGUsIHBvc1RvVHJhbnNsYXRlKHBvcywgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICAgICAgaWYgKHMuYWRkUGllY2VaSW5kZXgpXG4gICAgICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5zdHlsZS56SW5kZXggPSBwb3NaSW5kZXgocG9zLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICBib2FyZEVsLmFwcGVuZENoaWxkKHBpZWNlTm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBpIGluIG1vdmVkUGllY2VzKVxuICAgICAgICByZW1vdmVOb2RlcyhzLCBtb3ZlZFBpZWNlc1tpXSk7XG4gICAgZm9yIChjb25zdCBpIGluIG1vdmVkU3F1YXJlcylcbiAgICAgICAgcmVtb3ZlTm9kZXMocywgbW92ZWRTcXVhcmVzW2ldKTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IHJlbmRlcjtcbmZ1bmN0aW9uIGlzUGllY2VOb2RlKGVsKSB7XG4gICAgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdQSUVDRSc7XG59XG5mdW5jdGlvbiBpc1NxdWFyZU5vZGUoZWwpIHtcbiAgICByZXR1cm4gZWwudGFnTmFtZSA9PT0gJ1NRVUFSRSc7XG59XG5mdW5jdGlvbiByZW1vdmVOb2RlcyhzLCBub2Rlcykge1xuICAgIGZvciAoY29uc3QgaSBpbiBub2RlcylcbiAgICAgICAgcy5kb20uZWxlbWVudHMuYm9hcmQucmVtb3ZlQ2hpbGQobm9kZXNbaV0pO1xufVxuZnVuY3Rpb24gcG9zWkluZGV4KHBvcywgYXNXaGl0ZSkge1xuICAgIGxldCB6ID0gMiArIChwb3NbMV0gLSAxKSAqIDggKyAoOCAtIHBvc1swXSk7XG4gICAgaWYgKGFzV2hpdGUpXG4gICAgICAgIHogPSA2NyAtIHo7XG4gICAgcmV0dXJuIHogKyAnJztcbn1cbmZ1bmN0aW9uIHBpZWNlTmFtZU9mKHBpZWNlKSB7XG4gICAgcmV0dXJuIGAke3BpZWNlLmNvbG9yfSAke3BpZWNlLnJvbGV9YDtcbn1cbmZ1bmN0aW9uIGNvbXB1dGVTcXVhcmVDbGFzc2VzKHMpIHtcbiAgICBjb25zdCBzcXVhcmVzID0ge307XG4gICAgbGV0IGksIGs7XG4gICAgaWYgKHMubGFzdE1vdmUgJiYgcy5oaWdobGlnaHQubGFzdE1vdmUpXG4gICAgICAgIGZvciAoaSBpbiBzLmxhc3RNb3ZlKSB7XG4gICAgICAgICAgICBpZiAocy5sYXN0TW92ZVtpXSAhPSAnYTAnKSB7XG4gICAgICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMubGFzdE1vdmVbaV0sICdsYXN0LW1vdmUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIGlmIChzLmNoZWNrICYmIHMuaGlnaGxpZ2h0LmNoZWNrKVxuICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcy5jaGVjaywgJ2NoZWNrJyk7XG4gICAgaWYgKHMuc2VsZWN0ZWQpIHtcbiAgICAgICAgaWYgKHMuc2VsZWN0ZWQgIT0gJ2EwJykge1xuICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMuc2VsZWN0ZWQsICdzZWxlY3RlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzLm1vdmFibGUuc2hvd0Rlc3RzKSB7XG4gICAgICAgICAgICBjb25zdCBkZXN0cyA9IHMubW92YWJsZS5kZXN0cyAmJiBzLm1vdmFibGUuZGVzdHNbcy5zZWxlY3RlZF07XG4gICAgICAgICAgICBpZiAoZGVzdHMpXG4gICAgICAgICAgICAgICAgZm9yIChpIGluIGRlc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIGsgPSBkZXN0c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdtb3ZlLWRlc3QnICsgKHMucGllY2VzW2tdID8gJyBvYycgOiAnJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBEZXN0cyA9IHMucHJlbW92YWJsZS5kZXN0cztcbiAgICAgICAgICAgIGlmIChwRGVzdHMpXG4gICAgICAgICAgICAgICAgZm9yIChpIGluIHBEZXN0cykge1xuICAgICAgICAgICAgICAgICAgICBrID0gcERlc3RzW2ldO1xuICAgICAgICAgICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgaywgJ3ByZW1vdmUtZGVzdCcgKyAocy5waWVjZXNba10gPyAnIG9jJyA6ICcnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHByZW1vdmUgPSBzLnByZW1vdmFibGUuY3VycmVudDtcbiAgICBpZiAocHJlbW92ZSlcbiAgICAgICAgZm9yIChpIGluIHByZW1vdmUpXG4gICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcHJlbW92ZVtpXSwgJ2N1cnJlbnQtcHJlbW92ZScpO1xuICAgIGVsc2UgaWYgKHMucHJlZHJvcHBhYmxlLmN1cnJlbnQpXG4gICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLnByZWRyb3BwYWJsZS5jdXJyZW50LmtleSwgJ2N1cnJlbnQtcHJlbW92ZScpO1xuICAgIGNvbnN0IG8gPSBzLmV4cGxvZGluZztcbiAgICBpZiAobylcbiAgICAgICAgZm9yIChpIGluIG8ua2V5cylcbiAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBvLmtleXNbaV0sICdleHBsb2RpbmcnICsgby5zdGFnZSk7XG4gICAgcmV0dXJuIHNxdWFyZXM7XG59XG5mdW5jdGlvbiBhZGRTcXVhcmUoc3F1YXJlcywga2V5LCBrbGFzcykge1xuICAgIGlmIChzcXVhcmVzW2tleV0pXG4gICAgICAgIHNxdWFyZXNba2V5XSArPSAnICcgKyBrbGFzcztcbiAgICBlbHNlXG4gICAgICAgIHNxdWFyZXNba2V5XSA9IGtsYXNzO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCBmZW4gPSByZXF1aXJlKFwiLi9mZW5cIik7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gZGVmYXVsdHMoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcGllY2VzOiBmZW4ucmVhZChmZW4uaW5pdGlhbCksXG4gICAgICAgIG9yaWVudGF0aW9uOiAnd2hpdGUnLFxuICAgICAgICB0dXJuQ29sb3I6ICd3aGl0ZScsXG4gICAgICAgIGNvb3JkaW5hdGVzOiB0cnVlLFxuICAgICAgICBhdXRvQ2FzdGxlOiB0cnVlLFxuICAgICAgICB2aWV3T25seTogZmFsc2UsXG4gICAgICAgIGRpc2FibGVDb250ZXh0TWVudTogZmFsc2UsXG4gICAgICAgIHJlc2l6YWJsZTogdHJ1ZSxcbiAgICAgICAgYWRkUGllY2VaSW5kZXg6IGZhbHNlLFxuICAgICAgICBwaWVjZUtleTogZmFsc2UsXG4gICAgICAgIGhpZ2hsaWdodDoge1xuICAgICAgICAgICAgbGFzdE1vdmU6IHRydWUsXG4gICAgICAgICAgICBjaGVjazogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBhbmltYXRpb246IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBkdXJhdGlvbjogMjAwXG4gICAgICAgIH0sXG4gICAgICAgIG1vdmFibGU6IHtcbiAgICAgICAgICAgIGZyZWU6IHRydWUsXG4gICAgICAgICAgICBjb2xvcjogJ2JvdGgnLFxuICAgICAgICAgICAgc2hvd0Rlc3RzOiB0cnVlLFxuICAgICAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgICAgIHJvb2tDYXN0bGU6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgcHJlbW92YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcbiAgICAgICAgICAgIGNhc3RsZTogdHJ1ZSxcbiAgICAgICAgICAgIGV2ZW50czoge31cbiAgICAgICAgfSxcbiAgICAgICAgcHJlZHJvcHBhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgIGV2ZW50czoge31cbiAgICAgICAgfSxcbiAgICAgICAgZHJhZ2dhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgZGlzdGFuY2U6IDMsXG4gICAgICAgICAgICBhdXRvRGlzdGFuY2U6IHRydWUsXG4gICAgICAgICAgICBjZW50ZXJQaWVjZTogdHJ1ZSxcbiAgICAgICAgICAgIHNob3dHaG9zdDogdHJ1ZSxcbiAgICAgICAgICAgIGRlbGV0ZU9uRHJvcE9mZjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgZHJvcG1vZGU6IHtcbiAgICAgICAgICAgIGFjdGl2ZTogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBzdGF0czoge1xuICAgICAgICAgICAgZHJhZ2dlZDogISgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpXG4gICAgICAgIH0sXG4gICAgICAgIGV2ZW50czoge30sXG4gICAgICAgIGRyYXdhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgICAgIGVyYXNlT25DbGljazogdHJ1ZSxcbiAgICAgICAgICAgIHNoYXBlczogW10sXG4gICAgICAgICAgICBhdXRvU2hhcGVzOiBbXSxcbiAgICAgICAgICAgIGJydXNoZXM6IHtcbiAgICAgICAgICAgICAgICBncmVlbjogeyBrZXk6ICdnJywgY29sb3I6ICcjMTU3ODFCJywgb3BhY2l0eTogMSwgbGluZVdpZHRoOiAxMCB9LFxuICAgICAgICAgICAgICAgIHJlZDogeyBrZXk6ICdyJywgY29sb3I6ICcjODgyMDIwJywgb3BhY2l0eTogMSwgbGluZVdpZHRoOiAxMCB9LFxuICAgICAgICAgICAgICAgIGJsdWU6IHsga2V5OiAnYicsIGNvbG9yOiAnIzAwMzA4OCcsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICB5ZWxsb3c6IHsga2V5OiAneScsIGNvbG9yOiAnI2U2OGYwMCcsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICBwYWxlQmx1ZTogeyBrZXk6ICdwYicsIGNvbG9yOiAnIzAwMzA4OCcsIG9wYWNpdHk6IDAuNCwgbGluZVdpZHRoOiAxNSB9LFxuICAgICAgICAgICAgICAgIHBhbGVHcmVlbjogeyBrZXk6ICdwZycsIGNvbG9yOiAnIzE1NzgxQicsIG9wYWNpdHk6IDAuNCwgbGluZVdpZHRoOiAxNSB9LFxuICAgICAgICAgICAgICAgIHBhbGVSZWQ6IHsga2V5OiAncHInLCBjb2xvcjogJyM4ODIwMjAnLCBvcGFjaXR5OiAwLjQsIGxpbmVXaWR0aDogMTUgfSxcbiAgICAgICAgICAgICAgICBwYWxlR3JleTogeyBrZXk6ICdwZ3InLCBjb2xvcjogJyM0YTRhNGEnLCBvcGFjaXR5OiAwLjM1LCBsaW5lV2lkdGg6IDE1IH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwaWVjZXM6IHtcbiAgICAgICAgICAgICAgICBiYXNlVXJsOiAnaHR0cHM6Ly9saWNoZXNzMS5vcmcvYXNzZXRzL3BpZWNlL2NidXJuZXR0LydcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcmV2U3ZnSGFzaDogJydcbiAgICAgICAgfSxcbiAgICAgICAgaG9sZDogdXRpbF8xLnRpbWVyKCksXG4gICAgICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IDgsIGhlaWdodDogOCB9LFxuICAgICAgICBnZW9tZXRyeTogMCxcbiAgICB9O1xufVxuZXhwb3J0cy5kZWZhdWx0cyA9IGRlZmF1bHRzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gY3JlYXRlRWxlbWVudCh0YWdOYW1lKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCB0YWdOYW1lKTtcbn1cbmV4cG9ydHMuY3JlYXRlRWxlbWVudCA9IGNyZWF0ZUVsZW1lbnQ7XG5mdW5jdGlvbiByZW5kZXJTdmcoc3RhdGUsIHJvb3QpIHtcbiAgICBjb25zdCBkID0gc3RhdGUuZHJhd2FibGUsIGN1ckQgPSBkLmN1cnJlbnQsIGN1ciA9IGN1ckQgJiYgY3VyRC5tb3VzZVNxID8gY3VyRCA6IHVuZGVmaW5lZCwgYXJyb3dEZXN0cyA9IHt9O1xuICAgIGQuc2hhcGVzLmNvbmNhdChkLmF1dG9TaGFwZXMpLmNvbmNhdChjdXIgPyBbY3VyXSA6IFtdKS5mb3JFYWNoKHMgPT4ge1xuICAgICAgICBpZiAocy5kZXN0KVxuICAgICAgICAgICAgYXJyb3dEZXN0c1tzLmRlc3RdID0gKGFycm93RGVzdHNbcy5kZXN0XSB8fCAwKSArIDE7XG4gICAgfSk7XG4gICAgY29uc3Qgc2hhcGVzID0gZC5zaGFwZXMuY29uY2F0KGQuYXV0b1NoYXBlcykubWFwKChzKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzaGFwZTogcyxcbiAgICAgICAgICAgIGN1cnJlbnQ6IGZhbHNlLFxuICAgICAgICAgICAgaGFzaDogc2hhcGVIYXNoKHMsIGFycm93RGVzdHMsIGZhbHNlKVxuICAgICAgICB9O1xuICAgIH0pO1xuICAgIGlmIChjdXIpXG4gICAgICAgIHNoYXBlcy5wdXNoKHtcbiAgICAgICAgICAgIHNoYXBlOiBjdXIsXG4gICAgICAgICAgICBjdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgaGFzaDogc2hhcGVIYXNoKGN1ciwgYXJyb3dEZXN0cywgdHJ1ZSlcbiAgICAgICAgfSk7XG4gICAgY29uc3QgZnVsbEhhc2ggPSBzaGFwZXMubWFwKHNjID0+IHNjLmhhc2gpLmpvaW4oJycpO1xuICAgIGlmIChmdWxsSGFzaCA9PT0gc3RhdGUuZHJhd2FibGUucHJldlN2Z0hhc2gpXG4gICAgICAgIHJldHVybjtcbiAgICBzdGF0ZS5kcmF3YWJsZS5wcmV2U3ZnSGFzaCA9IGZ1bGxIYXNoO1xuICAgIGNvbnN0IGRlZnNFbCA9IHJvb3QuZmlyc3RDaGlsZDtcbiAgICBzeW5jRGVmcyhkLCBzaGFwZXMsIGRlZnNFbCk7XG4gICAgc3luY1NoYXBlcyhzdGF0ZSwgc2hhcGVzLCBkLmJydXNoZXMsIGFycm93RGVzdHMsIHJvb3QsIGRlZnNFbCk7XG59XG5leHBvcnRzLnJlbmRlclN2ZyA9IHJlbmRlclN2ZztcbmZ1bmN0aW9uIHN5bmNEZWZzKGQsIHNoYXBlcywgZGVmc0VsKSB7XG4gICAgY29uc3QgYnJ1c2hlcyA9IHt9O1xuICAgIGxldCBicnVzaDtcbiAgICBzaGFwZXMuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuc2hhcGUuZGVzdCkge1xuICAgICAgICAgICAgYnJ1c2ggPSBkLmJydXNoZXNbcy5zaGFwZS5icnVzaF07XG4gICAgICAgICAgICBpZiAocy5zaGFwZS5tb2RpZmllcnMpXG4gICAgICAgICAgICAgICAgYnJ1c2ggPSBtYWtlQ3VzdG9tQnJ1c2goYnJ1c2gsIHMuc2hhcGUubW9kaWZpZXJzKTtcbiAgICAgICAgICAgIGJydXNoZXNbYnJ1c2gua2V5XSA9IGJydXNoO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgY29uc3Qga2V5c0luRG9tID0ge307XG4gICAgbGV0IGVsID0gZGVmc0VsLmZpcnN0Q2hpbGQ7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGtleXNJbkRvbVtlbC5nZXRBdHRyaWJ1dGUoJ2NnS2V5JyldID0gdHJ1ZTtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yIChsZXQga2V5IGluIGJydXNoZXMpIHtcbiAgICAgICAgaWYgKCFrZXlzSW5Eb21ba2V5XSlcbiAgICAgICAgICAgIGRlZnNFbC5hcHBlbmRDaGlsZChyZW5kZXJNYXJrZXIoYnJ1c2hlc1trZXldKSk7XG4gICAgfVxufVxuZnVuY3Rpb24gc3luY1NoYXBlcyhzdGF0ZSwgc2hhcGVzLCBicnVzaGVzLCBhcnJvd0Rlc3RzLCByb290LCBkZWZzRWwpIHtcbiAgICBjb25zdCBib3VuZHMgPSBzdGF0ZS5kb20uYm91bmRzKCksIGhhc2hlc0luRG9tID0ge30sIHRvUmVtb3ZlID0gW107XG4gICAgc2hhcGVzLmZvckVhY2goc2MgPT4geyBoYXNoZXNJbkRvbVtzYy5oYXNoXSA9IGZhbHNlOyB9KTtcbiAgICBsZXQgZWwgPSBkZWZzRWwubmV4dFNpYmxpbmcsIGVsSGFzaDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgZWxIYXNoID0gZWwuZ2V0QXR0cmlidXRlKCdjZ0hhc2gnKTtcbiAgICAgICAgaWYgKGhhc2hlc0luRG9tLmhhc093blByb3BlcnR5KGVsSGFzaCkpXG4gICAgICAgICAgICBoYXNoZXNJbkRvbVtlbEhhc2hdID0gdHJ1ZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdG9SZW1vdmUucHVzaChlbCk7XG4gICAgICAgIGVsID0gZWwubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIHRvUmVtb3ZlLmZvckVhY2goZWwgPT4gcm9vdC5yZW1vdmVDaGlsZChlbCkpO1xuICAgIHNoYXBlcy5mb3JFYWNoKHNjID0+IHtcbiAgICAgICAgaWYgKCFoYXNoZXNJbkRvbVtzYy5oYXNoXSlcbiAgICAgICAgICAgIHJvb3QuYXBwZW5kQ2hpbGQocmVuZGVyU2hhcGUoc3RhdGUsIHNjLCBicnVzaGVzLCBhcnJvd0Rlc3RzLCBib3VuZHMpKTtcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIHNoYXBlSGFzaCh7IG9yaWcsIGRlc3QsIGJydXNoLCBwaWVjZSwgbW9kaWZpZXJzIH0sIGFycm93RGVzdHMsIGN1cnJlbnQpIHtcbiAgICByZXR1cm4gW2N1cnJlbnQsIG9yaWcsIGRlc3QsIGJydXNoLCBkZXN0ICYmIGFycm93RGVzdHNbZGVzdF0gPiAxLFxuICAgICAgICBwaWVjZSAmJiBwaWVjZUhhc2gocGllY2UpLFxuICAgICAgICBtb2RpZmllcnMgJiYgbW9kaWZpZXJzSGFzaChtb2RpZmllcnMpXG4gICAgXS5maWx0ZXIoeCA9PiB4KS5qb2luKCcnKTtcbn1cbmZ1bmN0aW9uIHBpZWNlSGFzaChwaWVjZSkge1xuICAgIHJldHVybiBbcGllY2UuY29sb3IsIHBpZWNlLnJvbGUsIHBpZWNlLnNjYWxlXS5maWx0ZXIoeCA9PiB4KS5qb2luKCcnKTtcbn1cbmZ1bmN0aW9uIG1vZGlmaWVyc0hhc2gobSkge1xuICAgIHJldHVybiAnJyArIChtLmxpbmVXaWR0aCB8fCAnJyk7XG59XG5mdW5jdGlvbiByZW5kZXJTaGFwZShzdGF0ZSwgeyBzaGFwZSwgY3VycmVudCwgaGFzaCB9LCBicnVzaGVzLCBhcnJvd0Rlc3RzLCBib3VuZHMpIHtcbiAgICBjb25zdCBmaXJzdFJhbmtJczAgPSBzdGF0ZS5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgbGV0IGVsO1xuICAgIGlmIChzaGFwZS5waWVjZSlcbiAgICAgICAgZWwgPSByZW5kZXJQaWVjZShzdGF0ZS5kcmF3YWJsZS5waWVjZXMuYmFzZVVybCwgb3JpZW50KHV0aWxfMS5rZXkycG9zKHNoYXBlLm9yaWcsIGZpcnN0UmFua0lzMCksIHN0YXRlLm9yaWVudGF0aW9uLCBzdGF0ZS5kaW1lbnNpb25zKSwgc2hhcGUucGllY2UsIGJvdW5kcywgc3RhdGUuZGltZW5zaW9ucyk7XG4gICAgZWxzZSB7XG4gICAgICAgIGNvbnN0IG9yaWcgPSBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUub3JpZywgZmlyc3RSYW5rSXMwKSwgc3RhdGUub3JpZW50YXRpb24sIHN0YXRlLmRpbWVuc2lvbnMpO1xuICAgICAgICBpZiAoc2hhcGUub3JpZyAmJiBzaGFwZS5kZXN0KSB7XG4gICAgICAgICAgICBsZXQgYnJ1c2ggPSBicnVzaGVzW3NoYXBlLmJydXNoXTtcbiAgICAgICAgICAgIGlmIChzaGFwZS5tb2RpZmllcnMpXG4gICAgICAgICAgICAgICAgYnJ1c2ggPSBtYWtlQ3VzdG9tQnJ1c2goYnJ1c2gsIHNoYXBlLm1vZGlmaWVycyk7XG4gICAgICAgICAgICBlbCA9IHJlbmRlckFycm93KGJydXNoLCBvcmlnLCBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUuZGVzdCwgZmlyc3RSYW5rSXMwKSwgc3RhdGUub3JpZW50YXRpb24sIHN0YXRlLmRpbWVuc2lvbnMpLCBjdXJyZW50LCBhcnJvd0Rlc3RzW3NoYXBlLmRlc3RdID4gMSwgYm91bmRzLCBzdGF0ZS5kaW1lbnNpb25zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBlbCA9IHJlbmRlckNpcmNsZShicnVzaGVzW3NoYXBlLmJydXNoXSwgb3JpZywgY3VycmVudCwgYm91bmRzLCBzdGF0ZS5kaW1lbnNpb25zKTtcbiAgICB9XG4gICAgZWwuc2V0QXR0cmlidXRlKCdjZ0hhc2gnLCBoYXNoKTtcbiAgICByZXR1cm4gZWw7XG59XG5mdW5jdGlvbiByZW5kZXJDaXJjbGUoYnJ1c2gsIHBvcywgY3VycmVudCwgYm91bmRzLCBiZCkge1xuICAgIGNvbnN0IG8gPSBwb3MycHgocG9zLCBib3VuZHMsIGJkKSwgd2lkdGhzID0gY2lyY2xlV2lkdGgoYm91bmRzLCBiZCksIHJhZGl1cyA9IChib3VuZHMud2lkdGggLyBiZC53aWR0aCkgLyAyO1xuICAgIHJldHVybiBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ2NpcmNsZScpLCB7XG4gICAgICAgIHN0cm9rZTogYnJ1c2guY29sb3IsXG4gICAgICAgICdzdHJva2Utd2lkdGgnOiB3aWR0aHNbY3VycmVudCA/IDAgOiAxXSxcbiAgICAgICAgZmlsbDogJ25vbmUnLFxuICAgICAgICBvcGFjaXR5OiBvcGFjaXR5KGJydXNoLCBjdXJyZW50KSxcbiAgICAgICAgY3g6IG9bMF0sXG4gICAgICAgIGN5OiBvWzFdLFxuICAgICAgICByOiByYWRpdXMgLSB3aWR0aHNbMV0gLyAyXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJBcnJvdyhicnVzaCwgb3JpZywgZGVzdCwgY3VycmVudCwgc2hvcnRlbiwgYm91bmRzLCBiZCkge1xuICAgIGNvbnN0IG0gPSBhcnJvd01hcmdpbihib3VuZHMsIHNob3J0ZW4gJiYgIWN1cnJlbnQsIGJkKSwgYSA9IHBvczJweChvcmlnLCBib3VuZHMsIGJkKSwgYiA9IHBvczJweChkZXN0LCBib3VuZHMsIGJkKSwgZHggPSBiWzBdIC0gYVswXSwgZHkgPSBiWzFdIC0gYVsxXSwgYW5nbGUgPSBNYXRoLmF0YW4yKGR5LCBkeCksIHhvID0gTWF0aC5jb3MoYW5nbGUpICogbSwgeW8gPSBNYXRoLnNpbihhbmdsZSkgKiBtO1xuICAgIHJldHVybiBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ2xpbmUnKSwge1xuICAgICAgICBzdHJva2U6IGJydXNoLmNvbG9yLFxuICAgICAgICAnc3Ryb2tlLXdpZHRoJzogbGluZVdpZHRoKGJydXNoLCBjdXJyZW50LCBib3VuZHMsIGJkKSxcbiAgICAgICAgJ3N0cm9rZS1saW5lY2FwJzogJ3JvdW5kJyxcbiAgICAgICAgJ21hcmtlci1lbmQnOiAndXJsKCNhcnJvd2hlYWQtJyArIGJydXNoLmtleSArICcpJyxcbiAgICAgICAgb3BhY2l0eTogb3BhY2l0eShicnVzaCwgY3VycmVudCksXG4gICAgICAgIHgxOiBhWzBdLFxuICAgICAgICB5MTogYVsxXSxcbiAgICAgICAgeDI6IGJbMF0gLSB4byxcbiAgICAgICAgeTI6IGJbMV0gLSB5b1xuICAgIH0pO1xufVxuZnVuY3Rpb24gcmVuZGVyUGllY2UoYmFzZVVybCwgcG9zLCBwaWVjZSwgYm91bmRzLCBiZCkge1xuICAgIGNvbnN0IG8gPSBwb3MycHgocG9zLCBib3VuZHMsIGJkKSwgd2lkdGggPSBib3VuZHMud2lkdGggLyBiZC53aWR0aCAqIChwaWVjZS5zY2FsZSB8fCAxKSwgaGVpZ2h0ID0gYm91bmRzLndpZHRoIC8gYmQuaGVpZ2h0ICogKHBpZWNlLnNjYWxlIHx8IDEpLCBuYW1lID0gcGllY2UuY29sb3JbMF0gKyAocGllY2Uucm9sZSA9PT0gJ2tuaWdodCcgPyAnbicgOiBwaWVjZS5yb2xlWzBdKS50b1VwcGVyQ2FzZSgpO1xuICAgIHJldHVybiBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ2ltYWdlJyksIHtcbiAgICAgICAgY2xhc3NOYW1lOiBgJHtwaWVjZS5yb2xlfSAke3BpZWNlLmNvbG9yfWAsXG4gICAgICAgIHg6IG9bMF0gLSB3aWR0aCAvIDIsXG4gICAgICAgIHk6IG9bMV0gLSBoZWlnaHQgLyAyLFxuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBocmVmOiBiYXNlVXJsICsgbmFtZSArICcuc3ZnJ1xuICAgIH0pO1xufVxuZnVuY3Rpb24gcmVuZGVyTWFya2VyKGJydXNoKSB7XG4gICAgY29uc3QgbWFya2VyID0gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdtYXJrZXInKSwge1xuICAgICAgICBpZDogJ2Fycm93aGVhZC0nICsgYnJ1c2gua2V5LFxuICAgICAgICBvcmllbnQ6ICdhdXRvJyxcbiAgICAgICAgbWFya2VyV2lkdGg6IDQsXG4gICAgICAgIG1hcmtlckhlaWdodDogOCxcbiAgICAgICAgcmVmWDogMi4wNSxcbiAgICAgICAgcmVmWTogMi4wMVxuICAgIH0pO1xuICAgIG1hcmtlci5hcHBlbmRDaGlsZChzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ3BhdGgnKSwge1xuICAgICAgICBkOiAnTTAsMCBWNCBMMywyIFonLFxuICAgICAgICBmaWxsOiBicnVzaC5jb2xvclxuICAgIH0pKTtcbiAgICBtYXJrZXIuc2V0QXR0cmlidXRlKCdjZ0tleScsIGJydXNoLmtleSk7XG4gICAgcmV0dXJuIG1hcmtlcjtcbn1cbmZ1bmN0aW9uIHNldEF0dHJpYnV0ZXMoZWwsIGF0dHJzKSB7XG4gICAgZm9yIChsZXQga2V5IGluIGF0dHJzKVxuICAgICAgICBlbC5zZXRBdHRyaWJ1dGUoa2V5LCBhdHRyc1trZXldKTtcbiAgICByZXR1cm4gZWw7XG59XG5mdW5jdGlvbiBvcmllbnQocG9zLCBjb2xvciwgYmQpIHtcbiAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyBwb3MgOiBbYmQud2lkdGggKyAxIC0gcG9zWzBdLCBiZC5oZWlnaHQgKyAxIC0gcG9zWzFdXTtcbn1cbmZ1bmN0aW9uIG1ha2VDdXN0b21CcnVzaChiYXNlLCBtb2RpZmllcnMpIHtcbiAgICBjb25zdCBicnVzaCA9IHtcbiAgICAgICAgY29sb3I6IGJhc2UuY29sb3IsXG4gICAgICAgIG9wYWNpdHk6IE1hdGgucm91bmQoYmFzZS5vcGFjaXR5ICogMTApIC8gMTAsXG4gICAgICAgIGxpbmVXaWR0aDogTWF0aC5yb3VuZChtb2RpZmllcnMubGluZVdpZHRoIHx8IGJhc2UubGluZVdpZHRoKVxuICAgIH07XG4gICAgYnJ1c2gua2V5ID0gW2Jhc2Uua2V5LCBtb2RpZmllcnMubGluZVdpZHRoXS5maWx0ZXIoeCA9PiB4KS5qb2luKCcnKTtcbiAgICByZXR1cm4gYnJ1c2g7XG59XG5mdW5jdGlvbiBjaXJjbGVXaWR0aChib3VuZHMsIGJkKSB7XG4gICAgY29uc3QgYmFzZSA9IGJvdW5kcy53aWR0aCAvIChiZC53aWR0aCAqIDY0KTtcbiAgICByZXR1cm4gWzMgKiBiYXNlLCA0ICogYmFzZV07XG59XG5mdW5jdGlvbiBsaW5lV2lkdGgoYnJ1c2gsIGN1cnJlbnQsIGJvdW5kcywgYmQpIHtcbiAgICByZXR1cm4gKGJydXNoLmxpbmVXaWR0aCB8fCAxMCkgKiAoY3VycmVudCA/IDAuODUgOiAxKSAvIChiZC53aWR0aCAqIDY0KSAqIGJvdW5kcy53aWR0aDtcbn1cbmZ1bmN0aW9uIG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpIHtcbiAgICByZXR1cm4gKGJydXNoLm9wYWNpdHkgfHwgMSkgKiAoY3VycmVudCA/IDAuOSA6IDEpO1xufVxuZnVuY3Rpb24gYXJyb3dNYXJnaW4oYm91bmRzLCBzaG9ydGVuLCBiZCkge1xuICAgIHJldHVybiAoc2hvcnRlbiA/IDIwIDogMTApIC8gKGJkLndpZHRoICogNjQpICogYm91bmRzLndpZHRoO1xufVxuZnVuY3Rpb24gcG9zMnB4KHBvcywgYm91bmRzLCBiZCkge1xuICAgIHJldHVybiBbKHBvc1swXSAtIDAuNSkgKiBib3VuZHMud2lkdGggLyBiZC53aWR0aCwgKGJkLmhlaWdodCArIDAuNSAtIHBvc1sxXSkgKiBib3VuZHMuaGVpZ2h0IC8gYmQuaGVpZ2h0XTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5maWxlcyA9IFsnYScsICdiJywgJ2MnLCAnZCcsICdlJywgJ2YnLCAnZycsICdoJywgJ2knLCAnaiddO1xuZXhwb3J0cy5yYW5rcyA9IFsnMCcsICcxJywgJzInLCAnMycsICc0JywgJzUnLCAnNicsICc3JywgJzgnLCAnOSddO1xuO1xuZXhwb3J0cy5kaW1lbnNpb25zID0gW3sgd2lkdGg6IDgsIGhlaWdodDogOCB9LCB7IHdpZHRoOiA5LCBoZWlnaHQ6IDkgfSwgeyB3aWR0aDogMTAsIGhlaWdodDogOCB9LCB7IHdpZHRoOiA5LCBoZWlnaHQ6IDEwIH1dO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZXhwb3J0cy5jb2xvcnMgPSBbJ3doaXRlJywgJ2JsYWNrJ107XG5leHBvcnRzLk5SYW5rcyA9IFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMF07XG5leHBvcnRzLmludk5SYW5rcyA9IFsxMCwgOSwgOCwgNywgNiwgNSwgNCwgMywgMiwgMV07XG5jb25zdCBmaWxlczggPSBjZy5maWxlcy5zbGljZSgwLCA4KTtcbmNvbnN0IGZpbGVzOSA9IGNnLmZpbGVzLnNsaWNlKDAsIDkpO1xuY29uc3QgZmlsZXMxMCA9IGNnLmZpbGVzLnNsaWNlKDAsIDEwKTtcbmNvbnN0IHJhbmtzOCA9IGNnLnJhbmtzLnNsaWNlKDEsIDkpO1xuY29uc3QgcmFua3M5ID0gY2cucmFua3Muc2xpY2UoMSwgMTApO1xuY29uc3QgcmFua3MxMCA9IGNnLnJhbmtzLnNsaWNlKDAsIDEwKTtcbmNvbnN0IGFsbEtleXM4eDggPSBBcnJheS5wcm90b3R5cGUuY29uY2F0KC4uLmZpbGVzOC5tYXAoYyA9PiByYW5rczgubWFwKHIgPT4gYyArIHIpKSk7XG5jb25zdCBhbGxLZXlzOXg5ID0gQXJyYXkucHJvdG90eXBlLmNvbmNhdCguLi5maWxlczkubWFwKGMgPT4gcmFua3M5Lm1hcChyID0+IGMgKyByKSkpO1xuY29uc3QgYWxsS2V5czEweDggPSBBcnJheS5wcm90b3R5cGUuY29uY2F0KC4uLmZpbGVzMTAubWFwKGMgPT4gcmFua3M4Lm1hcChyID0+IGMgKyByKSkpO1xuY29uc3QgYWxsS2V5czl4MTAgPSBBcnJheS5wcm90b3R5cGUuY29uY2F0KC4uLmZpbGVzOS5tYXAoYyA9PiByYW5rczEwLm1hcChyID0+IGMgKyByKSkpO1xuZXhwb3J0cy5hbGxLZXlzID0gW2FsbEtleXM4eDgsIGFsbEtleXM5eDksIGFsbEtleXMxMHg4LCBhbGxLZXlzOXgxMF07XG5mdW5jdGlvbiBwb3Mya2V5KHBvcywgZ2VvbSkge1xuICAgIGNvbnN0IGJkID0gY2cuZGltZW5zaW9uc1tnZW9tXTtcbiAgICByZXR1cm4gZXhwb3J0cy5hbGxLZXlzW2dlb21dW2JkLmhlaWdodCAqIHBvc1swXSArIHBvc1sxXSAtIGJkLmhlaWdodCAtIDFdO1xufVxuZXhwb3J0cy5wb3Mya2V5ID0gcG9zMmtleTtcbmZ1bmN0aW9uIGtleTJwb3MoaywgZmlyc3RSYW5rSXMwKSB7XG4gICAgY29uc3Qgc2hpZnQgPSBmaXJzdFJhbmtJczAgPyAxIDogMDtcbiAgICByZXR1cm4gW2suY2hhckNvZGVBdCgwKSAtIDk2LCBrLmNoYXJDb2RlQXQoMSkgLSA0OCArIHNoaWZ0XTtcbn1cbmV4cG9ydHMua2V5MnBvcyA9IGtleTJwb3M7XG5mdW5jdGlvbiBtZW1vKGYpIHtcbiAgICBsZXQgdjtcbiAgICBjb25zdCByZXQgPSAoKSA9PiB7XG4gICAgICAgIGlmICh2ID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB2ID0gZigpO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9O1xuICAgIHJldC5jbGVhciA9ICgpID0+IHsgdiA9IHVuZGVmaW5lZDsgfTtcbiAgICByZXR1cm4gcmV0O1xufVxuZXhwb3J0cy5tZW1vID0gbWVtbztcbmV4cG9ydHMudGltZXIgPSAoKSA9PiB7XG4gICAgbGV0IHN0YXJ0QXQ7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhcnQoKSB7IHN0YXJ0QXQgPSBEYXRlLm5vdygpOyB9LFxuICAgICAgICBjYW5jZWwoKSB7IHN0YXJ0QXQgPSB1bmRlZmluZWQ7IH0sXG4gICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXJ0QXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICBjb25zdCB0aW1lID0gRGF0ZS5ub3coKSAtIHN0YXJ0QXQ7XG4gICAgICAgICAgICBzdGFydEF0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgcmV0dXJuIHRpbWU7XG4gICAgICAgIH1cbiAgICB9O1xufTtcbmV4cG9ydHMub3Bwb3NpdGUgPSAoYykgPT4gYyA9PT0gJ3doaXRlJyA/ICdibGFjaycgOiAnd2hpdGUnO1xuZnVuY3Rpb24gY29udGFpbnNYKHhzLCB4KSB7XG4gICAgcmV0dXJuIHhzICE9PSB1bmRlZmluZWQgJiYgeHMuaW5kZXhPZih4KSAhPT0gLTE7XG59XG5leHBvcnRzLmNvbnRhaW5zWCA9IGNvbnRhaW5zWDtcbmV4cG9ydHMuZGlzdGFuY2VTcSA9IChwb3MxLCBwb3MyKSA9PiB7XG4gICAgcmV0dXJuIE1hdGgucG93KHBvczFbMF0gLSBwb3MyWzBdLCAyKSArIE1hdGgucG93KHBvczFbMV0gLSBwb3MyWzFdLCAyKTtcbn07XG5leHBvcnRzLnNhbWVQaWVjZSA9IChwMSwgcDIpID0+IHAxLnJvbGUgPT09IHAyLnJvbGUgJiYgcDEuY29sb3IgPT09IHAyLmNvbG9yO1xuY29uc3QgcG9zVG9UcmFuc2xhdGVCYXNlID0gKHBvcywgYXNXaGl0ZSwgeEZhY3RvciwgeUZhY3RvciwgYnQpID0+IFtcbiAgICAoYXNXaGl0ZSA/IHBvc1swXSAtIDEgOiBidC53aWR0aCAtIHBvc1swXSkgKiB4RmFjdG9yLFxuICAgIChhc1doaXRlID8gYnQuaGVpZ2h0IC0gcG9zWzFdIDogcG9zWzFdIC0gMSkgKiB5RmFjdG9yXG5dO1xuZXhwb3J0cy5wb3NUb1RyYW5zbGF0ZUFicyA9IChib3VuZHMsIGJ0KSA9PiB7XG4gICAgY29uc3QgeEZhY3RvciA9IGJvdW5kcy53aWR0aCAvIGJ0LndpZHRoLCB5RmFjdG9yID0gYm91bmRzLmhlaWdodCAvIGJ0LmhlaWdodDtcbiAgICByZXR1cm4gKHBvcywgYXNXaGl0ZSkgPT4gcG9zVG9UcmFuc2xhdGVCYXNlKHBvcywgYXNXaGl0ZSwgeEZhY3RvciwgeUZhY3RvciwgYnQpO1xufTtcbmV4cG9ydHMucG9zVG9UcmFuc2xhdGVSZWwgPSAocG9zLCBhc1doaXRlLCBidCkgPT4gcG9zVG9UcmFuc2xhdGVCYXNlKHBvcywgYXNXaGl0ZSwgMTAwIC8gYnQud2lkdGgsIDEwMCAvIGJ0LmhlaWdodCwgYnQpO1xuZXhwb3J0cy50cmFuc2xhdGVBYnMgPSAoZWwsIHBvcykgPT4ge1xuICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtwb3NbMF19cHgsJHtwb3NbMV19cHgpYDtcbn07XG5leHBvcnRzLnRyYW5zbGF0ZVJlbCA9IChlbCwgcGVyY2VudHMpID0+IHtcbiAgICBlbC5zdHlsZS5sZWZ0ID0gcGVyY2VudHNbMF0gKyAnJSc7XG4gICAgZWwuc3R5bGUudG9wID0gcGVyY2VudHNbMV0gKyAnJSc7XG59O1xuZXhwb3J0cy5zZXRWaXNpYmxlID0gKGVsLCB2KSA9PiB7XG4gICAgZWwuc3R5bGUudmlzaWJpbGl0eSA9IHYgPyAndmlzaWJsZScgOiAnaGlkZGVuJztcbn07XG5leHBvcnRzLmV2ZW50UG9zaXRpb24gPSBlID0+IHtcbiAgICBpZiAoZS5jbGllbnRYIHx8IGUuY2xpZW50WCA9PT0gMClcbiAgICAgICAgcmV0dXJuIFtlLmNsaWVudFgsIGUuY2xpZW50WV07XG4gICAgaWYgKGUudG91Y2hlcyAmJiBlLnRhcmdldFRvdWNoZXNbMF0pXG4gICAgICAgIHJldHVybiBbZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFgsIGUudGFyZ2V0VG91Y2hlc1swXS5jbGllbnRZXTtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcbmV4cG9ydHMuaXNSaWdodEJ1dHRvbiA9IChlKSA9PiBlLmJ1dHRvbnMgPT09IDIgfHwgZS5idXR0b24gPT09IDI7XG5leHBvcnRzLmNyZWF0ZUVsID0gKHRhZ05hbWUsIGNsYXNzTmFtZSkgPT4ge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcbiAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICBlbC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIGVsO1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IHR5cGVzXzEgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmNvbnN0IHN2Z18xID0gcmVxdWlyZShcIi4vc3ZnXCIpO1xuZnVuY3Rpb24gd3JhcChlbGVtZW50LCBzLCByZWxhdGl2ZSkge1xuICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gJyc7XG4gICAgZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjZy13cmFwJyk7XG4gICAgdXRpbF8xLmNvbG9ycy5mb3JFYWNoKGMgPT4ge1xuICAgICAgICBlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ29yaWVudGF0aW9uLScgKyBjLCBzLm9yaWVudGF0aW9uID09PSBjKTtcbiAgICB9KTtcbiAgICBlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ21hbmlwdWxhYmxlJywgIXMudmlld09ubHkpO1xuICAgIGNvbnN0IGhlbHBlciA9IHV0aWxfMS5jcmVhdGVFbCgnY2ctaGVscGVyJyk7XG4gICAgZWxlbWVudC5hcHBlbmRDaGlsZChoZWxwZXIpO1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHV0aWxfMS5jcmVhdGVFbCgnY2ctY29udGFpbmVyJyk7XG4gICAgaGVscGVyLmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdXRpbF8xLmNyZWF0ZUVsKCdleHRlbnNpb24nKTtcbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZXh0ZW5zaW9uKTtcbiAgICBjb25zdCBib2FyZCA9IHV0aWxfMS5jcmVhdGVFbCgnY2ctYm9hcmQnKTtcbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYm9hcmQpO1xuICAgIGxldCBzdmc7XG4gICAgaWYgKHMuZHJhd2FibGUudmlzaWJsZSAmJiAhcmVsYXRpdmUpIHtcbiAgICAgICAgc3ZnID0gc3ZnXzEuY3JlYXRlRWxlbWVudCgnc3ZnJyk7XG4gICAgICAgIHN2Zy5hcHBlbmRDaGlsZChzdmdfMS5jcmVhdGVFbGVtZW50KCdkZWZzJykpO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3ZnKTtcbiAgICB9XG4gICAgaWYgKHMuY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgY29uc3Qgb3JpZW50Q2xhc3MgPSBzLm9yaWVudGF0aW9uID09PSAnYmxhY2snID8gJyBibGFjaycgOiAnJztcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gcy5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgICAgIGNvbnN0IHNoaWZ0ID0gZmlyc3RSYW5rSXMwID8gMCA6IDE7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJDb29yZHModHlwZXNfMS5yYW5rcy5zbGljZShzaGlmdCwgcy5kaW1lbnNpb25zLmhlaWdodCArIHNoaWZ0KSwgJ3JhbmtzJyArIG9yaWVudENsYXNzKSk7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJDb29yZHModHlwZXNfMS5maWxlcy5zbGljZSgwLCBzLmRpbWVuc2lvbnMud2lkdGgpLCAnZmlsZXMnICsgb3JpZW50Q2xhc3MpKTtcbiAgICB9XG4gICAgbGV0IGdob3N0O1xuICAgIGlmIChzLmRyYWdnYWJsZS5zaG93R2hvc3QgJiYgIXJlbGF0aXZlKSB7XG4gICAgICAgIGdob3N0ID0gdXRpbF8xLmNyZWF0ZUVsKCdwaWVjZScsICdnaG9zdCcpO1xuICAgICAgICB1dGlsXzEuc2V0VmlzaWJsZShnaG9zdCwgZmFsc2UpO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ2hvc3QpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBib2FyZCxcbiAgICAgICAgY29udGFpbmVyLFxuICAgICAgICBnaG9zdCxcbiAgICAgICAgc3ZnXG4gICAgfTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IHdyYXA7XG5mdW5jdGlvbiByZW5kZXJDb29yZHMoZWxlbXMsIGNsYXNzTmFtZSkge1xuICAgIGNvbnN0IGVsID0gdXRpbF8xLmNyZWF0ZUVsKCdjb29yZHMnLCBjbGFzc05hbWUpO1xuICAgIGxldCBmO1xuICAgIGZvciAobGV0IGkgaW4gZWxlbXMpIHtcbiAgICAgICAgZiA9IHV0aWxfMS5jcmVhdGVFbCgnY29vcmQnKTtcbiAgICAgICAgZi50ZXh0Q29udGVudCA9IGVsZW1zW2ldO1xuICAgICAgICBlbC5hcHBlbmRDaGlsZChmKTtcbiAgICB9XG4gICAgcmV0dXJuIGVsO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdm5vZGVfMSA9IHJlcXVpcmUoXCIuL3Zub2RlXCIpO1xudmFyIGlzID0gcmVxdWlyZShcIi4vaXNcIik7XG5mdW5jdGlvbiBhZGROUyhkYXRhLCBjaGlsZHJlbiwgc2VsKSB7XG4gICAgZGF0YS5ucyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG4gICAgaWYgKHNlbCAhPT0gJ2ZvcmVpZ25PYmplY3QnICYmIGNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoaWxkRGF0YSA9IGNoaWxkcmVuW2ldLmRhdGE7XG4gICAgICAgICAgICBpZiAoY2hpbGREYXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBhZGROUyhjaGlsZERhdGEsIGNoaWxkcmVuW2ldLmNoaWxkcmVuLCBjaGlsZHJlbltpXS5zZWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gaChzZWwsIGIsIGMpIHtcbiAgICB2YXIgZGF0YSA9IHt9LCBjaGlsZHJlbiwgdGV4dCwgaTtcbiAgICBpZiAoYyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRhdGEgPSBiO1xuICAgICAgICBpZiAoaXMuYXJyYXkoYykpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gYztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUoYykpIHtcbiAgICAgICAgICAgIHRleHQgPSBjO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGMgJiYgYy5zZWwpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gW2NdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoaXMuYXJyYXkoYikpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gYjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUoYikpIHtcbiAgICAgICAgICAgIHRleHQgPSBiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGIgJiYgYi5zZWwpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gW2JdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZGF0YSA9IGI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBpZiAoaXMucHJpbWl0aXZlKGNoaWxkcmVuW2ldKSlcbiAgICAgICAgICAgICAgICBjaGlsZHJlbltpXSA9IHZub2RlXzEudm5vZGUodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY2hpbGRyZW5baV0sIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHNlbFswXSA9PT0gJ3MnICYmIHNlbFsxXSA9PT0gJ3YnICYmIHNlbFsyXSA9PT0gJ2cnICYmXG4gICAgICAgIChzZWwubGVuZ3RoID09PSAzIHx8IHNlbFszXSA9PT0gJy4nIHx8IHNlbFszXSA9PT0gJyMnKSkge1xuICAgICAgICBhZGROUyhkYXRhLCBjaGlsZHJlbiwgc2VsKTtcbiAgICB9XG4gICAgcmV0dXJuIHZub2RlXzEudm5vZGUoc2VsLCBkYXRhLCBjaGlsZHJlbiwgdGV4dCwgdW5kZWZpbmVkKTtcbn1cbmV4cG9ydHMuaCA9IGg7XG47XG5leHBvcnRzLmRlZmF1bHQgPSBoO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aC5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQodGFnTmFtZSkge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpO1xufVxuZnVuY3Rpb24gY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZVVSSSwgcXVhbGlmaWVkTmFtZSkge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlVVJJLCBxdWFsaWZpZWROYW1lKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZVRleHROb2RlKHRleHQpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG59XG5mdW5jdGlvbiBjcmVhdGVDb21tZW50KHRleHQpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCh0ZXh0KTtcbn1cbmZ1bmN0aW9uIGluc2VydEJlZm9yZShwYXJlbnROb2RlLCBuZXdOb2RlLCByZWZlcmVuY2VOb2RlKSB7XG4gICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobmV3Tm9kZSwgcmVmZXJlbmNlTm9kZSk7XG59XG5mdW5jdGlvbiByZW1vdmVDaGlsZChub2RlLCBjaGlsZCkge1xuICAgIG5vZGUucmVtb3ZlQ2hpbGQoY2hpbGQpO1xufVxuZnVuY3Rpb24gYXBwZW5kQ2hpbGQobm9kZSwgY2hpbGQpIHtcbiAgICBub2RlLmFwcGVuZENoaWxkKGNoaWxkKTtcbn1cbmZ1bmN0aW9uIHBhcmVudE5vZGUobm9kZSkge1xuICAgIHJldHVybiBub2RlLnBhcmVudE5vZGU7XG59XG5mdW5jdGlvbiBuZXh0U2libGluZyhub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubmV4dFNpYmxpbmc7XG59XG5mdW5jdGlvbiB0YWdOYW1lKGVsbSkge1xuICAgIHJldHVybiBlbG0udGFnTmFtZTtcbn1cbmZ1bmN0aW9uIHNldFRleHRDb250ZW50KG5vZGUsIHRleHQpIHtcbiAgICBub2RlLnRleHRDb250ZW50ID0gdGV4dDtcbn1cbmZ1bmN0aW9uIGdldFRleHRDb250ZW50KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS50ZXh0Q29udGVudDtcbn1cbmZ1bmN0aW9uIGlzRWxlbWVudChub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDE7XG59XG5mdW5jdGlvbiBpc1RleHQobm9kZSkge1xuICAgIHJldHVybiBub2RlLm5vZGVUeXBlID09PSAzO1xufVxuZnVuY3Rpb24gaXNDb21tZW50KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5ub2RlVHlwZSA9PT0gODtcbn1cbmV4cG9ydHMuaHRtbERvbUFwaSA9IHtcbiAgICBjcmVhdGVFbGVtZW50OiBjcmVhdGVFbGVtZW50LFxuICAgIGNyZWF0ZUVsZW1lbnROUzogY3JlYXRlRWxlbWVudE5TLFxuICAgIGNyZWF0ZVRleHROb2RlOiBjcmVhdGVUZXh0Tm9kZSxcbiAgICBjcmVhdGVDb21tZW50OiBjcmVhdGVDb21tZW50LFxuICAgIGluc2VydEJlZm9yZTogaW5zZXJ0QmVmb3JlLFxuICAgIHJlbW92ZUNoaWxkOiByZW1vdmVDaGlsZCxcbiAgICBhcHBlbmRDaGlsZDogYXBwZW5kQ2hpbGQsXG4gICAgcGFyZW50Tm9kZTogcGFyZW50Tm9kZSxcbiAgICBuZXh0U2libGluZzogbmV4dFNpYmxpbmcsXG4gICAgdGFnTmFtZTogdGFnTmFtZSxcbiAgICBzZXRUZXh0Q29udGVudDogc2V0VGV4dENvbnRlbnQsXG4gICAgZ2V0VGV4dENvbnRlbnQ6IGdldFRleHRDb250ZW50LFxuICAgIGlzRWxlbWVudDogaXNFbGVtZW50LFxuICAgIGlzVGV4dDogaXNUZXh0LFxuICAgIGlzQ29tbWVudDogaXNDb21tZW50LFxufTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydHMuaHRtbERvbUFwaTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWh0bWxkb21hcGkuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmFycmF5ID0gQXJyYXkuaXNBcnJheTtcbmZ1bmN0aW9uIHByaW1pdGl2ZShzKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBzID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgcyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLnByaW1pdGl2ZSA9IHByaW1pdGl2ZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWlzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHhsaW5rTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayc7XG52YXIgeG1sTlMgPSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJztcbnZhciBjb2xvbkNoYXIgPSA1ODtcbnZhciB4Q2hhciA9IDEyMDtcbmZ1bmN0aW9uIHVwZGF0ZUF0dHJzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBrZXksIGVsbSA9IHZub2RlLmVsbSwgb2xkQXR0cnMgPSBvbGRWbm9kZS5kYXRhLmF0dHJzLCBhdHRycyA9IHZub2RlLmRhdGEuYXR0cnM7XG4gICAgaWYgKCFvbGRBdHRycyAmJiAhYXR0cnMpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAob2xkQXR0cnMgPT09IGF0dHJzKVxuICAgICAgICByZXR1cm47XG4gICAgb2xkQXR0cnMgPSBvbGRBdHRycyB8fCB7fTtcbiAgICBhdHRycyA9IGF0dHJzIHx8IHt9O1xuICAgIC8vIHVwZGF0ZSBtb2RpZmllZCBhdHRyaWJ1dGVzLCBhZGQgbmV3IGF0dHJpYnV0ZXNcbiAgICBmb3IgKGtleSBpbiBhdHRycykge1xuICAgICAgICB2YXIgY3VyID0gYXR0cnNba2V5XTtcbiAgICAgICAgdmFyIG9sZCA9IG9sZEF0dHJzW2tleV07XG4gICAgICAgIGlmIChvbGQgIT09IGN1cikge1xuICAgICAgICAgICAgaWYgKGN1ciA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoa2V5LCBcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGN1ciA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBlbG0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5LmNoYXJDb2RlQXQoMCkgIT09IHhDaGFyKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoa2V5LCBjdXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChrZXkuY2hhckNvZGVBdCgzKSA9PT0gY29sb25DaGFyKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc3VtZSB4bWwgbmFtZXNwYWNlXG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGVOUyh4bWxOUywga2V5LCBjdXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChrZXkuY2hhckNvZGVBdCg1KSA9PT0gY29sb25DaGFyKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc3VtZSB4bGluayBuYW1lc3BhY2VcbiAgICAgICAgICAgICAgICAgICAgZWxtLnNldEF0dHJpYnV0ZU5TKHhsaW5rTlMsIGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoa2V5LCBjdXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICAvLyByZW1vdmUgcmVtb3ZlZCBhdHRyaWJ1dGVzXG4gICAgLy8gdXNlIGBpbmAgb3BlcmF0b3Igc2luY2UgdGhlIHByZXZpb3VzIGBmb3JgIGl0ZXJhdGlvbiB1c2VzIGl0ICguaS5lLiBhZGQgZXZlbiBhdHRyaWJ1dGVzIHdpdGggdW5kZWZpbmVkIHZhbHVlKVxuICAgIC8vIHRoZSBvdGhlciBvcHRpb24gaXMgdG8gcmVtb3ZlIGFsbCBhdHRyaWJ1dGVzIHdpdGggdmFsdWUgPT0gdW5kZWZpbmVkXG4gICAgZm9yIChrZXkgaW4gb2xkQXR0cnMpIHtcbiAgICAgICAgaWYgKCEoa2V5IGluIGF0dHJzKSkge1xuICAgICAgICAgICAgZWxtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5hdHRyaWJ1dGVzTW9kdWxlID0geyBjcmVhdGU6IHVwZGF0ZUF0dHJzLCB1cGRhdGU6IHVwZGF0ZUF0dHJzIH07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmF0dHJpYnV0ZXNNb2R1bGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1hdHRyaWJ1dGVzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gdXBkYXRlQ2xhc3Mob2xkVm5vZGUsIHZub2RlKSB7XG4gICAgdmFyIGN1ciwgbmFtZSwgZWxtID0gdm5vZGUuZWxtLCBvbGRDbGFzcyA9IG9sZFZub2RlLmRhdGEuY2xhc3MsIGtsYXNzID0gdm5vZGUuZGF0YS5jbGFzcztcbiAgICBpZiAoIW9sZENsYXNzICYmICFrbGFzcylcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChvbGRDbGFzcyA9PT0ga2xhc3MpXG4gICAgICAgIHJldHVybjtcbiAgICBvbGRDbGFzcyA9IG9sZENsYXNzIHx8IHt9O1xuICAgIGtsYXNzID0ga2xhc3MgfHwge307XG4gICAgZm9yIChuYW1lIGluIG9sZENsYXNzKSB7XG4gICAgICAgIGlmICgha2xhc3NbbmFtZV0pIHtcbiAgICAgICAgICAgIGVsbS5jbGFzc0xpc3QucmVtb3ZlKG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobmFtZSBpbiBrbGFzcykge1xuICAgICAgICBjdXIgPSBrbGFzc1tuYW1lXTtcbiAgICAgICAgaWYgKGN1ciAhPT0gb2xkQ2xhc3NbbmFtZV0pIHtcbiAgICAgICAgICAgIGVsbS5jbGFzc0xpc3RbY3VyID8gJ2FkZCcgOiAncmVtb3ZlJ10obmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnRzLmNsYXNzTW9kdWxlID0geyBjcmVhdGU6IHVwZGF0ZUNsYXNzLCB1cGRhdGU6IHVwZGF0ZUNsYXNzIH07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmNsYXNzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9Y2xhc3MuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiBpbnZva2VIYW5kbGVyKGhhbmRsZXIsIHZub2RlLCBldmVudCkge1xuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIC8vIGNhbGwgZnVuY3Rpb24gaGFuZGxlclxuICAgICAgICBoYW5kbGVyLmNhbGwodm5vZGUsIGV2ZW50LCB2bm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBoYW5kbGVyID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIC8vIGNhbGwgaGFuZGxlciB3aXRoIGFyZ3VtZW50c1xuICAgICAgICBpZiAodHlwZW9mIGhhbmRsZXJbMF0gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgLy8gc3BlY2lhbCBjYXNlIGZvciBzaW5nbGUgYXJndW1lbnQgZm9yIHBlcmZvcm1hbmNlXG4gICAgICAgICAgICBpZiAoaGFuZGxlci5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVyWzBdLmNhbGwodm5vZGUsIGhhbmRsZXJbMV0sIGV2ZW50LCB2bm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IGhhbmRsZXIuc2xpY2UoMSk7XG4gICAgICAgICAgICAgICAgYXJncy5wdXNoKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBhcmdzLnB1c2godm5vZGUpO1xuICAgICAgICAgICAgICAgIGhhbmRsZXJbMF0uYXBwbHkodm5vZGUsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gY2FsbCBtdWx0aXBsZSBoYW5kbGVyc1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYW5kbGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaW52b2tlSGFuZGxlcihoYW5kbGVyW2ldLCB2bm9kZSwgZXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gaGFuZGxlRXZlbnQoZXZlbnQsIHZub2RlKSB7XG4gICAgdmFyIG5hbWUgPSBldmVudC50eXBlLCBvbiA9IHZub2RlLmRhdGEub247XG4gICAgLy8gY2FsbCBldmVudCBoYW5kbGVyKHMpIGlmIGV4aXN0c1xuICAgIGlmIChvbiAmJiBvbltuYW1lXSkge1xuICAgICAgICBpbnZva2VIYW5kbGVyKG9uW25hbWVdLCB2bm9kZSwgZXZlbnQpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGNyZWF0ZUxpc3RlbmVyKCkge1xuICAgIHJldHVybiBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50KSB7XG4gICAgICAgIGhhbmRsZUV2ZW50KGV2ZW50LCBoYW5kbGVyLnZub2RlKTtcbiAgICB9O1xufVxuZnVuY3Rpb24gdXBkYXRlRXZlbnRMaXN0ZW5lcnMob2xkVm5vZGUsIHZub2RlKSB7XG4gICAgdmFyIG9sZE9uID0gb2xkVm5vZGUuZGF0YS5vbiwgb2xkTGlzdGVuZXIgPSBvbGRWbm9kZS5saXN0ZW5lciwgb2xkRWxtID0gb2xkVm5vZGUuZWxtLCBvbiA9IHZub2RlICYmIHZub2RlLmRhdGEub24sIGVsbSA9ICh2bm9kZSAmJiB2bm9kZS5lbG0pLCBuYW1lO1xuICAgIC8vIG9wdGltaXphdGlvbiBmb3IgcmV1c2VkIGltbXV0YWJsZSBoYW5kbGVyc1xuICAgIGlmIChvbGRPbiA9PT0gb24pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyByZW1vdmUgZXhpc3RpbmcgbGlzdGVuZXJzIHdoaWNoIG5vIGxvbmdlciB1c2VkXG4gICAgaWYgKG9sZE9uICYmIG9sZExpc3RlbmVyKSB7XG4gICAgICAgIC8vIGlmIGVsZW1lbnQgY2hhbmdlZCBvciBkZWxldGVkIHdlIHJlbW92ZSBhbGwgZXhpc3RpbmcgbGlzdGVuZXJzIHVuY29uZGl0aW9uYWxseVxuICAgICAgICBpZiAoIW9uKSB7XG4gICAgICAgICAgICBmb3IgKG5hbWUgaW4gb2xkT24pIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgbGlzdGVuZXIgaWYgZWxlbWVudCB3YXMgY2hhbmdlZCBvciBleGlzdGluZyBsaXN0ZW5lcnMgcmVtb3ZlZFxuICAgICAgICAgICAgICAgIG9sZEVsbS5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIG9sZExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb3IgKG5hbWUgaW4gb2xkT24pIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgbGlzdGVuZXIgaWYgZXhpc3RpbmcgbGlzdGVuZXIgcmVtb3ZlZFxuICAgICAgICAgICAgICAgIGlmICghb25bbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgb2xkRWxtLnJlbW92ZUV2ZW50TGlzdGVuZXIobmFtZSwgb2xkTGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gYWRkIG5ldyBsaXN0ZW5lcnMgd2hpY2ggaGFzIG5vdCBhbHJlYWR5IGF0dGFjaGVkXG4gICAgaWYgKG9uKSB7XG4gICAgICAgIC8vIHJldXNlIGV4aXN0aW5nIGxpc3RlbmVyIG9yIGNyZWF0ZSBuZXdcbiAgICAgICAgdmFyIGxpc3RlbmVyID0gdm5vZGUubGlzdGVuZXIgPSBvbGRWbm9kZS5saXN0ZW5lciB8fCBjcmVhdGVMaXN0ZW5lcigpO1xuICAgICAgICAvLyB1cGRhdGUgdm5vZGUgZm9yIGxpc3RlbmVyXG4gICAgICAgIGxpc3RlbmVyLnZub2RlID0gdm5vZGU7XG4gICAgICAgIC8vIGlmIGVsZW1lbnQgY2hhbmdlZCBvciBhZGRlZCB3ZSBhZGQgYWxsIG5lZWRlZCBsaXN0ZW5lcnMgdW5jb25kaXRpb25hbGx5XG4gICAgICAgIGlmICghb2xkT24pIHtcbiAgICAgICAgICAgIGZvciAobmFtZSBpbiBvbikge1xuICAgICAgICAgICAgICAgIC8vIGFkZCBsaXN0ZW5lciBpZiBlbGVtZW50IHdhcyBjaGFuZ2VkIG9yIG5ldyBsaXN0ZW5lcnMgYWRkZWRcbiAgICAgICAgICAgICAgICBlbG0uYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCBsaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9yIChuYW1lIGluIG9uKSB7XG4gICAgICAgICAgICAgICAgLy8gYWRkIGxpc3RlbmVyIGlmIG5ldyBsaXN0ZW5lciBhZGRlZFxuICAgICAgICAgICAgICAgIGlmICghb2xkT25bbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZWxtLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgbGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnRzLmV2ZW50TGlzdGVuZXJzTW9kdWxlID0ge1xuICAgIGNyZWF0ZTogdXBkYXRlRXZlbnRMaXN0ZW5lcnMsXG4gICAgdXBkYXRlOiB1cGRhdGVFdmVudExpc3RlbmVycyxcbiAgICBkZXN0cm95OiB1cGRhdGVFdmVudExpc3RlbmVyc1xufTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydHMuZXZlbnRMaXN0ZW5lcnNNb2R1bGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1ldmVudGxpc3RlbmVycy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIHVwZGF0ZVByb3BzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBrZXksIGN1ciwgb2xkLCBlbG0gPSB2bm9kZS5lbG0sIG9sZFByb3BzID0gb2xkVm5vZGUuZGF0YS5wcm9wcywgcHJvcHMgPSB2bm9kZS5kYXRhLnByb3BzO1xuICAgIGlmICghb2xkUHJvcHMgJiYgIXByb3BzKVxuICAgICAgICByZXR1cm47XG4gICAgaWYgKG9sZFByb3BzID09PSBwcm9wcylcbiAgICAgICAgcmV0dXJuO1xuICAgIG9sZFByb3BzID0gb2xkUHJvcHMgfHwge307XG4gICAgcHJvcHMgPSBwcm9wcyB8fCB7fTtcbiAgICBmb3IgKGtleSBpbiBvbGRQcm9wcykge1xuICAgICAgICBpZiAoIXByb3BzW2tleV0pIHtcbiAgICAgICAgICAgIGRlbGV0ZSBlbG1ba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGtleSBpbiBwcm9wcykge1xuICAgICAgICBjdXIgPSBwcm9wc1trZXldO1xuICAgICAgICBvbGQgPSBvbGRQcm9wc1trZXldO1xuICAgICAgICBpZiAob2xkICE9PSBjdXIgJiYgKGtleSAhPT0gJ3ZhbHVlJyB8fCBlbG1ba2V5XSAhPT0gY3VyKSkge1xuICAgICAgICAgICAgZWxtW2tleV0gPSBjdXI7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnRzLnByb3BzTW9kdWxlID0geyBjcmVhdGU6IHVwZGF0ZVByb3BzLCB1cGRhdGU6IHVwZGF0ZVByb3BzIH07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLnByb3BzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cHJvcHMuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdm5vZGVfMSA9IHJlcXVpcmUoXCIuL3Zub2RlXCIpO1xudmFyIGlzID0gcmVxdWlyZShcIi4vaXNcIik7XG52YXIgaHRtbGRvbWFwaV8xID0gcmVxdWlyZShcIi4vaHRtbGRvbWFwaVwiKTtcbmZ1bmN0aW9uIGlzVW5kZWYocykgeyByZXR1cm4gcyA9PT0gdW5kZWZpbmVkOyB9XG5mdW5jdGlvbiBpc0RlZihzKSB7IHJldHVybiBzICE9PSB1bmRlZmluZWQ7IH1cbnZhciBlbXB0eU5vZGUgPSB2bm9kZV8xLmRlZmF1bHQoJycsIHt9LCBbXSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuZnVuY3Rpb24gc2FtZVZub2RlKHZub2RlMSwgdm5vZGUyKSB7XG4gICAgcmV0dXJuIHZub2RlMS5rZXkgPT09IHZub2RlMi5rZXkgJiYgdm5vZGUxLnNlbCA9PT0gdm5vZGUyLnNlbDtcbn1cbmZ1bmN0aW9uIGlzVm5vZGUodm5vZGUpIHtcbiAgICByZXR1cm4gdm5vZGUuc2VsICE9PSB1bmRlZmluZWQ7XG59XG5mdW5jdGlvbiBjcmVhdGVLZXlUb09sZElkeChjaGlsZHJlbiwgYmVnaW5JZHgsIGVuZElkeCkge1xuICAgIHZhciBpLCBtYXAgPSB7fSwga2V5LCBjaDtcbiAgICBmb3IgKGkgPSBiZWdpbklkeDsgaSA8PSBlbmRJZHg7ICsraSkge1xuICAgICAgICBjaCA9IGNoaWxkcmVuW2ldO1xuICAgICAgICBpZiAoY2ggIT0gbnVsbCkge1xuICAgICAgICAgICAga2V5ID0gY2gua2V5O1xuICAgICAgICAgICAgaWYgKGtleSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIG1hcFtrZXldID0gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWFwO1xufVxudmFyIGhvb2tzID0gWydjcmVhdGUnLCAndXBkYXRlJywgJ3JlbW92ZScsICdkZXN0cm95JywgJ3ByZScsICdwb3N0J107XG52YXIgaF8xID0gcmVxdWlyZShcIi4vaFwiKTtcbmV4cG9ydHMuaCA9IGhfMS5oO1xudmFyIHRodW5rXzEgPSByZXF1aXJlKFwiLi90aHVua1wiKTtcbmV4cG9ydHMudGh1bmsgPSB0aHVua18xLnRodW5rO1xuZnVuY3Rpb24gaW5pdChtb2R1bGVzLCBkb21BcGkpIHtcbiAgICB2YXIgaSwgaiwgY2JzID0ge307XG4gICAgdmFyIGFwaSA9IGRvbUFwaSAhPT0gdW5kZWZpbmVkID8gZG9tQXBpIDogaHRtbGRvbWFwaV8xLmRlZmF1bHQ7XG4gICAgZm9yIChpID0gMDsgaSA8IGhvb2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNic1tob29rc1tpXV0gPSBbXTtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IG1vZHVsZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICAgIHZhciBob29rID0gbW9kdWxlc1tqXVtob29rc1tpXV07XG4gICAgICAgICAgICBpZiAoaG9vayAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2JzW2hvb2tzW2ldXS5wdXNoKGhvb2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGVtcHR5Tm9kZUF0KGVsbSkge1xuICAgICAgICB2YXIgaWQgPSBlbG0uaWQgPyAnIycgKyBlbG0uaWQgOiAnJztcbiAgICAgICAgdmFyIGMgPSBlbG0uY2xhc3NOYW1lID8gJy4nICsgZWxtLmNsYXNzTmFtZS5zcGxpdCgnICcpLmpvaW4oJy4nKSA6ICcnO1xuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KGFwaS50YWdOYW1lKGVsbSkudG9Mb3dlckNhc2UoKSArIGlkICsgYywge30sIFtdLCB1bmRlZmluZWQsIGVsbSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0ZVJtQ2IoY2hpbGRFbG0sIGxpc3RlbmVycykge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gcm1DYigpIHtcbiAgICAgICAgICAgIGlmICgtLWxpc3RlbmVycyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHZhciBwYXJlbnRfMSA9IGFwaS5wYXJlbnROb2RlKGNoaWxkRWxtKTtcbiAgICAgICAgICAgICAgICBhcGkucmVtb3ZlQ2hpbGQocGFyZW50XzEsIGNoaWxkRWxtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY3JlYXRlRWxtKHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpIHtcbiAgICAgICAgdmFyIGksIGRhdGEgPSB2bm9kZS5kYXRhO1xuICAgICAgICBpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYoaSA9IGRhdGEuaG9vaykgJiYgaXNEZWYoaSA9IGkuaW5pdCkpIHtcbiAgICAgICAgICAgICAgICBpKHZub2RlKTtcbiAgICAgICAgICAgICAgICBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB2YXIgY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbiwgc2VsID0gdm5vZGUuc2VsO1xuICAgICAgICBpZiAoc2VsID09PSAnIScpIHtcbiAgICAgICAgICAgIGlmIChpc1VuZGVmKHZub2RlLnRleHQpKSB7XG4gICAgICAgICAgICAgICAgdm5vZGUudGV4dCA9ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdm5vZGUuZWxtID0gYXBpLmNyZWF0ZUNvbW1lbnQodm5vZGUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2VsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIFBhcnNlIHNlbGVjdG9yXG4gICAgICAgICAgICB2YXIgaGFzaElkeCA9IHNlbC5pbmRleE9mKCcjJyk7XG4gICAgICAgICAgICB2YXIgZG90SWR4ID0gc2VsLmluZGV4T2YoJy4nLCBoYXNoSWR4KTtcbiAgICAgICAgICAgIHZhciBoYXNoID0gaGFzaElkeCA+IDAgPyBoYXNoSWR4IDogc2VsLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBkb3QgPSBkb3RJZHggPiAwID8gZG90SWR4IDogc2VsLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciB0YWcgPSBoYXNoSWR4ICE9PSAtMSB8fCBkb3RJZHggIT09IC0xID8gc2VsLnNsaWNlKDAsIE1hdGgubWluKGhhc2gsIGRvdCkpIDogc2VsO1xuICAgICAgICAgICAgdmFyIGVsbSA9IHZub2RlLmVsbSA9IGlzRGVmKGRhdGEpICYmIGlzRGVmKGkgPSBkYXRhLm5zKSA/IGFwaS5jcmVhdGVFbGVtZW50TlMoaSwgdGFnKVxuICAgICAgICAgICAgICAgIDogYXBpLmNyZWF0ZUVsZW1lbnQodGFnKTtcbiAgICAgICAgICAgIGlmIChoYXNoIDwgZG90KVxuICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoJ2lkJywgc2VsLnNsaWNlKGhhc2ggKyAxLCBkb3QpKTtcbiAgICAgICAgICAgIGlmIChkb3RJZHggPiAwKVxuICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgc2VsLnNsaWNlKGRvdCArIDEpLnJlcGxhY2UoL1xcLi9nLCAnICcpKTtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYnMuY3JlYXRlLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGNicy5jcmVhdGVbaV0oZW1wdHlOb2RlLCB2bm9kZSk7XG4gICAgICAgICAgICBpZiAoaXMuYXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaCA9IGNoaWxkcmVuW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2ggIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXBpLmFwcGVuZENoaWxkKGVsbSwgY3JlYXRlRWxtKGNoLCBpbnNlcnRlZFZub2RlUXVldWUpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzLnByaW1pdGl2ZSh2bm9kZS50ZXh0KSkge1xuICAgICAgICAgICAgICAgIGFwaS5hcHBlbmRDaGlsZChlbG0sIGFwaS5jcmVhdGVUZXh0Tm9kZSh2bm9kZS50ZXh0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpID0gdm5vZGUuZGF0YS5ob29rOyAvLyBSZXVzZSB2YXJpYWJsZVxuICAgICAgICAgICAgaWYgKGlzRGVmKGkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkuY3JlYXRlKVxuICAgICAgICAgICAgICAgICAgICBpLmNyZWF0ZShlbXB0eU5vZGUsIHZub2RlKTtcbiAgICAgICAgICAgICAgICBpZiAoaS5pbnNlcnQpXG4gICAgICAgICAgICAgICAgICAgIGluc2VydGVkVm5vZGVRdWV1ZS5wdXNoKHZub2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZub2RlLmVsbSA9IGFwaS5jcmVhdGVUZXh0Tm9kZSh2bm9kZS50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdm5vZGUuZWxtO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhZGRWbm9kZXMocGFyZW50RWxtLCBiZWZvcmUsIHZub2Rlcywgc3RhcnRJZHgsIGVuZElkeCwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgICAgIGZvciAoOyBzdGFydElkeCA8PSBlbmRJZHg7ICsrc3RhcnRJZHgpIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHZub2Rlc1tzdGFydElkeF07XG4gICAgICAgICAgICBpZiAoY2ggIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBjcmVhdGVFbG0oY2gsIGluc2VydGVkVm5vZGVRdWV1ZSksIGJlZm9yZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gaW52b2tlRGVzdHJveUhvb2sodm5vZGUpIHtcbiAgICAgICAgdmFyIGksIGosIGRhdGEgPSB2bm9kZS5kYXRhO1xuICAgICAgICBpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYoaSA9IGRhdGEuaG9vaykgJiYgaXNEZWYoaSA9IGkuZGVzdHJveSkpXG4gICAgICAgICAgICAgICAgaSh2bm9kZSk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLmRlc3Ryb3kubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICAgICAgY2JzLmRlc3Ryb3lbaV0odm5vZGUpO1xuICAgICAgICAgICAgaWYgKHZub2RlLmNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IHZub2RlLmNoaWxkcmVuW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSAhPSBudWxsICYmIHR5cGVvZiBpICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZva2VEZXN0cm95SG9vayhpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiByZW1vdmVWbm9kZXMocGFyZW50RWxtLCB2bm9kZXMsIHN0YXJ0SWR4LCBlbmRJZHgpIHtcbiAgICAgICAgZm9yICg7IHN0YXJ0SWR4IDw9IGVuZElkeDsgKytzdGFydElkeCkge1xuICAgICAgICAgICAgdmFyIGlfMSA9IHZvaWQgMCwgbGlzdGVuZXJzID0gdm9pZCAwLCBybSA9IHZvaWQgMCwgY2ggPSB2bm9kZXNbc3RhcnRJZHhdO1xuICAgICAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNEZWYoY2guc2VsKSkge1xuICAgICAgICAgICAgICAgICAgICBpbnZva2VEZXN0cm95SG9vayhjaCk7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IGNicy5yZW1vdmUubGVuZ3RoICsgMTtcbiAgICAgICAgICAgICAgICAgICAgcm0gPSBjcmVhdGVSbUNiKGNoLmVsbSwgbGlzdGVuZXJzKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpXzEgPSAwOyBpXzEgPCBjYnMucmVtb3ZlLmxlbmd0aDsgKytpXzEpXG4gICAgICAgICAgICAgICAgICAgICAgICBjYnMucmVtb3ZlW2lfMV0oY2gsIHJtKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzRGVmKGlfMSA9IGNoLmRhdGEpICYmIGlzRGVmKGlfMSA9IGlfMS5ob29rKSAmJiBpc0RlZihpXzEgPSBpXzEucmVtb3ZlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaV8xKGNoLCBybSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBybSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhcGkucmVtb3ZlQ2hpbGQocGFyZW50RWxtLCBjaC5lbG0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiB1cGRhdGVDaGlsZHJlbihwYXJlbnRFbG0sIG9sZENoLCBuZXdDaCwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgICAgIHZhciBvbGRTdGFydElkeCA9IDAsIG5ld1N0YXJ0SWR4ID0gMDtcbiAgICAgICAgdmFyIG9sZEVuZElkeCA9IG9sZENoLmxlbmd0aCAtIDE7XG4gICAgICAgIHZhciBvbGRTdGFydFZub2RlID0gb2xkQ2hbMF07XG4gICAgICAgIHZhciBvbGRFbmRWbm9kZSA9IG9sZENoW29sZEVuZElkeF07XG4gICAgICAgIHZhciBuZXdFbmRJZHggPSBuZXdDaC5sZW5ndGggLSAxO1xuICAgICAgICB2YXIgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWzBdO1xuICAgICAgICB2YXIgbmV3RW5kVm5vZGUgPSBuZXdDaFtuZXdFbmRJZHhdO1xuICAgICAgICB2YXIgb2xkS2V5VG9JZHg7XG4gICAgICAgIHZhciBpZHhJbk9sZDtcbiAgICAgICAgdmFyIGVsbVRvTW92ZTtcbiAgICAgICAgdmFyIGJlZm9yZTtcbiAgICAgICAgd2hpbGUgKG9sZFN0YXJ0SWR4IDw9IG9sZEVuZElkeCAmJiBuZXdTdGFydElkeCA8PSBuZXdFbmRJZHgpIHtcbiAgICAgICAgICAgIGlmIChvbGRTdGFydFZub2RlID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBvbGRTdGFydFZub2RlID0gb2xkQ2hbKytvbGRTdGFydElkeF07IC8vIFZub2RlIG1pZ2h0IGhhdmUgYmVlbiBtb3ZlZCBsZWZ0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChvbGRFbmRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChuZXdTdGFydFZub2RlID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBuZXdTdGFydFZub2RlID0gbmV3Q2hbKytuZXdTdGFydElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChuZXdFbmRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgbmV3RW5kVm5vZGUgPSBuZXdDaFstLW5ld0VuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3U3RhcnRWbm9kZSkpIHtcbiAgICAgICAgICAgICAgICBwYXRjaFZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgb2xkU3RhcnRWbm9kZSA9IG9sZENoWysrb2xkU3RhcnRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHNhbWVWbm9kZShvbGRFbmRWbm9kZSwgbmV3RW5kVm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRFbmRWbm9kZSwgbmV3RW5kVm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgICAgICAgICAgbmV3RW5kVm5vZGUgPSBuZXdDaFstLW5ld0VuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3RW5kVm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRTdGFydFZub2RlLCBuZXdFbmRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgb2xkU3RhcnRWbm9kZS5lbG0sIGFwaS5uZXh0U2libGluZyhvbGRFbmRWbm9kZS5lbG0pKTtcbiAgICAgICAgICAgICAgICBvbGRTdGFydFZub2RlID0gb2xkQ2hbKytvbGRTdGFydElkeF07XG4gICAgICAgICAgICAgICAgbmV3RW5kVm5vZGUgPSBuZXdDaFstLW5ld0VuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkRW5kVm5vZGUsIG5ld1N0YXJ0Vm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRFbmRWbm9kZSwgbmV3U3RhcnRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgb2xkRW5kVm5vZGUuZWxtLCBvbGRTdGFydFZub2RlLmVsbSk7XG4gICAgICAgICAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKG9sZEtleVRvSWR4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgb2xkS2V5VG9JZHggPSBjcmVhdGVLZXlUb09sZElkeChvbGRDaCwgb2xkU3RhcnRJZHgsIG9sZEVuZElkeCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlkeEluT2xkID0gb2xkS2V5VG9JZHhbbmV3U3RhcnRWbm9kZS5rZXldO1xuICAgICAgICAgICAgICAgIGlmIChpc1VuZGVmKGlkeEluT2xkKSkge1xuICAgICAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSksIG9sZFN0YXJ0Vm5vZGUuZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZWxtVG9Nb3ZlID0gb2xkQ2hbaWR4SW5PbGRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZWxtVG9Nb3ZlLnNlbCAhPT0gbmV3U3RhcnRWbm9kZS5zZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBjcmVhdGVFbG0obmV3U3RhcnRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShlbG1Ub01vdmUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvbGRDaFtpZHhJbk9sZF0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgZWxtVG9Nb3ZlLmVsbSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9sZFN0YXJ0SWR4IDw9IG9sZEVuZElkeCB8fCBuZXdTdGFydElkeCA8PSBuZXdFbmRJZHgpIHtcbiAgICAgICAgICAgIGlmIChvbGRTdGFydElkeCA+IG9sZEVuZElkeCkge1xuICAgICAgICAgICAgICAgIGJlZm9yZSA9IG5ld0NoW25ld0VuZElkeCArIDFdID09IG51bGwgPyBudWxsIDogbmV3Q2hbbmV3RW5kSWR4ICsgMV0uZWxtO1xuICAgICAgICAgICAgICAgIGFkZFZub2RlcyhwYXJlbnRFbG0sIGJlZm9yZSwgbmV3Q2gsIG5ld1N0YXJ0SWR4LCBuZXdFbmRJZHgsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZW1vdmVWbm9kZXMocGFyZW50RWxtLCBvbGRDaCwgb2xkU3RhcnRJZHgsIG9sZEVuZElkeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gcGF0Y2hWbm9kZShvbGRWbm9kZSwgdm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSkge1xuICAgICAgICB2YXIgaSwgaG9vaztcbiAgICAgICAgaWYgKGlzRGVmKGkgPSB2bm9kZS5kYXRhKSAmJiBpc0RlZihob29rID0gaS5ob29rKSAmJiBpc0RlZihpID0gaG9vay5wcmVwYXRjaCkpIHtcbiAgICAgICAgICAgIGkob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgZWxtID0gdm5vZGUuZWxtID0gb2xkVm5vZGUuZWxtO1xuICAgICAgICB2YXIgb2xkQ2ggPSBvbGRWbm9kZS5jaGlsZHJlbjtcbiAgICAgICAgdmFyIGNoID0gdm5vZGUuY2hpbGRyZW47XG4gICAgICAgIGlmIChvbGRWbm9kZSA9PT0gdm5vZGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICh2bm9kZS5kYXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYnMudXBkYXRlLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGNicy51cGRhdGVbaV0ob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgICAgICAgIGkgPSB2bm9kZS5kYXRhLmhvb2s7XG4gICAgICAgICAgICBpZiAoaXNEZWYoaSkgJiYgaXNEZWYoaSA9IGkudXBkYXRlKSlcbiAgICAgICAgICAgICAgICBpKG9sZFZub2RlLCB2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzVW5kZWYodm5vZGUudGV4dCkpIHtcbiAgICAgICAgICAgIGlmIChpc0RlZihvbGRDaCkgJiYgaXNEZWYoY2gpKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9sZENoICE9PSBjaClcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlQ2hpbGRyZW4oZWxtLCBvbGRDaCwgY2gsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0RlZihjaCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNEZWYob2xkVm5vZGUudGV4dCkpXG4gICAgICAgICAgICAgICAgICAgIGFwaS5zZXRUZXh0Q29udGVudChlbG0sICcnKTtcbiAgICAgICAgICAgICAgICBhZGRWbm9kZXMoZWxtLCBudWxsLCBjaCwgMCwgY2gubGVuZ3RoIC0gMSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzRGVmKG9sZENoKSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZVZub2RlcyhlbG0sIG9sZENoLCAwLCBvbGRDaC5sZW5ndGggLSAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzRGVmKG9sZFZub2RlLnRleHQpKSB7XG4gICAgICAgICAgICAgICAgYXBpLnNldFRleHRDb250ZW50KGVsbSwgJycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9sZFZub2RlLnRleHQgIT09IHZub2RlLnRleHQpIHtcbiAgICAgICAgICAgIGlmIChpc0RlZihvbGRDaCkpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVWbm9kZXMoZWxtLCBvbGRDaCwgMCwgb2xkQ2gubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhcGkuc2V0VGV4dENvbnRlbnQoZWxtLCB2bm9kZS50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNEZWYoaG9vaykgJiYgaXNEZWYoaSA9IGhvb2sucG9zdHBhdGNoKSkge1xuICAgICAgICAgICAgaShvbGRWbm9kZSwgdm5vZGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbiBwYXRjaChvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICAgICAgdmFyIGksIGVsbSwgcGFyZW50O1xuICAgICAgICB2YXIgaW5zZXJ0ZWRWbm9kZVF1ZXVlID0gW107XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYnMucHJlLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgY2JzLnByZVtpXSgpO1xuICAgICAgICBpZiAoIWlzVm5vZGUob2xkVm5vZGUpKSB7XG4gICAgICAgICAgICBvbGRWbm9kZSA9IGVtcHR5Tm9kZUF0KG9sZFZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2FtZVZub2RlKG9sZFZub2RlLCB2bm9kZSkpIHtcbiAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkVm5vZGUsIHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZWxtID0gb2xkVm5vZGUuZWxtO1xuICAgICAgICAgICAgcGFyZW50ID0gYXBpLnBhcmVudE5vZGUoZWxtKTtcbiAgICAgICAgICAgIGNyZWF0ZUVsbSh2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgIGlmIChwYXJlbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudCwgdm5vZGUuZWxtLCBhcGkubmV4dFNpYmxpbmcoZWxtKSk7XG4gICAgICAgICAgICAgICAgcmVtb3ZlVm5vZGVzKHBhcmVudCwgW29sZFZub2RlXSwgMCwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGluc2VydGVkVm5vZGVRdWV1ZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaW5zZXJ0ZWRWbm9kZVF1ZXVlW2ldLmRhdGEuaG9vay5pbnNlcnQoaW5zZXJ0ZWRWbm9kZVF1ZXVlW2ldKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnBvc3QubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICBjYnMucG9zdFtpXSgpO1xuICAgICAgICByZXR1cm4gdm5vZGU7XG4gICAgfTtcbn1cbmV4cG9ydHMuaW5pdCA9IGluaXQ7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1zbmFiYmRvbS5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBoXzEgPSByZXF1aXJlKFwiLi9oXCIpO1xuZnVuY3Rpb24gY29weVRvVGh1bmsodm5vZGUsIHRodW5rKSB7XG4gICAgdGh1bmsuZWxtID0gdm5vZGUuZWxtO1xuICAgIHZub2RlLmRhdGEuZm4gPSB0aHVuay5kYXRhLmZuO1xuICAgIHZub2RlLmRhdGEuYXJncyA9IHRodW5rLmRhdGEuYXJncztcbiAgICB0aHVuay5kYXRhID0gdm5vZGUuZGF0YTtcbiAgICB0aHVuay5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuO1xuICAgIHRodW5rLnRleHQgPSB2bm9kZS50ZXh0O1xuICAgIHRodW5rLmVsbSA9IHZub2RlLmVsbTtcbn1cbmZ1bmN0aW9uIGluaXQodGh1bmspIHtcbiAgICB2YXIgY3VyID0gdGh1bmsuZGF0YTtcbiAgICB2YXIgdm5vZGUgPSBjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBjdXIuYXJncyk7XG4gICAgY29weVRvVGh1bmsodm5vZGUsIHRodW5rKTtcbn1cbmZ1bmN0aW9uIHByZXBhdGNoKG9sZFZub2RlLCB0aHVuaykge1xuICAgIHZhciBpLCBvbGQgPSBvbGRWbm9kZS5kYXRhLCBjdXIgPSB0aHVuay5kYXRhO1xuICAgIHZhciBvbGRBcmdzID0gb2xkLmFyZ3MsIGFyZ3MgPSBjdXIuYXJncztcbiAgICBpZiAob2xkLmZuICE9PSBjdXIuZm4gfHwgb2xkQXJncy5sZW5ndGggIT09IGFyZ3MubGVuZ3RoKSB7XG4gICAgICAgIGNvcHlUb1RodW5rKGN1ci5mbi5hcHBseSh1bmRlZmluZWQsIGFyZ3MpLCB0aHVuayk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgaWYgKG9sZEFyZ3NbaV0gIT09IGFyZ3NbaV0pIHtcbiAgICAgICAgICAgIGNvcHlUb1RodW5rKGN1ci5mbi5hcHBseSh1bmRlZmluZWQsIGFyZ3MpLCB0aHVuayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29weVRvVGh1bmsob2xkVm5vZGUsIHRodW5rKTtcbn1cbmV4cG9ydHMudGh1bmsgPSBmdW5jdGlvbiB0aHVuayhzZWwsIGtleSwgZm4sIGFyZ3MpIHtcbiAgICBpZiAoYXJncyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFyZ3MgPSBmbjtcbiAgICAgICAgZm4gPSBrZXk7XG4gICAgICAgIGtleSA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIGhfMS5oKHNlbCwge1xuICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgaG9vazogeyBpbml0OiBpbml0LCBwcmVwYXRjaDogcHJlcGF0Y2ggfSxcbiAgICAgICAgZm46IGZuLFxuICAgICAgICBhcmdzOiBhcmdzXG4gICAgfSk7XG59O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy50aHVuaztcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXRodW5rLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHZub2RlXzEgPSByZXF1aXJlKFwiLi92bm9kZVwiKTtcbnZhciBodG1sZG9tYXBpXzEgPSByZXF1aXJlKFwiLi9odG1sZG9tYXBpXCIpO1xuZnVuY3Rpb24gdG9WTm9kZShub2RlLCBkb21BcGkpIHtcbiAgICB2YXIgYXBpID0gZG9tQXBpICE9PSB1bmRlZmluZWQgPyBkb21BcGkgOiBodG1sZG9tYXBpXzEuZGVmYXVsdDtcbiAgICB2YXIgdGV4dDtcbiAgICBpZiAoYXBpLmlzRWxlbWVudChub2RlKSkge1xuICAgICAgICB2YXIgaWQgPSBub2RlLmlkID8gJyMnICsgbm9kZS5pZCA6ICcnO1xuICAgICAgICB2YXIgY24gPSBub2RlLmdldEF0dHJpYnV0ZSgnY2xhc3MnKTtcbiAgICAgICAgdmFyIGMgPSBjbiA/ICcuJyArIGNuLnNwbGl0KCcgJykuam9pbignLicpIDogJyc7XG4gICAgICAgIHZhciBzZWwgPSBhcGkudGFnTmFtZShub2RlKS50b0xvd2VyQ2FzZSgpICsgaWQgKyBjO1xuICAgICAgICB2YXIgYXR0cnMgPSB7fTtcbiAgICAgICAgdmFyIGNoaWxkcmVuID0gW107XG4gICAgICAgIHZhciBuYW1lXzE7XG4gICAgICAgIHZhciBpID0gdm9pZCAwLCBuID0gdm9pZCAwO1xuICAgICAgICB2YXIgZWxtQXR0cnMgPSBub2RlLmF0dHJpYnV0ZXM7XG4gICAgICAgIHZhciBlbG1DaGlsZHJlbiA9IG5vZGUuY2hpbGROb2RlcztcbiAgICAgICAgZm9yIChpID0gMCwgbiA9IGVsbUF0dHJzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgbmFtZV8xID0gZWxtQXR0cnNbaV0ubm9kZU5hbWU7XG4gICAgICAgICAgICBpZiAobmFtZV8xICE9PSAnaWQnICYmIG5hbWVfMSAhPT0gJ2NsYXNzJykge1xuICAgICAgICAgICAgICAgIGF0dHJzW25hbWVfMV0gPSBlbG1BdHRyc1tpXS5ub2RlVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMCwgbiA9IGVsbUNoaWxkcmVuLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgY2hpbGRyZW4ucHVzaCh0b1ZOb2RlKGVsbUNoaWxkcmVuW2ldLCBkb21BcGkpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KHNlbCwgeyBhdHRyczogYXR0cnMgfSwgY2hpbGRyZW4sIHVuZGVmaW5lZCwgbm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGFwaS5pc1RleHQobm9kZSkpIHtcbiAgICAgICAgdGV4dCA9IGFwaS5nZXRUZXh0Q29udGVudChub2RlKTtcbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0ZXh0LCBub2RlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoYXBpLmlzQ29tbWVudChub2RlKSkge1xuICAgICAgICB0ZXh0ID0gYXBpLmdldFRleHRDb250ZW50KG5vZGUpO1xuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KCchJywge30sIFtdLCB0ZXh0LCBub2RlKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiB2bm9kZV8xLmRlZmF1bHQoJycsIHt9LCBbXSwgdW5kZWZpbmVkLCBub2RlKTtcbiAgICB9XG59XG5leHBvcnRzLnRvVk5vZGUgPSB0b1ZOb2RlO1xuZXhwb3J0cy5kZWZhdWx0ID0gdG9WTm9kZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXRvdm5vZGUuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiB2bm9kZShzZWwsIGRhdGEsIGNoaWxkcmVuLCB0ZXh0LCBlbG0pIHtcbiAgICB2YXIga2V5ID0gZGF0YSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogZGF0YS5rZXk7XG4gICAgcmV0dXJuIHsgc2VsOiBzZWwsIGRhdGE6IGRhdGEsIGNoaWxkcmVuOiBjaGlsZHJlbixcbiAgICAgICAgdGV4dDogdGV4dCwgZWxtOiBlbG0sIGtleToga2V5IH07XG59XG5leHBvcnRzLnZub2RlID0gdm5vZGU7XG5leHBvcnRzLmRlZmF1bHQgPSB2bm9kZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXZub2RlLmpzLm1hcCIsImZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh1cmwsIG9wdHMpIHtcblx0b3B0cyA9IG9wdHMgfHwge307XG5cblx0dmFyIHdzLCBudW09MCwgdGltZXI9MSwgJD17fTtcblx0dmFyIG1heCA9IG9wdHMubWF4QXR0ZW1wdHMgfHwgSW5maW5pdHk7XG5cblx0JC5vcGVuID0gZnVuY3Rpb24gKCkge1xuXHRcdHdzID0gbmV3IFdlYlNvY2tldCh1cmwsIG9wdHMucHJvdG9jb2xzIHx8IFtdKTtcblxuXHRcdHdzLm9ubWVzc2FnZSA9IG9wdHMub25tZXNzYWdlIHx8IG5vb3A7XG5cblx0XHR3cy5vbm9wZW4gPSBmdW5jdGlvbiAoZSkge1xuXHRcdFx0KG9wdHMub25vcGVuIHx8IG5vb3ApKGUpO1xuXHRcdFx0bnVtID0gMDtcblx0XHR9O1xuXG5cdFx0d3Mub25jbG9zZSA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRlLmNvZGUgPT09IDFlMyB8fCBlLmNvZGUgPT09IDEwMDEgfHwgZS5jb2RlID09PSAxMDA1IHx8ICQucmVjb25uZWN0KGUpO1xuXHRcdFx0KG9wdHMub25jbG9zZSB8fCBub29wKShlKTtcblx0XHR9O1xuXG5cdFx0d3Mub25lcnJvciA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHQoZSAmJiBlLmNvZGU9PT0nRUNPTk5SRUZVU0VEJykgPyAkLnJlY29ubmVjdChlKSA6IChvcHRzLm9uZXJyb3IgfHwgbm9vcCkoZSk7XG5cdFx0fTtcblx0fTtcblxuXHQkLnJlY29ubmVjdCA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0aWYgKHRpbWVyICYmIG51bSsrIDwgbWF4KSB7XG5cdFx0XHR0aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQob3B0cy5vbnJlY29ubmVjdCB8fCBub29wKShlKTtcblx0XHRcdFx0JC5vcGVuKCk7XG5cdFx0XHR9LCBvcHRzLnRpbWVvdXQgfHwgMWUzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0KG9wdHMub25tYXhpbXVtIHx8IG5vb3ApKGUpO1xuXHRcdH1cblx0fTtcblxuXHQkLmpzb24gPSBmdW5jdGlvbiAoeCkge1xuXHRcdHdzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeCkpO1xuXHR9O1xuXG5cdCQuc2VuZCA9IGZ1bmN0aW9uICh4KSB7XG5cdFx0d3Muc2VuZCh4KTtcblx0fTtcblxuXHQkLmNsb3NlID0gZnVuY3Rpb24gKHgsIHkpIHtcblx0XHR0aW1lciA9IGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0d3MuY2xvc2UoeCB8fCAxZTMsIHkpO1xuXHR9O1xuXG5cdCQub3BlbigpOyAvLyBpbml0XG5cblx0cmV0dXJuICQ7XG59XG4iLCJpbXBvcnQgeyBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxuaW1wb3J0IGggZnJvbSAnc25hYmJkb20vaCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjaGF0VmlldyAoY3RybCwgY2hhdFR5cGUpIHtcbiAgICBmdW5jdGlvbiBvbktleVByZXNzIChlKSB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWVcbiAgICAgICAgaWYgKChlLmtleUNvZGUgPT0gMTMgfHwgZS53aGljaCA9PSAxMykgJiYgbWVzc2FnZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjdHJsLnNvY2suc2VuZChKU09OLnN0cmluZ2lmeSh7XCJ0eXBlXCI6IGNoYXRUeXBlLCBcIm1lc3NhZ2VcIjogbWVzc2FnZSwgXCJnYW1lSWRcIjogY3RybC5tb2RlbFtcImdhbWVJZFwiXSB9KSk7XG4gICAgICAgICAgICAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBcIlwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGgoYGRpdi4ke2NoYXRUeXBlfSMke2NoYXRUeXBlfWAsIHsgY2xhc3M6IHtcImNoYXRcIjogdHJ1ZX0gfSwgW1xuICAgICAgICAgICAgICAgIGgoYG9sIyR7Y2hhdFR5cGV9LW1lc3NhZ2VzYCwgWyBoKFwiZGl2I21lc3NhZ2VzXCIpXSksXG4gICAgICAgICAgICAgICAgaCgnaW5wdXQjY2hhdC1lbnRyeScsIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwidGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJlbnRyeVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0b2NvbXBsZXRlOiBcIm9mZlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI6IFwiUGxlYXNlIGJlIG5pY2UgaW4gdGhlIGNoYXQhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhsZW5ndGg6IFwiMTQwXCIsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIG9uOiB7IGtleXByZXNzOiAoZSkgPT4gb25LZXlQcmVzcyhlKSB9LFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdKVxuICAgIH1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoYXRNZXNzYWdlICh1c2VyLCBtZXNzYWdlLCBjaGF0VHlwZSkge1xuICAgIGNvbnN0IG15RGl2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2hhdFR5cGUgKyAnLW1lc3NhZ2VzJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgLy8gWW91IG11c3QgYWRkIGJvcmRlciB3aWR0aHMsIHBhZGRpbmcgYW5kIG1hcmdpbnMgdG8gdGhlIHJpZ2h0LlxuICAgIGNvbnN0IGlzU2Nyb2xsZWQgPSBteURpdi5zY3JvbGxUb3AgPT0gbXlEaXYuc2Nyb2xsSGVpZ2h0IC0gbXlEaXYub2Zmc2V0SGVpZ2h0O1xuXG4gICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtZXNzYWdlcycpIGFzIEhUTUxFbGVtZW50O1xuICAgIGlmICh1c2VyLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2RpdiNtZXNzYWdlcycsIFsgaChcImxpLm1lc3NhZ2Uub2ZmZXJcIiwgW2goXCJ0XCIsIG1lc3NhZ2UpXSkgXSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2I21lc3NhZ2VzJywgWyBoKFwibGkubWVzc2FnZVwiLCBbaChcInVzZXJcIiwgdXNlciksIGgoXCJ0XCIsIG1lc3NhZ2UpXSkgXSkpO1xuICAgIH07XG5cbiAgICBpZiAoaXNTY3JvbGxlZCkgbXlEaXYuc2Nyb2xsVG9wID0gbXlEaXYuc2Nyb2xsSGVpZ2h0O1xufSIsImltcG9ydCB7IGtleTJwb3MgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcbmltcG9ydCB7IENvbG9yLCBHZW9tZXRyeSwgS2V5LCBSb2xlIH0gZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcclxuXHJcbmV4cG9ydCBjb25zdCB2YXJpYW50cyA9IFtcIm1ha3J1a1wiLCBcInNpdHR1eWluXCIsIFwicGxhY2VtZW50XCIsIFwiY3Jhenlob3VzZVwiLCBcInN0YW5kYXJkXCIsIFwic2hvZ2lcIiwgXCJ4aWFuZ3FpXCIsIFwiY2FwYWJsYW5jYVwiLCBcInNlaXJhd2FuXCJdO1xyXG5cclxuZXhwb3J0IGNvbnN0IFZBUklBTlRTID0ge1xyXG4gICAgbWFrcnVrOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImdyaWRcIiwgcGllY2VzOiBcIm1ha3J1a1wiLCBjc3M6IFtcIm1ha3J1a1wiXSwgaWNvbjogXCJRXCJ9LFxyXG4gICAgc2l0dHV5aW46IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiZ3JpZHhcIiwgcGllY2VzOiBcIm1ha3J1a1wiLCBjc3M6IFtcIm1ha3J1a1wiXSwgaWNvbjogXCJSXCIgfSxcclxuICAgIHNob2dpOiB7IGdlb206IEdlb21ldHJ5LmRpbTl4OSwgY2c6IFwiY2ctNTc2XCIsIGJvYXJkOiBcImdyaWQ5eDlcIiwgcGllY2VzOiBcInNob2dpXCIsIGNzczogW1wic2hvZ2kwXCIsIFwic2hvZ2kwd1wiLCBcInNob2dpMHBcIl0sIGljb246IFwiS1wiIH0sXHJcbiAgICB4aWFuZ3FpOiB7IGdlb206IEdlb21ldHJ5LmRpbTl4MTAsIGNnOiBcImNnLTU3Ni02NDBcIiwgYm9hcmQ6IFwicml2ZXJcIiwgcGllY2VzOiBcInhpYW5ncWlcIiwgY3NzOiBbXCJ4aWFuZ3FpXCIsIFwieGlhbmdxaWVcIiwgXCJ4aWFuZ3FpY3RcIl0sIGljb246IFwiT1wiIH0sXHJcbiAgICBwbGFjZW1lbnQ6IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiYnJvd25cIiwgcGllY2VzOiBcIm1lcmlkYVwiLCBjc3M6IFtcInN0YW5kYXJkXCJdLCBpY29uOiBcIlNcIiB9LFxyXG4gICAgY3Jhenlob3VzZTogeyBnZW9tOiBHZW9tZXRyeS5kaW04eDgsIGNnOiBcImNnLTUxMlwiLCBib2FyZDogXCJicm93blwiLCBwaWVjZXM6IFwibWVyaWRhXCIsIGNzczogW1wic3RhbmRhcmRcIl0sIGljb246IFwiSFwiIH0sXHJcbiAgICBjYXBhYmxhbmNhOiB7IGdlb206IEdlb21ldHJ5LmRpbTEweDgsIGNnOiBcImNnLTY0MFwiLCBib2FyZDogXCJjYXBhYmxhbmNhXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBbXCJzdGFuZGFyZFwiXSwgaWNvbjogXCJQXCIgfSxcclxuICAgIHNlaXJhd2FuOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBbXCJzdGFuZGFyZFwiXSwgaWNvbjogXCJMXCIgfSxcclxuICAgIHN0YW5kYXJkOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBbXCJzdGFuZGFyZFwiXSwgaWNvbjogXCJNXCIgfSxcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBvY2tldFJvbGVzKHZhcmlhbnQ6IHN0cmluZykge1xyXG4gICAgc3dpdGNoICh2YXJpYW50KSB7XHJcbiAgICBjYXNlIFwic2l0dHV5aW5cIjpcclxuICAgICAgICByZXR1cm4gW1wicm9va1wiLCBcImtuaWdodFwiLCBcInNpbHZlclwiLCBcImZlcnpcIiwgXCJraW5nXCJdO1xyXG4gICAgY2FzZSBcImNyYXp5aG91c2VcIjpcclxuICAgICAgICByZXR1cm4gW1wicGF3blwiLCBcImtuaWdodFwiLCBcImJpc2hvcFwiLCBcInJvb2tcIiwgXCJxdWVlblwiXTtcclxuICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJwYXduXCIsIFwibGFuY2VcIiwgXCJrbmlnaHRcIiwgXCJiaXNob3BcIiwgXCJyb29rXCIsIFwic2lsdmVyXCIsIFwiZ29sZFwiXTtcclxuICAgIGNhc2UgXCJzZWlyYXdhblwiOlxyXG4gICAgICAgIHJldHVybiBbXCJlbGVwaGFudFwiLCBcImhhd2tcIl07XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBbXCJyb29rXCIsIFwia25pZ2h0XCIsIFwiYmlzaG9wXCIsIFwicXVlZW5cIiwgXCJraW5nXCJdO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwcm9tb3Rpb25ab25lKHZhcmlhbnQ6IHN0cmluZywgY29sb3I6IHN0cmluZykge1xyXG4gICAgc3dpdGNoICh2YXJpYW50KSB7XHJcbiAgICBjYXNlICdzaG9naSc6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E5YjljOWQ5ZTlmOWc5aDlpOWE4YjhjOGQ4ZThmOGc4aDhpOGE3YjdjN2Q3ZTdmN2c3aDdpNycgOiAnYTFiMWMxZDFlMWYxZzFoMWkxYTJiMmMyZDJlMmYyZzJoMmkyYTNiM2MzZDNlM2YzZzNoM2kzJztcclxuICAgIGNhc2UgJ21ha3J1ayc6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E2YjZjNmQ2ZTZmNmc2aDYnIDogJ2EzYjNjM2QzZTNmM2czaDMnO1xyXG4gICAgY2FzZSAnc2l0dHV5aW4nOlxyXG4gICAgICAgIHJldHVybiBjb2xvciA9PT0gJ3doaXRlJyA/ICdhOGI3YzZkNWU1ZjZnN2g4JyA6ICdhMWIyYzNkNGU0ZjNnMmgxJztcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E4YjhjOGQ4ZThmOGc4aDhpOGo4JyA6ICdhMWIxYzFkMWUxZjFnMWgxaTFqMSc7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwcm9tb3Rpb25Sb2xlcyh2YXJpYW50OiBzdHJpbmcsIHJvbGU6IFJvbGUpIHtcclxuICAgIHN3aXRjaCAodmFyaWFudCkge1xyXG4gICAgY2FzZSBcImNhcGFibGFuY2FcIjpcclxuICAgICAgICByZXR1cm4gW1wicXVlZW5cIiwgXCJrbmlnaHRcIiwgXCJyb29rXCIsIFwiYmlzaG9wXCIsIFwiYXJjaGJpc2hvcFwiLCBcImNhbmNlbGxvclwiXTtcclxuICAgIGNhc2UgXCJzZWlyYXdhblwiOlxyXG4gICAgICAgIHJldHVybiBbXCJxdWVlblwiLCBcImtuaWdodFwiLCBcInJvb2tcIiwgXCJiaXNob3BcIiwgXCJlbGVwaGFudFwiLCBcImhhd2tcIl07XHJcbiAgICBjYXNlIFwic2hvZ2lcIjpcclxuICAgICAgICByZXR1cm4gW1wicFwiICsgcm9sZSwgcm9sZV07XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBbXCJxdWVlblwiLCBcImtuaWdodFwiLCBcInJvb2tcIiwgXCJiaXNob3BcIl07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBtYW5kYXRvcnlQcm9tb3Rpb24ocm9sZTogUm9sZSwgZGVzdDogS2V5LCBjb2xvcjogQ29sb3IpIHtcclxuICAgIHN3aXRjaCAocm9sZSkge1xyXG4gICAgY2FzZSBcInBhd25cIjpcclxuICAgIGNhc2UgXCJsYW5jZVwiOlxyXG4gICAgICAgIGlmIChjb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjlcIjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gZGVzdFsxXSA9PT0gXCIxXCI7XHJcbiAgICAgICAgfVxyXG4gICAgY2FzZSBcImtuaWdodFwiOlxyXG4gICAgICAgIGlmIChjb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjlcIiB8fCBkZXN0WzFdID09PSBcIjhcIjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gZGVzdFsxXSA9PT0gXCIxXCIgfHwgZGVzdFsxXSA9PT0gXCIyXCI7XHJcbiAgICAgICAgfVxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBuZWVkUG9ja2V0cyh2YXJpYW50OiBzdHJpbmcpIHtcclxuICAgIHJldHVybiB2YXJpYW50ID09PSAncGxhY2VtZW50JyB8fCB2YXJpYW50ID09PSAnY3Jhenlob3VzZScgfHwgdmFyaWFudCA9PT0gJ3NpdHR1eWluJyB8fCB2YXJpYW50ID09PSAnc2hvZ2knIHx8IHZhcmlhbnQgPT09ICdzZWlyYXdhbidcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0VwKHZhcmlhbnQ6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHZhcmlhbnQgPT09ICdzdGFuZGFyZCcgfHwgdmFyaWFudCA9PT0gJ3BsYWNlbWVudCcgfHwgdmFyaWFudCA9PT0gJ2NyYXp5aG91c2UnIHx8IHZhcmlhbnQgPT09ICdjYXBhYmxhbmNhJyB8fCB2YXJpYW50ID09PSAnc2VpcmF3YW4nXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpZmYoYTogbnVtYmVyLCBiOm51bWJlcik6bnVtYmVyIHtcclxuICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkaWFnb25hbE1vdmUocG9zMSwgcG9zMikge1xyXG4gICAgY29uc3QgeGQgPSBkaWZmKHBvczFbMF0sIHBvczJbMF0pO1xyXG4gICAgY29uc3QgeWQgPSBkaWZmKHBvczFbMV0sIHBvczJbMV0pO1xyXG4gICAgcmV0dXJuIHhkID09PSB5ZCAmJiB4ZCA9PT0gMTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNhbkdhdGUoZmVuLCBwaWVjZSwgb3JpZywgZGVzdCwgbWV0YSkge1xyXG4gICAgY29uc29sZS5sb2coXCIgICBpc0dhdGluZygpXCIsIHBpZWNlLCBvcmlnLCBkZXN0LCBtZXRhKTtcclxuICAgIGlmICgocGllY2UuY29sb3IgPT09IFwid2hpdGVcIiAmJiBvcmlnLnNsaWNlKDEpICE9PSBcIjFcIikgfHxcclxuICAgICAgICAocGllY2UuY29sb3IgPT09IFwiYmxhY2tcIiAmJiBvcmlnLnNsaWNlKDEpICE9PSBcIjhcIikgfHxcclxuICAgICAgICAocGllY2Uucm9sZSA9PT0gXCJoYXdrXCIpIHx8XHJcbiAgICAgICAgKHBpZWNlLnJvbGUgPT09IFwiZWxlcGhhbnRcIikpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuXHJcbiAgICAvLyBJbiBzdGFydGluZyBwb3NpdGlvbiBraW5nIGFuZCghKSByb29rIHZpcmdpbml0eSBpcyBlbmNvZGVkIGluIEtRa3FcclxuICAgIC8vIFwicm5icWtibnIvcHBwcHBwcHAvOC84LzgvOC9QUFBQUFBQUC9STkJRS0JOUltIRWhlXSB3IEtRQkNERkdrcWJjZGZnIC0gMCAxXCJcclxuXHJcbiAgICAvLyBidXQgYWZ0ZXIga2luZ3MgbW92ZWQgcm9vayB2aXJnaW5pdHkgaXMgZW5jb2RlZCBpbiBBSGFoXHJcbiAgICAvLyBybmJxMWJuci9wcHBwa3BwcC84LzRwMy80UDMvOC9QUFBQS1BQUC9STkJRMUJOUltIRWhlXSB3IEFCQ0RGR0hhYmNkZmdoIC0gMiAzXHJcblxyXG4gICAgY29uc3QgcGFydHMgPSBmZW4uc3BsaXQoXCIgXCIpO1xyXG4gICAgY29uc3QgcGxhY2VtZW50ID0gcGFydHNbMF07XHJcbiAgICBjb25zdCBjb2xvciA9IHBhcnRzWzFdO1xyXG4gICAgY29uc3QgY2FzdGwgPSBwYXJ0c1syXTtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwiaXNHYXRpbmcoKVwiLCBvcmlnLCBwbGFjZW1lbnQsIGNvbG9yLCBjYXN0bCk7XHJcbiAgICBzd2l0Y2ggKG9yaWcpIHtcclxuICAgIGNhc2UgXCJhMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiQVwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcIlFcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYjFcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcIkJcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYzFcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcIkNcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZDFcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcIkRcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZTFcIjpcclxuICAgICAgICBpZiAocGllY2Uucm9sZSAhPT0gXCJraW5nXCIpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJmMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiRlwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJnMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiR1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJoMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiSFwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcIktcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYThcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImFcIikgPT09IC0xICYmIGNhc3RsLmluZGV4T2YoXCJxXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImI4XCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJiXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImM4XCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJjXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImQ4XCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJkXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImU4XCI6XHJcbiAgICAgICAgaWYgKHBpZWNlLnJvbGUgIT09IFwia2luZ1wiKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZjhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImZcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZzhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImdcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiaDhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImhcIikgPT09IC0xICYmIGNhc3RsLmluZGV4T2YoXCJrXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfTtcclxuICAgIGNvbnN0IGJyYWNrZXRQb3MgPSBwbGFjZW1lbnQuaW5kZXhPZihcIltcIik7XHJcbiAgICBjb25zdCBwb2NrZXRzID0gcGxhY2VtZW50LnNsaWNlKGJyYWNrZXRQb3MpO1xyXG4gICAgY29uc3QgcGggPSBsYyhwb2NrZXRzLCBcImhcIiwgY29sb3I9PT0ndycpID09PSAxO1xyXG4gICAgY29uc3QgcGUgPSBsYyhwb2NrZXRzLCBcImVcIiwgY29sb3I9PT0ndycpID09PSAxO1xyXG5cclxuICAgIHJldHVybiBbcGgsIHBlXTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvbW90aW9uKHZhcmlhbnQsIHBpZWNlLCBvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICBpZiAodmFyaWFudCA9PT0gJ3hpYW5ncWknKSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBweiA9IHByb21vdGlvblpvbmUodmFyaWFudCwgcGllY2UuY29sb3IpXHJcbiAgICBzd2l0Y2ggKHZhcmlhbnQpIHtcclxuICAgIGNhc2UgJ3Nob2dpJzpcclxuICAgICAgICByZXR1cm4gWydraW5nJywgJ2dvbGQnLCAncHBhd24nLCAncGtuaWdodCcsICdwYmlzaG9wJywgJ3Byb29rJywgJ3BzaWx2ZXInLCAncGxhbmNlJ10uaW5kZXhPZihwaWVjZS5yb2xlKSA9PT0gLTFcclxuICAgICAgICAgICAgJiYgKHB6LmluZGV4T2Yob3JpZykgIT09IC0xIHx8IHB6LmluZGV4T2YoZGVzdCkgIT09IC0xKVxyXG4gICAgY2FzZSAnc2l0dHV5aW4nOlxyXG4gICAgICAgIC8vIFNlZSBodHRwczovL3Zkb2N1bWVudHMubmV0L2hvdy10by1wbGF5LW15YW5tYXItdHJhZGl0aW9uYWwtY2hlc3MtZW5nLWJvb2stMS5odG1sXHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgZG0gPSBkaWFnb25hbE1vdmUoa2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLCBrZXkycG9zKGRlc3QsIGZpcnN0UmFua0lzMCkpO1xyXG4gICAgICAgIHJldHVybiBwaWVjZS5yb2xlID09PSBcInBhd25cIiAmJiAoIG9yaWcgPT09IGRlc3QgfHwgKCFtZXRhLmNhcHR1cmVkICYmIGRtKSlcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIHBpZWNlLnJvbGUgPT09IFwicGF3blwiICYmIHB6LmluZGV4T2YoZGVzdCkgIT09IC0xXHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1Y2kydXNpKG1vdmUpIHtcclxuICAgIGNvbnN0IHBhcnRzID0gbW92ZS5zcGxpdChcIlwiKTtcclxuICAgIGlmIChwYXJ0c1sxXSA9PT0gXCJAXCIpIHtcclxuICAgICAgICBwYXJ0c1sxXSA9IFwiKlwiO1xyXG4gICAgICAgIHBhcnRzWzJdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1syXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgICAgICBwYXJ0c1szXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbM10uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHBhcnRzWzBdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1swXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgICAgICBwYXJ0c1sxXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMV0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbMl0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzJdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgICAgIHBhcnRzWzNdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1szXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgIH1cclxuICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXNpMnVjaShtb3ZlKSB7XHJcbiAgICBjb25zdCBwYXJ0cyA9IG1vdmUuc3BsaXQoXCJcIik7XHJcbiAgICBpZiAocGFydHNbMV0gPT09IFwiKlwiKSB7XHJcbiAgICAgICAgcGFydHNbMV0gPSBcIkBcIjtcclxuICAgICAgICBwYXJ0c1syXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMl0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbM10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzNdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBwYXJ0c1swXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMF0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbMV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzFdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgICAgIHBhcnRzWzJdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1syXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgICAgICBwYXJ0c1szXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbM10uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHJvbGVUb1NhbiA9IHtcclxuICAgIHBhd246ICdQJyxcclxuICAgIGtuaWdodDogJ04nLFxyXG4gICAgYmlzaG9wOiAnQicsXHJcbiAgICByb29rOiAnUicsXHJcbiAgICBxdWVlbjogJ1EnLFxyXG4gICAga2luZzogJ0snLFxyXG4gICAgYXJjaGJpc2hvcDogJ0EnLFxyXG4gICAgY2FuY2VsbG9yOiAnQycsXHJcbiAgICBlbGVwaGFudDogXCJFXCIsXHJcbiAgICBoYXdrOiBcIkhcIixcclxuICAgIGZlcno6ICdGJyxcclxuICAgIG1ldDogJ00nLFxyXG4gICAgZ29sZDogJ0cnLFxyXG4gICAgc2lsdmVyOiAnUycsXHJcbiAgICBsYW5jZTogJ0wnLFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IHNhblRvUm9sZSA9IHtcclxuICAgIFA6ICdwYXduJyxcclxuICAgIE46ICdrbmlnaHQnLFxyXG4gICAgQjogJ2Jpc2hvcCcsXHJcbiAgICBSOiAncm9vaycsXHJcbiAgICBROiAncXVlZW4nLFxyXG4gICAgSzogJ2tpbmcnLFxyXG4gICAgQTogJ2FyY2hiaXNob3AnLFxyXG4gICAgQzogJ2NhbmNlbGxvcicsXHJcbiAgICBFOiAnZWxlcGhhbnQnLFxyXG4gICAgSDogJ2hhd2snLFxyXG4gICAgRjogJ2ZlcnonLFxyXG4gICAgTTogJ21ldCcsXHJcbiAgICBHOiAnZ29sZCcsXHJcbiAgICBTOiAnc2lsdmVyJyxcclxuICAgIEw6ICdsYW5jZScsXHJcbiAgICBwOiAncGF3bicsXHJcbiAgICBuOiAna25pZ2h0JyxcclxuICAgIGI6ICdiaXNob3AnLFxyXG4gICAgcjogJ3Jvb2snLFxyXG4gICAgcTogJ3F1ZWVuJyxcclxuICAgIGs6ICdraW5nJyxcclxuICAgIGE6ICdhcmNoYmlzaG9wJyxcclxuICAgIGM6ICdjYW5jZWxsb3InLFxyXG4gICAgZTogJ2VsZXBoYW50JyxcclxuICAgIGg6ICdoYXdrJyxcclxuICAgIGY6ICdmZXJ6JyxcclxuICAgIG06ICdtZXQnLFxyXG4gICAgZzogJ2dvbGQnLFxyXG4gICAgczogJ3NpbHZlcicsXHJcbiAgICBsOiAnbGFuY2UnLFxyXG59O1xyXG5cclxuLy8gQ291bnQgZ2l2ZW4gbGV0dGVyIG9jY3VyZW5jZXMgaW4gYSBzdHJpbmdcclxuZXhwb3J0IGZ1bmN0aW9uIGxjKHN0ciwgbGV0dGVyLCB1cHBlcmNhc2UpIHtcclxuICAgIHZhciBsZXR0ZXJDb3VudCA9IDA7XHJcbiAgICBpZiAodXBwZXJjYXNlKSBsZXR0ZXIgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgIGZvciAodmFyIHBvc2l0aW9uID0gMDsgcG9zaXRpb24gPCBzdHIubGVuZ3RoOyBwb3NpdGlvbisrKSB7XHJcbiAgICAgICAgaWYgKHN0ci5jaGFyQXQocG9zaXRpb24pID09PSBsZXR0ZXIpIGxldHRlckNvdW50ICs9IDE7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbGV0dGVyQ291bnQ7XHJcbn1cclxuIiwiLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjA2MTgzNTUvdGhlLXNpbXBsZXN0LXBvc3NpYmxlLWphdmFzY3JpcHQtY291bnRkb3duLXRpbWVyXG5cbmltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG5leHBvcnQgY2xhc3MgQ2xvY2sge1xuICAgIGR1cmF0aW9uOiBudW1iZXI7XG4gICAgaW5jcmVtZW50OiBudW1iZXI7XG4gICAgZ3JhbnVsYXJpdHk6IG51bWJlcjtcbiAgICBydW5uaW5nOiBib29sZWFuO1xuICAgIGNvbm5lY3Rpbmc6IGJvb2xlYW47XG4gICAgdGltZW91dDogYW55O1xuICAgIHN0YXJ0VGltZTogYW55O1xuICAgIHRpY2tDYWxsYmFja3M6IGFueVtdO1xuICAgIGZsYWdDYWxsYmFjazogYW55O1xuICAgIGVsOiBIVE1MRWxlbWVudDtcblxuICAgIC8vIGdhbWUgYmFzZVRpbWUgKG1pbikgYW5kIGluY3JlbWVudCAoc2VjKVxuICAgIGNvbnN0cnVjdG9yKGJhc2VUaW1lLCBpbmNyZW1lbnQsIGVsKSB7XG4gICAgdGhpcy5kdXJhdGlvbiA9IGJhc2VUaW1lICogMTAwMCAqIDYwO1xuICAgIHRoaXMuaW5jcmVtZW50ID0gaW5jcmVtZW50ICogMTAwMDtcbiAgICB0aGlzLmdyYW51bGFyaXR5ID0gNTAwO1xuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgIHRoaXMuY29ubmVjdGluZyA9IGZhbHNlO1xuICAgIHRoaXMudGltZW91dCA9IG51bGw7XG4gICAgdGhpcy5zdGFydFRpbWUgPSBudWxsO1xuICAgIHRoaXMudGlja0NhbGxiYWNrcyA9IFtdO1xuICAgIHRoaXMuZmxhZ0NhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLmVsID0gZWw7XG5cbiAgICByZW5kZXJUaW1lKHRoaXMsIHRoaXMuZHVyYXRpb24pO1xuICAgIH1cblxuICAgIHN0YXJ0ID0gKGR1cmF0aW9uKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICAgICAgaWYgKHR5cGVvZiBkdXJhdGlvbiAhPT0gXCJ1bmRlZmluZWRcIikgdGhpcy5kdXJhdGlvbiA9IGR1cmF0aW9uO1xuXG4gICAgICAgIHRoaXMucnVubmluZyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgZGlmZjtcblxuICAgICAgICAoZnVuY3Rpb24gdGltZXIoKSB7XG4gICAgICAgICAgICBkaWZmID0gdGhhdC5kdXJhdGlvbiAtIChEYXRlLm5vdygpIC0gdGhhdC5zdGFydFRpbWUpO1xuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJ0aW1lcigpXCIsIHRoYXQuZHVyYXRpb24gLSBkaWZmKTtcbiAgICAgICAgICAgIGlmIChkaWZmIDw9IDApIHtcbiAgICAgICAgICAgICAgICB0aGF0LmZsYWdDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIHRoYXQucGF1c2UoZmFsc2UpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoYXQudGltZW91dCA9IHNldFRpbWVvdXQodGltZXIsIHRoYXQuZ3JhbnVsYXJpdHkpO1xuICAgICAgICAgICAgdGhhdC50aWNrQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoYXQsIHRoYXQsIGRpZmYpO1xuICAgICAgICAgICAgfSwgdGhhdCk7XG4gICAgICAgIH0oKSk7XG4gICAgfVxuXG4gICAgb25UaWNrID0gKGNhbGxiYWNrKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMudGlja0NhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbkZsYWcgPSAoY2FsbGJhY2spID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5wYXVzZShmYWxzZSk7XG4gICAgICAgICAgICB0aGlzLmZsYWdDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHBhdXNlID0gKHdpdGhJbmNyZW1lbnQpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcblxuICAgICAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMudGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dCk7XG4gICAgICAgIHRoaXMudGltZW91dCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5kdXJhdGlvbiAtPSBEYXRlLm5vdygpIC0gdGhpcy5zdGFydFRpbWU7XG4gICAgICAgIGlmICh3aXRoSW5jcmVtZW50ICYmIHRoaXMuaW5jcmVtZW50KSB0aGlzLmR1cmF0aW9uICs9IHRoaXMuaW5jcmVtZW50O1xuICAgICAgICByZW5kZXJUaW1lKHRoaXMsIHRoaXMuZHVyYXRpb24pO1xuICAgIH1cblxuICAgIHNldFRpbWUgPSAobWlsbGlzKSA9PiB7XG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBtaWxsaXM7XG4gICAgICAgIHJlbmRlclRpbWUodGhpcywgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgcGFyc2VUaW1lID0gKG1pbGxpcykgPT4ge1xuICAgICAgICBsZXQgbWludXRlcyA9IE1hdGguZmxvb3IobWlsbGlzIC8gNjAwMDApO1xuICAgICAgICBsZXQgc2Vjb25kcyA9IChtaWxsaXMgJSA2MDAwMCkgLyAxMDAwO1xuICAgICAgICBsZXQgc2VjcywgbWlucztcbiAgICAgICAgaWYgKE1hdGguZmxvb3Ioc2Vjb25kcykgPT0gNjApIHtcbiAgICAgICAgICAgIG1pbnV0ZXMrKztcbiAgICAgICAgICAgIHNlY29uZHMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIG1pbnV0ZXMgPSBNYXRoLm1heCgwLCBtaW51dGVzKTtcbiAgICAgICAgc2Vjb25kcyA9IE1hdGgubWF4KDAsIHNlY29uZHMpO1xuICAgICAgICBpZiAobWlsbGlzIDwgMTAwMDApIHtcbiAgICAgICAgICAgIHNlY3MgPSBzZWNvbmRzLnRvRml4ZWQoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWNzID0gU3RyaW5nKE1hdGguZmxvb3Ioc2Vjb25kcykpO1xuICAgICAgICB9XG4gICAgICAgIG1pbnMgPSAobWludXRlcyA8IDEwID8gXCIwXCIgOiBcIlwiKSArIFN0cmluZyhtaW51dGVzKTtcbiAgICAgICAgc2VjcyA9IChzZWNvbmRzIDwgMTAgPyBcIjBcIiA6IFwiXCIpICsgc2VjcztcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG1pbnV0ZXM6IG1pbnMsXG4gICAgICAgICAgICBzZWNvbmRzOiBzZWNzLFxuICAgICAgICB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRpbWUoY2xvY2ssIHRpbWUpIHtcbiAgICBpZiAoY2xvY2suZ3JhbnVsYXJpdHkgPiAxMDAgJiYgdGltZSA8IDEwMDAwKSBjbG9jay5ncmFudWxhcml0eSA9IDEwMDtcbiAgICBjb25zdCBwYXJzZWQgPSBjbG9jay5wYXJzZVRpbWUodGltZSk7XG4gICAgLy8gY29uc29sZS5sb2coXCJyZW5kZXJUaW1lKCk6XCIsIHRpbWUsIHBhcnNlZCk7XG5cbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodGltZSk7XG4gICAgY29uc3QgbWlsbGlzID0gZGF0ZS5nZXRVVENNaWxsaXNlY29uZHMoKTtcbiAgICBjbG9jay5lbCA9IHBhdGNoKGNsb2NrLmVsLCBoKCdkaXYuY2xvY2std3JhcCcsIFtoKCdkaXYuY2xvY2snLCBbXG4gICAgICAgIGgoJ2Rpdi5jbG9jay50aW1lLm1pbicsIHtjbGFzczoge3J1bm5pbmc6IGNsb2NrLnJ1bm5pbmcsIGh1cnJ5OiB0aW1lIDwgMTAwMDAsIGNvbm5lY3Rpbmc6IGNsb2NrLmNvbm5lY3Rpbmd9fSwgcGFyc2VkLm1pbnV0ZXMpLFxuICAgICAgICBoKCdkaXYuY2xvY2suc2VwJywge2NsYXNzOiB7cnVubmluZzogY2xvY2sucnVubmluZywgaHVycnk6IHRpbWUgPCAxMDAwMCwgbG93OiBtaWxsaXMgPCA1MDAsIGNvbm5lY3Rpbmc6IGNsb2NrLmNvbm5lY3Rpbmd9fSAsICc6JyksXG4gICAgICAgIGgoJ2Rpdi5jbG9jay50aW1lLnNlYycsIHtjbGFzczoge3J1bm5pbmc6IGNsb2NrLnJ1bm5pbmcsIGh1cnJ5OiB0aW1lIDwgMTAwMDAsIGNvbm5lY3Rpbmc6IGNsb2NrLmNvbm5lY3Rpbmd9fSwgcGFyc2VkLnNlY29uZHMpLFxuICAgICAgICBdKV0pKTtcbn1cbiIsImltcG9ydCBTb2NrZXR0ZSBmcm9tICdzb2NrZXR0ZSc7XHJcblxyXG5pbXBvcnQgeyBpbml0IH0gZnJvbSAnc25hYmJkb20nO1xyXG5pbXBvcnQgeyBoIH0gZnJvbSAnc25hYmJkb20vaCc7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcblxyXG5pbXBvcnQgeyBrZXkycG9zLCBwb3Mya2V5IH0gZnJvbSAnY2hlc3Nncm91bmR4L3V0aWwnO1xyXG5pbXBvcnQgeyBDaGVzc2dyb3VuZCB9IGZyb20gJ2NoZXNzZ3JvdW5keCc7XHJcbmltcG9ydCB7IEFwaSB9IGZyb20gJ2NoZXNzZ3JvdW5keC9hcGknO1xyXG5pbXBvcnQgeyBDb2xvciwgRGVzdHMsIFBpZWNlc0RpZmYsIFJvbGUsIEtleSwgUG9zLCBQaWVjZSwgZGltZW5zaW9ucyB9IGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XHJcblxyXG5pbXBvcnQgeyBDbG9jaywgcmVuZGVyVGltZSB9IGZyb20gJy4vY2xvY2snO1xyXG5pbXBvcnQgbWFrZUdhdGluZyBmcm9tICcuL2dhdGluZyc7XHJcbmltcG9ydCBtYWtlUHJvbW90aW9uIGZyb20gJy4vcHJvbW90aW9uJztcclxuaW1wb3J0IHsgZHJvcElzVmFsaWQsIHBvY2tldFZpZXcsIHVwZGF0ZVBvY2tldHMgfSBmcm9tICcuL3BvY2tldCc7XHJcbmltcG9ydCB7IHNvdW5kLCBjaGFuZ2VDU1MgfSBmcm9tICcuL3NvdW5kJztcclxuaW1wb3J0IHsgdmFyaWFudHMsIGhhc0VwLCBuZWVkUG9ja2V0cywgcm9sZVRvU2FuLCB1Y2kydXNpLCB1c2kydWNpLCBWQVJJQU5UUyB9IGZyb20gJy4vY2hlc3MnO1xyXG5pbXBvcnQgeyByZW5kZXJVc2VybmFtZSB9IGZyb20gJy4vdXNlcic7XHJcbmltcG9ydCB7IGNoYXRNZXNzYWdlLCBjaGF0VmlldyB9IGZyb20gJy4vY2hhdCc7XHJcbmltcG9ydCB7IG1vdmVsaXN0VmlldywgdXBkYXRlTW92ZWxpc3QgfSBmcm9tICcuL21vdmVsaXN0JztcclxuaW1wb3J0IHJlc2l6ZUhhbmRsZSBmcm9tICcuL3Jlc2l6ZSc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBSb3VuZENvbnRyb2xsZXIge1xyXG4gICAgbW9kZWw7XHJcbiAgICBzb2NrO1xyXG4gICAgY2hlc3Nncm91bmQ6IEFwaTtcclxuICAgIGZ1bGxmZW46IHN0cmluZztcclxuICAgIHdwbGF5ZXI6IHN0cmluZztcclxuICAgIGJwbGF5ZXI6IHN0cmluZztcclxuICAgIGJhc2U6IG51bWJlcjtcclxuICAgIGluYzogbnVtYmVyO1xyXG4gICAgbXljb2xvcjogQ29sb3I7XHJcbiAgICBvcHBjb2xvcjogQ29sb3I7XHJcbiAgICB0dXJuQ29sb3I6IENvbG9yO1xyXG4gICAgY2xvY2tzOiBhbnk7XHJcbiAgICBhYm9ydGFibGU6IGJvb2xlYW47XHJcbiAgICBnYW1lSWQ6IHN0cmluZztcclxuICAgIHZhcmlhbnQ6IHN0cmluZztcclxuICAgIHBvY2tldHM6IGFueTtcclxuICAgIHZwb2NrZXQwOiBhbnk7XHJcbiAgICB2cG9ja2V0MTogYW55O1xyXG4gICAgZ2FtZUNvbnRyb2xzOiBhbnk7XHJcbiAgICBtb3ZlQ29udHJvbHM6IGFueTtcclxuICAgIGdhdGluZzogYW55O1xyXG4gICAgcHJvbW90aW9uOiBhbnk7XHJcbiAgICBkZXN0czogRGVzdHM7XHJcbiAgICBsYXN0bW92ZTogS2V5W107XHJcbiAgICBwcmVtb3ZlOiBhbnk7XHJcbiAgICBwcmVkcm9wOiBhbnk7XHJcbiAgICByZXN1bHQ6IHN0cmluZztcclxuICAgIGZsaXA6IGJvb2xlYW47XHJcbiAgICBzcGVjdGF0b3I6IGJvb2xlYW47XHJcbiAgICBvcHBJc1JhbmRvbU1vdmVyOiBib29sZWFuO1xyXG4gICAgdHY6IHN0cmluZztcclxuICAgIHN0YXR1czogbnVtYmVyO1xyXG4gICAgc3RlcHM7XHJcbiAgICBwbHk6IG51bWJlcjtcclxuICAgIHBsYXllcnM6IHN0cmluZ1tdO1xyXG4gICAgQ1NTaW5kZXhlczogbnVtYmVyW107XHJcbiAgICBjbGlja0Ryb3A6IFBpZWNlIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGVsLCBtb2RlbCkge1xyXG4gICAgICAgIGNvbnN0IG9uT3BlbiA9IChldnQpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJjdHJsLm9uT3BlbigpXCIsIGV2dCk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzWzBdLmNvbm5lY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMV0uY29ubmVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZ2FtZV91c2VyX2Nvbm5lY3RlZFwiLCB1c2VybmFtZTogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWF4QXR0ZW1wdHM6IDEwLFxyXG4gICAgICAgICAgICBvbm9wZW46IGUgPT4gb25PcGVuKGUpLFxyXG4gICAgICAgICAgICBvbm1lc3NhZ2U6IGUgPT4gdGhpcy5vbk1lc3NhZ2UoZSksXHJcbiAgICAgICAgICAgIG9ucmVjb25uZWN0OiBlID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzWzBdLmNvbm5lY3RpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbMV0uY29ubmVjdGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnUmVjb25uZWN0aW5nIGluIHJvdW5kLi4uJywgZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdib3R0b20tcGxheWVyJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjYm90dG9tLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IGZhbHNlLCBcImljb24tb2ZmbGluZVwiOiB0cnVlfX0pKTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIG9ubWF4aW11bTogZSA9PiBjb25zb2xlLmxvZygnU3RvcCBBdHRlbXB0aW5nIScsIGUpLFxyXG4gICAgICAgICAgICBvbmNsb3NlOiBlID0+IGNvbnNvbGUubG9nKCdDbG9zZWQhJywgZSksXHJcbiAgICAgICAgICAgIG9uZXJyb3I6IGUgPT4gY29uc29sZS5sb2coJ0Vycm9yOicsIGUpLFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB0aGlzLnNvY2sgPSBuZXcgU29ja2V0dGUoXCJ3czovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzclwiLCBvcHRzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2goZXJyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBTb2NrZXR0ZShcIndzczovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzclwiLCBvcHRzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMubW9kZWwgPSBtb2RlbDtcclxuICAgICAgICB0aGlzLnZhcmlhbnQgPSBtb2RlbFtcInZhcmlhbnRcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuZnVsbGZlbiA9IG1vZGVsW1wiZmVuXCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLndwbGF5ZXIgPSBtb2RlbFtcIndwbGF5ZXJcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuYnBsYXllciA9IG1vZGVsW1wiYnBsYXllclwiXSBhcyBzdHJpbmc7XHJcbiAgICAgICAgdGhpcy5iYXNlID0gbW9kZWxbXCJiYXNlXCJdIGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLmluYyA9IG1vZGVsW1wiaW5jXCJdIGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLnN0YXR1cyA9IG1vZGVsW1wic3RhdHVzXCJdIGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLnR2ID0gbW9kZWxbXCJ0dlwiXSBhcyBzdHJpbmc7XHJcbiAgICAgICAgdGhpcy5zdGVwcyA9IFtdO1xyXG4gICAgICAgIHRoaXMucGx5ID0gMDtcclxuXHJcbiAgICAgICAgdGhpcy5mbGlwID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMuQ1NTaW5kZXhlcyA9IHZhcmlhbnRzLm1hcCgodmFyaWFudCkgPT4gbG9jYWxTdG9yYWdlW3ZhcmlhbnQgKyBcIl9waWVjZXNcIl0gPT09IHVuZGVmaW5lZCA/IDAgOiBOdW1iZXIobG9jYWxTdG9yYWdlW3ZhcmlhbnQgKyBcIl9waWVjZXNcIl0pKTtcclxuXHJcbiAgICAgICAgdGhpcy5zcGVjdGF0b3IgPSB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gIT09IHRoaXMud3BsYXllciAmJiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gIT09IHRoaXMuYnBsYXllcjtcclxuXHJcbiAgICAgICAgLy8gb3JpZW50YXRpb24gPSB0aGlzLm15Y29sb3JcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5teWNvbG9yID0gdGhpcy52YXJpYW50ID09PSAnc2hvZ2knID8gJ2JsYWNrJyA6ICd3aGl0ZSc7XHJcbiAgICAgICAgICAgIHRoaXMub3BwY29sb3IgPSB0aGlzLnZhcmlhbnQgPT09ICdzaG9naScgPyAnd2hpdGUnIDogJ2JsYWNrJztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLm15Y29sb3IgPSB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPT09IHRoaXMud3BsYXllciA/ICd3aGl0ZScgOiAnYmxhY2snO1xyXG4gICAgICAgICAgICB0aGlzLm9wcGNvbG9yID0gdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdID09PSB0aGlzLndwbGF5ZXIgPyAnYmxhY2snIDogJ3doaXRlJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMub3BwSXNSYW5kb21Nb3ZlciA9IChcclxuICAgICAgICAgICAgKHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiICYmIHRoaXMuYnBsYXllciA9PT0gXCJSYW5kb20tTW92ZXJcIikgfHxcclxuICAgICAgICAgICAgKHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiICYmIHRoaXMud3BsYXllciA9PT0gXCJSYW5kb20tTW92ZXJcIikpO1xyXG5cclxuICAgICAgICAvLyBwbGF5ZXJzWzBdIGlzIHRvcCBwbGF5ZXIsIHBsYXllcnNbMV0gaXMgYm90dG9tIHBsYXllclxyXG4gICAgICAgIHRoaXMucGxheWVycyA9IFtcclxuICAgICAgICAgICAgdGhpcy5teWNvbG9yID09PSBcIndoaXRlXCIgPyB0aGlzLmJwbGF5ZXIgOiB0aGlzLndwbGF5ZXIsXHJcbiAgICAgICAgICAgIHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiID8gdGhpcy53cGxheWVyIDogdGhpcy5icGxheWVyXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0gbnVsbDtcclxuICAgICAgICB0aGlzLnByZWRyb3AgPSBudWxsO1xyXG5cclxuICAgICAgICB0aGlzLnJlc3VsdCA9IFwiXCI7XHJcbiAgICAgICAgY29uc3QgcGFydHMgPSB0aGlzLmZ1bGxmZW4uc3BsaXQoXCIgXCIpO1xyXG4gICAgICAgIHRoaXMuYWJvcnRhYmxlID0gTnVtYmVyKHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdKSA8PSAxO1xyXG5cclxuICAgICAgICBjb25zdCBmZW5fcGxhY2VtZW50ID0gcGFydHNbMF07XHJcbiAgICAgICAgdGhpcy50dXJuQ29sb3IgPSBwYXJ0c1sxXSA9PT0gXCJ3XCIgPyBcIndoaXRlXCIgOiBcImJsYWNrXCI7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiB8fCB0aGlzLnZhcmlhbnQgPT09IFwieGlhbmdxaVwiKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0UGllY2VzKHRoaXMubXljb2xvcik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gVE9ETzpzYXZlL3Jlc3RvcmUgcHJlZmVyZW5jZXNcclxuICAgICAgICAgICAgY2hhbmdlQ1NTKCcvc3RhdGljLycgKyBWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmNzc1swXSArICcuY3NzJyk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5zdGVwcy5wdXNoKHtcclxuICAgICAgICAgICAgJ2Zlbic6IGZlbl9wbGFjZW1lbnQsXHJcbiAgICAgICAgICAgICdtb3ZlJzogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAnY2hlY2snOiBmYWxzZSxcclxuICAgICAgICAgICAgJ3R1cm5Db2xvcic6IHRoaXMudHVybkNvbG9yLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZCA9IENoZXNzZ3JvdW5kKGVsLCB7XHJcbiAgICAgICAgICAgIGZlbjogZmVuX3BsYWNlbWVudCxcclxuICAgICAgICAgICAgZ2VvbWV0cnk6IFZBUklBTlRTW3RoaXMudmFyaWFudF0uZ2VvbSxcclxuICAgICAgICAgICAgb3JpZW50YXRpb246IHRoaXMubXljb2xvcixcclxuICAgICAgICAgICAgdHVybkNvbG9yOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgYW5pbWF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgIGluc2VydChlbGVtZW50cykge3Jlc2l6ZUhhbmRsZShlbGVtZW50cyk7fVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChsb2NhbFN0b3JhZ2Uuem9vbSAhPT0gdW5kZWZpbmVkICYmIGxvY2FsU3RvcmFnZS56b29tICE9PSAxMDApIHtcclxuICAgICAgICAgICAgdGhpcy5zZXRab29tKE51bWJlcihsb2NhbFN0b3JhZ2Uuem9vbSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgIHZpZXdPbmx5OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbW92ZTogdGhpcy5vbk1vdmUoKSxcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGZyZWU6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiB0aGlzLm15Y29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgc2hvd0Rlc3RzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50czoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhZnRlcjogdGhpcy5vblVzZXJNb3ZlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhZnRlck5ld1BpZWNlOiB0aGlzLm9uVXNlckRyb3AsXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHByZW1vdmFibGU6IHtcclxuICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50czoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQ6IHRoaXMuc2V0UHJlbW92ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdW5zZXQ6IHRoaXMudW5zZXRQcmVtb3ZlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgcHJlZHJvcHBhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0OiB0aGlzLnNldFByZWRyb3AsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuc2V0OiB0aGlzLnVuc2V0UHJlZHJvcCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGV2ZW50czoge1xyXG4gICAgICAgICAgICAgICAgICAgIG1vdmU6IHRoaXMub25Nb3ZlKCksXHJcbiAgICAgICAgICAgICAgICAgICAgZHJvcE5ld1BpZWNlOiB0aGlzLm9uRHJvcCgpLFxyXG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZTogdGhpcy5vbkNoYW5nZSh0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnNlbGVjdGVkKSxcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3Q6IHRoaXMub25TZWxlY3QodGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5zZWxlY3RlZCksXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuZ2F0aW5nID0gbWFrZUdhdGluZyh0aGlzKTtcclxuICAgICAgICB0aGlzLnByb21vdGlvbiA9IG1ha2VQcm9tb3Rpb24odGhpcyk7XHJcblxyXG4gICAgICAgIC8vIGluaXRpYWxpemUgcG9ja2V0c1xyXG4gICAgICAgIGlmIChuZWVkUG9ja2V0cyh0aGlzLnZhcmlhbnQpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvY2tldDAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncG9ja2V0MCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBjb25zdCBwb2NrZXQxID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BvY2tldDEnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgdXBkYXRlUG9ja2V0cyh0aGlzLCBwb2NrZXQwLCBwb2NrZXQxKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIGluaXRpYWxpemUgY2xvY2tzXHJcbiAgICAgICAgY29uc3QgYzAgPSBuZXcgQ2xvY2sodGhpcy5iYXNlLCB0aGlzLmluYywgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Nsb2NrMCcpIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICBjb25zdCBjMSA9IG5ldyBDbG9jayh0aGlzLmJhc2UsIHRoaXMuaW5jLCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2xvY2sxJykgYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgIHRoaXMuY2xvY2tzID0gW2MwLCBjMV07XHJcbiAgICAgICAgdGhpcy5jbG9ja3NbMF0ub25UaWNrKHJlbmRlclRpbWUpO1xyXG4gICAgICAgIHRoaXMuY2xvY2tzWzFdLm9uVGljayhyZW5kZXJUaW1lKTtcclxuXHJcbiAgICAgICAgY29uc3QgZmxhZ0NhbGxiYWNrID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy50dXJuQ29sb3IgPT09IHRoaXMubXljb2xvciAmJiAhdGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc3RvcCgpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJGbGFnXCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImZsYWdcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2xvY2tzWzFdLm9uRmxhZyhmbGFnQ2FsbGJhY2spO1xyXG5cclxuICAgICAgICBpZiAoTnVtYmVyKHRoaXMuc3RhdHVzKSA8IDApIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJHQU1FIGlzIE9OR09JTkcuLi5cIik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJHQU1FIHdhcyBFTkRFRC4uLlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGFkZCBkYXJrL2xpZ2h0IHRoZW1lIGJ1dHRvbnMgKGljb24tc3VuLW8vaWNvbi1tb29uLW8pXHJcblxyXG4gICAgICAgIGNvbnN0IHRvZ2dsZVBpZWNlcyA9ICgpID0+IHtcclxuICAgICAgICAgICAgdmFyIGlkeCA9IHRoaXMuQ1NTaW5kZXhlc1t2YXJpYW50cy5pbmRleE9mKHRoaXMudmFyaWFudCldO1xyXG4gICAgICAgICAgICBpZHggKz0gMTtcclxuICAgICAgICAgICAgaWR4ID0gaWR4ICUgVkFSSUFOVFNbdGhpcy52YXJpYW50XS5jc3MubGVuZ3RoO1xyXG4gICAgICAgICAgICB0aGlzLkNTU2luZGV4ZXNbdmFyaWFudHMuaW5kZXhPZih0aGlzLnZhcmlhbnQpXSA9IGlkeFxyXG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSh0aGlzLnZhcmlhbnQgKyBcIl9waWVjZXNcIiwgU3RyaW5nKGlkeCkpO1xyXG4gICAgICAgICAgICB0aGlzLnNldFBpZWNlcyh0aGlzLm15Y29sb3IpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiIHx8IHRoaXMudmFyaWFudCA9PT0gXCJ4aWFuZ3FpXCIpIHtcclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG4tcGllY2VzJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnYnV0dG9uJywgeyBvbjogeyBjbGljazogKCkgPT4gdG9nZ2xlUGllY2VzKCkgfSwgcHJvcHM6IHt0aXRsZTogJ1RvZ2dsZSBwaWVjZXMnfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tY29nXCI6IHRydWV9IH0gKSwgXSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd6b29tJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpbnB1dCcsIHsgY2xhc3M6IHtcInNsaWRlclwiOiB0cnVlIH0sXHJcbiAgICAgICAgICAgIGF0dHJzOiB7IHdpZHRoOiAnMjgwcHgnLCB0eXBlOiAncmFuZ2UnLCB2YWx1ZTogTnVtYmVyKGxvY2FsU3RvcmFnZS56b29tKSwgbWluOiA2MCwgbWF4OiAxNDAgfSxcclxuICAgICAgICAgICAgb246IHsgaW5wdXQ6IChlKSA9PiB7IHRoaXMuc2V0Wm9vbShwYXJzZUZsb2F0KChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkpOyB9IH0gfSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvL2NvbnN0IG9uUmVzaXplID0gKCkgPT4ge2NvbnNvbGUubG9nKFwib25SZXNpemUoKVwiKTt9XHJcbiAgICAgICAgLy92YXIgZWxtbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2d3cmFwJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgLy9lbG1udC5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIG9uUmVzaXplKTtcclxuXHJcbiAgICAgICAgY29uc3QgYWJvcnQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIFRPRE86IGRpc2FibGUgd2hlbiBwbHkgPiAyXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQWJvcnRcIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJhYm9ydFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBkcmF3ID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkRyYXdcIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJkcmF3XCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc2lnbiA9ICgpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJSZXNpZ25cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJyZXNpZ25cIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH1cclxuLypcclxuICAgICAgICBjb25zdCBkaXNjb25uZWN0ID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlRlc3Rpbmcgc29ja2V0IGRpc2Nvbm5lY3QuLi5cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJkaXNjb25uZWN0XCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9XHJcbiovXHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lLWNvbnRyb2xzJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVDb250cm9scyA9IHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmJ0bi1jb250cm9scycsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2J1dHRvbiNhYm9ydCcsIHsgb246IHsgY2xpY2s6ICgpID0+IGFib3J0KCkgfSwgcHJvcHM6IHt0aXRsZTogJ0Fib3J0J30gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWFib3J0XCI6IHRydWV9IH0gKSwgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24jZHJhdycsIHsgb246IHsgY2xpY2s6ICgpID0+IGRyYXcoKSB9LCBwcm9wczoge3RpdGxlOiBcIkRyYXdcIn0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWhhbmQtcGFwZXItb1wiOiB0cnVlfSB9ICksIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uI3Jlc2lnbicsIHsgb246IHsgY2xpY2s6ICgpID0+IHJlc2lnbigpIH0sIHByb3BzOiB7dGl0bGU6IFwiUmVzaWduXCJ9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1mbGFnLW9cIjogdHJ1ZX0gfSApLCBdKSxcclxuICAgICAgICAgICAgICAgIC8vIGgoJ2J1dHRvbiNkaXNjb25uZWN0JywgeyBvbjogeyBjbGljazogKCkgPT4gZGlzY29ubmVjdCgpIH0sIHByb3BzOiB7dGl0bGU6ICdkaXNjb25uZWN0J30gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXNpZ24tb3V0XCI6IHRydWV9IH0gKSwgXSksXHJcbiAgICAgICAgICAgICAgICBdKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUNvbnRyb2xzID0gcGF0Y2goY29udGFpbmVyLCBoKCdkaXYnKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBwYXRjaChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW92ZWxpc3QnKSBhcyBIVE1MRWxlbWVudCwgbW92ZWxpc3RWaWV3KHRoaXMpKTtcclxuXHJcbiAgICAgICAgcGF0Y2goZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JvdW5kY2hhdCcpIGFzIEhUTUxFbGVtZW50LCBjaGF0Vmlldyh0aGlzLCBcInJvdW5kY2hhdFwiKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0R3JvdW5kID0gKCkgPT4gdGhpcy5jaGVzc2dyb3VuZDtcclxuICAgIGdldERlc3RzID0gKCkgPT4gdGhpcy5kZXN0cztcclxuXHJcbiAgICBwcml2YXRlIHNldFpvb20gPSAoem9vbTogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY2ctd3JhcCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGlmIChlbCkge1xyXG4gICAgICAgICAgICBjb25zdCBiYXNlV2lkdGggPSBkaW1lbnNpb25zW1ZBUklBTlRTW3RoaXMudmFyaWFudF0uZ2VvbV0ud2lkdGggKiAodGhpcy52YXJpYW50ID09PSBcInNob2dpXCIgPyA1MiA6IDY0KTtcclxuICAgICAgICAgICAgY29uc3QgYmFzZUhlaWdodCA9IGRpbWVuc2lvbnNbVkFSSUFOVFNbdGhpcy52YXJpYW50XS5nZW9tXS5oZWlnaHQgKiAodGhpcy52YXJpYW50ID09PSBcInNob2dpXCIgPyA2MCA6IDY0KTtcclxuICAgICAgICAgICAgY29uc3QgcHh3ID0gYCR7em9vbSAvIDEwMCAqIGJhc2VXaWR0aH1weGA7XHJcbiAgICAgICAgICAgIGNvbnN0IHB4aCA9IGAke3pvb20gLyAxMDAgKiBiYXNlSGVpZ2h0fXB4YDtcclxuICAgICAgICAgICAgZWwuc3R5bGUud2lkdGggPSBweHc7XHJcbiAgICAgICAgICAgIGVsLnN0eWxlLmhlaWdodCA9IHB4aDtcclxuXHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuc2V0QXR0cmlidXRlKCdzdHlsZScsICctLWNnd3JhcHdpZHRoOicgKyBweHcpO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnNldEF0dHJpYnV0ZSgnc3R5bGUnLCAnLS1jZ3dyYXBoZWlnaHQ6JyArIHB4aCk7XHJcblxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGVzc2dyb3VuZC5yZXNpemUnKSk7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiem9vbVwiLCBTdHJpbmcoem9vbSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnR2FtZVN0YXJ0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ290IGdhbWVTdGFydCBtc2c6XCIsIG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy5nYW1lSWQgIT09IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pIHJldHVybjtcclxuICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSBzb3VuZC5nZW5lcmljTm90aWZ5KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ05ld0dhbWUgPSAobXNnKSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJHYW1lQ29udHJvbGxlci5vbk1zZ05ld0dhbWUoKVwiLCB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKVxyXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5hc3NpZ24odGhpcy5tb2RlbFtcImhvbWVcIl0gKyAnLycgKyBtc2dbXCJnYW1lSWRcIl0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVtYXRjaCA9ICgpID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIlJFTUFUQ0hcIik7XHJcbiAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcInJlbWF0Y2hcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIC8vIHdpbmRvdy5sb2NhdGlvbi5hc3NpZ24oaG9tZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBuZXdPcHBvbmVudCA9IChob21lKSA9PiB7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbihob21lKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVPdmVyID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZUNvbnRyb2xzID0gcGF0Y2godGhpcy5nYW1lQ29udHJvbHMsIGgoJ2RpdicpKTtcclxuXHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZnRlci1nYW1lJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKHRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmFmdGVyLWdhbWUnLCBbaCgncmVzdWx0JywgdGhpcy5yZXN1bHQpXSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmFmdGVyLWdhbWUnLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdyZXN1bHQnLCB0aGlzLnJlc3VsdCksXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24ucmVtYXRjaCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHRoaXMucmVtYXRjaCgpIH0gfSwgXCJSRU1BVENIXCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uLm5ld29wcCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHRoaXMubmV3T3Bwb25lbnQodGhpcy5tb2RlbFtcImhvbWVcIl0pIH0gfSwgXCJORVcgT1BQT05FTlRcIiksXHJcbiAgICAgICAgICAgIF0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjaGVja1N0YXR1cyA9IChtc2cpID0+IHtcclxuICAgICAgICBpZiAobXNnLmdhbWVJZCAhPT0gdGhpcy5tb2RlbFtcImdhbWVJZFwiXSkgcmV0dXJuO1xyXG4gICAgICAgIGlmIChtc2cuc3RhdHVzID49IDAgJiYgdGhpcy5yZXN1bHQgPT09IFwiXCIpIHtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMF0ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1sxXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmVzdWx0ID0gbXNnLnJlc3VsdDtcclxuICAgICAgICAgICAgc3dpdGNoIChtc2cucmVzdWx0KSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiMS8yLTEvMlwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHNvdW5kLmRyYXcoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCIxLTBcIjpcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm15Y29sb3IgPT09IFwid2hpdGVcIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291bmQudmljdG9yeSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291bmQuZGVmZWF0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiMC0xXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5teWNvbG9yID09PSBcImJsYWNrXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdW5kLnZpY3RvcnkoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdW5kLmRlZmVhdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgLy8gQUJPUlRFRFxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyKCk7XHJcblxyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3VuZGVyLWJvYXJkJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgndW5kZXItYm9hcmQnLCBbaCgndGV4dGFyZWEnLCB7IGF0dHJzOiB7IHJvd3M6IDEzfSB9LCBtc2cucGduKV0pKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnR2KSB7XHJcbiAgICAgICAgICAgICAgICBzZXRJbnRlcnZhbCgoKSA9PiB7dGhpcy5kb1NlbmQoeyB0eXBlOiBcInVwZGF0ZVRWXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTt9LCAyMDAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXBkYXRlVFYgPSAobXNnKSA9PiB7XHJcbiAgICAgICAgaWYgKG1zZy5nYW1lSWQgIT09IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pIHtcclxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbih0aGlzLm1vZGVsW1wiaG9tZVwiXSArICcvdHYnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRQaWVjZXMgPSAoY29sb3IpID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInNldFBpZWNlcygpXCIsIHRoaXMudmFyaWFudCwgY29sb3IpXHJcbiAgICAgICAgY29uc3QgaWR4ID0gdGhpcy5DU1NpbmRleGVzW3ZhcmlhbnRzLmluZGV4T2YodGhpcy52YXJpYW50KV07XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnZhcmlhbnQpIHtcclxuICAgICAgICBjYXNlIFwieGlhbmdxaVwiOlxyXG4gICAgICAgICAgICBjaGFuZ2VDU1MoJy9zdGF0aWMvJyArIFZBUklBTlRTW3RoaXMudmFyaWFudF0uY3NzW2lkeF0gKyAnLmNzcycpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwic2hvZ2lcIjpcclxuICAgICAgICAgICAgdmFyIGNzcyA9IFZBUklBTlRTW3RoaXMudmFyaWFudF0uY3NzW2lkeF07XHJcbiAgICAgICAgICAgIC8vIGNoYW5nZSBzaG9naSBwaWVjZSBjb2xvcnMgYWNjb3JkaW5nIHRvIGJvYXJkIG9yaWVudGF0aW9uXHJcbiAgICAgICAgICAgIGlmIChjb2xvciA9PT0gXCJibGFja1wiKSBjc3MgPSBjc3MucmVwbGFjZSgnMCcsICcxJyk7XHJcbiAgICAgICAgICAgIGNoYW5nZUNTUygnL3N0YXRpYy8nICsgY3NzICsgJy5jc3MnKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEluIENhcGFibGFuY2Egd2UgaGF2ZSB0byBmaW5lbGl6ZSBjYXN0bGluZyBiZWNhdXNlXHJcbiAgICAvLyBjaGVzc2dyb3VuZCBhdXRvQ2FzdGxlIHdvcmtzIGZvciBzdGFuZGFyZCBjaGVzcyBvbmx5XHJcbiAgICBwcml2YXRlIGNhc3RsZVJvb2sgPSAoa2luZ0Rlc3QsIGNvbG9yKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZGlmZjogUGllY2VzRGlmZiA9IHt9O1xyXG4gICAgICAgIGlmIChraW5nRGVzdCA9PT0gXCJjXCIpIHtcclxuICAgICAgICAgICAgZGlmZltjb2xvciA9PT0gJ3doaXRlJyA/IFwiYTFcIiA6IFwiYThcIl0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGRpZmZbY29sb3IgPT09ICd3aGl0ZScgPyBcImQxXCIgOiBcImQ4XCJdID0ge2NvbG9yOiBjb2xvciwgcm9sZTogXCJyb29rXCJ9O1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldFBpZWNlcyhkaWZmKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGlmIChraW5nRGVzdCA9PT0gXCJpXCIpIHtcclxuICAgICAgICAgICAgZGlmZltjb2xvciA9PT0gJ3doaXRlJyA/IFwiajFcIiA6IFwiajhcIl0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGRpZmZbY29sb3IgPT09ICd3aGl0ZScgPyBcImgxXCIgOiBcImg4XCJdID0ge2NvbG9yOiBjb2xvciwgcm9sZTogXCJyb29rXCJ9O1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldFBpZWNlcyhkaWZmKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dCb2FyZCA9IChtc2cpID0+IHtcclxuICAgICAgICBpZiAobXNnLmdhbWVJZCAhPT0gdGhpcy5tb2RlbFtcImdhbWVJZFwiXSkgcmV0dXJuO1xyXG4gICAgICAgIC8vIEdhbWUgYWJvcnRlZC5cclxuICAgICAgICBpZiAobXNnW1wic3RhdHVzXCJdID09PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ290IGJvYXJkIG1zZzpcIiwgbXNnKTtcclxuICAgICAgICB0aGlzLnBseSA9IG1zZy5wbHlcclxuICAgICAgICB0aGlzLmZ1bGxmZW4gPSBtc2cuZmVuO1xyXG4gICAgICAgIHRoaXMuZGVzdHMgPSBtc2cuZGVzdHM7XHJcbiAgICAgICAgY29uc3QgY2xvY2tzID0gbXNnLmNsb2NrcztcclxuXHJcbiAgICAgICAgY29uc3QgcGFydHMgPSBtc2cuZmVuLnNwbGl0KFwiIFwiKTtcclxuICAgICAgICB0aGlzLnR1cm5Db2xvciA9IHBhcnRzWzFdID09PSBcIndcIiA/IFwid2hpdGVcIiA6IFwiYmxhY2tcIjtcclxuXHJcbiAgICAgICAgaWYgKG1zZy5zdGVwcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RlcHMgPSBbXTtcclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb3ZlbGlzdCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2RpdiNtb3ZlbGlzdCcpKTtcclxuXHJcbiAgICAgICAgICAgIG1zZy5zdGVwcy5mb3JFYWNoKChzdGVwKSA9PiB7IFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGVwcy5wdXNoKHN0ZXApO1xyXG4gICAgICAgICAgICAgICAgdXBkYXRlTW92ZWxpc3QodGhpcyk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAobXNnLnBseSA9PT0gdGhpcy5zdGVwcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHN0ZXAgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgJ2Zlbic6IG1zZy5mZW4sXHJcbiAgICAgICAgICAgICAgICAgICAgJ21vdmUnOiBtc2cubGFzdE1vdmVbMF0gKyBtc2cubGFzdE1vdmVbMV0sXHJcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrJzogbXNnLmNoZWNrLFxyXG4gICAgICAgICAgICAgICAgICAgICd0dXJuQ29sb3InOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgICAgICAgICAnc2FuJzogbXNnLnN0ZXBzWzBdLnNhbixcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGVwcy5wdXNoKHN0ZXApO1xyXG4gICAgICAgICAgICAgICAgdXBkYXRlTW92ZWxpc3QodGhpcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYWJvcnRhYmxlID0gTnVtYmVyKHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdKSA8PSAxO1xyXG4gICAgICAgIGlmICghdGhpcy5zcGVjdGF0b3IgJiYgIXRoaXMuYWJvcnRhYmxlICYmIHRoaXMucmVzdWx0ID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWJvcnQnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdidXR0b24jYWJvcnQnLCB7IHByb3BzOiB7ZGlzYWJsZWQ6IHRydWV9IH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBsYXN0TW92ZSA9IG1zZy5sYXN0TW92ZTtcclxuICAgICAgICBpZiAobGFzdE1vdmUgIT09IG51bGwgJiYgdGhpcy52YXJpYW50ID09PSBcInNob2dpXCIpIHtcclxuICAgICAgICAgICAgbGFzdE1vdmUgPSB1c2kydWNpKGxhc3RNb3ZlWzBdICsgbGFzdE1vdmVbMV0pO1xyXG4gICAgICAgICAgICBsYXN0TW92ZSA9IFtsYXN0TW92ZS5zbGljZSgwLDIpLCBsYXN0TW92ZS5zbGljZSgyLDQpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gZHJvcCBsYXN0TW92ZSBjYXVzaW5nIHNjcm9sbGJhciBmbGlja2VyLFxyXG4gICAgICAgIC8vIHNvIHdlIHJlbW92ZSBmcm9tIHBhcnQgdG8gYXZvaWQgdGhhdFxyXG4gICAgICAgIGlmIChsYXN0TW92ZSAhPT0gbnVsbCAmJiBsYXN0TW92ZVswXVsxXSA9PT0gJ0AnKSBsYXN0TW92ZSA9IFtsYXN0TW92ZVsxXV07XHJcbiAgICAgICAgLy8gc2F2ZSBjYXB0dXJlIHN0YXRlIGJlZm9yZSB1cGRhdGluZyBjaGVzc2dyb3VuZFxyXG4gICAgICAgIGNvbnN0IGNhcHR1cmUgPSBsYXN0TW92ZSAhPT0gbnVsbCAmJiB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnBpZWNlc1tsYXN0TW92ZVsxXV1cclxuXHJcbiAgICAgICAgaWYgKGxhc3RNb3ZlICE9PSBudWxsICYmICh0aGlzLnR1cm5Db2xvciA9PT0gdGhpcy5teWNvbG9yIHx8IHRoaXMuc3BlY3RhdG9yKSkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcInNob2dpXCIpIHtcclxuICAgICAgICAgICAgICAgIHNvdW5kLnNob2dpbW92ZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaWYgKGNhcHR1cmUpIHtcclxuICAgICAgICAgICAgICAgICAgICBzb3VuZC5jYXB0dXJlKCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHNvdW5kLm1vdmUoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGxhc3RNb3ZlID0gW107XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2hlY2tTdGF0dXMobXNnKTtcclxuICAgICAgICBpZiAobXNnLmNoZWNrKSB7XHJcbiAgICAgICAgICAgIHNvdW5kLmNoZWNrKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvcHBjbG9jayA9ICF0aGlzLmZsaXAgPyAwIDogMTtcclxuICAgICAgICBjb25zdCBteWNsb2NrID0gMSAtIG9wcGNsb2NrO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgZmVuOiBwYXJ0c1swXSxcclxuICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgICAgICBjaGVjazogbXNnLmNoZWNrLFxyXG4gICAgICAgICAgICAgICAgbGFzdE1vdmU6IGxhc3RNb3ZlLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdXBkYXRlUG9ja2V0cyh0aGlzLCB0aGlzLnZwb2NrZXQwLCB0aGlzLnZwb2NrZXQxKTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMF0ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1sxXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zZXRUaW1lKGNsb2Nrc1t0aGlzLm9wcGNvbG9yXSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnNldFRpbWUoY2xvY2tzW3RoaXMubXljb2xvcl0pO1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlICYmIG1zZy5zdGF0dXMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50dXJuQ29sb3IgPT09IHRoaXMubXljb2xvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnN0YXJ0KCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zdGFydCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMudHVybkNvbG9yID09PSB0aGlzLm15Y29sb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgICAgICBmZW46IHBhcnRzWzBdLFxyXG4gICAgICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmcmVlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IHRoaXMubXljb2xvcixcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzdHM6IG1zZy5kZXN0cyxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrOiBtc2cuY2hlY2ssXHJcbiAgICAgICAgICAgICAgICAgICAgbGFzdE1vdmU6IGxhc3RNb3ZlLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB1cGRhdGVQb2NrZXRzKHRoaXMsIHRoaXMudnBvY2tldDAsIHRoaXMudnBvY2tldDEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zZXRUaW1lKGNsb2Nrc1t0aGlzLm9wcGNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlICYmIG1zZy5zdGF0dXMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10uc3RhcnQoY2xvY2tzW3RoaXMubXljb2xvcl0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdNWSBDTE9DSyBTVEFSVEVEJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcInRyeWluZyB0byBwbGF5IHByZW1vdmUuLi4uXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlbW92ZSkgdGhpcy5wZXJmb3JtUHJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlZHJvcCkgdGhpcy5wZXJmb3JtUHJlZHJvcCgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXN0czogbXNnLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgY2hlY2s6IG1zZy5jaGVjayxcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10uc2V0VGltZShjbG9ja3NbdGhpcy5teWNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlICYmIG1zZy5zdGF0dXMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnN0YXJ0KGNsb2Nrc1t0aGlzLm9wcGNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ09QUCBDTE9DSyAgU1RBUlRFRCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub3BwSXNSYW5kb21Nb3ZlciAmJiBtc2cucm0gICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcIm1vdmVcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdLCBtb3ZlOiBtc2cucm0sIGNsb2NrczogY2xvY2tzIH0pO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGdvUGx5ID0gKHBseSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHN0ZXAgPSB0aGlzLnN0ZXBzW3BseV07XHJcbiAgICAgICAgLy8gVE9ETzogdXBkYXRlIHBvY2tldHMgISEhXHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICBmZW46IHN0ZXAuZmVuLFxyXG4gICAgICAgICAgICB0dXJuQ29sb3I6IHN0ZXAudHVybkNvbG9yLFxyXG4gICAgICAgICAgICBtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICBmcmVlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIGNvbG9yOiB0aGlzLnNwZWN0YXRvciA/IHVuZGVmaW5lZCA6IHN0ZXAudHVybkNvbG9yLFxyXG4gICAgICAgICAgICAgICAgZGVzdHM6IHRoaXMucmVzdWx0ID09PSBcIlwiICYmIHBseSA9PT0gdGhpcy5zdGVwcy5sZW5ndGggLSAxID8gdGhpcy5kZXN0cyA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGNoZWNrOiBzdGVwLmNoZWNrLFxyXG4gICAgICAgICAgICBsYXN0TW92ZTogc3RlcC5tb3ZlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBbc3RlcC5tb3ZlLnNsaWNlKDAsIDIpLCBzdGVwLm1vdmUuc2xpY2UoMiwgNCldLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZnVsbGZlbiA9IHN0ZXAuZmVuO1xyXG4gICAgICAgIHVwZGF0ZVBvY2tldHModGhpcywgdGhpcy52cG9ja2V0MCwgdGhpcy52cG9ja2V0MSk7XHJcbiAgICAgICAgLy8gVE9ETzogcGxheSBzb3VuZCBpZiBwbHkgPT0gdGhpcy5wbHkgKyAxXHJcbiAgICAgICAgdGhpcy5wbHkgPSBwbHlcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRvU2VuZCA9IChtZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCItLS0+IGRvU2VuZCgpOlwiLCBtZXNzYWdlKTtcclxuICAgICAgICB0aGlzLnNvY2suc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZW5kTW92ZSA9IChvcmlnLCBkZXN0LCBwcm9tbykgPT4ge1xyXG4gICAgICAgIC8vIHBhdXNlKCkgd2lsbCBhZGQgaW5jcmVtZW50IVxyXG4gICAgICAgIGNvbnN0IG9wcGNsb2NrID0gIXRoaXMuZmxpcCA/IDAgOiAxXHJcbiAgICAgICAgY29uc3QgbXljbG9jayA9IDEgLSBvcHBjbG9jaztcclxuICAgICAgICBjb25zdCBtb3ZldGltZSA9ICh0aGlzLmNsb2Nrc1tteWNsb2NrXS5ydW5uaW5nKSA/IERhdGUubm93KCkgLSB0aGlzLmNsb2Nrc1tteWNsb2NrXS5zdGFydFRpbWUgOiAwO1xyXG4gICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnBhdXNlKHRydWUpO1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwic2VuZE1vdmUob3JpZywgZGVzdCwgcHJvbSlcIiwgb3JpZywgZGVzdCwgcHJvbW8pO1xyXG4gICAgICAgIGNvbnN0IHVjaV9tb3ZlID0gb3JpZyArIGRlc3QgKyBwcm9tbztcclxuICAgICAgICBjb25zdCBtb3ZlID0gdGhpcy52YXJpYW50ID09PSBcInNob2dpXCIgPyB1Y2kydXNpKHVjaV9tb3ZlKSA6IHVjaV9tb3ZlO1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwic2VuZE1vdmUobW92ZSlcIiwgbW92ZSk7XHJcbiAgICAgICAgLy8gVE9ETzogaWYgcHJlbW92ZWQsIHNlbmQgMCB0aW1lXHJcbiAgICAgICAgbGV0IGJjbG9jaywgY2xvY2tzO1xyXG4gICAgICAgIGlmICghdGhpcy5mbGlwKSB7XHJcbiAgICAgICAgICAgIGJjbG9jayA9IHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiID8gMSA6IDA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYmNsb2NrID0gdGhpcy5teWNvbG9yID09PSBcImJsYWNrXCIgPyAwIDogMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3Qgd2Nsb2NrID0gMSAtIGJjbG9ja1xyXG4gICAgICAgIGNsb2NrcyA9IHttb3ZldGltZTogbW92ZXRpbWUsIGJsYWNrOiB0aGlzLmNsb2Nrc1tiY2xvY2tdLmR1cmF0aW9uLCB3aGl0ZTogdGhpcy5jbG9ja3Nbd2Nsb2NrXS5kdXJhdGlvbn07XHJcbiAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcIm1vdmVcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdLCBtb3ZlOiBtb3ZlLCBjbG9ja3M6IGNsb2NrcyB9KTtcclxuICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlKSB0aGlzLmNsb2Nrc1tvcHBjbG9ja10uc3RhcnQoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW92ZSA9ICgpID0+IHtcclxuICAgICAgICByZXR1cm4gKG9yaWcsIGRlc3QsIGNhcHR1cmVkUGllY2UpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCIgICBncm91bmQub25Nb3ZlKClcIiwgb3JpZywgZGVzdCwgY2FwdHVyZWRQaWVjZSk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikge1xyXG4gICAgICAgICAgICAgICAgc291bmQuc2hvZ2ltb3ZlKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY2FwdHVyZWRQaWVjZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNvdW5kLmNhcHR1cmUoKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Ecm9wID0gKCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAocGllY2UsIGRlc3QpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJncm91bmQub25Ecm9wKClcIiwgcGllY2UsIGRlc3QpO1xyXG4gICAgICAgICAgICBpZiAoZGVzdCAhPSBcImEwXCIgJiYgcGllY2Uucm9sZSAmJiBkcm9wSXNWYWxpZCh0aGlzLmRlc3RzLCBwaWVjZS5yb2xlLCBkZXN0KSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc291bmQuc2hvZ2ltb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHNvdW5kLm1vdmUoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xpY2tEcm9wID0gcGllY2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRQcmVtb3ZlID0gKG9yaWcsIGRlc3QsIG1ldGEpID0+IHtcclxuICAgICAgICB0aGlzLnByZW1vdmUgPSB7IG9yaWcsIGRlc3QsIG1ldGEgfTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInNldFByZW1vdmUoKSB0bzpcIiwgb3JpZywgZGVzdCwgbWV0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1bnNldFByZW1vdmUgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldFByZWRyb3AgPSAocm9sZSwga2V5KSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0geyByb2xlLCBrZXkgfTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInNldFByZWRyb3AoKSB0bzpcIiwgcm9sZSwga2V5KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVuc2V0UHJlZHJvcCA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLnByZWRyb3AgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGVyZm9ybVByZW1vdmUgPSAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgeyBvcmlnLCBkZXN0LCBtZXRhIH0gPSB0aGlzLnByZW1vdmU7XHJcbiAgICAgICAgLy8gVE9ETzogcHJvbW90aW9uP1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwicGVyZm9ybVByZW1vdmUoKVwiLCBvcmlnLCBkZXN0LCBtZXRhKTtcclxuICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnBsYXlQcmVtb3ZlKCk7XHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBlcmZvcm1QcmVkcm9wID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHsgcm9sZSwga2V5IH0gPSB0aGlzLnByZWRyb3A7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJwZXJmb3JtUHJlZHJvcCgpXCIsIHJvbGUsIGtleSk7XHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5wbGF5UHJlZHJvcChkcm9wID0+IHsgcmV0dXJuIGRyb3BJc1ZhbGlkKHRoaXMuZGVzdHMsIGRyb3Aucm9sZSwgZHJvcC5rZXkpOyB9KTtcclxuICAgICAgICB0aGlzLnByZWRyb3AgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Vc2VyTW92ZSA9IChvcmlnLCBkZXN0LCBtZXRhKSA9PiB7XHJcbiAgICAgICAgLy8gY2hlc3Nncm91bmQgZG9lc24ndCBrbm93cyBhYm91dCBlcCwgc28gd2UgaGF2ZSB0byByZW1vdmUgZXAgY2FwdHVyZWQgcGF3blxyXG4gICAgICAgIGNvbnN0IHBpZWNlcyA9IHRoaXMuY2hlc3Nncm91bmQuc3RhdGUucGllY2VzO1xyXG4gICAgICAgIGNvbnN0IGdlb20gPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLmdlb21ldHJ5O1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiZ3JvdW5kLm9uVXNlck1vdmUoKVwiLCBvcmlnLCBkZXN0LCBtZXRhLCBwaWVjZXMpO1xyXG4gICAgICAgIGNvbnN0IG1vdmVkID0gcGllY2VzW2Rlc3RdIGFzIFBpZWNlO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IHRoaXMuY2hlc3Nncm91bmQuc3RhdGUuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xyXG4gICAgICAgIGlmIChtZXRhLmNhcHR1cmVkID09PSB1bmRlZmluZWQgJiYgbW92ZWQucm9sZSA9PT0gXCJwYXduXCIgJiYgb3JpZ1swXSAhPSBkZXN0WzBdICYmIGhhc0VwKHRoaXMudmFyaWFudCkpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9zID0ga2V5MnBvcyhkZXN0LCBmaXJzdFJhbmtJczApLFxyXG4gICAgICAgICAgICBwYXduUG9zOiBQb3MgPSBbcG9zWzBdLCBwb3NbMV0gKyAodGhpcy5teWNvbG9yID09PSAnd2hpdGUnID8gLTEgOiAxKV07XHJcbiAgICAgICAgICAgIGNvbnN0IGRpZmY6IFBpZWNlc0RpZmYgPSB7fTtcclxuICAgICAgICAgICAgZGlmZltwb3Mya2V5KHBhd25Qb3MsIGdlb20pXSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXRQaWVjZXMoZGlmZik7XHJcbiAgICAgICAgICAgIG1ldGEuY2FwdHVyZWQgPSB7cm9sZTogXCJwYXduXCJ9O1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgLy8gaW5jcmVhc2UgcG9ja2V0IGNvdW50XHJcbiAgICAgICAgaWYgKCh0aGlzLnZhcmlhbnQgPT09IFwiY3Jhenlob3VzZVwiIHx8IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiKSAmJiBtZXRhLmNhcHR1cmVkKSB7XHJcbiAgICAgICAgICAgIHZhciByb2xlID0gbWV0YS5jYXB0dXJlZC5yb2xlXHJcbiAgICAgICAgICAgIGlmIChtZXRhLmNhcHR1cmVkLnByb21vdGVkKSByb2xlID0gdGhpcy52YXJpYW50ID09PSBcInNob2dpXCIgPyBtZXRhLmNhcHR1cmVkLnJvbGUuc2xpY2UoMSkgYXMgUm9sZSA6IFwicGF3blwiO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wb2NrZXRzWzBdW3JvbGVdKys7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQwID0gcGF0Y2godGhpcy52cG9ja2V0MCwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLm15Y29sb3IsIFwidG9wXCIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1sxXVtyb2xlXSsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MSA9IHBhdGNoKHRoaXMudnBvY2tldDEsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcImJvdHRvbVwiKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vIGNoZXNzZ3JvdW5kIGF1dG9DYXN0bGUgd29ya3MgZm9yIHN0YW5kYXJkIGNoZXNzIG9ubHlcclxuICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcImNhcGFibGFuY2FcIiAmJiBtb3ZlZC5yb2xlID09PSBcImtpbmdcIiAmJiBvcmlnWzBdID09PSBcImZcIikgdGhpcy5jYXN0bGVSb29rKGRlc3RbMF0sIHRoaXMubXljb2xvcik7XHJcblxyXG4gICAgICAgIC8vICBnYXRpbmcgZWxlcGhhbnQvaGF3a1xyXG4gICAgICAgIGlmICh0aGlzLnZhcmlhbnQgPT09IFwic2VpcmF3YW5cIikge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMucHJvbW90aW9uLnN0YXJ0KG9yaWcsIGRlc3QsIG1ldGEpICYmICF0aGlzLmdhdGluZy5zdGFydCh0aGlzLmZ1bGxmZW4sIG9yaWcsIGRlc3QsIG1ldGEpKSB0aGlzLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICcnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMucHJvbW90aW9uLnN0YXJ0KG9yaWcsIGRlc3QsIG1ldGEpKSB0aGlzLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICcnKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Vc2VyRHJvcCA9IChyb2xlLCBkZXN0KSA9PiB7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJncm91bmQub25Vc2VyRHJvcCgpXCIsIHJvbGUsIGRlc3QpO1xyXG4gICAgICAgIC8vIGRlY3JlYXNlIHBvY2tldCBjb3VudFxyXG4gICAgICAgIGlmIChkcm9wSXNWYWxpZCh0aGlzLmRlc3RzLCByb2xlLCBkZXN0KSkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5mbGlwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBvY2tldHNbMF1bcm9sZV0tLTtcclxuICAgICAgICAgICAgICAgIHRoaXMudnBvY2tldDAgPSBwYXRjaCh0aGlzLnZwb2NrZXQwLCBwb2NrZXRWaWV3KHRoaXMsIHRoaXMubXljb2xvciwgXCJ0b3BcIikpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wb2NrZXRzWzFdW3JvbGVdLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQxID0gcGF0Y2godGhpcy52cG9ja2V0MSwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLm15Y29sb3IsIFwiYm90dG9tXCIpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnNlbmRNb3ZlKHJvbGVUb1Nhbltyb2xlXSArIFwiQFwiLCBkZXN0LCAnJylcclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJzZW50IG1vdmVcIiwgbW92ZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCIhISEgaW52YWxpZCBtb3ZlICEhIVwiLCByb2xlLCBkZXN0KTtcclxuICAgICAgICAgICAgLy8gcmVzdG9yZSBib2FyZFxyXG4gICAgICAgICAgICB0aGlzLmNsaWNrRHJvcCA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgZmVuOiB0aGlzLmZ1bGxmZW4sXHJcbiAgICAgICAgICAgICAgICBsYXN0TW92ZTogdGhpcy5sYXN0bW92ZSxcclxuICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGRlc3RzOiB0aGlzLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIC8vIE9yIGltcGxlbWVudCBvbmRibGNsaWNrIGhhbmRsZXIgdG8gZW1pdCBtb3ZlIGluIGNoZXNzZ3JvdW5kP1xyXG4gICAgLy8gaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9qc3JlZi9ldmVudF9vbmRibGNsaWNrLmFzcFxyXG4gICAgcHJpdmF0ZSBvbkNoYW5nZSA9IChzZWxlY3RlZCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uQ2hhbmdlKClcIiwgc2VsZWN0ZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIHByaXZhdGUgb25TZWxlY3QgPSAoc2VsZWN0ZWQpID0+IHtcclxuICAgICAgICByZXR1cm4gKGtleSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIiAgIGdyb3VuZC5vblNlbGVjdCgpXCIsIGtleSwgc2VsZWN0ZWQsIHRoaXMuY2xpY2tEcm9wLCB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlKTtcclxuICAgICAgICAgICAgLy8gSWYgZHJvcCBzZWxlY3Rpb24gd2FzIHNldCBkcm9wRGVzdHMgd2UgaGF2ZSB0byByZXN0b3JlIGRlc3RzIGhlcmVcclxuICAgICAgICAgICAgaWYgKHRoaXMuY2hlc3Nncm91bmQuc3RhdGUubW92YWJsZS5kZXN0cyA9PT0gdW5kZWZpbmVkKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChrZXkgIT0gXCJhMFwiICYmIFwiYTBcIiBpbiB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLm1vdmFibGUuZGVzdHMpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNsaWNrRHJvcCAhPT0gdW5kZWZpbmVkICYmIGRyb3BJc1ZhbGlkKHRoaXMuZGVzdHMsIHRoaXMuY2xpY2tEcm9wLnJvbGUsIGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLm5ld1BpZWNlKHRoaXMuY2xpY2tEcm9wLCBrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25Vc2VyRHJvcCh0aGlzLmNsaWNrRHJvcC5yb2xlLCBrZXkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jbGlja0Ryb3AgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7IG1vdmFibGU6IHsgZGVzdHM6IHRoaXMuZGVzdHMgfX0pO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImlzX3VzZXJfb25saW5lXCIsIHVzZXJuYW1lOiB0aGlzLndwbGF5ZXIgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJpc191c2VyX29ubGluZVwiLCB1c2VybmFtZTogdGhpcy5icGxheWVyIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gd2Ugd2FudCB0byBrbm93IGxhc3RNb3ZlIGFuZCBjaGVjayBzdGF0dXNcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImJvYXJkXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zdCBvcHBfbmFtZSA9IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSA9PT0gdGhpcy53cGxheWVyID8gdGhpcy5icGxheWVyIDogdGhpcy53cGxheWVyO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiaXNfdXNlcl9vbmxpbmVcIiwgdXNlcm5hbWU6IG9wcF9uYW1lIH0pO1xyXG5cclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdib3R0b20tcGxheWVyJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaS1zaWRlLm9ubGluZSNib3R0b20tcGxheWVyJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1vbmxpbmVcIjogdHJ1ZSwgXCJpY29uLW9mZmxpbmVcIjogZmFsc2V9fSkpO1xyXG5cclxuICAgICAgICAgICAgLy8gcHJldmVudCBzZW5kaW5nIGdhbWVTdGFydCBtZXNzYWdlIHdoZW4gdXNlciBqdXN0IHJlY29uZWN0aW5nXHJcbiAgICAgICAgICAgIGlmIChtc2cucGx5ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwicmVhZHlcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJib2FyZFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyT25saW5lID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy51c2VybmFtZSA9PT0gdGhpcy5wbGF5ZXJzWzBdKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9wLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IHRydWUsIFwiaWNvbi1vZmZsaW5lXCI6IGZhbHNlfX0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiB0cnVlLCBcImljb24tb2ZmbGluZVwiOiBmYWxzZX19KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyRGlzY29ubmVjdGVkID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy51c2VybmFtZSA9PT0gdGhpcy5wbGF5ZXJzWzBdKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9wLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IGZhbHNlLCBcImljb24tb2ZmbGluZVwiOiB0cnVlfX0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiBmYWxzZSwgXCJpY29uLW9mZmxpbmVcIjogdHJ1ZX19KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dDaGF0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKG1zZy51c2VyLCBtc2cubWVzc2FnZSwgXCJyb3VuZGNoYXRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ09mZmVyID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKFwiXCIsIG1zZy5tZXNzYWdlLCBcInJvdW5kY2hhdFwiKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBvbk1lc3NhZ2UgPSAoZXZ0KSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCI8KysrIG9uTWVzc2FnZSgpOlwiLCBldnQuZGF0YSk7XHJcbiAgICAgICAgdmFyIG1zZyA9IEpTT04ucGFyc2UoZXZ0LmRhdGEpO1xyXG4gICAgICAgIHN3aXRjaCAobXNnLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImJvYXJkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQm9hcmQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZ2FtZUVuZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja1N0YXR1cyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnYW1lU3RhcnRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dHYW1lU3RhcnQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZ2FtZV91c2VyX2Nvbm5lY3RlZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1VzZXJDb25uZWN0ZWQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwidXNlcl9vbmxpbmVcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dVc2VyT25saW5lKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInVzZXJfZGlzY29ubmVjdGVkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXNlckRpc2Nvbm5lY3RlZChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyb3VuZGNoYXRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dDaGF0KG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcIm5ld19nYW1lXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnTmV3R2FtZShtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJvZmZlclwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ09mZmVyKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInVwZGF0ZVRWXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXBkYXRlVFYobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcbiIsImltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xyXG5pbXBvcnQgdG9WTm9kZSBmcm9tICdzbmFiYmRvbS90b3Zub2RlJztcclxuXHJcbmltcG9ydCB7IGtleTJwb3MgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcblxyXG5pbXBvcnQgeyBjYW5HYXRlLCByb2xlVG9TYW4gfSBmcm9tICcuL2NoZXNzJztcclxuaW1wb3J0IHsgcG9ja2V0VmlldyB9IGZyb20gJy4vcG9ja2V0JztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oY3RybCkge1xyXG5cclxuICAgIGxldCBnYXRpbmc6IGFueSA9IGZhbHNlO1xyXG4gICAgdmFyIHJvbGVzID0gW1wiaGF3a1wiLCBcImVsZXBoYW50XCIsIFwiXCJdO1xyXG5cclxuICAgIGZ1bmN0aW9uIHN0YXJ0KGZlbiwgb3JpZywgZGVzdCwgbWV0YSkge1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZCA9IGN0cmwuZ2V0R3JvdW5kKCk7XHJcbiAgICAgICAgY29uc3QgZ2F0YWJsZSA9IGNhbkdhdGUoZmVuLCBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLCBvcmlnLCBkZXN0LCBtZXRhKVxyXG4gICAgICAgIGlmIChnYXRhYmxlWzBdIHx8IGdhdGFibGVbMV0pIHtcclxuICAgICAgICAgICAgY29uc3QgY29sb3IgPSBjdHJsLm15Y29sb3I7XHJcbiAgICAgICAgICAgIGNvbnN0IG9yaWVudGF0aW9uID0gZ3JvdW5kLnN0YXRlLm9yaWVudGF0aW9uO1xyXG4gICAgICAgICAgICBpZiAocm9sZXMuaW5kZXhPZihcImhhd2tcIikgIT09IC0xICYmICFnYXRhYmxlWzBdKSByb2xlcy5zcGxpY2Uocm9sZXMuaW5kZXhPZihcImhhd2tcIiksIDEpO1xyXG4gICAgICAgICAgICBpZiAocm9sZXMuaW5kZXhPZihcImVsZXBoYW50XCIpICE9PSAtMSAmJiAhZ2F0YWJsZVsxXSkgcm9sZXMuc3BsaWNlKHJvbGVzLmluZGV4T2YoXCJlbGVwaGFudFwiKSwgMSk7XHJcbiAgICAgICAgICAgIHZhciBvcmlncyA9IFtvcmlnXTtcclxuICAgICAgICAgICAgY29uc3QgY2FzdGxpbmcgPSBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLnJvbGUgPT09IFwia2luZ1wiICYmIG9yaWdbMF0gPT09IFwiZVwiICYmIGRlc3RbMF0gIT09IFwiZFwiICYmIGRlc3RbMF0gIT09IFwiZVwiICYmIGRlc3RbMF0gIT09IFwiZlwiO1xyXG4gICAgICAgICAgICB2YXIgcm9va0Rlc3QgPSBcIlwiO1xyXG4gICAgICAgICAgICBpZiAoY2FzdGxpbmcpIHtcclxuICAgICAgICAgICAgICAgIC8vIE8tT1xyXG4gICAgICAgICAgICAgICAgaWYgKGRlc3RbMF0gPiBcImVcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIG9yaWdzLnB1c2goXCJoXCIgKyBvcmlnWzFdKTtcclxuICAgICAgICAgICAgICAgICAgICByb29rRGVzdCA9ICBcImVcIiArIG9yaWdbMV07XHJcbiAgICAgICAgICAgICAgICAvLyBPLU8tT1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBvcmlncy5wdXNoKFwiYVwiICsgb3JpZ1sxXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcm9va0Rlc3QgPSAgXCJlXCIgKyBvcmlnWzFdO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgZHJhd19nYXRpbmcob3JpZ3MsIGNvbG9yLCBvcmllbnRhdGlvbik7XHJcbiAgICAgICAgICAgIGdhdGluZyA9IHtcclxuICAgICAgICAgICAgICAgIG9yaWdzOiBvcmlncyxcclxuICAgICAgICAgICAgICAgIGRlc3Q6IGRlc3QsXHJcbiAgICAgICAgICAgICAgICByb29rRGVzdDogcm9va0Rlc3QsXHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjazogY3RybC5zZW5kTW92ZSxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZ2F0ZShjdHJsLCBvcmlnLCBkZXN0LCByb2xlKSB7XHJcbiAgICAgICAgY29uc3QgZyA9IGN0cmwuZ2V0R3JvdW5kKCk7XHJcbiAgICAgICAgY29uc3QgY29sb3IgPSBnLnN0YXRlLnBpZWNlc1tkZXN0XS5jb2xvcjtcclxuICAgICAgICBnLm5ld1BpZWNlKHtcInJvbGVcIjogcm9sZSwgXCJjb2xvclwiOiBjb2xvcn0sIG9yaWcpXHJcbiAgICAgICAgY3RybC5wb2NrZXRzW2NvbG9yID09PSAnd2hpdGUnID8gMCA6IDFdW3JvbGVdLS07XHJcbiAgICAgICAgY3RybC52cG9ja2V0MSA9IHBhdGNoKGN0cmwudnBvY2tldDEsIHBvY2tldFZpZXcoY3RybCwgY29sb3IsIFwiYm90dG9tXCIpKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X2dhdGluZyhvcmlncywgY29sb3IsIG9yaWVudGF0aW9uKSB7XHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IHRvVk5vZGUoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignZXh0ZW5zaW9uJykgYXMgTm9kZSk7XHJcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCByZW5kZXJHYXRpbmcob3JpZ3MsIGNvbG9yLCBvcmllbnRhdGlvbikpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRyYXdfbm9fZ2F0aW5nKCkge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uX2Nob2ljZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZXh0ZW5zaW9uJykpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmlzaChyb2xlLCBpbmRleCkge1xyXG4gICAgICAgIGlmIChnYXRpbmcpIHtcclxuICAgICAgICAgICAgZHJhd19ub19nYXRpbmcoKTtcclxuICAgICAgICAgICAgaWYgKHJvbGUpIGdhdGUoY3RybCwgZ2F0aW5nLm9yaWdzW2luZGV4XSwgZ2F0aW5nLmRlc3QsIHJvbGUpO1xyXG4gICAgICAgICAgICBlbHNlIGluZGV4ID0gMDtcclxuICAgICAgICAgICAgY29uc3QgZ2F0ZWQgPSByb2xlID8gcm9sZVRvU2FuW3JvbGVdLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xyXG4gICAgICAgICAgICBpZiAoZ2F0aW5nLmNhbGxiYWNrKSBnYXRpbmcuY2FsbGJhY2soZ2F0aW5nLm9yaWdzW2luZGV4XSwgaW5kZXggPT09IDAgPyBnYXRpbmcuZGVzdCA6IGdhdGluZy5yb29rRGVzdCwgZ2F0ZWQpO1xyXG4gICAgICAgICAgICBnYXRpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNhbmNlbCgpIHtcclxuICAgICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBiaW5kKGV2ZW50TmFtZTogc3RyaW5nLCBmOiAoZTogRXZlbnQpID0+IHZvaWQsIHJlZHJhdykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGluc2VydCh2bm9kZSkge1xyXG4gICAgICAgICAgICAgICAgdm5vZGUuZWxtLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBmKGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWRyYXcpIHJlZHJhdygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXM7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVuZGVyU3F1YXJlcyhvcmlnLCBjb2xvciwgb3JpZW50YXRpb24sIGluZGV4KSB7XHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZmFsc2U7XHJcbiAgICAgICAgdmFyIGxlZnQgPSAoOCAtIGtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKVswXSkgKiAxMi41O1xyXG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gXCJ3aGl0ZVwiKSBsZWZ0ID0gODcuNSAtIGxlZnQ7XHJcbiAgICAgICAgcmV0dXJuIHJvbGVzLm1hcCgoc2VydmVyUm9sZSwgaSkgPT4ge1xyXG4gICAgICAgICAgICB2YXIgdG9wID0gKGNvbG9yID09PSBvcmllbnRhdGlvbiA/IDcgLSBpIDogaSkgKiAxMi41O1xyXG4gICAgICAgICAgICByZXR1cm4gaChcclxuICAgICAgICAgICAgICAgIFwic3F1YXJlXCIsXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXR0cnM6IHsgc3R5bGU6IFwidG9wOiBcIiArIHRvcCArIFwiJTtsZWZ0OiBcIiArIGxlZnQgKyBcIiVcIiB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGhvb2s6IGJpbmQoXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluaXNoKHNlcnZlclJvbGUsIGluZGV4KTtcclxuICAgICAgICAgICAgICAgICAgICB9LCBmYWxzZSlcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBbaChcInBpZWNlLlwiICsgc2VydmVyUm9sZSArIFwiLlwiICsgY29sb3IpXVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVuZGVyR2F0aW5nKG9yaWdzLCBjb2xvciwgb3JpZW50YXRpb24pIHtcclxuICAgICAgICB2YXIgdmVydGljYWwgPSBjb2xvciA9PT0gb3JpZW50YXRpb24gPyBcInRvcFwiIDogXCJib3R0b21cIjtcclxuICAgICAgICB2YXIgc3F1YXJlcyA9IHJlbmRlclNxdWFyZXMob3JpZ3NbMF0sIGNvbG9yLCBvcmllbnRhdGlvbiwgMCk7XHJcbiAgICAgICAgaWYgKG9yaWdzLmxlbmd0aCA+IDEpIHNxdWFyZXMgPSBzcXVhcmVzLmNvbmNhdChyZW5kZXJTcXVhcmVzKG9yaWdzWzFdLCBjb2xvciwgb3JpZW50YXRpb24sIDEpKTtcclxuICAgICAgICByZXR1cm4gaChcclxuICAgICAgICAgICAgXCJkaXYjZXh0ZW5zaW9uX2Nob2ljZS5cIiArIHZlcnRpY2FsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBob29rOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0OiB2bm9kZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gdm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gY2FuY2VsKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgc3F1YXJlc1xyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBzdGFydCxcclxuICAgIH07XHJcbn1cclxuIiwiaW1wb3J0IFNvY2tldHRlIGZyb20gJ3NvY2tldHRlJztcclxuXHJcbmltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcbmltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gJ3NuYWJiZG9tL3Zub2RlJztcclxuXHJcbmltcG9ydCB7IHJlbmRlclVzZXJuYW1lIH0gZnJvbSAnLi91c2VyJztcclxuaW1wb3J0IHsgY2hhdE1lc3NhZ2UsIGNoYXRWaWV3IH0gZnJvbSAnLi9jaGF0JztcclxuaW1wb3J0IHsgdmFyaWFudHMsIFZBUklBTlRTIH0gZnJvbSAnLi9jaGVzcyc7XHJcblxyXG5cclxuY2xhc3MgTG9iYnlDb250cm9sbGVyIHtcclxuICAgIG1vZGVsO1xyXG4gICAgc29jaztcclxuICAgIHBsYXllcjtcclxuICAgIGxvZ2dlZF9pbjtcclxuICAgIGNoYWxsZW5nZUFJO1xyXG4gICAgX3dzO1xyXG4gICAgc2Vla3M7XHJcblxyXG4gICAgY29uc3RydWN0b3IoZWwsIG1vZGVsKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJMb2JieUNvbnRyb2xsZXIgY29uc3RydWN0b3JcIiwgZWwsIG1vZGVsKTtcclxuXHJcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xyXG4gICAgICAgIHRoaXMuY2hhbGxlbmdlQUkgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3Qgb25PcGVuID0gKGV2dCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl93cyA9IGV2dC50YXJnZXQ7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLS0tQ09OTkVDVEVEXCIsIGV2dCk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJsb2JieV91c2VyX2Nvbm5lY3RlZFwiLCB1c2VybmFtZTogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJnZXRfc2Vla3NcIiB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3dzID0ge1wicmVhZHlTdGF0ZVwiOiAtMX07XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWF4QXR0ZW1wdHM6IDIwLFxyXG4gICAgICAgICAgICBvbm9wZW46IGUgPT4gb25PcGVuKGUpLFxyXG4gICAgICAgICAgICBvbm1lc3NhZ2U6IGUgPT4gdGhpcy5vbk1lc3NhZ2UoZSksXHJcbiAgICAgICAgICAgIG9ucmVjb25uZWN0OiBlID0+IGNvbnNvbGUubG9nKCdSZWNvbm5lY3RpbmcgaW4gbG9iYnkuLi4nLCBlKSxcclxuICAgICAgICAgICAgb25tYXhpbXVtOiBlID0+IGNvbnNvbGUubG9nKCdTdG9wIEF0dGVtcHRpbmchJywgZSksXHJcbiAgICAgICAgICAgIG9uY2xvc2U6IGUgPT4ge2NvbnNvbGUubG9nKCdDbG9zZWQhJywgZSk7fSxcclxuICAgICAgICAgICAgb25lcnJvcjogZSA9PiBjb25zb2xlLmxvZygnRXJyb3I6JywgZSksXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdGhpcy5zb2NrID0gbmV3IFNvY2tldHRlKFwid3M6Ly9cIiArIGxvY2F0aW9uLmhvc3QgKyBcIi93c2xcIiwgb3B0cyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoKGVycikge1xyXG4gICAgICAgICAgICB0aGlzLnNvY2sgPSBuZXcgU29ja2V0dGUoXCJ3c3M6Ly9cIiArIGxvY2F0aW9uLmhvc3QgKyBcIi93c2xcIiwgb3B0cyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBnZXQgc2Vla3Mgd2hlbiB3ZSBhcmUgY29taW5nIGJhY2sgYWZ0ZXIgYSBnYW1lXHJcbiAgICAgICAgaWYgKHRoaXMuX3dzLnJlYWR5U3RhdGUgPT09IDEpIHtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImdldF9zZWVrc1wiIH0pO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgcGF0Y2goZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlZWtidXR0b25zJykgYXMgSFRNTEVsZW1lbnQsIGgoJ3VsI3NlZWtidXR0b25zJywgdGhpcy5yZW5kZXJTZWVrQnV0dG9ucygpKSk7XHJcbiAgICAgICAgcGF0Y2goZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYmJ5Y2hhdCcpIGFzIEhUTUxFbGVtZW50LCBjaGF0Vmlldyh0aGlzLCBcImxvYmJ5Y2hhdFwiKSk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIGRvU2VuZCAobWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiLS0tPiBsb2JieSBkb1NlbmQoKTpcIiwgbWVzc2FnZSk7XHJcbiAgICAgICAgdGhpcy5zb2NrLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGNyZWF0ZVNlZWtNc2cgKHZhcmlhbnQsIGNvbG9yLCBmZW4sIG1pbnV0ZXMsIGluY3JlbWVudCkge1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHtcclxuICAgICAgICAgICAgdHlwZTogXCJjcmVhdGVfc2Vla1wiLFxyXG4gICAgICAgICAgICB1c2VyOiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0sXHJcbiAgICAgICAgICAgIHZhcmlhbnQ6IHZhcmlhbnQsXHJcbiAgICAgICAgICAgIGZlbjogZmVuLFxyXG4gICAgICAgICAgICBtaW51dGVzOiBtaW51dGVzLFxyXG4gICAgICAgICAgICBpbmNyZW1lbnQ6IGluY3JlbWVudCxcclxuICAgICAgICAgICAgcmF0ZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgICBjb2xvcjogY29sb3IgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY3JlYXRlQm90Q2hhbGxlbmdlTXNnICh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQsIGxldmVsKSB7XHJcbiAgICAgICAgdGhpcy5kb1NlbmQoe1xyXG4gICAgICAgICAgICB0eXBlOiBcImNyZWF0ZV9haV9jaGFsbGVuZ2VcIixcclxuICAgICAgICAgICAgdXNlcjogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdLFxyXG4gICAgICAgICAgICB2YXJpYW50OiB2YXJpYW50LFxyXG4gICAgICAgICAgICBmZW46IGZlbixcclxuICAgICAgICAgICAgbWludXRlczogbWludXRlcyxcclxuICAgICAgICAgICAgaW5jcmVtZW50OiBpbmNyZW1lbnQsXHJcbiAgICAgICAgICAgIHJhdGVkOiBmYWxzZSxcclxuICAgICAgICAgICAgbGV2ZWw6IGxldmVsLFxyXG4gICAgICAgICAgICBjb2xvcjogY29sb3IgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNOZXdTZWVrICh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQpIHtcclxuICAgICAgICByZXR1cm4gIXRoaXMuc2Vla3Muc29tZShzZWVrID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHNlZWsudXNlciA9PT0gdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdICYmIHNlZWsudmFyaWFudCA9PT0gdmFyaWFudCAmJiBzZWVrLmZlbiA9PT0gZmVuICYmIHNlZWsuY29sb3IgPT09IGNvbG9yICYmIHNlZWsudGMgPT09IG1pbnV0ZXMgKyBcIitcIiArIGluY3JlbWVudDtcclxuICAgICAgICB9KVxyXG4gICAgfVxyXG5cclxuICAgIGNyZWF0ZVNlZWsgKGNvbG9yKSB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nbm9uZSc7XHJcbiAgICAgICAgbGV0IGU7XHJcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YXJpYW50JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XHJcbiAgICAgICAgY29uc3QgdmFyaWFudCA9IGUub3B0aW9uc1tlLnNlbGVjdGVkSW5kZXhdLnZhbHVlO1xyXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwic2Vla192YXJpYW50XCIsIHZhcmlhbnQpO1xyXG5cclxuICAgICAgICBlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZlbicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgY29uc3QgZmVuID0gZS52YWx1ZTtcclxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInNlZWtfZmVuXCIsIGUudmFsdWUpO1xyXG5cclxuICAgICAgICBlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21pbicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgY29uc3QgbWludXRlcyA9IHBhcnNlSW50KGUudmFsdWUpO1xyXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwic2Vla19taW5cIiwgZS52YWx1ZSk7XHJcblxyXG4gICAgICAgIGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5jJykgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBjb25zdCBpbmNyZW1lbnQgPSBwYXJzZUludChlLnZhbHVlKTtcclxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInNlZWtfaW5jXCIsIGUudmFsdWUpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5jaGFsbGVuZ2VBSSkge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FpbGV2ZWwnKSBhcyBIVE1MRm9ybUVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGxldmVsID0gcGFyc2VJbnQoZm9ybS5lbGVtZW50c1snbGV2ZWwnXS52YWx1ZSk7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwic2Vla19sZXZlbFwiLCBmb3JtLmVsZW1lbnRzWydsZXZlbCddLnZhbHVlKTtcclxuICAgICAgICAgICAgdGhpcy5jcmVhdGVCb3RDaGFsbGVuZ2VNc2codmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50LCBsZXZlbClcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pc05ld1NlZWsodmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50KSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jcmVhdGVTZWVrTXNnKHZhcmlhbnQsIGNvbG9yLCBmZW4sIG1pbnV0ZXMsIGluY3JlbWVudCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyU2Vla0J1dHRvbnMgKCkge1xyXG4gICAgICAgIGNvbnN0IHNldE1pbnV0ZXMgPSAobWludXRlcykgPT4ge1xyXG4gICAgICAgICAgICB2YXIgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pbnV0ZXNcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gbWludXRlcztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHNldEluY3JlbWVudCA9IChpbmNyZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgdmFyIGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbmNyZW1lbnRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gaW5jcmVtZW50O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgdklkeCA9IGxvY2FsU3RvcmFnZS5zZWVrX3ZhcmlhbnQgPT09IHVuZGVmaW5lZCA/IDAgOiB2YXJpYW50cy5pbmRleE9mKGxvY2FsU3RvcmFnZS5zZWVrX3ZhcmlhbnQpO1xyXG4gICAgICAgIGNvbnN0IHZGZW4gPSBsb2NhbFN0b3JhZ2Uuc2Vla19mZW4gPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBsb2NhbFN0b3JhZ2Uuc2Vla19mZW47XHJcbiAgICAgICAgY29uc3Qgdk1pbiA9IGxvY2FsU3RvcmFnZS5zZWVrX21pbiA9PT0gdW5kZWZpbmVkID8gXCI1XCIgOiBsb2NhbFN0b3JhZ2Uuc2Vla19taW47XHJcbiAgICAgICAgY29uc3QgdkluYyA9IGxvY2FsU3RvcmFnZS5zZWVrX2luYyA9PT0gdW5kZWZpbmVkID8gXCIzXCIgOiBsb2NhbFN0b3JhZ2Uuc2Vla19pbmM7XHJcbiAgICAgICAgY29uc3QgdkxldmVsID0gbG9jYWxTdG9yYWdlLnNlZWtfbGV2ZWwgPT09IHVuZGVmaW5lZCA/IFwiMVwiIDogbG9jYWxTdG9yYWdlLnNlZWtfbGV2ZWw7XHJcblxyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgaCgnZGl2I2lkMDEnLCB7IGNsYXNzOiB7XCJtb2RhbFwiOiB0cnVlfSB9LCBbXHJcbiAgICAgICAgICBoKCdmb3JtLm1vZGFsLWNvbnRlbnQnLCBbXHJcbiAgICAgICAgICAgIGgoJ2RpdiNjbG9zZWNvbnRhaW5lcicsIFtcclxuICAgICAgICAgICAgICBoKCdzcGFuLmNsb3NlJywgeyBvbjogeyBjbGljazogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nbm9uZScgfSwgYXR0cnM6IHsnZGF0YS1pY29uJzogJ2onfSwgcHJvcHM6IHt0aXRsZTogXCJDYW5jZWxcIn0gfSksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBoKCdkaXYuY29udGFpbmVyJywgW1xyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcInZhcmlhbnRcIn0gfSwgXCJWYXJpYW50XCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnc2VsZWN0I3ZhcmlhbnQnLCB7IHByb3BzOiB7bmFtZTogXCJ2YXJpYW50XCJ9IH0sIHZhcmlhbnRzLm1hcCgodmFyaWFudCwgaWR4KSA9PiBoKCdvcHRpb24nLCB7IHByb3BzOiB7dmFsdWU6IHZhcmlhbnQsIHNlbGVjdGVkOiAoaWR4ID09PSB2SWR4KSA/IFwic2VsZWN0ZWRcIiA6IFwiXCJ9IH0sIHZhcmlhbnQpKSksXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgYXR0cnM6IHtmb3I6IFwiZmVuXCJ9IH0sIFwiU3RhcnQgcG9zaXRpb25cIiksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNmZW4nLCB7IHByb3BzOiB7bmFtZTogJ2ZlbicsIHBsYWNlaG9sZGVyOiAnUGFzdGUgdGhlIEZFTiB0ZXh0IGhlcmUnLCB2YWx1ZTogdkZlbn0gfSksXHJcbiAgICAgICAgICAgICAgICAvL2goJ2xhYmVsJywgeyBhdHRyczoge2ZvcjogXCJ0Y1wifSB9LCBcIlRpbWUgQ29udHJvbFwiKSxcclxuICAgICAgICAgICAgICAgIC8vaCgnc2VsZWN0I3RpbWVjb250cm9sJywgeyBwcm9wczoge25hbWU6IFwidGltZWNvbnRyb2xcIn0gfSwgW1xyXG4gICAgICAgICAgICAgICAgLy8gICAgaCgnb3B0aW9uJywgeyBwcm9wczoge3ZhbHVlOiBcIjFcIiwgc2VsZWN0ZWQ6IHRydWV9IH0sIFwiUmVhbCB0aW1lXCIpLFxyXG4gICAgICAgICAgICAgICAgLy8gICAgaCgnb3B0aW9uJywgeyBwcm9wczoge3ZhbHVlOiBcIjJcIn0gfSwgXCJVbmxpbWl0ZWRcIiksXHJcbiAgICAgICAgICAgICAgICAvL10pLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcIm1pblwifSB9LCBcIk1pbnV0ZXMgcGVyIHNpZGU6XCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnc3BhbiNtaW51dGVzJyksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNtaW4nLCB7IGNsYXNzOiB7IFwic2xpZGVyXCI6IHRydWUgfSxcclxuICAgICAgICAgICAgICAgICAgICBwcm9wczoge25hbWU6IFwibWluXCIsIHR5cGU6IFwicmFuZ2VcIiwgbWluOiAwLCBtYXg6IDYwLCB2YWx1ZTogdk1pbn0sXHJcbiAgICAgICAgICAgICAgICAgICAgb246IHsgaW5wdXQ6IChlKSA9PiBzZXRNaW51dGVzKChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkgfSxcclxuICAgICAgICAgICAgICAgICAgICBob29rOiB7aW5zZXJ0OiAodm5vZGUpID0+IHNldE1pbnV0ZXMoKHZub2RlLmVsbSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkgfSxcclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcImluY1wifSB9LCBcIkluY3JlbWVudCBpbiBzZWNvbmRzOlwiKSxcclxuICAgICAgICAgICAgICAgIGgoJ3NwYW4jaW5jcmVtZW50JyksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNpbmMnLCB7IGNsYXNzOiB7XCJzbGlkZXJcIjogdHJ1ZSB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BzOiB7bmFtZTogXCJpbmNcIiwgdHlwZTogXCJyYW5nZVwiLCBtaW46IDAsIG1heDogMTUsIHZhbHVlOiB2SW5jfSxcclxuICAgICAgICAgICAgICAgICAgICBvbjogeyBpbnB1dDogKGUpID0+IHNldEluY3JlbWVudCgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgaG9vazoge2luc2VydDogKHZub2RlKSA9PiBzZXRJbmNyZW1lbnQoKHZub2RlLmVsbSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkgfSxcclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgLy8gaWYgcGxheSB3aXRoIHRoZSBtYWNoaW5lXHJcbiAgICAgICAgICAgICAgICAvLyBBLkkuTGV2ZWwgKDEtOCBidXR0b25zKVxyXG4gICAgICAgICAgICAgICAgaCgnZm9ybSNhaWxldmVsJywgW1xyXG4gICAgICAgICAgICAgICAgaCgnaDQnLCBcIkEuSS4gTGV2ZWxcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYucmFkaW8tZ3JvdXAnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWkxJywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiMVwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiMVwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTEnLCB7IGF0dHJzOiB7Zm9yOiBcImFpMVwifSB9LCBcIjFcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWkyJywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiMlwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiMlwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTInLCB7IGF0dHJzOiB7Zm9yOiBcImFpMlwifSB9LCBcIjJcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWkzJywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiM1wiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiM1wiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTMnLCB7IGF0dHJzOiB7Zm9yOiBcImFpM1wifSB9LCBcIjNcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk0JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiNFwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiNFwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTQnLCB7IGF0dHJzOiB7Zm9yOiBcImFpNFwifSB9LCBcIjRcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk1JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiNVwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiNVwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTUnLCB7IGF0dHJzOiB7Zm9yOiBcImFpNVwifSB9LCBcIjVcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk2JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiNlwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiNlwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTYnLCB7IGF0dHJzOiB7Zm9yOiBcImFpNlwifSB9LCBcIjZcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk3JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiN1wiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiN1wiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTcnLCB7IGF0dHJzOiB7Zm9yOiBcImFpN1wifSB9LCBcIjdcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk4JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiOFwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiOFwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTgnLCB7IGF0dHJzOiB7Zm9yOiBcImFpOFwifSB9LCBcIjhcIiksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2LmJ1dHRvbi1ncm91cCcsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKCdidXR0b24uaWNvbi5pY29uLWJsYWNrJywgeyBwcm9wczoge3R5cGU6IFwiYnV0dG9uXCIsIHRpdGxlOiBcIkJsYWNrXCJ9LCBvbjoge2NsaWNrOiAoKSA9PiB0aGlzLmNyZWF0ZVNlZWsoJ2InKSB9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5pY29uLmljb24tYWRqdXN0JywgeyBwcm9wczoge3R5cGU6IFwiYnV0dG9uXCIsIHRpdGxlOiBcIlJhbmRvbVwifSwgb246IHtjbGljazogKCkgPT4gdGhpcy5jcmVhdGVTZWVrKCdyJyl9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5pY29uLmljb24td2hpdGUnLCB7IHByb3BzOiB7dHlwZTogXCJidXR0b25cIiwgdGl0bGU6IFwiV2hpdGVcIn0sIG9uOiB7Y2xpY2s6ICgpID0+IHRoaXMuY3JlYXRlU2VlaygndycpfSB9KSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgIF0pLFxyXG4gICAgICAgIF0pLFxyXG4gICAgICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IHsnbG9iYnktYnV0dG9uJzogdHJ1ZX0sIG9uOiB7XHJcbiAgICAgICAgICAgIGNsaWNrOiAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoYWxsZW5nZUFJID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWlsZXZlbCcpIS5zdHlsZS5kaXNwbGF5PSdub25lJztcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhLnN0eWxlLmRpc3BsYXk9J2Jsb2NrJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSB9LCBcIkNyZWF0ZSBhIGdhbWVcIiksXHJcbiAgICAgICAgaCgnYnV0dG9uJywgeyBjbGFzczogeydsb2JieS1idXR0b24nOiB0cnVlfSwgb246IHtcclxuICAgICAgICAgICAgY2xpY2s6ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbGxlbmdlQUkgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FpbGV2ZWwnKSEuc3R5bGUuZGlzcGxheT0naW5saW5lLWJsb2NrJztcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhLnN0eWxlLmRpc3BsYXk9J2Jsb2NrJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSB9LCBcIlBsYXkgd2l0aCB0aGUgbWFjaGluZVwiKSxcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIG9uQ2xpY2tTZWVrKHNlZWspIHtcclxuICAgICAgICBpZiAoc2Vla1tcInVzZXJcIl0gPT09IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSkge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZGVsZXRlX3NlZWtcIiwgc2Vla0lEOiBzZWVrW1wic2Vla0lEXCJdLCBwbGF5ZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiYWNjZXB0X3NlZWtcIiwgc2Vla0lEOiBzZWVrW1wic2Vla0lEXCJdLCBwbGF5ZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyU2Vla3Moc2Vla3MpIHtcclxuICAgICAgICAvLyBUT0RPOiBmaXggaGVhZGVyIGFuZCBkYXRhIHJvdyBjb2xvbW5zXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMzcyNzIzMzEvaHRtbC10YWJsZS13aXRoLWZpeGVkLWhlYWRlci1hbmQtZm9vdGVyLWFuZC1zY3JvbGxhYmxlLWJvZHktd2l0aG91dC1maXhlZC13aWR0aHNcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBoKCd0aGVhZCcsIFtoKCd0cicsXHJcbiAgICAgICAgICAgIFtoKCd0aCcsICdQbGF5ZXInKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ0NvbG9yJyksXHJcbiAgICAgICAgICAgICBoKCd0aCcsICdSYXRpbmcnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ1RpbWUnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJyAgICAnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ1ZhcmlhbnQnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ01vZGUnKV0pXSk7XHJcbiAgICAgICAgY29uc3QgY29sb3JJY29uID0gKGNvbG9yKSA9PiB7IHJldHVybiBoKCdpJywge2F0dHJzOiB7XCJkYXRhLWljb25cIjogY29sb3IgPT09IFwid1wiID8gXCJjXCIgOiBjb2xvciA9PT0gXCJiXCIgPyBcImJcIiA6IFwiYVwifX0gKTsgfTtcclxuICAgICAgICB2YXIgcm93cyA9IHNlZWtzLm1hcCgoc2VlaykgPT4gaChcclxuICAgICAgICAgICAgJ3RyJyxcclxuICAgICAgICAgICAgeyBvbjogeyBjbGljazogKCkgPT4gdGhpcy5vbkNsaWNrU2VlayhzZWVrKSB9IH0sXHJcbiAgICAgICAgICAgIFtoKCd0ZCcsIHNlZWtbXCJ1c2VyXCJdKSxcclxuICAgICAgICAgICAgIGgoJ3RkJywgW2NvbG9ySWNvbihzZWVrW1wiY29sb3JcIl0pXSksXHJcbiAgICAgICAgICAgICBoKCd0ZCcsICcxNTAwPycpLFxyXG4gICAgICAgICAgICAgaCgndGQnLCBzZWVrW1widGNcIl0pLFxyXG4gICAgICAgICAgICAgaCgndGQnLCB7YXR0cnM6IHtcImRhdGEtaWNvblwiOiBWQVJJQU5UU1tzZWVrW1widmFyaWFudFwiXV0uaWNvbn0sIGNsYXNzOiB7XCJpY29uXCI6IHRydWV9fSApLFxyXG4gICAgICAgICAgICAgaCgndGQnLCBzZWVrW1widmFyaWFudFwiXSksXHJcbiAgICAgICAgICAgICBoKCd0ZCcsIHNlZWtbXCJyYXRlZFwiXSkgXSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gW2hlYWRlciwgaCgndGJvZHknLCByb3dzKV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ0dldFNlZWtzID0gKG1zZykgPT4ge1xyXG4gICAgICAgIHRoaXMuc2Vla3MgPSBtc2cuc2Vla3M7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCIhISEhIGdvdCBnZXRfc2Vla3MgbXNnOlwiLCBtc2cpO1xyXG4gICAgICAgIGNvbnN0IG9sZFZOb2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlZWtzJyk7XHJcbiAgICAgICAgaWYgKG9sZFZOb2RlIGluc3RhbmNlb2YgRWxlbWVudCkge1xyXG4gICAgICAgICAgICBvbGRWTm9kZS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ3RhYmxlI3NlZWtzJywgdGhpcy5yZW5kZXJTZWVrcyhtc2cuc2Vla3MpKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dOZXdHYW1lID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiTG9iYnlDb250cm9sbGVyLm9uTXNnTmV3R2FtZSgpXCIsIHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pXHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbih0aGlzLm1vZGVsW1wiaG9tZVwiXSArICcvJyArIG1zZ1tcImdhbWVJZFwiXSk7XHJcbn1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnQ2hhdCA9IChtc2cpID0+IHtcclxuICAgICAgICBjaGF0TWVzc2FnZShtc2cudXNlciwgbXNnLm1lc3NhZ2UsIFwibG9iYnljaGF0XCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dQaW5nID0gKG1zZykgPT4ge1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHt0eXBlOiBcInBvbmdcIiwgdGltZXN0YW1wOiBtc2cudGltZXN0YW1wfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ1NodXRkb3duID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGFsZXJ0KG1zZy5tZXNzYWdlKTtcclxuICAgIH1cclxuXHJcbiAgICBvbk1lc3NhZ2UgKGV2dCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiPCsrKyBsb2JieSBvbk1lc3NhZ2UoKTpcIiwgZXZ0LmRhdGEpO1xyXG4gICAgICAgIHZhciBtc2cgPSBKU09OLnBhcnNlKGV2dC5kYXRhKTtcclxuICAgICAgICBzd2l0Y2ggKG1zZy50eXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnZXRfc2Vla3NcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dHZXRTZWVrcyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJuZXdfZ2FtZVwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ05ld0dhbWUobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwibG9iYnlfdXNlcl9jb25uZWN0ZWRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dVc2VyQ29ubmVjdGVkKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImxvYmJ5Y2hhdFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ0NoYXQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicGluZ1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1BpbmcobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwic2h1dGRvd25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dTaHV0ZG93bihtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBydW5TZWVrcyh2bm9kZTogVk5vZGUsIG1vZGVsKSB7XHJcbiAgICBjb25zdCBlbCA9IHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IGN0cmwgPSBuZXcgTG9iYnlDb250cm9sbGVyKGVsLCBtb2RlbCk7XHJcbiAgICBjb25zb2xlLmxvZyhcImxvYmJ5VmlldygpIC0+IHJ1blNlZWtzKClcIiwgZWwsIG1vZGVsLCBjdHJsKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGxvYmJ5Vmlldyhtb2RlbCk6IFZOb2RlW10ge1xyXG4gICAgLy8gR2V0IHRoZSBtb2RhbFxyXG4gICAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWQwMScpITtcclxuXHJcbiAgICAvLyBXaGVuIHRoZSB1c2VyIGNsaWNrcyBhbnl3aGVyZSBvdXRzaWRlIG9mIHRoZSBtb2RhbCwgY2xvc2UgaXRcclxuICAgIHdpbmRvdy5vbmNsaWNrID0gZnVuY3Rpb24oZXZlbnQpIHtcclxuICAgICAgICBpZiAoZXZlbnQudGFyZ2V0ID09IG1vZGFsKSB7XHJcbiAgICAgICAgICAgIG1vZGFsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFtoKCdhc2lkZS5zaWRlYmFyLWZpcnN0JywgWyBoKCdkaXYubG9iYnljaGF0I2xvYmJ5Y2hhdCcpIF0pLFxyXG4gICAgICAgICAgICBoKCdtYWluLm1haW4nLCBbIGgoJ3RhYmxlI3NlZWtzJywge2hvb2s6IHsgaW5zZXJ0OiAodm5vZGUpID0+IHJ1blNlZWtzKHZub2RlLCBtb2RlbCkgfSB9KSBdKSxcclxuICAgICAgICAgICAgaCgnYXNpZGUuc2lkZWJhci1zZWNvbmQnLCBbIGgoJ3VsI3NlZWtidXR0b25zJykgXSksXHJcbiAgICAgICAgICAgIGgoJ3VuZGVyLWxlZnQnLCBcIiMgb2YgdXNlcnNcIiksXHJcbiAgICAgICAgICAgIGgoJ3VuZGVyLWxvYmJ5JyksXHJcbiAgICAgICAgICAgIGgoJ3VuZGVyLXJpZ2h0JyksXHJcbiAgICAgICAgXTtcclxufVxyXG4iLCJpbXBvcnQgeyBpbml0IH0gZnJvbSAnc25hYmJkb20nO1xyXG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XHJcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XHJcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xyXG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xyXG5pbXBvcnQgaCBmcm9tICdzbmFiYmRvbS9oJztcclxuaW1wb3J0IHsgVk5vZGUgfSBmcm9tICdzbmFiYmRvbS92bm9kZSc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcbmltcG9ydCB7IGxvYmJ5VmlldyB9IGZyb20gJy4vbG9iYnknO1xyXG5pbXBvcnQgeyByb3VuZFZpZXcgfSBmcm9tICcuL3JvdW5kJztcclxuaW1wb3J0IHsgcHJvZmlsZVZpZXcgfSBmcm9tICcuL3Byb2ZpbGUnO1xyXG5cclxuY29uc3QgbW9kZWwgPSB7aG9tZTogXCJcIiwgdXNlcm5hbWU6IFwiXCIsIGFub246IFwiXCIsIHZhcmlhbnQ6IFwiXCIsIGdhbWVJZDogMCwgd3BsYXllcjogXCJcIiwgYnBsYXllcjogXCJcIiwgZmVuOiBcIlwiLCBiYXNlOiBcIlwiLCBpbmM6IFwiXCIsIHNlZWtzOiBbXSwgdHY6IFwiXCIsIHByb2ZpbGVpZDogXCJcIiwgc3RhdHVzOiBcIlwifTtcclxuXHJcbnZhciBnZXRDb29raWUgPSBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICB2YXIgY29va2llcyA9IGRvY3VtZW50LmNvb2tpZS5zcGxpdCgnOycpO1xyXG4gICAgZm9yKHZhciBpPTAgOyBpIDwgY29va2llcy5sZW5ndGggOyArK2kpIHtcclxuICAgICAgICB2YXIgcGFpciA9IGNvb2tpZXNbaV0udHJpbSgpLnNwbGl0KCc9Jyk7XHJcbiAgICAgICAgaWYocGFpclswXSA9PSBuYW1lKVxyXG4gICAgICAgICAgICByZXR1cm4gcGFpclsxXTtcclxuICAgIH1cclxuICAgIHJldHVybiBcIlwiO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdmlldyhtb2RlbCk6IFZOb2RlIHtcclxuICAgIGNvbnN0IHVzZXIgPSBnZXRDb29raWUoXCJ1c2VyXCIpO1xyXG4gICAgaWYgKHVzZXIgIT09IFwiXCIpIG1vZGVsW1widXNlcm5hbWVcIl0gPSB1c2VyO1xyXG5cclxuICAgIHZhciBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdweWNoZXNzLXZhcmlhbnRzJyk7XHJcbiAgICBpZiAoZWwgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGVsLmhhc0F0dHJpYnV0ZShcImRhdGEtaG9tZVwiKSkge1xyXG4gICAgICAgIG1vZGVsW1wiaG9tZVwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtaG9tZVwiKTtcclxuICAgICAgICBtb2RlbFtcImFub25cIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWFub25cIik7XHJcbiAgICB9XHJcbiAgICBpZiAoZWwgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGVsLmhhc0F0dHJpYnV0ZShcImRhdGEtdmFyaWFudFwiKSkge1xyXG4gICAgICAgIGNvbnN0IHZhcmlhbnQgPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXZhcmlhbnRcIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzaXRlLnZpZXcoKSBkYXRhLXZhcmlhbnQ9XCIsIHZhcmlhbnQpO1xyXG4gICAgICAgIGlmICh2YXJpYW50KSB7XHJcbiAgICAgICAgICAgIG1vZGVsW1widmFyaWFudFwiXSA9IHZhcmlhbnQ7XHJcbiAgICAgICAgICAgIG1vZGVsW1widXNlcm5hbWVcIl0gPSB1c2VyICE9PSBcIlwiID8gdXNlciA6IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdXNlcm5hbWVcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiZ2FtZUlkXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1nYW1laWRcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wid3BsYXllclwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtd3BsYXllclwiKTtcclxuICAgICAgICAgICAgbW9kZWxbXCJicGxheWVyXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1icGxheWVyXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImZlblwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtZmVuXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImJhc2VcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWJhc2VcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiaW5jXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1pbmNcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wic3RhdHVzXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1zdGF0dXNcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1widHZcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXR2XCIpO1xyXG4gICAgICAgIH07XHJcbiAgICBpZiAoZWwgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGVsLmhhc0F0dHJpYnV0ZShcImRhdGEtcHJvZmlsZWlkXCIpKSB7XHJcbiAgICAgICAgbW9kZWxbXCJwcm9maWxlaWRcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXByb2ZpbGVpZFwiKTtcclxuICAgIH1cclxuICAgIH1cclxuICAgIGlmIChtb2RlbC5wcm9maWxlaWQpIHtcclxuICAgICAgICByZXR1cm4gaCgnZGl2I3BsYWNlaG9sZGVyLnByb2ZpbGUtd3JhcHBlcicsIHByb2ZpbGVWaWV3KG1vZGVsKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBoKCdkaXYjcGxhY2Vob2xkZXIubWFpbi13cmFwcGVyJywgbW9kZWwudmFyaWFudCA/IHJvdW5kVmlldyhtb2RlbCkgOiBsb2JieVZpZXcobW9kZWwpKTtcclxuICAgIH1cclxufVxyXG5cclxucGF0Y2goZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BsYWNlaG9sZGVyJykgYXMgSFRNTEVsZW1lbnQsIHZpZXcobW9kZWwpKTtcclxuIiwiaW1wb3J0IHsgaW5pdCB9IGZyb20gXCJzbmFiYmRvbVwiO1xuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcblxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XG5cbmltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xuXG5pbXBvcnQgeyBwb2NrZXRWaWV3IH0gZnJvbSAnLi9wb2NrZXQnO1xuaW1wb3J0IHsgbmVlZFBvY2tldHMgfSBmcm9tICcuL2NoZXNzJztcblxuXG5mdW5jdGlvbiBzZWxlY3RNb3ZlIChjdHJsLCBwbHkpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdsaS5tb3ZlLmFjdGl2ZScpO1xuICAgIGlmIChhY3RpdmUpIGFjdGl2ZS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICBjb25zdCBlbFBseSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGxpLm1vdmVbcGx5PVwiJHtwbHl9XCJdYCk7XG4gICAgaWYgKGVsUGx5KSBlbFBseS5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICBjdHJsLmdvUGx5KHBseSlcbiAgICBzY3JvbGxUb1BseShjdHJsKTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsVG9QbHkgKGN0cmwpIHtcbiAgICBpZiAoY3RybC5zdGVwcy5sZW5ndGggPCA5KSByZXR1cm47XG4gICAgY29uc3QgbW92ZXNFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb3ZlcycpIGFzIEhUTUxFbGVtZW50O1xuICAgIGxldCBzdDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IHBseUVsID0gbW92ZXNFbC5xdWVyeVNlbGVjdG9yKCdsaS5tb3ZlLmFjdGl2ZScpIGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuICAgIGlmIChjdHJsLnBseSA9PSAwKSBzdCA9IDA7XG4gICAgZWxzZSBpZiAoY3RybC5wbHkgPT0gY3RybC5zdGVwcy5sZW5ndGggLSAxKSBzdCA9IDk5OTk5O1xuICAgIGVsc2Uge1xuICAgICAgICBpZiAocGx5RWwpIHN0ID0gcGx5RWwub2Zmc2V0VG9wIC0gbW92ZXNFbC5vZmZzZXRIZWlnaHQgKyBwbHlFbC5vZmZzZXRIZWlnaHQ7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKFwic2Nyb2xsVG9QbHlcIiwgY3RybC5wbHksIHN0KTtcbiAgICBpZiAodHlwZW9mIHN0ID09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChzdCA9PSAwIHx8IHN0ID09IDk5OTk5KSBtb3Zlc0VsLnNjcm9sbFRvcCA9IHN0O1xuICAgICAgICBlbHNlIGlmIChwbHlFbCkge1xuICAgICAgICAgICAgdmFyIGlzU21vb3RoU2Nyb2xsU3VwcG9ydGVkID0gJ3Njcm9sbEJlaGF2aW9yJyBpbiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGU7XG4gICAgICAgICAgICBpZihpc1Ntb290aFNjcm9sbFN1cHBvcnRlZCkge1xuICAgICAgICAgICAgICAgIHBseUVsLnNjcm9sbEludG9WaWV3KHtiZWhhdmlvcjogXCJzbW9vdGhcIiwgYmxvY2s6IFwiY2VudGVyXCJ9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGx5RWwuc2Nyb2xsSW50b1ZpZXcoZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBmbGlwXG4vLyBUT0RPOiBwbGF5ZXJzLCBjbG9ja3NcbmZ1bmN0aW9uIHRvZ2dsZU9yaWVudGF0aW9uIChjdHJsKSB7XG4gICAgY3RybC5mbGlwID0gIWN0cmwuZmxpcDtcbiAgICBjdHJsLmNoZXNzZ3JvdW5kLnRvZ2dsZU9yaWVudGF0aW9uKCk7XG4gICAgaWYgKGN0cmwudmFyaWFudCA9PT0gXCJzaG9naVwiKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gY3RybC5jaGVzc2dyb3VuZC5zdGF0ZS5vcmllbnRhdGlvbiA9PT0gXCJ3aGl0ZVwiID8gXCJ3aGl0ZVwiIDogXCJibGFja1wiO1xuICAgICAgICBjdHJsLnNldFBpZWNlcyhjb2xvcik7XG4gICAgfTtcblxuICAgIGNvbnN0IG5hbWVfdG1wID0gY3RybC5wbGF5ZXJzWzBdO1xuICAgIGN0cmwucGxheWVyc1swXSA9IGN0cmwucGxheWVyc1sxXTtcbiAgICBjdHJsLnBsYXllcnNbMV0gPSBuYW1lX3RtcDtcblxuICAgIGNvbnNvbGUubG9nKFwiRkxJUFwiKTtcbiAgICBpZiAobmVlZFBvY2tldHMoY3RybC52YXJpYW50KSkge1xuICAgICAgICBjb25zdCB0bXAgPSBjdHJsLnBvY2tldHNbMF07XG4gICAgICAgIGN0cmwucG9ja2V0c1swXSA9IGN0cmwucG9ja2V0c1sxXTtcbiAgICAgICAgY3RybC5wb2NrZXRzWzFdID0gdG1wO1xuICAgICAgICBjdHJsLnZwb2NrZXQwID0gcGF0Y2goY3RybC52cG9ja2V0MCwgcG9ja2V0VmlldyhjdHJsLCBjdHJsLmZsaXAgPyBjdHJsLm15Y29sb3IgOiBjdHJsLm9wcGNvbG9yLCBcInRvcFwiKSk7XG4gICAgICAgIGN0cmwudnBvY2tldDEgPSBwYXRjaChjdHJsLnZwb2NrZXQxLCBwb2NrZXRWaWV3KGN0cmwsIGN0cmwuZmxpcCA/IGN0cmwub3BwY29sb3IgOiBjdHJsLm15Y29sb3IsIFwiYm90dG9tXCIpKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlbGlzdFZpZXcgKGN0cmwpIHtcbiAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vdmUtY29udHJvbHMnKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjdHJsLm1vdmVDb250cm9scyA9IHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmJ0bi1jb250cm9scycsIFtcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNmbGlwLWJvYXJkJywgeyBvbjogeyBjbGljazogKCkgPT4gdG9nZ2xlT3JpZW50YXRpb24oY3RybCkgfSB9LCBbaCgnaScsIHtwcm9wczoge3RpdGxlOiAnRmxpcCBib2FyZCd9LCBjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tcmVmcmVzaFwiOiB0cnVlfSB9ICksIF0pLFxuICAgICAgICAgICAgaCgnYnV0dG9uI2Zhc3RiYWNrd2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHNlbGVjdE1vdmUoY3RybCwgMCkgfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tZmFzdC1iYWNrd2FyZFwiOiB0cnVlfSB9ICksIF0pLFxuICAgICAgICAgICAgaCgnYnV0dG9uI3N0ZXBiYWNrd2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHNlbGVjdE1vdmUoY3RybCwgTWF0aC5tYXgoY3RybC5wbHkgLSAxLCAwKSkgfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tc3RlcC1iYWNrd2FyZFwiOiB0cnVlfSB9ICksIF0pLFxuICAgICAgICAgICAgaCgnYnV0dG9uI3N0ZXBmb3J3YXJkJywgeyBvbjogeyBjbGljazogKCkgPT4gc2VsZWN0TW92ZShjdHJsLCBNYXRoLm1pbihjdHJsLnBseSArIDEsIGN0cmwuc3RlcHMubGVuZ3RoIC0gMSkpIH0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXN0ZXAtZm9yd2FyZFwiOiB0cnVlfSB9ICksIF0pLFxuICAgICAgICAgICAgaCgnYnV0dG9uI2Zhc3Rmb3J3YXJkJywgeyBvbjogeyBjbGljazogKCkgPT4gc2VsZWN0TW92ZShjdHJsLCBjdHJsLnN0ZXBzLmxlbmd0aCAtIDEpIH0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWZhc3QtZm9yd2FyZFwiOiB0cnVlfSB9ICksIF0pLFxuICAgICAgICBdKVxuICAgICk7XG4gICAgcmV0dXJuIGgoJ2RpdiNtb3ZlcycsIFtoKCdvbC5tb3ZlbGlzdCNtb3ZlbGlzdCcpXSlcbiAgICB9XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNb3ZlbGlzdCAoY3RybCkge1xuICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW92ZWxpc3QnKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCBwbHkgPSBjdHJsLnN0ZXBzLmxlbmd0aCAtIDE7XG4gICAgY29uc3QgbW92ZSA9IGN0cmwuc3RlcHNbcGx5XVsnc2FuJ107XG4gICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbGkubW92ZS5hY3RpdmUnKTtcbiAgICBpZiAoYWN0aXZlKSBhY3RpdmUuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgY29uc3QgZWwgPSBoKCdsaS5tb3ZlJywge2NsYXNzOiB7YWN0aXZlOiB0cnVlfSwgYXR0cnM6IHtwbHk6IHBseX0sIG9uOiB7IGNsaWNrOiAoKSA9PiBzZWxlY3RNb3ZlKGN0cmwsIHBseSkgfX0sIG1vdmUpO1xuICAgIGlmIChwbHkgJSAyID09IDApIHtcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdvbC5tb3ZlbGlzdCNtb3ZlbGlzdCcsIFtlbF0pKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ29sLm1vdmVsaXN0I21vdmVsaXN0JywgW2goJ2xpLm1vdmUuY291bnRlcicsIChwbHkgKyAxKSAvIDIpLCBlbF0pKTtcbiAgICB9XG4gICAgc2Nyb2xsVG9QbHkoY3RybCk7XG59IiwiaW1wb3J0IHsgaCwgaW5pdCB9IGZyb20gXCJzbmFiYmRvbVwiO1xuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcblxuaW1wb3J0ICogYXMgY2cgZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcbmltcG9ydCB7IGRyYWdOZXdQaWVjZSB9IGZyb20gJ2NoZXNzZ3JvdW5keC9kcmFnJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcblxuaW1wb3J0IHsgcm9sZVRvU2FuLCBuZWVkUG9ja2V0cywgcG9ja2V0Um9sZXMsIGxjIH0gZnJvbSAnLi9jaGVzcyc7XG5pbXBvcnQgUm91bmRDb250cm9sbGVyIGZyb20gJy4vY3RybCc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG50eXBlIFBvc2l0aW9uID0gJ3RvcCcgfCAnYm90dG9tJztcblxuY29uc3QgZXZlbnROYW1lcyA9IFsnbW91c2Vkb3duJywgJ3RvdWNoc3RhcnQnXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBvY2tldFZpZXcoY3RybDogUm91bmRDb250cm9sbGVyLCBjb2xvcjogQ29sb3IsIHBvc2l0aW9uOiBQb3NpdGlvbikge1xuICBjb25zdCBwb2NrZXQgPSBjdHJsLnBvY2tldHNbcG9zaXRpb24gPT09ICd0b3AnID8gMCA6IDFdO1xuICBjb25zdCBwaWVjZVJvbGVzID0gT2JqZWN0LmtleXMocG9ja2V0KTtcbiAgcmV0dXJuIGgoJ2Rpdi5wb2NrZXQuJyArIHBvc2l0aW9uLCB7XG4gICAgY2xhc3M6IHsgdXNhYmxlOiB0cnVlIH0sXG4gICAgaG9vazoge1xuICAgICAgaW5zZXJ0OiB2bm9kZSA9PiB7XG4gICAgICAgIGV2ZW50TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICAodm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIChlOiBjZy5Nb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IChjdHJsLmZsaXAgPyAndG9wJyA6ICdib3R0b20nKSkgZHJhZyhjdHJsLCBlKTtcbiAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH0sIHBpZWNlUm9sZXMubWFwKHJvbGUgPT4ge1xuICAgIGxldCBuYiA9IHBvY2tldFtyb2xlXSB8fCAwO1xuICAgIHJldHVybiBoKCdwaWVjZS4nICsgcm9sZSArICcuJyArIGNvbG9yLCB7XG4gICAgICBhdHRyczoge1xuICAgICAgICAnZGF0YS1yb2xlJzogcm9sZSxcbiAgICAgICAgJ2RhdGEtY29sb3InOiBjb2xvcixcbiAgICAgICAgJ2RhdGEtbmInOiBuYixcbiAgICAgIH1cbiAgICB9KTtcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZHJhZyhjdHJsOiBSb3VuZENvbnRyb2xsZXIsIGU6IGNnLk1vdWNoRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZS5idXR0b24gIT09IHVuZGVmaW5lZCAmJiBlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuOyAvLyBvbmx5IHRvdWNoIG9yIGxlZnQgY2xpY2tcbiAgICBjb25zdCBlbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50LFxuICAgIHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcm9sZScpIGFzIGNnLlJvbGUsXG4gICAgY29sb3IgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29sb3InKSBhcyBjZy5Db2xvcixcbiAgICBudW1iZXIgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtbmInKTtcbiAgICBpZiAoIXJvbGUgfHwgIWNvbG9yIHx8IG51bWJlciA9PT0gJzAnKSByZXR1cm47XG4gICAgaWYgKGN0cmwuY2xpY2tEcm9wICE9PSB1bmRlZmluZWQgJiYgcm9sZSA9PT0gY3RybC5jbGlja0Ryb3Aucm9sZSkge1xuICAgICAgICBjdHJsLmNsaWNrRHJvcCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5zZWxlY3RTcXVhcmUobnVsbCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTaG93IHBvc3NpYmxlIGRyb3AgZGVzdHMgb24gbXkgdHVybiBvbmx5IG5vdCB0byBtZXNzIHVwIHByZWRyb3BcbiAgICBpZiAoY3RybC50dXJuQ29sb3IgPT09IGN0cmwubXljb2xvcikge1xuICAgICAgICBjb25zdCBkcm9wRGVzdHMgPSB7IFwiYTBcIjogY3RybC5kZXN0c1tyb2xlVG9TYW5bcm9sZV0gKyBcIkBcIl0gfTtcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5uZXdQaWVjZSh7XCJyb2xlXCI6IHJvbGUsIFwiY29sb3JcIjogY29sb3J9LCBcImEwXCIpXG4gICAgICAgIGN0cmwuY2hlc3Nncm91bmQuc2V0KHtcbiAgICAgICAgICAgIHR1cm5Db2xvcjogY29sb3IsXG4gICAgICAgICAgICBtb3ZhYmxlOiB7XG4gICAgICAgICAgICAgICAgZGVzdHM6IGRyb3BEZXN0cyxcbiAgICAgICAgICAgICAgICBzaG93RGVzdHM6IHRydWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5zZWxlY3RTcXVhcmUoXCJhMFwiKTtcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5zZXQoeyBsYXN0TW92ZTogY3RybC5sYXN0bW92ZSB9KTtcbiAgICB9XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZHJhZ05ld1BpZWNlKGN0cmwuY2hlc3Nncm91bmQuc3RhdGUsIHsgY29sb3IsIHJvbGUgfSwgZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkcm9wSXNWYWxpZChkZXN0czogY2cuRGVzdHMsIHJvbGU6IGNnLlJvbGUsIGtleTogY2cuS2V5KTogYm9vbGVhbiB7XG4gICAgLy8gY29uc29sZS5sb2coXCJkcm9wRGVzdHM6XCIsIGRlc3RzLCByb2xlLCBrZXkpXG4gICAgY29uc3QgZHJvcHMgPSBkZXN0c1tyb2xlVG9TYW5bcm9sZV0gKyBcIkBcIl07XG4gICAgLy8gY29uc29sZS5sb2coXCJkcm9wczpcIiwgZHJvcHMpXG5cbiAgICBpZiAoZHJvcHMgPT09IHVuZGVmaW5lZCB8fCBkcm9wcyA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgcmV0dXJuIGRyb3BzLmluZGV4T2Yoa2V5KSAhPT0gLTE7XG59XG5cbi8vIFRPRE86IGFmcmUgMSBtb3ZlIG1hZGUgb25seSAxIHBvY2tldCB1cGRhdGUgbmVlZGVkIGF0IG9uY2UsIG5vIG5lZWQgdG8gdXBkYXRlIGJvdGhcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVQb2NrZXRzKGN0cmw6IFJvdW5kQ29udHJvbGxlciwgdnBvY2tldDAsIHZwb2NrZXQxKTogdm9pZCB7XG4gICAgLy8gdXBkYXRlIHBvY2tldHMgZnJvbSBmZW5cbiAgICBpZiAobmVlZFBvY2tldHMoY3RybC52YXJpYW50KSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGN0cmwuZnVsbGZlbi5zcGxpdChcIiBcIik7XG4gICAgICAgIGNvbnN0IGZlbl9wbGFjZW1lbnQgPSBwYXJ0c1swXTtcbiAgICAgICAgdmFyIHBvY2tldHMgPSBcIlwiO1xuICAgICAgICBjb25zdCBicmFja2V0UG9zID0gZmVuX3BsYWNlbWVudC5pbmRleE9mKFwiW1wiKTtcbiAgICAgICAgaWYgKGJyYWNrZXRQb3MgIT09IC0xKSB7XG4gICAgICAgICAgICBwb2NrZXRzID0gZmVuX3BsYWNlbWVudC5zbGljZShicmFja2V0UG9zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGMgPSBjdHJsLm15Y29sb3JbMF07XG4gICAgICAgIGNvbnN0IG8gPSBjdHJsLm9wcGNvbG9yWzBdO1xuICAgICAgICBjb25zdCByb2xlcyA9IHBvY2tldFJvbGVzKGN0cmwudmFyaWFudCk7XG4gICAgICAgIHZhciBwbyA9IHt9O1xuICAgICAgICB2YXIgcGMgPSB7fTtcbiAgICAgICAgcm9sZXMuZm9yRWFjaChyb2xlID0+IHBjW3JvbGVdID0gbGMocG9ja2V0cywgcm9sZVRvU2FuW3JvbGVdLnRvTG93ZXJDYXNlKCksIGM9PT0oY3RybC52YXJpYW50PT09J3Nob2dpJyA/ICdiJyA6ICd3JykpKTtcbiAgICAgICAgcm9sZXMuZm9yRWFjaChyb2xlID0+IHBvW3JvbGVdID0gbGMocG9ja2V0cywgcm9sZVRvU2FuW3JvbGVdLnRvTG93ZXJDYXNlKCksIG89PT0oY3RybC52YXJpYW50PT09J3Nob2dpJyA/ICdiJyA6ICd3JykpKTtcbiAgICAgICAgaWYgKGN0cmwuZmxpcCkge1xuICAgICAgICAgICAgY3RybC5wb2NrZXRzID0gW3BjLCBwb107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdHJsLnBvY2tldHMgPSBbcG8sIHBjXTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZyhvLGMscG8scGMpXG4gICAgICAgIGN0cmwudnBvY2tldDAgPSBwYXRjaCh2cG9ja2V0MCwgcG9ja2V0VmlldyhjdHJsLCBjdHJsLmZsaXAgPyBjdHJsLm15Y29sb3IgOiBjdHJsLm9wcGNvbG9yLCBcInRvcFwiKSk7XG4gICAgICAgIGN0cmwudnBvY2tldDEgPSBwYXRjaCh2cG9ja2V0MSwgcG9ja2V0VmlldyhjdHJsLCBjdHJsLmZsaXAgPyBjdHJsLm9wcGNvbG9yIDogY3RybC5teWNvbG9yLCBcImJvdHRvbVwiKSk7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgaW5pdCB9IGZyb20gJ3NuYWJiZG9tJztcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuaW1wb3J0IGggZnJvbSAnc25hYmJkb20vaCc7XHJcbmltcG9ydCB7IFZOb2RlIH0gZnJvbSAnc25hYmJkb20vdm5vZGUnO1xyXG5cclxuaW1wb3J0IHsgQ2hlc3Nncm91bmQgfSBmcm9tICdjaGVzc2dyb3VuZHgnO1xyXG5cclxuaW1wb3J0IHsgcmVuZGVyVXNlcm5hbWUgfSBmcm9tICcuL3VzZXInO1xyXG5pbXBvcnQgeyBWQVJJQU5UUyB9IGZyb20gJy4vY2hlc3MnO1xyXG5cclxuLy8gVE9ETzogc2F2ZSBGRU4gYW5kIGxhc3Rtb3ZlIHRvIGRiIGFuZCByZXVzZSB0aGVtIGluIG1pbmlib2FyZHNcclxuXHJcbmZ1bmN0aW9uIHJlbmRlckdhbWVzKG1vZGVsLCBnYW1lcykge1xyXG4gICAgY29uc3QgaGVhZGVyID0gaCgndGhlYWQnLCBbaCgndHInLCBbaCgndGgnLCBtb2RlbFtcInByb2ZpbGVpZFwiXSksIF0pXSk7XHJcbiAgICB2YXIgcm93cyA9IGdhbWVzLm1hcCgoZ2FtZSkgPT4gaChcclxuICAgICAgICAndHInLFxyXG4gICAgICAgIHsgb246IHsgY2xpY2s6ICgpID0+IHsgd2luZG93LmxvY2F0aW9uLmFzc2lnbihtb2RlbFtcImhvbWVcIl0gKyAnLycgKyBnYW1lW1wiX2lkXCJdKTsgfSB9LFxyXG4gICAgICAgIH0sIFtcclxuICAgICAgICBoKCd0ZC5ib2FyZCcsIFtcclxuICAgICAgICAgICAgaCgnc2VsZWN0aW9uLicgKyBWQVJJQU5UU1tnYW1lW1widlwiXV0uYm9hcmQgKyAnLicgKyBWQVJJQU5UU1tnYW1lW1widlwiXV0ucGllY2VzLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYuY2ctd3JhcC4nICsgVkFSSUFOVFNbZ2FtZVtcInZcIl1dLmNnICsgJy5taW5pJywgeyBob29rOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0OiAodm5vZGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgQ2hlc3Nncm91bmQodm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50LCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlczogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aWV3T25seTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZlbjogZ2FtZVtcImZcIl0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZW9tZXRyeTogVkFSSUFOVFNbZ2FtZVtcInZcIl1dLmdlb21cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfX0pLFxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICBdKSxcclxuICAgICAgICBoKCd0ZC5nYW1lcy1pbmZvJywgW1xyXG4gICAgICAgICAgICBoKCdkaXYnLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdpLXZhcmlhbnQnLCB7YXR0cnM6IHtcImRhdGEtaWNvblwiOiBWQVJJQU5UU1tnYW1lW1widlwiXV0uaWNvbn0sIGNsYXNzOiB7XCJpY29uXCI6IHRydWV9fSApLFxyXG4gICAgICAgICAgICAgICAgaCgndGMnLCBnYW1lW1wiYlwiXSArIFwiK1wiICsgZ2FtZVtcImlcIl0gKyBcIiDigKIgQ2FzdWFsIOKAoiBcIiArIGdhbWVbXCJ2XCJdKVxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgaCgnZGl2JywgW1xyXG4gICAgICAgICAgICAgICAgaCgncGxheWVyJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2EudXNlci1saW5rJywge2F0dHJzOiB7aHJlZjogJy9ALycgKyBnYW1lW1widXNcIl1bMF19fSwgZ2FtZVtcInVzXCJdWzBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgndnMnLCAnLScpLFxyXG4gICAgICAgICAgICAgICAgaCgncGxheWVyJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2EudXNlci1saW5rJywge2F0dHJzOiB7aHJlZjogJy9ALycgKyBnYW1lW1widXNcIl1bMV19fSwgZ2FtZVtcInVzXCJdWzFdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgaCgnZGl2JywgZ2FtZVtcImRcIl0pLFxyXG4gICAgICAgIF0pXHJcbiAgICAgICAgXSlcclxuICAgICAgICApO1xyXG4gICAgcmV0dXJuIFtoZWFkZXIsIGgoJ3Rib2R5Jywgcm93cyldO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcHJvZmlsZVZpZXcobW9kZWwpOiBWTm9kZVtdIHtcclxuICAgIHJlbmRlclVzZXJuYW1lKG1vZGVsW1wiaG9tZVwiXSwgbW9kZWxbXCJ1c2VybmFtZVwiXSk7XHJcblxyXG4gICAgdmFyIHhtbGh0dHAgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAgIHZhciB1cmwgPSBtb2RlbFtcImhvbWVcIl0gKyBcIi9hcGkvXCIgKyBtb2RlbFtcInByb2ZpbGVpZFwiXSArXCIvZ2FtZXNcIjtcclxuXHJcbiAgICB4bWxodHRwLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09IDQgJiYgdGhpcy5zdGF0dXMgPT0gMjAwKSB7XHJcbiAgICAgICAgdmFyIG15QXJyID0gSlNPTi5wYXJzZSh0aGlzLnJlc3BvbnNlVGV4dCk7XHJcbiAgICAgICAgbXlGdW5jdGlvbihteUFycik7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgICB4bWxodHRwLm9wZW4oXCJHRVRcIiwgdXJsLCB0cnVlKTtcclxuICAgIHhtbGh0dHAuc2VuZCgpO1xyXG5cclxuICAgIGZ1bmN0aW9uIG15RnVuY3Rpb24oYXJyKSB7XHJcbiAgICAgICAgY29uc3Qgb2xkVk5vZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZXMnKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhhcnIpO1xyXG4gICAgICAgIGlmIChvbGRWTm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ3RhYmxlI2dhbWVzJywgcmVuZGVyR2FtZXMobW9kZWwsIGFycikpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2cobW9kZWwpO1xyXG4gICAgcmV0dXJuIFtoKCdhc2lkZS5zaWRlYmFyLWZpcnN0JyksXHJcbiAgICAgICAgICAgIGgoJ21haW4ubWFpbicsIFtoKCd0YWJsZSNnYW1lcycpXSksXHJcbiAgICAgICAgICAgIGgoJ2FzaWRlLnNpZGViYXItc2Vjb25kJyksXHJcbiAgICAgICAgXTtcclxufVxyXG4iLCJpbXBvcnQgeyBoLCBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuaW1wb3J0IHRvVk5vZGUgZnJvbSAnc25hYmJkb20vdG92bm9kZSc7XHJcblxyXG5pbXBvcnQgeyBrZXkycG9zIH0gZnJvbSAnY2hlc3Nncm91bmR4L3V0aWwnO1xyXG5cclxuaW1wb3J0IHsgaXNQcm9tb3Rpb24sIG1hbmRhdG9yeVByb21vdGlvbiwgcHJvbW90aW9uUm9sZXMsIHJvbGVUb1NhbiB9IGZyb20gJy4vY2hlc3MnO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgbGlzdGVuZXJzXSk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihjdHJsKSB7XHJcblxyXG4gICAgbGV0IHByb21vdGluZzogYW55ID0gZmFsc2U7XHJcbiAgICBsZXQgcm9sZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICBmdW5jdGlvbiBzdGFydChvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kID0gY3RybC5nZXRHcm91bmQoKTtcclxuICAgICAgICBpZiAoaXNQcm9tb3Rpb24oY3RybC52YXJpYW50LCBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLCBvcmlnLCBkZXN0LCBtZXRhKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IGN0cmwubXljb2xvcjtcclxuICAgICAgICAgICAgY29uc3Qgb3JpZW50YXRpb24gPSBncm91bmQuc3RhdGUub3JpZW50YXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmluZ1JvbGUgPSBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLnJvbGU7XHJcbiAgICAgICAgICAgIHJvbGVzID0gcHJvbW90aW9uUm9sZXMoY3RybC52YXJpYW50LCBtb3ZpbmdSb2xlKTtcclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoY3RybC52YXJpYW50KSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKG1hbmRhdG9yeVByb21vdGlvbihtb3ZpbmdSb2xlLCBkZXN0LCBjb2xvcikpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9tb3RlKGdyb3VuZCwgZGVzdCwgJ3AnICsgZ3JvdW5kLnN0YXRlLnBpZWNlc1tkZXN0XS5yb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBjdHJsLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGRyYXdfcHJvbW8oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBwcm9tb3RpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWc6IG9yaWcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc3Q6IGRlc3QsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ21ha3J1ayc6XHJcbiAgICAgICAgICAgICAgICBwcm9tb3RlKGdyb3VuZCwgZGVzdCwgJ21ldCcpO1xyXG4gICAgICAgICAgICAgICAgY3RybC5zZW5kTW92ZShvcmlnLCBkZXN0LCAnbScpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NpdHR1eWluJzpcclxuICAgICAgICAgICAgICAgIHByb21vdGUoZ3JvdW5kLCBkZXN0LCAnZmVyeicpO1xyXG4gICAgICAgICAgICAgICAgY3RybC5zZW5kTW92ZShvcmlnLCBkZXN0LCAnZicpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBkcmF3X3Byb21vKGRlc3QsIGNvbG9yLCBvcmllbnRhdGlvbik7XHJcbiAgICAgICAgICAgICAgICBwcm9tb3RpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgb3JpZzogb3JpZyxcclxuICAgICAgICAgICAgICAgICAgICBkZXN0OiBkZXN0LFxyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gcHJvbW90ZShnLCBrZXksIHJvbGUpIHtcclxuICAgICAgICB2YXIgcGllY2VzID0ge307XHJcbiAgICAgICAgdmFyIHBpZWNlID0gZy5zdGF0ZS5waWVjZXNba2V5XTtcclxuICAgICAgICBpZiAoZy5zdGF0ZS5waWVjZXNba2V5XS5yb2xlID09PSByb2xlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwaWVjZXNba2V5XSA9IHtcclxuICAgICAgICAgICAgICAgIGNvbG9yOiBwaWVjZS5jb2xvcixcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBwcm9tb3RlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBnLnNldFBpZWNlcyhwaWVjZXMpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZHJhd19wcm9tbyhkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pIHtcclxuICAgICAgICB2YXIgY29udGFpbmVyID0gdG9WTm9kZShkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdleHRlbnNpb24nKSBhcyBOb2RlKTtcclxuICAgICAgICBwYXRjaChjb250YWluZXIsIHJlbmRlclByb21vdGlvbihkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X25vX3Byb21vKCkge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uX2Nob2ljZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZXh0ZW5zaW9uJykpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmlzaChyb2xlKSB7XHJcbiAgICAgICAgaWYgKHByb21vdGluZykge1xyXG4gICAgICAgICAgICBkcmF3X25vX3Byb21vKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21vdGVkID0gcHJvbW90ZShjdHJsLmdldEdyb3VuZCgpLCBwcm9tb3RpbmcuZGVzdCwgcm9sZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21vID0gY3RybC52YXJpYW50ID09PSBcInNob2dpXCIgPyBwcm9tb3RlZCA/IFwiK1wiIDogXCJcIiA6IHJvbGVUb1Nhbltyb2xlXS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBpZiAocHJvbW90aW5nLmNhbGxiYWNrKSBwcm9tb3RpbmcuY2FsbGJhY2socHJvbW90aW5nLm9yaWcsIHByb21vdGluZy5kZXN0LCBwcm9tbyk7XHJcbiAgICAgICAgICAgIHByb21vdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsKCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGJpbmQoZXZlbnROYW1lOiBzdHJpbmcsIGY6IChlOiBFdmVudCkgPT4gdm9pZCwgcmVkcmF3KSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaW5zZXJ0KHZub2RlKSB7XHJcbiAgICAgICAgICAgICAgICB2bm9kZS5lbG0uYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGYoZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlZHJhdykgcmVkcmF3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJQcm9tb3Rpb24oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKSB7XHJcbiAgICAgICAgY29uc3QgZGltID0gY3RybC5nZXRHcm91bmQoKS5zdGF0ZS5kaW1lbnNpb25zXHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZGltLmhlaWdodCA9PT0gMTA7XHJcbiAgICAgICAgdmFyIGxlZnQgPSAoZGltLndpZHRoIC0ga2V5MnBvcyhkZXN0LCBmaXJzdFJhbmtJczApWzBdKSAqICgxMDAgLyBkaW0ud2lkdGgpO1xyXG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gXCJ3aGl0ZVwiKSBsZWZ0ID0gKDEwMCAvIGRpbS53aWR0aCkgKiAoZGltLndpZHRoIC0gMSkgLSBsZWZ0O1xyXG4gICAgICAgIHZhciB2ZXJ0aWNhbCA9IGNvbG9yID09PSBvcmllbnRhdGlvbiA/IFwidG9wXCIgOiBcImJvdHRvbVwiO1xyXG4gICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICBcImRpdiNleHRlbnNpb25fY2hvaWNlLlwiICsgdmVydGljYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGhvb2s6IHtcclxuICAgICAgICAgICAgICAgICAgICBpbnNlcnQ6IHZub2RlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWwgPSB2bm9kZS5lbG0gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjYW5jZWwoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICByb2xlcy5tYXAoKHNlcnZlclJvbGUsIGkpID0+IHtcclxuICAgICAgICAgICAgICAgIHZhciB0b3AgPSAoY29sb3IgPT09IG9yaWVudGF0aW9uID8gaSA6IGRpbS5oZWlnaHQgLTEgLSBpKSAqICgxMDAgLyBkaW0uaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICAgICAgICAgIFwic3F1YXJlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhdHRyczogeyBzdHlsZTogXCJ0b3A6IFwiICsgdG9wICsgXCIlO2xlZnQ6IFwiICsgbGVmdCArIFwiJVwiIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvb2s6IGJpbmQoXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5pc2goc2VydmVyUm9sZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZhbHNlKVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgW2goXCJwaWVjZS5cIiArIHNlcnZlclJvbGUgKyBcIi5cIiArIGNvbG9yKV1cclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXJ0LFxyXG4gICAgfTtcclxufVxyXG4iLCIvLyBodHRwOi8vanNmaWRkbGUubmV0L01pc3NvdWxhTG9yZW56by9nZm42b2Izai9cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9vcm5pY2FyL2xpbGEvYmxvYi9tYXN0ZXIvdWkvY29tbW9uL3NyYy9yZXNpemUudHNcblxuaW1wb3J0ICogYXMgY2cgZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcblxuZXhwb3J0IHR5cGUgTW91Y2hFdmVudCA9IE1vdXNlRXZlbnQgJiBUb3VjaEV2ZW50O1xuXG4vL2V4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHJlc2l6ZUhhbmRsZShlbHM6IGNnLkVsZW1lbnRzLCBwcmVmOiBudW1iZXIsIHBseTogbnVtYmVyKSB7XG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiByZXNpemVIYW5kbGUoZWxzOiBjZy5FbGVtZW50cykge1xuXG4vLyAgaWYgKCFwcmVmKSByZXR1cm47XG4gIGlmICh0cnVlKSByZXR1cm47XG5cbiAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjZy1yZXNpemUnKTtcbiAgZWxzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cbiAgY29uc3QgbW91c2Vtb3ZlRXZlbnQgPSAnbW91c2Vtb3ZlJztcbiAgY29uc3QgbW91c2V1cEV2ZW50ID0gJ21vdXNldXAnO1xuXG4gIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChzdGFydDogTW91Y2hFdmVudCkgPT4ge1xuXG4gICAgc3RhcnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGNvbnN0IHN0YXJ0UG9zID0gZXZlbnRQb3NpdGlvbihzdGFydCkhO1xuICAgIGNvbnN0IGluaXRpYWxab29tID0gMTAwOyAgLy9wYXJzZUludChnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpLmdldFByb3BlcnR5VmFsdWUoJy0tem9vbScpKTtcbiAgICBsZXQgem9vbSA9IGluaXRpYWxab29tO1xuLypcbiAgICBjb25zdCBzYXZlWm9vbSA9IHdpbmRvdy5saWNoZXNzLmRlYm91bmNlKCgpID0+IHtcbiAgICAgICQuYWpheCh7IG1ldGhvZDogJ3Bvc3QnLCB1cmw6ICcvcHJlZi96b29tP3Y9JyArICgxMDAgKyB6b29tKSB9KTtcbiAgICB9LCA3MDApO1xuKi9cblxuICAgIGNvbnN0IHNldFpvb20gPSAoem9vbTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNnLXdyYXAnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgaWYgKGVsKSB7XG4vLyAgICAgICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGRpbWVuc2lvbnNbVkFSSUFOVFNbdGhpcy52YXJpYW50XS5nZW9tXS53aWR0aCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDUyIDogNjQpO1xuLy8gICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLmhlaWdodCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDYwIDogNjQpO1xuICAgICAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gcGFyc2VJbnQoIGRvY3VtZW50LmRlZmF1bHRWaWV3IS5nZXRDb21wdXRlZFN0eWxlKCBlbCApLndpZHRoIHx8ICcnLCAxMCk7XG4gICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gcGFyc2VJbnQoZG9jdW1lbnQuZGVmYXVsdFZpZXchLmdldENvbXB1dGVkU3R5bGUoIGVsICkuaGVpZ2h0IHx8ICcnLCAxMCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhiYXNlV2lkdGgsIGJhc2VIZWlnaHQsIHpvb20pO1xuICAgICAgICAgICAgY29uc3QgcHh3ID0gYCR7em9vbSAvIDEwMCAqIGJhc2VXaWR0aH1weGA7XG4gICAgICAgICAgICBjb25zdCBweGggPSBgJHt6b29tIC8gMTAwICogYmFzZUhlaWdodH1weGA7XG4gICAgICAgICAgICBlbC5zdHlsZS53aWR0aCA9IHB4dztcbiAgICAgICAgICAgIGVsLnN0eWxlLmhlaWdodCA9IHB4aDtcbiAgICAgICAgICAgIGNvbnN0IGV2ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XG4gICAgICAgICAgICBldi5pbml0RXZlbnQoJ2NoZXNzZ3JvdW5kLnJlc2l6ZScsIGZhbHNlLCBmYWxzZSk7XG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmRpc3BhdGNoRXZlbnQoZXYpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzaXplID0gKG1vdmU6IE1vdWNoRXZlbnQpID0+IHtcblxuICAgICAgY29uc3QgcG9zID0gZXZlbnRQb3NpdGlvbihtb3ZlKSE7XG4gICAgICBjb25zdCBkZWx0YSA9IHBvc1swXSAtIHN0YXJ0UG9zWzBdICsgcG9zWzFdIC0gc3RhcnRQb3NbMV07XG5cbiAgICAgIHpvb20gPSBNYXRoLnJvdW5kKE1hdGgubWluKDE1MCwgTWF0aC5tYXgoMCwgaW5pdGlhbFpvb20gKyBkZWx0YSAvIDEwKSkpO1xuXG4vLyAgICAgIGRvY3VtZW50LmJvZHkuc2V0QXR0cmlidXRlKCdzdHlsZScsICctLXpvb206JyArIHpvb20pO1xuLy8gICAgICB3aW5kb3cubGljaGVzcy5kaXNwYXRjaEV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpO1xuICAgICAgc2V0Wm9vbSh6b29tKTtcbi8vICAgICAgc2F2ZVpvb20oKTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdyZXNpemluZycpO1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihtb3VzZW1vdmVFdmVudCwgcmVzaXplKTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIobW91c2V1cEV2ZW50LCAoKSA9PiB7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKG1vdXNlbW92ZUV2ZW50LCByZXNpemUpO1xuICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH0sIHsgb25jZTogdHJ1ZSB9KTtcbiAgfSk7XG4vKlxuICBpZiAocHJlZiA9PSAxKSB7XG4gICAgY29uc3QgdG9nZ2xlID0gKHBseTogbnVtYmVyKSA9PiBlbC5jbGFzc0xpc3QudG9nZ2xlKCdub25lJywgcGx5ID49IDIpO1xuICAgIHRvZ2dsZShwbHkpO1xuICAgIHdpbmRvdy5saWNoZXNzLnB1YnN1Yi5vbigncGx5JywgdG9nZ2xlKTtcbiAgfVxuXG4gIGFkZE5hZyhlbCk7XG4qL1xufVxuXG5mdW5jdGlvbiBldmVudFBvc2l0aW9uKGU6IE1vdWNoRXZlbnQpOiBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkIHtcbiAgaWYgKGUuY2xpZW50WCB8fCBlLmNsaWVudFggPT09IDApIHJldHVybiBbZS5jbGllbnRYLCBlLmNsaWVudFldO1xuICBpZiAoZS50b3VjaGVzICYmIGUudGFyZ2V0VG91Y2hlc1swXSkgcmV0dXJuIFtlLnRhcmdldFRvdWNoZXNbMF0uY2xpZW50WCwgZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFldO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuLypcbmZ1bmN0aW9uIGFkZE5hZyhlbDogSFRNTEVsZW1lbnQpIHtcblxuICBjb25zdCBzdG9yYWdlID0gd2luZG93LmxpY2hlc3Muc3RvcmFnZS5tYWtlQm9vbGVhbigncmVzaXplLW5hZycpO1xuICBpZiAoc3RvcmFnZS5nZXQoKSkgcmV0dXJuO1xuXG4gIHdpbmRvdy5saWNoZXNzLmxvYWRDc3NQYXRoKCduYWctY2lyY2xlJyk7XG4gIGVsLnRpdGxlID0gJ0RyYWcgdG8gcmVzaXplJztcbiAgZWwuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9XCJuYWctY2lyY2xlXCI+PC9kaXY+JztcbiAgZWwuYWRkRXZlbnRMaXN0ZW5lcih3aW5kb3cubGljaGVzcy5tb3VzZWRvd25FdmVudCwgKCkgPT4ge1xuICAgIHN0b3JhZ2Uuc2V0KHRydWUpO1xuICAgIGVsLmlubmVySFRNTCA9ICcnO1xuICB9LCB7IG9uY2U6IHRydWUgfSk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiBzdG9yYWdlLnNldCh0cnVlKSwgMTUwMDApO1xufVxuKi8iLCJpbXBvcnQgeyBoIH0gZnJvbSBcInNuYWJiZG9tXCI7XHJcbmltcG9ydCB7IFZOb2RlIH0gZnJvbSAnc25hYmJkb20vdm5vZGUnO1xyXG5pbXBvcnQgUm91bmRDb250cm9sbGVyIGZyb20gJy4vY3RybCc7XHJcbmltcG9ydCB7IFZBUklBTlRTIH0gZnJvbSAnLi9jaGVzcyc7XHJcblxyXG5cclxuZnVuY3Rpb24gcnVuR3JvdW5kKHZub2RlOiBWTm9kZSwgbW9kZWwpIHtcclxuICAgIGNvbnN0IGVsID0gdm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgY29uc3QgY3RybCA9IG5ldyBSb3VuZENvbnRyb2xsZXIoZWwsIG1vZGVsKTtcclxuICAgIGNvbnN0IGNnID0gY3RybC5jaGVzc2dyb3VuZDtcclxuICAgIHdpbmRvd1snY2cnXSA9IGNnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcm91bmRWaWV3KG1vZGVsKTogVk5vZGVbXSB7XHJcbiAgICB2YXIgcGxheWVyVG9wLCBwbGF5ZXJCb3R0b20sIGRhdGFJY29uO1xyXG4gICAgZGF0YUljb24gPSBWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLmljb247XHJcbiAgICBpZiAobW9kZWxbXCJ1c2VybmFtZVwiXSAhPT0gbW9kZWxbXCJ3cGxheWVyXCJdICYmIG1vZGVsW1widXNlcm5hbWVcIl0gIT09IG1vZGVsW1wiYnBsYXllclwiXSkge1xyXG4gICAgICAgIC8vIHNwZWN0YXRvciBnYW1lIHZpZXdcclxuICAgICAgICBwbGF5ZXJUb3AgPSBtb2RlbFtcInZhcmlhbnRcIl0gPT09ICdzaG9naScgPyBtb2RlbFtcIndwbGF5ZXJcIl0gOiBtb2RlbFtcImJwbGF5ZXJcIl07XHJcbiAgICAgICAgcGxheWVyQm90dG9tID0gbW9kZWxbXCJ2YXJpYW50XCJdID09PSAnc2hvZ2knID8gbW9kZWxbXCJicGxheWVyXCJdIDogbW9kZWxbXCJ3cGxheWVyXCJdO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBwbGF5ZXJUb3AgPSBtb2RlbFtcInVzZXJuYW1lXCJdID09PSBtb2RlbFtcIndwbGF5ZXJcIl0gPyBtb2RlbFtcImJwbGF5ZXJcIl0gOiBtb2RlbFtcIndwbGF5ZXJcIl07XHJcbiAgICAgICAgcGxheWVyQm90dG9tID0gbW9kZWxbXCJ1c2VybmFtZVwiXTtcclxuICAgIH1cclxuICAgIHJldHVybiBbaCgnYXNpZGUuc2lkZWJhci1maXJzdCcsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2Rpdi5nYW1lLWluZm8nLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2JywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdpLXZhcmlhbnQnLCB7YXR0cnM6IHtcImRhdGEtaWNvblwiOiBkYXRhSWNvbn0sIGNsYXNzOiB7XCJpY29uXCI6IHRydWV9fSApLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCd0YycsIG1vZGVsW1wiYmFzZVwiXSArIFwiK1wiICsgbW9kZWxbXCJpbmNcIl0gKyBcIiDigKIgQ2FzdWFsIOKAoiBcIiArIG1vZGVsW1widmFyaWFudFwiXSlcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2ktc2lkZScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24td2hpdGVcIjogdHJ1ZX0gfSApLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdwbGF5ZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdhLnVzZXItbGluaycsIHthdHRyczoge2hyZWY6ICcvQC8nICsgbW9kZWxbXCJ3cGxheWVyXCJdfX0sIG1vZGVsW1wid3BsYXllclwiXSksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdyYXRpbmcnLCBcIiAoMTUwMD8pXCIpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2ktc2lkZScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tYmxhY2tcIjogdHJ1ZX0gfSApLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdwbGF5ZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdhLnVzZXItbGluaycsIHthdHRyczoge2hyZWY6ICcvQC8nICsgbW9kZWxbXCJicGxheWVyXCJdfX0sIG1vZGVsW1wiYnBsYXllclwiXSksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdyYXRpbmcnLCBcIiAoMTUwMD8pXCIpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2LnJvdW5kY2hhdCNyb3VuZGNoYXQnKSxcclxuICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIGgoJ21haW4ubWFpbicsIFtcclxuICAgICAgICAgICAgICAgIGgoJ3NlbGVjdGlvbi4nICsgVkFSSUFOVFNbbW9kZWxbXCJ2YXJpYW50XCJdXS5ib2FyZCArICcuJyArIFZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0ucGllY2VzLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2LmNnLXdyYXAuJyArIFZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0uY2csXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgaG9vazogeyBpbnNlcnQ6ICh2bm9kZSkgPT4gcnVuR3JvdW5kKHZub2RlLCBtb2RlbCl9LFxyXG4gICAgICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBoKCdhc2lkZS5zaWRlYmFyLXNlY29uZCcsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiNwb2NrZXQtd3JhcHBlcicsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYuJyArIFZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0ucGllY2VzLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2Rpdi5jZy13cmFwLnBvY2tldCcsIFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNwb2NrZXQwJyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjY2xvY2swJyksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYucm91bmQtZGF0YScsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYucGxheWVyLWRhdGEnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IGZhbHNlLCBcImljb24tb2ZmbGluZVwiOiB0cnVlfX0pLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdwbGF5ZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdhLnVzZXItbGluaycsIHthdHRyczoge2hyZWY6ICcvQC8nICsgcGxheWVyVG9wfX0sIHBsYXllclRvcCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdyYXRpbmcnLCBcIjE1MDA/XCIpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYjbW92ZS1jb250cm9scycpLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNtb3ZlbGlzdCcpLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNhZnRlci1nYW1lJyksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2I2dhbWUtY29udHJvbHMnKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYucGxheWVyLWRhdGEnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2ktc2lkZS5vbmxpbmUjYm90dG9tLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IGZhbHNlLCBcImljb24tb2ZmbGluZVwiOiB0cnVlfX0pLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdwbGF5ZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdhLnVzZXItbGluaycsIHthdHRyczoge2hyZWY6ICcvQC8nICsgcGxheWVyQm90dG9tfX0sIHBsYXllckJvdHRvbSksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdyYXRpbmcnLCBcIjE1MDA/XCIpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I2Nsb2NrMScpLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I3BvY2tldC13cmFwcGVyJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2Rpdi4nICsgVkFSSUFOVFNbbW9kZWxbXCJ2YXJpYW50XCJdXS5waWVjZXMsIFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaCgnZGl2LmNnLXdyYXAucG9ja2V0JywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaCgnZGl2I3BvY2tldDEnKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiNmbGlwJyksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBoKCd1bmRlci1sZWZ0JywgXCJTcGVjdGF0b3JzXCIpLFxyXG4gICAgICAgICAgICBoKCd1bmRlci1ib2FyZCcsIFtoKCdkaXYuI3VuZGVyLWJvYXJkJyldKSxcclxuICAgICAgICAgICAgaCgndW5kZXItcmlnaHQnLCBbaCgnZGl2I3pvb20nKV0pLFxyXG4gICAgICAgIF07XHJcbn1cclxuIiwiY2xhc3Mgc291bmRzIHtcclxuICAgIHRyYWNrcztcclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMudHJhY2tzID0ge1xyXG4gICAgICAgICAgICBHZW5lcmljTm90aWZ5OiB7IG5hbWU6ICdHZW5lcmljTm90aWZ5JywgcXR5IDogMSwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBNb3ZlOiB7IG5hbWU6ICdNb3ZlJywgcXR5IDogOCwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBDYXB0dXJlOiB7IG5hbWU6ICdDYXB0dXJlJywgcXR5IDogNCwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBDaGVjazogeyBuYW1lOiAnQ2hlY2snLCBxdHkgOiAyLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIERyYXc6IHsgbmFtZTogJ0RyYXcnLCBxdHkgOiAxLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIFZpY3Rvcnk6IHsgbmFtZTogJ1ZpY3RvcnknLCBxdHkgOiAxLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIERlZmVhdDogeyBuYW1lOiAnRGVmZWF0JywgcXR5IDogMSwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBTaG9naU1vdmU6IHsgbmFtZTogJ2tvbWFvdG81JywgcXR5IDogOCwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy50cmFja3MpLmZvckVhY2goa2V5ID0+IHtcclxuICAgICAgICAgICAgbGV0IHR5cGUgPSB0aGlzLnRyYWNrc1trZXldO1xyXG4gICAgICAgICAgICB0eXBlLnBvb2wgPSB0aGlzLmJ1aWxkTWFueVNvdW5kcyh0eXBlLm5hbWUsIHR5cGUucXR5KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGJ1aWxkTWFueVNvdW5kcyA9IChmaWxlLCBxdHkpID0+IHtcclxuICAgICAgICB2YXIgc291bmRBcnJheTogSFRNTEF1ZGlvRWxlbWVudFtdID0gW107XHJcbiAgICAgICAgd2hpbGUgKHNvdW5kQXJyYXkubGVuZ3RoIDwgcXR5KSB7XHJcbiAgICAgICAgICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhdWRpb1wiKTtcclxuICAgICAgICAgICAgaWYgKGVsLmNhblBsYXlUeXBlKCdhdWRpby9tcGVnJykpIHtcclxuICAgICAgICAgICAgICAgIGVsLnNyYyA9ICcvc3RhdGljL3NvdW5kLycgKyBmaWxlICsgJy5tcDMnO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZWwuc3JjID0gJy9zdGF0aWMvc291bmQvJyArIGZpbGUgKyAnLm9nZyc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWwuc2V0QXR0cmlidXRlKFwicHJlbG9hZFwiLCBcImF1dG9cIik7XHJcbiAgICAgICAgICAgIGVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICAgICAgc291bmRBcnJheS5wdXNoKGVsKTtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBzb3VuZEFycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0U291bmQgPSAodHlwZSkgPT4ge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLnRyYWNrc1t0eXBlXTtcclxuICAgICAgICB0YXJnZXQuaW5kZXggPSAodGFyZ2V0LmluZGV4ICsgMSkgJSB0YXJnZXQucG9vbC5sZW5ndGg7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJTT1VORDpcIiwgdHlwZSwgdGFyZ2V0LmluZGV4KTtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0LnBvb2xbdGFyZ2V0LmluZGV4XTtcclxuICAgIH1cclxuXHJcbiAgICBnZW5lcmljTm90aWZ5KCkgeyB0aGlzLmdldFNvdW5kKCdHZW5lcmljTm90aWZ5JykucGxheSgpOyB9O1xyXG4gICAgbW92ZSgpIHsgdGhpcy5nZXRTb3VuZCgnTW92ZScpLnBsYXkoKTsgfTtcclxuICAgIGNhcHR1cmUoKSB7IHRoaXMuZ2V0U291bmQoJ0NhcHR1cmUnKS5wbGF5KCk7IH07XHJcbiAgICBjaGVjaygpIHsgdGhpcy5nZXRTb3VuZCgnQ2hlY2snKS5wbGF5KCk7IH07XHJcbiAgICBkcmF3KCkgeyB0aGlzLmdldFNvdW5kKCdEcmF3JykucGxheSgpOyB9O1xyXG4gICAgdmljdG9yeSgpIHsgdGhpcy5nZXRTb3VuZCgnVmljdG9yeScpLnBsYXkoKTsgfTtcclxuICAgIGRlZmVhdCgpIHsgdGhpcy5nZXRTb3VuZCgnRGVmZWF0JykucGxheSgpOyB9O1xyXG4gICAgc2hvZ2ltb3ZlKCkgeyB0aGlzLmdldFNvdW5kKCdTaG9naU1vdmUnKS5wbGF5KCk7IH07XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBzb3VuZCA9IG5ldyhzb3VuZHMpO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNoYW5nZUNTUyhjc3NGaWxlKSB7XHJcbiAgICAvLyBjc3MgZmlsZSBpbmRleCBpbiB0ZW1wbGF0ZS5odG1sXHJcbiAgICB2YXIgY3NzTGlua0luZGV4ID0gMTtcclxuICAgIGlmIChjc3NGaWxlLmluY2x1ZGVzKFwieGlhbmdxaVwiKSkge1xyXG4gICAgICAgIGNzc0xpbmtJbmRleCA9IDM7XHJcbiAgICB9IGVsc2UgaWYgKGNzc0ZpbGUuaW5jbHVkZXMoXCJzaG9naVwiKSkge1xyXG4gICAgICAgIGNzc0xpbmtJbmRleCA9IDI7XHJcbiAgICB9XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcImxpbmtcIikuaXRlbShjc3NMaW5rSW5kZXgpIS5zZXRBdHRyaWJ1dGUoXCJocmVmXCIsIGNzc0ZpbGUpO1xyXG59XHJcbiIsImltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxuaW1wb3J0IGggZnJvbSAnc25hYmJkb20vaCc7XG5cbi8vIFRPRE86IGNyZWF0ZSBsb2dvdXQgYnV0dG9uIHdoZW4gbG9nZ2VkIGluXG4vKlxuZnVuY3Rpb24gbG9naW4oaG9tZSkge1xuICAgIGNvbnNvbGUubG9nKFwiTE9HSU4gV0lUSCBMSUNIRVNTXCIpO1xuICAgIHdpbmRvdy5sb2NhdGlvbi5hc3NpZ24oaG9tZSArICcvbG9naW4nKTtcbn07XG4qL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclVzZXJuYW1lKGhvbWUsIHVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coXCJyZW5kZXJVc2VybmFtZSgpXCIsIHVzZXJuYW1lLCBob21lKTtcbiAgICB2YXIgb2xkVk5vZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndXNlcm5hbWUnKTtcbiAgICBpZiAob2xkVk5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgIG9sZFZOb2RlLmlubmVySFRNTCA9ICcnO1xuICAgICAgICBwYXRjaChvbGRWTm9kZSBhcyBIVE1MRWxlbWVudCwgaCgnZGl2I3VzZXJuYW1lJywgaCgnYS5uYXYtbGluaycsIHthdHRyczoge2hyZWY6ICcvQC8nICsgdXNlcm5hbWV9fSwgdXNlcm5hbWUpKSk7XG4gICAgfTtcbi8qXG4gICAgLy8gaWYgdXNlcm5hbWUgaXMgbm90IGEgbG9nZ2VkIGluIG5hbWUgbG9naW4gZWxzZSBsb2dvdXQgYnV0dG9uXG4gICAgdmFyIG9sZFZOb2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ2luJyk7XG4gICAgaWYgKG9sZFZOb2RlIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICBvbGRWTm9kZS5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ2J1dHRvbicsIHsgb246IHsgY2xpY2s6ICgpID0+IGxvZ2luKGhvbWUpIH0sIHByb3BzOiB7dGl0bGU6ICdMb2dpbiB3aXRoIExpY2hlc3MnfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tc2lnbi1pblwiOiB0cnVlfSB9ICksIF0pKTtcbiAgICB9O1xuKi9cbn1cbiJdfQ==
