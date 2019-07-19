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
    return (x1, y1, x2, y2) => (met(x1, y1, x2, y2) || (x1 === x2 && color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1));
}
function gold(color) {
    return (x1, y1, x2, y2) => (diff(x1, x2) < 2 && diff(y1, y2) < 2 && (color === 'white' ?
        !((x2 === x1 - 1 && y2 === y1 - 1) || (x2 === x1 + 1 && y2 === y1 - 1)) :
        !((x2 === x1 + 1 && y2 === y1 + 1) || (x2 === x1 - 1 && y2 === y1 + 1))));
}
function spawn(color) {
    return (x1, y1, x2, y2) => (x2 === x1 && color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1);
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
    return (x1, y1, x2, y2) => (x2 === x1 && color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1);
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
    sittuyin: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "gridx", pieces: "makruk", css: ["sittuyin"], icon: "R" },
    shogi: { geom: 1 /* dim9x9 */, cg: "cg-576", board: "grid9x9", pieces: "shogi", css: ["shogi0", "shogi0w", "shogi0p"], icon: "K" },
    xiangqi: { geom: 3 /* dim9x10 */, cg: "cg-576-640", board: "river", pieces: "xiangqi", css: ["xiangqi", "xiangqie", "xiangqict"], icon: "O" },
    placement: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["standard"], icon: "S" },
    crazyhouse: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["standard"], icon: "H" },
    capablanca: { geom: 2 /* dim10x8 */, cg: "cg-640", board: "capablanca", pieces: "merida", css: ["capablanca"], icon: "P" },
    seirawan: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: ["seirawan"], icon: "L" },
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
    constructor(el, model, handler) {
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
                const ev = document.createEvent('Event');
                ev.initEvent('chessground.resize', false, false);
                document.body.dispatchEvent(ev);
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
        this.onMsgAcceptSeek = (msg) => {
            console.log("GameController.onMsgAcceptSeek()", this.model["gameId"]);
            // this.evtHandler({ type: ACCEPT });
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
                if (capture) {
                    sound_1.sound.capture();
                }
                else {
                    sound_1.sound.move();
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
                if (capturedPiece) {
                    sound_1.sound.capture();
                }
                else {
                    sound_1.sound.move();
                }
            };
        };
        this.onDrop = () => {
            return (piece, dest) => {
                // console.log("ground.onDrop()", piece, dest);
                if (dest != "a0" && piece.role) {
                    sound_1.sound.move();
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
                const diff = {};
                diff[dest] = undefined;
                this.chessground.setPieces(diff);
                console.log("!!! invalid move !!!", role, dest);
                // restore lastMove set by invalid drop
                this.chessground.set({
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
                console.log("   ground.onSelect()", key, selected);
                // If drop selection was set dropDests we have to restore dests here
                if (this.chessground.state.movable.dests === undefined)
                    return;
                if (key != "a0" && "a0" in this.chessground.state.movable.dests) {
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
                case "accept_seek":
                    this.onMsgAcceptSeek(msg);
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
        this.evtHandler = handler;
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
        if (this.tv) {
            window.history.pushState({}, document.title, "/tv");
        }
        else {
            window.history.pushState({}, document.title, "/" + this.model["gameId"]);
        }
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

},{"./chat":31,"./chess":32,"./clock":33,"./gating":35,"./movelist":38,"./pocket":39,"./promotion":40,"./resize":41,"./sound":44,"./user":45,"chessgroundx":4,"chessgroundx/types":16,"chessgroundx/util":17,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25,"sockette":30}],35:[function(require,module,exports){
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
const site_1 = __importDefault(require("./site"));
exports.ADD = Symbol('Add');
exports.DELETE = Symbol('Delete');
exports.UPDATE = Symbol('Update');
exports.RESET = Symbol('Reset');
class LobbyController {
    constructor(el, model, handler) {
        this.onMsgGetSeeks = (msg) => {
            this.seeks = msg.seeks;
            // console.log("!!!! got get_seeks msg:", msg);
            const oldVNode = document.getElementById('seeks');
            if (oldVNode instanceof Element) {
                oldVNode.innerHTML = '';
                patch(oldVNode, h_1.default('table#seeks', this.renderSeeks(msg.seeks)));
            }
        };
        this.onMsgAcceptSeek = (msg) => {
            this.model["gameId"] = msg["gameId"];
            this.model["variant"] = msg["variant"];
            this.model["wplayer"] = msg["wplayer"];
            this.model["bplayer"] = msg["bplayer"];
            this.model["fen"] = msg["fen"];
            this.model["base"] = msg["base"];
            this.model["inc"] = msg["inc"];
            // console.log("LobbyController.onMsgAcceptSeek()", this.model["gameId"])
            this.evtHandler({ type: site_1.default });
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
        this.evtHandler = handler;
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
            return seek.variant === variant && seek.fen === fen && seek.color === color && seek.tc === minutes + "+" + increment;
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
        // TODO: save/restore selected values
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
            case "accept_seek":
                this.onMsgAcceptSeek(msg);
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
function runSeeks(vnode, model, handler) {
    const el = vnode.elm;
    const ctrl = new LobbyController(el, model, handler);
    console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}
function lobbyView(model, handler) {
    // console.log(".......lobbyView(model, handler)", model, handler);
    // Get the modal
    const modal = document.getElementById('id01');
    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };
    return [h_1.default('aside.sidebar-first', [h_1.default('div.lobbychat#lobbychat')]),
        h_1.default('main.main', [h_1.default('table#seeks', { hook: { insert: (vnode) => runSeeks(vnode, model, handler) } })]),
        h_1.default('aside.sidebar-second', [h_1.default('ul#seekbuttons')]),
        h_1.default('under-left', "# of users"),
        h_1.default('under-lobby'),
        h_1.default('under-right'),
    ];
}
exports.lobbyView = lobbyView;

},{"./chat":31,"./chess":32,"./site":43,"./user":45,"snabbdom":26,"snabbdom/h":19,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25,"sockette":30}],37:[function(require,module,exports){
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
const site_1 = __importDefault(require("./site"));
function main(initState, oldVnode, { view, update }) {
    // console.log(initState, oldVnode);
    const newVnode = view(initState, e => {
        const newState = update(initState, e);
        main(newState, newVnode, { view, update });
    });
    patch(oldVnode, newVnode);
}
main(site_1.default.init(), document.getElementById('placeholder'), site_1.default);

},{"./site":43,"snabbdom":26,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/modules/props":25}],38:[function(require,module,exports){
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
    // Show possible drop dests on my turn only not to mess up predrop
    if (ctrl.turnColor === ctrl.mycolor) {
        const dropDests = { "a0": ctrl.dests[chess_1.roleToSan[role] + "@"] };
        ctrl.chessground.newPiece({ "role": "pawn", "color": color }, "a0");
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

},{"./chess":32,"chessgroundx/util":17,"snabbdom":26,"snabbdom/modules/attributes":22,"snabbdom/modules/class":23,"snabbdom/modules/eventlisteners":24,"snabbdom/tovnode":28}],41:[function(require,module,exports){
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

},{}],42:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snabbdom_1 = require("snabbdom");
const ctrl_1 = __importDefault(require("./ctrl"));
const chess_1 = require("./chess");
function runGround(vnode, model, handler) {
    const el = vnode.elm;
    const ctrl = new ctrl_1.default(el, model, handler);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}
function roundView(model, handler) {
    // console.log(".......roundView(model, handler)", model, handler);
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
                snabbdom_1.h('div', [snabbdom_1.h('i-variant', { attrs: { "data-icon": dataIcon }, class: { "icon": true } }), snabbdom_1.h('tc', model["base"] + "+" + model["inc"] + " • Casual • " + model["variant"])]),
                snabbdom_1.h('div', [snabbdom_1.h('i-side', { class: { "icon": true, "icon-white": true } }), snabbdom_1.h('player', model["wplayer"] + " (1500?)")]),
                snabbdom_1.h('div', [snabbdom_1.h('i-side', { class: { "icon": true, "icon-black": true } }), snabbdom_1.h('player', model["bplayer"] + " (1500?)")]),
            ]),
            snabbdom_1.h('div.roundchat#roundchat')
        ]),
        snabbdom_1.h('main.main', [
            snabbdom_1.h(`selection.${chess_1.VARIANTS[model["variant"]].board}.${chess_1.VARIANTS[model["variant"]].pieces}`, [
                snabbdom_1.h(`div.cg-wrap.${chess_1.VARIANTS[model["variant"]].cg}`, { hook: { insert: (vnode) => runGround(vnode, model, handler) },
                }),
            ]),
        ]),
        snabbdom_1.h('aside.sidebar-second', [
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h(`div.${chess_1.VARIANTS[model["variant"]].pieces}`, [
                    snabbdom_1.h('div.cg-wrap.pocket', [
                        snabbdom_1.h('div#pocket0'),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#clock0'),
            snabbdom_1.h('div.round-data', [
                snabbdom_1.h('div.player-data', [snabbdom_1.h('i-side.online#top-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }), snabbdom_1.h('player', playerTop), snabbdom_1.h('rating', "1500?")]),
                snabbdom_1.h('div#move-controls'),
                snabbdom_1.h('div#movelist'),
                snabbdom_1.h('div#after-game'),
                snabbdom_1.h('div#game-controls'),
                snabbdom_1.h('div.player-data', [snabbdom_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }), snabbdom_1.h('player', playerBottom), snabbdom_1.h('rating', "1500?")]),
            ]),
            snabbdom_1.h('div#clock1'),
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h(`div.${chess_1.VARIANTS[model["variant"]].pieces}`, [
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

},{"./chess":32,"./ctrl":34,"snabbdom":26}],43:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const h_1 = __importDefault(require("snabbdom/h"));
const lobby_1 = require("./lobby");
const round_1 = require("./round");
exports.ACCEPT = Symbol("Accept");
exports.BACK = Symbol('Back');
// model : {home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", base: "", inc: "", seeks: [seek], tv: "", status: ""}
var getCookie = function (name) {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; ++i) {
        var pair = cookies[i].trim().split('=');
        if (pair[0] == name)
            return pair[1];
    }
    return "";
};
function view(model, handler) {
    // console.log("site.view() model=", model)
    // http://stackoverflow.com/questions/1397329/how-to-remove-the-hash-from-window-location-with-javascript-without-page-refresh/5298684#5298684
    console.log("site.ts document.title=", document.title);
    console.log("site.ts window.location=", window.location);
    window.history.pushState({}, document.title, "/");
    const user = getCookie("user");
    if (user !== "")
        model["username"] = user;
    var el = document.getElementById('pychess-variants');
    if (el instanceof Element && el.hasAttribute("data-home")) {
        model["home"] = el.getAttribute("data-home");
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
    }
    return h_1.default('div#placeholder.main-wrapper', model.variant ? round_1.roundView(model, handler) : lobby_1.lobbyView(model, handler));
}
exports.view = view;
function init() {
    return { home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "", status: "" };
}
function update(model, action) {
    return action.type === exports.ACCEPT ?
        { home: model["home"], username: model["username"], variant: model["variant"], gameId: model["gameId"], wplayer: model["wplayer"], bplayer: model["bplayer"], fen: model["fen"], base: model["base"], inc: model["inc"], seeks: [], tv: model["tv"], status: model["status"] }
        : action.type === exports.BACK ?
            { home: model["home"], username: model["username"], variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "", status: "" }
            : model;
}
exports.default = { view, init, update, actions: { ACCEPT: exports.ACCEPT, BACK: exports.BACK } };

},{"./lobby":36,"./round":42,"snabbdom/h":19}],44:[function(require,module,exports){
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
}
exports.sound = new (sounds);
function changeCSS(cssFile) {
    // css file index in template.html
    const cssLinkIndex = 1;
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
        patch(oldVNode, h_1.default('div#username', username));
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FuaW0uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FwaS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvYm9hcmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2NoZXNzZ3JvdW5kLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9jb25maWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYXcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2Ryb3AuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2V2ZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvZXhwbG9zaW9uLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9mZW4uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3ByZW1vdmUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3JlbmRlci5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvc3RhdGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3N2Zy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvdHlwZXMuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3V0aWwuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3dyYXAuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vaC5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9odG1sZG9tYXBpLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL2lzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL2NsYXNzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vbW9kdWxlcy9wcm9wcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9zbmFiYmRvbS5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90aHVuay5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90b3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NvY2tldHRlL2Rpc3Qvc29ja2V0dGUuanMiLCJzcmMvY2hhdC50cyIsInNyYy9jaGVzcy50cyIsInNyYy9jbG9jay50cyIsInNyYy9jdHJsLnRzIiwic3JjL2dhdGluZy50cyIsInNyYy9sb2JieS50cyIsInNyYy9tYWluLnRzIiwic3JjL21vdmVsaXN0LnRzIiwic3JjL3BvY2tldC50cyIsInNyYy9wcm9tb3Rpb24udHMiLCJzcmMvcmVzaXplLnRzIiwic3JjL3JvdW5kLnRzIiwic3JjL3NpdGUudHMiLCJzcmMvc291bmQudHMiLCJzcmMvdXNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3hEQSx1Q0FBZ0M7QUFDaEMsbUVBQTJDO0FBQzNDLDZFQUFxRDtBQUNyRCxtRUFBZ0Q7QUFDaEQscUZBQXdEO0FBRXhELE1BQU0sS0FBSyxHQUFHLGVBQUksQ0FBQyxDQUFDLGVBQUssRUFBRSxvQkFBVSxFQUFFLGVBQVUsRUFBRSx3QkFBUyxDQUFDLENBQUMsQ0FBQztBQUUvRCxtREFBMkI7QUFFM0IsU0FBZ0IsUUFBUSxDQUFFLElBQUksRUFBRSxRQUFRO0lBQ3BDLFNBQVMsVUFBVSxDQUFFLENBQUM7UUFDbEIsTUFBTSxPQUFPLEdBQUksQ0FBQyxDQUFDLE1BQTJCLENBQUMsS0FBSyxDQUFBO1FBQ3BELElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLEVBQUUsSUFBSSxDQUFDLENB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QyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO0tBQzdEO1NBQU07UUFDSCxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUE7UUFDMUQsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO1FBQzFELEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQTtRQUMxRCxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUE7S0FDN0Q7SUFDRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQWJELDBCQWFDO0FBRVksUUFBQSxTQUFTLEdBQUc7SUFDckIsSUFBSSxFQUFFLEdBQUc7SUFDVCxNQUFNLEVBQUUsR0FBRztJQUNYLE1BQU0sRUFBRSxHQUFHO0lBQ1gsSUFBSSxFQUFFLEdBQUc7SUFDVCxLQUFLLEVBQUUsR0FBRztJQUNWLElBQUksRUFBRSxHQUFHO0lBQ1QsVUFBVSxFQUFFLEdBQUc7SUFDZixTQUFTLEVBQUUsR0FBRztJQUNkLFFBQVEsRUFBRSxHQUFHO0lBQ2IsSUFBSSxFQUFFLEdBQUc7SUFDVCxJQUFJLEVBQUUsR0FBRztJQUNULEdBQUcsRUFBRSxHQUFHO0lBQ1IsSUFBSSxFQUFFLEdBQUc7SUFDVCxNQUFNLEVBQUUsR0FBRztJQUNYLEtBQUss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QyxDQUFDLGlCQUFpQixFQUFFO2dDQUNqQixXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQztnQ0FDaEgsV0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUMsR0FBRyxFQUFFLEtBQUssRUFBQyxFQUFFLEVBQUUsR0FBRyxDQUFDO2dDQUNyRCxXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQztnQ0FDaEgsV0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUMsR0FBRyxFQUFFLEtBQUssRUFBQyxFQUFFLEVBQUUsR0FBRyxDQUFDO2dDQUNyRCxXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQztnQ0FDaEgsV0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUMsR0FBRyxFQUFFLEtBQUssRUFBQyxFQUFFLEVBQUUsR0FBRyxDQUFDO2dDQUNyRCxXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQztnQ0FDaEgsV0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUMsR0FBRyxFQUFFLEtBQUssRUFBQyxFQUFFLEVBQUUsR0FBRyxDQUFDO2dDQUNyRCxXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQztnQ0FDaEgsV0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUMsR0FBRyxFQUFFLEtBQUssRUFBQyxFQUFFLEVBQUUsR0FBRyxDQUFDO2dDQUNyRCxXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQztnQ0FDaEgsV0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUMsR0FBRyxFQUFFLEtBQUssRUFBQyxFQUFFLEVBQUUsR0FBRyxDQUFDO2dDQUNyRCxXQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sS0FB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QUFRLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ25ELElBQUksUUFBUSxZQUFZLE9BQU8sRUFBRTtRQUM3QixRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUN4QixLQUFLLENBQUMsUUFBdUIsRUFBRSxXQUFDLENBQUMsY0FBYyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7S0FDL0Q7SUFBQSxDQUFDO0lBQ047Ozs7Ozs7TUFPRTtBQUNGLENBQUM7QUFmRCx3Q0FlQyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiBhbmltKG11dGF0aW9uLCBzdGF0ZSkge1xuICAgIHJldHVybiBzdGF0ZS5hbmltYXRpb24uZW5hYmxlZCA/IGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSA6IHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpO1xufVxuZXhwb3J0cy5hbmltID0gYW5pbTtcbmZ1bmN0aW9uIHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpIHtcbiAgICBjb25zdCByZXN1bHQgPSBtdXRhdGlvbihzdGF0ZSk7XG4gICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIHJldHVybiByZXN1bHQ7XG59XG5leHBvcnRzLnJlbmRlciA9IHJlbmRlcjtcbmZ1bmN0aW9uIG1ha2VQaWVjZShrZXksIHBpZWNlLCBmaXJzdFJhbmtJczApIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgcG9zOiB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApLFxuICAgICAgICBwaWVjZTogcGllY2VcbiAgICB9O1xufVxuZnVuY3Rpb24gY2xvc2VyKHBpZWNlLCBwaWVjZXMpIHtcbiAgICByZXR1cm4gcGllY2VzLnNvcnQoKHAxLCBwMikgPT4ge1xuICAgICAgICByZXR1cm4gdXRpbC5kaXN0YW5jZVNxKHBpZWNlLnBvcywgcDEucG9zKSAtIHV0aWwuZGlzdGFuY2VTcShwaWVjZS5wb3MsIHAyLnBvcyk7XG4gICAgfSlbMF07XG59XG5mdW5jdGlvbiBjb21wdXRlUGxhbihwcmV2UGllY2VzLCBjdXJyZW50KSB7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gY3VycmVudC5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgY29uc3QgYW5pbXMgPSB7fSwgYW5pbWVkT3JpZ3MgPSBbXSwgZmFkaW5ncyA9IHt9LCBtaXNzaW5ncyA9IFtdLCBuZXdzID0gW10sIHByZVBpZWNlcyA9IHt9O1xuICAgIGxldCBjdXJQLCBwcmVQLCBpLCB2ZWN0b3I7XG4gICAgZm9yIChpIGluIHByZXZQaWVjZXMpIHtcbiAgICAgICAgcHJlUGllY2VzW2ldID0gbWFrZVBpZWNlKGksIHByZXZQaWVjZXNbaV0sIGZpcnN0UmFua0lzMCk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIHV0aWwuYWxsS2V5c1tjdXJyZW50Lmdlb21ldHJ5XSkge1xuICAgICAgICBjdXJQID0gY3VycmVudC5waWVjZXNba2V5XTtcbiAgICAgICAgcHJlUCA9IHByZVBpZWNlc1trZXldO1xuICAgICAgICBpZiAoY3VyUCkge1xuICAgICAgICAgICAgaWYgKHByZVApIHtcbiAgICAgICAgICAgICAgICBpZiAoIXV0aWwuc2FtZVBpZWNlKGN1clAsIHByZVAucGllY2UpKSB7XG4gICAgICAgICAgICAgICAgICAgIG1pc3NpbmdzLnB1c2gocHJlUCk7XG4gICAgICAgICAgICAgICAgICAgIG5ld3MucHVzaChtYWtlUGllY2Uoa2V5LCBjdXJQLCBmaXJzdFJhbmtJczApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbmV3cy5wdXNoKG1ha2VQaWVjZShrZXksIGN1clAsIGZpcnN0UmFua0lzMCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHByZVApXG4gICAgICAgICAgICBtaXNzaW5ncy5wdXNoKHByZVApO1xuICAgIH1cbiAgICBuZXdzLmZvckVhY2gobmV3UCA9PiB7XG4gICAgICAgIHByZVAgPSBjbG9zZXIobmV3UCwgbWlzc2luZ3MuZmlsdGVyKHAgPT4gdXRpbC5zYW1lUGllY2UobmV3UC5waWVjZSwgcC5waWVjZSkpKTtcbiAgICAgICAgaWYgKHByZVApIHtcbiAgICAgICAgICAgIHZlY3RvciA9IFtwcmVQLnBvc1swXSAtIG5ld1AucG9zWzBdLCBwcmVQLnBvc1sxXSAtIG5ld1AucG9zWzFdXTtcbiAgICAgICAgICAgIGFuaW1zW25ld1Aua2V5XSA9IHZlY3Rvci5jb25jYXQodmVjdG9yKTtcbiAgICAgICAgICAgIGFuaW1lZE9yaWdzLnB1c2gocHJlUC5rZXkpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgbWlzc2luZ3MuZm9yRWFjaChwID0+IHtcbiAgICAgICAgaWYgKCF1dGlsLmNvbnRhaW5zWChhbmltZWRPcmlncywgcC5rZXkpKVxuICAgICAgICAgICAgZmFkaW5nc1twLmtleV0gPSBwLnBpZWNlO1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICAgIGFuaW1zOiBhbmltcyxcbiAgICAgICAgZmFkaW5nczogZmFkaW5nc1xuICAgIH07XG59XG5mdW5jdGlvbiBzdGVwKHN0YXRlLCBub3cpIHtcbiAgICBjb25zdCBjdXIgPSBzdGF0ZS5hbmltYXRpb24uY3VycmVudDtcbiAgICBpZiAoY3VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKCFzdGF0ZS5kb20uZGVzdHJveWVkKVxuICAgICAgICAgICAgc3RhdGUuZG9tLnJlZHJhd05vdygpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlc3QgPSAxIC0gKG5vdyAtIGN1ci5zdGFydCkgKiBjdXIuZnJlcXVlbmN5O1xuICAgIGlmIChyZXN0IDw9IDApIHtcbiAgICAgICAgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3coKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGNvbnN0IGVhc2UgPSBlYXNpbmcocmVzdCk7XG4gICAgICAgIGZvciAobGV0IGkgaW4gY3VyLnBsYW4uYW5pbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNmZyA9IGN1ci5wbGFuLmFuaW1zW2ldO1xuICAgICAgICAgICAgY2ZnWzJdID0gY2ZnWzBdICogZWFzZTtcbiAgICAgICAgICAgIGNmZ1szXSA9IGNmZ1sxXSAqIGVhc2U7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhd05vdyh0cnVlKTtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKChub3cgPSBwZXJmb3JtYW5jZS5ub3coKSkgPT4gc3RlcChzdGF0ZSwgbm93KSk7XG4gICAgfVxufVxuZnVuY3Rpb24gYW5pbWF0ZShtdXRhdGlvbiwgc3RhdGUpIHtcbiAgICBjb25zdCBwcmV2UGllY2VzID0gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUucGllY2VzKTtcbiAgICBjb25zdCByZXN1bHQgPSBtdXRhdGlvbihzdGF0ZSk7XG4gICAgY29uc3QgcGxhbiA9IGNvbXB1dGVQbGFuKHByZXZQaWVjZXMsIHN0YXRlKTtcbiAgICBpZiAoIWlzT2JqZWN0RW1wdHkocGxhbi5hbmltcykgfHwgIWlzT2JqZWN0RW1wdHkocGxhbi5mYWRpbmdzKSkge1xuICAgICAgICBjb25zdCBhbHJlYWR5UnVubmluZyA9IHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ICYmIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50LnN0YXJ0O1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgICAgICAgICAgIGZyZXF1ZW5jeTogMSAvIHN0YXRlLmFuaW1hdGlvbi5kdXJhdGlvbixcbiAgICAgICAgICAgIHBsYW46IHBsYW5cbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFhbHJlYWR5UnVubmluZylcbiAgICAgICAgICAgIHN0ZXAoc3RhdGUsIHBlcmZvcm1hbmNlLm5vdygpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIGlzT2JqZWN0RW1wdHkobykge1xuICAgIGZvciAobGV0IF8gaW4gbylcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xufVxuZnVuY3Rpb24gZWFzaW5nKHQpIHtcbiAgICByZXR1cm4gdCA8IDAuNSA/IDQgKiB0ICogdCAqIHQgOiAodCAtIDEpICogKDIgKiB0IC0gMikgKiAoMiAqIHQgLSAyKSArIDE7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IGJvYXJkID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCBmZW5fMSA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbmNvbnN0IGNvbmZpZ18xID0gcmVxdWlyZShcIi4vY29uZmlnXCIpO1xuY29uc3QgYW5pbV8xID0gcmVxdWlyZShcIi4vYW5pbVwiKTtcbmNvbnN0IGRyYWdfMSA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG5jb25zdCBleHBsb3Npb25fMSA9IHJlcXVpcmUoXCIuL2V4cGxvc2lvblwiKTtcbmZ1bmN0aW9uIHN0YXJ0KHN0YXRlLCByZWRyYXdBbGwpIHtcbiAgICBmdW5jdGlvbiB0b2dnbGVPcmllbnRhdGlvbigpIHtcbiAgICAgICAgYm9hcmQudG9nZ2xlT3JpZW50YXRpb24oc3RhdGUpO1xuICAgICAgICByZWRyYXdBbGwoKTtcbiAgICB9XG4gICAgO1xuICAgIHJldHVybiB7XG4gICAgICAgIHNldChjb25maWcpIHtcbiAgICAgICAgICAgIGlmIChjb25maWcub3JpZW50YXRpb24gJiYgY29uZmlnLm9yaWVudGF0aW9uICE9PSBzdGF0ZS5vcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB0b2dnbGVPcmllbnRhdGlvbigpO1xuICAgICAgICAgICAgKGNvbmZpZy5mZW4gPyBhbmltXzEuYW5pbSA6IGFuaW1fMS5yZW5kZXIpKHN0YXRlID0+IGNvbmZpZ18xLmNvbmZpZ3VyZShzdGF0ZSwgY29uZmlnKSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBzdGF0ZSxcbiAgICAgICAgZ2V0RmVuOiAoKSA9PiBmZW5fMS53cml0ZShzdGF0ZS5waWVjZXMsIHN0YXRlLmdlb21ldHJ5KSxcbiAgICAgICAgdG9nZ2xlT3JpZW50YXRpb24sXG4gICAgICAgIHNldFBpZWNlcyhwaWVjZXMpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKHN0YXRlID0+IGJvYXJkLnNldFBpZWNlcyhzdGF0ZSwgcGllY2VzKSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3RTcXVhcmUoa2V5LCBmb3JjZSkge1xuICAgICAgICAgICAgaWYgKGtleSlcbiAgICAgICAgICAgICAgICBhbmltXzEuYW5pbShzdGF0ZSA9PiBib2FyZC5zZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpLCBzdGF0ZSk7XG4gICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5zZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGJvYXJkLnVuc2VsZWN0KHN0YXRlKTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG1vdmUob3JpZywgZGVzdCkge1xuICAgICAgICAgICAgYW5pbV8xLmFuaW0oc3RhdGUgPT4gYm9hcmQuYmFzZU1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpLCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIG5ld1BpZWNlKHBpZWNlLCBrZXkpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKHN0YXRlID0+IGJvYXJkLmJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGtleSksIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgcGxheVByZW1vdmUoKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUucHJlbW92YWJsZS5jdXJyZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW1fMS5hbmltKGJvYXJkLnBsYXlQcmVtb3ZlLCBzdGF0ZSkpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcbiAgICAgICAgcGxheVByZWRyb3AodmFsaWRhdGUpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5wcmVkcm9wcGFibGUuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGJvYXJkLnBsYXlQcmVkcm9wKHN0YXRlLCB2YWxpZGF0ZSk7XG4gICAgICAgICAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGNhbmNlbFByZW1vdmUoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGJvYXJkLnVuc2V0UHJlbW92ZSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxQcmVkcm9wKCkge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihib2FyZC51bnNldFByZWRyb3AsIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgY2FuY2VsTW92ZSgpIHtcbiAgICAgICAgICAgIGFuaW1fMS5yZW5kZXIoc3RhdGUgPT4geyBib2FyZC5jYW5jZWxNb3ZlKHN0YXRlKTsgZHJhZ18xLmNhbmNlbChzdGF0ZSk7IH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RvcCgpIHtcbiAgICAgICAgICAgIGFuaW1fMS5yZW5kZXIoc3RhdGUgPT4geyBib2FyZC5zdG9wKHN0YXRlKTsgZHJhZ18xLmNhbmNlbChzdGF0ZSk7IH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgZXhwbG9kZShrZXlzKSB7XG4gICAgICAgICAgICBleHBsb3Npb25fMS5kZWZhdWx0KHN0YXRlLCBrZXlzKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0QXV0b1NoYXBlcyhzaGFwZXMpIHtcbiAgICAgICAgICAgIGFuaW1fMS5yZW5kZXIoc3RhdGUgPT4gc3RhdGUuZHJhd2FibGUuYXV0b1NoYXBlcyA9IHNoYXBlcywgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBzZXRTaGFwZXMoc2hhcGVzKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKHN0YXRlID0+IHN0YXRlLmRyYXdhYmxlLnNoYXBlcyA9IHNoYXBlcywgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBnZXRLZXlBdERvbVBvcyhwb3MpIHtcbiAgICAgICAgICAgIHJldHVybiBib2FyZC5nZXRLZXlBdERvbVBvcyhwb3MsIHN0YXRlLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBzdGF0ZS5kb20uYm91bmRzKCksIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVkcmF3QWxsLFxuICAgICAgICBkcmFnTmV3UGllY2UocGllY2UsIGV2ZW50LCBmb3JjZSkge1xuICAgICAgICAgICAgZHJhZ18xLmRyYWdOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGV2ZW50LCBmb3JjZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRlc3Ryb3koKSB7XG4gICAgICAgICAgICBib2FyZC5zdG9wKHN0YXRlKTtcbiAgICAgICAgICAgIHN0YXRlLmRvbS51bmJpbmQgJiYgc3RhdGUuZG9tLnVuYmluZCgpO1xuICAgICAgICAgICAgc3RhdGUuZG9tLmRlc3Ryb3llZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9O1xufVxuZXhwb3J0cy5zdGFydCA9IHN0YXJ0O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgcHJlbW92ZV8xID0gcmVxdWlyZShcIi4vcHJlbW92ZVwiKTtcbmNvbnN0IGNnID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5mdW5jdGlvbiBjYWxsVXNlckZ1bmN0aW9uKGYsIC4uLmFyZ3MpIHtcbiAgICBpZiAoZilcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBmKC4uLmFyZ3MpLCAxKTtcbn1cbmV4cG9ydHMuY2FsbFVzZXJGdW5jdGlvbiA9IGNhbGxVc2VyRnVuY3Rpb247XG5mdW5jdGlvbiB0b2dnbGVPcmllbnRhdGlvbihzdGF0ZSkge1xuICAgIHN0YXRlLm9yaWVudGF0aW9uID0gdXRpbF8xLm9wcG9zaXRlKHN0YXRlLm9yaWVudGF0aW9uKTtcbiAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9XG4gICAgICAgIHN0YXRlLmRyYWdnYWJsZS5jdXJyZW50ID1cbiAgICAgICAgICAgIHN0YXRlLnNlbGVjdGVkID0gdW5kZWZpbmVkO1xufVxuZXhwb3J0cy50b2dnbGVPcmllbnRhdGlvbiA9IHRvZ2dsZU9yaWVudGF0aW9uO1xuZnVuY3Rpb24gcmVzZXQoc3RhdGUpIHtcbiAgICBzdGF0ZS5sYXN0TW92ZSA9IHVuZGVmaW5lZDtcbiAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgdW5zZXRQcmVtb3ZlKHN0YXRlKTtcbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xufVxuZXhwb3J0cy5yZXNldCA9IHJlc2V0O1xuZnVuY3Rpb24gc2V0UGllY2VzKHN0YXRlLCBwaWVjZXMpIHtcbiAgICBmb3IgKGxldCBrZXkgaW4gcGllY2VzKSB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0gcGllY2VzW2tleV07XG4gICAgICAgIGlmIChwaWVjZSlcbiAgICAgICAgICAgIHN0YXRlLnBpZWNlc1trZXldID0gcGllY2U7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNba2V5XTtcbiAgICB9XG59XG5leHBvcnRzLnNldFBpZWNlcyA9IHNldFBpZWNlcztcbmZ1bmN0aW9uIHNldENoZWNrKHN0YXRlLCBjb2xvcikge1xuICAgIHN0YXRlLmNoZWNrID0gdW5kZWZpbmVkO1xuICAgIGlmIChjb2xvciA9PT0gdHJ1ZSlcbiAgICAgICAgY29sb3IgPSBzdGF0ZS50dXJuQ29sb3I7XG4gICAgaWYgKGNvbG9yKVxuICAgICAgICBmb3IgKGxldCBrIGluIHN0YXRlLnBpZWNlcykge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnBpZWNlc1trXS5yb2xlID09PSAna2luZycgJiYgc3RhdGUucGllY2VzW2tdLmNvbG9yID09PSBjb2xvcikge1xuICAgICAgICAgICAgICAgIHN0YXRlLmNoZWNrID0gaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxufVxuZXhwb3J0cy5zZXRDaGVjayA9IHNldENoZWNrO1xuZnVuY3Rpb24gc2V0UHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCwgbWV0YSkge1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgc3RhdGUucHJlbW92YWJsZS5jdXJyZW50ID0gW29yaWcsIGRlc3RdO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUucHJlbW92YWJsZS5ldmVudHMuc2V0LCBvcmlnLCBkZXN0LCBtZXRhKTtcbn1cbmZ1bmN0aW9uIHVuc2V0UHJlbW92ZShzdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5wcmVtb3ZhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgc3RhdGUucHJlbW92YWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZW1vdmFibGUuZXZlbnRzLnVuc2V0KTtcbiAgICB9XG59XG5leHBvcnRzLnVuc2V0UHJlbW92ZSA9IHVuc2V0UHJlbW92ZTtcbmZ1bmN0aW9uIHNldFByZWRyb3Aoc3RhdGUsIHJvbGUsIGtleSkge1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgc3RhdGUucHJlZHJvcHBhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIHJvbGU6IHJvbGUsXG4gICAgICAgIGtleToga2V5XG4gICAgfTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZWRyb3BwYWJsZS5ldmVudHMuc2V0LCByb2xlLCBrZXkpO1xufVxuZnVuY3Rpb24gdW5zZXRQcmVkcm9wKHN0YXRlKSB7XG4gICAgY29uc3QgcGQgPSBzdGF0ZS5wcmVkcm9wcGFibGU7XG4gICAgaWYgKHBkLmN1cnJlbnQpIHtcbiAgICAgICAgcGQuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihwZC5ldmVudHMudW5zZXQpO1xuICAgIH1cbn1cbmV4cG9ydHMudW5zZXRQcmVkcm9wID0gdW5zZXRQcmVkcm9wO1xuZnVuY3Rpb24gdHJ5QXV0b0Nhc3RsZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGlmICghc3RhdGUuYXV0b0Nhc3RsZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGtpbmcgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgaWYgKCFraW5nIHx8IGtpbmcucm9sZSAhPT0gJ2tpbmcnKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gc3RhdGUuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIGNvbnN0IG9yaWdQb3MgPSB1dGlsXzEua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApO1xuICAgIGlmIChvcmlnUG9zWzBdICE9PSA1KVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgaWYgKG9yaWdQb3NbMV0gIT09IDEgJiYgb3JpZ1Bvc1sxXSAhPT0gOClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGRlc3RQb3MgPSB1dGlsXzEua2V5MnBvcyhkZXN0LCBmaXJzdFJhbmtJczApO1xuICAgIGxldCBvbGRSb29rUG9zLCBuZXdSb29rUG9zLCBuZXdLaW5nUG9zO1xuICAgIGlmIChkZXN0UG9zWzBdID09PSA3IHx8IGRlc3RQb3NbMF0gPT09IDgpIHtcbiAgICAgICAgb2xkUm9va1BvcyA9IHV0aWxfMS5wb3Mya2V5KFs4LCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgICAgICBuZXdSb29rUG9zID0gdXRpbF8xLnBvczJrZXkoWzYsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIG5ld0tpbmdQb3MgPSB1dGlsXzEucG9zMmtleShbNywgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICB9XG4gICAgZWxzZSBpZiAoZGVzdFBvc1swXSA9PT0gMyB8fCBkZXN0UG9zWzBdID09PSAxKSB7XG4gICAgICAgIG9sZFJvb2tQb3MgPSB1dGlsXzEucG9zMmtleShbMSwgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgbmV3Um9va1BvcyA9IHV0aWxfMS5wb3Mya2V5KFs0LCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgICAgICBuZXdLaW5nUG9zID0gdXRpbF8xLnBvczJrZXkoWzMsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgfVxuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHJvb2sgPSBzdGF0ZS5waWVjZXNbb2xkUm9va1Bvc107XG4gICAgaWYgKCFyb29rIHx8IHJvb2sucm9sZSAhPT0gJ3Jvb2snKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICBkZWxldGUgc3RhdGUucGllY2VzW29sZFJvb2tQb3NdO1xuICAgIHN0YXRlLnBpZWNlc1tuZXdLaW5nUG9zXSA9IGtpbmc7XG4gICAgc3RhdGUucGllY2VzW25ld1Jvb2tQb3NdID0gcm9vaztcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgY29uc3Qgb3JpZ1BpZWNlID0gc3RhdGUucGllY2VzW29yaWddLCBkZXN0UGllY2UgPSBzdGF0ZS5waWVjZXNbZGVzdF07XG4gICAgaWYgKG9yaWcgPT09IGRlc3QgfHwgIW9yaWdQaWVjZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGNhcHR1cmVkID0gKGRlc3RQaWVjZSAmJiBkZXN0UGllY2UuY29sb3IgIT09IG9yaWdQaWVjZS5jb2xvcikgPyBkZXN0UGllY2UgOiB1bmRlZmluZWQ7XG4gICAgaWYgKGRlc3QgPT0gc3RhdGUuc2VsZWN0ZWQpXG4gICAgICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5tb3ZlLCBvcmlnLCBkZXN0LCBjYXB0dXJlZCk7XG4gICAgaWYgKCF0cnlBdXRvQ2FzdGxlKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICBzdGF0ZS5waWVjZXNbZGVzdF0gPSBvcmlnUGllY2U7XG4gICAgICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgfVxuICAgIHN0YXRlLmxhc3RNb3ZlID0gW29yaWcsIGRlc3RdO1xuICAgIHN0YXRlLmNoZWNrID0gdW5kZWZpbmVkO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLmNoYW5nZSk7XG4gICAgcmV0dXJuIGNhcHR1cmVkIHx8IHRydWU7XG59XG5leHBvcnRzLmJhc2VNb3ZlID0gYmFzZU1vdmU7XG5mdW5jdGlvbiBiYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBrZXksIGZvcmNlKSB7XG4gICAgaWYgKHN0YXRlLnBpZWNlc1trZXldKSB7XG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNba2V5XTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5kcm9wTmV3UGllY2UsIHBpZWNlLCBrZXkpO1xuICAgIHN0YXRlLnBpZWNlc1trZXldID0gcGllY2U7XG4gICAgc3RhdGUubGFzdE1vdmUgPSBba2V5XTtcbiAgICBzdGF0ZS5jaGVjayA9IHVuZGVmaW5lZDtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5jaGFuZ2UpO1xuICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgc3RhdGUudHVybkNvbG9yID0gdXRpbF8xLm9wcG9zaXRlKHN0YXRlLnR1cm5Db2xvcik7XG4gICAgcmV0dXJuIHRydWU7XG59XG5leHBvcnRzLmJhc2VOZXdQaWVjZSA9IGJhc2VOZXdQaWVjZTtcbmZ1bmN0aW9uIGJhc2VVc2VyTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciA9IHV0aWxfMS5vcHBvc2l0ZShzdGF0ZS50dXJuQ29sb3IpO1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIHVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgaWYgKGNhbk1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGJhc2VVc2VyTW92ZShzdGF0ZSwgb3JpZywgZGVzdCk7XG4gICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgIGNvbnN0IGhvbGRUaW1lID0gc3RhdGUuaG9sZC5zdG9wKCk7XG4gICAgICAgICAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHtcbiAgICAgICAgICAgICAgICBwcmVtb3ZlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdHJsS2V5OiBzdGF0ZS5zdGF0cy5jdHJsS2V5LFxuICAgICAgICAgICAgICAgIGhvbGRUaW1lOiBob2xkVGltZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlKVxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmNhcHR1cmVkID0gcmVzdWx0O1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlciwgb3JpZywgZGVzdCwgbWV0YWRhdGEpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoY2FuUHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgc2V0UHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCwge1xuICAgICAgICAgICAgY3RybEtleTogc3RhdGUuc3RhdHMuY3RybEtleVxuICAgICAgICB9KTtcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIH1cbiAgICBlbHNlIGlmIChpc01vdmFibGUoc3RhdGUsIGRlc3QpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwgZGVzdCkpIHtcbiAgICAgICAgc2V0U2VsZWN0ZWQoc3RhdGUsIGRlc3QpO1xuICAgICAgICBzdGF0ZS5ob2xkLnN0YXJ0KCk7XG4gICAgfVxuICAgIGVsc2VcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydHMudXNlck1vdmUgPSB1c2VyTW92ZTtcbmZ1bmN0aW9uIGRyb3BOZXdQaWVjZShzdGF0ZSwgb3JpZywgZGVzdCwgZm9yY2UpIHtcbiAgICBpZiAoY2FuRHJvcChzdGF0ZSwgb3JpZywgZGVzdCkgfHwgZm9yY2UpIHtcbiAgICAgICAgY29uc3QgcGllY2UgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgICAgIGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGRlc3QsIGZvcmNlKTtcbiAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlck5ld1BpZWNlLCBwaWVjZS5yb2xlLCBkZXN0LCB7XG4gICAgICAgICAgICBwcmVkcm9wOiBmYWxzZVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSBpZiAoY2FuUHJlZHJvcChzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgc2V0UHJlZHJvcChzdGF0ZSwgc3RhdGUucGllY2VzW29yaWddLnJvbGUsIGRlc3QpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdW5zZXRQcmVtb3ZlKHN0YXRlKTtcbiAgICAgICAgdW5zZXRQcmVkcm9wKHN0YXRlKTtcbiAgICB9XG4gICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICB1bnNlbGVjdChzdGF0ZSk7XG59XG5leHBvcnRzLmRyb3BOZXdQaWVjZSA9IGRyb3BOZXdQaWVjZTtcbmZ1bmN0aW9uIHNlbGVjdFNxdWFyZShzdGF0ZSwga2V5LCBmb3JjZSkge1xuICAgIGlmIChzdGF0ZS5zZWxlY3RlZCkge1xuICAgICAgICBpZiAoc3RhdGUuc2VsZWN0ZWQgPT09IGtleSAmJiAhc3RhdGUuZHJhZ2dhYmxlLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICAgICAgICAgIHN0YXRlLmhvbGQuY2FuY2VsKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoKHN0YXRlLnNlbGVjdGFibGUuZW5hYmxlZCB8fCBmb3JjZSkgJiYgc3RhdGUuc2VsZWN0ZWQgIT09IGtleSkge1xuICAgICAgICAgICAgaWYgKHVzZXJNb3ZlKHN0YXRlLCBzdGF0ZS5zZWxlY3RlZCwga2V5KSlcbiAgICAgICAgICAgICAgICBzdGF0ZS5zdGF0cy5kcmFnZ2VkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc3RhdGUuaG9sZC5zdGFydCgpO1xuICAgIH1cbiAgICBlbHNlIGlmIChpc01vdmFibGUoc3RhdGUsIGtleSkgfHwgaXNQcmVtb3ZhYmxlKHN0YXRlLCBrZXkpKSB7XG4gICAgICAgIHNldFNlbGVjdGVkKHN0YXRlLCBrZXkpO1xuICAgICAgICBzdGF0ZS5ob2xkLnN0YXJ0KCk7XG4gICAgfVxuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLnNlbGVjdCwga2V5KTtcbn1cbmV4cG9ydHMuc2VsZWN0U3F1YXJlID0gc2VsZWN0U3F1YXJlO1xuZnVuY3Rpb24gc2V0U2VsZWN0ZWQoc3RhdGUsIGtleSkge1xuICAgIHN0YXRlLnNlbGVjdGVkID0ga2V5O1xuICAgIGlmIChpc1ByZW1vdmFibGUoc3RhdGUsIGtleSkpIHtcbiAgICAgICAgc3RhdGUucHJlbW92YWJsZS5kZXN0cyA9IHByZW1vdmVfMS5kZWZhdWx0KHN0YXRlLnBpZWNlcywga2V5LCBzdGF0ZS5wcmVtb3ZhYmxlLmNhc3RsZSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICAgIHN0YXRlLnByZW1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG59XG5leHBvcnRzLnNldFNlbGVjdGVkID0gc2V0U2VsZWN0ZWQ7XG5mdW5jdGlvbiB1bnNlbGVjdChzdGF0ZSkge1xuICAgIHN0YXRlLnNlbGVjdGVkID0gdW5kZWZpbmVkO1xuICAgIHN0YXRlLnByZW1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgc3RhdGUuaG9sZC5jYW5jZWwoKTtcbn1cbmV4cG9ydHMudW5zZWxlY3QgPSB1bnNlbGVjdDtcbmZ1bmN0aW9uIGlzTW92YWJsZShzdGF0ZSwgb3JpZykge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmXG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciA9PT0gcGllY2UuY29sb3IpKTtcbn1cbmZ1bmN0aW9uIGNhbk1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpIHtcbiAgICByZXR1cm4gb3JpZyAhPT0gZGVzdCAmJiBpc01vdmFibGUoc3RhdGUsIG9yaWcpICYmIChzdGF0ZS5tb3ZhYmxlLmZyZWUgfHwgKCEhc3RhdGUubW92YWJsZS5kZXN0cyAmJiB1dGlsXzEuY29udGFpbnNYKHN0YXRlLm1vdmFibGUuZGVzdHNbb3JpZ10sIGRlc3QpKSk7XG59XG5leHBvcnRzLmNhbk1vdmUgPSBjYW5Nb3ZlO1xuZnVuY3Rpb24gY2FuRHJvcChzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIGRlc3QgJiYgKG9yaWcgPT09IGRlc3QgfHwgIXN0YXRlLnBpZWNlc1tkZXN0XSkgJiYgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICdib3RoJyB8fCAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yID09PSBwaWVjZS5jb2xvcikpO1xufVxuZnVuY3Rpb24gaXNQcmVtb3ZhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgY29uc3QgcGllY2UgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgcmV0dXJuICEhcGllY2UgJiYgc3RhdGUucHJlbW92YWJsZS5lbmFibGVkICYmXG4gICAgICAgIHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmXG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciAhPT0gcGllY2UuY29sb3I7XG59XG5mdW5jdGlvbiBjYW5QcmVtb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgcmV0dXJuIG9yaWcgIT09IGRlc3QgJiZcbiAgICAgICAgaXNQcmVtb3ZhYmxlKHN0YXRlLCBvcmlnKSAmJlxuICAgICAgICB1dGlsXzEuY29udGFpbnNYKHByZW1vdmVfMS5kZWZhdWx0KHN0YXRlLnBpZWNlcywgb3JpZywgc3RhdGUucHJlbW92YWJsZS5jYXN0bGUsIHN0YXRlLmdlb21ldHJ5KSwgZGVzdCk7XG59XG5mdW5jdGlvbiBjYW5QcmVkcm9wKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgY29uc3QgcGllY2UgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgY29uc3QgZGVzdFBpZWNlID0gc3RhdGUucGllY2VzW2Rlc3RdO1xuICAgIHJldHVybiAhIXBpZWNlICYmIGRlc3QgJiZcbiAgICAgICAgKCFkZXN0UGllY2UgfHwgZGVzdFBpZWNlLmNvbG9yICE9PSBzdGF0ZS5tb3ZhYmxlLmNvbG9yKSAmJlxuICAgICAgICBzdGF0ZS5wcmVkcm9wcGFibGUuZW5hYmxlZCAmJlxuICAgICAgICAocGllY2Uucm9sZSAhPT0gJ3Bhd24nIHx8IChkZXN0WzFdICE9PSAnMScgJiYgZGVzdFsxXSAhPT0gJzgnKSkgJiZcbiAgICAgICAgc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yICE9PSBwaWVjZS5jb2xvcjtcbn1cbmZ1bmN0aW9uIGlzRHJhZ2dhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgY29uc3QgcGllY2UgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgcmV0dXJuICEhcGllY2UgJiYgc3RhdGUuZHJhZ2dhYmxlLmVuYWJsZWQgJiYgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICdib3RoJyB8fCAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiYgKHN0YXRlLnR1cm5Db2xvciA9PT0gcGllY2UuY29sb3IgfHwgc3RhdGUucHJlbW92YWJsZS5lbmFibGVkKSkpO1xufVxuZXhwb3J0cy5pc0RyYWdnYWJsZSA9IGlzRHJhZ2dhYmxlO1xuZnVuY3Rpb24gcGxheVByZW1vdmUoc3RhdGUpIHtcbiAgICBjb25zdCBtb3ZlID0gc3RhdGUucHJlbW92YWJsZS5jdXJyZW50O1xuICAgIGlmICghbW92ZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG9yaWcgPSBtb3ZlWzBdLCBkZXN0ID0gbW92ZVsxXTtcbiAgICBsZXQgc3VjY2VzcyA9IGZhbHNlO1xuICAgIGlmIChjYW5Nb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBiYXNlVXNlck1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpO1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHsgcHJlbW92ZTogdHJ1ZSB9O1xuICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gdHJ1ZSlcbiAgICAgICAgICAgICAgICBtZXRhZGF0YS5jYXB0dXJlZCA9IHJlc3VsdDtcbiAgICAgICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXIsIG9yaWcsIGRlc3QsIG1ldGFkYXRhKTtcbiAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG59XG5leHBvcnRzLnBsYXlQcmVtb3ZlID0gcGxheVByZW1vdmU7XG5mdW5jdGlvbiBwbGF5UHJlZHJvcChzdGF0ZSwgdmFsaWRhdGUpIHtcbiAgICBsZXQgZHJvcCA9IHN0YXRlLnByZWRyb3BwYWJsZS5jdXJyZW50LCBzdWNjZXNzID0gZmFsc2U7XG4gICAgaWYgKCFkcm9wKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgaWYgKHZhbGlkYXRlKGRyb3ApKSB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0ge1xuICAgICAgICAgICAgcm9sZTogZHJvcC5yb2xlLFxuICAgICAgICAgICAgY29sb3I6IHN0YXRlLm1vdmFibGUuY29sb3JcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGRyb3Aua2V5KSkge1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlck5ld1BpZWNlLCBkcm9wLnJvbGUsIGRyb3Aua2V5LCB7XG4gICAgICAgICAgICAgICAgcHJlZHJvcDogdHJ1ZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xuICAgIHJldHVybiBzdWNjZXNzO1xufVxuZXhwb3J0cy5wbGF5UHJlZHJvcCA9IHBsYXlQcmVkcm9wO1xuZnVuY3Rpb24gY2FuY2VsTW92ZShzdGF0ZSkge1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgdW5zZXRQcmVkcm9wKHN0YXRlKTtcbiAgICB1bnNlbGVjdChzdGF0ZSk7XG59XG5leHBvcnRzLmNhbmNlbE1vdmUgPSBjYW5jZWxNb3ZlO1xuZnVuY3Rpb24gc3RvcChzdGF0ZSkge1xuICAgIHN0YXRlLm1vdmFibGUuY29sb3IgPVxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzID1cbiAgICAgICAgICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgIGNhbmNlbE1vdmUoc3RhdGUpO1xufVxuZXhwb3J0cy5zdG9wID0gc3RvcDtcbmZ1bmN0aW9uIGdldEtleUF0RG9tUG9zKHBvcywgYXNXaGl0ZSwgYm91bmRzLCBnZW9tKSB7XG4gICAgY29uc3QgYmQgPSBjZy5kaW1lbnNpb25zW2dlb21dO1xuICAgIGxldCBmaWxlID0gTWF0aC5jZWlsKGJkLndpZHRoICogKChwb3NbMF0gLSBib3VuZHMubGVmdCkgLyBib3VuZHMud2lkdGgpKTtcbiAgICBpZiAoIWFzV2hpdGUpXG4gICAgICAgIGZpbGUgPSBiZC53aWR0aCArIDEgLSBmaWxlO1xuICAgIGxldCByYW5rID0gTWF0aC5jZWlsKGJkLmhlaWdodCAtIChiZC5oZWlnaHQgKiAoKHBvc1sxXSAtIGJvdW5kcy50b3ApIC8gYm91bmRzLmhlaWdodCkpKTtcbiAgICBpZiAoIWFzV2hpdGUpXG4gICAgICAgIHJhbmsgPSBiZC5oZWlnaHQgKyAxIC0gcmFuaztcbiAgICByZXR1cm4gKGZpbGUgPiAwICYmIGZpbGUgPCBiZC53aWR0aCArIDEgJiYgcmFuayA+IDAgJiYgcmFuayA8IGJkLmhlaWdodCArIDEpID8gdXRpbF8xLnBvczJrZXkoW2ZpbGUsIHJhbmtdLCBnZW9tKSA6IHVuZGVmaW5lZDtcbn1cbmV4cG9ydHMuZ2V0S2V5QXREb21Qb3MgPSBnZXRLZXlBdERvbVBvcztcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgYXBpXzEgPSByZXF1aXJlKFwiLi9hcGlcIik7XG5jb25zdCBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbmNvbnN0IHN0YXRlXzEgPSByZXF1aXJlKFwiLi9zdGF0ZVwiKTtcbmNvbnN0IHdyYXBfMSA9IHJlcXVpcmUoXCIuL3dyYXBcIik7XG5jb25zdCBldmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG5jb25zdCByZW5kZXJfMSA9IHJlcXVpcmUoXCIuL3JlbmRlclwiKTtcbmNvbnN0IHN2ZyA9IHJlcXVpcmUoXCIuL3N2Z1wiKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gQ2hlc3Nncm91bmQoZWxlbWVudCwgY29uZmlnKSB7XG4gICAgY29uc3Qgc3RhdGUgPSBzdGF0ZV8xLmRlZmF1bHRzKCk7XG4gICAgY29uZmlnXzEuY29uZmlndXJlKHN0YXRlLCBjb25maWcgfHwge30pO1xuICAgIGZ1bmN0aW9uIHJlZHJhd0FsbCgpIHtcbiAgICAgICAgbGV0IHByZXZVbmJpbmQgPSBzdGF0ZS5kb20gJiYgc3RhdGUuZG9tLnVuYmluZDtcbiAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjZy13cmFwJyk7XG4gICAgICAgIGNvbnN0IHJlbGF0aXZlID0gc3RhdGUudmlld09ubHkgJiYgIXN0YXRlLmRyYXdhYmxlLnZpc2libGU7XG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gd3JhcF8xLmRlZmF1bHQoZWxlbWVudCwgc3RhdGUsIHJlbGF0aXZlKTtcbiAgICAgICAgY29uc3QgYm91bmRzID0gdXRpbC5tZW1vKCgpID0+IGVsZW1lbnRzLmJvYXJkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpKTtcbiAgICAgICAgY29uc3QgcmVkcmF3Tm93ID0gKHNraXBTdmcpID0+IHtcbiAgICAgICAgICAgIHJlbmRlcl8xLmRlZmF1bHQoc3RhdGUpO1xuICAgICAgICAgICAgaWYgKCFza2lwU3ZnICYmIGVsZW1lbnRzLnN2ZylcbiAgICAgICAgICAgICAgICBzdmcucmVuZGVyU3ZnKHN0YXRlLCBlbGVtZW50cy5zdmcpO1xuICAgICAgICB9O1xuICAgICAgICBzdGF0ZS5kb20gPSB7XG4gICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHMsXG4gICAgICAgICAgICBib3VuZHM6IGJvdW5kcyxcbiAgICAgICAgICAgIHJlZHJhdzogZGVib3VuY2VSZWRyYXcocmVkcmF3Tm93KSxcbiAgICAgICAgICAgIHJlZHJhd05vdzogcmVkcmF3Tm93LFxuICAgICAgICAgICAgdW5iaW5kOiBwcmV2VW5iaW5kLFxuICAgICAgICAgICAgcmVsYXRpdmVcbiAgICAgICAgfTtcbiAgICAgICAgc3RhdGUuZHJhd2FibGUucHJldlN2Z0hhc2ggPSAnJztcbiAgICAgICAgcmVkcmF3Tm93KGZhbHNlKTtcbiAgICAgICAgZXZlbnRzLmJpbmRCb2FyZChzdGF0ZSk7XG4gICAgICAgIGlmICghcHJldlVuYmluZClcbiAgICAgICAgICAgIHN0YXRlLmRvbS51bmJpbmQgPSBldmVudHMuYmluZERvY3VtZW50KHN0YXRlLCByZWRyYXdBbGwpO1xuICAgICAgICBzdGF0ZS5ldmVudHMuaW5zZXJ0ICYmIHN0YXRlLmV2ZW50cy5pbnNlcnQoZWxlbWVudHMpO1xuICAgIH1cbiAgICByZWRyYXdBbGwoKTtcbiAgICBjb25zdCBhcGkgPSBhcGlfMS5zdGFydChzdGF0ZSwgcmVkcmF3QWxsKTtcbiAgICByZXR1cm4gYXBpO1xufVxuZXhwb3J0cy5DaGVzc2dyb3VuZCA9IENoZXNzZ3JvdW5kO1xuO1xuZnVuY3Rpb24gZGVib3VuY2VSZWRyYXcocmVkcmF3Tm93KSB7XG4gICAgbGV0IHJlZHJhd2luZyA9IGZhbHNlO1xuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIGlmIChyZWRyYXdpbmcpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHJlZHJhd2luZyA9IHRydWU7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgICAgICByZWRyYXdOb3coKTtcbiAgICAgICAgICAgIHJlZHJhd2luZyA9IGZhbHNlO1xuICAgICAgICB9KTtcbiAgICB9O1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCBib2FyZF8xID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCBmZW5fMSA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbmNvbnN0IGNnID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5mdW5jdGlvbiBjb25maWd1cmUoc3RhdGUsIGNvbmZpZykge1xuICAgIGlmIChjb25maWcubW92YWJsZSAmJiBjb25maWcubW92YWJsZS5kZXN0cylcbiAgICAgICAgc3RhdGUubW92YWJsZS5kZXN0cyA9IHVuZGVmaW5lZDtcbiAgICBtZXJnZShzdGF0ZSwgY29uZmlnKTtcbiAgICBpZiAoY29uZmlnLmdlb21ldHJ5KVxuICAgICAgICBzdGF0ZS5kaW1lbnNpb25zID0gY2cuZGltZW5zaW9uc1tjb25maWcuZ2VvbWV0cnldO1xuICAgIGlmIChjb25maWcuZmVuKSB7XG4gICAgICAgIHN0YXRlLnBpZWNlcyA9IGZlbl8xLnJlYWQoY29uZmlnLmZlbik7XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnNoYXBlcyA9IFtdO1xuICAgIH1cbiAgICBpZiAoY29uZmlnLmhhc093blByb3BlcnR5KCdjaGVjaycpKVxuICAgICAgICBib2FyZF8xLnNldENoZWNrKHN0YXRlLCBjb25maWcuY2hlY2sgfHwgZmFsc2UpO1xuICAgIGlmIChjb25maWcuaGFzT3duUHJvcGVydHkoJ2xhc3RNb3ZlJykgJiYgIWNvbmZpZy5sYXN0TW92ZSlcbiAgICAgICAgc3RhdGUubGFzdE1vdmUgPSB1bmRlZmluZWQ7XG4gICAgZWxzZSBpZiAoY29uZmlnLmxhc3RNb3ZlKVxuICAgICAgICBzdGF0ZS5sYXN0TW92ZSA9IGNvbmZpZy5sYXN0TW92ZTtcbiAgICBpZiAoc3RhdGUuc2VsZWN0ZWQpXG4gICAgICAgIGJvYXJkXzEuc2V0U2VsZWN0ZWQoc3RhdGUsIHN0YXRlLnNlbGVjdGVkKTtcbiAgICBpZiAoIXN0YXRlLmFuaW1hdGlvbi5kdXJhdGlvbiB8fCBzdGF0ZS5hbmltYXRpb24uZHVyYXRpb24gPCAxMDApXG4gICAgICAgIHN0YXRlLmFuaW1hdGlvbi5lbmFibGVkID0gZmFsc2U7XG4gICAgaWYgKCFzdGF0ZS5tb3ZhYmxlLnJvb2tDYXN0bGUgJiYgc3RhdGUubW92YWJsZS5kZXN0cykge1xuICAgICAgICBjb25zdCByYW5rID0gc3RhdGUubW92YWJsZS5jb2xvciA9PT0gJ3doaXRlJyA/IDEgOiA4O1xuICAgICAgICBjb25zdCBraW5nU3RhcnRQb3MgPSAnZScgKyByYW5rO1xuICAgICAgICBjb25zdCBkZXN0cyA9IHN0YXRlLm1vdmFibGUuZGVzdHNba2luZ1N0YXJ0UG9zXTtcbiAgICAgICAgY29uc3Qga2luZyA9IHN0YXRlLnBpZWNlc1traW5nU3RhcnRQb3NdO1xuICAgICAgICBpZiAoIWRlc3RzIHx8ICFraW5nIHx8IGtpbmcucm9sZSAhPT0gJ2tpbmcnKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzW2tpbmdTdGFydFBvc10gPSBkZXN0cy5maWx0ZXIoZCA9PiAhKChkID09PSAnYScgKyByYW5rKSAmJiBkZXN0cy5pbmRleE9mKCdjJyArIHJhbmspICE9PSAtMSkgJiZcbiAgICAgICAgICAgICEoKGQgPT09ICdoJyArIHJhbmspICYmIGRlc3RzLmluZGV4T2YoJ2cnICsgcmFuaykgIT09IC0xKSk7XG4gICAgfVxufVxuZXhwb3J0cy5jb25maWd1cmUgPSBjb25maWd1cmU7XG47XG5mdW5jdGlvbiBtZXJnZShiYXNlLCBleHRlbmQpIHtcbiAgICBmb3IgKGxldCBrZXkgaW4gZXh0ZW5kKSB7XG4gICAgICAgIGlmIChpc09iamVjdChiYXNlW2tleV0pICYmIGlzT2JqZWN0KGV4dGVuZFtrZXldKSlcbiAgICAgICAgICAgIG1lcmdlKGJhc2Vba2V5XSwgZXh0ZW5kW2tleV0pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBiYXNlW2tleV0gPSBleHRlbmRba2V5XTtcbiAgICB9XG59XG5mdW5jdGlvbiBpc09iamVjdChvKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvID09PSAnb2JqZWN0Jztcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgYm9hcmQgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgZHJhd18xID0gcmVxdWlyZShcIi4vZHJhd1wiKTtcbmNvbnN0IGFuaW1fMSA9IHJlcXVpcmUoXCIuL2FuaW1cIik7XG5mdW5jdGlvbiBzdGFydChzLCBlKSB7XG4gICAgaWYgKGUuYnV0dG9uICE9PSB1bmRlZmluZWQgJiYgZS5idXR0b24gIT09IDApXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPiAxKVxuICAgICAgICByZXR1cm47XG4gICAgY29uc3QgYXNXaGl0ZSA9IHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIGJvdW5kcyA9IHMuZG9tLmJvdW5kcygpLCBwb3NpdGlvbiA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKSwgb3JpZyA9IGJvYXJkLmdldEtleUF0RG9tUG9zKHBvc2l0aW9uLCBhc1doaXRlLCBib3VuZHMsIHMuZ2VvbWV0cnkpO1xuICAgIGlmICghb3JpZylcbiAgICAgICAgcmV0dXJuO1xuICAgIGNvbnN0IHBpZWNlID0gcy5waWVjZXNbb3JpZ107XG4gICAgY29uc3QgcHJldmlvdXNseVNlbGVjdGVkID0gcy5zZWxlY3RlZDtcbiAgICBpZiAoIXByZXZpb3VzbHlTZWxlY3RlZCAmJiBzLmRyYXdhYmxlLmVuYWJsZWQgJiYgKHMuZHJhd2FibGUuZXJhc2VPbkNsaWNrIHx8ICghcGllY2UgfHwgcGllY2UuY29sb3IgIT09IHMudHVybkNvbG9yKSkpXG4gICAgICAgIGRyYXdfMS5jbGVhcihzKTtcbiAgICBpZiAoZS5jYW5jZWxhYmxlICE9PSBmYWxzZSAmJlxuICAgICAgICAoIWUudG91Y2hlcyB8fCAhcy5tb3ZhYmxlLmNvbG9yIHx8IHBpZWNlIHx8IHByZXZpb3VzbHlTZWxlY3RlZCB8fCBwaWVjZUNsb3NlVG8ocywgcG9zaXRpb24pKSlcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGhhZFByZW1vdmUgPSAhIXMucHJlbW92YWJsZS5jdXJyZW50O1xuICAgIGNvbnN0IGhhZFByZWRyb3AgPSAhIXMucHJlZHJvcHBhYmxlLmN1cnJlbnQ7XG4gICAgcy5zdGF0cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuICAgIGlmIChzLnNlbGVjdGVkICYmIGJvYXJkLmNhbk1vdmUocywgcy5zZWxlY3RlZCwgb3JpZykpIHtcbiAgICAgICAgYW5pbV8xLmFuaW0oc3RhdGUgPT4gYm9hcmQuc2VsZWN0U3F1YXJlKHN0YXRlLCBvcmlnKSwgcyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBib2FyZC5zZWxlY3RTcXVhcmUocywgb3JpZyk7XG4gICAgfVxuICAgIGNvbnN0IHN0aWxsU2VsZWN0ZWQgPSBzLnNlbGVjdGVkID09PSBvcmlnO1xuICAgIGNvbnN0IGVsZW1lbnQgPSBwaWVjZUVsZW1lbnRCeUtleShzLCBvcmlnKTtcbiAgICBjb25zdCBmaXJzdFJhbmtJczAgPSBzLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICBpZiAocGllY2UgJiYgZWxlbWVudCAmJiBzdGlsbFNlbGVjdGVkICYmIGJvYXJkLmlzRHJhZ2dhYmxlKHMsIG9yaWcpKSB7XG4gICAgICAgIGNvbnN0IHNxdWFyZUJvdW5kcyA9IGNvbXB1dGVTcXVhcmVCb3VuZHMob3JpZywgYXNXaGl0ZSwgYm91bmRzLCBzLmRpbWVuc2lvbnMpO1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0ge1xuICAgICAgICAgICAgb3JpZzogb3JpZyxcbiAgICAgICAgICAgIG9yaWdQb3M6IHV0aWwua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLFxuICAgICAgICAgICAgcGllY2U6IHBpZWNlLFxuICAgICAgICAgICAgcmVsOiBwb3NpdGlvbixcbiAgICAgICAgICAgIGVwb3M6IHBvc2l0aW9uLFxuICAgICAgICAgICAgcG9zOiBbMCwgMF0sXG4gICAgICAgICAgICBkZWM6IHMuZHJhZ2dhYmxlLmNlbnRlclBpZWNlID8gW1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uWzBdIC0gKHNxdWFyZUJvdW5kcy5sZWZ0ICsgc3F1YXJlQm91bmRzLndpZHRoIC8gMiksXG4gICAgICAgICAgICAgICAgcG9zaXRpb25bMV0gLSAoc3F1YXJlQm91bmRzLnRvcCArIHNxdWFyZUJvdW5kcy5oZWlnaHQgLyAyKVxuICAgICAgICAgICAgXSA6IFswLCAwXSxcbiAgICAgICAgICAgIHN0YXJ0ZWQ6IHMuZHJhZ2dhYmxlLmF1dG9EaXN0YW5jZSAmJiBzLnN0YXRzLmRyYWdnZWQsXG4gICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50LFxuICAgICAgICAgICAgcHJldmlvdXNseVNlbGVjdGVkOiBwcmV2aW91c2x5U2VsZWN0ZWQsXG4gICAgICAgICAgICBvcmlnaW5UYXJnZXQ6IGUudGFyZ2V0XG4gICAgICAgIH07XG4gICAgICAgIGVsZW1lbnQuY2dEcmFnZ2luZyA9IHRydWU7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICAgICAgY29uc3QgZ2hvc3QgPSBzLmRvbS5lbGVtZW50cy5naG9zdDtcbiAgICAgICAgaWYgKGdob3N0KSB7XG4gICAgICAgICAgICBnaG9zdC5jbGFzc05hbWUgPSBgZ2hvc3QgJHtwaWVjZS5jb2xvcn0gJHtwaWVjZS5yb2xlfWA7XG4gICAgICAgICAgICB1dGlsLnRyYW5zbGF0ZUFicyhnaG9zdCwgdXRpbC5wb3NUb1RyYW5zbGF0ZUFicyhib3VuZHMsIHMuZGltZW5zaW9ucykodXRpbC5rZXkycG9zKG9yaWcsIGZpcnN0UmFua0lzMCksIGFzV2hpdGUpKTtcbiAgICAgICAgICAgIHV0aWwuc2V0VmlzaWJsZShnaG9zdCwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcHJvY2Vzc0RyYWcocyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoaGFkUHJlbW92ZSlcbiAgICAgICAgICAgIGJvYXJkLnVuc2V0UHJlbW92ZShzKTtcbiAgICAgICAgaWYgKGhhZFByZWRyb3ApXG4gICAgICAgICAgICBib2FyZC51bnNldFByZWRyb3Aocyk7XG4gICAgfVxuICAgIHMuZG9tLnJlZHJhdygpO1xufVxuZXhwb3J0cy5zdGFydCA9IHN0YXJ0O1xuZnVuY3Rpb24gcGllY2VDbG9zZVRvKHMsIHBvcykge1xuICAgIGNvbnN0IGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKSwgcmFkaXVzU3EgPSBNYXRoLnBvdyhib3VuZHMud2lkdGggLyA4LCAyKTtcbiAgICBmb3IgKGxldCBrZXkgaW4gcy5waWVjZXMpIHtcbiAgICAgICAgY29uc3Qgc3F1YXJlQm91bmRzID0gY29tcHV0ZVNxdWFyZUJvdW5kcyhrZXksIGFzV2hpdGUsIGJvdW5kcywgcy5kaW1lbnNpb25zKSwgY2VudGVyID0gW1xuICAgICAgICAgICAgc3F1YXJlQm91bmRzLmxlZnQgKyBzcXVhcmVCb3VuZHMud2lkdGggLyAyLFxuICAgICAgICAgICAgc3F1YXJlQm91bmRzLnRvcCArIHNxdWFyZUJvdW5kcy5oZWlnaHQgLyAyXG4gICAgICAgIF07XG4gICAgICAgIGlmICh1dGlsLmRpc3RhbmNlU3EoY2VudGVyLCBwb3MpIDw9IHJhZGl1c1NxKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydHMucGllY2VDbG9zZVRvID0gcGllY2VDbG9zZVRvO1xuZnVuY3Rpb24gZHJhZ05ld1BpZWNlKHMsIHBpZWNlLCBlLCBmb3JjZSkge1xuICAgIGNvbnN0IGtleSA9ICdhMCc7XG4gICAgcy5waWVjZXNba2V5XSA9IHBpZWNlO1xuICAgIHMuZG9tLnJlZHJhdygpO1xuICAgIGNvbnN0IHBvc2l0aW9uID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpLCBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgYm91bmRzID0gcy5kb20uYm91bmRzKCksIHNxdWFyZUJvdW5kcyA9IGNvbXB1dGVTcXVhcmVCb3VuZHMoa2V5LCBhc1doaXRlLCBib3VuZHMsIHMuZGltZW5zaW9ucyk7XG4gICAgY29uc3QgcmVsID0gW1xuICAgICAgICAoYXNXaGl0ZSA/IDAgOiBzLmRpbWVuc2lvbnMud2lkdGggLSAxKSAqIHNxdWFyZUJvdW5kcy53aWR0aCArIGJvdW5kcy5sZWZ0LFxuICAgICAgICAoYXNXaGl0ZSA/IHMuZGltZW5zaW9ucy5oZWlnaHQgOiAtMSkgKiBzcXVhcmVCb3VuZHMuaGVpZ2h0ICsgYm91bmRzLnRvcFxuICAgIF07XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gcy5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHtcbiAgICAgICAgb3JpZzoga2V5LFxuICAgICAgICBvcmlnUG9zOiB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApLFxuICAgICAgICBwaWVjZTogcGllY2UsXG4gICAgICAgIHJlbDogcmVsLFxuICAgICAgICBlcG9zOiBwb3NpdGlvbixcbiAgICAgICAgcG9zOiBbcG9zaXRpb25bMF0gLSByZWxbMF0sIHBvc2l0aW9uWzFdIC0gcmVsWzFdXSxcbiAgICAgICAgZGVjOiBbLXNxdWFyZUJvdW5kcy53aWR0aCAvIDIsIC1zcXVhcmVCb3VuZHMuaGVpZ2h0IC8gMl0sXG4gICAgICAgIHN0YXJ0ZWQ6IHRydWUsXG4gICAgICAgIGVsZW1lbnQ6ICgpID0+IHBpZWNlRWxlbWVudEJ5S2V5KHMsIGtleSksXG4gICAgICAgIG9yaWdpblRhcmdldDogZS50YXJnZXQsXG4gICAgICAgIG5ld1BpZWNlOiB0cnVlLFxuICAgICAgICBmb3JjZTogZm9yY2UgfHwgZmFsc2VcbiAgICB9O1xuICAgIHByb2Nlc3NEcmFnKHMpO1xufVxuZXhwb3J0cy5kcmFnTmV3UGllY2UgPSBkcmFnTmV3UGllY2U7XG5mdW5jdGlvbiBwcm9jZXNzRHJhZyhzKSB7XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgY29uc3QgY3VyID0gcy5kcmFnZ2FibGUuY3VycmVudDtcbiAgICAgICAgaWYgKCFjdXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmIChzLmFuaW1hdGlvbi5jdXJyZW50ICYmIHMuYW5pbWF0aW9uLmN1cnJlbnQucGxhbi5hbmltc1tjdXIub3JpZ10pXG4gICAgICAgICAgICBzLmFuaW1hdGlvbi5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBvcmlnUGllY2UgPSBzLnBpZWNlc1tjdXIub3JpZ107XG4gICAgICAgIGlmICghb3JpZ1BpZWNlIHx8ICF1dGlsLnNhbWVQaWVjZShvcmlnUGllY2UsIGN1ci5waWVjZSkpXG4gICAgICAgICAgICBjYW5jZWwocyk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKCFjdXIuc3RhcnRlZCAmJiB1dGlsLmRpc3RhbmNlU3EoY3VyLmVwb3MsIGN1ci5yZWwpID49IE1hdGgucG93KHMuZHJhZ2dhYmxlLmRpc3RhbmNlLCAyKSlcbiAgICAgICAgICAgICAgICBjdXIuc3RhcnRlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoY3VyLnN0YXJ0ZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGN1ci5lbGVtZW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gY3VyLmVsZW1lbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVsZW1lbnQgPSBmb3VuZDtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVsZW1lbnQuY2dEcmFnZ2luZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGN1ci5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKTtcbiAgICAgICAgICAgICAgICBjdXIucG9zID0gW1xuICAgICAgICAgICAgICAgICAgICBjdXIuZXBvc1swXSAtIGN1ci5yZWxbMF0sXG4gICAgICAgICAgICAgICAgICAgIGN1ci5lcG9zWzFdIC0gY3VyLnJlbFsxXVxuICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgICAgY29uc3QgdHJhbnNsYXRpb24gPSB1dGlsLnBvc1RvVHJhbnNsYXRlQWJzKGJvdW5kcywgcy5kaW1lbnNpb25zKShjdXIub3JpZ1BvcywgYXNXaGl0ZSk7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRpb25bMF0gKz0gY3VyLnBvc1swXSArIGN1ci5kZWNbMF07XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRpb25bMV0gKz0gY3VyLnBvc1sxXSArIGN1ci5kZWNbMV07XG4gICAgICAgICAgICAgICAgdXRpbC50cmFuc2xhdGVBYnMoY3VyLmVsZW1lbnQsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBwcm9jZXNzRHJhZyhzKTtcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIG1vdmUocywgZSkge1xuICAgIGlmIChzLmRyYWdnYWJsZS5jdXJyZW50ICYmICghZS50b3VjaGVzIHx8IGUudG91Y2hlcy5sZW5ndGggPCAyKSkge1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50LmVwb3MgPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgfVxufVxuZXhwb3J0cy5tb3ZlID0gbW92ZTtcbmZ1bmN0aW9uIGVuZChzLCBlKSB7XG4gICAgY29uc3QgY3VyID0gcy5kcmFnZ2FibGUuY3VycmVudDtcbiAgICBpZiAoIWN1cilcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaGVuZCcgJiYgZS5jYW5jZWxhYmxlICE9PSBmYWxzZSlcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaGVuZCcgJiYgY3VyICYmIGN1ci5vcmlnaW5UYXJnZXQgIT09IGUudGFyZ2V0ICYmICFjdXIubmV3UGllY2UpIHtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIGNvbnN0IGV2ZW50UG9zID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpIHx8IGN1ci5lcG9zO1xuICAgIGNvbnN0IGRlc3QgPSBib2FyZC5nZXRLZXlBdERvbVBvcyhldmVudFBvcywgcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgcy5kb20uYm91bmRzKCksIHMuZ2VvbWV0cnkpO1xuICAgIGlmIChkZXN0ICYmIGN1ci5zdGFydGVkKSB7XG4gICAgICAgIGlmIChjdXIubmV3UGllY2UpXG4gICAgICAgICAgICBib2FyZC5kcm9wTmV3UGllY2UocywgY3VyLm9yaWcsIGRlc3QsIGN1ci5mb3JjZSk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcy5zdGF0cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuICAgICAgICAgICAgaWYgKGJvYXJkLnVzZXJNb3ZlKHMsIGN1ci5vcmlnLCBkZXN0KSlcbiAgICAgICAgICAgICAgICBzLnN0YXRzLmRyYWdnZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGN1ci5uZXdQaWVjZSkge1xuICAgICAgICBkZWxldGUgcy5waWVjZXNbY3VyLm9yaWddO1xuICAgIH1cbiAgICBlbHNlIGlmIChzLmRyYWdnYWJsZS5kZWxldGVPbkRyb3BPZmYpIHtcbiAgICAgICAgZGVsZXRlIHMucGllY2VzW2N1ci5vcmlnXTtcbiAgICAgICAgYm9hcmQuY2FsbFVzZXJGdW5jdGlvbihzLmV2ZW50cy5jaGFuZ2UpO1xuICAgIH1cbiAgICBpZiAoY3VyICYmIGN1ci5vcmlnID09PSBjdXIucHJldmlvdXNseVNlbGVjdGVkICYmIChjdXIub3JpZyA9PT0gZGVzdCB8fCAhZGVzdCkpXG4gICAgICAgIGJvYXJkLnVuc2VsZWN0KHMpO1xuICAgIGVsc2UgaWYgKCFzLnNlbGVjdGFibGUuZW5hYmxlZClcbiAgICAgICAgYm9hcmQudW5zZWxlY3Qocyk7XG4gICAgcmVtb3ZlRHJhZ0VsZW1lbnRzKHMpO1xuICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgcy5kb20ucmVkcmF3KCk7XG59XG5leHBvcnRzLmVuZCA9IGVuZDtcbmZ1bmN0aW9uIGNhbmNlbChzKSB7XG4gICAgY29uc3QgY3VyID0gcy5kcmFnZ2FibGUuY3VycmVudDtcbiAgICBpZiAoY3VyKSB7XG4gICAgICAgIGlmIChjdXIubmV3UGllY2UpXG4gICAgICAgICAgICBkZWxldGUgcy5waWVjZXNbY3VyLm9yaWddO1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBib2FyZC51bnNlbGVjdChzKTtcbiAgICAgICAgcmVtb3ZlRHJhZ0VsZW1lbnRzKHMpO1xuICAgICAgICBzLmRvbS5yZWRyYXcoKTtcbiAgICB9XG59XG5leHBvcnRzLmNhbmNlbCA9IGNhbmNlbDtcbmZ1bmN0aW9uIHJlbW92ZURyYWdFbGVtZW50cyhzKSB7XG4gICAgY29uc3QgZSA9IHMuZG9tLmVsZW1lbnRzO1xuICAgIGlmIChlLmdob3N0KVxuICAgICAgICB1dGlsLnNldFZpc2libGUoZS5naG9zdCwgZmFsc2UpO1xufVxuZnVuY3Rpb24gY29tcHV0ZVNxdWFyZUJvdW5kcyhrZXksIGFzV2hpdGUsIGJvdW5kcywgYmQpIHtcbiAgICBjb25zdCBmaXJzdFJhbmtJczAgPSBiZC5oZWlnaHQgPT09IDEwO1xuICAgIGNvbnN0IHBvcyA9IHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMCk7XG4gICAgaWYgKCFhc1doaXRlKSB7XG4gICAgICAgIHBvc1swXSA9IGJkLndpZHRoICsgMSAtIHBvc1swXTtcbiAgICAgICAgcG9zWzFdID0gYmQuaGVpZ2h0ICsgMSAtIHBvc1sxXTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGVmdDogYm91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggKiAocG9zWzBdIC0gMSkgLyBiZC53aWR0aCxcbiAgICAgICAgdG9wOiBib3VuZHMudG9wICsgYm91bmRzLmhlaWdodCAqIChiZC5oZWlnaHQgLSBwb3NbMV0pIC8gYmQuaGVpZ2h0LFxuICAgICAgICB3aWR0aDogYm91bmRzLndpZHRoIC8gYmQud2lkdGgsXG4gICAgICAgIGhlaWdodDogYm91bmRzLmhlaWdodCAvIGJkLmhlaWdodFxuICAgIH07XG59XG5mdW5jdGlvbiBwaWVjZUVsZW1lbnRCeUtleShzLCBrZXkpIHtcbiAgICBsZXQgZWwgPSBzLmRvbS5lbGVtZW50cy5ib2FyZC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChlbCkge1xuICAgICAgICBpZiAoZWwuY2dLZXkgPT09IGtleSAmJiBlbC50YWdOYW1lID09PSAnUElFQ0UnKVxuICAgICAgICAgICAgcmV0dXJuIGVsO1xuICAgICAgICBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCBib2FyZF8xID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgYnJ1c2hlcyA9IFsnZ3JlZW4nLCAncmVkJywgJ2JsdWUnLCAneWVsbG93J107XG5mdW5jdGlvbiBzdGFydChzdGF0ZSwgZSkge1xuICAgIGlmIChlLnRvdWNoZXMgJiYgZS50b3VjaGVzLmxlbmd0aCA+IDEpXG4gICAgICAgIHJldHVybjtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLmN0cmxLZXkgPyBib2FyZF8xLnVuc2VsZWN0KHN0YXRlKSA6IGJvYXJkXzEuY2FuY2VsTW92ZShzdGF0ZSk7XG4gICAgY29uc3QgcG9zaXRpb24gPSB1dGlsXzEuZXZlbnRQb3NpdGlvbihlKTtcbiAgICBjb25zdCBvcmlnID0gYm9hcmRfMS5nZXRLZXlBdERvbVBvcyhwb3NpdGlvbiwgc3RhdGUub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIHN0YXRlLmRvbS5ib3VuZHMoKSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgIGlmICghb3JpZylcbiAgICAgICAgcmV0dXJuO1xuICAgIHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIG9yaWc6IG9yaWcsXG4gICAgICAgIHBvczogcG9zaXRpb24sXG4gICAgICAgIGJydXNoOiBldmVudEJydXNoKGUpXG4gICAgfTtcbiAgICBwcm9jZXNzRHJhdyhzdGF0ZSk7XG59XG5leHBvcnRzLnN0YXJ0ID0gc3RhcnQ7XG5mdW5jdGlvbiBwcm9jZXNzRHJhdyhzdGF0ZSkge1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGN1ciA9IHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQ7XG4gICAgICAgIGlmIChjdXIpIHtcbiAgICAgICAgICAgIGNvbnN0IG1vdXNlU3EgPSBib2FyZF8xLmdldEtleUF0RG9tUG9zKGN1ci5wb3MsIHN0YXRlLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBzdGF0ZS5kb20uYm91bmRzKCksIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgICAgIGlmIChtb3VzZVNxICE9PSBjdXIubW91c2VTcSkge1xuICAgICAgICAgICAgICAgIGN1ci5tb3VzZVNxID0gbW91c2VTcTtcbiAgICAgICAgICAgICAgICBjdXIuZGVzdCA9IG1vdXNlU3EgIT09IGN1ci5vcmlnID8gbW91c2VTcSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcm9jZXNzRHJhdyhzdGF0ZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbmV4cG9ydHMucHJvY2Vzc0RyYXcgPSBwcm9jZXNzRHJhdztcbmZ1bmN0aW9uIG1vdmUoc3RhdGUsIGUpIHtcbiAgICBpZiAoc3RhdGUuZHJhd2FibGUuY3VycmVudClcbiAgICAgICAgc3RhdGUuZHJhd2FibGUuY3VycmVudC5wb3MgPSB1dGlsXzEuZXZlbnRQb3NpdGlvbihlKTtcbn1cbmV4cG9ydHMubW92ZSA9IG1vdmU7XG5mdW5jdGlvbiBlbmQoc3RhdGUpIHtcbiAgICBjb25zdCBjdXIgPSBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50O1xuICAgIGlmIChjdXIpIHtcbiAgICAgICAgaWYgKGN1ci5tb3VzZVNxKVxuICAgICAgICAgICAgYWRkU2hhcGUoc3RhdGUuZHJhd2FibGUsIGN1cik7XG4gICAgICAgIGNhbmNlbChzdGF0ZSk7XG4gICAgfVxufVxuZXhwb3J0cy5lbmQgPSBlbmQ7XG5mdW5jdGlvbiBjYW5jZWwoc3RhdGUpIHtcbiAgICBpZiAoc3RhdGUuZHJhd2FibGUuY3VycmVudCkge1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuZXhwb3J0cy5jYW5jZWwgPSBjYW5jZWw7XG5mdW5jdGlvbiBjbGVhcihzdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5kcmF3YWJsZS5zaGFwZXMubGVuZ3RoKSB7XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnNoYXBlcyA9IFtdO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgIG9uQ2hhbmdlKHN0YXRlLmRyYXdhYmxlKTtcbiAgICB9XG59XG5leHBvcnRzLmNsZWFyID0gY2xlYXI7XG5mdW5jdGlvbiBldmVudEJydXNoKGUpIHtcbiAgICBjb25zdCBhID0gZS5zaGlmdEtleSAmJiB1dGlsXzEuaXNSaWdodEJ1dHRvbihlKSA/IDEgOiAwO1xuICAgIGNvbnN0IGIgPSBlLmFsdEtleSA/IDIgOiAwO1xuICAgIHJldHVybiBicnVzaGVzW2EgKyBiXTtcbn1cbmZ1bmN0aW9uIG5vdChmKSB7XG4gICAgcmV0dXJuICh4KSA9PiAhZih4KTtcbn1cbmZ1bmN0aW9uIGFkZFNoYXBlKGRyYXdhYmxlLCBjdXIpIHtcbiAgICBjb25zdCBzYW1lU2hhcGUgPSAocykgPT4ge1xuICAgICAgICByZXR1cm4gcy5vcmlnID09PSBjdXIub3JpZyAmJiBzLmRlc3QgPT09IGN1ci5kZXN0O1xuICAgIH07XG4gICAgY29uc3Qgc2ltaWxhciA9IGRyYXdhYmxlLnNoYXBlcy5maWx0ZXIoc2FtZVNoYXBlKVswXTtcbiAgICBpZiAoc2ltaWxhcilcbiAgICAgICAgZHJhd2FibGUuc2hhcGVzID0gZHJhd2FibGUuc2hhcGVzLmZpbHRlcihub3Qoc2FtZVNoYXBlKSk7XG4gICAgaWYgKCFzaW1pbGFyIHx8IHNpbWlsYXIuYnJ1c2ggIT09IGN1ci5icnVzaClcbiAgICAgICAgZHJhd2FibGUuc2hhcGVzLnB1c2goY3VyKTtcbiAgICBvbkNoYW5nZShkcmF3YWJsZSk7XG59XG5mdW5jdGlvbiBvbkNoYW5nZShkcmF3YWJsZSkge1xuICAgIGlmIChkcmF3YWJsZS5vbkNoYW5nZSlcbiAgICAgICAgZHJhd2FibGUub25DaGFuZ2UoZHJhd2FibGUuc2hhcGVzKTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgYm9hcmQgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgZHJhZ18xID0gcmVxdWlyZShcIi4vZHJhZ1wiKTtcbmZ1bmN0aW9uIHNldERyb3BNb2RlKHMsIHBpZWNlKSB7XG4gICAgcy5kcm9wbW9kZSA9IHtcbiAgICAgICAgYWN0aXZlOiB0cnVlLFxuICAgICAgICBwaWVjZVxuICAgIH07XG4gICAgZHJhZ18xLmNhbmNlbChzKTtcbn1cbmV4cG9ydHMuc2V0RHJvcE1vZGUgPSBzZXREcm9wTW9kZTtcbmZ1bmN0aW9uIGNhbmNlbERyb3BNb2RlKHMpIHtcbiAgICBzLmRyb3Btb2RlID0ge1xuICAgICAgICBhY3RpdmU6IGZhbHNlXG4gICAgfTtcbn1cbmV4cG9ydHMuY2FuY2VsRHJvcE1vZGUgPSBjYW5jZWxEcm9wTW9kZTtcbmZ1bmN0aW9uIGRyb3AocywgZSkge1xuICAgIGlmICghcy5kcm9wbW9kZS5hY3RpdmUpXG4gICAgICAgIHJldHVybjtcbiAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIGNvbnN0IHBpZWNlID0gcy5kcm9wbW9kZS5waWVjZTtcbiAgICBpZiAocGllY2UpIHtcbiAgICAgICAgcy5waWVjZXMuYTAgPSBwaWVjZTtcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgICAgIGNvbnN0IGRlc3QgPSBwb3NpdGlvbiAmJiBib2FyZC5nZXRLZXlBdERvbVBvcyhwb3NpdGlvbiwgcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgcy5kb20uYm91bmRzKCksIHMuZ2VvbWV0cnkpO1xuICAgICAgICBpZiAoZGVzdClcbiAgICAgICAgICAgIGJvYXJkLmRyb3BOZXdQaWVjZShzLCAnYTAnLCBkZXN0KTtcbiAgICB9XG4gICAgcy5kb20ucmVkcmF3KCk7XG59XG5leHBvcnRzLmRyb3AgPSBkcm9wO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCBkcmFnID0gcmVxdWlyZShcIi4vZHJhZ1wiKTtcbmNvbnN0IGRyYXcgPSByZXF1aXJlKFwiLi9kcmF3XCIpO1xuY29uc3QgZHJvcF8xID0gcmVxdWlyZShcIi4vZHJvcFwiKTtcbmNvbnN0IHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiBiaW5kQm9hcmQocykge1xuICAgIGlmIChzLnZpZXdPbmx5KVxuICAgICAgICByZXR1cm47XG4gICAgY29uc3QgYm9hcmRFbCA9IHMuZG9tLmVsZW1lbnRzLmJvYXJkLCBvblN0YXJ0ID0gc3RhcnREcmFnT3JEcmF3KHMpO1xuICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIG9uU3RhcnQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gICAgYm9hcmRFbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvblN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGlmIChzLmRpc2FibGVDb250ZXh0TWVudSB8fCBzLmRyYXdhYmxlLmVuYWJsZWQpIHtcbiAgICAgICAgYm9hcmRFbC5hZGRFdmVudExpc3RlbmVyKCdjb250ZXh0bWVudScsIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKTtcbiAgICB9XG59XG5leHBvcnRzLmJpbmRCb2FyZCA9IGJpbmRCb2FyZDtcbmZ1bmN0aW9uIGJpbmREb2N1bWVudChzLCByZWRyYXdBbGwpIHtcbiAgICBjb25zdCB1bmJpbmRzID0gW107XG4gICAgaWYgKCFzLmRvbS5yZWxhdGl2ZSAmJiBzLnJlc2l6YWJsZSkge1xuICAgICAgICBjb25zdCBvblJlc2l6ZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHMuZG9tLmJvdW5kcy5jbGVhcigpO1xuICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlZHJhd0FsbCk7XG4gICAgICAgIH07XG4gICAgICAgIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LmJvZHksICdjaGVzc2dyb3VuZC5yZXNpemUnLCBvblJlc2l6ZSkpO1xuICAgIH1cbiAgICBpZiAoIXMudmlld09ubHkpIHtcbiAgICAgICAgY29uc3Qgb25tb3ZlID0gZHJhZ09yRHJhdyhzLCBkcmFnLm1vdmUsIGRyYXcubW92ZSk7XG4gICAgICAgIGNvbnN0IG9uZW5kID0gZHJhZ09yRHJhdyhzLCBkcmFnLmVuZCwgZHJhdy5lbmQpO1xuICAgICAgICBbJ3RvdWNobW92ZScsICdtb3VzZW1vdmUnXS5mb3JFYWNoKGV2ID0+IHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LCBldiwgb25tb3ZlKSkpO1xuICAgICAgICBbJ3RvdWNoZW5kJywgJ21vdXNldXAnXS5mb3JFYWNoKGV2ID0+IHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LCBldiwgb25lbmQpKSk7XG4gICAgICAgIGNvbnN0IG9uU2Nyb2xsID0gKCkgPT4gcy5kb20uYm91bmRzLmNsZWFyKCk7XG4gICAgICAgIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKHdpbmRvdywgJ3Njcm9sbCcsIG9uU2Nyb2xsLCB7IHBhc3NpdmU6IHRydWUgfSkpO1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZSh3aW5kb3csICdyZXNpemUnLCBvblNjcm9sbCwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcbiAgICB9XG4gICAgcmV0dXJuICgpID0+IHVuYmluZHMuZm9yRWFjaChmID0+IGYoKSk7XG59XG5leHBvcnRzLmJpbmREb2N1bWVudCA9IGJpbmREb2N1bWVudDtcbmZ1bmN0aW9uIHVuYmluZGFibGUoZWwsIGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpO1xuICAgIHJldHVybiAoKSA9PiBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgY2FsbGJhY2spO1xufVxuZnVuY3Rpb24gc3RhcnREcmFnT3JEcmF3KHMpIHtcbiAgICByZXR1cm4gZSA9PiB7XG4gICAgICAgIGlmIChzLmRyYWdnYWJsZS5jdXJyZW50KVxuICAgICAgICAgICAgZHJhZy5jYW5jZWwocyk7XG4gICAgICAgIGVsc2UgaWYgKHMuZHJhd2FibGUuY3VycmVudClcbiAgICAgICAgICAgIGRyYXcuY2FuY2VsKHMpO1xuICAgICAgICBlbHNlIGlmIChlLnNoaWZ0S2V5IHx8IHV0aWxfMS5pc1JpZ2h0QnV0dG9uKGUpKSB7XG4gICAgICAgICAgICBpZiAocy5kcmF3YWJsZS5lbmFibGVkKVxuICAgICAgICAgICAgICAgIGRyYXcuc3RhcnQocywgZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXMudmlld09ubHkpIHtcbiAgICAgICAgICAgIGlmIChzLmRyb3Btb2RlLmFjdGl2ZSlcbiAgICAgICAgICAgICAgICBkcm9wXzEuZHJvcChzLCBlKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBkcmFnLnN0YXJ0KHMsIGUpO1xuICAgICAgICB9XG4gICAgfTtcbn1cbmZ1bmN0aW9uIGRyYWdPckRyYXcocywgd2l0aERyYWcsIHdpdGhEcmF3KSB7XG4gICAgcmV0dXJuIGUgPT4ge1xuICAgICAgICBpZiAoZS5zaGlmdEtleSB8fCB1dGlsXzEuaXNSaWdodEJ1dHRvbihlKSkge1xuICAgICAgICAgICAgaWYgKHMuZHJhd2FibGUuZW5hYmxlZClcbiAgICAgICAgICAgICAgICB3aXRoRHJhdyhzLCBlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghcy52aWV3T25seSlcbiAgICAgICAgICAgIHdpdGhEcmFnKHMsIGUpO1xuICAgIH07XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIGV4cGxvc2lvbihzdGF0ZSwga2V5cykge1xuICAgIHN0YXRlLmV4cGxvZGluZyA9IHtcbiAgICAgICAgc3RhZ2U6IDEsXG4gICAgICAgIGtleXM6IGtleXNcbiAgICB9O1xuICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgc2V0U3RhZ2Uoc3RhdGUsIDIpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHNldFN0YWdlKHN0YXRlLCB1bmRlZmluZWQpLCAxMjApO1xuICAgIH0sIDEyMCk7XG59XG5leHBvcnRzLmRlZmF1bHQgPSBleHBsb3Npb247XG5mdW5jdGlvbiBzZXRTdGFnZShzdGF0ZSwgc3RhZ2UpIHtcbiAgICBpZiAoc3RhdGUuZXhwbG9kaW5nKSB7XG4gICAgICAgIGlmIChzdGFnZSlcbiAgICAgICAgICAgIHN0YXRlLmV4cGxvZGluZy5zdGFnZSA9IHN0YWdlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBzdGF0ZS5leHBsb2RpbmcgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5jb25zdCBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZXhwb3J0cy5pbml0aWFsID0gJ3JuYnFrYm5yL3BwcHBwcHBwLzgvOC84LzgvUFBQUFBQUFAvUk5CUUtCTlInO1xuY29uc3Qgcm9sZXM4ID0ge1xuICAgIHA6ICdwYXduJywgcjogJ3Jvb2snLCBuOiAna25pZ2h0JywgYjogJ2Jpc2hvcCcsIHE6ICdxdWVlbicsIGs6ICdraW5nJywgbTogJ21ldCcsIGY6ICdmZXJ6JywgczogJ3NpbHZlcicsIGM6ICdjYW5jZWxsb3InLCBhOiAnYXJjaGJpc2hvcCcsIGg6ICdoYXdrJywgZTogJ2VsZXBoYW50J1xufTtcbmNvbnN0IHJvbGVzOSA9IHtcbiAgICBwOiAncGF3bicsIHI6ICdyb29rJywgbjogJ2tuaWdodCcsIGI6ICdiaXNob3AnLCBrOiAna2luZycsIGc6ICdnb2xkJywgczogJ3NpbHZlcicsIGw6ICdsYW5jZSdcbn07XG5jb25zdCByb2xlczEwID0ge1xuICAgIHA6ICdwYXduJywgcjogJ3Jvb2snLCBuOiAna25pZ2h0JywgYjogJ2Jpc2hvcCcsIGs6ICdraW5nJywgYzogJ2Nhbm5vbicsIGE6ICdhZHZpc29yJ1xufTtcbmNvbnN0IGxldHRlcnM4ID0ge1xuICAgIHBhd246ICdwJywgcm9vazogJ3InLCBrbmlnaHQ6ICduJywgYmlzaG9wOiAnYicsIHF1ZWVuOiAncScsIGtpbmc6ICdrJywgbWV0OiAnbScsIGZlcno6ICdmJywgc2lsdmVyOiAncycsIGNhbmNlbGxvcjogJ2MnLCBhcmNoYmlzaG9wOiAnYScsIGhhd2s6ICdoJywgZWxlcGhhbnQ6ICdlJ1xufTtcbmNvbnN0IGxldHRlcnM5ID0ge1xuICAgIHBhd246ICdwJywgcm9vazogJ3InLCBrbmlnaHQ6ICduJywgYmlzaG9wOiAnYicsIGtpbmc6ICdrJywgZ29sZDogJ2cnLCBzaWx2ZXI6ICdzJywgbGFuY2U6ICdsJyxcbiAgICBwcGF3bjogJytwJywgcGtuaWdodDogJytuJywgcGJpc2hvcDogJytiJywgcHJvb2s6ICcrcicsIHBzaWx2ZXI6ICcrcycsIHBsYW5jZTogJytsJ1xufTtcbmNvbnN0IGxldHRlcnMxMCA9IHtcbiAgICBwYXduOiAncCcsIHJvb2s6ICdyJywga25pZ2h0OiAnbicsIGJpc2hvcDogJ2InLCBraW5nOiAnaycsIGNhbm5vbjogJ2MnLCBhZHZpc29yOiAnYSdcbn07XG5mdW5jdGlvbiByZWFkKGZlbikge1xuICAgIGlmIChmZW4gPT09ICdzdGFydCcpXG4gICAgICAgIGZlbiA9IGV4cG9ydHMuaW5pdGlhbDtcbiAgICBpZiAoZmVuLmluZGV4T2YoJ1snKSAhPT0gLTEpXG4gICAgICAgIGZlbiA9IGZlbi5zbGljZSgwLCBmZW4uaW5kZXhPZignWycpKTtcbiAgICBjb25zdCBwaWVjZXMgPSB7fTtcbiAgICBsZXQgcm93ID0gZmVuLnNwbGl0KFwiL1wiKS5sZW5ndGg7XG4gICAgbGV0IGNvbCA9IDA7XG4gICAgbGV0IHByb21vdGVkID0gZmFsc2U7XG4gICAgY29uc3Qgcm9sZXMgPSByb3cgPT09IDEwID8gcm9sZXMxMCA6IHJvdyA9PT0gOSA/IHJvbGVzOSA6IHJvbGVzODtcbiAgICBjb25zdCBmaXJzdFJhbmtJczAgPSByb3cgPT09IDEwO1xuICAgIGNvbnN0IHNob2dpID0gcm93ID09PSA5O1xuICAgIGZvciAoY29uc3QgYyBvZiBmZW4pIHtcbiAgICAgICAgc3dpdGNoIChjKSB7XG4gICAgICAgICAgICBjYXNlICcgJzogcmV0dXJuIHBpZWNlcztcbiAgICAgICAgICAgIGNhc2UgJy8nOlxuICAgICAgICAgICAgICAgIC0tcm93O1xuICAgICAgICAgICAgICAgIGlmIChyb3cgPT09IDApXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwaWVjZXM7XG4gICAgICAgICAgICAgICAgY29sID0gMDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJysnOlxuICAgICAgICAgICAgICAgIHByb21vdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ34nOlxuICAgICAgICAgICAgICAgIGNvbnN0IHBpZWNlID0gcGllY2VzW2NnLmZpbGVzW2NvbF0gKyBjZy5yYW5rc1tmaXJzdFJhbmtJczAgPyByb3cgOiByb3cgKyAxXV07XG4gICAgICAgICAgICAgICAgaWYgKHBpZWNlKVxuICAgICAgICAgICAgICAgICAgICBwaWVjZS5wcm9tb3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGNvbnN0IG5iID0gYy5jaGFyQ29kZUF0KDApO1xuICAgICAgICAgICAgICAgIGlmIChuYiA8IDU4KVxuICAgICAgICAgICAgICAgICAgICBjb2wgKz0gKGMgPT09ICcwJykgPyA5IDogbmIgLSA0ODtcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgKytjb2w7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwaWVjZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGVzW3JvbGVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IChjID09PSByb2xlID8gc2hvZ2kgPyAnd2hpdGUnIDogJ2JsYWNrJyA6IHNob2dpID8gJ2JsYWNrJyA6ICd3aGl0ZScpXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9tb3RlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGllY2Uucm9sZSA9ICdwJyArIHBpZWNlLnJvbGU7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZS5wcm9tb3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9tb3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNob2dpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZXNbY2cuZmlsZXNbMTAgLSBjb2wgLSAxXSArIGNnLnJhbmtzWzEwIC0gcm93XV0gPSBwaWVjZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBpZWNlc1tjZy5maWxlc1tjb2wgLSAxXSArIGNnLnJhbmtzW2ZpcnN0UmFua0lzMCA/IHJvdyAtIDEgOiByb3ddXSA9IHBpZWNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpZWNlcztcbn1cbmV4cG9ydHMucmVhZCA9IHJlYWQ7XG5mdW5jdGlvbiB3cml0ZShwaWVjZXMsIGdlb20pIHtcbiAgICBjb25zdCBoZWlnaHQgPSBjZy5kaW1lbnNpb25zW2dlb21dLmhlaWdodDtcbiAgICB2YXIgbGV0dGVycyA9IHt9O1xuICAgIHN3aXRjaCAoaGVpZ2h0KSB7XG4gICAgICAgIGNhc2UgMTA6XG4gICAgICAgICAgICBsZXR0ZXJzID0gbGV0dGVyczEwO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgOTpcbiAgICAgICAgICAgIGxldHRlcnMgPSBsZXR0ZXJzOTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgbGV0dGVycyA9IGxldHRlcnM4O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIDtcbiAgICByZXR1cm4gdXRpbF8xLmludk5SYW5rcy5tYXAoeSA9PiB1dGlsXzEuTlJhbmtzLm1hcCh4ID0+IHtcbiAgICAgICAgY29uc3QgcGllY2UgPSBwaWVjZXNbdXRpbF8xLnBvczJrZXkoW3gsIHldLCBnZW9tKV07XG4gICAgICAgIGlmIChwaWVjZSkge1xuICAgICAgICAgICAgY29uc3QgbGV0dGVyID0gbGV0dGVyc1twaWVjZS5yb2xlXTtcbiAgICAgICAgICAgIHJldHVybiBwaWVjZS5jb2xvciA9PT0gJ3doaXRlJyA/IGxldHRlci50b1VwcGVyQ2FzZSgpIDogbGV0dGVyO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiAnMSc7XG4gICAgfSkuam9pbignJykpLmpvaW4oJy8nKS5yZXBsYWNlKC8xezIsfS9nLCBzID0+IHMubGVuZ3RoLnRvU3RyaW5nKCkpO1xufVxuZXhwb3J0cy53cml0ZSA9IHdyaXRlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IGNnID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5mdW5jdGlvbiBkaWZmKGEsIGIpIHtcbiAgICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpO1xufVxuZnVuY3Rpb24gcGF3bihjb2xvcikge1xuICAgIHJldHVybiAoeDEsIHkxLCB4MiwgeTIpID0+IGRpZmYoeDEsIHgyKSA8IDIgJiYgKGNvbG9yID09PSAnd2hpdGUnID8gKHkyID09PSB5MSArIDEgfHwgKHkxIDw9IDIgJiYgeTIgPT09ICh5MSArIDIpICYmIHgxID09PSB4MikpIDogKHkyID09PSB5MSAtIDEgfHwgKHkxID49IDcgJiYgeTIgPT09ICh5MSAtIDIpICYmIHgxID09PSB4MikpKTtcbn1cbmNvbnN0IGtuaWdodCA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIGNvbnN0IHhkID0gZGlmZih4MSwgeDIpO1xuICAgIGNvbnN0IHlkID0gZGlmZih5MSwgeTIpO1xuICAgIHJldHVybiAoeGQgPT09IDEgJiYgeWQgPT09IDIpIHx8ICh4ZCA9PT0gMiAmJiB5ZCA9PT0gMSk7XG59O1xuY29uc3QgYmlzaG9wID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpO1xufTtcbmNvbnN0IHJvb2sgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4geDEgPT09IHgyIHx8IHkxID09PSB5Mjtcbn07XG5jb25zdCBxdWVlbiA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiBiaXNob3AoeDEsIHkxLCB4MiwgeTIpIHx8IHJvb2soeDEsIHkxLCB4MiwgeTIpO1xufTtcbmZ1bmN0aW9uIGtpbmcoY29sb3IsIHJvb2tGaWxlcywgY2FuQ2FzdGxlKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMikgfHwgKGNhbkNhc3RsZSAmJiB5MSA9PT0geTIgJiYgeTEgPT09IChjb2xvciA9PT0gJ3doaXRlJyA/IDEgOiA4KSAmJiAoKHgxID09PSA1ICYmICh4MiA9PT0gMyB8fCB4MiA9PT0gNykpIHx8IHV0aWwuY29udGFpbnNYKHJvb2tGaWxlcywgeDIpKSk7XG59XG5jb25zdCBtZXQgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpID09PSBkaWZmKHkxLCB5MikgJiYgZGlmZih4MSwgeDIpID09PSAxO1xufTtcbmNvbnN0IGFyY2hiaXNob3AgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gYmlzaG9wKHgxLCB5MSwgeDIsIHkyKSB8fCBrbmlnaHQoeDEsIHkxLCB4MiwgeTIpO1xufTtcbmNvbnN0IGNhbmNlbGxvciA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiByb29rKHgxLCB5MSwgeDIsIHkyKSB8fCBrbmlnaHQoeDEsIHkxLCB4MiwgeTIpO1xufTtcbmZ1bmN0aW9uIGxhbmNlKGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKHgyID09PSB4MSAmJiAoY29sb3IgPT09ICd3aGl0ZScgPyB5MiA+IHkxIDogeTIgPCB5MSkpO1xufVxuZnVuY3Rpb24gc2lsdmVyKGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKG1ldCh4MSwgeTEsIHgyLCB5MikgfHwgKHgxID09PSB4MiAmJiBjb2xvciA9PT0gJ3doaXRlJyA/IHkyID09PSB5MSArIDEgOiB5MiA9PT0geTEgLSAxKSk7XG59XG5mdW5jdGlvbiBnb2xkKGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMiAmJiAoY29sb3IgPT09ICd3aGl0ZScgP1xuICAgICAgICAhKCh4MiA9PT0geDEgLSAxICYmIHkyID09PSB5MSAtIDEpIHx8ICh4MiA9PT0geDEgKyAxICYmIHkyID09PSB5MSAtIDEpKSA6XG4gICAgICAgICEoKHgyID09PSB4MSArIDEgJiYgeTIgPT09IHkxICsgMSkgfHwgKHgyID09PSB4MSAtIDEgJiYgeTIgPT09IHkxICsgMSkpKSk7XG59XG5mdW5jdGlvbiBzcGF3bihjb2xvcikge1xuICAgIHJldHVybiAoeDEsIHkxLCB4MiwgeTIpID0+ICh4MiA9PT0geDEgJiYgY29sb3IgPT09ICd3aGl0ZScgPyB5MiA9PT0geTEgKyAxIDogeTIgPT09IHkxIC0gMSk7XG59XG5mdW5jdGlvbiBza25pZ2h0KGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gY29sb3IgPT09ICd3aGl0ZScgP1xuICAgICAgICAoeTIgPT09IHkxICsgMiAmJiB4MiA9PT0geDEgLSAxIHx8IHkyID09PSB5MSArIDIgJiYgeDIgPT09IHgxICsgMSkgOlxuICAgICAgICAoeTIgPT09IHkxIC0gMiAmJiB4MiA9PT0geDEgLSAxIHx8IHkyID09PSB5MSAtIDIgJiYgeDIgPT09IHgxICsgMSk7XG59XG5jb25zdCBwcm9vayA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiByb29rKHgxLCB5MSwgeDIsIHkyKSB8fCAoZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyKTtcbn07XG5jb25zdCBwYmlzaG9wID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIGJpc2hvcCh4MSwgeTEsIHgyLCB5MikgfHwgKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMik7XG59O1xuY29uc3Qgc2tpbmcgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyO1xufTtcbmZ1bmN0aW9uIHhwYXduKGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKHgyID09PSB4MSAmJiBjb2xvciA9PT0gJ3doaXRlJyA/IHkyID09PSB5MSArIDEgOiB5MiA9PT0geTEgLSAxKTtcbn1cbmNvbnN0IHhiaXNob3AgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpID09PSBkaWZmKHkxLCB5MikgJiYgZGlmZih4MSwgeDIpID09PSAyO1xufTtcbmNvbnN0IGFkdmlzb3IgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpID09PSBkaWZmKHkxLCB5MikgJiYgZGlmZih4MSwgeDIpID09PSAxO1xufTtcbmNvbnN0IHhraW5nID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuICh4MSA9PT0geDIgfHwgeTEgPT09IHkyKSAmJiBkaWZmKHgxLCB4MikgPT09IDE7XG59O1xuZnVuY3Rpb24gcm9va0ZpbGVzT2YocGllY2VzLCBjb2xvciwgZmlyc3RSYW5rSXMwKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHBpZWNlcykuZmlsdGVyKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0gcGllY2VzW2tleV07XG4gICAgICAgIHJldHVybiBwaWVjZSAmJiBwaWVjZS5jb2xvciA9PT0gY29sb3IgJiYgcGllY2Uucm9sZSA9PT0gJ3Jvb2snO1xuICAgIH0pLm1hcCgoa2V5KSA9PiB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApWzBdKTtcbn1cbmZ1bmN0aW9uIHByZW1vdmUocGllY2VzLCBrZXksIGNhbkNhc3RsZSwgZ2VvbSkge1xuICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IGNnLmRpbWVuc2lvbnNbZ2VvbV0uaGVpZ2h0ID09PSAxMDtcbiAgICBjb25zdCBwaWVjZSA9IHBpZWNlc1trZXldLCBwb3MgPSB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApO1xuICAgIGxldCBtb2JpbGl0eTtcbiAgICBzd2l0Y2ggKGdlb20pIHtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgc3dpdGNoIChwaWVjZS5yb2xlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAncGF3bic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0geHBhd24ocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdjYW5ub24nOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3Jvb2snOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHJvb2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tuaWdodCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0ga25pZ2h0O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHhiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Fkdmlzb3InOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGFkdmlzb3I7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tpbmcnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHhraW5nO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgc3dpdGNoIChwaWVjZS5yb2xlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAncGF3bic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gc3Bhd24ocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdrbmlnaHQnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNrbmlnaHQocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGJpc2hvcDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncm9vayc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcm9vaztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna2luZyc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gc2tpbmc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NpbHZlcic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gc2lsdmVyKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncHBhd24nOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3BsYW5jZSc6XG4gICAgICAgICAgICAgICAgY2FzZSAncGtuaWdodCc6XG4gICAgICAgICAgICAgICAgY2FzZSAncHNpbHZlcic6XG4gICAgICAgICAgICAgICAgY2FzZSAnZ29sZCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gZ29sZChwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2xhbmNlJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBsYW5jZShwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Byb29rJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBwcm9vaztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncGJpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcGJpc2hvcDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBzd2l0Y2ggKHBpZWNlLnJvbGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdwYXduJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBwYXduKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna25pZ2h0JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBrbmlnaHQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gYmlzaG9wO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdyb29rJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSByb29rO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdxdWVlbic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcXVlZW47XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tpbmcnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGtpbmcocGllY2UuY29sb3IsIHJvb2tGaWxlc09mKHBpZWNlcywgcGllY2UuY29sb3IsIGZpcnN0UmFua0lzMCksIGNhbkNhc3RsZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2hhd2snOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2FyY2hiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGFyY2hiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2VsZXBoYW50JzpcbiAgICAgICAgICAgICAgICBjYXNlICdjYW5jZWxsb3InOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGNhbmNlbGxvcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbWV0JzpcbiAgICAgICAgICAgICAgICBjYXNlICdmZXJ6JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBtZXQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NpbHZlcic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gc2lsdmVyKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICA7XG4gICAgfVxuICAgIDtcbiAgICBjb25zdCBhbGxrZXlzID0gdXRpbC5hbGxLZXlzW2dlb21dO1xuICAgIGNvbnN0IHBvczJrZXlHZW9tID0gKGdlb20pID0+ICgocG9zKSA9PiB1dGlsLnBvczJrZXkocG9zLCBnZW9tKSk7XG4gICAgY29uc3QgcG9zMmtleSA9IHBvczJrZXlHZW9tKGdlb20pO1xuICAgIGNvbnN0IGtleTJwb3NSYW5rMCA9IChmaXJzdHJhbmswKSA9PiAoKGtleSkgPT4gdXRpbC5rZXkycG9zKGtleSwgZmlyc3RyYW5rMCkpO1xuICAgIGNvbnN0IGtleTJwb3MgPSBrZXkycG9zUmFuazAoZmlyc3RSYW5rSXMwKTtcbiAgICByZXR1cm4gYWxsa2V5cy5tYXAoa2V5MnBvcykuZmlsdGVyKHBvczIgPT4ge1xuICAgICAgICByZXR1cm4gKHBvc1swXSAhPT0gcG9zMlswXSB8fCBwb3NbMV0gIT09IHBvczJbMV0pICYmIG1vYmlsaXR5KHBvc1swXSwgcG9zWzFdLCBwb3MyWzBdLCBwb3MyWzFdKTtcbiAgICB9KS5tYXAocG9zMmtleSk7XG59XG5leHBvcnRzLmRlZmF1bHQgPSBwcmVtb3ZlO1xuO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiByZW5kZXIocykge1xuICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIGNvbnN0IGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBwb3NUb1RyYW5zbGF0ZSA9IHMuZG9tLnJlbGF0aXZlID8gdXRpbC5wb3NUb1RyYW5zbGF0ZVJlbCA6IHV0aWwucG9zVG9UcmFuc2xhdGVBYnMocy5kb20uYm91bmRzKCksIHMuZGltZW5zaW9ucyksIHRyYW5zbGF0ZSA9IHMuZG9tLnJlbGF0aXZlID8gdXRpbC50cmFuc2xhdGVSZWwgOiB1dGlsLnRyYW5zbGF0ZUFicywgYm9hcmRFbCA9IHMuZG9tLmVsZW1lbnRzLmJvYXJkLCBwaWVjZXMgPSBzLnBpZWNlcywgY3VyQW5pbSA9IHMuYW5pbWF0aW9uLmN1cnJlbnQsIGFuaW1zID0gY3VyQW5pbSA/IGN1ckFuaW0ucGxhbi5hbmltcyA6IHt9LCBmYWRpbmdzID0gY3VyQW5pbSA/IGN1ckFuaW0ucGxhbi5mYWRpbmdzIDoge30sIGN1ckRyYWcgPSBzLmRyYWdnYWJsZS5jdXJyZW50LCBzcXVhcmVzID0gY29tcHV0ZVNxdWFyZUNsYXNzZXMocyksIHNhbWVQaWVjZXMgPSB7fSwgc2FtZVNxdWFyZXMgPSB7fSwgbW92ZWRQaWVjZXMgPSB7fSwgbW92ZWRTcXVhcmVzID0ge30sIHBpZWNlc0tleXMgPSBPYmplY3Qua2V5cyhwaWVjZXMpO1xuICAgIGxldCBrLCBwLCBlbCwgcGllY2VBdEtleSwgZWxQaWVjZU5hbWUsIGFuaW0sIGZhZGluZywgcE12ZHNldCwgcE12ZCwgc012ZHNldCwgc012ZDtcbiAgICBlbCA9IGJvYXJkRWwuZmlyc3RDaGlsZDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgayA9IGVsLmNnS2V5O1xuICAgICAgICBpZiAoaXNQaWVjZU5vZGUoZWwpKSB7XG4gICAgICAgICAgICBwaWVjZUF0S2V5ID0gcGllY2VzW2tdO1xuICAgICAgICAgICAgYW5pbSA9IGFuaW1zW2tdO1xuICAgICAgICAgICAgZmFkaW5nID0gZmFkaW5nc1trXTtcbiAgICAgICAgICAgIGVsUGllY2VOYW1lID0gZWwuY2dQaWVjZTtcbiAgICAgICAgICAgIGlmIChlbC5jZ0RyYWdnaW5nICYmICghY3VyRHJhZyB8fCBjdXJEcmFnLm9yaWcgIT09IGspKSB7XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCksIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgIGVsLmNnRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZmFkaW5nICYmIGVsLmNnRmFkaW5nKSB7XG4gICAgICAgICAgICAgICAgZWwuY2dGYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdmYWRpbmcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwaWVjZUF0S2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW0gJiYgZWwuY2dBbmltYXRpbmcgJiYgZWxQaWVjZU5hbWUgPT09IHBpZWNlTmFtZU9mKHBpZWNlQXRLZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBvcyA9IHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCk7XG4gICAgICAgICAgICAgICAgICAgIHBvc1swXSArPSBhbmltWzJdO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMV0gKz0gYW5pbVszXTtcbiAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnYW5pbScpO1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHBvcywgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGVsLmNnQW5pbWF0aW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsLmNnQW5pbWF0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2FuaW0nKTtcbiAgICAgICAgICAgICAgICAgICAgdHJhbnNsYXRlKGVsLCBwb3NUb1RyYW5zbGF0ZSh1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHMuYWRkUGllY2VaSW5kZXgpXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5zdHlsZS56SW5kZXggPSBwb3NaSW5kZXgodXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKSwgYXNXaGl0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChlbFBpZWNlTmFtZSA9PT0gcGllY2VOYW1lT2YocGllY2VBdEtleSkgJiYgKCFmYWRpbmcgfHwgIWVsLmNnRmFkaW5nKSkge1xuICAgICAgICAgICAgICAgICAgICBzYW1lUGllY2VzW2tdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmYWRpbmcgJiYgZWxQaWVjZU5hbWUgPT09IHBpZWNlTmFtZU9mKGZhZGluZykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5hZGQoJ2ZhZGluZycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2dGYWRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0ucHVzaChlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdID0gW2VsXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0pXG4gICAgICAgICAgICAgICAgICAgIG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXS5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXSA9IFtlbF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNTcXVhcmVOb2RlKGVsKSkge1xuICAgICAgICAgICAgY29uc3QgY24gPSBlbC5jbGFzc05hbWU7XG4gICAgICAgICAgICBpZiAoc3F1YXJlc1trXSA9PT0gY24pXG4gICAgICAgICAgICAgICAgc2FtZVNxdWFyZXNba10gPSB0cnVlO1xuICAgICAgICAgICAgZWxzZSBpZiAobW92ZWRTcXVhcmVzW2NuXSlcbiAgICAgICAgICAgICAgICBtb3ZlZFNxdWFyZXNbY25dLnB1c2goZWwpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG1vdmVkU3F1YXJlc1tjbl0gPSBbZWxdO1xuICAgICAgICB9XG4gICAgICAgIGVsID0gZWwubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc2sgaW4gc3F1YXJlcykge1xuICAgICAgICBpZiAoIXNhbWVTcXVhcmVzW3NrXSkge1xuICAgICAgICAgICAgc012ZHNldCA9IG1vdmVkU3F1YXJlc1tzcXVhcmVzW3NrXV07XG4gICAgICAgICAgICBzTXZkID0gc012ZHNldCAmJiBzTXZkc2V0LnBvcCgpO1xuICAgICAgICAgICAgY29uc3QgdHJhbnNsYXRpb24gPSBwb3NUb1RyYW5zbGF0ZSh1dGlsXzEua2V5MnBvcyhzaywgZmlyc3RSYW5rSXMwKSwgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKTtcbiAgICAgICAgICAgIGlmIChzTXZkKSB7XG4gICAgICAgICAgICAgICAgc012ZC5jZ0tleSA9IHNrO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShzTXZkLCB0cmFuc2xhdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzcXVhcmVOb2RlID0gdXRpbF8xLmNyZWF0ZUVsKCdzcXVhcmUnLCBzcXVhcmVzW3NrXSk7XG4gICAgICAgICAgICAgICAgc3F1YXJlTm9kZS5jZ0tleSA9IHNrO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShzcXVhcmVOb2RlLCB0cmFuc2xhdGlvbik7XG4gICAgICAgICAgICAgICAgYm9hcmRFbC5pbnNlcnRCZWZvcmUoc3F1YXJlTm9kZSwgYm9hcmRFbC5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGogaW4gcGllY2VzS2V5cykge1xuICAgICAgICBrID0gcGllY2VzS2V5c1tqXTtcbiAgICAgICAgcCA9IHBpZWNlc1trXTtcbiAgICAgICAgYW5pbSA9IGFuaW1zW2tdO1xuICAgICAgICBpZiAoIXNhbWVQaWVjZXNba10pIHtcbiAgICAgICAgICAgIHBNdmRzZXQgPSBtb3ZlZFBpZWNlc1twaWVjZU5hbWVPZihwKV07XG4gICAgICAgICAgICBwTXZkID0gcE12ZHNldCAmJiBwTXZkc2V0LnBvcCgpO1xuICAgICAgICAgICAgaWYgKHBNdmQpIHtcbiAgICAgICAgICAgICAgICBwTXZkLmNnS2V5ID0gaztcbiAgICAgICAgICAgICAgICBpZiAocE12ZC5jZ0ZhZGluZykge1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNsYXNzTGlzdC5yZW1vdmUoJ2ZhZGluZycpO1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNnRmFkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHBvcyA9IHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCk7XG4gICAgICAgICAgICAgICAgaWYgKHMuYWRkUGllY2VaSW5kZXgpXG4gICAgICAgICAgICAgICAgICAgIHBNdmQuc3R5bGUuekluZGV4ID0gcG9zWkluZGV4KHBvcywgYXNXaGl0ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5jZ0FuaW1hdGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHBNdmQuY2xhc3NMaXN0LmFkZCgnYW5pbScpO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMF0gKz0gYW5pbVsyXTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzFdICs9IGFuaW1bM107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShwTXZkLCBwb3NUb1RyYW5zbGF0ZShwb3MsIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGllY2VOYW1lID0gcGllY2VOYW1lT2YocCksIHBpZWNlTm9kZSA9IHV0aWxfMS5jcmVhdGVFbCgncGllY2UnLCBwaWVjZU5hbWUpLCBwb3MgPSB1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApO1xuICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5jZ1BpZWNlID0gcGllY2VOYW1lO1xuICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5jZ0tleSA9IGs7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnQW5pbWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUocGllY2VOb2RlLCBwb3NUb1RyYW5zbGF0ZShwb3MsIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgIGlmIChzLmFkZFBpZWNlWkluZGV4KVxuICAgICAgICAgICAgICAgICAgICBwaWVjZU5vZGUuc3R5bGUuekluZGV4ID0gcG9zWkluZGV4KHBvcywgYXNXaGl0ZSk7XG4gICAgICAgICAgICAgICAgYm9hcmRFbC5hcHBlbmRDaGlsZChwaWVjZU5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgaSBpbiBtb3ZlZFBpZWNlcylcbiAgICAgICAgcmVtb3ZlTm9kZXMocywgbW92ZWRQaWVjZXNbaV0pO1xuICAgIGZvciAoY29uc3QgaSBpbiBtb3ZlZFNxdWFyZXMpXG4gICAgICAgIHJlbW92ZU5vZGVzKHMsIG1vdmVkU3F1YXJlc1tpXSk7XG59XG5leHBvcnRzLmRlZmF1bHQgPSByZW5kZXI7XG5mdW5jdGlvbiBpc1BpZWNlTm9kZShlbCkge1xuICAgIHJldHVybiBlbC50YWdOYW1lID09PSAnUElFQ0UnO1xufVxuZnVuY3Rpb24gaXNTcXVhcmVOb2RlKGVsKSB7XG4gICAgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdTUVVBUkUnO1xufVxuZnVuY3Rpb24gcmVtb3ZlTm9kZXMocywgbm9kZXMpIHtcbiAgICBmb3IgKGNvbnN0IGkgaW4gbm9kZXMpXG4gICAgICAgIHMuZG9tLmVsZW1lbnRzLmJvYXJkLnJlbW92ZUNoaWxkKG5vZGVzW2ldKTtcbn1cbmZ1bmN0aW9uIHBvc1pJbmRleChwb3MsIGFzV2hpdGUpIHtcbiAgICBsZXQgeiA9IDIgKyAocG9zWzFdIC0gMSkgKiA4ICsgKDggLSBwb3NbMF0pO1xuICAgIGlmIChhc1doaXRlKVxuICAgICAgICB6ID0gNjcgLSB6O1xuICAgIHJldHVybiB6ICsgJyc7XG59XG5mdW5jdGlvbiBwaWVjZU5hbWVPZihwaWVjZSkge1xuICAgIHJldHVybiBgJHtwaWVjZS5jb2xvcn0gJHtwaWVjZS5yb2xlfWA7XG59XG5mdW5jdGlvbiBjb21wdXRlU3F1YXJlQ2xhc3NlcyhzKSB7XG4gICAgY29uc3Qgc3F1YXJlcyA9IHt9O1xuICAgIGxldCBpLCBrO1xuICAgIGlmIChzLmxhc3RNb3ZlICYmIHMuaGlnaGxpZ2h0Lmxhc3RNb3ZlKVxuICAgICAgICBmb3IgKGkgaW4gcy5sYXN0TW92ZSkge1xuICAgICAgICAgICAgaWYgKHMubGFzdE1vdmVbaV0gIT0gJ2EwJykge1xuICAgICAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLmxhc3RNb3ZlW2ldLCAnbGFzdC1tb3ZlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICBpZiAocy5jaGVjayAmJiBzLmhpZ2hsaWdodC5jaGVjaylcbiAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMuY2hlY2ssICdjaGVjaycpO1xuICAgIGlmIChzLnNlbGVjdGVkKSB7XG4gICAgICAgIGlmIChzLnNlbGVjdGVkICE9ICdhMCcpIHtcbiAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLnNlbGVjdGVkLCAnc2VsZWN0ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocy5tb3ZhYmxlLnNob3dEZXN0cykge1xuICAgICAgICAgICAgY29uc3QgZGVzdHMgPSBzLm1vdmFibGUuZGVzdHMgJiYgcy5tb3ZhYmxlLmRlc3RzW3Muc2VsZWN0ZWRdO1xuICAgICAgICAgICAgaWYgKGRlc3RzKVxuICAgICAgICAgICAgICAgIGZvciAoaSBpbiBkZXN0cykge1xuICAgICAgICAgICAgICAgICAgICBrID0gZGVzdHNbaV07XG4gICAgICAgICAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAnbW92ZS1kZXN0JyArIChzLnBpZWNlc1trXSA/ICcgb2MnIDogJycpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwRGVzdHMgPSBzLnByZW1vdmFibGUuZGVzdHM7XG4gICAgICAgICAgICBpZiAocERlc3RzKVxuICAgICAgICAgICAgICAgIGZvciAoaSBpbiBwRGVzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgayA9IHBEZXN0c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdwcmVtb3ZlLWRlc3QnICsgKHMucGllY2VzW2tdID8gJyBvYycgOiAnJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBwcmVtb3ZlID0gcy5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKHByZW1vdmUpXG4gICAgICAgIGZvciAoaSBpbiBwcmVtb3ZlKVxuICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHByZW1vdmVbaV0sICdjdXJyZW50LXByZW1vdmUnKTtcbiAgICBlbHNlIGlmIChzLnByZWRyb3BwYWJsZS5jdXJyZW50KVxuICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcy5wcmVkcm9wcGFibGUuY3VycmVudC5rZXksICdjdXJyZW50LXByZW1vdmUnKTtcbiAgICBjb25zdCBvID0gcy5leHBsb2Rpbmc7XG4gICAgaWYgKG8pXG4gICAgICAgIGZvciAoaSBpbiBvLmtleXMpXG4gICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgby5rZXlzW2ldLCAnZXhwbG9kaW5nJyArIG8uc3RhZ2UpO1xuICAgIHJldHVybiBzcXVhcmVzO1xufVxuZnVuY3Rpb24gYWRkU3F1YXJlKHNxdWFyZXMsIGtleSwga2xhc3MpIHtcbiAgICBpZiAoc3F1YXJlc1trZXldKVxuICAgICAgICBzcXVhcmVzW2tleV0gKz0gJyAnICsga2xhc3M7XG4gICAgZWxzZVxuICAgICAgICBzcXVhcmVzW2tleV0gPSBrbGFzcztcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgZmVuID0gcmVxdWlyZShcIi4vZmVuXCIpO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIGRlZmF1bHRzKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHBpZWNlczogZmVuLnJlYWQoZmVuLmluaXRpYWwpLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3doaXRlJyxcbiAgICAgICAgdHVybkNvbG9yOiAnd2hpdGUnLFxuICAgICAgICBjb29yZGluYXRlczogdHJ1ZSxcbiAgICAgICAgYXV0b0Nhc3RsZTogdHJ1ZSxcbiAgICAgICAgdmlld09ubHk6IGZhbHNlLFxuICAgICAgICBkaXNhYmxlQ29udGV4dE1lbnU6IGZhbHNlLFxuICAgICAgICByZXNpemFibGU6IHRydWUsXG4gICAgICAgIGFkZFBpZWNlWkluZGV4OiBmYWxzZSxcbiAgICAgICAgcGllY2VLZXk6IGZhbHNlLFxuICAgICAgICBoaWdobGlnaHQ6IHtcbiAgICAgICAgICAgIGxhc3RNb3ZlOiB0cnVlLFxuICAgICAgICAgICAgY2hlY2s6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgYW5pbWF0aW9uOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgZHVyYXRpb246IDIwMFxuICAgICAgICB9LFxuICAgICAgICBtb3ZhYmxlOiB7XG4gICAgICAgICAgICBmcmVlOiB0cnVlLFxuICAgICAgICAgICAgY29sb3I6ICdib3RoJyxcbiAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcbiAgICAgICAgICAgIGV2ZW50czoge30sXG4gICAgICAgICAgICByb29rQ2FzdGxlOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIHByZW1vdmFibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBzaG93RGVzdHM6IHRydWUsXG4gICAgICAgICAgICBjYXN0bGU6IHRydWUsXG4gICAgICAgICAgICBldmVudHM6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIHByZWRyb3BwYWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICBldmVudHM6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIGRyYWdnYWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGRpc3RhbmNlOiAzLFxuICAgICAgICAgICAgYXV0b0Rpc3RhbmNlOiB0cnVlLFxuICAgICAgICAgICAgY2VudGVyUGllY2U6IHRydWUsXG4gICAgICAgICAgICBzaG93R2hvc3Q6IHRydWUsXG4gICAgICAgICAgICBkZWxldGVPbkRyb3BPZmY6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIGRyb3Btb2RlOiB7XG4gICAgICAgICAgICBhY3RpdmU6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdGFibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdHM6IHtcbiAgICAgICAgICAgIGRyYWdnZWQ6ICEoJ29udG91Y2hzdGFydCcgaW4gd2luZG93KVxuICAgICAgICB9LFxuICAgICAgICBldmVudHM6IHt9LFxuICAgICAgICBkcmF3YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgICAgICBlcmFzZU9uQ2xpY2s6IHRydWUsXG4gICAgICAgICAgICBzaGFwZXM6IFtdLFxuICAgICAgICAgICAgYXV0b1NoYXBlczogW10sXG4gICAgICAgICAgICBicnVzaGVzOiB7XG4gICAgICAgICAgICAgICAgZ3JlZW46IHsga2V5OiAnZycsIGNvbG9yOiAnIzE1NzgxQicsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICByZWQ6IHsga2V5OiAncicsIGNvbG9yOiAnIzg4MjAyMCcsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICBibHVlOiB7IGtleTogJ2InLCBjb2xvcjogJyMwMDMwODgnLCBvcGFjaXR5OiAxLCBsaW5lV2lkdGg6IDEwIH0sXG4gICAgICAgICAgICAgICAgeWVsbG93OiB7IGtleTogJ3knLCBjb2xvcjogJyNlNjhmMDAnLCBvcGFjaXR5OiAxLCBsaW5lV2lkdGg6IDEwIH0sXG4gICAgICAgICAgICAgICAgcGFsZUJsdWU6IHsga2V5OiAncGInLCBjb2xvcjogJyMwMDMwODgnLCBvcGFjaXR5OiAwLjQsIGxpbmVXaWR0aDogMTUgfSxcbiAgICAgICAgICAgICAgICBwYWxlR3JlZW46IHsga2V5OiAncGcnLCBjb2xvcjogJyMxNTc4MUInLCBvcGFjaXR5OiAwLjQsIGxpbmVXaWR0aDogMTUgfSxcbiAgICAgICAgICAgICAgICBwYWxlUmVkOiB7IGtleTogJ3ByJywgY29sb3I6ICcjODgyMDIwJywgb3BhY2l0eTogMC40LCBsaW5lV2lkdGg6IDE1IH0sXG4gICAgICAgICAgICAgICAgcGFsZUdyZXk6IHsga2V5OiAncGdyJywgY29sb3I6ICcjNGE0YTRhJywgb3BhY2l0eTogMC4zNSwgbGluZVdpZHRoOiAxNSB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGllY2VzOiB7XG4gICAgICAgICAgICAgICAgYmFzZVVybDogJ2h0dHBzOi8vbGljaGVzczEub3JnL2Fzc2V0cy9waWVjZS9jYnVybmV0dC8nXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJldlN2Z0hhc2g6ICcnXG4gICAgICAgIH0sXG4gICAgICAgIGhvbGQ6IHV0aWxfMS50aW1lcigpLFxuICAgICAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiA4LCBoZWlnaHQ6IDggfSxcbiAgICAgICAgZ2VvbWV0cnk6IDAsXG4gICAgfTtcbn1cbmV4cG9ydHMuZGVmYXVsdHMgPSBkZWZhdWx0cztcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQodGFnTmFtZSkge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgdGFnTmFtZSk7XG59XG5leHBvcnRzLmNyZWF0ZUVsZW1lbnQgPSBjcmVhdGVFbGVtZW50O1xuZnVuY3Rpb24gcmVuZGVyU3ZnKHN0YXRlLCByb290KSB7XG4gICAgY29uc3QgZCA9IHN0YXRlLmRyYXdhYmxlLCBjdXJEID0gZC5jdXJyZW50LCBjdXIgPSBjdXJEICYmIGN1ckQubW91c2VTcSA/IGN1ckQgOiB1bmRlZmluZWQsIGFycm93RGVzdHMgPSB7fTtcbiAgICBkLnNoYXBlcy5jb25jYXQoZC5hdXRvU2hhcGVzKS5jb25jYXQoY3VyID8gW2N1cl0gOiBbXSkuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuZGVzdClcbiAgICAgICAgICAgIGFycm93RGVzdHNbcy5kZXN0XSA9IChhcnJvd0Rlc3RzW3MuZGVzdF0gfHwgMCkgKyAxO1xuICAgIH0pO1xuICAgIGNvbnN0IHNoYXBlcyA9IGQuc2hhcGVzLmNvbmNhdChkLmF1dG9TaGFwZXMpLm1hcCgocykgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2hhcGU6IHMsXG4gICAgICAgICAgICBjdXJyZW50OiBmYWxzZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChzLCBhcnJvd0Rlc3RzLCBmYWxzZSlcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBpZiAoY3VyKVxuICAgICAgICBzaGFwZXMucHVzaCh7XG4gICAgICAgICAgICBzaGFwZTogY3VyLFxuICAgICAgICAgICAgY3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChjdXIsIGFycm93RGVzdHMsIHRydWUpXG4gICAgICAgIH0pO1xuICAgIGNvbnN0IGZ1bGxIYXNoID0gc2hhcGVzLm1hcChzYyA9PiBzYy5oYXNoKS5qb2luKCcnKTtcbiAgICBpZiAoZnVsbEhhc2ggPT09IHN0YXRlLmRyYXdhYmxlLnByZXZTdmdIYXNoKVxuICAgICAgICByZXR1cm47XG4gICAgc3RhdGUuZHJhd2FibGUucHJldlN2Z0hhc2ggPSBmdWxsSGFzaDtcbiAgICBjb25zdCBkZWZzRWwgPSByb290LmZpcnN0Q2hpbGQ7XG4gICAgc3luY0RlZnMoZCwgc2hhcGVzLCBkZWZzRWwpO1xuICAgIHN5bmNTaGFwZXMoc3RhdGUsIHNoYXBlcywgZC5icnVzaGVzLCBhcnJvd0Rlc3RzLCByb290LCBkZWZzRWwpO1xufVxuZXhwb3J0cy5yZW5kZXJTdmcgPSByZW5kZXJTdmc7XG5mdW5jdGlvbiBzeW5jRGVmcyhkLCBzaGFwZXMsIGRlZnNFbCkge1xuICAgIGNvbnN0IGJydXNoZXMgPSB7fTtcbiAgICBsZXQgYnJ1c2g7XG4gICAgc2hhcGVzLmZvckVhY2gocyA9PiB7XG4gICAgICAgIGlmIChzLnNoYXBlLmRlc3QpIHtcbiAgICAgICAgICAgIGJydXNoID0gZC5icnVzaGVzW3Muc2hhcGUuYnJ1c2hdO1xuICAgICAgICAgICAgaWYgKHMuc2hhcGUubW9kaWZpZXJzKVxuICAgICAgICAgICAgICAgIGJydXNoID0gbWFrZUN1c3RvbUJydXNoKGJydXNoLCBzLnNoYXBlLm1vZGlmaWVycyk7XG4gICAgICAgICAgICBicnVzaGVzW2JydXNoLmtleV0gPSBicnVzaDtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGtleXNJbkRvbSA9IHt9O1xuICAgIGxldCBlbCA9IGRlZnNFbC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChlbCkge1xuICAgICAgICBrZXlzSW5Eb21bZWwuZ2V0QXR0cmlidXRlKCdjZ0tleScpXSA9IHRydWU7XG4gICAgICAgIGVsID0gZWwubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIGZvciAobGV0IGtleSBpbiBicnVzaGVzKSB7XG4gICAgICAgIGlmICgha2V5c0luRG9tW2tleV0pXG4gICAgICAgICAgICBkZWZzRWwuYXBwZW5kQ2hpbGQocmVuZGVyTWFya2VyKGJydXNoZXNba2V5XSkpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHN5bmNTaGFwZXMoc3RhdGUsIHNoYXBlcywgYnJ1c2hlcywgYXJyb3dEZXN0cywgcm9vdCwgZGVmc0VsKSB7XG4gICAgY29uc3QgYm91bmRzID0gc3RhdGUuZG9tLmJvdW5kcygpLCBoYXNoZXNJbkRvbSA9IHt9LCB0b1JlbW92ZSA9IFtdO1xuICAgIHNoYXBlcy5mb3JFYWNoKHNjID0+IHsgaGFzaGVzSW5Eb21bc2MuaGFzaF0gPSBmYWxzZTsgfSk7XG4gICAgbGV0IGVsID0gZGVmc0VsLm5leHRTaWJsaW5nLCBlbEhhc2g7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGVsSGFzaCA9IGVsLmdldEF0dHJpYnV0ZSgnY2dIYXNoJyk7XG4gICAgICAgIGlmIChoYXNoZXNJbkRvbS5oYXNPd25Qcm9wZXJ0eShlbEhhc2gpKVxuICAgICAgICAgICAgaGFzaGVzSW5Eb21bZWxIYXNoXSA9IHRydWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRvUmVtb3ZlLnB1c2goZWwpO1xuICAgICAgICBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgICB0b1JlbW92ZS5mb3JFYWNoKGVsID0+IHJvb3QucmVtb3ZlQ2hpbGQoZWwpKTtcbiAgICBzaGFwZXMuZm9yRWFjaChzYyA9PiB7XG4gICAgICAgIGlmICghaGFzaGVzSW5Eb21bc2MuaGFzaF0pXG4gICAgICAgICAgICByb290LmFwcGVuZENoaWxkKHJlbmRlclNoYXBlKHN0YXRlLCBzYywgYnJ1c2hlcywgYXJyb3dEZXN0cywgYm91bmRzKSk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiBzaGFwZUhhc2goeyBvcmlnLCBkZXN0LCBicnVzaCwgcGllY2UsIG1vZGlmaWVycyB9LCBhcnJvd0Rlc3RzLCBjdXJyZW50KSB7XG4gICAgcmV0dXJuIFtjdXJyZW50LCBvcmlnLCBkZXN0LCBicnVzaCwgZGVzdCAmJiBhcnJvd0Rlc3RzW2Rlc3RdID4gMSxcbiAgICAgICAgcGllY2UgJiYgcGllY2VIYXNoKHBpZWNlKSxcbiAgICAgICAgbW9kaWZpZXJzICYmIG1vZGlmaWVyc0hhc2gobW9kaWZpZXJzKVxuICAgIF0uZmlsdGVyKHggPT4geCkuam9pbignJyk7XG59XG5mdW5jdGlvbiBwaWVjZUhhc2gocGllY2UpIHtcbiAgICByZXR1cm4gW3BpZWNlLmNvbG9yLCBwaWVjZS5yb2xlLCBwaWVjZS5zY2FsZV0uZmlsdGVyKHggPT4geCkuam9pbignJyk7XG59XG5mdW5jdGlvbiBtb2RpZmllcnNIYXNoKG0pIHtcbiAgICByZXR1cm4gJycgKyAobS5saW5lV2lkdGggfHwgJycpO1xufVxuZnVuY3Rpb24gcmVuZGVyU2hhcGUoc3RhdGUsIHsgc2hhcGUsIGN1cnJlbnQsIGhhc2ggfSwgYnJ1c2hlcywgYXJyb3dEZXN0cywgYm91bmRzKSB7XG4gICAgY29uc3QgZmlyc3RSYW5rSXMwID0gc3RhdGUuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIGxldCBlbDtcbiAgICBpZiAoc2hhcGUucGllY2UpXG4gICAgICAgIGVsID0gcmVuZGVyUGllY2Uoc3RhdGUuZHJhd2FibGUucGllY2VzLmJhc2VVcmwsIG9yaWVudCh1dGlsXzEua2V5MnBvcyhzaGFwZS5vcmlnLCBmaXJzdFJhbmtJczApLCBzdGF0ZS5vcmllbnRhdGlvbiwgc3RhdGUuZGltZW5zaW9ucyksIHNoYXBlLnBpZWNlLCBib3VuZHMsIHN0YXRlLmRpbWVuc2lvbnMpO1xuICAgIGVsc2Uge1xuICAgICAgICBjb25zdCBvcmlnID0gb3JpZW50KHV0aWxfMS5rZXkycG9zKHNoYXBlLm9yaWcsIGZpcnN0UmFua0lzMCksIHN0YXRlLm9yaWVudGF0aW9uLCBzdGF0ZS5kaW1lbnNpb25zKTtcbiAgICAgICAgaWYgKHNoYXBlLm9yaWcgJiYgc2hhcGUuZGVzdCkge1xuICAgICAgICAgICAgbGV0IGJydXNoID0gYnJ1c2hlc1tzaGFwZS5icnVzaF07XG4gICAgICAgICAgICBpZiAoc2hhcGUubW9kaWZpZXJzKVxuICAgICAgICAgICAgICAgIGJydXNoID0gbWFrZUN1c3RvbUJydXNoKGJydXNoLCBzaGFwZS5tb2RpZmllcnMpO1xuICAgICAgICAgICAgZWwgPSByZW5kZXJBcnJvdyhicnVzaCwgb3JpZywgb3JpZW50KHV0aWxfMS5rZXkycG9zKHNoYXBlLmRlc3QsIGZpcnN0UmFua0lzMCksIHN0YXRlLm9yaWVudGF0aW9uLCBzdGF0ZS5kaW1lbnNpb25zKSwgY3VycmVudCwgYXJyb3dEZXN0c1tzaGFwZS5kZXN0XSA+IDEsIGJvdW5kcywgc3RhdGUuZGltZW5zaW9ucyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZWwgPSByZW5kZXJDaXJjbGUoYnJ1c2hlc1tzaGFwZS5icnVzaF0sIG9yaWcsIGN1cnJlbnQsIGJvdW5kcywgc3RhdGUuZGltZW5zaW9ucyk7XG4gICAgfVxuICAgIGVsLnNldEF0dHJpYnV0ZSgnY2dIYXNoJywgaGFzaCk7XG4gICAgcmV0dXJuIGVsO1xufVxuZnVuY3Rpb24gcmVuZGVyQ2lyY2xlKGJydXNoLCBwb3MsIGN1cnJlbnQsIGJvdW5kcywgYmQpIHtcbiAgICBjb25zdCBvID0gcG9zMnB4KHBvcywgYm91bmRzLCBiZCksIHdpZHRocyA9IGNpcmNsZVdpZHRoKGJvdW5kcywgYmQpLCByYWRpdXMgPSAoYm91bmRzLndpZHRoIC8gYmQud2lkdGgpIC8gMjtcbiAgICByZXR1cm4gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdjaXJjbGUnKSwge1xuICAgICAgICBzdHJva2U6IGJydXNoLmNvbG9yLFxuICAgICAgICAnc3Ryb2tlLXdpZHRoJzogd2lkdGhzW2N1cnJlbnQgPyAwIDogMV0sXG4gICAgICAgIGZpbGw6ICdub25lJyxcbiAgICAgICAgb3BhY2l0eTogb3BhY2l0eShicnVzaCwgY3VycmVudCksXG4gICAgICAgIGN4OiBvWzBdLFxuICAgICAgICBjeTogb1sxXSxcbiAgICAgICAgcjogcmFkaXVzIC0gd2lkdGhzWzFdIC8gMlxuICAgIH0pO1xufVxuZnVuY3Rpb24gcmVuZGVyQXJyb3coYnJ1c2gsIG9yaWcsIGRlc3QsIGN1cnJlbnQsIHNob3J0ZW4sIGJvdW5kcywgYmQpIHtcbiAgICBjb25zdCBtID0gYXJyb3dNYXJnaW4oYm91bmRzLCBzaG9ydGVuICYmICFjdXJyZW50LCBiZCksIGEgPSBwb3MycHgob3JpZywgYm91bmRzLCBiZCksIGIgPSBwb3MycHgoZGVzdCwgYm91bmRzLCBiZCksIGR4ID0gYlswXSAtIGFbMF0sIGR5ID0gYlsxXSAtIGFbMV0sIGFuZ2xlID0gTWF0aC5hdGFuMihkeSwgZHgpLCB4byA9IE1hdGguY29zKGFuZ2xlKSAqIG0sIHlvID0gTWF0aC5zaW4oYW5nbGUpICogbTtcbiAgICByZXR1cm4gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdsaW5lJyksIHtcbiAgICAgICAgc3Ryb2tlOiBicnVzaC5jb2xvcixcbiAgICAgICAgJ3N0cm9rZS13aWR0aCc6IGxpbmVXaWR0aChicnVzaCwgY3VycmVudCwgYm91bmRzLCBiZCksXG4gICAgICAgICdzdHJva2UtbGluZWNhcCc6ICdyb3VuZCcsXG4gICAgICAgICdtYXJrZXItZW5kJzogJ3VybCgjYXJyb3doZWFkLScgKyBicnVzaC5rZXkgKyAnKScsXG4gICAgICAgIG9wYWNpdHk6IG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpLFxuICAgICAgICB4MTogYVswXSxcbiAgICAgICAgeTE6IGFbMV0sXG4gICAgICAgIHgyOiBiWzBdIC0geG8sXG4gICAgICAgIHkyOiBiWzFdIC0geW9cbiAgICB9KTtcbn1cbmZ1bmN0aW9uIHJlbmRlclBpZWNlKGJhc2VVcmwsIHBvcywgcGllY2UsIGJvdW5kcywgYmQpIHtcbiAgICBjb25zdCBvID0gcG9zMnB4KHBvcywgYm91bmRzLCBiZCksIHdpZHRoID0gYm91bmRzLndpZHRoIC8gYmQud2lkdGggKiAocGllY2Uuc2NhbGUgfHwgMSksIGhlaWdodCA9IGJvdW5kcy53aWR0aCAvIGJkLmhlaWdodCAqIChwaWVjZS5zY2FsZSB8fCAxKSwgbmFtZSA9IHBpZWNlLmNvbG9yWzBdICsgKHBpZWNlLnJvbGUgPT09ICdrbmlnaHQnID8gJ24nIDogcGllY2Uucm9sZVswXSkudG9VcHBlckNhc2UoKTtcbiAgICByZXR1cm4gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdpbWFnZScpLCB7XG4gICAgICAgIGNsYXNzTmFtZTogYCR7cGllY2Uucm9sZX0gJHtwaWVjZS5jb2xvcn1gLFxuICAgICAgICB4OiBvWzBdIC0gd2lkdGggLyAyLFxuICAgICAgICB5OiBvWzFdIC0gaGVpZ2h0IC8gMixcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgaHJlZjogYmFzZVVybCArIG5hbWUgKyAnLnN2ZydcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIHJlbmRlck1hcmtlcihicnVzaCkge1xuICAgIGNvbnN0IG1hcmtlciA9IHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgnbWFya2VyJyksIHtcbiAgICAgICAgaWQ6ICdhcnJvd2hlYWQtJyArIGJydXNoLmtleSxcbiAgICAgICAgb3JpZW50OiAnYXV0bycsXG4gICAgICAgIG1hcmtlcldpZHRoOiA0LFxuICAgICAgICBtYXJrZXJIZWlnaHQ6IDgsXG4gICAgICAgIHJlZlg6IDIuMDUsXG4gICAgICAgIHJlZlk6IDIuMDFcbiAgICB9KTtcbiAgICBtYXJrZXIuYXBwZW5kQ2hpbGQoc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdwYXRoJyksIHtcbiAgICAgICAgZDogJ00wLDAgVjQgTDMsMiBaJyxcbiAgICAgICAgZmlsbDogYnJ1c2guY29sb3JcbiAgICB9KSk7XG4gICAgbWFya2VyLnNldEF0dHJpYnV0ZSgnY2dLZXknLCBicnVzaC5rZXkpO1xuICAgIHJldHVybiBtYXJrZXI7XG59XG5mdW5jdGlvbiBzZXRBdHRyaWJ1dGVzKGVsLCBhdHRycykge1xuICAgIGZvciAobGV0IGtleSBpbiBhdHRycylcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKGtleSwgYXR0cnNba2V5XSk7XG4gICAgcmV0dXJuIGVsO1xufVxuZnVuY3Rpb24gb3JpZW50KHBvcywgY29sb3IsIGJkKSB7XG4gICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gcG9zIDogW2JkLndpZHRoICsgMSAtIHBvc1swXSwgYmQuaGVpZ2h0ICsgMSAtIHBvc1sxXV07XG59XG5mdW5jdGlvbiBtYWtlQ3VzdG9tQnJ1c2goYmFzZSwgbW9kaWZpZXJzKSB7XG4gICAgY29uc3QgYnJ1c2ggPSB7XG4gICAgICAgIGNvbG9yOiBiYXNlLmNvbG9yLFxuICAgICAgICBvcGFjaXR5OiBNYXRoLnJvdW5kKGJhc2Uub3BhY2l0eSAqIDEwKSAvIDEwLFxuICAgICAgICBsaW5lV2lkdGg6IE1hdGgucm91bmQobW9kaWZpZXJzLmxpbmVXaWR0aCB8fCBiYXNlLmxpbmVXaWR0aClcbiAgICB9O1xuICAgIGJydXNoLmtleSA9IFtiYXNlLmtleSwgbW9kaWZpZXJzLmxpbmVXaWR0aF0uZmlsdGVyKHggPT4geCkuam9pbignJyk7XG4gICAgcmV0dXJuIGJydXNoO1xufVxuZnVuY3Rpb24gY2lyY2xlV2lkdGgoYm91bmRzLCBiZCkge1xuICAgIGNvbnN0IGJhc2UgPSBib3VuZHMud2lkdGggLyAoYmQud2lkdGggKiA2NCk7XG4gICAgcmV0dXJuIFszICogYmFzZSwgNCAqIGJhc2VdO1xufVxuZnVuY3Rpb24gbGluZVdpZHRoKGJydXNoLCBjdXJyZW50LCBib3VuZHMsIGJkKSB7XG4gICAgcmV0dXJuIChicnVzaC5saW5lV2lkdGggfHwgMTApICogKGN1cnJlbnQgPyAwLjg1IDogMSkgLyAoYmQud2lkdGggKiA2NCkgKiBib3VuZHMud2lkdGg7XG59XG5mdW5jdGlvbiBvcGFjaXR5KGJydXNoLCBjdXJyZW50KSB7XG4gICAgcmV0dXJuIChicnVzaC5vcGFjaXR5IHx8IDEpICogKGN1cnJlbnQgPyAwLjkgOiAxKTtcbn1cbmZ1bmN0aW9uIGFycm93TWFyZ2luKGJvdW5kcywgc2hvcnRlbiwgYmQpIHtcbiAgICByZXR1cm4gKHNob3J0ZW4gPyAyMCA6IDEwKSAvIChiZC53aWR0aCAqIDY0KSAqIGJvdW5kcy53aWR0aDtcbn1cbmZ1bmN0aW9uIHBvczJweChwb3MsIGJvdW5kcywgYmQpIHtcbiAgICByZXR1cm4gWyhwb3NbMF0gLSAwLjUpICogYm91bmRzLndpZHRoIC8gYmQud2lkdGgsIChiZC5oZWlnaHQgKyAwLjUgLSBwb3NbMV0pICogYm91bmRzLmhlaWdodCAvIGJkLmhlaWdodF07XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZmlsZXMgPSBbJ2EnLCAnYicsICdjJywgJ2QnLCAnZScsICdmJywgJ2cnLCAnaCcsICdpJywgJ2onXTtcbmV4cG9ydHMucmFua3MgPSBbJzAnLCAnMScsICcyJywgJzMnLCAnNCcsICc1JywgJzYnLCAnNycsICc4JywgJzknXTtcbjtcbmV4cG9ydHMuZGltZW5zaW9ucyA9IFt7IHdpZHRoOiA4LCBoZWlnaHQ6IDggfSwgeyB3aWR0aDogOSwgaGVpZ2h0OiA5IH0sIHsgd2lkdGg6IDEwLCBoZWlnaHQ6IDggfSwgeyB3aWR0aDogOSwgaGVpZ2h0OiAxMCB9XTtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuY29uc3QgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmV4cG9ydHMuY29sb3JzID0gWyd3aGl0ZScsICdibGFjayddO1xuZXhwb3J0cy5OUmFua3MgPSBbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdO1xuZXhwb3J0cy5pbnZOUmFua3MgPSBbMTAsIDksIDgsIDcsIDYsIDUsIDQsIDMsIDIsIDFdO1xuY29uc3QgZmlsZXM4ID0gY2cuZmlsZXMuc2xpY2UoMCwgOCk7XG5jb25zdCBmaWxlczkgPSBjZy5maWxlcy5zbGljZSgwLCA5KTtcbmNvbnN0IGZpbGVzMTAgPSBjZy5maWxlcy5zbGljZSgwLCAxMCk7XG5jb25zdCByYW5rczggPSBjZy5yYW5rcy5zbGljZSgxLCA5KTtcbmNvbnN0IHJhbmtzOSA9IGNnLnJhbmtzLnNsaWNlKDEsIDEwKTtcbmNvbnN0IHJhbmtzMTAgPSBjZy5yYW5rcy5zbGljZSgwLCAxMCk7XG5jb25zdCBhbGxLZXlzOHg4ID0gQXJyYXkucHJvdG90eXBlLmNvbmNhdCguLi5maWxlczgubWFwKGMgPT4gcmFua3M4Lm1hcChyID0+IGMgKyByKSkpO1xuY29uc3QgYWxsS2V5czl4OSA9IEFycmF5LnByb3RvdHlwZS5jb25jYXQoLi4uZmlsZXM5Lm1hcChjID0+IHJhbmtzOS5tYXAociA9PiBjICsgcikpKTtcbmNvbnN0IGFsbEtleXMxMHg4ID0gQXJyYXkucHJvdG90eXBlLmNvbmNhdCguLi5maWxlczEwLm1hcChjID0+IHJhbmtzOC5tYXAociA9PiBjICsgcikpKTtcbmNvbnN0IGFsbEtleXM5eDEwID0gQXJyYXkucHJvdG90eXBlLmNvbmNhdCguLi5maWxlczkubWFwKGMgPT4gcmFua3MxMC5tYXAociA9PiBjICsgcikpKTtcbmV4cG9ydHMuYWxsS2V5cyA9IFthbGxLZXlzOHg4LCBhbGxLZXlzOXg5LCBhbGxLZXlzMTB4OCwgYWxsS2V5czl4MTBdO1xuZnVuY3Rpb24gcG9zMmtleShwb3MsIGdlb20pIHtcbiAgICBjb25zdCBiZCA9IGNnLmRpbWVuc2lvbnNbZ2VvbV07XG4gICAgcmV0dXJuIGV4cG9ydHMuYWxsS2V5c1tnZW9tXVtiZC5oZWlnaHQgKiBwb3NbMF0gKyBwb3NbMV0gLSBiZC5oZWlnaHQgLSAxXTtcbn1cbmV4cG9ydHMucG9zMmtleSA9IHBvczJrZXk7XG5mdW5jdGlvbiBrZXkycG9zKGssIGZpcnN0UmFua0lzMCkge1xuICAgIGNvbnN0IHNoaWZ0ID0gZmlyc3RSYW5rSXMwID8gMSA6IDA7XG4gICAgcmV0dXJuIFtrLmNoYXJDb2RlQXQoMCkgLSA5Niwgay5jaGFyQ29kZUF0KDEpIC0gNDggKyBzaGlmdF07XG59XG5leHBvcnRzLmtleTJwb3MgPSBrZXkycG9zO1xuZnVuY3Rpb24gbWVtbyhmKSB7XG4gICAgbGV0IHY7XG4gICAgY29uc3QgcmV0ID0gKCkgPT4ge1xuICAgICAgICBpZiAodiA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgdiA9IGYoKTtcbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfTtcbiAgICByZXQuY2xlYXIgPSAoKSA9PiB7IHYgPSB1bmRlZmluZWQ7IH07XG4gICAgcmV0dXJuIHJldDtcbn1cbmV4cG9ydHMubWVtbyA9IG1lbW87XG5leHBvcnRzLnRpbWVyID0gKCkgPT4ge1xuICAgIGxldCBzdGFydEF0O1xuICAgIHJldHVybiB7XG4gICAgICAgIHN0YXJ0KCkgeyBzdGFydEF0ID0gRGF0ZS5ub3coKTsgfSxcbiAgICAgICAgY2FuY2VsKCkgeyBzdGFydEF0ID0gdW5kZWZpbmVkOyB9LFxuICAgICAgICBzdG9wKCkge1xuICAgICAgICAgICAgaWYgKCFzdGFydEF0KVxuICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgY29uc3QgdGltZSA9IERhdGUubm93KCkgLSBzdGFydEF0O1xuICAgICAgICAgICAgc3RhcnRBdCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHJldHVybiB0aW1lO1xuICAgICAgICB9XG4gICAgfTtcbn07XG5leHBvcnRzLm9wcG9zaXRlID0gKGMpID0+IGMgPT09ICd3aGl0ZScgPyAnYmxhY2snIDogJ3doaXRlJztcbmZ1bmN0aW9uIGNvbnRhaW5zWCh4cywgeCkge1xuICAgIHJldHVybiB4cyAhPT0gdW5kZWZpbmVkICYmIHhzLmluZGV4T2YoeCkgIT09IC0xO1xufVxuZXhwb3J0cy5jb250YWluc1ggPSBjb250YWluc1g7XG5leHBvcnRzLmRpc3RhbmNlU3EgPSAocG9zMSwgcG9zMikgPT4ge1xuICAgIHJldHVybiBNYXRoLnBvdyhwb3MxWzBdIC0gcG9zMlswXSwgMikgKyBNYXRoLnBvdyhwb3MxWzFdIC0gcG9zMlsxXSwgMik7XG59O1xuZXhwb3J0cy5zYW1lUGllY2UgPSAocDEsIHAyKSA9PiBwMS5yb2xlID09PSBwMi5yb2xlICYmIHAxLmNvbG9yID09PSBwMi5jb2xvcjtcbmNvbnN0IHBvc1RvVHJhbnNsYXRlQmFzZSA9IChwb3MsIGFzV2hpdGUsIHhGYWN0b3IsIHlGYWN0b3IsIGJ0KSA9PiBbXG4gICAgKGFzV2hpdGUgPyBwb3NbMF0gLSAxIDogYnQud2lkdGggLSBwb3NbMF0pICogeEZhY3RvcixcbiAgICAoYXNXaGl0ZSA/IGJ0LmhlaWdodCAtIHBvc1sxXSA6IHBvc1sxXSAtIDEpICogeUZhY3RvclxuXTtcbmV4cG9ydHMucG9zVG9UcmFuc2xhdGVBYnMgPSAoYm91bmRzLCBidCkgPT4ge1xuICAgIGNvbnN0IHhGYWN0b3IgPSBib3VuZHMud2lkdGggLyBidC53aWR0aCwgeUZhY3RvciA9IGJvdW5kcy5oZWlnaHQgLyBidC5oZWlnaHQ7XG4gICAgcmV0dXJuIChwb3MsIGFzV2hpdGUpID0+IHBvc1RvVHJhbnNsYXRlQmFzZShwb3MsIGFzV2hpdGUsIHhGYWN0b3IsIHlGYWN0b3IsIGJ0KTtcbn07XG5leHBvcnRzLnBvc1RvVHJhbnNsYXRlUmVsID0gKHBvcywgYXNXaGl0ZSwgYnQpID0+IHBvc1RvVHJhbnNsYXRlQmFzZShwb3MsIGFzV2hpdGUsIDEwMCAvIGJ0LndpZHRoLCAxMDAgLyBidC5oZWlnaHQsIGJ0KTtcbmV4cG9ydHMudHJhbnNsYXRlQWJzID0gKGVsLCBwb3MpID0+IHtcbiAgICBlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7cG9zWzBdfXB4LCR7cG9zWzFdfXB4KWA7XG59O1xuZXhwb3J0cy50cmFuc2xhdGVSZWwgPSAoZWwsIHBlcmNlbnRzKSA9PiB7XG4gICAgZWwuc3R5bGUubGVmdCA9IHBlcmNlbnRzWzBdICsgJyUnO1xuICAgIGVsLnN0eWxlLnRvcCA9IHBlcmNlbnRzWzFdICsgJyUnO1xufTtcbmV4cG9ydHMuc2V0VmlzaWJsZSA9IChlbCwgdikgPT4ge1xuICAgIGVsLnN0eWxlLnZpc2liaWxpdHkgPSB2ID8gJ3Zpc2libGUnIDogJ2hpZGRlbic7XG59O1xuZXhwb3J0cy5ldmVudFBvc2l0aW9uID0gZSA9PiB7XG4gICAgaWYgKGUuY2xpZW50WCB8fCBlLmNsaWVudFggPT09IDApXG4gICAgICAgIHJldHVybiBbZS5jbGllbnRYLCBlLmNsaWVudFldO1xuICAgIGlmIChlLnRvdWNoZXMgJiYgZS50YXJnZXRUb3VjaGVzWzBdKVxuICAgICAgICByZXR1cm4gW2UudGFyZ2V0VG91Y2hlc1swXS5jbGllbnRYLCBlLnRhcmdldFRvdWNoZXNbMF0uY2xpZW50WV07XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5leHBvcnRzLmlzUmlnaHRCdXR0b24gPSAoZSkgPT4gZS5idXR0b25zID09PSAyIHx8IGUuYnV0dG9uID09PSAyO1xuZXhwb3J0cy5jcmVhdGVFbCA9ICh0YWdOYW1lLCBjbGFzc05hbWUpID0+IHtcbiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG4gICAgaWYgKGNsYXNzTmFtZSlcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIHJldHVybiBlbDtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmNvbnN0IHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5jb25zdCB0eXBlc18xID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5jb25zdCBzdmdfMSA9IHJlcXVpcmUoXCIuL3N2Z1wiKTtcbmZ1bmN0aW9uIHdyYXAoZWxlbWVudCwgcywgcmVsYXRpdmUpIHtcbiAgICBlbGVtZW50LmlubmVySFRNTCA9ICcnO1xuICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2ctd3JhcCcpO1xuICAgIHV0aWxfMS5jb2xvcnMuZm9yRWFjaChjID0+IHtcbiAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdvcmllbnRhdGlvbi0nICsgYywgcy5vcmllbnRhdGlvbiA9PT0gYyk7XG4gICAgfSk7XG4gICAgZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtYW5pcHVsYWJsZScsICFzLnZpZXdPbmx5KTtcbiAgICBjb25zdCBoZWxwZXIgPSB1dGlsXzEuY3JlYXRlRWwoJ2NnLWhlbHBlcicpO1xuICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoaGVscGVyKTtcbiAgICBjb25zdCBjb250YWluZXIgPSB1dGlsXzEuY3JlYXRlRWwoJ2NnLWNvbnRhaW5lcicpO1xuICAgIGhlbHBlci5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHV0aWxfMS5jcmVhdGVFbCgnZXh0ZW5zaW9uJyk7XG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGV4dGVuc2lvbik7XG4gICAgY29uc3QgYm9hcmQgPSB1dGlsXzEuY3JlYXRlRWwoJ2NnLWJvYXJkJyk7XG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGJvYXJkKTtcbiAgICBsZXQgc3ZnO1xuICAgIGlmIChzLmRyYXdhYmxlLnZpc2libGUgJiYgIXJlbGF0aXZlKSB7XG4gICAgICAgIHN2ZyA9IHN2Z18xLmNyZWF0ZUVsZW1lbnQoJ3N2ZycpO1xuICAgICAgICBzdmcuYXBwZW5kQ2hpbGQoc3ZnXzEuY3JlYXRlRWxlbWVudCgnZGVmcycpKTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHN2Zyk7XG4gICAgfVxuICAgIGlmIChzLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgIGNvbnN0IG9yaWVudENsYXNzID0gcy5vcmllbnRhdGlvbiA9PT0gJ2JsYWNrJyA/ICcgYmxhY2snIDogJyc7XG4gICAgICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgICAgICBjb25zdCBzaGlmdCA9IGZpcnN0UmFua0lzMCA/IDAgOiAxO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyQ29vcmRzKHR5cGVzXzEucmFua3Muc2xpY2Uoc2hpZnQsIHMuZGltZW5zaW9ucy5oZWlnaHQgKyBzaGlmdCksICdyYW5rcycgKyBvcmllbnRDbGFzcykpO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyQ29vcmRzKHR5cGVzXzEuZmlsZXMuc2xpY2UoMCwgcy5kaW1lbnNpb25zLndpZHRoKSwgJ2ZpbGVzJyArIG9yaWVudENsYXNzKSk7XG4gICAgfVxuICAgIGxldCBnaG9zdDtcbiAgICBpZiAocy5kcmFnZ2FibGUuc2hvd0dob3N0ICYmICFyZWxhdGl2ZSkge1xuICAgICAgICBnaG9zdCA9IHV0aWxfMS5jcmVhdGVFbCgncGllY2UnLCAnZ2hvc3QnKTtcbiAgICAgICAgdXRpbF8xLnNldFZpc2libGUoZ2hvc3QsIGZhbHNlKTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdob3N0KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYm9hcmQsXG4gICAgICAgIGNvbnRhaW5lcixcbiAgICAgICAgZ2hvc3QsXG4gICAgICAgIHN2Z1xuICAgIH07XG59XG5leHBvcnRzLmRlZmF1bHQgPSB3cmFwO1xuZnVuY3Rpb24gcmVuZGVyQ29vcmRzKGVsZW1zLCBjbGFzc05hbWUpIHtcbiAgICBjb25zdCBlbCA9IHV0aWxfMS5jcmVhdGVFbCgnY29vcmRzJywgY2xhc3NOYW1lKTtcbiAgICBsZXQgZjtcbiAgICBmb3IgKGxldCBpIGluIGVsZW1zKSB7XG4gICAgICAgIGYgPSB1dGlsXzEuY3JlYXRlRWwoJ2Nvb3JkJyk7XG4gICAgICAgIGYudGV4dENvbnRlbnQgPSBlbGVtc1tpXTtcbiAgICAgICAgZWwuYXBwZW5kQ2hpbGQoZik7XG4gICAgfVxuICAgIHJldHVybiBlbDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHZub2RlXzEgPSByZXF1aXJlKFwiLi92bm9kZVwiKTtcbnZhciBpcyA9IHJlcXVpcmUoXCIuL2lzXCIpO1xuZnVuY3Rpb24gYWRkTlMoZGF0YSwgY2hpbGRyZW4sIHNlbCkge1xuICAgIGRhdGEubnMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xuICAgIGlmIChzZWwgIT09ICdmb3JlaWduT2JqZWN0JyAmJiBjaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBjaGlsZERhdGEgPSBjaGlsZHJlbltpXS5kYXRhO1xuICAgICAgICAgICAgaWYgKGNoaWxkRGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgYWRkTlMoY2hpbGREYXRhLCBjaGlsZHJlbltpXS5jaGlsZHJlbiwgY2hpbGRyZW5baV0uc2VsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIGgoc2VsLCBiLCBjKSB7XG4gICAgdmFyIGRhdGEgPSB7fSwgY2hpbGRyZW4sIHRleHQsIGk7XG4gICAgaWYgKGMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBkYXRhID0gYjtcbiAgICAgICAgaWYgKGlzLmFycmF5KGMpKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGM7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXMucHJpbWl0aXZlKGMpKSB7XG4gICAgICAgICAgICB0ZXh0ID0gYztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjICYmIGMuc2VsKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IFtjXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChiICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKGlzLmFycmF5KGIpKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXMucHJpbWl0aXZlKGIpKSB7XG4gICAgICAgICAgICB0ZXh0ID0gYjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChiICYmIGIuc2VsKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IFtiXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGRhdGEgPSBiO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChjaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaWYgKGlzLnByaW1pdGl2ZShjaGlsZHJlbltpXSkpXG4gICAgICAgICAgICAgICAgY2hpbGRyZW5baV0gPSB2bm9kZV8xLnZub2RlKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoaWxkcmVuW2ldLCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChzZWxbMF0gPT09ICdzJyAmJiBzZWxbMV0gPT09ICd2JyAmJiBzZWxbMl0gPT09ICdnJyAmJlxuICAgICAgICAoc2VsLmxlbmd0aCA9PT0gMyB8fCBzZWxbM10gPT09ICcuJyB8fCBzZWxbM10gPT09ICcjJykpIHtcbiAgICAgICAgYWRkTlMoZGF0YSwgY2hpbGRyZW4sIHNlbCk7XG4gICAgfVxuICAgIHJldHVybiB2bm9kZV8xLnZub2RlKHNlbCwgZGF0YSwgY2hpbGRyZW4sIHRleHQsIHVuZGVmaW5lZCk7XG59XG5leHBvcnRzLmggPSBoO1xuO1xuZXhwb3J0cy5kZWZhdWx0ID0gaDtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWguanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50KHRhZ05hbWUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2VVUkksIHF1YWxpZmllZE5hbWUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZVVSSSwgcXVhbGlmaWVkTmFtZSk7XG59XG5mdW5jdGlvbiBjcmVhdGVUZXh0Tm9kZSh0ZXh0KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpO1xufVxuZnVuY3Rpb24gY3JlYXRlQ29tbWVudCh0ZXh0KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQodGV4dCk7XG59XG5mdW5jdGlvbiBpbnNlcnRCZWZvcmUocGFyZW50Tm9kZSwgbmV3Tm9kZSwgcmVmZXJlbmNlTm9kZSkge1xuICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKG5ld05vZGUsIHJlZmVyZW5jZU5vZGUpO1xufVxuZnVuY3Rpb24gcmVtb3ZlQ2hpbGQobm9kZSwgY2hpbGQpIHtcbiAgICBub2RlLnJlbW92ZUNoaWxkKGNoaWxkKTtcbn1cbmZ1bmN0aW9uIGFwcGVuZENoaWxkKG5vZGUsIGNoaWxkKSB7XG4gICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZCk7XG59XG5mdW5jdGlvbiBwYXJlbnROb2RlKG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5wYXJlbnROb2RlO1xufVxuZnVuY3Rpb24gbmV4dFNpYmxpbmcobm9kZSkge1xuICAgIHJldHVybiBub2RlLm5leHRTaWJsaW5nO1xufVxuZnVuY3Rpb24gdGFnTmFtZShlbG0pIHtcbiAgICByZXR1cm4gZWxtLnRhZ05hbWU7XG59XG5mdW5jdGlvbiBzZXRUZXh0Q29udGVudChub2RlLCB0ZXh0KSB7XG4gICAgbm9kZS50ZXh0Q29udGVudCA9IHRleHQ7XG59XG5mdW5jdGlvbiBnZXRUZXh0Q29udGVudChub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUudGV4dENvbnRlbnQ7XG59XG5mdW5jdGlvbiBpc0VsZW1lbnQobm9kZSkge1xuICAgIHJldHVybiBub2RlLm5vZGVUeXBlID09PSAxO1xufVxuZnVuY3Rpb24gaXNUZXh0KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5ub2RlVHlwZSA9PT0gMztcbn1cbmZ1bmN0aW9uIGlzQ29tbWVudChub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDg7XG59XG5leHBvcnRzLmh0bWxEb21BcGkgPSB7XG4gICAgY3JlYXRlRWxlbWVudDogY3JlYXRlRWxlbWVudCxcbiAgICBjcmVhdGVFbGVtZW50TlM6IGNyZWF0ZUVsZW1lbnROUyxcbiAgICBjcmVhdGVUZXh0Tm9kZTogY3JlYXRlVGV4dE5vZGUsXG4gICAgY3JlYXRlQ29tbWVudDogY3JlYXRlQ29tbWVudCxcbiAgICBpbnNlcnRCZWZvcmU6IGluc2VydEJlZm9yZSxcbiAgICByZW1vdmVDaGlsZDogcmVtb3ZlQ2hpbGQsXG4gICAgYXBwZW5kQ2hpbGQ6IGFwcGVuZENoaWxkLFxuICAgIHBhcmVudE5vZGU6IHBhcmVudE5vZGUsXG4gICAgbmV4dFNpYmxpbmc6IG5leHRTaWJsaW5nLFxuICAgIHRhZ05hbWU6IHRhZ05hbWUsXG4gICAgc2V0VGV4dENvbnRlbnQ6IHNldFRleHRDb250ZW50LFxuICAgIGdldFRleHRDb250ZW50OiBnZXRUZXh0Q29udGVudCxcbiAgICBpc0VsZW1lbnQ6IGlzRWxlbWVudCxcbiAgICBpc1RleHQ6IGlzVGV4dCxcbiAgICBpc0NvbW1lbnQ6IGlzQ29tbWVudCxcbn07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmh0bWxEb21BcGk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1odG1sZG9tYXBpLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5hcnJheSA9IEFycmF5LmlzQXJyYXk7XG5mdW5jdGlvbiBwcmltaXRpdmUocykge1xuICAgIHJldHVybiB0eXBlb2YgcyA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHMgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5wcmltaXRpdmUgPSBwcmltaXRpdmU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pcy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB4bGlua05TID0gJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsnO1xudmFyIHhtbE5TID0gJ2h0dHA6Ly93d3cudzMub3JnL1hNTC8xOTk4L25hbWVzcGFjZSc7XG52YXIgY29sb25DaGFyID0gNTg7XG52YXIgeENoYXIgPSAxMjA7XG5mdW5jdGlvbiB1cGRhdGVBdHRycyhvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICB2YXIga2V5LCBlbG0gPSB2bm9kZS5lbG0sIG9sZEF0dHJzID0gb2xkVm5vZGUuZGF0YS5hdHRycywgYXR0cnMgPSB2bm9kZS5kYXRhLmF0dHJzO1xuICAgIGlmICghb2xkQXR0cnMgJiYgIWF0dHJzKVxuICAgICAgICByZXR1cm47XG4gICAgaWYgKG9sZEF0dHJzID09PSBhdHRycylcbiAgICAgICAgcmV0dXJuO1xuICAgIG9sZEF0dHJzID0gb2xkQXR0cnMgfHwge307XG4gICAgYXR0cnMgPSBhdHRycyB8fCB7fTtcbiAgICAvLyB1cGRhdGUgbW9kaWZpZWQgYXR0cmlidXRlcywgYWRkIG5ldyBhdHRyaWJ1dGVzXG4gICAgZm9yIChrZXkgaW4gYXR0cnMpIHtcbiAgICAgICAgdmFyIGN1ciA9IGF0dHJzW2tleV07XG4gICAgICAgIHZhciBvbGQgPSBvbGRBdHRyc1trZXldO1xuICAgICAgICBpZiAob2xkICE9PSBjdXIpIHtcbiAgICAgICAgICAgIGlmIChjdXIgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKGtleSwgXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjdXIgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgZWxtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5jaGFyQ29kZUF0KDApICE9PSB4Q2hhcikge1xuICAgICAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoa2V5LmNoYXJDb2RlQXQoMykgPT09IGNvbG9uQ2hhcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBBc3N1bWUgeG1sIG5hbWVzcGFjZVxuICAgICAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlTlMoeG1sTlMsIGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoa2V5LmNoYXJDb2RlQXQoNSkgPT09IGNvbG9uQ2hhcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBBc3N1bWUgeGxpbmsgbmFtZXNwYWNlXG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGVOUyh4bGlua05TLCBrZXksIGN1cik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gcmVtb3ZlIHJlbW92ZWQgYXR0cmlidXRlc1xuICAgIC8vIHVzZSBgaW5gIG9wZXJhdG9yIHNpbmNlIHRoZSBwcmV2aW91cyBgZm9yYCBpdGVyYXRpb24gdXNlcyBpdCAoLmkuZS4gYWRkIGV2ZW4gYXR0cmlidXRlcyB3aXRoIHVuZGVmaW5lZCB2YWx1ZSlcbiAgICAvLyB0aGUgb3RoZXIgb3B0aW9uIGlzIHRvIHJlbW92ZSBhbGwgYXR0cmlidXRlcyB3aXRoIHZhbHVlID09IHVuZGVmaW5lZFxuICAgIGZvciAoa2V5IGluIG9sZEF0dHJzKSB7XG4gICAgICAgIGlmICghKGtleSBpbiBhdHRycykpIHtcbiAgICAgICAgICAgIGVsbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmV4cG9ydHMuYXR0cmlidXRlc01vZHVsZSA9IHsgY3JlYXRlOiB1cGRhdGVBdHRycywgdXBkYXRlOiB1cGRhdGVBdHRycyB9O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy5hdHRyaWJ1dGVzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXR0cmlidXRlcy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIHVwZGF0ZUNsYXNzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBjdXIsIG5hbWUsIGVsbSA9IHZub2RlLmVsbSwgb2xkQ2xhc3MgPSBvbGRWbm9kZS5kYXRhLmNsYXNzLCBrbGFzcyA9IHZub2RlLmRhdGEuY2xhc3M7XG4gICAgaWYgKCFvbGRDbGFzcyAmJiAha2xhc3MpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAob2xkQ2xhc3MgPT09IGtsYXNzKVxuICAgICAgICByZXR1cm47XG4gICAgb2xkQ2xhc3MgPSBvbGRDbGFzcyB8fCB7fTtcbiAgICBrbGFzcyA9IGtsYXNzIHx8IHt9O1xuICAgIGZvciAobmFtZSBpbiBvbGRDbGFzcykge1xuICAgICAgICBpZiAoIWtsYXNzW25hbWVdKSB7XG4gICAgICAgICAgICBlbG0uY2xhc3NMaXN0LnJlbW92ZShuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKG5hbWUgaW4ga2xhc3MpIHtcbiAgICAgICAgY3VyID0ga2xhc3NbbmFtZV07XG4gICAgICAgIGlmIChjdXIgIT09IG9sZENsYXNzW25hbWVdKSB7XG4gICAgICAgICAgICBlbG0uY2xhc3NMaXN0W2N1ciA/ICdhZGQnIDogJ3JlbW92ZSddKG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5jbGFzc01vZHVsZSA9IHsgY3JlYXRlOiB1cGRhdGVDbGFzcywgdXBkYXRlOiB1cGRhdGVDbGFzcyB9O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy5jbGFzc01vZHVsZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWNsYXNzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gaW52b2tlSGFuZGxlcihoYW5kbGVyLCB2bm9kZSwgZXZlbnQpIHtcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAvLyBjYWxsIGZ1bmN0aW9uIGhhbmRsZXJcbiAgICAgICAgaGFuZGxlci5jYWxsKHZub2RlLCBldmVudCwgdm5vZGUpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAvLyBjYWxsIGhhbmRsZXIgd2l0aCBhcmd1bWVudHNcbiAgICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyWzBdID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIC8vIHNwZWNpYWwgY2FzZSBmb3Igc2luZ2xlIGFyZ3VtZW50IGZvciBwZXJmb3JtYW5jZVxuICAgICAgICAgICAgaWYgKGhhbmRsZXIubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlclswXS5jYWxsKHZub2RlLCBoYW5kbGVyWzFdLCBldmVudCwgdm5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBoYW5kbGVyLnNsaWNlKDEpO1xuICAgICAgICAgICAgICAgIGFyZ3MucHVzaChldmVudCk7XG4gICAgICAgICAgICAgICAgYXJncy5wdXNoKHZub2RlKTtcbiAgICAgICAgICAgICAgICBoYW5kbGVyWzBdLmFwcGx5KHZub2RlLCBhcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIGNhbGwgbXVsdGlwbGUgaGFuZGxlcnNcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGFuZGxlci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGludm9rZUhhbmRsZXIoaGFuZGxlcltpXSwgdm5vZGUsIGV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIGhhbmRsZUV2ZW50KGV2ZW50LCB2bm9kZSkge1xuICAgIHZhciBuYW1lID0gZXZlbnQudHlwZSwgb24gPSB2bm9kZS5kYXRhLm9uO1xuICAgIC8vIGNhbGwgZXZlbnQgaGFuZGxlcihzKSBpZiBleGlzdHNcbiAgICBpZiAob24gJiYgb25bbmFtZV0pIHtcbiAgICAgICAgaW52b2tlSGFuZGxlcihvbltuYW1lXSwgdm5vZGUsIGV2ZW50KTtcbiAgICB9XG59XG5mdW5jdGlvbiBjcmVhdGVMaXN0ZW5lcigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gaGFuZGxlcihldmVudCkge1xuICAgICAgICBoYW5kbGVFdmVudChldmVudCwgaGFuZGxlci52bm9kZSk7XG4gICAgfTtcbn1cbmZ1bmN0aW9uIHVwZGF0ZUV2ZW50TGlzdGVuZXJzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBvbGRPbiA9IG9sZFZub2RlLmRhdGEub24sIG9sZExpc3RlbmVyID0gb2xkVm5vZGUubGlzdGVuZXIsIG9sZEVsbSA9IG9sZFZub2RlLmVsbSwgb24gPSB2bm9kZSAmJiB2bm9kZS5kYXRhLm9uLCBlbG0gPSAodm5vZGUgJiYgdm5vZGUuZWxtKSwgbmFtZTtcbiAgICAvLyBvcHRpbWl6YXRpb24gZm9yIHJldXNlZCBpbW11dGFibGUgaGFuZGxlcnNcbiAgICBpZiAob2xkT24gPT09IG9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gcmVtb3ZlIGV4aXN0aW5nIGxpc3RlbmVycyB3aGljaCBubyBsb25nZXIgdXNlZFxuICAgIGlmIChvbGRPbiAmJiBvbGRMaXN0ZW5lcikge1xuICAgICAgICAvLyBpZiBlbGVtZW50IGNoYW5nZWQgb3IgZGVsZXRlZCB3ZSByZW1vdmUgYWxsIGV4aXN0aW5nIGxpc3RlbmVycyB1bmNvbmRpdGlvbmFsbHlcbiAgICAgICAgaWYgKCFvbikge1xuICAgICAgICAgICAgZm9yIChuYW1lIGluIG9sZE9uKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGxpc3RlbmVyIGlmIGVsZW1lbnQgd2FzIGNoYW5nZWQgb3IgZXhpc3RpbmcgbGlzdGVuZXJzIHJlbW92ZWRcbiAgICAgICAgICAgICAgICBvbGRFbG0ucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBvbGRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9yIChuYW1lIGluIG9sZE9uKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGxpc3RlbmVyIGlmIGV4aXN0aW5nIGxpc3RlbmVyIHJlbW92ZWRcbiAgICAgICAgICAgICAgICBpZiAoIW9uW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIG9sZEVsbS5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIG9sZExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8vIGFkZCBuZXcgbGlzdGVuZXJzIHdoaWNoIGhhcyBub3QgYWxyZWFkeSBhdHRhY2hlZFxuICAgIGlmIChvbikge1xuICAgICAgICAvLyByZXVzZSBleGlzdGluZyBsaXN0ZW5lciBvciBjcmVhdGUgbmV3XG4gICAgICAgIHZhciBsaXN0ZW5lciA9IHZub2RlLmxpc3RlbmVyID0gb2xkVm5vZGUubGlzdGVuZXIgfHwgY3JlYXRlTGlzdGVuZXIoKTtcbiAgICAgICAgLy8gdXBkYXRlIHZub2RlIGZvciBsaXN0ZW5lclxuICAgICAgICBsaXN0ZW5lci52bm9kZSA9IHZub2RlO1xuICAgICAgICAvLyBpZiBlbGVtZW50IGNoYW5nZWQgb3IgYWRkZWQgd2UgYWRkIGFsbCBuZWVkZWQgbGlzdGVuZXJzIHVuY29uZGl0aW9uYWxseVxuICAgICAgICBpZiAoIW9sZE9uKSB7XG4gICAgICAgICAgICBmb3IgKG5hbWUgaW4gb24pIHtcbiAgICAgICAgICAgICAgICAvLyBhZGQgbGlzdGVuZXIgaWYgZWxlbWVudCB3YXMgY2hhbmdlZCBvciBuZXcgbGlzdGVuZXJzIGFkZGVkXG4gICAgICAgICAgICAgICAgZWxtLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgbGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAobmFtZSBpbiBvbikge1xuICAgICAgICAgICAgICAgIC8vIGFkZCBsaXN0ZW5lciBpZiBuZXcgbGlzdGVuZXIgYWRkZWRcbiAgICAgICAgICAgICAgICBpZiAoIW9sZE9uW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGxpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5ldmVudExpc3RlbmVyc01vZHVsZSA9IHtcbiAgICBjcmVhdGU6IHVwZGF0ZUV2ZW50TGlzdGVuZXJzLFxuICAgIHVwZGF0ZTogdXBkYXRlRXZlbnRMaXN0ZW5lcnMsXG4gICAgZGVzdHJveTogdXBkYXRlRXZlbnRMaXN0ZW5lcnNcbn07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmV2ZW50TGlzdGVuZXJzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZXZlbnRsaXN0ZW5lcnMuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiB1cGRhdGVQcm9wcyhvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICB2YXIga2V5LCBjdXIsIG9sZCwgZWxtID0gdm5vZGUuZWxtLCBvbGRQcm9wcyA9IG9sZFZub2RlLmRhdGEucHJvcHMsIHByb3BzID0gdm5vZGUuZGF0YS5wcm9wcztcbiAgICBpZiAoIW9sZFByb3BzICYmICFwcm9wcylcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChvbGRQcm9wcyA9PT0gcHJvcHMpXG4gICAgICAgIHJldHVybjtcbiAgICBvbGRQcm9wcyA9IG9sZFByb3BzIHx8IHt9O1xuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgZm9yIChrZXkgaW4gb2xkUHJvcHMpIHtcbiAgICAgICAgaWYgKCFwcm9wc1trZXldKSB7XG4gICAgICAgICAgICBkZWxldGUgZWxtW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChrZXkgaW4gcHJvcHMpIHtcbiAgICAgICAgY3VyID0gcHJvcHNba2V5XTtcbiAgICAgICAgb2xkID0gb2xkUHJvcHNba2V5XTtcbiAgICAgICAgaWYgKG9sZCAhPT0gY3VyICYmIChrZXkgIT09ICd2YWx1ZScgfHwgZWxtW2tleV0gIT09IGN1cikpIHtcbiAgICAgICAgICAgIGVsbVtrZXldID0gY3VyO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5wcm9wc01vZHVsZSA9IHsgY3JlYXRlOiB1cGRhdGVQcm9wcywgdXBkYXRlOiB1cGRhdGVQcm9wcyB9O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy5wcm9wc01vZHVsZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXByb3BzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHZub2RlXzEgPSByZXF1aXJlKFwiLi92bm9kZVwiKTtcbnZhciBpcyA9IHJlcXVpcmUoXCIuL2lzXCIpO1xudmFyIGh0bWxkb21hcGlfMSA9IHJlcXVpcmUoXCIuL2h0bWxkb21hcGlcIik7XG5mdW5jdGlvbiBpc1VuZGVmKHMpIHsgcmV0dXJuIHMgPT09IHVuZGVmaW5lZDsgfVxuZnVuY3Rpb24gaXNEZWYocykgeyByZXR1cm4gcyAhPT0gdW5kZWZpbmVkOyB9XG52YXIgZW1wdHlOb2RlID0gdm5vZGVfMS5kZWZhdWx0KCcnLCB7fSwgW10sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbmZ1bmN0aW9uIHNhbWVWbm9kZSh2bm9kZTEsIHZub2RlMikge1xuICAgIHJldHVybiB2bm9kZTEua2V5ID09PSB2bm9kZTIua2V5ICYmIHZub2RlMS5zZWwgPT09IHZub2RlMi5zZWw7XG59XG5mdW5jdGlvbiBpc1Zub2RlKHZub2RlKSB7XG4gICAgcmV0dXJuIHZub2RlLnNlbCAhPT0gdW5kZWZpbmVkO1xufVxuZnVuY3Rpb24gY3JlYXRlS2V5VG9PbGRJZHgoY2hpbGRyZW4sIGJlZ2luSWR4LCBlbmRJZHgpIHtcbiAgICB2YXIgaSwgbWFwID0ge30sIGtleSwgY2g7XG4gICAgZm9yIChpID0gYmVnaW5JZHg7IGkgPD0gZW5kSWR4OyArK2kpIHtcbiAgICAgICAgY2ggPSBjaGlsZHJlbltpXTtcbiAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgIGtleSA9IGNoLmtleTtcbiAgICAgICAgICAgIGlmIChrZXkgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICBtYXBba2V5XSA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1hcDtcbn1cbnZhciBob29rcyA9IFsnY3JlYXRlJywgJ3VwZGF0ZScsICdyZW1vdmUnLCAnZGVzdHJveScsICdwcmUnLCAncG9zdCddO1xudmFyIGhfMSA9IHJlcXVpcmUoXCIuL2hcIik7XG5leHBvcnRzLmggPSBoXzEuaDtcbnZhciB0aHVua18xID0gcmVxdWlyZShcIi4vdGh1bmtcIik7XG5leHBvcnRzLnRodW5rID0gdGh1bmtfMS50aHVuaztcbmZ1bmN0aW9uIGluaXQobW9kdWxlcywgZG9tQXBpKSB7XG4gICAgdmFyIGksIGosIGNicyA9IHt9O1xuICAgIHZhciBhcGkgPSBkb21BcGkgIT09IHVuZGVmaW5lZCA/IGRvbUFwaSA6IGh0bWxkb21hcGlfMS5kZWZhdWx0O1xuICAgIGZvciAoaSA9IDA7IGkgPCBob29rcy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjYnNbaG9va3NbaV1dID0gW107XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBtb2R1bGVzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgICB2YXIgaG9vayA9IG1vZHVsZXNbal1baG9va3NbaV1dO1xuICAgICAgICAgICAgaWYgKGhvb2sgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNic1tob29rc1tpXV0ucHVzaChob29rKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBlbXB0eU5vZGVBdChlbG0pIHtcbiAgICAgICAgdmFyIGlkID0gZWxtLmlkID8gJyMnICsgZWxtLmlkIDogJyc7XG4gICAgICAgIHZhciBjID0gZWxtLmNsYXNzTmFtZSA/ICcuJyArIGVsbS5jbGFzc05hbWUuc3BsaXQoJyAnKS5qb2luKCcuJykgOiAnJztcbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdChhcGkudGFnTmFtZShlbG0pLnRvTG93ZXJDYXNlKCkgKyBpZCArIGMsIHt9LCBbXSwgdW5kZWZpbmVkLCBlbG0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjcmVhdGVSbUNiKGNoaWxkRWxtLCBsaXN0ZW5lcnMpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIHJtQ2IoKSB7XG4gICAgICAgICAgICBpZiAoLS1saXN0ZW5lcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFyZW50XzEgPSBhcGkucGFyZW50Tm9kZShjaGlsZEVsbSk7XG4gICAgICAgICAgICAgICAgYXBpLnJlbW92ZUNoaWxkKHBhcmVudF8xLCBjaGlsZEVsbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0ZUVsbSh2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgICAgIHZhciBpLCBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKGlzRGVmKGkgPSBkYXRhLmhvb2spICYmIGlzRGVmKGkgPSBpLmluaXQpKSB7XG4gICAgICAgICAgICAgICAgaSh2bm9kZSk7XG4gICAgICAgICAgICAgICAgZGF0YSA9IHZub2RlLmRhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNoaWxkcmVuID0gdm5vZGUuY2hpbGRyZW4sIHNlbCA9IHZub2RlLnNlbDtcbiAgICAgICAgaWYgKHNlbCA9PT0gJyEnKSB7XG4gICAgICAgICAgICBpZiAoaXNVbmRlZih2bm9kZS50ZXh0KSkge1xuICAgICAgICAgICAgICAgIHZub2RlLnRleHQgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZub2RlLmVsbSA9IGFwaS5jcmVhdGVDb21tZW50KHZub2RlLnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBQYXJzZSBzZWxlY3RvclxuICAgICAgICAgICAgdmFyIGhhc2hJZHggPSBzZWwuaW5kZXhPZignIycpO1xuICAgICAgICAgICAgdmFyIGRvdElkeCA9IHNlbC5pbmRleE9mKCcuJywgaGFzaElkeCk7XG4gICAgICAgICAgICB2YXIgaGFzaCA9IGhhc2hJZHggPiAwID8gaGFzaElkeCA6IHNlbC5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgZG90ID0gZG90SWR4ID4gMCA/IGRvdElkeCA6IHNlbC5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgdGFnID0gaGFzaElkeCAhPT0gLTEgfHwgZG90SWR4ICE9PSAtMSA/IHNlbC5zbGljZSgwLCBNYXRoLm1pbihoYXNoLCBkb3QpKSA6IHNlbDtcbiAgICAgICAgICAgIHZhciBlbG0gPSB2bm9kZS5lbG0gPSBpc0RlZihkYXRhKSAmJiBpc0RlZihpID0gZGF0YS5ucykgPyBhcGkuY3JlYXRlRWxlbWVudE5TKGksIHRhZylcbiAgICAgICAgICAgICAgICA6IGFwaS5jcmVhdGVFbGVtZW50KHRhZyk7XG4gICAgICAgICAgICBpZiAoaGFzaCA8IGRvdClcbiAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKCdpZCcsIHNlbC5zbGljZShoYXNoICsgMSwgZG90KSk7XG4gICAgICAgICAgICBpZiAoZG90SWR4ID4gMClcbiAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKCdjbGFzcycsIHNlbC5zbGljZShkb3QgKyAxKS5yZXBsYWNlKC9cXC4vZywgJyAnKSk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLmNyZWF0ZS5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgICAgICBjYnMuY3JlYXRlW2ldKGVtcHR5Tm9kZSwgdm5vZGUpO1xuICAgICAgICAgICAgaWYgKGlzLmFycmF5KGNoaWxkcmVuKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2ggPSBjaGlsZHJlbltpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5hcHBlbmRDaGlsZChlbG0sIGNyZWF0ZUVsbShjaCwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUodm5vZGUudGV4dCkpIHtcbiAgICAgICAgICAgICAgICBhcGkuYXBwZW5kQ2hpbGQoZWxtLCBhcGkuY3JlYXRlVGV4dE5vZGUodm5vZGUudGV4dCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaSA9IHZub2RlLmRhdGEuaG9vazsgLy8gUmV1c2UgdmFyaWFibGVcbiAgICAgICAgICAgIGlmIChpc0RlZihpKSkge1xuICAgICAgICAgICAgICAgIGlmIChpLmNyZWF0ZSlcbiAgICAgICAgICAgICAgICAgICAgaS5jcmVhdGUoZW1wdHlOb2RlLCB2bm9kZSk7XG4gICAgICAgICAgICAgICAgaWYgKGkuaW5zZXJ0KVxuICAgICAgICAgICAgICAgICAgICBpbnNlcnRlZFZub2RlUXVldWUucHVzaCh2bm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2bm9kZS5lbG0gPSBhcGkuY3JlYXRlVGV4dE5vZGUodm5vZGUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZub2RlLmVsbTtcbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkVm5vZGVzKHBhcmVudEVsbSwgYmVmb3JlLCB2bm9kZXMsIHN0YXJ0SWR4LCBlbmRJZHgsIGluc2VydGVkVm5vZGVRdWV1ZSkge1xuICAgICAgICBmb3IgKDsgc3RhcnRJZHggPD0gZW5kSWR4OyArK3N0YXJ0SWR4KSB7XG4gICAgICAgICAgICB2YXIgY2ggPSB2bm9kZXNbc3RhcnRJZHhdO1xuICAgICAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKGNoLCBpbnNlcnRlZFZub2RlUXVldWUpLCBiZWZvcmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGludm9rZURlc3Ryb3lIb29rKHZub2RlKSB7XG4gICAgICAgIHZhciBpLCBqLCBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKGlzRGVmKGkgPSBkYXRhLmhvb2spICYmIGlzRGVmKGkgPSBpLmRlc3Ryb3kpKVxuICAgICAgICAgICAgICAgIGkodm5vZGUpO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNicy5kZXN0cm95Lmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGNicy5kZXN0cm95W2ldKHZub2RlKTtcbiAgICAgICAgICAgIGlmICh2bm9kZS5jaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHZub2RlLmNoaWxkcmVuLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgICAgICAgICAgIGkgPSB2bm9kZS5jaGlsZHJlbltqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkgIT0gbnVsbCAmJiB0eXBlb2YgaSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW52b2tlRGVzdHJveUhvb2soaSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gcmVtb3ZlVm5vZGVzKHBhcmVudEVsbSwgdm5vZGVzLCBzdGFydElkeCwgZW5kSWR4KSB7XG4gICAgICAgIGZvciAoOyBzdGFydElkeCA8PSBlbmRJZHg7ICsrc3RhcnRJZHgpIHtcbiAgICAgICAgICAgIHZhciBpXzEgPSB2b2lkIDAsIGxpc3RlbmVycyA9IHZvaWQgMCwgcm0gPSB2b2lkIDAsIGNoID0gdm5vZGVzW3N0YXJ0SWR4XTtcbiAgICAgICAgICAgIGlmIChjaCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzRGVmKGNoLnNlbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW52b2tlRGVzdHJveUhvb2soY2gpO1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBjYnMucmVtb3ZlLmxlbmd0aCArIDE7XG4gICAgICAgICAgICAgICAgICAgIHJtID0gY3JlYXRlUm1DYihjaC5lbG0sIGxpc3RlbmVycyk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaV8xID0gMDsgaV8xIDwgY2JzLnJlbW92ZS5sZW5ndGg7ICsraV8xKVxuICAgICAgICAgICAgICAgICAgICAgICAgY2JzLnJlbW92ZVtpXzFdKGNoLCBybSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0RlZihpXzEgPSBjaC5kYXRhKSAmJiBpc0RlZihpXzEgPSBpXzEuaG9vaykgJiYgaXNEZWYoaV8xID0gaV8xLnJlbW92ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlfMShjaCwgcm0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcm0oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYXBpLnJlbW92ZUNoaWxkKHBhcmVudEVsbSwgY2guZWxtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gdXBkYXRlQ2hpbGRyZW4ocGFyZW50RWxtLCBvbGRDaCwgbmV3Q2gsIGluc2VydGVkVm5vZGVRdWV1ZSkge1xuICAgICAgICB2YXIgb2xkU3RhcnRJZHggPSAwLCBuZXdTdGFydElkeCA9IDA7XG4gICAgICAgIHZhciBvbGRFbmRJZHggPSBvbGRDaC5sZW5ndGggLSAxO1xuICAgICAgICB2YXIgb2xkU3RhcnRWbm9kZSA9IG9sZENoWzBdO1xuICAgICAgICB2YXIgb2xkRW5kVm5vZGUgPSBvbGRDaFtvbGRFbmRJZHhdO1xuICAgICAgICB2YXIgbmV3RW5kSWR4ID0gbmV3Q2gubGVuZ3RoIC0gMTtcbiAgICAgICAgdmFyIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFswXTtcbiAgICAgICAgdmFyIG5ld0VuZFZub2RlID0gbmV3Q2hbbmV3RW5kSWR4XTtcbiAgICAgICAgdmFyIG9sZEtleVRvSWR4O1xuICAgICAgICB2YXIgaWR4SW5PbGQ7XG4gICAgICAgIHZhciBlbG1Ub01vdmU7XG4gICAgICAgIHZhciBiZWZvcmU7XG4gICAgICAgIHdoaWxlIChvbGRTdGFydElkeCA8PSBvbGRFbmRJZHggJiYgbmV3U3RhcnRJZHggPD0gbmV3RW5kSWR4KSB7XG4gICAgICAgICAgICBpZiAob2xkU3RhcnRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgb2xkU3RhcnRWbm9kZSA9IG9sZENoWysrb2xkU3RhcnRJZHhdOyAvLyBWbm9kZSBtaWdodCBoYXZlIGJlZW4gbW92ZWQgbGVmdFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAob2xkRW5kVm5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIG9sZEVuZFZub2RlID0gb2xkQ2hbLS1vbGRFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAobmV3U3RhcnRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAobmV3RW5kVm5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2FtZVZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld1N0YXJ0Vm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRTdGFydFZub2RlLCBuZXdTdGFydFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgICAgIG9sZFN0YXJ0Vm5vZGUgPSBvbGRDaFsrK29sZFN0YXJ0SWR4XTtcbiAgICAgICAgICAgICAgICBuZXdTdGFydFZub2RlID0gbmV3Q2hbKytuZXdTdGFydElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkRW5kVm5vZGUsIG5ld0VuZFZub2RlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkRW5kVm5vZGUsIG5ld0VuZFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgICAgIG9sZEVuZFZub2RlID0gb2xkQ2hbLS1vbGRFbmRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2FtZVZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld0VuZFZub2RlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3RW5kVm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIG9sZFN0YXJ0Vm5vZGUuZWxtLCBhcGkubmV4dFNpYmxpbmcob2xkRW5kVm5vZGUuZWxtKSk7XG4gICAgICAgICAgICAgICAgb2xkU3RhcnRWbm9kZSA9IG9sZENoWysrb2xkU3RhcnRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2FtZVZub2RlKG9sZEVuZFZub2RlLCBuZXdTdGFydFZub2RlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkRW5kVm5vZGUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIG9sZEVuZFZub2RlLmVsbSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgICAgICAgIG9sZEVuZFZub2RlID0gb2xkQ2hbLS1vbGRFbmRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChvbGRLZXlUb0lkeCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG9sZEtleVRvSWR4ID0gY3JlYXRlS2V5VG9PbGRJZHgob2xkQ2gsIG9sZFN0YXJ0SWR4LCBvbGRFbmRJZHgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHhJbk9sZCA9IG9sZEtleVRvSWR4W25ld1N0YXJ0Vm5vZGUua2V5XTtcbiAgICAgICAgICAgICAgICBpZiAoaXNVbmRlZihpZHhJbk9sZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIGNyZWF0ZUVsbShuZXdTdGFydFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpLCBvbGRTdGFydFZub2RlLmVsbSk7XG4gICAgICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbVRvTW92ZSA9IG9sZENoW2lkeEluT2xkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsbVRvTW92ZS5zZWwgIT09IG5ld1N0YXJ0Vm5vZGUuc2VsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSksIG9sZFN0YXJ0Vm5vZGUuZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUoZWxtVG9Nb3ZlLCBuZXdTdGFydFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgb2xkQ2hbaWR4SW5PbGRdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIGVsbVRvTW92ZS5lbG0sIG9sZFN0YXJ0Vm5vZGUuZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBuZXdTdGFydFZub2RlID0gbmV3Q2hbKytuZXdTdGFydElkeF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvbGRTdGFydElkeCA8PSBvbGRFbmRJZHggfHwgbmV3U3RhcnRJZHggPD0gbmV3RW5kSWR4KSB7XG4gICAgICAgICAgICBpZiAob2xkU3RhcnRJZHggPiBvbGRFbmRJZHgpIHtcbiAgICAgICAgICAgICAgICBiZWZvcmUgPSBuZXdDaFtuZXdFbmRJZHggKyAxXSA9PSBudWxsID8gbnVsbCA6IG5ld0NoW25ld0VuZElkeCArIDFdLmVsbTtcbiAgICAgICAgICAgICAgICBhZGRWbm9kZXMocGFyZW50RWxtLCBiZWZvcmUsIG5ld0NoLCBuZXdTdGFydElkeCwgbmV3RW5kSWR4LCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlVm5vZGVzKHBhcmVudEVsbSwgb2xkQ2gsIG9sZFN0YXJ0SWR4LCBvbGRFbmRJZHgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHBhdGNoVm5vZGUob2xkVm5vZGUsIHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpIHtcbiAgICAgICAgdmFyIGksIGhvb2s7XG4gICAgICAgIGlmIChpc0RlZihpID0gdm5vZGUuZGF0YSkgJiYgaXNEZWYoaG9vayA9IGkuaG9vaykgJiYgaXNEZWYoaSA9IGhvb2sucHJlcGF0Y2gpKSB7XG4gICAgICAgICAgICBpKG9sZFZub2RlLCB2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGVsbSA9IHZub2RlLmVsbSA9IG9sZFZub2RlLmVsbTtcbiAgICAgICAgdmFyIG9sZENoID0gb2xkVm5vZGUuY2hpbGRyZW47XG4gICAgICAgIHZhciBjaCA9IHZub2RlLmNoaWxkcmVuO1xuICAgICAgICBpZiAob2xkVm5vZGUgPT09IHZub2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAodm5vZGUuZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnVwZGF0ZS5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgICAgICBjYnMudXBkYXRlW2ldKG9sZFZub2RlLCB2bm9kZSk7XG4gICAgICAgICAgICBpID0gdm5vZGUuZGF0YS5ob29rO1xuICAgICAgICAgICAgaWYgKGlzRGVmKGkpICYmIGlzRGVmKGkgPSBpLnVwZGF0ZSkpXG4gICAgICAgICAgICAgICAgaShvbGRWbm9kZSwgdm5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc1VuZGVmKHZub2RlLnRleHQpKSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYob2xkQ2gpICYmIGlzRGVmKGNoKSkge1xuICAgICAgICAgICAgICAgIGlmIChvbGRDaCAhPT0gY2gpXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZUNoaWxkcmVuKGVsbSwgb2xkQ2gsIGNoLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaXNEZWYoY2gpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzRGVmKG9sZFZub2RlLnRleHQpKVxuICAgICAgICAgICAgICAgICAgICBhcGkuc2V0VGV4dENvbnRlbnQoZWxtLCAnJyk7XG4gICAgICAgICAgICAgICAgYWRkVm5vZGVzKGVsbSwgbnVsbCwgY2gsIDAsIGNoLmxlbmd0aCAtIDEsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0RlZihvbGRDaCkpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVWbm9kZXMoZWxtLCBvbGRDaCwgMCwgb2xkQ2gubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0RlZihvbGRWbm9kZS50ZXh0KSkge1xuICAgICAgICAgICAgICAgIGFwaS5zZXRUZXh0Q29udGVudChlbG0sICcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvbGRWbm9kZS50ZXh0ICE9PSB2bm9kZS50ZXh0KSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYob2xkQ2gpKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlVm5vZGVzKGVsbSwgb2xkQ2gsIDAsIG9sZENoLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXBpLnNldFRleHRDb250ZW50KGVsbSwgdm5vZGUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzRGVmKGhvb2spICYmIGlzRGVmKGkgPSBob29rLnBvc3RwYXRjaCkpIHtcbiAgICAgICAgICAgIGkob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24gcGF0Y2gob2xkVm5vZGUsIHZub2RlKSB7XG4gICAgICAgIHZhciBpLCBlbG0sIHBhcmVudDtcbiAgICAgICAgdmFyIGluc2VydGVkVm5vZGVRdWV1ZSA9IFtdO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnByZS5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgIGNicy5wcmVbaV0oKTtcbiAgICAgICAgaWYgKCFpc1Zub2RlKG9sZFZub2RlKSkge1xuICAgICAgICAgICAgb2xkVm5vZGUgPSBlbXB0eU5vZGVBdChvbGRWbm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNhbWVWbm9kZShvbGRWbm9kZSwgdm5vZGUpKSB7XG4gICAgICAgICAgICBwYXRjaFZub2RlKG9sZFZub2RlLCB2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVsbSA9IG9sZFZub2RlLmVsbTtcbiAgICAgICAgICAgIHBhcmVudCA9IGFwaS5wYXJlbnROb2RlKGVsbSk7XG4gICAgICAgICAgICBjcmVhdGVFbG0odm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICBpZiAocGFyZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnQsIHZub2RlLmVsbSwgYXBpLm5leHRTaWJsaW5nKGVsbSkpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVZub2RlcyhwYXJlbnQsIFtvbGRWbm9kZV0sIDAsIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBpbnNlcnRlZFZub2RlUXVldWUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGluc2VydGVkVm5vZGVRdWV1ZVtpXS5kYXRhLmhvb2suaW5zZXJ0KGluc2VydGVkVm5vZGVRdWV1ZVtpXSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNicy5wb3N0Lmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgY2JzLnBvc3RbaV0oKTtcbiAgICAgICAgcmV0dXJuIHZub2RlO1xuICAgIH07XG59XG5leHBvcnRzLmluaXQgPSBpbml0O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9c25hYmJkb20uanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgaF8xID0gcmVxdWlyZShcIi4vaFwiKTtcbmZ1bmN0aW9uIGNvcHlUb1RodW5rKHZub2RlLCB0aHVuaykge1xuICAgIHRodW5rLmVsbSA9IHZub2RlLmVsbTtcbiAgICB2bm9kZS5kYXRhLmZuID0gdGh1bmsuZGF0YS5mbjtcbiAgICB2bm9kZS5kYXRhLmFyZ3MgPSB0aHVuay5kYXRhLmFyZ3M7XG4gICAgdGh1bmsuZGF0YSA9IHZub2RlLmRhdGE7XG4gICAgdGh1bmsuY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbjtcbiAgICB0aHVuay50ZXh0ID0gdm5vZGUudGV4dDtcbiAgICB0aHVuay5lbG0gPSB2bm9kZS5lbG07XG59XG5mdW5jdGlvbiBpbml0KHRodW5rKSB7XG4gICAgdmFyIGN1ciA9IHRodW5rLmRhdGE7XG4gICAgdmFyIHZub2RlID0gY3VyLmZuLmFwcGx5KHVuZGVmaW5lZCwgY3VyLmFyZ3MpO1xuICAgIGNvcHlUb1RodW5rKHZub2RlLCB0aHVuayk7XG59XG5mdW5jdGlvbiBwcmVwYXRjaChvbGRWbm9kZSwgdGh1bmspIHtcbiAgICB2YXIgaSwgb2xkID0gb2xkVm5vZGUuZGF0YSwgY3VyID0gdGh1bmsuZGF0YTtcbiAgICB2YXIgb2xkQXJncyA9IG9sZC5hcmdzLCBhcmdzID0gY3VyLmFyZ3M7XG4gICAgaWYgKG9sZC5mbiAhPT0gY3VyLmZuIHx8IG9sZEFyZ3MubGVuZ3RoICE9PSBhcmdzLmxlbmd0aCkge1xuICAgICAgICBjb3B5VG9UaHVuayhjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBhcmdzKSwgdGh1bmspO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGlmIChvbGRBcmdzW2ldICE9PSBhcmdzW2ldKSB7XG4gICAgICAgICAgICBjb3B5VG9UaHVuayhjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBhcmdzKSwgdGh1bmspO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvcHlUb1RodW5rKG9sZFZub2RlLCB0aHVuayk7XG59XG5leHBvcnRzLnRodW5rID0gZnVuY3Rpb24gdGh1bmsoc2VsLCBrZXksIGZuLCBhcmdzKSB7XG4gICAgaWYgKGFyZ3MgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBhcmdzID0gZm47XG4gICAgICAgIGZuID0ga2V5O1xuICAgICAgICBrZXkgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHJldHVybiBoXzEuaChzZWwsIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIGhvb2s6IHsgaW5pdDogaW5pdCwgcHJlcGF0Y2g6IHByZXBhdGNoIH0sXG4gICAgICAgIGZuOiBmbixcbiAgICAgICAgYXJnczogYXJnc1xuICAgIH0pO1xufTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydHMudGh1bms7XG4vLyMgc291cmNlTWFwcGluZ1VSTD10aHVuay5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB2bm9kZV8xID0gcmVxdWlyZShcIi4vdm5vZGVcIik7XG52YXIgaHRtbGRvbWFwaV8xID0gcmVxdWlyZShcIi4vaHRtbGRvbWFwaVwiKTtcbmZ1bmN0aW9uIHRvVk5vZGUobm9kZSwgZG9tQXBpKSB7XG4gICAgdmFyIGFwaSA9IGRvbUFwaSAhPT0gdW5kZWZpbmVkID8gZG9tQXBpIDogaHRtbGRvbWFwaV8xLmRlZmF1bHQ7XG4gICAgdmFyIHRleHQ7XG4gICAgaWYgKGFwaS5pc0VsZW1lbnQobm9kZSkpIHtcbiAgICAgICAgdmFyIGlkID0gbm9kZS5pZCA/ICcjJyArIG5vZGUuaWQgOiAnJztcbiAgICAgICAgdmFyIGNuID0gbm9kZS5nZXRBdHRyaWJ1dGUoJ2NsYXNzJyk7XG4gICAgICAgIHZhciBjID0gY24gPyAnLicgKyBjbi5zcGxpdCgnICcpLmpvaW4oJy4nKSA6ICcnO1xuICAgICAgICB2YXIgc2VsID0gYXBpLnRhZ05hbWUobm9kZSkudG9Mb3dlckNhc2UoKSArIGlkICsgYztcbiAgICAgICAgdmFyIGF0dHJzID0ge307XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IFtdO1xuICAgICAgICB2YXIgbmFtZV8xO1xuICAgICAgICB2YXIgaSA9IHZvaWQgMCwgbiA9IHZvaWQgMDtcbiAgICAgICAgdmFyIGVsbUF0dHJzID0gbm9kZS5hdHRyaWJ1dGVzO1xuICAgICAgICB2YXIgZWxtQ2hpbGRyZW4gPSBub2RlLmNoaWxkTm9kZXM7XG4gICAgICAgIGZvciAoaSA9IDAsIG4gPSBlbG1BdHRycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIG5hbWVfMSA9IGVsbUF0dHJzW2ldLm5vZGVOYW1lO1xuICAgICAgICAgICAgaWYgKG5hbWVfMSAhPT0gJ2lkJyAmJiBuYW1lXzEgIT09ICdjbGFzcycpIHtcbiAgICAgICAgICAgICAgICBhdHRyc1tuYW1lXzFdID0gZWxtQXR0cnNbaV0ubm9kZVZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDAsIG4gPSBlbG1DaGlsZHJlbi5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGNoaWxkcmVuLnB1c2godG9WTm9kZShlbG1DaGlsZHJlbltpXSwgZG9tQXBpKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdChzZWwsIHsgYXR0cnM6IGF0dHJzIH0sIGNoaWxkcmVuLCB1bmRlZmluZWQsIG5vZGUpO1xuICAgIH1cbiAgICBlbHNlIGlmIChhcGkuaXNUZXh0KG5vZGUpKSB7XG4gICAgICAgIHRleHQgPSBhcGkuZ2V0VGV4dENvbnRlbnQobm9kZSk7XG4gICAgICAgIHJldHVybiB2bm9kZV8xLmRlZmF1bHQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGV4dCwgbm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGFwaS5pc0NvbW1lbnQobm9kZSkpIHtcbiAgICAgICAgdGV4dCA9IGFwaS5nZXRUZXh0Q29udGVudChub2RlKTtcbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdCgnIScsIHt9LCBbXSwgdGV4dCwgbm9kZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KCcnLCB7fSwgW10sIHVuZGVmaW5lZCwgbm9kZSk7XG4gICAgfVxufVxuZXhwb3J0cy50b1ZOb2RlID0gdG9WTm9kZTtcbmV4cG9ydHMuZGVmYXVsdCA9IHRvVk5vZGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD10b3Zub2RlLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gdm5vZGUoc2VsLCBkYXRhLCBjaGlsZHJlbiwgdGV4dCwgZWxtKSB7XG4gICAgdmFyIGtleSA9IGRhdGEgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGRhdGEua2V5O1xuICAgIHJldHVybiB7IHNlbDogc2VsLCBkYXRhOiBkYXRhLCBjaGlsZHJlbjogY2hpbGRyZW4sXG4gICAgICAgIHRleHQ6IHRleHQsIGVsbTogZWxtLCBrZXk6IGtleSB9O1xufVxuZXhwb3J0cy52bm9kZSA9IHZub2RlO1xuZXhwb3J0cy5kZWZhdWx0ID0gdm5vZGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD12bm9kZS5qcy5tYXAiLCJmdW5jdGlvbiBub29wKCkge31cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAodXJsLCBvcHRzKSB7XG5cdG9wdHMgPSBvcHRzIHx8IHt9O1xuXG5cdHZhciB3cywgbnVtPTAsIHRpbWVyPTEsICQ9e307XG5cdHZhciBtYXggPSBvcHRzLm1heEF0dGVtcHRzIHx8IEluZmluaXR5O1xuXG5cdCQub3BlbiA9IGZ1bmN0aW9uICgpIHtcblx0XHR3cyA9IG5ldyBXZWJTb2NrZXQodXJsLCBvcHRzLnByb3RvY29scyB8fCBbXSk7XG5cblx0XHR3cy5vbm1lc3NhZ2UgPSBvcHRzLm9ubWVzc2FnZSB8fCBub29wO1xuXG5cdFx0d3Mub25vcGVuID0gZnVuY3Rpb24gKGUpIHtcblx0XHRcdChvcHRzLm9ub3BlbiB8fCBub29wKShlKTtcblx0XHRcdG51bSA9IDA7XG5cdFx0fTtcblxuXHRcdHdzLm9uY2xvc2UgPSBmdW5jdGlvbiAoZSkge1xuXHRcdFx0ZS5jb2RlID09PSAxZTMgfHwgZS5jb2RlID09PSAxMDAxIHx8IGUuY29kZSA9PT0gMTAwNSB8fCAkLnJlY29ubmVjdChlKTtcblx0XHRcdChvcHRzLm9uY2xvc2UgfHwgbm9vcCkoZSk7XG5cdFx0fTtcblxuXHRcdHdzLm9uZXJyb3IgPSBmdW5jdGlvbiAoZSkge1xuXHRcdFx0KGUgJiYgZS5jb2RlPT09J0VDT05OUkVGVVNFRCcpID8gJC5yZWNvbm5lY3QoZSkgOiAob3B0cy5vbmVycm9yIHx8IG5vb3ApKGUpO1xuXHRcdH07XG5cdH07XG5cblx0JC5yZWNvbm5lY3QgPSBmdW5jdGlvbiAoZSkge1xuXHRcdGlmICh0aW1lciAmJiBudW0rKyA8IG1heCkge1xuXHRcdFx0dGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0KG9wdHMub25yZWNvbm5lY3QgfHwgbm9vcCkoZSk7XG5cdFx0XHRcdCQub3BlbigpO1xuXHRcdFx0fSwgb3B0cy50aW1lb3V0IHx8IDFlMyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdChvcHRzLm9ubWF4aW11bSB8fCBub29wKShlKTtcblx0XHR9XG5cdH07XG5cblx0JC5qc29uID0gZnVuY3Rpb24gKHgpIHtcblx0XHR3cy5zZW5kKEpTT04uc3RyaW5naWZ5KHgpKTtcblx0fTtcblxuXHQkLnNlbmQgPSBmdW5jdGlvbiAoeCkge1xuXHRcdHdzLnNlbmQoeCk7XG5cdH07XG5cblx0JC5jbG9zZSA9IGZ1bmN0aW9uICh4LCB5KSB7XG5cdFx0dGltZXIgPSBjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdHdzLmNsb3NlKHggfHwgMWUzLCB5KTtcblx0fTtcblxuXHQkLm9wZW4oKTsgLy8gaW5pdFxuXG5cdHJldHVybiAkO1xufVxuIiwiaW1wb3J0IHsgaW5pdCB9IGZyb20gXCJzbmFiYmRvbVwiO1xuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcblxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XG5cbmltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xuXG5leHBvcnQgZnVuY3Rpb24gY2hhdFZpZXcgKGN0cmwsIGNoYXRUeXBlKSB7XG4gICAgZnVuY3Rpb24gb25LZXlQcmVzcyAoZSkge1xuICAgICAgICBjb25zdCBtZXNzYWdlID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlXG4gICAgICAgIGlmICgoZS5rZXlDb2RlID09IDEzIHx8IGUud2hpY2ggPT0gMTMpICYmIG1lc3NhZ2UubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY3RybC5zb2NrLnNlbmQoSlNPTi5zdHJpbmdpZnkoe1widHlwZVwiOiBjaGF0VHlwZSwgXCJtZXNzYWdlXCI6IG1lc3NhZ2UsIFwiZ2FtZUlkXCI6IGN0cmwubW9kZWxbXCJnYW1lSWRcIl0gfSkpO1xuICAgICAgICAgICAgKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBoKGBkaXYuJHtjaGF0VHlwZX0jJHtjaGF0VHlwZX1gLCB7IGNsYXNzOiB7XCJjaGF0XCI6IHRydWV9IH0sIFtcbiAgICAgICAgICAgICAgICBoKGBvbCMke2NoYXRUeXBlfS1tZXNzYWdlc2AsIFsgaChcImRpdiNtZXNzYWdlc1wiKV0pLFxuICAgICAgICAgICAgICAgIGgoJ2lucHV0I2NoYXQtZW50cnknLCB7XG4gICAgICAgICAgICAgICAgICAgIHByb3BzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInRleHRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwiZW50cnlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9jb21wbGV0ZTogXCJvZmZcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyOiBcIlBsZWFzZSBiZSBuaWNlIGluIHRoZSBjaGF0IVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4bGVuZ3RoOiBcIjE0MFwiLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBvbjogeyBrZXlwcmVzczogKGUpID0+IG9uS2V5UHJlc3MoZSkgfSxcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgXSlcbiAgICB9XG5cbmV4cG9ydCBmdW5jdGlvbiBjaGF0TWVzc2FnZSAodXNlciwgbWVzc2FnZSwgY2hhdFR5cGUpIHtcbiAgICBjb25zdCBteURpdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNoYXRUeXBlICsgJy1tZXNzYWdlcycpIGFzIEhUTUxFbGVtZW50O1xuICAgIC8vIFlvdSBtdXN0IGFkZCBib3JkZXIgd2lkdGhzLCBwYWRkaW5nIGFuZCBtYXJnaW5zIHRvIHRoZSByaWdodC5cbiAgICBjb25zdCBpc1Njcm9sbGVkID0gbXlEaXYuc2Nyb2xsVG9wID09IG15RGl2LnNjcm9sbEhlaWdodCAtIG15RGl2Lm9mZnNldEhlaWdodDtcblxuICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWVzc2FnZXMnKSBhcyBIVE1MRWxlbWVudDtcbiAgICBpZiAodXNlci5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdkaXYjbWVzc2FnZXMnLCBbIGgoXCJsaS5tZXNzYWdlLm9mZmVyXCIsIFtoKFwidFwiLCBtZXNzYWdlKV0pIF0pKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2RpdiNtZXNzYWdlcycsIFsgaChcImxpLm1lc3NhZ2VcIiwgW2goXCJ1c2VyXCIsIHVzZXIpLCBoKFwidFwiLCBtZXNzYWdlKV0pIF0pKTtcbiAgICB9O1xuXG4gICAgaWYgKGlzU2Nyb2xsZWQpIG15RGl2LnNjcm9sbFRvcCA9IG15RGl2LnNjcm9sbEhlaWdodDtcbn0iLCJpbXBvcnQgeyBrZXkycG9zIH0gZnJvbSAnY2hlc3Nncm91bmR4L3V0aWwnO1xyXG5pbXBvcnQgeyBDb2xvciwgR2VvbWV0cnksIEtleSwgUm9sZSB9IGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XHJcblxyXG5leHBvcnQgY29uc3QgdmFyaWFudHMgPSBbXCJtYWtydWtcIiwgXCJzaXR0dXlpblwiLCBcInBsYWNlbWVudFwiLCBcImNyYXp5aG91c2VcIiwgXCJzdGFuZGFyZFwiLCBcInNob2dpXCIsIFwieGlhbmdxaVwiLCBcImNhcGFibGFuY2FcIiwgXCJzZWlyYXdhblwiXTtcclxuXHJcbmV4cG9ydCBjb25zdCBWQVJJQU5UUyA9IHtcclxuICAgIG1ha3J1azogeyBnZW9tOiBHZW9tZXRyeS5kaW04eDgsIGNnOiBcImNnLTUxMlwiLCBib2FyZDogXCJncmlkXCIsIHBpZWNlczogXCJtYWtydWtcIiwgY3NzOiBbXCJtYWtydWtcIl0sIGljb246IFwiUVwifSxcclxuICAgIHNpdHR1eWluOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImdyaWR4XCIsIHBpZWNlczogXCJtYWtydWtcIiwgY3NzOiBbXCJzaXR0dXlpblwiXSwgaWNvbjogXCJSXCIgfSxcclxuICAgIHNob2dpOiB7IGdlb206IEdlb21ldHJ5LmRpbTl4OSwgY2c6IFwiY2ctNTc2XCIsIGJvYXJkOiBcImdyaWQ5eDlcIiwgcGllY2VzOiBcInNob2dpXCIsIGNzczogW1wic2hvZ2kwXCIsIFwic2hvZ2kwd1wiLCBcInNob2dpMHBcIl0sIGljb246IFwiS1wiIH0sXHJcbiAgICB4aWFuZ3FpOiB7IGdlb206IEdlb21ldHJ5LmRpbTl4MTAsIGNnOiBcImNnLTU3Ni02NDBcIiwgYm9hcmQ6IFwicml2ZXJcIiwgcGllY2VzOiBcInhpYW5ncWlcIiwgY3NzOiBbXCJ4aWFuZ3FpXCIsIFwieGlhbmdxaWVcIiwgXCJ4aWFuZ3FpY3RcIl0sIGljb246IFwiT1wiIH0sXHJcbiAgICBwbGFjZW1lbnQ6IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiYnJvd25cIiwgcGllY2VzOiBcIm1lcmlkYVwiLCBjc3M6IFtcInN0YW5kYXJkXCJdLCBpY29uOiBcIlNcIiB9LFxyXG4gICAgY3Jhenlob3VzZTogeyBnZW9tOiBHZW9tZXRyeS5kaW04eDgsIGNnOiBcImNnLTUxMlwiLCBib2FyZDogXCJicm93blwiLCBwaWVjZXM6IFwibWVyaWRhXCIsIGNzczogW1wic3RhbmRhcmRcIl0sIGljb246IFwiSFwiIH0sXHJcbiAgICBjYXBhYmxhbmNhOiB7IGdlb206IEdlb21ldHJ5LmRpbTEweDgsIGNnOiBcImNnLTY0MFwiLCBib2FyZDogXCJjYXBhYmxhbmNhXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBbXCJjYXBhYmxhbmNhXCJdLCBpY29uOiBcIlBcIiB9LFxyXG4gICAgc2VpcmF3YW46IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiYnJvd25cIiwgcGllY2VzOiBcIm1lcmlkYVwiLCBjc3M6IFtcInNlaXJhd2FuXCJdLCBpY29uOiBcIkxcIiB9LFxyXG4gICAgc3RhbmRhcmQ6IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiYnJvd25cIiwgcGllY2VzOiBcIm1lcmlkYVwiLCBjc3M6IFtcInN0YW5kYXJkXCJdLCBpY29uOiBcIk1cIiB9LFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcG9ja2V0Um9sZXModmFyaWFudDogc3RyaW5nKSB7XHJcbiAgICBzd2l0Y2ggKHZhcmlhbnQpIHtcclxuICAgIGNhc2UgXCJzaXR0dXlpblwiOlxyXG4gICAgICAgIHJldHVybiBbXCJyb29rXCIsIFwia25pZ2h0XCIsIFwic2lsdmVyXCIsIFwiZmVyelwiLCBcImtpbmdcIl07XHJcbiAgICBjYXNlIFwiY3Jhenlob3VzZVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJwYXduXCIsIFwia25pZ2h0XCIsIFwiYmlzaG9wXCIsIFwicm9va1wiLCBcInF1ZWVuXCJdO1xyXG4gICAgY2FzZSBcInNob2dpXCI6XHJcbiAgICAgICAgcmV0dXJuIFtcInBhd25cIiwgXCJsYW5jZVwiLCBcImtuaWdodFwiLCBcImJpc2hvcFwiLCBcInJvb2tcIiwgXCJzaWx2ZXJcIiwgXCJnb2xkXCJdO1xyXG4gICAgY2FzZSBcInNlaXJhd2FuXCI6XHJcbiAgICAgICAgcmV0dXJuIFtcImVsZXBoYW50XCIsIFwiaGF3a1wiXTtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIFtcInJvb2tcIiwgXCJrbmlnaHRcIiwgXCJiaXNob3BcIiwgXCJxdWVlblwiLCBcImtpbmdcIl07XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb21vdGlvblpvbmUodmFyaWFudDogc3RyaW5nLCBjb2xvcjogc3RyaW5nKSB7XHJcbiAgICBzd2l0Y2ggKHZhcmlhbnQpIHtcclxuICAgIGNhc2UgJ3Nob2dpJzpcclxuICAgICAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYTliOWM5ZDllOWY5ZzloOWk5YThiOGM4ZDhlOGY4ZzhoOGk4YTdiN2M3ZDdlN2Y3ZzdoN2k3JyA6ICdhMWIxYzFkMWUxZjFnMWgxaTFhMmIyYzJkMmUyZjJnMmgyaTJhM2IzYzNkM2UzZjNnM2gzaTMnO1xyXG4gICAgY2FzZSAnbWFrcnVrJzpcclxuICAgICAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYTZiNmM2ZDZlNmY2ZzZoNicgOiAnYTNiM2MzZDNlM2YzZzNoMyc7XHJcbiAgICBjYXNlICdzaXR0dXlpbic6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E4YjdjNmQ1ZTVmNmc3aDgnIDogJ2ExYjJjM2Q0ZTRmM2cyaDEnO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYThiOGM4ZDhlOGY4ZzhoOGk4ajgnIDogJ2ExYjFjMWQxZTFmMWcxaDFpMWoxJztcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHByb21vdGlvblJvbGVzKHZhcmlhbnQ6IHN0cmluZywgcm9sZTogUm9sZSkge1xyXG4gICAgc3dpdGNoICh2YXJpYW50KSB7XHJcbiAgICBjYXNlIFwiY2FwYWJsYW5jYVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJxdWVlblwiLCBcImtuaWdodFwiLCBcInJvb2tcIiwgXCJiaXNob3BcIiwgXCJhcmNoYmlzaG9wXCIsIFwiY2FuY2VsbG9yXCJdO1xyXG4gICAgY2FzZSBcInNlaXJhd2FuXCI6XHJcbiAgICAgICAgcmV0dXJuIFtcInF1ZWVuXCIsIFwia25pZ2h0XCIsIFwicm9va1wiLCBcImJpc2hvcFwiLCBcImVsZXBoYW50XCIsIFwiaGF3a1wiXTtcclxuICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJwXCIgKyByb2xlLCByb2xlXTtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIFtcInF1ZWVuXCIsIFwia25pZ2h0XCIsIFwicm9va1wiLCBcImJpc2hvcFwiXTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1hbmRhdG9yeVByb21vdGlvbihyb2xlOiBSb2xlLCBkZXN0OiBLZXksIGNvbG9yOiBDb2xvcikge1xyXG4gICAgc3dpdGNoIChyb2xlKSB7XHJcbiAgICBjYXNlIFwicGF3blwiOlxyXG4gICAgY2FzZSBcImxhbmNlXCI6XHJcbiAgICAgICAgaWYgKGNvbG9yID09PSBcIndoaXRlXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGRlc3RbMV0gPT09IFwiOVwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjFcIjtcclxuICAgICAgICB9XHJcbiAgICBjYXNlIFwia25pZ2h0XCI6XHJcbiAgICAgICAgaWYgKGNvbG9yID09PSBcIndoaXRlXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGRlc3RbMV0gPT09IFwiOVwiIHx8IGRlc3RbMV0gPT09IFwiOFwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjFcIiB8fCBkZXN0WzFdID09PSBcIjJcIjtcclxuICAgICAgICB9XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5lZWRQb2NrZXRzKHZhcmlhbnQ6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHZhcmlhbnQgPT09ICdwbGFjZW1lbnQnIHx8IHZhcmlhbnQgPT09ICdjcmF6eWhvdXNlJyB8fCB2YXJpYW50ID09PSAnc2l0dHV5aW4nIHx8IHZhcmlhbnQgPT09ICdzaG9naScgfHwgdmFyaWFudCA9PT0gJ3NlaXJhd2FuJ1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaGFzRXAodmFyaWFudDogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gdmFyaWFudCA9PT0gJ3N0YW5kYXJkJyB8fCB2YXJpYW50ID09PSAncGxhY2VtZW50JyB8fCB2YXJpYW50ID09PSAnY3Jhenlob3VzZScgfHwgdmFyaWFudCA9PT0gJ2NhcGFibGFuY2EnIHx8IHZhcmlhbnQgPT09ICdzZWlyYXdhbidcclxufVxyXG5cclxuZnVuY3Rpb24gZGlmZihhOiBudW1iZXIsIGI6bnVtYmVyKTpudW1iZXIge1xyXG4gIHJldHVybiBNYXRoLmFicyhhIC0gYik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpYWdvbmFsTW92ZShwb3MxLCBwb3MyKSB7XHJcbiAgICBjb25zdCB4ZCA9IGRpZmYocG9zMVswXSwgcG9zMlswXSk7XHJcbiAgICBjb25zdCB5ZCA9IGRpZmYocG9zMVsxXSwgcG9zMlsxXSk7XHJcbiAgICByZXR1cm4geGQgPT09IHlkICYmIHhkID09PSAxO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FuR2F0ZShmZW4sIHBpZWNlLCBvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIiAgIGlzR2F0aW5nKClcIiwgcGllY2UsIG9yaWcsIGRlc3QsIG1ldGEpO1xyXG4gICAgaWYgKChwaWVjZS5jb2xvciA9PT0gXCJ3aGl0ZVwiICYmIG9yaWcuc2xpY2UoMSkgIT09IFwiMVwiKSB8fFxyXG4gICAgICAgIChwaWVjZS5jb2xvciA9PT0gXCJibGFja1wiICYmIG9yaWcuc2xpY2UoMSkgIT09IFwiOFwiKSB8fFxyXG4gICAgICAgIChwaWVjZS5yb2xlID09PSBcImhhd2tcIikgfHxcclxuICAgICAgICAocGllY2Uucm9sZSA9PT0gXCJlbGVwaGFudFwiKSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG5cclxuICAgIC8vIEluIHN0YXJ0aW5nIHBvc2l0aW9uIGtpbmcgYW5kKCEpIHJvb2sgdmlyZ2luaXR5IGlzIGVuY29kZWQgaW4gS1FrcVxyXG4gICAgLy8gXCJybmJxa2Juci9wcHBwcHBwcC84LzgvOC84L1BQUFBQUFBQL1JOQlFLQk5SW0hFaGVdIHcgS1FCQ0RGR2txYmNkZmcgLSAwIDFcIlxyXG5cclxuICAgIC8vIGJ1dCBhZnRlciBraW5ncyBtb3ZlZCByb29rIHZpcmdpbml0eSBpcyBlbmNvZGVkIGluIEFIYWhcclxuICAgIC8vIHJuYnExYm5yL3BwcHBrcHBwLzgvNHAzLzRQMy84L1BQUFBLUFBQL1JOQlExQk5SW0hFaGVdIHcgQUJDREZHSGFiY2RmZ2ggLSAyIDNcclxuXHJcbiAgICBjb25zdCBwYXJ0cyA9IGZlbi5zcGxpdChcIiBcIik7XHJcbiAgICBjb25zdCBwbGFjZW1lbnQgPSBwYXJ0c1swXTtcclxuICAgIGNvbnN0IGNvbG9yID0gcGFydHNbMV07XHJcbiAgICBjb25zdCBjYXN0bCA9IHBhcnRzWzJdO1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJpc0dhdGluZygpXCIsIG9yaWcsIHBsYWNlbWVudCwgY29sb3IsIGNhc3RsKTtcclxuICAgIHN3aXRjaCAob3JpZykge1xyXG4gICAgY2FzZSBcImExXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJBXCIpID09PSAtMSAmJiBjYXN0bC5pbmRleE9mKFwiUVwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJiMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiQlwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJjMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiQ1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJkMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiRFwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJlMVwiOlxyXG4gICAgICAgIGlmIChwaWVjZS5yb2xlICE9PSBcImtpbmdcIikgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImYxXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJGXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImcxXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJHXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImgxXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJIXCIpID09PSAtMSAmJiBjYXN0bC5pbmRleE9mKFwiS1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJhOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiYVwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcInFcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYjhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImJcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYzhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImNcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZDhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImRcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZThcIjpcclxuICAgICAgICBpZiAocGllY2Uucm9sZSAhPT0gXCJraW5nXCIpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJmOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiZlwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJnOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiZ1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJoOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiaFwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcImtcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9O1xyXG4gICAgY29uc3QgYnJhY2tldFBvcyA9IHBsYWNlbWVudC5pbmRleE9mKFwiW1wiKTtcclxuICAgIGNvbnN0IHBvY2tldHMgPSBwbGFjZW1lbnQuc2xpY2UoYnJhY2tldFBvcyk7XHJcbiAgICBjb25zdCBwaCA9IGxjKHBvY2tldHMsIFwiaFwiLCBjb2xvcj09PSd3JykgPT09IDE7XHJcbiAgICBjb25zdCBwZSA9IGxjKHBvY2tldHMsIFwiZVwiLCBjb2xvcj09PSd3JykgPT09IDE7XHJcblxyXG4gICAgcmV0dXJuIFtwaCwgcGVdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9tb3Rpb24odmFyaWFudCwgcGllY2UsIG9yaWcsIGRlc3QsIG1ldGEpIHtcclxuICAgIGlmICh2YXJpYW50ID09PSAneGlhbmdxaScpIHJldHVybiBmYWxzZTtcclxuICAgIGNvbnN0IHB6ID0gcHJvbW90aW9uWm9uZSh2YXJpYW50LCBwaWVjZS5jb2xvcilcclxuICAgIHN3aXRjaCAodmFyaWFudCkge1xyXG4gICAgY2FzZSAnc2hvZ2knOlxyXG4gICAgICAgIHJldHVybiBbJ2tpbmcnLCAnZ29sZCcsICdwcGF3bicsICdwa25pZ2h0JywgJ3BiaXNob3AnLCAncHJvb2snLCAncHNpbHZlcicsICdwbGFuY2UnXS5pbmRleE9mKHBpZWNlLnJvbGUpID09PSAtMVxyXG4gICAgICAgICAgICAmJiAocHouaW5kZXhPZihvcmlnKSAhPT0gLTEgfHwgcHouaW5kZXhPZihkZXN0KSAhPT0gLTEpXHJcbiAgICBjYXNlICdzaXR0dXlpbic6XHJcbiAgICAgICAgLy8gU2VlIGh0dHBzOi8vdmRvY3VtZW50cy5uZXQvaG93LXRvLXBsYXktbXlhbm1hci10cmFkaXRpb25hbC1jaGVzcy1lbmctYm9vay0xLmh0bWxcclxuICAgICAgICBjb25zdCBmaXJzdFJhbmtJczAgPSBmYWxzZTtcclxuICAgICAgICBjb25zdCBkbSA9IGRpYWdvbmFsTW92ZShrZXkycG9zKG9yaWcsIGZpcnN0UmFua0lzMCksIGtleTJwb3MoZGVzdCwgZmlyc3RSYW5rSXMwKSk7XHJcbiAgICAgICAgcmV0dXJuIHBpZWNlLnJvbGUgPT09IFwicGF3blwiICYmICggb3JpZyA9PT0gZGVzdCB8fCAoIW1ldGEuY2FwdHVyZWQgJiYgZG0pKVxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gcGllY2Uucm9sZSA9PT0gXCJwYXduXCIgJiYgcHouaW5kZXhPZihkZXN0KSAhPT0gLTFcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHVjaTJ1c2kobW92ZSkge1xyXG4gICAgY29uc3QgcGFydHMgPSBtb3ZlLnNwbGl0KFwiXCIpO1xyXG4gICAgaWYgKHBhcnRzWzFdID09PSBcIkBcIikge1xyXG4gICAgICAgIHBhcnRzWzFdID0gXCIqXCI7XHJcbiAgICAgICAgcGFydHNbMl0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzJdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgICAgIHBhcnRzWzNdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1szXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcGFydHNbMF0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzBdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgICAgIHBhcnRzWzFdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1sxXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgICAgICBwYXJ0c1syXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMl0uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICAgICAgcGFydHNbM10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzNdLmNoYXJDb2RlQXQoKSArIDQ4KVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1c2kydWNpKG1vdmUpIHtcclxuICAgIGNvbnN0IHBhcnRzID0gbW92ZS5zcGxpdChcIlwiKTtcclxuICAgIGlmIChwYXJ0c1sxXSA9PT0gXCIqXCIpIHtcclxuICAgICAgICBwYXJ0c1sxXSA9IFwiQFwiO1xyXG4gICAgICAgIHBhcnRzWzJdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1syXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgICAgICBwYXJ0c1szXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbM10uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHBhcnRzWzBdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1swXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgICAgICBwYXJ0c1sxXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMV0uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICAgICAgcGFydHNbMl0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzJdLmNoYXJDb2RlQXQoKSArIDQ4KVxyXG4gICAgICAgIHBhcnRzWzNdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1szXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgIH1cclxuICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgcm9sZVRvU2FuID0ge1xyXG4gICAgcGF3bjogJ1AnLFxyXG4gICAga25pZ2h0OiAnTicsXHJcbiAgICBiaXNob3A6ICdCJyxcclxuICAgIHJvb2s6ICdSJyxcclxuICAgIHF1ZWVuOiAnUScsXHJcbiAgICBraW5nOiAnSycsXHJcbiAgICBhcmNoYmlzaG9wOiAnQScsXHJcbiAgICBjYW5jZWxsb3I6ICdDJyxcclxuICAgIGVsZXBoYW50OiBcIkVcIixcclxuICAgIGhhd2s6IFwiSFwiLFxyXG4gICAgZmVyejogJ0YnLFxyXG4gICAgbWV0OiAnTScsXHJcbiAgICBnb2xkOiAnRycsXHJcbiAgICBzaWx2ZXI6ICdTJyxcclxuICAgIGxhbmNlOiAnTCcsXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3Qgc2FuVG9Sb2xlID0ge1xyXG4gICAgUDogJ3Bhd24nLFxyXG4gICAgTjogJ2tuaWdodCcsXHJcbiAgICBCOiAnYmlzaG9wJyxcclxuICAgIFI6ICdyb29rJyxcclxuICAgIFE6ICdxdWVlbicsXHJcbiAgICBLOiAna2luZycsXHJcbiAgICBBOiAnYXJjaGJpc2hvcCcsXHJcbiAgICBDOiAnY2FuY2VsbG9yJyxcclxuICAgIEU6ICdlbGVwaGFudCcsXHJcbiAgICBIOiAnaGF3aycsXHJcbiAgICBGOiAnZmVyeicsXHJcbiAgICBNOiAnbWV0JyxcclxuICAgIEc6ICdnb2xkJyxcclxuICAgIFM6ICdzaWx2ZXInLFxyXG4gICAgTDogJ2xhbmNlJyxcclxuICAgIHA6ICdwYXduJyxcclxuICAgIG46ICdrbmlnaHQnLFxyXG4gICAgYjogJ2Jpc2hvcCcsXHJcbiAgICByOiAncm9vaycsXHJcbiAgICBxOiAncXVlZW4nLFxyXG4gICAgazogJ2tpbmcnLFxyXG4gICAgYTogJ2FyY2hiaXNob3AnLFxyXG4gICAgYzogJ2NhbmNlbGxvcicsXHJcbiAgICBlOiAnZWxlcGhhbnQnLFxyXG4gICAgaDogJ2hhd2snLFxyXG4gICAgZjogJ2ZlcnonLFxyXG4gICAgbTogJ21ldCcsXHJcbiAgICBnOiAnZ29sZCcsXHJcbiAgICBzOiAnc2lsdmVyJyxcclxuICAgIGw6ICdsYW5jZScsXHJcbn07XHJcblxyXG4vLyBDb3VudCBnaXZlbiBsZXR0ZXIgb2NjdXJlbmNlcyBpbiBhIHN0cmluZ1xyXG5leHBvcnQgZnVuY3Rpb24gbGMoc3RyLCBsZXR0ZXIsIHVwcGVyY2FzZSkge1xyXG4gICAgdmFyIGxldHRlckNvdW50ID0gMDtcclxuICAgIGlmICh1cHBlcmNhc2UpIGxldHRlciA9IGxldHRlci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgZm9yICh2YXIgcG9zaXRpb24gPSAwOyBwb3NpdGlvbiA8IHN0ci5sZW5ndGg7IHBvc2l0aW9uKyspIHtcclxuICAgICAgICBpZiAoc3RyLmNoYXJBdChwb3NpdGlvbikgPT09IGxldHRlcikgbGV0dGVyQ291bnQgKz0gMTtcclxuICAgIH1cclxuICAgIHJldHVybiBsZXR0ZXJDb3VudDtcclxufVxyXG4iLCIvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8yMDYxODM1NS90aGUtc2ltcGxlc3QtcG9zc2libGUtamF2YXNjcmlwdC1jb3VudGRvd24tdGltZXJcblxuaW1wb3J0IHsgaCwgaW5pdCB9IGZyb20gXCJzbmFiYmRvbVwiO1xuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcblxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XG5cbmV4cG9ydCBjbGFzcyBDbG9jayB7XG4gICAgZHVyYXRpb246IG51bWJlcjtcbiAgICBpbmNyZW1lbnQ6IG51bWJlcjtcbiAgICBncmFudWxhcml0eTogbnVtYmVyO1xuICAgIHJ1bm5pbmc6IGJvb2xlYW47XG4gICAgY29ubmVjdGluZzogYm9vbGVhbjtcbiAgICB0aW1lb3V0OiBhbnk7XG4gICAgc3RhcnRUaW1lOiBhbnk7XG4gICAgdGlja0NhbGxiYWNrczogYW55W107XG4gICAgZmxhZ0NhbGxiYWNrOiBhbnk7XG4gICAgZWw6IEhUTUxFbGVtZW50O1xuXG4gICAgLy8gZ2FtZSBiYXNlVGltZSAobWluKSBhbmQgaW5jcmVtZW50IChzZWMpXG4gICAgY29uc3RydWN0b3IoYmFzZVRpbWUsIGluY3JlbWVudCwgZWwpIHtcbiAgICB0aGlzLmR1cmF0aW9uID0gYmFzZVRpbWUgKiAxMDAwICogNjA7XG4gICAgdGhpcy5pbmNyZW1lbnQgPSBpbmNyZW1lbnQgKiAxMDAwO1xuICAgIHRoaXMuZ3JhbnVsYXJpdHkgPSA1MDA7XG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgdGhpcy5jb25uZWN0aW5nID0gZmFsc2U7XG4gICAgdGhpcy50aW1lb3V0ID0gbnVsbDtcbiAgICB0aGlzLnN0YXJ0VGltZSA9IG51bGw7XG4gICAgdGhpcy50aWNrQ2FsbGJhY2tzID0gW107XG4gICAgdGhpcy5mbGFnQ2FsbGJhY2sgPSBudWxsO1xuICAgIHRoaXMuZWwgPSBlbDtcblxuICAgIHJlbmRlclRpbWUodGhpcywgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgc3RhcnQgPSAoZHVyYXRpb24pID0+IHtcbiAgICAgICAgaWYgKHRoaXMucnVubmluZykgcmV0dXJuO1xuICAgICAgICBpZiAodHlwZW9mIGR1cmF0aW9uICE9PSBcInVuZGVmaW5lZFwiKSB0aGlzLmR1cmF0aW9uID0gZHVyYXRpb247XG5cbiAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgIHZhciBkaWZmO1xuXG4gICAgICAgIChmdW5jdGlvbiB0aW1lcigpIHtcbiAgICAgICAgICAgIGRpZmYgPSB0aGF0LmR1cmF0aW9uIC0gKERhdGUubm93KCkgLSB0aGF0LnN0YXJ0VGltZSk7XG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcInRpbWVyKClcIiwgdGhhdC5kdXJhdGlvbiAtIGRpZmYpO1xuICAgICAgICAgICAgaWYgKGRpZmYgPD0gMCkge1xuICAgICAgICAgICAgICAgIHRoYXQuZmxhZ0NhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgdGhhdC5wYXVzZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhhdC50aW1lb3V0ID0gc2V0VGltZW91dCh0aW1lciwgdGhhdC5ncmFudWxhcml0eSk7XG4gICAgICAgICAgICB0aGF0LnRpY2tDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhhdCwgdGhhdCwgZGlmZik7XG4gICAgICAgICAgICB9LCB0aGF0KTtcbiAgICAgICAgfSgpKTtcbiAgICB9XG5cbiAgICBvblRpY2sgPSAoY2FsbGJhY2spID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy50aWNrQ2FsbGJhY2tzLnB1c2goY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uRmxhZyA9IChjYWxsYmFjaykgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLnBhdXNlKGZhbHNlKTtcbiAgICAgICAgICAgIHRoaXMuZmxhZ0NhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcGF1c2UgPSAod2l0aEluY3JlbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy50aW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KTtcbiAgICAgICAgdGhpcy50aW1lb3V0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLmR1cmF0aW9uIC09IERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZTtcbiAgICAgICAgaWYgKHdpdGhJbmNyZW1lbnQgJiYgdGhpcy5pbmNyZW1lbnQpIHRoaXMuZHVyYXRpb24gKz0gdGhpcy5pbmNyZW1lbnQ7XG4gICAgICAgIHJlbmRlclRpbWUodGhpcywgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgc2V0VGltZSA9IChtaWxsaXMpID0+IHtcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IG1pbGxpcztcbiAgICAgICAgcmVuZGVyVGltZSh0aGlzLCB0aGlzLmR1cmF0aW9uKTtcbiAgICB9XG5cbiAgICBwYXJzZVRpbWUgPSAobWlsbGlzKSA9PiB7XG4gICAgICAgIGxldCBtaW51dGVzID0gTWF0aC5mbG9vcihtaWxsaXMgLyA2MDAwMCk7XG4gICAgICAgIGxldCBzZWNvbmRzID0gKG1pbGxpcyAlIDYwMDAwKSAvIDEwMDA7XG4gICAgICAgIGxldCBzZWNzLCBtaW5zO1xuICAgICAgICBpZiAoTWF0aC5mbG9vcihzZWNvbmRzKSA9PSA2MCkge1xuICAgICAgICAgICAgbWludXRlcysrO1xuICAgICAgICAgICAgc2Vjb25kcyA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgbWludXRlcyA9IE1hdGgubWF4KDAsIG1pbnV0ZXMpO1xuICAgICAgICBzZWNvbmRzID0gTWF0aC5tYXgoMCwgc2Vjb25kcyk7XG4gICAgICAgIGlmIChtaWxsaXMgPCAxMDAwMCkge1xuICAgICAgICAgICAgc2VjcyA9IHNlY29uZHMudG9GaXhlZCgxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlY3MgPSBTdHJpbmcoTWF0aC5mbG9vcihzZWNvbmRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgbWlucyA9IChtaW51dGVzIDwgMTAgPyBcIjBcIiA6IFwiXCIpICsgU3RyaW5nKG1pbnV0ZXMpO1xuICAgICAgICBzZWNzID0gKHNlY29uZHMgPCAxMCA/IFwiMFwiIDogXCJcIikgKyBzZWNzO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWludXRlczogbWlucyxcbiAgICAgICAgICAgIHNlY29uZHM6IHNlY3MsXG4gICAgICAgIH07XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVGltZShjbG9jaywgdGltZSkge1xuICAgIGlmIChjbG9jay5ncmFudWxhcml0eSA+IDEwMCAmJiB0aW1lIDwgMTAwMDApIGNsb2NrLmdyYW51bGFyaXR5ID0gMTAwO1xuICAgIGNvbnN0IHBhcnNlZCA9IGNsb2NrLnBhcnNlVGltZSh0aW1lKTtcbiAgICAvLyBjb25zb2xlLmxvZyhcInJlbmRlclRpbWUoKTpcIiwgdGltZSwgcGFyc2VkKTtcblxuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0aW1lKTtcbiAgICBjb25zdCBtaWxsaXMgPSBkYXRlLmdldFVUQ01pbGxpc2Vjb25kcygpO1xuICAgIGNsb2NrLmVsID0gcGF0Y2goY2xvY2suZWwsIGgoJ2Rpdi5jbG9jay13cmFwJywgW2goJ2Rpdi5jbG9jaycsIFtcbiAgICAgICAgaCgnZGl2LmNsb2NrLnRpbWUubWluJywge2NsYXNzOiB7cnVubmluZzogY2xvY2sucnVubmluZywgaHVycnk6IHRpbWUgPCAxMDAwMCwgY29ubmVjdGluZzogY2xvY2suY29ubmVjdGluZ319LCBwYXJzZWQubWludXRlcyksXG4gICAgICAgIGgoJ2Rpdi5jbG9jay5zZXAnLCB7Y2xhc3M6IHtydW5uaW5nOiBjbG9jay5ydW5uaW5nLCBodXJyeTogdGltZSA8IDEwMDAwLCBsb3c6IG1pbGxpcyA8IDUwMCwgY29ubmVjdGluZzogY2xvY2suY29ubmVjdGluZ319ICwgJzonKSxcbiAgICAgICAgaCgnZGl2LmNsb2NrLnRpbWUuc2VjJywge2NsYXNzOiB7cnVubmluZzogY2xvY2sucnVubmluZywgaHVycnk6IHRpbWUgPCAxMDAwMCwgY29ubmVjdGluZzogY2xvY2suY29ubmVjdGluZ319LCBwYXJzZWQuc2Vjb25kcyksXG4gICAgICAgIF0pXSkpO1xufVxuIiwiaW1wb3J0IFNvY2tldHRlIGZyb20gJ3NvY2tldHRlJztcclxuXHJcbmltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XHJcbmltcG9ydCB7IGggfSBmcm9tICdzbmFiYmRvbS9oJztcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuXHJcbmltcG9ydCB7IGtleTJwb3MsIHBvczJrZXkgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcbmltcG9ydCB7IENoZXNzZ3JvdW5kIH0gZnJvbSAnY2hlc3Nncm91bmR4JztcclxuaW1wb3J0IHsgQXBpIH0gZnJvbSAnY2hlc3Nncm91bmR4L2FwaSc7XHJcbmltcG9ydCB7IENvbG9yLCBEZXN0cywgUGllY2VzRGlmZiwgUm9sZSwgS2V5LCBQb3MsIFBpZWNlLCBkaW1lbnNpb25zIH0gZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcclxuXHJcbmltcG9ydCB7IENsb2NrLCByZW5kZXJUaW1lIH0gZnJvbSAnLi9jbG9jayc7XHJcbmltcG9ydCBtYWtlR2F0aW5nIGZyb20gJy4vZ2F0aW5nJztcclxuaW1wb3J0IG1ha2VQcm9tb3Rpb24gZnJvbSAnLi9wcm9tb3Rpb24nO1xyXG5pbXBvcnQgeyBkcm9wSXNWYWxpZCwgcG9ja2V0VmlldywgdXBkYXRlUG9ja2V0cyB9IGZyb20gJy4vcG9ja2V0JztcclxuaW1wb3J0IHsgc291bmQsIGNoYW5nZUNTUyB9IGZyb20gJy4vc291bmQnO1xyXG5pbXBvcnQgeyB2YXJpYW50cywgaGFzRXAsIG5lZWRQb2NrZXRzLCByb2xlVG9TYW4sIHVjaTJ1c2ksIHVzaTJ1Y2ksIFZBUklBTlRTIH0gZnJvbSAnLi9jaGVzcyc7XHJcbmltcG9ydCB7IHJlbmRlclVzZXJuYW1lIH0gZnJvbSAnLi91c2VyJztcclxuaW1wb3J0IHsgY2hhdE1lc3NhZ2UsIGNoYXRWaWV3IH0gZnJvbSAnLi9jaGF0JztcclxuaW1wb3J0IHsgbW92ZWxpc3RWaWV3LCB1cGRhdGVNb3ZlbGlzdCB9IGZyb20gJy4vbW92ZWxpc3QnO1xyXG5pbXBvcnQgcmVzaXplSGFuZGxlIGZyb20gJy4vcmVzaXplJztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFJvdW5kQ29udHJvbGxlciB7XHJcbiAgICBtb2RlbDtcclxuICAgIHNvY2s7XHJcbiAgICBldnRIYW5kbGVyO1xyXG4gICAgY2hlc3Nncm91bmQ6IEFwaTtcclxuICAgIGZ1bGxmZW46IHN0cmluZztcclxuICAgIHdwbGF5ZXI6IHN0cmluZztcclxuICAgIGJwbGF5ZXI6IHN0cmluZztcclxuICAgIGJhc2U6IG51bWJlcjtcclxuICAgIGluYzogbnVtYmVyO1xyXG4gICAgbXljb2xvcjogQ29sb3I7XHJcbiAgICBvcHBjb2xvcjogQ29sb3I7XHJcbiAgICB0dXJuQ29sb3I6IENvbG9yO1xyXG4gICAgY2xvY2tzOiBhbnk7XHJcbiAgICBhYm9ydGFibGU6IGJvb2xlYW47XHJcbiAgICBnYW1lSWQ6IHN0cmluZztcclxuICAgIHZhcmlhbnQ6IHN0cmluZztcclxuICAgIHBvY2tldHM6IGFueTtcclxuICAgIHZwb2NrZXQwOiBhbnk7XHJcbiAgICB2cG9ja2V0MTogYW55O1xyXG4gICAgZ2FtZUNvbnRyb2xzOiBhbnk7XHJcbiAgICBtb3ZlQ29udHJvbHM6IGFueTtcclxuICAgIGdhdGluZzogYW55O1xyXG4gICAgcHJvbW90aW9uOiBhbnk7XHJcbiAgICBkZXN0czogRGVzdHM7XHJcbiAgICBsYXN0bW92ZTogS2V5W107XHJcbiAgICBwcmVtb3ZlOiBhbnk7XHJcbiAgICBwcmVkcm9wOiBhbnk7XHJcbiAgICByZXN1bHQ6IHN0cmluZztcclxuICAgIGZsaXA6IGJvb2xlYW47XHJcbiAgICBzcGVjdGF0b3I6IGJvb2xlYW47XHJcbiAgICBvcHBJc1JhbmRvbU1vdmVyOiBib29sZWFuO1xyXG4gICAgdHY6IHN0cmluZztcclxuICAgIHN0YXR1czogbnVtYmVyO1xyXG4gICAgc3RlcHM7XHJcbiAgICBwbHk6IG51bWJlcjtcclxuICAgIHBsYXllcnM6IHN0cmluZ1tdO1xyXG4gICAgQ1NTaW5kZXhlczogbnVtYmVyW107XHJcblxyXG4gICAgY29uc3RydWN0b3IoZWwsIG1vZGVsLCBoYW5kbGVyKSB7XHJcbiAgICAgICAgY29uc3Qgb25PcGVuID0gKGV2dCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImN0cmwub25PcGVuKClcIiwgZXZ0KTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMF0uY29ubmVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1sxXS5jb25uZWN0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJnYW1lX3VzZXJfY29ubmVjdGVkXCIsIHVzZXJuYW1lOiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0sIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtYXhBdHRlbXB0czogMTAsXHJcbiAgICAgICAgICAgIG9ub3BlbjogZSA9PiBvbk9wZW4oZSksXHJcbiAgICAgICAgICAgIG9ubWVzc2FnZTogZSA9PiB0aGlzLm9uTWVzc2FnZShlKSxcclxuICAgICAgICAgICAgb25yZWNvbm5lY3Q6IGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbMF0uY29ubmVjdGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1sxXS5jb25uZWN0aW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdSZWNvbm5lY3RpbmcgaW4gcm91bmQuLi4nLCBlKTtcclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaS1zaWRlLm9ubGluZSNib3R0b20tcGxheWVyJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1vbmxpbmVcIjogZmFsc2UsIFwiaWNvbi1vZmZsaW5lXCI6IHRydWV9fSkpO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgb25tYXhpbXVtOiBlID0+IGNvbnNvbGUubG9nKCdTdG9wIEF0dGVtcHRpbmchJywgZSksXHJcbiAgICAgICAgICAgIG9uY2xvc2U6IGUgPT4gY29uc29sZS5sb2coJ0Nsb3NlZCEnLCBlKSxcclxuICAgICAgICAgICAgb25lcnJvcjogZSA9PiBjb25zb2xlLmxvZygnRXJyb3I6JywgZSksXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBTb2NrZXR0ZShcIndzOi8vXCIgKyBsb2NhdGlvbi5ob3N0ICsgXCIvd3NyXCIsIG9wdHMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlcnIpIHtcclxuICAgICAgICAgICAgdGhpcy5zb2NrID0gbmV3IFNvY2tldHRlKFwid3NzOi8vXCIgKyBsb2NhdGlvbi5ob3N0ICsgXCIvd3NyXCIsIG9wdHMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xyXG4gICAgICAgIHRoaXMuZXZ0SGFuZGxlciA9IGhhbmRsZXI7XHJcbiAgICAgICAgdGhpcy52YXJpYW50ID0gbW9kZWxbXCJ2YXJpYW50XCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLmZ1bGxmZW4gPSBtb2RlbFtcImZlblwiXSBhcyBzdHJpbmc7XHJcbiAgICAgICAgdGhpcy53cGxheWVyID0gbW9kZWxbXCJ3cGxheWVyXCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLmJwbGF5ZXIgPSBtb2RlbFtcImJwbGF5ZXJcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuYmFzZSA9IG1vZGVsW1wiYmFzZVwiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5pbmMgPSBtb2RlbFtcImluY1wiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5zdGF0dXMgPSBtb2RlbFtcInN0YXR1c1wiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy50diA9IG1vZGVsW1widHZcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuc3RlcHMgPSBbXTtcclxuICAgICAgICB0aGlzLnBseSA9IDA7XHJcblxyXG4gICAgICAgIHRoaXMuZmxpcCA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLkNTU2luZGV4ZXMgPSB2YXJpYW50cy5tYXAoKHZhcmlhbnQpID0+IGxvY2FsU3RvcmFnZVt2YXJpYW50ICsgXCJfcGllY2VzXCJdID09PSB1bmRlZmluZWQgPyAwIDogTnVtYmVyKGxvY2FsU3RvcmFnZVt2YXJpYW50ICsgXCJfcGllY2VzXCJdKSk7XHJcblxyXG4gICAgICAgIHRoaXMuc3BlY3RhdG9yID0gdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdICE9PSB0aGlzLndwbGF5ZXIgJiYgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdICE9PSB0aGlzLmJwbGF5ZXI7XHJcbiAgICAgICAgaWYgKHRoaXMudHYpIHtcclxuICAgICAgICAgICAgd2luZG93Lmhpc3RvcnkucHVzaFN0YXRlKHt9LCBkb2N1bWVudC50aXRsZSwgXCIvdHZcIik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgd2luZG93Lmhpc3RvcnkucHVzaFN0YXRlKHt9LCBkb2N1bWVudC50aXRsZSwgXCIvXCIgKyB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIG9yaWVudGF0aW9uID0gdGhpcy5teWNvbG9yXHJcbiAgICAgICAgaWYgKHRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMubXljb2xvciA9IHRoaXMudmFyaWFudCA9PT0gJ3Nob2dpJyA/ICdibGFjaycgOiAnd2hpdGUnO1xyXG4gICAgICAgICAgICB0aGlzLm9wcGNvbG9yID0gdGhpcy52YXJpYW50ID09PSAnc2hvZ2knID8gJ3doaXRlJyA6ICdibGFjayc7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5teWNvbG9yID0gdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdID09PSB0aGlzLndwbGF5ZXIgPyAnd2hpdGUnIDogJ2JsYWNrJztcclxuICAgICAgICAgICAgdGhpcy5vcHBjb2xvciA9IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSA9PT0gdGhpcy53cGxheWVyID8gJ2JsYWNrJyA6ICd3aGl0ZSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLm9wcElzUmFuZG9tTW92ZXIgPSAoXHJcbiAgICAgICAgICAgICh0aGlzLm15Y29sb3IgPT09IFwid2hpdGVcIiAmJiB0aGlzLmJwbGF5ZXIgPT09IFwiUmFuZG9tLU1vdmVyXCIpIHx8XHJcbiAgICAgICAgICAgICh0aGlzLm15Y29sb3IgPT09IFwiYmxhY2tcIiAmJiB0aGlzLndwbGF5ZXIgPT09IFwiUmFuZG9tLU1vdmVyXCIpKTtcclxuXHJcbiAgICAgICAgLy8gcGxheWVyc1swXSBpcyB0b3AgcGxheWVyLCBwbGF5ZXJzWzFdIGlzIGJvdHRvbSBwbGF5ZXJcclxuICAgICAgICB0aGlzLnBsYXllcnMgPSBbXHJcbiAgICAgICAgICAgIHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiID8gdGhpcy5icGxheWVyIDogdGhpcy53cGxheWVyLFxyXG4gICAgICAgICAgICB0aGlzLm15Y29sb3IgPT09IFwid2hpdGVcIiA/IHRoaXMud3BsYXllciA6IHRoaXMuYnBsYXllclxyXG4gICAgICAgIF07XHJcblxyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuXHJcbiAgICAgICAgdGhpcy5yZXN1bHQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnN0IHBhcnRzID0gdGhpcy5mdWxsZmVuLnNwbGl0KFwiIFwiKTtcclxuICAgICAgICB0aGlzLmFib3J0YWJsZSA9IE51bWJlcihwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSkgPD0gMTtcclxuXHJcbiAgICAgICAgY29uc3QgZmVuX3BsYWNlbWVudCA9IHBhcnRzWzBdO1xyXG4gICAgICAgIHRoaXMudHVybkNvbG9yID0gcGFydHNbMV0gPT09IFwid1wiID8gXCJ3aGl0ZVwiIDogXCJibGFja1wiO1xyXG5cclxuICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcInNob2dpXCIgfHwgdGhpcy52YXJpYW50ID09PSBcInhpYW5ncWlcIikge1xyXG4gICAgICAgICAgICB0aGlzLnNldFBpZWNlcyh0aGlzLm15Y29sb3IpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFRPRE86c2F2ZS9yZXN0b3JlIHByZWZlcmVuY2VzXHJcbiAgICAgICAgICAgIGNoYW5nZUNTUygnL3N0YXRpYy8nICsgVkFSSUFOVFNbdGhpcy52YXJpYW50XS5jc3NbMF0gKyAnLmNzcycpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuc3RlcHMucHVzaCh7XHJcbiAgICAgICAgICAgICdmZW4nOiBmZW5fcGxhY2VtZW50LFxyXG4gICAgICAgICAgICAnbW92ZSc6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgJ2NoZWNrJzogZmFsc2UsXHJcbiAgICAgICAgICAgICd0dXJuQ29sb3InOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuY2hlc3Nncm91bmQgPSBDaGVzc2dyb3VuZChlbCwge1xyXG4gICAgICAgICAgICBmZW46IGZlbl9wbGFjZW1lbnQsXHJcbiAgICAgICAgICAgIGdlb21ldHJ5OiBWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb20sXHJcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiB0aGlzLm15Y29sb3IsXHJcbiAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgIGFuaW1hdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICBpbnNlcnQoZWxlbWVudHMpIHtyZXNpemVIYW5kbGUoZWxlbWVudHMpO31cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAobG9jYWxTdG9yYWdlLnpvb20gIT09IHVuZGVmaW5lZCAmJiBsb2NhbFN0b3JhZ2Uuem9vbSAhPT0gMTAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0Wm9vbShOdW1iZXIobG9jYWxTdG9yYWdlLnpvb20pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICB2aWV3T25seTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGV2ZW50czoge1xyXG4gICAgICAgICAgICAgICAgICAgIG1vdmU6IHRoaXMub25Nb3ZlKCksXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgIG1vdmFibGU6IHtcclxuICAgICAgICAgICAgICAgICAgICBmcmVlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWZ0ZXI6IHRoaXMub25Vc2VyTW92ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWZ0ZXJOZXdQaWVjZTogdGhpcy5vblVzZXJEcm9wLFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBwcmVtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0OiB0aGlzLnNldFByZW1vdmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuc2V0OiB0aGlzLnVuc2V0UHJlbW92ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHByZWRyb3BwYWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldDogdGhpcy5zZXRQcmVkcm9wLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1bnNldDogdGhpcy51bnNldFByZWRyb3AsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICBtb3ZlOiB0aGlzLm9uTW92ZSgpLFxyXG4gICAgICAgICAgICAgICAgICAgIGRyb3BOZXdQaWVjZTogdGhpcy5vbkRyb3AoKSxcclxuICAgICAgICAgICAgICAgICAgICBjaGFuZ2U6IHRoaXMub25DaGFuZ2UodGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5zZWxlY3RlZCksXHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0OiB0aGlzLm9uU2VsZWN0KHRoaXMuY2hlc3Nncm91bmQuc3RhdGUuc2VsZWN0ZWQpLFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLmdhdGluZyA9IG1ha2VHYXRpbmcodGhpcyk7XHJcbiAgICAgICAgdGhpcy5wcm9tb3Rpb24gPSBtYWtlUHJvbW90aW9uKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBpbml0aWFsaXplIHBvY2tldHNcclxuICAgICAgICBpZiAobmVlZFBvY2tldHModGhpcy52YXJpYW50KSkge1xyXG4gICAgICAgICAgICBjb25zdCBwb2NrZXQwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BvY2tldDAnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgcG9ja2V0MSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwb2NrZXQxJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHVwZGF0ZVBvY2tldHModGhpcywgcG9ja2V0MCwgcG9ja2V0MSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBpbml0aWFsaXplIGNsb2Nrc1xyXG4gICAgICAgIGNvbnN0IGMwID0gbmV3IENsb2NrKHRoaXMuYmFzZSwgdGhpcy5pbmMsIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbG9jazAnKSBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgICAgY29uc3QgYzEgPSBuZXcgQ2xvY2sodGhpcy5iYXNlLCB0aGlzLmluYywgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Nsb2NrMScpIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICB0aGlzLmNsb2NrcyA9IFtjMCwgYzFdO1xyXG4gICAgICAgIHRoaXMuY2xvY2tzWzBdLm9uVGljayhyZW5kZXJUaW1lKTtcclxuICAgICAgICB0aGlzLmNsb2Nrc1sxXS5vblRpY2socmVuZGVyVGltZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZsYWdDYWxsYmFjayA9ICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMudHVybkNvbG9yID09PSB0aGlzLm15Y29sb3IgJiYgIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnN0b3AoKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRmxhZ1wiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJmbGFnXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNsb2Nrc1sxXS5vbkZsYWcoZmxhZ0NhbGxiYWNrKTtcclxuXHJcbiAgICAgICAgaWYgKE51bWJlcih0aGlzLnN0YXR1cykgPCAwKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiR0FNRSBpcyBPTkdPSU5HLi4uXCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiR0FNRSB3YXMgRU5ERUQuLi5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUT0RPOiBhZGQgZGFyay9saWdodCB0aGVtZSBidXR0b25zIChpY29uLXN1bi1vL2ljb24tbW9vbi1vKVxyXG5cclxuICAgICAgICBjb25zdCB0b2dnbGVQaWVjZXMgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIHZhciBpZHggPSB0aGlzLkNTU2luZGV4ZXNbdmFyaWFudHMuaW5kZXhPZih0aGlzLnZhcmlhbnQpXTtcclxuICAgICAgICAgICAgaWR4ICs9IDE7XHJcbiAgICAgICAgICAgIGlkeCA9IGlkeCAlIFZBUklBTlRTW3RoaXMudmFyaWFudF0uY3NzLmxlbmd0aDtcclxuICAgICAgICAgICAgdGhpcy5DU1NpbmRleGVzW3ZhcmlhbnRzLmluZGV4T2YodGhpcy52YXJpYW50KV0gPSBpZHhcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0odGhpcy52YXJpYW50ICsgXCJfcGllY2VzXCIsIFN0cmluZyhpZHgpKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRQaWVjZXModGhpcy5teWNvbG9yKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiB8fCB0aGlzLnZhcmlhbnQgPT09IFwieGlhbmdxaVwiKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLXBpZWNlcycpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2J1dHRvbicsIHsgb246IHsgY2xpY2s6ICgpID0+IHRvZ2dsZVBpZWNlcygpIH0sIHByb3BzOiB7dGl0bGU6ICdUb2dnbGUgcGllY2VzJ30gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWNvZ1wiOiB0cnVlfSB9ICksIF0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnem9vbScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaW5wdXQnLCB7IGNsYXNzOiB7XCJzbGlkZXJcIjogdHJ1ZSB9LFxyXG4gICAgICAgICAgICBhdHRyczogeyB3aWR0aDogJzI4MHB4JywgdHlwZTogJ3JhbmdlJywgdmFsdWU6IE51bWJlcihsb2NhbFN0b3JhZ2Uuem9vbSksIG1pbjogNjAsIG1heDogMTQwIH0sXHJcbiAgICAgICAgICAgIG9uOiB7IGlucHV0OiAoZSkgPT4geyB0aGlzLnNldFpvb20ocGFyc2VGbG9hdCgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpKTsgfSB9IH0pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy9jb25zdCBvblJlc2l6ZSA9ICgpID0+IHtjb25zb2xlLmxvZyhcIm9uUmVzaXplKClcIik7fVxyXG4gICAgICAgIC8vdmFyIGVsbW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Nnd3JhcCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIC8vZWxtbnQuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBvblJlc2l6ZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGFib3J0ID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBkaXNhYmxlIHdoZW4gcGx5ID4gMlxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFib3J0XCIpO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiYWJvcnRcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZHJhdyA9ICgpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJEcmF3XCIpO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZHJhd1wiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZXNpZ24gPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUmVzaWduXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwicmVzaWduXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9XHJcbi8qXHJcbiAgICAgICAgY29uc3QgZGlzY29ubmVjdCA9ICgpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJUZXN0aW5nIHNvY2tldCBkaXNjb25uZWN0Li4uXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZGlzY29ubmVjdFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG4qL1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZS1jb250cm9scycpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lQ29udHJvbHMgPSBwYXRjaChjb250YWluZXIsIGgoJ2Rpdi5idG4tY29udHJvbHMnLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24jYWJvcnQnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBhYm9ydCgpIH0sIHByb3BzOiB7dGl0bGU6ICdBYm9ydCd9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1hYm9ydFwiOiB0cnVlfSB9ICksIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uI2RyYXcnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBkcmF3KCkgfSwgcHJvcHM6IHt0aXRsZTogXCJEcmF3XCJ9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1oYW5kLXBhcGVyLW9cIjogdHJ1ZX0gfSApLCBdKSxcclxuICAgICAgICAgICAgICAgIGgoJ2J1dHRvbiNyZXNpZ24nLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiByZXNpZ24oKSB9LCBwcm9wczoge3RpdGxlOiBcIlJlc2lnblwifSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tZmxhZy1vXCI6IHRydWV9IH0gKSwgXSksXHJcbiAgICAgICAgICAgICAgICAvLyBoKCdidXR0b24jZGlzY29ubmVjdCcsIHsgb246IHsgY2xpY2s6ICgpID0+IGRpc2Nvbm5lY3QoKSB9LCBwcm9wczoge3RpdGxlOiAnZGlzY29ubmVjdCd9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1zaWduLW91dFwiOiB0cnVlfSB9ICksIF0pLFxyXG4gICAgICAgICAgICAgICAgXSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVDb250cm9scyA9IHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2JykpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcGF0Y2goZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vdmVsaXN0JykgYXMgSFRNTEVsZW1lbnQsIG1vdmVsaXN0Vmlldyh0aGlzKSk7XHJcblxyXG4gICAgICAgIHBhdGNoKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb3VuZGNoYXQnKSBhcyBIVE1MRWxlbWVudCwgY2hhdFZpZXcodGhpcywgXCJyb3VuZGNoYXRcIikpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEdyb3VuZCA9ICgpID0+IHRoaXMuY2hlc3Nncm91bmQ7XHJcbiAgICBnZXREZXN0cyA9ICgpID0+IHRoaXMuZGVzdHM7XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRab29tID0gKHpvb206IG51bWJlcikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNnLXdyYXAnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBpZiAoZWwpIHtcclxuICAgICAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLndpZHRoICogKHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gNTIgOiA2NCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJhc2VIZWlnaHQgPSBkaW1lbnNpb25zW1ZBUklBTlRTW3RoaXMudmFyaWFudF0uZ2VvbV0uaGVpZ2h0ICogKHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gNjAgOiA2NCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHB4dyA9IGAke3pvb20gLyAxMDAgKiBiYXNlV2lkdGh9cHhgO1xyXG4gICAgICAgICAgICBjb25zdCBweGggPSBgJHt6b29tIC8gMTAwICogYmFzZUhlaWdodH1weGA7XHJcbiAgICAgICAgICAgIGVsLnN0eWxlLndpZHRoID0gcHh3O1xyXG4gICAgICAgICAgICBlbC5zdHlsZS5oZWlnaHQgPSBweGg7XHJcblxyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnNldEF0dHJpYnV0ZSgnc3R5bGUnLCAnLS1jZ3dyYXB3aWR0aDonICsgcHh3KTtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5zZXRBdHRyaWJ1dGUoJ3N0eWxlJywgJy0tY2d3cmFwaGVpZ2h0OicgKyBweGgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZXYgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcclxuICAgICAgICAgICAgZXYuaW5pdEV2ZW50KCdjaGVzc2dyb3VuZC5yZXNpemUnLCBmYWxzZSwgZmFsc2UpO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmRpc3BhdGNoRXZlbnQoZXYpO1xyXG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInpvb21cIiwgU3RyaW5nKHpvb20pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ0dhbWVTdGFydCA9IChtc2cpID0+IHtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcImdvdCBnYW1lU3RhcnQgbXNnOlwiLCBtc2cpO1xyXG4gICAgICAgIGlmIChtc2cuZ2FtZUlkICE9PSB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKSByZXR1cm47XHJcbiAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvcikgc291bmQuZ2VuZXJpY05vdGlmeSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dBY2NlcHRTZWVrID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiR2FtZUNvbnRyb2xsZXIub25Nc2dBY2NlcHRTZWVrKClcIiwgdGhpcy5tb2RlbFtcImdhbWVJZFwiXSlcclxuICAgICAgICAvLyB0aGlzLmV2dEhhbmRsZXIoeyB0eXBlOiBBQ0NFUFQgfSk7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbih0aGlzLm1vZGVsW1wiaG9tZVwiXSArICcvJyArIG1zZ1tcImdhbWVJZFwiXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1hdGNoID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiUkVNQVRDSFwiKTtcclxuICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwicmVtYXRjaFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgLy8gd2luZG93LmxvY2F0aW9uLmFzc2lnbihob21lKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG5ld09wcG9uZW50ID0gKGhvbWUpID0+IHtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24uYXNzaWduKGhvbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5nYW1lQ29udHJvbHMgPSBwYXRjaCh0aGlzLmdhbWVDb250cm9scywgaCgnZGl2JykpO1xyXG5cclxuICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FmdGVyLWdhbWUnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdkaXYuYWZ0ZXItZ2FtZScsIFtoKCdyZXN1bHQnLCB0aGlzLnJlc3VsdCldKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdkaXYuYWZ0ZXItZ2FtZScsIFtcclxuICAgICAgICAgICAgICAgIGgoJ3Jlc3VsdCcsIHRoaXMucmVzdWx0KSxcclxuICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5yZW1hdGNoJywgeyBvbjogeyBjbGljazogKCkgPT4gdGhpcy5yZW1hdGNoKCkgfSB9LCBcIlJFTUFUQ0hcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24ubmV3b3BwJywgeyBvbjogeyBjbGljazogKCkgPT4gdGhpcy5uZXdPcHBvbmVudCh0aGlzLm1vZGVsW1wiaG9tZVwiXSkgfSB9LCBcIk5FVyBPUFBPTkVOVFwiKSxcclxuICAgICAgICAgICAgXSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrU3RhdHVzID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGlmIChtc2cuZ2FtZUlkICE9PSB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKSByZXR1cm47XHJcbiAgICAgICAgaWYgKG1zZy5zdGF0dXMgPj0gMCAmJiB0aGlzLnJlc3VsdCA9PT0gXCJcIikge1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1swXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzWzFdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgdGhpcy5yZXN1bHQgPSBtc2cucmVzdWx0O1xyXG4gICAgICAgICAgICBzd2l0Y2ggKG1zZy5yZXN1bHQpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCIxLzItMS8yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgc291bmQuZHJhdygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIjEtMFwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZC52aWN0b3J5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZC5kZWZlYXQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCIwLTFcIjpcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm15Y29sb3IgPT09IFwiYmxhY2tcIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291bmQudmljdG9yeSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291bmQuZGVmZWF0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAvLyBBQk9SVEVEXHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndW5kZXItYm9hcmQnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCd1bmRlci1ib2FyZCcsIFtoKCd0ZXh0YXJlYScsIHsgYXR0cnM6IHsgcm93czogMTN9IH0sIG1zZy5wZ24pXSkpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMudHYpIHtcclxuICAgICAgICAgICAgICAgIHNldEludGVydmFsKCgpID0+IHt0aGlzLmRvU2VuZCh7IHR5cGU6IFwidXBkYXRlVFZcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO30sIDIwMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVcGRhdGVUViA9IChtc2cpID0+IHtcclxuICAgICAgICBpZiAobXNnLmdhbWVJZCAhPT0gdGhpcy5tb2RlbFtcImdhbWVJZFwiXSkge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uYXNzaWduKHRoaXMubW9kZWxbXCJob21lXCJdICsgJy90dicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldFBpZWNlcyA9IChjb2xvcikgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwic2V0UGllY2VzKClcIiwgdGhpcy52YXJpYW50LCBjb2xvcilcclxuICAgICAgICBjb25zdCBpZHggPSB0aGlzLkNTU2luZGV4ZXNbdmFyaWFudHMuaW5kZXhPZih0aGlzLnZhcmlhbnQpXTtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMudmFyaWFudCkge1xyXG4gICAgICAgIGNhc2UgXCJ4aWFuZ3FpXCI6XHJcbiAgICAgICAgICAgIGNoYW5nZUNTUygnL3N0YXRpYy8nICsgVkFSSUFOVFNbdGhpcy52YXJpYW50XS5jc3NbaWR4XSArICcuY3NzJyk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgICAgICB2YXIgY3NzID0gVkFSSUFOVFNbdGhpcy52YXJpYW50XS5jc3NbaWR4XTtcclxuICAgICAgICAgICAgLy8gY2hhbmdlIHNob2dpIHBpZWNlIGNvbG9ycyBhY2NvcmRpbmcgdG8gYm9hcmQgb3JpZW50YXRpb25cclxuICAgICAgICAgICAgaWYgKGNvbG9yID09PSBcImJsYWNrXCIpIGNzcyA9IGNzcy5yZXBsYWNlKCcwJywgJzEnKTtcclxuICAgICAgICAgICAgY2hhbmdlQ1NTKCcvc3RhdGljLycgKyBjc3MgKyAnLmNzcycpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSW4gQ2FwYWJsYW5jYSB3ZSBoYXZlIHRvIGZpbmVsaXplIGNhc3RsaW5nIGJlY2F1c2VcclxuICAgIC8vIGNoZXNzZ3JvdW5kIGF1dG9DYXN0bGUgd29ya3MgZm9yIHN0YW5kYXJkIGNoZXNzIG9ubHlcclxuICAgIHByaXZhdGUgY2FzdGxlUm9vayA9IChraW5nRGVzdCwgY29sb3IpID0+IHtcclxuICAgICAgICBjb25zdCBkaWZmOiBQaWVjZXNEaWZmID0ge307XHJcbiAgICAgICAgaWYgKGtpbmdEZXN0ID09PSBcImNcIikge1xyXG4gICAgICAgICAgICBkaWZmW2NvbG9yID09PSAnd2hpdGUnID8gXCJhMVwiIDogXCJhOFwiXSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgZGlmZltjb2xvciA9PT0gJ3doaXRlJyA/IFwiZDFcIiA6IFwiZDhcIl0gPSB7Y29sb3I6IGNvbG9yLCByb2xlOiBcInJvb2tcIn07XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0UGllY2VzKGRpZmYpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgaWYgKGtpbmdEZXN0ID09PSBcImlcIikge1xyXG4gICAgICAgICAgICBkaWZmW2NvbG9yID09PSAnd2hpdGUnID8gXCJqMVwiIDogXCJqOFwiXSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgZGlmZltjb2xvciA9PT0gJ3doaXRlJyA/IFwiaDFcIiA6IFwiaDhcIl0gPSB7Y29sb3I6IGNvbG9yLCByb2xlOiBcInJvb2tcIn07XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0UGllY2VzKGRpZmYpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ0JvYXJkID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGlmIChtc2cuZ2FtZUlkICE9PSB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKSByZXR1cm47XHJcbiAgICAgICAgLy8gR2FtZSBhYm9ydGVkLlxyXG4gICAgICAgIGlmIChtc2dbXCJzdGF0dXNcIl0gPT09IDApIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJnb3QgYm9hcmQgbXNnOlwiLCBtc2cpO1xyXG4gICAgICAgIHRoaXMucGx5ID0gbXNnLnBseVxyXG4gICAgICAgIHRoaXMuZnVsbGZlbiA9IG1zZy5mZW47XHJcbiAgICAgICAgdGhpcy5kZXN0cyA9IG1zZy5kZXN0cztcclxuICAgICAgICBjb25zdCBjbG9ja3MgPSBtc2cuY2xvY2tzO1xyXG5cclxuICAgICAgICBjb25zdCBwYXJ0cyA9IG1zZy5mZW4uc3BsaXQoXCIgXCIpO1xyXG4gICAgICAgIHRoaXMudHVybkNvbG9yID0gcGFydHNbMV0gPT09IFwid1wiID8gXCJ3aGl0ZVwiIDogXCJibGFja1wiO1xyXG5cclxuICAgICAgICBpZiAobXNnLnN0ZXBzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGVwcyA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vdmVsaXN0JykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2I21vdmVsaXN0JykpO1xyXG5cclxuICAgICAgICAgICAgbXNnLnN0ZXBzLmZvckVhY2goKHN0ZXApID0+IHsgXHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0ZXBzLnB1c2goc3RlcCk7XHJcbiAgICAgICAgICAgICAgICB1cGRhdGVNb3ZlbGlzdCh0aGlzKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmIChtc2cucGx5ID09PSB0aGlzLnN0ZXBzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RlcCA9IHtcclxuICAgICAgICAgICAgICAgICAgICAnZmVuJzogbXNnLmZlbixcclxuICAgICAgICAgICAgICAgICAgICAnbW92ZSc6IG1zZy5sYXN0TW92ZVswXSArIG1zZy5sYXN0TW92ZVsxXSxcclxuICAgICAgICAgICAgICAgICAgICAnY2hlY2snOiBtc2cuY2hlY2ssXHJcbiAgICAgICAgICAgICAgICAgICAgJ3R1cm5Db2xvcic6IHRoaXMudHVybkNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgICdzYW4nOiBtc2cuc3RlcHNbMF0uc2FuLFxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0ZXBzLnB1c2goc3RlcCk7XHJcbiAgICAgICAgICAgICAgICB1cGRhdGVNb3ZlbGlzdCh0aGlzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5hYm9ydGFibGUgPSBOdW1iZXIocGFydHNbcGFydHMubGVuZ3RoIC0gMV0pIDw9IDE7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvciAmJiAhdGhpcy5hYm9ydGFibGUgJiYgdGhpcy5yZXN1bHQgPT09IFwiXCIpIHtcclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhYm9ydCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2J1dHRvbiNhYm9ydCcsIHsgcHJvcHM6IHtkaXNhYmxlZDogdHJ1ZX0gfSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGxhc3RNb3ZlID0gbXNnLmxhc3RNb3ZlO1xyXG4gICAgICAgIGlmIChsYXN0TW92ZSAhPT0gbnVsbCAmJiB0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikge1xyXG4gICAgICAgICAgICBsYXN0TW92ZSA9IHVzaTJ1Y2kobGFzdE1vdmVbMF0gKyBsYXN0TW92ZVsxXSk7XHJcbiAgICAgICAgICAgIGxhc3RNb3ZlID0gW2xhc3RNb3ZlLnNsaWNlKDAsMiksIGxhc3RNb3ZlLnNsaWNlKDIsNCldO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBkcm9wIGxhc3RNb3ZlIGNhdXNpbmcgc2Nyb2xsYmFyIGZsaWNrZXIsXHJcbiAgICAgICAgLy8gc28gd2UgcmVtb3ZlIGZyb20gcGFydCB0byBhdm9pZCB0aGF0XHJcbiAgICAgICAgaWYgKGxhc3RNb3ZlICE9PSBudWxsICYmIGxhc3RNb3ZlWzBdWzFdID09PSAnQCcpIGxhc3RNb3ZlID0gW2xhc3RNb3ZlWzFdXTtcclxuICAgICAgICAvLyBzYXZlIGNhcHR1cmUgc3RhdGUgYmVmb3JlIHVwZGF0aW5nIGNoZXNzZ3JvdW5kXHJcbiAgICAgICAgY29uc3QgY2FwdHVyZSA9IGxhc3RNb3ZlICE9PSBudWxsICYmIHRoaXMuY2hlc3Nncm91bmQuc3RhdGUucGllY2VzW2xhc3RNb3ZlWzFdXVxyXG5cclxuICAgICAgICBpZiAobGFzdE1vdmUgIT09IG51bGwgJiYgKHRoaXMudHVybkNvbG9yID09PSB0aGlzLm15Y29sb3IgfHwgdGhpcy5zcGVjdGF0b3IpKSB7XHJcbiAgICAgICAgICAgIGlmIChjYXB0dXJlKSB7XHJcbiAgICAgICAgICAgICAgICBzb3VuZC5jYXB0dXJlKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzb3VuZC5tb3ZlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBsYXN0TW92ZSA9IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNoZWNrU3RhdHVzKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy5jaGVjaykge1xyXG4gICAgICAgICAgICBzb3VuZC5jaGVjaygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb3BwY2xvY2sgPSAhdGhpcy5mbGlwID8gMCA6IDE7XHJcbiAgICAgICAgY29uc3QgbXljbG9jayA9IDEgLSBvcHBjbG9jaztcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgIGZlbjogcGFydHNbMF0sXHJcbiAgICAgICAgICAgICAgICB0dXJuQ29sb3I6IHRoaXMudHVybkNvbG9yLFxyXG4gICAgICAgICAgICAgICAgY2hlY2s6IG1zZy5jaGVjayxcclxuICAgICAgICAgICAgICAgIGxhc3RNb3ZlOiBsYXN0TW92ZSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHVwZGF0ZVBvY2tldHModGhpcywgdGhpcy52cG9ja2V0MCwgdGhpcy52cG9ja2V0MSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzWzBdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMV0ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1tvcHBjbG9ja10uc2V0VGltZShjbG9ja3NbdGhpcy5vcHBjb2xvcl0pO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5zZXRUaW1lKGNsb2Nrc1t0aGlzLm15Y29sb3JdKTtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmFib3J0YWJsZSAmJiBtc2cuc3RhdHVzIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudHVybkNvbG9yID09PSB0aGlzLm15Y29sb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5zdGFydCgpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tvcHBjbG9ja10uc3RhcnQoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnR1cm5Db2xvciA9PT0gdGhpcy5teWNvbG9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICAgICAgZmVuOiBwYXJ0c1swXSxcclxuICAgICAgICAgICAgICAgICAgICB0dXJuQ29sb3I6IHRoaXMudHVybkNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgIG1vdmFibGU6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZnJlZTogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiB0aGlzLm15Y29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc3RzOiBtc2cuZGVzdHMsXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICBjaGVjazogbXNnLmNoZWNrLFxyXG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb3ZlOiBsYXN0TW92ZSxcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgdXBkYXRlUG9ja2V0cyh0aGlzLCB0aGlzLnZwb2NrZXQwLCB0aGlzLnZwb2NrZXQxKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tvcHBjbG9ja10uc2V0VGltZShjbG9ja3NbdGhpcy5vcHBjb2xvcl0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFib3J0YWJsZSAmJiBtc2cuc3RhdHVzIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnN0YXJ0KGNsb2Nrc1t0aGlzLm15Y29sb3JdKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTVkgQ0xPQ0sgU1RBUlRFRCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJ0cnlpbmcgdG8gcGxheSBwcmVtb3ZlLi4uLlwiKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnByZW1vdmUpIHRoaXMucGVyZm9ybVByZW1vdmUoKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnByZWRyb3ApIHRoaXMucGVyZm9ybVByZWRyb3AoKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgICAgICB0dXJuQ29sb3I6IHRoaXMudHVybkNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgIHByZW1vdmFibGU6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzdHM6IG1zZy5kZXN0cyxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrOiBtc2cuY2hlY2ssXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnNldFRpbWUoY2xvY2tzW3RoaXMubXljb2xvcl0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFib3J0YWJsZSAmJiBtc2cuc3RhdHVzIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zdGFydChjbG9ja3NbdGhpcy5vcHBjb2xvcl0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdPUFAgQ0xPQ0sgIFNUQVJURUQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9wcElzUmFuZG9tTW92ZXIgJiYgbXNnLnJtICAhPT0gXCJcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJtb3ZlXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSwgbW92ZTogbXNnLnJtLCBjbG9ja3M6IGNsb2NrcyB9KTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBnb1BseSA9IChwbHkpID0+IHtcclxuICAgICAgICBjb25zdCBzdGVwID0gdGhpcy5zdGVwc1twbHldO1xyXG4gICAgICAgIC8vIFRPRE86IHVwZGF0ZSBwb2NrZXRzICEhIVxyXG4gICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgZmVuOiBzdGVwLmZlbixcclxuICAgICAgICAgICAgdHVybkNvbG9yOiBzdGVwLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgZnJlZTogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGhpcy5zcGVjdGF0b3IgPyB1bmRlZmluZWQgOiBzdGVwLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgICAgIGRlc3RzOiB0aGlzLnJlc3VsdCA9PT0gXCJcIiAmJiBwbHkgPT09IHRoaXMuc3RlcHMubGVuZ3RoIC0gMSA/IHRoaXMuZGVzdHMgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBjaGVjazogc3RlcC5jaGVjayxcclxuICAgICAgICAgICAgbGFzdE1vdmU6IHN0ZXAubW92ZSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogW3N0ZXAubW92ZS5zbGljZSgwLCAyKSwgc3RlcC5tb3ZlLnNsaWNlKDIsIDQpXSxcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmZ1bGxmZW4gPSBzdGVwLmZlbjtcclxuICAgICAgICB1cGRhdGVQb2NrZXRzKHRoaXMsIHRoaXMudnBvY2tldDAsIHRoaXMudnBvY2tldDEpO1xyXG4gICAgICAgIC8vIFRPRE86IHBsYXkgc291bmQgaWYgcGx5ID09IHRoaXMucGx5ICsgMVxyXG4gICAgICAgIHRoaXMucGx5ID0gcGx5XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkb1NlbmQgPSAobWVzc2FnZSkgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiLS0tPiBkb1NlbmQoKTpcIiwgbWVzc2FnZSk7XHJcbiAgICAgICAgdGhpcy5zb2NrLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2VuZE1vdmUgPSAob3JpZywgZGVzdCwgcHJvbW8pID0+IHtcclxuICAgICAgICAvLyBwYXVzZSgpIHdpbGwgYWRkIGluY3JlbWVudCFcclxuICAgICAgICBjb25zdCBvcHBjbG9jayA9ICF0aGlzLmZsaXAgPyAwIDogMVxyXG4gICAgICAgIGNvbnN0IG15Y2xvY2sgPSAxIC0gb3BwY2xvY2s7XHJcbiAgICAgICAgY29uc3QgbW92ZXRpbWUgPSAodGhpcy5jbG9ja3NbbXljbG9ja10ucnVubmluZykgPyBEYXRlLm5vdygpIC0gdGhpcy5jbG9ja3NbbXljbG9ja10uc3RhcnRUaW1lIDogMDtcclxuICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5wYXVzZSh0cnVlKTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcInNlbmRNb3ZlKG9yaWcsIGRlc3QsIHByb20pXCIsIG9yaWcsIGRlc3QsIHByb21vKTtcclxuICAgICAgICBjb25zdCB1Y2lfbW92ZSA9IG9yaWcgKyBkZXN0ICsgcHJvbW87XHJcbiAgICAgICAgY29uc3QgbW92ZSA9IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gdWNpMnVzaSh1Y2lfbW92ZSkgOiB1Y2lfbW92ZTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcInNlbmRNb3ZlKG1vdmUpXCIsIG1vdmUpO1xyXG4gICAgICAgIC8vIFRPRE86IGlmIHByZW1vdmVkLCBzZW5kIDAgdGltZVxyXG4gICAgICAgIGxldCBiY2xvY2ssIGNsb2NrcztcclxuICAgICAgICBpZiAoIXRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICBiY2xvY2sgPSB0aGlzLm15Y29sb3IgPT09IFwiYmxhY2tcIiA/IDEgOiAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJjbG9jayA9IHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiID8gMCA6IDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHdjbG9jayA9IDEgLSBiY2xvY2tcclxuICAgICAgICBjbG9ja3MgPSB7bW92ZXRpbWU6IG1vdmV0aW1lLCBibGFjazogdGhpcy5jbG9ja3NbYmNsb2NrXS5kdXJhdGlvbiwgd2hpdGU6IHRoaXMuY2xvY2tzW3djbG9ja10uZHVyYXRpb259O1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJtb3ZlXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSwgbW92ZTogbW92ZSwgY2xvY2tzOiBjbG9ja3MgfSk7XHJcbiAgICAgICAgaWYgKCF0aGlzLmFib3J0YWJsZSkgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnN0YXJ0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdmUgPSAoKSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIChvcmlnLCBkZXN0LCBjYXB0dXJlZFBpZWNlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uTW92ZSgpXCIsIG9yaWcsIGRlc3QsIGNhcHR1cmVkUGllY2UpO1xyXG4gICAgICAgICAgICBpZiAoY2FwdHVyZWRQaWVjZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQuY2FwdHVyZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Ecm9wID0gKCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAocGllY2UsIGRlc3QpID0+IHtcclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJncm91bmQub25Ecm9wKClcIiwgcGllY2UsIGRlc3QpO1xyXG4gICAgICAgICAgICBpZiAoZGVzdCAhPSBcImEwXCIgJiYgcGllY2Uucm9sZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0UHJlbW92ZSA9IChvcmlnLCBkZXN0LCBtZXRhKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0geyBvcmlnLCBkZXN0LCBtZXRhIH07XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXRQcmVtb3ZlKCkgdG86XCIsIG9yaWcsIGRlc3QsIG1ldGEpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdW5zZXRQcmVtb3ZlID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRQcmVkcm9wID0gKHJvbGUsIGtleSkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlZHJvcCA9IHsgcm9sZSwga2V5IH07XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXRQcmVkcm9wKCkgdG86XCIsIHJvbGUsIGtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1bnNldFByZWRyb3AgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBlcmZvcm1QcmVtb3ZlID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHsgb3JpZywgZGVzdCwgbWV0YSB9ID0gdGhpcy5wcmVtb3ZlO1xyXG4gICAgICAgIC8vIFRPRE86IHByb21vdGlvbj9cclxuICAgICAgICBjb25zb2xlLmxvZyhcInBlcmZvcm1QcmVtb3ZlKClcIiwgb3JpZywgZGVzdCwgbWV0YSk7XHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5wbGF5UHJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwZXJmb3JtUHJlZHJvcCA9ICgpID0+IHtcclxuICAgICAgICBjb25zdCB7IHJvbGUsIGtleSB9ID0gdGhpcy5wcmVkcm9wO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwicGVyZm9ybVByZWRyb3AoKVwiLCByb2xlLCBrZXkpO1xyXG4gICAgICAgIHRoaXMuY2hlc3Nncm91bmQucGxheVByZWRyb3AoZHJvcCA9PiB7IHJldHVybiBkcm9wSXNWYWxpZCh0aGlzLmRlc3RzLCBkcm9wLnJvbGUsIGRyb3Aua2V5KTsgfSk7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVXNlck1vdmUgPSAob3JpZywgZGVzdCwgbWV0YSkgPT4ge1xyXG4gICAgICAgIC8vIGNoZXNzZ3JvdW5kIGRvZXNuJ3Qga25vd3MgYWJvdXQgZXAsIHNvIHdlIGhhdmUgdG8gcmVtb3ZlIGVwIGNhcHR1cmVkIHBhd25cclxuICAgICAgICBjb25zdCBwaWVjZXMgPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnBpZWNlcztcclxuICAgICAgICBjb25zdCBnZW9tID0gdGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5nZW9tZXRyeTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImdyb3VuZC5vblVzZXJNb3ZlKClcIiwgb3JpZywgZGVzdCwgbWV0YSwgcGllY2VzKTtcclxuICAgICAgICBjb25zdCBtb3ZlZCA9IHBpZWNlc1tkZXN0XSBhcyBQaWVjZTtcclxuICAgICAgICBjb25zdCBmaXJzdFJhbmtJczAgPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcclxuICAgICAgICBpZiAobWV0YS5jYXB0dXJlZCA9PT0gdW5kZWZpbmVkICYmIG1vdmVkLnJvbGUgPT09IFwicGF3blwiICYmIG9yaWdbMF0gIT0gZGVzdFswXSAmJiBoYXNFcCh0aGlzLnZhcmlhbnQpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcyA9IGtleTJwb3MoZGVzdCwgZmlyc3RSYW5rSXMwKSxcclxuICAgICAgICAgICAgcGF3blBvczogUG9zID0gW3Bvc1swXSwgcG9zWzFdICsgKHRoaXMubXljb2xvciA9PT0gJ3doaXRlJyA/IC0xIDogMSldO1xyXG4gICAgICAgICAgICBjb25zdCBkaWZmOiBQaWVjZXNEaWZmID0ge307XHJcbiAgICAgICAgICAgIGRpZmZbcG9zMmtleShwYXduUG9zLCBnZW9tKV0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0UGllY2VzKGRpZmYpO1xyXG4gICAgICAgICAgICBtZXRhLmNhcHR1cmVkID0ge3JvbGU6IFwicGF3blwifTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vIGluY3JlYXNlIHBvY2tldCBjb3VudFxyXG4gICAgICAgIGlmICgodGhpcy52YXJpYW50ID09PSBcImNyYXp5aG91c2VcIiB8fCB0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikgJiYgbWV0YS5jYXB0dXJlZCkge1xyXG4gICAgICAgICAgICB2YXIgcm9sZSA9IG1ldGEuY2FwdHVyZWQucm9sZVxyXG4gICAgICAgICAgICBpZiAobWV0YS5jYXB0dXJlZC5wcm9tb3RlZCkgcm9sZSA9IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gbWV0YS5jYXB0dXJlZC5yb2xlLnNsaWNlKDEpIGFzIFJvbGUgOiBcInBhd25cIjtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmZsaXApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1swXVtyb2xlXSsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MCA9IHBhdGNoKHRoaXMudnBvY2tldDAsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcInRvcFwiKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBvY2tldHNbMV1bcm9sZV0rKztcclxuICAgICAgICAgICAgICAgIHRoaXMudnBvY2tldDEgPSBwYXRjaCh0aGlzLnZwb2NrZXQxLCBwb2NrZXRWaWV3KHRoaXMsIHRoaXMubXljb2xvciwgXCJib3R0b21cIikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICAvLyBjaGVzc2dyb3VuZCBhdXRvQ2FzdGxlIHdvcmtzIGZvciBzdGFuZGFyZCBjaGVzcyBvbmx5XHJcbiAgICAgICAgaWYgKHRoaXMudmFyaWFudCA9PT0gXCJjYXBhYmxhbmNhXCIgJiYgbW92ZWQucm9sZSA9PT0gXCJraW5nXCIgJiYgb3JpZ1swXSA9PT0gXCJmXCIpIHRoaXMuY2FzdGxlUm9vayhkZXN0WzBdLCB0aGlzLm15Y29sb3IpO1xyXG5cclxuICAgICAgICAvLyAgZ2F0aW5nIGVsZXBoYW50L2hhd2tcclxuICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcInNlaXJhd2FuXCIpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnByb21vdGlvbi5zdGFydChvcmlnLCBkZXN0LCBtZXRhKSAmJiAhdGhpcy5nYXRpbmcuc3RhcnQodGhpcy5mdWxsZmVuLCBvcmlnLCBkZXN0LCBtZXRhKSkgdGhpcy5zZW5kTW92ZShvcmlnLCBkZXN0LCAnJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnByb21vdGlvbi5zdGFydChvcmlnLCBkZXN0LCBtZXRhKSkgdGhpcy5zZW5kTW92ZShvcmlnLCBkZXN0LCAnJyk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVXNlckRyb3AgPSAocm9sZSwgZGVzdCkgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ3JvdW5kLm9uVXNlckRyb3AoKVwiLCByb2xlLCBkZXN0KTtcclxuICAgICAgICAvLyBkZWNyZWFzZSBwb2NrZXQgY291bnRcclxuICAgICAgICBpZiAoZHJvcElzVmFsaWQodGhpcy5kZXN0cywgcm9sZSwgZGVzdCkpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wb2NrZXRzWzBdW3JvbGVdLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQwID0gcGF0Y2godGhpcy52cG9ja2V0MCwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLm15Y29sb3IsIFwidG9wXCIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1sxXVtyb2xlXS0tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MSA9IHBhdGNoKHRoaXMudnBvY2tldDEsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcImJvdHRvbVwiKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5zZW5kTW92ZShyb2xlVG9TYW5bcm9sZV0gKyBcIkBcIiwgZGVzdCwgJycpXHJcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwic2VudCBtb3ZlXCIsIG1vdmUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpZmY6IFBpZWNlc0RpZmYgPSB7fTtcclxuICAgICAgICAgICAgZGlmZltkZXN0XSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXRQaWVjZXMoZGlmZik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiISEhIGludmFsaWQgbW92ZSAhISFcIiwgcm9sZSwgZGVzdCk7XHJcbiAgICAgICAgICAgIC8vIHJlc3RvcmUgbGFzdE1vdmUgc2V0IGJ5IGludmFsaWQgZHJvcFxyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICBsYXN0TW92ZTogdGhpcy5sYXN0bW92ZSxcclxuICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGRlc3RzOiB0aGlzLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIC8vIE9yIGltcGxlbWVudCBvbmRibGNsaWNrIGhhbmRsZXIgdG8gZW1pdCBtb3ZlIGluIGNoZXNzZ3JvdW5kP1xyXG4gICAgLy8gaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9qc3JlZi9ldmVudF9vbmRibGNsaWNrLmFzcFxyXG4gICAgcHJpdmF0ZSBvbkNoYW5nZSA9IChzZWxlY3RlZCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uQ2hhbmdlKClcIiwgc2VsZWN0ZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIHByaXZhdGUgb25TZWxlY3QgPSAoc2VsZWN0ZWQpID0+IHtcclxuICAgICAgICByZXR1cm4gKGtleSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIiAgIGdyb3VuZC5vblNlbGVjdCgpXCIsIGtleSwgc2VsZWN0ZWQpO1xyXG4gICAgICAgICAgICAvLyBJZiBkcm9wIHNlbGVjdGlvbiB3YXMgc2V0IGRyb3BEZXN0cyB3ZSBoYXZlIHRvIHJlc3RvcmUgZGVzdHMgaGVyZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5tb3ZhYmxlLmRlc3RzISA9PT0gdW5kZWZpbmVkKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChrZXkgIT0gXCJhMFwiICYmIFwiYTBcIiBpbiB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLm1vdmFibGUuZGVzdHMhKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7IG1vdmFibGU6IHsgZGVzdHM6IHRoaXMuZGVzdHMgfX0pO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImlzX3VzZXJfb25saW5lXCIsIHVzZXJuYW1lOiB0aGlzLndwbGF5ZXIgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJpc191c2VyX29ubGluZVwiLCB1c2VybmFtZTogdGhpcy5icGxheWVyIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gd2Ugd2FudCB0byBrbm93IGxhc3RNb3ZlIGFuZCBjaGVjayBzdGF0dXNcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImJvYXJkXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zdCBvcHBfbmFtZSA9IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSA9PT0gdGhpcy53cGxheWVyID8gdGhpcy5icGxheWVyIDogdGhpcy53cGxheWVyO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiaXNfdXNlcl9vbmxpbmVcIiwgdXNlcm5hbWU6IG9wcF9uYW1lIH0pO1xyXG5cclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdib3R0b20tcGxheWVyJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaS1zaWRlLm9ubGluZSNib3R0b20tcGxheWVyJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1vbmxpbmVcIjogdHJ1ZSwgXCJpY29uLW9mZmxpbmVcIjogZmFsc2V9fSkpO1xyXG5cclxuICAgICAgICAgICAgLy8gcHJldmVudCBzZW5kaW5nIGdhbWVTdGFydCBtZXNzYWdlIHdoZW4gdXNlciBqdXN0IHJlY29uZWN0aW5nXHJcbiAgICAgICAgICAgIGlmIChtc2cucGx5ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwicmVhZHlcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJib2FyZFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyT25saW5lID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy51c2VybmFtZSA9PT0gdGhpcy5wbGF5ZXJzWzBdKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9wLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IHRydWUsIFwiaWNvbi1vZmZsaW5lXCI6IGZhbHNlfX0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiB0cnVlLCBcImljb24tb2ZmbGluZVwiOiBmYWxzZX19KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyRGlzY29ubmVjdGVkID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy51c2VybmFtZSA9PT0gdGhpcy5wbGF5ZXJzWzBdKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9wLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IGZhbHNlLCBcImljb24tb2ZmbGluZVwiOiB0cnVlfX0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiBmYWxzZSwgXCJpY29uLW9mZmxpbmVcIjogdHJ1ZX19KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dDaGF0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKG1zZy51c2VyLCBtc2cubWVzc2FnZSwgXCJyb3VuZGNoYXRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ09mZmVyID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKFwiXCIsIG1zZy5tZXNzYWdlLCBcInJvdW5kY2hhdFwiKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBvbk1lc3NhZ2UgPSAoZXZ0KSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCI8KysrIG9uTWVzc2FnZSgpOlwiLCBldnQuZGF0YSk7XHJcbiAgICAgICAgdmFyIG1zZyA9IEpTT04ucGFyc2UoZXZ0LmRhdGEpO1xyXG4gICAgICAgIHN3aXRjaCAobXNnLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImJvYXJkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQm9hcmQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZ2FtZUVuZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja1N0YXR1cyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnYW1lU3RhcnRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dHYW1lU3RhcnQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZ2FtZV91c2VyX2Nvbm5lY3RlZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1VzZXJDb25uZWN0ZWQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwidXNlcl9vbmxpbmVcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dVc2VyT25saW5lKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInVzZXJfZGlzY29ubmVjdGVkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXNlckRpc2Nvbm5lY3RlZChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyb3VuZGNoYXRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dDaGF0KG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImFjY2VwdF9zZWVrXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQWNjZXB0U2Vlayhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJvZmZlclwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ09mZmVyKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInVwZGF0ZVRWXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXBkYXRlVFYobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcbiIsImltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xyXG5pbXBvcnQgdG9WTm9kZSBmcm9tICdzbmFiYmRvbS90b3Zub2RlJztcclxuXHJcbmltcG9ydCB7IGtleTJwb3MgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcblxyXG5pbXBvcnQgeyBjYW5HYXRlLCByb2xlVG9TYW4gfSBmcm9tICcuL2NoZXNzJztcclxuaW1wb3J0IHsgcG9ja2V0VmlldyB9IGZyb20gJy4vcG9ja2V0JztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oY3RybCkge1xyXG5cclxuICAgIGxldCBnYXRpbmc6IGFueSA9IGZhbHNlO1xyXG4gICAgdmFyIHJvbGVzID0gW1wiaGF3a1wiLCBcImVsZXBoYW50XCIsIFwiXCJdO1xyXG5cclxuICAgIGZ1bmN0aW9uIHN0YXJ0KGZlbiwgb3JpZywgZGVzdCwgbWV0YSkge1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZCA9IGN0cmwuZ2V0R3JvdW5kKCk7XHJcbiAgICAgICAgY29uc3QgZ2F0YWJsZSA9IGNhbkdhdGUoZmVuLCBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLCBvcmlnLCBkZXN0LCBtZXRhKVxyXG4gICAgICAgIGlmIChnYXRhYmxlWzBdIHx8IGdhdGFibGVbMV0pIHtcclxuICAgICAgICAgICAgY29uc3QgY29sb3IgPSBjdHJsLm15Y29sb3I7XHJcbiAgICAgICAgICAgIGNvbnN0IG9yaWVudGF0aW9uID0gZ3JvdW5kLnN0YXRlLm9yaWVudGF0aW9uO1xyXG4gICAgICAgICAgICBpZiAocm9sZXMuaW5kZXhPZihcImhhd2tcIikgIT09IC0xICYmICFnYXRhYmxlWzBdKSByb2xlcy5zcGxpY2Uocm9sZXMuaW5kZXhPZihcImhhd2tcIiksIDEpO1xyXG4gICAgICAgICAgICBpZiAocm9sZXMuaW5kZXhPZihcImVsZXBoYW50XCIpICE9PSAtMSAmJiAhZ2F0YWJsZVsxXSkgcm9sZXMuc3BsaWNlKHJvbGVzLmluZGV4T2YoXCJlbGVwaGFudFwiKSwgMSk7XHJcbiAgICAgICAgICAgIHZhciBvcmlncyA9IFtvcmlnXTtcclxuICAgICAgICAgICAgY29uc3QgY2FzdGxpbmcgPSBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLnJvbGUgPT09IFwia2luZ1wiICYmIG9yaWdbMF0gPT09IFwiZVwiICYmIGRlc3RbMF0gIT09IFwiZFwiICYmIGRlc3RbMF0gIT09IFwiZVwiICYmIGRlc3RbMF0gIT09IFwiZlwiO1xyXG4gICAgICAgICAgICB2YXIgcm9va0Rlc3QgPSBcIlwiO1xyXG4gICAgICAgICAgICBpZiAoY2FzdGxpbmcpIHtcclxuICAgICAgICAgICAgICAgIC8vIE8tT1xyXG4gICAgICAgICAgICAgICAgaWYgKGRlc3RbMF0gPiBcImVcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIG9yaWdzLnB1c2goXCJoXCIgKyBvcmlnWzFdKTtcclxuICAgICAgICAgICAgICAgICAgICByb29rRGVzdCA9ICBcImVcIiArIG9yaWdbMV07XHJcbiAgICAgICAgICAgICAgICAvLyBPLU8tT1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBvcmlncy5wdXNoKFwiYVwiICsgb3JpZ1sxXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcm9va0Rlc3QgPSAgXCJlXCIgKyBvcmlnWzFdO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgZHJhd19nYXRpbmcob3JpZ3MsIGNvbG9yLCBvcmllbnRhdGlvbik7XHJcbiAgICAgICAgICAgIGdhdGluZyA9IHtcclxuICAgICAgICAgICAgICAgIG9yaWdzOiBvcmlncyxcclxuICAgICAgICAgICAgICAgIGRlc3Q6IGRlc3QsXHJcbiAgICAgICAgICAgICAgICByb29rRGVzdDogcm9va0Rlc3QsXHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjazogY3RybC5zZW5kTW92ZSxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZ2F0ZShjdHJsLCBvcmlnLCBkZXN0LCByb2xlKSB7XHJcbiAgICAgICAgY29uc3QgZyA9IGN0cmwuZ2V0R3JvdW5kKCk7XHJcbiAgICAgICAgY29uc3QgY29sb3IgPSBnLnN0YXRlLnBpZWNlc1tkZXN0XS5jb2xvcjtcclxuICAgICAgICBnLm5ld1BpZWNlKHtcInJvbGVcIjogcm9sZSwgXCJjb2xvclwiOiBjb2xvcn0sIG9yaWcpXHJcbiAgICAgICAgY3RybC5wb2NrZXRzW2NvbG9yID09PSAnd2hpdGUnID8gMCA6IDFdW3JvbGVdLS07XHJcbiAgICAgICAgY3RybC52cG9ja2V0MSA9IHBhdGNoKGN0cmwudnBvY2tldDEsIHBvY2tldFZpZXcoY3RybCwgY29sb3IsIFwiYm90dG9tXCIpKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X2dhdGluZyhvcmlncywgY29sb3IsIG9yaWVudGF0aW9uKSB7XHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IHRvVk5vZGUoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignZXh0ZW5zaW9uJykgYXMgTm9kZSk7XHJcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCByZW5kZXJHYXRpbmcob3JpZ3MsIGNvbG9yLCBvcmllbnRhdGlvbikpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRyYXdfbm9fZ2F0aW5nKCkge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uX2Nob2ljZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZXh0ZW5zaW9uJykpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmlzaChyb2xlLCBpbmRleCkge1xyXG4gICAgICAgIGlmIChnYXRpbmcpIHtcclxuICAgICAgICAgICAgZHJhd19ub19nYXRpbmcoKTtcclxuICAgICAgICAgICAgaWYgKHJvbGUpIGdhdGUoY3RybCwgZ2F0aW5nLm9yaWdzW2luZGV4XSwgZ2F0aW5nLmRlc3QsIHJvbGUpO1xyXG4gICAgICAgICAgICBlbHNlIGluZGV4ID0gMDtcclxuICAgICAgICAgICAgY29uc3QgZ2F0ZWQgPSByb2xlID8gcm9sZVRvU2FuW3JvbGVdLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xyXG4gICAgICAgICAgICBpZiAoZ2F0aW5nLmNhbGxiYWNrKSBnYXRpbmcuY2FsbGJhY2soZ2F0aW5nLm9yaWdzW2luZGV4XSwgaW5kZXggPT09IDAgPyBnYXRpbmcuZGVzdCA6IGdhdGluZy5yb29rRGVzdCwgZ2F0ZWQpO1xyXG4gICAgICAgICAgICBnYXRpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNhbmNlbCgpIHtcclxuICAgICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBiaW5kKGV2ZW50TmFtZTogc3RyaW5nLCBmOiAoZTogRXZlbnQpID0+IHZvaWQsIHJlZHJhdykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGluc2VydCh2bm9kZSkge1xyXG4gICAgICAgICAgICAgICAgdm5vZGUuZWxtLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBmKGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWRyYXcpIHJlZHJhdygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXM7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVuZGVyU3F1YXJlcyhvcmlnLCBjb2xvciwgb3JpZW50YXRpb24sIGluZGV4KSB7XHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZmFsc2U7XHJcbiAgICAgICAgdmFyIGxlZnQgPSAoOCAtIGtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKVswXSkgKiAxMi41O1xyXG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gXCJ3aGl0ZVwiKSBsZWZ0ID0gODcuNSAtIGxlZnQ7XHJcbiAgICAgICAgcmV0dXJuIHJvbGVzLm1hcCgoc2VydmVyUm9sZSwgaSkgPT4ge1xyXG4gICAgICAgICAgICB2YXIgdG9wID0gKGNvbG9yID09PSBvcmllbnRhdGlvbiA/IDcgLSBpIDogaSkgKiAxMi41O1xyXG4gICAgICAgICAgICByZXR1cm4gaChcclxuICAgICAgICAgICAgICAgIFwic3F1YXJlXCIsXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXR0cnM6IHsgc3R5bGU6IFwidG9wOiBcIiArIHRvcCArIFwiJTtsZWZ0OiBcIiArIGxlZnQgKyBcIiVcIiB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGhvb2s6IGJpbmQoXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluaXNoKHNlcnZlclJvbGUsIGluZGV4KTtcclxuICAgICAgICAgICAgICAgICAgICB9LCBmYWxzZSlcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBbaChcInBpZWNlLlwiICsgc2VydmVyUm9sZSArIFwiLlwiICsgY29sb3IpXVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVuZGVyR2F0aW5nKG9yaWdzLCBjb2xvciwgb3JpZW50YXRpb24pIHtcclxuICAgICAgICB2YXIgdmVydGljYWwgPSBjb2xvciA9PT0gb3JpZW50YXRpb24gPyBcInRvcFwiIDogXCJib3R0b21cIjtcclxuICAgICAgICB2YXIgc3F1YXJlcyA9IHJlbmRlclNxdWFyZXMob3JpZ3NbMF0sIGNvbG9yLCBvcmllbnRhdGlvbiwgMCk7XHJcbiAgICAgICAgaWYgKG9yaWdzLmxlbmd0aCA+IDEpIHNxdWFyZXMgPSBzcXVhcmVzLmNvbmNhdChyZW5kZXJTcXVhcmVzKG9yaWdzWzFdLCBjb2xvciwgb3JpZW50YXRpb24sIDEpKTtcclxuICAgICAgICByZXR1cm4gaChcclxuICAgICAgICAgICAgXCJkaXYjZXh0ZW5zaW9uX2Nob2ljZS5cIiArIHZlcnRpY2FsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBob29rOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0OiB2bm9kZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gdm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gY2FuY2VsKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgc3F1YXJlc1xyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBzdGFydCxcclxuICAgIH07XHJcbn1cclxuIiwiaW1wb3J0IFNvY2tldHRlIGZyb20gJ3NvY2tldHRlJztcclxuXHJcbmltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcbmltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gJ3NuYWJiZG9tL3Zub2RlJztcclxuXHJcbmltcG9ydCB7IHJlbmRlclVzZXJuYW1lIH0gZnJvbSAnLi91c2VyJztcclxuaW1wb3J0IHsgY2hhdE1lc3NhZ2UsIGNoYXRWaWV3IH0gZnJvbSAnLi9jaGF0JztcclxuaW1wb3J0IHsgdmFyaWFudHMsIFZBUklBTlRTIH0gZnJvbSAnLi9jaGVzcyc7XHJcbmltcG9ydCBBQ0NFUFQgZnJvbSAnLi9zaXRlJztcclxuXHJcbmV4cG9ydCBjb25zdCBBREQgPSBTeW1ib2woJ0FkZCcpO1xyXG5leHBvcnQgY29uc3QgREVMRVRFID0gU3ltYm9sKCdEZWxldGUnKTtcclxuZXhwb3J0IGNvbnN0IFVQREFURSA9IFN5bWJvbCgnVXBkYXRlJyk7XHJcbmV4cG9ydCBjb25zdCBSRVNFVCA9IFN5bWJvbCgnUmVzZXQnKTtcclxuXHJcblxyXG5jbGFzcyBMb2JieUNvbnRyb2xsZXIge1xyXG4gICAgbW9kZWw7XHJcbiAgICBzb2NrO1xyXG4gICAgZXZ0SGFuZGxlcjtcclxuICAgIHBsYXllcjtcclxuICAgIGxvZ2dlZF9pbjtcclxuICAgIGNoYWxsZW5nZUFJO1xyXG4gICAgX3dzO1xyXG4gICAgc2Vla3M7XHJcblxyXG4gICAgY29uc3RydWN0b3IoZWwsIG1vZGVsLCBoYW5kbGVyKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJMb2JieUNvbnRyb2xsZXIgY29uc3RydWN0b3JcIiwgZWwsIG1vZGVsKTtcclxuXHJcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xyXG4gICAgICAgIHRoaXMuZXZ0SGFuZGxlciA9IGhhbmRsZXI7XHJcbiAgICAgICAgdGhpcy5jaGFsbGVuZ2VBSSA9IGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBvbk9wZW4gPSAoZXZ0KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX3dzID0gZXZ0LnRhcmdldDtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCItLS1DT05ORUNURURcIiwgZXZ0KTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImxvYmJ5X3VzZXJfY29ubmVjdGVkXCIsIHVzZXJuYW1lOiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl19KTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImdldF9zZWVrc1wiIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fd3MgPSB7XCJyZWFkeVN0YXRlXCI6IC0xfTtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtYXhBdHRlbXB0czogMjAsXHJcbiAgICAgICAgICAgIG9ub3BlbjogZSA9PiBvbk9wZW4oZSksXHJcbiAgICAgICAgICAgIG9ubWVzc2FnZTogZSA9PiB0aGlzLm9uTWVzc2FnZShlKSxcclxuICAgICAgICAgICAgb25yZWNvbm5lY3Q6IGUgPT4gY29uc29sZS5sb2coJ1JlY29ubmVjdGluZyBpbiBsb2JieS4uLicsIGUpLFxyXG4gICAgICAgICAgICBvbm1heGltdW06IGUgPT4gY29uc29sZS5sb2coJ1N0b3AgQXR0ZW1wdGluZyEnLCBlKSxcclxuICAgICAgICAgICAgb25jbG9zZTogZSA9PiB7Y29uc29sZS5sb2coJ0Nsb3NlZCEnLCBlKTt9LFxyXG4gICAgICAgICAgICBvbmVycm9yOiBlID0+IGNvbnNvbGUubG9nKCdFcnJvcjonLCBlKSxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB0aGlzLnNvY2sgPSBuZXcgU29ja2V0dGUoXCJ3czovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzbFwiLCBvcHRzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2goZXJyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBTb2NrZXR0ZShcIndzczovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzbFwiLCBvcHRzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIGdldCBzZWVrcyB3aGVuIHdlIGFyZSBjb21pbmcgYmFjayBhZnRlciBhIGdhbWVcclxuICAgICAgICBpZiAodGhpcy5fd3MucmVhZHlTdGF0ZSA9PT0gMSkge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZ2V0X3NlZWtzXCIgfSk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBwYXRjaChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2Vla2J1dHRvbnMnKSBhcyBIVE1MRWxlbWVudCwgaCgndWwjc2Vla2J1dHRvbnMnLCB0aGlzLnJlbmRlclNlZWtCdXR0b25zKCkpKTtcclxuICAgICAgICBwYXRjaChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9iYnljaGF0JykgYXMgSFRNTEVsZW1lbnQsIGNoYXRWaWV3KHRoaXMsIFwibG9iYnljaGF0XCIpKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgZG9TZW5kIChtZXNzYWdlKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCItLS0+IGxvYmJ5IGRvU2VuZCgpOlwiLCBtZXNzYWdlKTtcclxuICAgICAgICB0aGlzLnNvY2suc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgY3JlYXRlU2Vla01zZyAodmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50KSB7XHJcbiAgICAgICAgdGhpcy5kb1NlbmQoe1xyXG4gICAgICAgICAgICB0eXBlOiBcImNyZWF0ZV9zZWVrXCIsXHJcbiAgICAgICAgICAgIHVzZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSxcclxuICAgICAgICAgICAgdmFyaWFudDogdmFyaWFudCxcclxuICAgICAgICAgICAgZmVuOiBmZW4sXHJcbiAgICAgICAgICAgIG1pbnV0ZXM6IG1pbnV0ZXMsXHJcbiAgICAgICAgICAgIGluY3JlbWVudDogaW5jcmVtZW50LFxyXG4gICAgICAgICAgICByYXRlZDogZmFsc2UsXHJcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvciB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjcmVhdGVCb3RDaGFsbGVuZ2VNc2cgKHZhcmlhbnQsIGNvbG9yLCBmZW4sIG1pbnV0ZXMsIGluY3JlbWVudCwgbGV2ZWwpIHtcclxuICAgICAgICB0aGlzLmRvU2VuZCh7XHJcbiAgICAgICAgICAgIHR5cGU6IFwiY3JlYXRlX2FpX2NoYWxsZW5nZVwiLFxyXG4gICAgICAgICAgICB1c2VyOiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0sXHJcbiAgICAgICAgICAgIHZhcmlhbnQ6IHZhcmlhbnQsXHJcbiAgICAgICAgICAgIGZlbjogZmVuLFxyXG4gICAgICAgICAgICBtaW51dGVzOiBtaW51dGVzLFxyXG4gICAgICAgICAgICBpbmNyZW1lbnQ6IGluY3JlbWVudCxcclxuICAgICAgICAgICAgcmF0ZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgICBsZXZlbDogbGV2ZWwsXHJcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvciB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpc05ld1NlZWsgKHZhcmlhbnQsIGNvbG9yLCBmZW4sIG1pbnV0ZXMsIGluY3JlbWVudCkge1xyXG4gICAgICAgIHJldHVybiAhdGhpcy5zZWVrcy5zb21lKHNlZWsgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gc2Vlay52YXJpYW50ID09PSB2YXJpYW50ICYmIHNlZWsuZmVuID09PSBmZW4gJiYgc2Vlay5jb2xvciA9PT0gY29sb3IgJiYgc2Vlay50YyA9PT0gbWludXRlcyArIFwiK1wiICsgaW5jcmVtZW50O1xyXG4gICAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgY3JlYXRlU2VlayAoY29sb3IpIHtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWQwMScpIS5zdHlsZS5kaXNwbGF5PSdub25lJztcclxuICAgICAgICBsZXQgZTtcclxuICAgICAgICBlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ZhcmlhbnQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcclxuICAgICAgICBjb25zdCB2YXJpYW50ID0gZS5vcHRpb25zW2Uuc2VsZWN0ZWRJbmRleF0udmFsdWU7XHJcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJzZWVrX3ZhcmlhbnRcIiwgdmFyaWFudCk7XHJcblxyXG4gICAgICAgIGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmVuJykgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBjb25zdCBmZW4gPSBlLnZhbHVlO1xyXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwic2Vla19mZW5cIiwgZS52YWx1ZSk7XHJcblxyXG4gICAgICAgIGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWluJykgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBjb25zdCBtaW51dGVzID0gcGFyc2VJbnQoZS52YWx1ZSk7XHJcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJzZWVrX21pblwiLCBlLnZhbHVlKTtcclxuXHJcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbmMnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGNvbnN0IGluY3JlbWVudCA9IHBhcnNlSW50KGUudmFsdWUpO1xyXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwic2Vla19pbmNcIiwgZS52YWx1ZSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmNoYWxsZW5nZUFJKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWlsZXZlbCcpIGFzIEhUTUxGb3JtRWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgbGV2ZWwgPSBwYXJzZUludChmb3JtLmVsZW1lbnRzWydsZXZlbCddLnZhbHVlKTtcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJzZWVrX2xldmVsXCIsIGZvcm0uZWxlbWVudHNbJ2xldmVsJ10udmFsdWUpO1xyXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUJvdENoYWxsZW5nZU1zZyh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQsIGxldmVsKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmlzTmV3U2Vlayh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNyZWF0ZVNlZWtNc2codmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJTZWVrQnV0dG9ucyAoKSB7XHJcbiAgICAgICAgLy8gVE9ETzogc2F2ZS9yZXN0b3JlIHNlbGVjdGVkIHZhbHVlc1xyXG4gICAgICAgIGNvbnN0IHNldE1pbnV0ZXMgPSAobWludXRlcykgPT4ge1xyXG4gICAgICAgICAgICB2YXIgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pbnV0ZXNcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gbWludXRlcztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHNldEluY3JlbWVudCA9IChpbmNyZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgdmFyIGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbmNyZW1lbnRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gaW5jcmVtZW50O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgdklkeCA9IGxvY2FsU3RvcmFnZS5zZWVrX3ZhcmlhbnQgPT09IHVuZGVmaW5lZCA/IDAgOiB2YXJpYW50cy5pbmRleE9mKGxvY2FsU3RvcmFnZS5zZWVrX3ZhcmlhbnQpO1xyXG4gICAgICAgIGNvbnN0IHZGZW4gPSBsb2NhbFN0b3JhZ2Uuc2Vla19mZW4gPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBsb2NhbFN0b3JhZ2Uuc2Vla19mZW47XHJcbiAgICAgICAgY29uc3Qgdk1pbiA9IGxvY2FsU3RvcmFnZS5zZWVrX21pbiA9PT0gdW5kZWZpbmVkID8gXCI1XCIgOiBsb2NhbFN0b3JhZ2Uuc2Vla19taW47XHJcbiAgICAgICAgY29uc3QgdkluYyA9IGxvY2FsU3RvcmFnZS5zZWVrX2luYyA9PT0gdW5kZWZpbmVkID8gXCIzXCIgOiBsb2NhbFN0b3JhZ2Uuc2Vla19pbmM7XHJcbiAgICAgICAgY29uc3QgdkxldmVsID0gbG9jYWxTdG9yYWdlLnNlZWtfbGV2ZWwgPT09IHVuZGVmaW5lZCA/IFwiMVwiIDogbG9jYWxTdG9yYWdlLnNlZWtfbGV2ZWw7XHJcblxyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgaCgnZGl2I2lkMDEnLCB7IGNsYXNzOiB7XCJtb2RhbFwiOiB0cnVlfSB9LCBbXHJcbiAgICAgICAgICBoKCdmb3JtLm1vZGFsLWNvbnRlbnQnLCBbXHJcbiAgICAgICAgICAgIGgoJ2RpdiNjbG9zZWNvbnRhaW5lcicsIFtcclxuICAgICAgICAgICAgICBoKCdzcGFuLmNsb3NlJywgeyBvbjogeyBjbGljazogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nbm9uZScgfSwgYXR0cnM6IHsnZGF0YS1pY29uJzogJ2onfSwgcHJvcHM6IHt0aXRsZTogXCJDYW5jZWxcIn0gfSksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBoKCdkaXYuY29udGFpbmVyJywgW1xyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcInZhcmlhbnRcIn0gfSwgXCJWYXJpYW50XCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnc2VsZWN0I3ZhcmlhbnQnLCB7IHByb3BzOiB7bmFtZTogXCJ2YXJpYW50XCJ9IH0sIHZhcmlhbnRzLm1hcCgodmFyaWFudCwgaWR4KSA9PiBoKCdvcHRpb24nLCB7IHByb3BzOiB7dmFsdWU6IHZhcmlhbnQsIHNlbGVjdGVkOiAoaWR4ID09PSB2SWR4KSA/IFwic2VsZWN0ZWRcIiA6IFwiXCJ9IH0sIHZhcmlhbnQpKSksXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgYXR0cnM6IHtmb3I6IFwiZmVuXCJ9IH0sIFwiU3RhcnQgcG9zaXRpb25cIiksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNmZW4nLCB7IHByb3BzOiB7bmFtZTogJ2ZlbicsIHBsYWNlaG9sZGVyOiAnUGFzdGUgdGhlIEZFTiB0ZXh0IGhlcmUnLCB2YWx1ZTogdkZlbn0gfSksXHJcbiAgICAgICAgICAgICAgICAvL2goJ2xhYmVsJywgeyBhdHRyczoge2ZvcjogXCJ0Y1wifSB9LCBcIlRpbWUgQ29udHJvbFwiKSxcclxuICAgICAgICAgICAgICAgIC8vaCgnc2VsZWN0I3RpbWVjb250cm9sJywgeyBwcm9wczoge25hbWU6IFwidGltZWNvbnRyb2xcIn0gfSwgW1xyXG4gICAgICAgICAgICAgICAgLy8gICAgaCgnb3B0aW9uJywgeyBwcm9wczoge3ZhbHVlOiBcIjFcIiwgc2VsZWN0ZWQ6IHRydWV9IH0sIFwiUmVhbCB0aW1lXCIpLFxyXG4gICAgICAgICAgICAgICAgLy8gICAgaCgnb3B0aW9uJywgeyBwcm9wczoge3ZhbHVlOiBcIjJcIn0gfSwgXCJVbmxpbWl0ZWRcIiksXHJcbiAgICAgICAgICAgICAgICAvL10pLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcIm1pblwifSB9LCBcIk1pbnV0ZXMgcGVyIHNpZGU6XCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnc3BhbiNtaW51dGVzJyksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNtaW4nLCB7IGNsYXNzOiB7IFwic2xpZGVyXCI6IHRydWUgfSxcclxuICAgICAgICAgICAgICAgICAgICBwcm9wczoge25hbWU6IFwibWluXCIsIHR5cGU6IFwicmFuZ2VcIiwgbWluOiAwLCBtYXg6IDYwLCB2YWx1ZTogdk1pbn0sXHJcbiAgICAgICAgICAgICAgICAgICAgb246IHsgaW5wdXQ6IChlKSA9PiBzZXRNaW51dGVzKChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkgfSxcclxuICAgICAgICAgICAgICAgICAgICBob29rOiB7aW5zZXJ0OiAodm5vZGUpID0+IHNldE1pbnV0ZXMoKHZub2RlLmVsbSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkgfSxcclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcImluY1wifSB9LCBcIkluY3JlbWVudCBpbiBzZWNvbmRzOlwiKSxcclxuICAgICAgICAgICAgICAgIGgoJ3NwYW4jaW5jcmVtZW50JyksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNpbmMnLCB7IGNsYXNzOiB7XCJzbGlkZXJcIjogdHJ1ZSB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BzOiB7bmFtZTogXCJpbmNcIiwgdHlwZTogXCJyYW5nZVwiLCBtaW46IDAsIG1heDogMTUsIHZhbHVlOiB2SW5jfSxcclxuICAgICAgICAgICAgICAgICAgICBvbjogeyBpbnB1dDogKGUpID0+IHNldEluY3JlbWVudCgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgaG9vazoge2luc2VydDogKHZub2RlKSA9PiBzZXRJbmNyZW1lbnQoKHZub2RlLmVsbSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSkgfSxcclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgLy8gaWYgcGxheSB3aXRoIHRoZSBtYWNoaW5lXHJcbiAgICAgICAgICAgICAgICAvLyBBLkkuTGV2ZWwgKDEtOCBidXR0b25zKVxyXG4gICAgICAgICAgICAgICAgaCgnZm9ybSNhaWxldmVsJywgW1xyXG4gICAgICAgICAgICAgICAgaCgnaDQnLCBcIkEuSS4gTGV2ZWxcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYucmFkaW8tZ3JvdXAnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWkxJywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiMVwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiMVwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTEnLCB7IGF0dHJzOiB7Zm9yOiBcImFpMVwifSB9LCBcIjFcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWkyJywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiMlwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiMlwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTInLCB7IGF0dHJzOiB7Zm9yOiBcImFpMlwifSB9LCBcIjJcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWkzJywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiM1wiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiM1wiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTMnLCB7IGF0dHJzOiB7Zm9yOiBcImFpM1wifSB9LCBcIjNcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk0JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiNFwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiNFwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTQnLCB7IGF0dHJzOiB7Zm9yOiBcImFpNFwifSB9LCBcIjRcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk1JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiNVwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiNVwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTUnLCB7IGF0dHJzOiB7Zm9yOiBcImFpNVwifSB9LCBcIjVcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk2JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiNlwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiNlwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTYnLCB7IGF0dHJzOiB7Zm9yOiBcImFpNlwifSB9LCBcIjZcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk3JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiN1wiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiN1wiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTcnLCB7IGF0dHJzOiB7Zm9yOiBcImFpN1wifSB9LCBcIjdcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnaW5wdXQjYWk4JywgeyBwcm9wczogeyB0eXBlOiBcInJhZGlvXCIsIG5hbWU6IFwibGV2ZWxcIiwgdmFsdWU6IFwiOFwiLCBjaGVja2VkOiB2TGV2ZWwgPT09IFwiOFwiID8gXCJjaGVja2VkXCIgOiBcIlwifSB9KSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdsYWJlbC5sZXZlbC1haS5haTgnLCB7IGF0dHJzOiB7Zm9yOiBcImFpOFwifSB9LCBcIjhcIiksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2LmJ1dHRvbi1ncm91cCcsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKCdidXR0b24uaWNvbi5pY29uLWJsYWNrJywgeyBwcm9wczoge3R5cGU6IFwiYnV0dG9uXCIsIHRpdGxlOiBcIkJsYWNrXCJ9LCBvbjoge2NsaWNrOiAoKSA9PiB0aGlzLmNyZWF0ZVNlZWsoJ2InKSB9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5pY29uLmljb24tYWRqdXN0JywgeyBwcm9wczoge3R5cGU6IFwiYnV0dG9uXCIsIHRpdGxlOiBcIlJhbmRvbVwifSwgb246IHtjbGljazogKCkgPT4gdGhpcy5jcmVhdGVTZWVrKCdyJyl9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5pY29uLmljb24td2hpdGUnLCB7IHByb3BzOiB7dHlwZTogXCJidXR0b25cIiwgdGl0bGU6IFwiV2hpdGVcIn0sIG9uOiB7Y2xpY2s6ICgpID0+IHRoaXMuY3JlYXRlU2VlaygndycpfSB9KSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgIF0pLFxyXG4gICAgICAgIF0pLFxyXG4gICAgICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IHsnbG9iYnktYnV0dG9uJzogdHJ1ZX0sIG9uOiB7XHJcbiAgICAgICAgICAgIGNsaWNrOiAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoYWxsZW5nZUFJID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWlsZXZlbCcpIS5zdHlsZS5kaXNwbGF5PSdub25lJztcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhLnN0eWxlLmRpc3BsYXk9J2Jsb2NrJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSB9LCBcIkNyZWF0ZSBhIGdhbWVcIiksXHJcbiAgICAgICAgaCgnYnV0dG9uJywgeyBjbGFzczogeydsb2JieS1idXR0b24nOiB0cnVlfSwgb246IHtcclxuICAgICAgICAgICAgY2xpY2s6ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbGxlbmdlQUkgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FpbGV2ZWwnKSEuc3R5bGUuZGlzcGxheT0naW5saW5lLWJsb2NrJztcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhLnN0eWxlLmRpc3BsYXk9J2Jsb2NrJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSB9LCBcIlBsYXkgd2l0aCB0aGUgbWFjaGluZVwiKSxcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIG9uQ2xpY2tTZWVrKHNlZWspIHtcclxuICAgICAgICBpZiAoc2Vla1tcInVzZXJcIl0gPT09IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSkge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZGVsZXRlX3NlZWtcIiwgc2Vla0lEOiBzZWVrW1wic2Vla0lEXCJdLCBwbGF5ZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiYWNjZXB0X3NlZWtcIiwgc2Vla0lEOiBzZWVrW1wic2Vla0lEXCJdLCBwbGF5ZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyU2Vla3Moc2Vla3MpIHtcclxuICAgICAgICAvLyBUT0RPOiBmaXggaGVhZGVyIGFuZCBkYXRhIHJvdyBjb2xvbW5zXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMzcyNzIzMzEvaHRtbC10YWJsZS13aXRoLWZpeGVkLWhlYWRlci1hbmQtZm9vdGVyLWFuZC1zY3JvbGxhYmxlLWJvZHktd2l0aG91dC1maXhlZC13aWR0aHNcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBoKCd0aGVhZCcsIFtoKCd0cicsXHJcbiAgICAgICAgICAgIFtoKCd0aCcsICdQbGF5ZXInKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ0NvbG9yJyksXHJcbiAgICAgICAgICAgICBoKCd0aCcsICdSYXRpbmcnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ1RpbWUnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJyAgICAnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ1ZhcmlhbnQnKSxcclxuICAgICAgICAgICAgIGgoJ3RoJywgJ01vZGUnKV0pXSk7XHJcbiAgICAgICAgY29uc3QgY29sb3JJY29uID0gKGNvbG9yKSA9PiB7IHJldHVybiBoKCdpJywge2F0dHJzOiB7XCJkYXRhLWljb25cIjogY29sb3IgPT09IFwid1wiID8gXCJjXCIgOiBjb2xvciA9PT0gXCJiXCIgPyBcImJcIiA6IFwiYVwifX0gKTsgfTtcclxuICAgICAgICB2YXIgcm93cyA9IHNlZWtzLm1hcCgoc2VlaykgPT4gaChcclxuICAgICAgICAgICAgJ3RyJyxcclxuICAgICAgICAgICAgeyBvbjogeyBjbGljazogKCkgPT4gdGhpcy5vbkNsaWNrU2VlayhzZWVrKSB9IH0sXHJcbiAgICAgICAgICAgIFtoKCd0ZCcsIHNlZWtbXCJ1c2VyXCJdKSxcclxuICAgICAgICAgICAgIGgoJ3RkJywgW2NvbG9ySWNvbihzZWVrW1wiY29sb3JcIl0pXSksXHJcbiAgICAgICAgICAgICBoKCd0ZCcsICcxNTAwPycpLFxyXG4gICAgICAgICAgICAgaCgndGQnLCBzZWVrW1widGNcIl0pLFxyXG4gICAgICAgICAgICAgaCgndGQnLCB7YXR0cnM6IHtcImRhdGEtaWNvblwiOiBWQVJJQU5UU1tzZWVrW1widmFyaWFudFwiXV0uaWNvbn0sIGNsYXNzOiB7XCJpY29uXCI6IHRydWV9fSApLFxyXG4gICAgICAgICAgICAgaCgndGQnLCBzZWVrW1widmFyaWFudFwiXSksXHJcbiAgICAgICAgICAgICBoKCd0ZCcsIHNlZWtbXCJyYXRlZFwiXSkgXSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gW2hlYWRlciwgaCgndGJvZHknLCByb3dzKV07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ0dldFNlZWtzID0gKG1zZykgPT4ge1xyXG4gICAgICAgIHRoaXMuc2Vla3MgPSBtc2cuc2Vla3M7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCIhISEhIGdvdCBnZXRfc2Vla3MgbXNnOlwiLCBtc2cpO1xyXG4gICAgICAgIGNvbnN0IG9sZFZOb2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlZWtzJyk7XHJcbiAgICAgICAgaWYgKG9sZFZOb2RlIGluc3RhbmNlb2YgRWxlbWVudCkge1xyXG4gICAgICAgICAgICBvbGRWTm9kZS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ3RhYmxlI3NlZWtzJywgdGhpcy5yZW5kZXJTZWVrcyhtc2cuc2Vla3MpKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dBY2NlcHRTZWVrID0gKG1zZykgPT4ge1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gPSBtc2dbXCJnYW1lSWRcIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcInZhcmlhbnRcIl0gPSBtc2dbXCJ2YXJpYW50XCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJ3cGxheWVyXCJdID0gbXNnW1wid3BsYXllclwiXTtcclxuICAgICAgICB0aGlzLm1vZGVsW1wiYnBsYXllclwiXSA9IG1zZ1tcImJwbGF5ZXJcIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcImZlblwiXSA9IG1zZ1tcImZlblwiXTtcclxuICAgICAgICB0aGlzLm1vZGVsW1wiYmFzZVwiXSA9IG1zZ1tcImJhc2VcIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcImluY1wiXSA9IG1zZ1tcImluY1wiXTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcIkxvYmJ5Q29udHJvbGxlci5vbk1zZ0FjY2VwdFNlZWsoKVwiLCB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKVxyXG4gICAgICAgIHRoaXMuZXZ0SGFuZGxlcih7IHR5cGU6IEFDQ0VQVCB9KTtcclxufVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyQ29ubmVjdGVkID0gKG1zZykgPT4ge1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSA9IG1zZ1tcInVzZXJuYW1lXCJdO1xyXG4gICAgICAgIHJlbmRlclVzZXJuYW1lKHRoaXMubW9kZWxbXCJob21lXCJdLCB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dDaGF0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKG1zZy51c2VyLCBtc2cubWVzc2FnZSwgXCJsb2JieWNoYXRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ1BpbmcgPSAobXNnKSA9PiB7XHJcbiAgICAgICAgdGhpcy5kb1NlbmQoe3R5cGU6IFwicG9uZ1wiLCB0aW1lc3RhbXA6IG1zZy50aW1lc3RhbXB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnU2h1dGRvd24gPSAobXNnKSA9PiB7XHJcbiAgICAgICAgYWxlcnQobXNnLm1lc3NhZ2UpO1xyXG4gICAgfVxyXG5cclxuICAgIG9uTWVzc2FnZSAoZXZ0KSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCI8KysrIGxvYmJ5IG9uTWVzc2FnZSgpOlwiLCBldnQuZGF0YSk7XHJcbiAgICAgICAgdmFyIG1zZyA9IEpTT04ucGFyc2UoZXZ0LmRhdGEpO1xyXG4gICAgICAgIHN3aXRjaCAobXNnLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImdldF9zZWVrc1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ0dldFNlZWtzKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImFjY2VwdF9zZWVrXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQWNjZXB0U2Vlayhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJsb2JieV91c2VyX2Nvbm5lY3RlZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1VzZXJDb25uZWN0ZWQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwibG9iYnljaGF0XCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQ2hhdChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJwaW5nXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnUGluZyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzaHV0ZG93blwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1NodXRkb3duKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJ1blNlZWtzKHZub2RlOiBWTm9kZSwgbW9kZWwsIGhhbmRsZXIpIHtcclxuICAgIGNvbnN0IGVsID0gdm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgY29uc3QgY3RybCA9IG5ldyBMb2JieUNvbnRyb2xsZXIoZWwsIG1vZGVsLCBoYW5kbGVyKTtcclxuICAgIGNvbnNvbGUubG9nKFwibG9iYnlWaWV3KCkgLT4gcnVuU2Vla3MoKVwiLCBlbCwgbW9kZWwsIGN0cmwpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbG9iYnlWaWV3KG1vZGVsLCBoYW5kbGVyKTogVk5vZGVbXSB7XHJcbiAgICAvLyBjb25zb2xlLmxvZyhcIi4uLi4uLi5sb2JieVZpZXcobW9kZWwsIGhhbmRsZXIpXCIsIG1vZGVsLCBoYW5kbGVyKTtcclxuICAgIC8vIEdldCB0aGUgbW9kYWxcclxuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSE7XHJcblxyXG4gICAgLy8gV2hlbiB0aGUgdXNlciBjbGlja3MgYW55d2hlcmUgb3V0c2lkZSBvZiB0aGUgbW9kYWwsIGNsb3NlIGl0XHJcbiAgICB3aW5kb3cub25jbGljayA9IGZ1bmN0aW9uKGV2ZW50KSB7XHJcbiAgICAgICAgaWYgKGV2ZW50LnRhcmdldCA9PSBtb2RhbCkge1xyXG4gICAgICAgICAgICBtb2RhbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBbaCgnYXNpZGUuc2lkZWJhci1maXJzdCcsIFsgaCgnZGl2LmxvYmJ5Y2hhdCNsb2JieWNoYXQnKSBdKSxcclxuICAgICAgICAgICAgaCgnbWFpbi5tYWluJywgWyBoKCd0YWJsZSNzZWVrcycsIHtob29rOiB7IGluc2VydDogKHZub2RlKSA9PiBydW5TZWVrcyh2bm9kZSwgbW9kZWwsIGhhbmRsZXIpIH0gfSkgXSksXHJcbiAgICAgICAgICAgIGgoJ2FzaWRlLnNpZGViYXItc2Vjb25kJywgWyBoKCd1bCNzZWVrYnV0dG9ucycpIF0pLFxyXG4gICAgICAgICAgICBoKCd1bmRlci1sZWZ0JywgXCIjIG9mIHVzZXJzXCIpLFxyXG4gICAgICAgICAgICBoKCd1bmRlci1sb2JieScpLFxyXG4gICAgICAgICAgICBoKCd1bmRlci1yaWdodCcpLFxyXG4gICAgICAgIF07XHJcbn1cclxuIiwiaW1wb3J0IHsgaW5pdCB9IGZyb20gJ3NuYWJiZG9tJztcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuaW1wb3J0IHNpdGUgZnJvbSAnLi9zaXRlJztcclxuXHJcbmZ1bmN0aW9uIG1haW4oaW5pdFN0YXRlLCBvbGRWbm9kZSwgeyB2aWV3LCB1cGRhdGUgfSkge1xyXG4gICAgLy8gY29uc29sZS5sb2coaW5pdFN0YXRlLCBvbGRWbm9kZSk7XHJcbiAgICBjb25zdCBuZXdWbm9kZSA9IHZpZXcoaW5pdFN0YXRlLCBlID0+IHtcclxuICAgICAgICBjb25zdCBuZXdTdGF0ZSA9IHVwZGF0ZShpbml0U3RhdGUsIGUpO1xyXG4gICAgICAgIG1haW4obmV3U3RhdGUsIG5ld1Zub2RlLCB7IHZpZXcsIHVwZGF0ZSB9KTtcclxuICAgIH0pO1xyXG4gICAgcGF0Y2gob2xkVm5vZGUsIG5ld1Zub2RlKTtcclxufVxyXG5cclxubWFpbihcclxuICAgIHNpdGUuaW5pdCgpLFxyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BsYWNlaG9sZGVyJyksXHJcbiAgICBzaXRlXHJcbik7XHJcbiIsImltcG9ydCB7IGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG5pbXBvcnQgaCBmcm9tICdzbmFiYmRvbS9oJztcblxuaW1wb3J0IHsgcG9ja2V0VmlldyB9IGZyb20gJy4vcG9ja2V0JztcbmltcG9ydCB7IG5lZWRQb2NrZXRzIH0gZnJvbSAnLi9jaGVzcyc7XG5cblxuZnVuY3Rpb24gc2VsZWN0TW92ZSAoY3RybCwgcGx5KSB7XG4gICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbGkubW92ZS5hY3RpdmUnKTtcbiAgICBpZiAoYWN0aXZlKSBhY3RpdmUuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG4gICAgY29uc3QgZWxQbHkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsaS5tb3ZlW3BseT1cIiR7cGx5fVwiXWApO1xuICAgIGlmIChlbFBseSkgZWxQbHkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgY3RybC5nb1BseShwbHkpXG4gICAgc2Nyb2xsVG9QbHkoY3RybCk7XG59XG5cbmZ1bmN0aW9uIHNjcm9sbFRvUGx5IChjdHJsKSB7XG4gICAgaWYgKGN0cmwuc3RlcHMubGVuZ3RoIDwgOSkgcmV0dXJuO1xuICAgIGNvbnN0IG1vdmVzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW92ZXMnKSBhcyBIVE1MRWxlbWVudDtcbiAgICBsZXQgc3Q6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBjb25zdCBwbHlFbCA9IG1vdmVzRWwucXVlcnlTZWxlY3RvcignbGkubW92ZS5hY3RpdmUnKSBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbiAgICBpZiAoY3RybC5wbHkgPT0gMCkgc3QgPSAwO1xuICAgIGVsc2UgaWYgKGN0cmwucGx5ID09IGN0cmwuc3RlcHMubGVuZ3RoIC0gMSkgc3QgPSA5OTk5OTtcbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKHBseUVsKSBzdCA9IHBseUVsLm9mZnNldFRvcCAtIG1vdmVzRWwub2Zmc2V0SGVpZ2h0ICsgcGx5RWwub2Zmc2V0SGVpZ2h0O1xuICAgIH1cbiAgICBjb25zb2xlLmxvZyhcInNjcm9sbFRvUGx5XCIsIGN0cmwucGx5LCBzdCk7XG4gICAgaWYgKHR5cGVvZiBzdCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoc3QgPT0gMCB8fCBzdCA9PSA5OTk5OSkgbW92ZXNFbC5zY3JvbGxUb3AgPSBzdDtcbiAgICAgICAgZWxzZSBpZiAocGx5RWwpIHtcbiAgICAgICAgICAgIHZhciBpc1Ntb290aFNjcm9sbFN1cHBvcnRlZCA9ICdzY3JvbGxCZWhhdmlvcicgaW4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlO1xuICAgICAgICAgICAgaWYoaXNTbW9vdGhTY3JvbGxTdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBwbHlFbC5zY3JvbGxJbnRvVmlldyh7YmVoYXZpb3I6IFwic21vb3RoXCIsIGJsb2NrOiBcImNlbnRlclwifSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBseUVsLnNjcm9sbEludG9WaWV3KGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gZmxpcFxuLy8gVE9ETzogcGxheWVycywgY2xvY2tzXG5mdW5jdGlvbiB0b2dnbGVPcmllbnRhdGlvbiAoY3RybCkge1xuICAgIGN0cmwuZmxpcCA9ICFjdHJsLmZsaXA7XG4gICAgY3RybC5jaGVzc2dyb3VuZC50b2dnbGVPcmllbnRhdGlvbigpO1xuICAgIGlmIChjdHJsLnZhcmlhbnQgPT09IFwic2hvZ2lcIikge1xuICAgICAgICBjb25zdCBjb2xvciA9IGN0cmwuY2hlc3Nncm91bmQuc3RhdGUub3JpZW50YXRpb24gPT09IFwid2hpdGVcIiA/IFwid2hpdGVcIiA6IFwiYmxhY2tcIjtcbiAgICAgICAgY3RybC5zZXRQaWVjZXMoY29sb3IpO1xuICAgIH07XG5cbiAgICBjb25zdCBuYW1lX3RtcCA9IGN0cmwucGxheWVyc1swXTtcbiAgICBjdHJsLnBsYXllcnNbMF0gPSBjdHJsLnBsYXllcnNbMV07XG4gICAgY3RybC5wbGF5ZXJzWzFdID0gbmFtZV90bXA7XG5cbiAgICBjb25zb2xlLmxvZyhcIkZMSVBcIik7XG4gICAgaWYgKG5lZWRQb2NrZXRzKGN0cmwudmFyaWFudCkpIHtcbiAgICAgICAgY29uc3QgdG1wID0gY3RybC5wb2NrZXRzWzBdO1xuICAgICAgICBjdHJsLnBvY2tldHNbMF0gPSBjdHJsLnBvY2tldHNbMV07XG4gICAgICAgIGN0cmwucG9ja2V0c1sxXSA9IHRtcDtcbiAgICAgICAgY3RybC52cG9ja2V0MCA9IHBhdGNoKGN0cmwudnBvY2tldDAsIHBvY2tldFZpZXcoY3RybCwgY3RybC5mbGlwID8gY3RybC5teWNvbG9yIDogY3RybC5vcHBjb2xvciwgXCJ0b3BcIikpO1xuICAgICAgICBjdHJsLnZwb2NrZXQxID0gcGF0Y2goY3RybC52cG9ja2V0MSwgcG9ja2V0VmlldyhjdHJsLCBjdHJsLmZsaXAgPyBjdHJsLm9wcGNvbG9yIDogY3RybC5teWNvbG9yLCBcImJvdHRvbVwiKSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbW92ZWxpc3RWaWV3IChjdHJsKSB7XG4gICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb3ZlLWNvbnRyb2xzJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY3RybC5tb3ZlQ29udHJvbHMgPSBwYXRjaChjb250YWluZXIsIGgoJ2Rpdi5idG4tY29udHJvbHMnLCBbXG4gICAgICAgICAgICBoKCdidXR0b24jZmxpcC1ib2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHRvZ2dsZU9yaWVudGF0aW9uKGN0cmwpIH0gfSwgW2goJ2knLCB7cHJvcHM6IHt0aXRsZTogJ0ZsaXAgYm9hcmQnfSwgY2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXJlZnJlc2hcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNmYXN0YmFja3dhcmQnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBzZWxlY3RNb3ZlKGN0cmwsIDApIH0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWZhc3QtYmFja3dhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNzdGVwYmFja3dhcmQnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBzZWxlY3RNb3ZlKGN0cmwsIE1hdGgubWF4KGN0cmwucGx5IC0gMSwgMCkpIH0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXN0ZXAtYmFja3dhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNzdGVwZm9yd2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHNlbGVjdE1vdmUoY3RybCwgTWF0aC5taW4oY3RybC5wbHkgKyAxLCBjdHJsLnN0ZXBzLmxlbmd0aCAtIDEpKSB9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1zdGVwLWZvcndhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNmYXN0Zm9yd2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHNlbGVjdE1vdmUoY3RybCwgY3RybC5zdGVwcy5sZW5ndGggLSAxKSB9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1mYXN0LWZvcndhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgXSlcbiAgICApO1xuICAgIHJldHVybiBoKCdkaXYjbW92ZXMnLCBbaCgnb2wubW92ZWxpc3QjbW92ZWxpc3QnKV0pXG4gICAgfVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTW92ZWxpc3QgKGN0cmwpIHtcbiAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vdmVsaXN0JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY29uc3QgcGx5ID0gY3RybC5zdGVwcy5sZW5ndGggLSAxO1xuICAgIGNvbnN0IG1vdmUgPSBjdHJsLnN0ZXBzW3BseV1bJ3NhbiddO1xuICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2xpLm1vdmUuYWN0aXZlJyk7XG4gICAgaWYgKGFjdGl2ZSkgYWN0aXZlLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuICAgIGNvbnN0IGVsID0gaCgnbGkubW92ZScsIHtjbGFzczoge2FjdGl2ZTogdHJ1ZX0sIGF0dHJzOiB7cGx5OiBwbHl9LCBvbjogeyBjbGljazogKCkgPT4gc2VsZWN0TW92ZShjdHJsLCBwbHkpIH19LCBtb3ZlKTtcbiAgICBpZiAocGx5ICUgMiA9PSAwKSB7XG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnb2wubW92ZWxpc3QjbW92ZWxpc3QnLCBbZWxdKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdvbC5tb3ZlbGlzdCNtb3ZlbGlzdCcsIFtoKCdsaS5tb3ZlLmNvdW50ZXInLCAocGx5ICsgMSkgLyAyKSwgZWxdKSk7XG4gICAgfVxuICAgIHNjcm9sbFRvUGx5KGN0cmwpO1xufSIsImltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmltcG9ydCAqIGFzIGNnIGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XG5pbXBvcnQgeyBkcmFnTmV3UGllY2UgfSBmcm9tICdjaGVzc2dyb3VuZHgvZHJhZyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XG5cbmltcG9ydCB7IHJvbGVUb1NhbiwgbmVlZFBvY2tldHMsIHBvY2tldFJvbGVzLCBsYyB9IGZyb20gJy4vY2hlc3MnO1xuaW1wb3J0IFJvdW5kQ29udHJvbGxlciBmcm9tICcuL2N0cmwnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxudHlwZSBQb3NpdGlvbiA9ICd0b3AnIHwgJ2JvdHRvbSc7XG5cbmNvbnN0IGV2ZW50TmFtZXMgPSBbJ21vdXNlZG93bicsICd0b3VjaHN0YXJ0J107XG5cbmV4cG9ydCBmdW5jdGlvbiBwb2NrZXRWaWV3KGN0cmw6IFJvdW5kQ29udHJvbGxlciwgY29sb3I6IENvbG9yLCBwb3NpdGlvbjogUG9zaXRpb24pIHtcbiAgY29uc3QgcG9ja2V0ID0gY3RybC5wb2NrZXRzW3Bvc2l0aW9uID09PSAndG9wJyA/IDAgOiAxXTtcbiAgY29uc3QgcGllY2VSb2xlcyA9IE9iamVjdC5rZXlzKHBvY2tldCk7XG4gIHJldHVybiBoKCdkaXYucG9ja2V0LicgKyBwb3NpdGlvbiwge1xuICAgIGNsYXNzOiB7IHVzYWJsZTogdHJ1ZSB9LFxuICAgIGhvb2s6IHtcbiAgICAgIGluc2VydDogdm5vZGUgPT4ge1xuICAgICAgICBldmVudE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgKHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCAoZTogY2cuTW91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSAoY3RybC5mbGlwID8gJ3RvcCcgOiAnYm90dG9tJykpIGRyYWcoY3RybCwgZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9LCBwaWVjZVJvbGVzLm1hcChyb2xlID0+IHtcbiAgICBsZXQgbmIgPSBwb2NrZXRbcm9sZV0gfHwgMDtcbiAgICByZXR1cm4gaCgncGllY2UuJyArIHJvbGUgKyAnLicgKyBjb2xvciwge1xuICAgICAgYXR0cnM6IHtcbiAgICAgICAgJ2RhdGEtcm9sZSc6IHJvbGUsXG4gICAgICAgICdkYXRhLWNvbG9yJzogY29sb3IsXG4gICAgICAgICdkYXRhLW5iJzogbmIsXG4gICAgICB9XG4gICAgfSk7XG4gIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRyYWcoY3RybDogUm91bmRDb250cm9sbGVyLCBlOiBjZy5Nb3VjaEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKGUuYnV0dG9uICE9PSB1bmRlZmluZWQgJiYgZS5idXR0b24gIT09IDApIHJldHVybjsgLy8gb25seSB0b3VjaCBvciBsZWZ0IGNsaWNrXG4gICAgY29uc3QgZWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCxcbiAgICByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJvbGUnKSBhcyBjZy5Sb2xlLFxuICAgIGNvbG9yID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWNvbG9yJykgYXMgY2cuQ29sb3IsXG4gICAgbnVtYmVyID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLW5iJyk7XG4gICAgaWYgKCFyb2xlIHx8ICFjb2xvciB8fCBudW1iZXIgPT09ICcwJykgcmV0dXJuO1xuXG4gICAgLy8gU2hvdyBwb3NzaWJsZSBkcm9wIGRlc3RzIG9uIG15IHR1cm4gb25seSBub3QgdG8gbWVzcyB1cCBwcmVkcm9wXG4gICAgaWYgKGN0cmwudHVybkNvbG9yID09PSBjdHJsLm15Y29sb3IpIHtcbiAgICAgICAgY29uc3QgZHJvcERlc3RzID0geyBcImEwXCI6IGN0cmwuZGVzdHNbcm9sZVRvU2FuW3JvbGVdICsgXCJAXCJdIH07XG4gICAgICAgIGN0cmwuY2hlc3Nncm91bmQubmV3UGllY2Uoe1wicm9sZVwiOiBcInBhd25cIiwgXCJjb2xvclwiOiBjb2xvcn0sIFwiYTBcIilcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5zZXQoe1xuICAgICAgICAgICAgdHVybkNvbG9yOiBjb2xvcixcbiAgICAgICAgICAgIG1vdmFibGU6IHtcbiAgICAgICAgICAgICAgICBkZXN0czogZHJvcERlc3RzLFxuICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBjdHJsLmNoZXNzZ3JvdW5kLnNlbGVjdFNxdWFyZShcImEwXCIpO1xuICAgICAgICBjdHJsLmNoZXNzZ3JvdW5kLnNldCh7IGxhc3RNb3ZlOiBjdHJsLmxhc3Rtb3ZlIH0pO1xuICAgIH1cbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBkcmFnTmV3UGllY2UoY3RybC5jaGVzc2dyb3VuZC5zdGF0ZSwgeyBjb2xvciwgcm9sZSB9LCBlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRyb3BJc1ZhbGlkKGRlc3RzOiBjZy5EZXN0cywgcm9sZTogY2cuUm9sZSwga2V5OiBjZy5LZXkpOiBib29sZWFuIHtcbiAgICAvLyBjb25zb2xlLmxvZyhcImRyb3BEZXN0czpcIiwgZGVzdHMsIHJvbGUsIGtleSlcbiAgICBjb25zdCBkcm9wcyA9IGRlc3RzW3JvbGVUb1Nhbltyb2xlXSArIFwiQFwiXTtcbiAgICAvLyBjb25zb2xlLmxvZyhcImRyb3BzOlwiLCBkcm9wcylcblxuICAgIGlmIChkcm9wcyA9PT0gdW5kZWZpbmVkIHx8IGRyb3BzID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgICByZXR1cm4gZHJvcHMuaW5kZXhPZihrZXkpICE9PSAtMTtcbn1cblxuLy8gVE9ETzogYWZyZSAxIG1vdmUgbWFkZSBvbmx5IDEgcG9ja2V0IHVwZGF0ZSBuZWVkZWQgYXQgb25jZSwgbm8gbmVlZCB0byB1cGRhdGUgYm90aFxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVBvY2tldHMoY3RybDogUm91bmRDb250cm9sbGVyLCB2cG9ja2V0MCwgdnBvY2tldDEpOiB2b2lkIHtcbiAgICAvLyB1cGRhdGUgcG9ja2V0cyBmcm9tIGZlblxuICAgIGlmIChuZWVkUG9ja2V0cyhjdHJsLnZhcmlhbnQpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gY3RybC5mdWxsZmVuLnNwbGl0KFwiIFwiKTtcbiAgICAgICAgY29uc3QgZmVuX3BsYWNlbWVudCA9IHBhcnRzWzBdO1xuICAgICAgICB2YXIgcG9ja2V0cyA9IFwiXCI7XG4gICAgICAgIGNvbnN0IGJyYWNrZXRQb3MgPSBmZW5fcGxhY2VtZW50LmluZGV4T2YoXCJbXCIpO1xuICAgICAgICBpZiAoYnJhY2tldFBvcyAhPT0gLTEpIHtcbiAgICAgICAgICAgIHBvY2tldHMgPSBmZW5fcGxhY2VtZW50LnNsaWNlKGJyYWNrZXRQb3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYyA9IGN0cmwubXljb2xvclswXTtcbiAgICAgICAgY29uc3QgbyA9IGN0cmwub3BwY29sb3JbMF07XG4gICAgICAgIGNvbnN0IHJvbGVzID0gcG9ja2V0Um9sZXMoY3RybC52YXJpYW50KTtcbiAgICAgICAgdmFyIHBvID0ge307XG4gICAgICAgIHZhciBwYyA9IHt9O1xuICAgICAgICByb2xlcy5mb3JFYWNoKHJvbGUgPT4gcGNbcm9sZV0gPSBsYyhwb2NrZXRzLCByb2xlVG9TYW5bcm9sZV0udG9Mb3dlckNhc2UoKSwgYz09PShjdHJsLnZhcmlhbnQ9PT0nc2hvZ2knID8gJ2InIDogJ3cnKSkpO1xuICAgICAgICByb2xlcy5mb3JFYWNoKHJvbGUgPT4gcG9bcm9sZV0gPSBsYyhwb2NrZXRzLCByb2xlVG9TYW5bcm9sZV0udG9Mb3dlckNhc2UoKSwgbz09PShjdHJsLnZhcmlhbnQ9PT0nc2hvZ2knID8gJ2InIDogJ3cnKSkpO1xuICAgICAgICBpZiAoY3RybC5mbGlwKSB7XG4gICAgICAgICAgICBjdHJsLnBvY2tldHMgPSBbcGMsIHBvXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN0cmwucG9ja2V0cyA9IFtwbywgcGNdO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKG8sYyxwbyxwYylcbiAgICAgICAgY3RybC52cG9ja2V0MCA9IHBhdGNoKHZwb2NrZXQwLCBwb2NrZXRWaWV3KGN0cmwsIGN0cmwuZmxpcCA/IGN0cmwubXljb2xvciA6IGN0cmwub3BwY29sb3IsIFwidG9wXCIpKTtcbiAgICAgICAgY3RybC52cG9ja2V0MSA9IHBhdGNoKHZwb2NrZXQxLCBwb2NrZXRWaWV3KGN0cmwsIGN0cmwuZmxpcCA/IGN0cmwub3BwY29sb3IgOiBjdHJsLm15Y29sb3IsIFwiYm90dG9tXCIpKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBoLCBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuaW1wb3J0IHRvVk5vZGUgZnJvbSAnc25hYmJkb20vdG92bm9kZSc7XHJcblxyXG5pbXBvcnQgeyBrZXkycG9zIH0gZnJvbSAnY2hlc3Nncm91bmR4L3V0aWwnO1xyXG5cclxuaW1wb3J0IHsgaXNQcm9tb3Rpb24sIG1hbmRhdG9yeVByb21vdGlvbiwgcHJvbW90aW9uUm9sZXMsIHJvbGVUb1NhbiB9IGZyb20gJy4vY2hlc3MnO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgbGlzdGVuZXJzXSk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihjdHJsKSB7XHJcblxyXG4gICAgbGV0IHByb21vdGluZzogYW55ID0gZmFsc2U7XHJcbiAgICBsZXQgcm9sZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICBmdW5jdGlvbiBzdGFydChvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kID0gY3RybC5nZXRHcm91bmQoKTtcclxuICAgICAgICBpZiAoaXNQcm9tb3Rpb24oY3RybC52YXJpYW50LCBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLCBvcmlnLCBkZXN0LCBtZXRhKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IGN0cmwubXljb2xvcjtcclxuICAgICAgICAgICAgY29uc3Qgb3JpZW50YXRpb24gPSBncm91bmQuc3RhdGUub3JpZW50YXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmluZ1JvbGUgPSBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLnJvbGU7XHJcbiAgICAgICAgICAgIHJvbGVzID0gcHJvbW90aW9uUm9sZXMoY3RybC52YXJpYW50LCBtb3ZpbmdSb2xlKTtcclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoY3RybC52YXJpYW50KSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKG1hbmRhdG9yeVByb21vdGlvbihtb3ZpbmdSb2xlLCBkZXN0LCBjb2xvcikpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9tb3RlKGdyb3VuZCwgZGVzdCwgJ3AnICsgZ3JvdW5kLnN0YXRlLnBpZWNlc1tkZXN0XS5yb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBjdHJsLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGRyYXdfcHJvbW8oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBwcm9tb3RpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWc6IG9yaWcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc3Q6IGRlc3QsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ21ha3J1ayc6XHJcbiAgICAgICAgICAgICAgICBwcm9tb3RlKGdyb3VuZCwgZGVzdCwgJ21ldCcpO1xyXG4gICAgICAgICAgICAgICAgY3RybC5zZW5kTW92ZShvcmlnLCBkZXN0LCAnbScpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NpdHR1eWluJzpcclxuICAgICAgICAgICAgICAgIHByb21vdGUoZ3JvdW5kLCBkZXN0LCAnZmVyeicpO1xyXG4gICAgICAgICAgICAgICAgY3RybC5zZW5kTW92ZShvcmlnLCBkZXN0LCAnZicpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBkcmF3X3Byb21vKGRlc3QsIGNvbG9yLCBvcmllbnRhdGlvbik7XHJcbiAgICAgICAgICAgICAgICBwcm9tb3RpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgb3JpZzogb3JpZyxcclxuICAgICAgICAgICAgICAgICAgICBkZXN0OiBkZXN0LFxyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gcHJvbW90ZShnLCBrZXksIHJvbGUpIHtcclxuICAgICAgICB2YXIgcGllY2VzID0ge307XHJcbiAgICAgICAgdmFyIHBpZWNlID0gZy5zdGF0ZS5waWVjZXNba2V5XTtcclxuICAgICAgICBpZiAoZy5zdGF0ZS5waWVjZXNba2V5XS5yb2xlID09PSByb2xlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwaWVjZXNba2V5XSA9IHtcclxuICAgICAgICAgICAgICAgIGNvbG9yOiBwaWVjZS5jb2xvcixcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBwcm9tb3RlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBnLnNldFBpZWNlcyhwaWVjZXMpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZHJhd19wcm9tbyhkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pIHtcclxuICAgICAgICB2YXIgY29udGFpbmVyID0gdG9WTm9kZShkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdleHRlbnNpb24nKSBhcyBOb2RlKTtcclxuICAgICAgICBwYXRjaChjb250YWluZXIsIHJlbmRlclByb21vdGlvbihkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X25vX3Byb21vKCkge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uX2Nob2ljZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZXh0ZW5zaW9uJykpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmlzaChyb2xlKSB7XHJcbiAgICAgICAgaWYgKHByb21vdGluZykge1xyXG4gICAgICAgICAgICBkcmF3X25vX3Byb21vKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21vdGVkID0gcHJvbW90ZShjdHJsLmdldEdyb3VuZCgpLCBwcm9tb3RpbmcuZGVzdCwgcm9sZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21vID0gY3RybC52YXJpYW50ID09PSBcInNob2dpXCIgPyBwcm9tb3RlZCA/IFwiK1wiIDogXCJcIiA6IHJvbGVUb1Nhbltyb2xlXS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBpZiAocHJvbW90aW5nLmNhbGxiYWNrKSBwcm9tb3RpbmcuY2FsbGJhY2socHJvbW90aW5nLm9yaWcsIHByb21vdGluZy5kZXN0LCBwcm9tbyk7XHJcbiAgICAgICAgICAgIHByb21vdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsKCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGJpbmQoZXZlbnROYW1lOiBzdHJpbmcsIGY6IChlOiBFdmVudCkgPT4gdm9pZCwgcmVkcmF3KSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaW5zZXJ0KHZub2RlKSB7XHJcbiAgICAgICAgICAgICAgICB2bm9kZS5lbG0uYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGYoZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlZHJhdykgcmVkcmF3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJQcm9tb3Rpb24oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKSB7XHJcbiAgICAgICAgY29uc3QgZGltID0gY3RybC5nZXRHcm91bmQoKS5zdGF0ZS5kaW1lbnNpb25zXHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZGltLmhlaWdodCA9PT0gMTA7XHJcbiAgICAgICAgdmFyIGxlZnQgPSAoZGltLndpZHRoIC0ga2V5MnBvcyhkZXN0LCBmaXJzdFJhbmtJczApWzBdKSAqICgxMDAgLyBkaW0ud2lkdGgpO1xyXG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gXCJ3aGl0ZVwiKSBsZWZ0ID0gKDEwMCAvIGRpbS53aWR0aCkgKiAoZGltLndpZHRoIC0gMSkgLSBsZWZ0O1xyXG4gICAgICAgIHZhciB2ZXJ0aWNhbCA9IGNvbG9yID09PSBvcmllbnRhdGlvbiA/IFwidG9wXCIgOiBcImJvdHRvbVwiO1xyXG4gICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICBcImRpdiNleHRlbnNpb25fY2hvaWNlLlwiICsgdmVydGljYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGhvb2s6IHtcclxuICAgICAgICAgICAgICAgICAgICBpbnNlcnQ6IHZub2RlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWwgPSB2bm9kZS5lbG0gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjYW5jZWwoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICByb2xlcy5tYXAoKHNlcnZlclJvbGUsIGkpID0+IHtcclxuICAgICAgICAgICAgICAgIHZhciB0b3AgPSAoY29sb3IgPT09IG9yaWVudGF0aW9uID8gaSA6IGRpbS5oZWlnaHQgLTEgLSBpKSAqICgxMDAgLyBkaW0uaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICAgICAgICAgIFwic3F1YXJlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhdHRyczogeyBzdHlsZTogXCJ0b3A6IFwiICsgdG9wICsgXCIlO2xlZnQ6IFwiICsgbGVmdCArIFwiJVwiIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvb2s6IGJpbmQoXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5pc2goc2VydmVyUm9sZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZhbHNlKVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgW2goXCJwaWVjZS5cIiArIHNlcnZlclJvbGUgKyBcIi5cIiArIGNvbG9yKV1cclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXJ0LFxyXG4gICAgfTtcclxufVxyXG4iLCIvLyBodHRwOi8vanNmaWRkbGUubmV0L01pc3NvdWxhTG9yZW56by9nZm42b2Izai9cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9vcm5pY2FyL2xpbGEvYmxvYi9tYXN0ZXIvdWkvY29tbW9uL3NyYy9yZXNpemUudHNcblxuaW1wb3J0ICogYXMgY2cgZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcblxuZXhwb3J0IHR5cGUgTW91Y2hFdmVudCA9IE1vdXNlRXZlbnQgJiBUb3VjaEV2ZW50O1xuXG4vL2V4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHJlc2l6ZUhhbmRsZShlbHM6IGNnLkVsZW1lbnRzLCBwcmVmOiBudW1iZXIsIHBseTogbnVtYmVyKSB7XG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiByZXNpemVIYW5kbGUoZWxzOiBjZy5FbGVtZW50cykge1xuXG4vLyAgaWYgKCFwcmVmKSByZXR1cm47XG4gIGlmICh0cnVlKSByZXR1cm47XG5cbiAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjZy1yZXNpemUnKTtcbiAgZWxzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cbiAgY29uc3QgbW91c2Vtb3ZlRXZlbnQgPSAnbW91c2Vtb3ZlJztcbiAgY29uc3QgbW91c2V1cEV2ZW50ID0gJ21vdXNldXAnO1xuXG4gIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChzdGFydDogTW91Y2hFdmVudCkgPT4ge1xuXG4gICAgc3RhcnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGNvbnN0IHN0YXJ0UG9zID0gZXZlbnRQb3NpdGlvbihzdGFydCkhO1xuICAgIGNvbnN0IGluaXRpYWxab29tID0gMTAwOyAgLy9wYXJzZUludChnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpLmdldFByb3BlcnR5VmFsdWUoJy0tem9vbScpKTtcbiAgICBsZXQgem9vbSA9IGluaXRpYWxab29tO1xuLypcbiAgICBjb25zdCBzYXZlWm9vbSA9IHdpbmRvdy5saWNoZXNzLmRlYm91bmNlKCgpID0+IHtcbiAgICAgICQuYWpheCh7IG1ldGhvZDogJ3Bvc3QnLCB1cmw6ICcvcHJlZi96b29tP3Y9JyArICgxMDAgKyB6b29tKSB9KTtcbiAgICB9LCA3MDApO1xuKi9cblxuICAgIGNvbnN0IHNldFpvb20gPSAoem9vbTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNnLXdyYXAnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgaWYgKGVsKSB7XG4vLyAgICAgICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGRpbWVuc2lvbnNbVkFSSUFOVFNbdGhpcy52YXJpYW50XS5nZW9tXS53aWR0aCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDUyIDogNjQpO1xuLy8gICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLmhlaWdodCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDYwIDogNjQpO1xuICAgICAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gcGFyc2VJbnQoIGRvY3VtZW50LmRlZmF1bHRWaWV3IS5nZXRDb21wdXRlZFN0eWxlKCBlbCApLndpZHRoIHx8ICcnLCAxMCk7XG4gICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gcGFyc2VJbnQoZG9jdW1lbnQuZGVmYXVsdFZpZXchLmdldENvbXB1dGVkU3R5bGUoIGVsICkuaGVpZ2h0IHx8ICcnLCAxMCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhiYXNlV2lkdGgsIGJhc2VIZWlnaHQsIHpvb20pO1xuICAgICAgICAgICAgY29uc3QgcHh3ID0gYCR7em9vbSAvIDEwMCAqIGJhc2VXaWR0aH1weGA7XG4gICAgICAgICAgICBjb25zdCBweGggPSBgJHt6b29tIC8gMTAwICogYmFzZUhlaWdodH1weGA7XG4gICAgICAgICAgICBlbC5zdHlsZS53aWR0aCA9IHB4dztcbiAgICAgICAgICAgIGVsLnN0eWxlLmhlaWdodCA9IHB4aDtcbiAgICAgICAgICAgIGNvbnN0IGV2ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XG4gICAgICAgICAgICBldi5pbml0RXZlbnQoJ2NoZXNzZ3JvdW5kLnJlc2l6ZScsIGZhbHNlLCBmYWxzZSk7XG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmRpc3BhdGNoRXZlbnQoZXYpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzaXplID0gKG1vdmU6IE1vdWNoRXZlbnQpID0+IHtcblxuICAgICAgY29uc3QgcG9zID0gZXZlbnRQb3NpdGlvbihtb3ZlKSE7XG4gICAgICBjb25zdCBkZWx0YSA9IHBvc1swXSAtIHN0YXJ0UG9zWzBdICsgcG9zWzFdIC0gc3RhcnRQb3NbMV07XG5cbiAgICAgIHpvb20gPSBNYXRoLnJvdW5kKE1hdGgubWluKDE1MCwgTWF0aC5tYXgoMCwgaW5pdGlhbFpvb20gKyBkZWx0YSAvIDEwKSkpO1xuXG4vLyAgICAgIGRvY3VtZW50LmJvZHkuc2V0QXR0cmlidXRlKCdzdHlsZScsICctLXpvb206JyArIHpvb20pO1xuLy8gICAgICB3aW5kb3cubGljaGVzcy5kaXNwYXRjaEV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpO1xuICAgICAgc2V0Wm9vbSh6b29tKTtcbi8vICAgICAgc2F2ZVpvb20oKTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdyZXNpemluZycpO1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihtb3VzZW1vdmVFdmVudCwgcmVzaXplKTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIobW91c2V1cEV2ZW50LCAoKSA9PiB7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKG1vdXNlbW92ZUV2ZW50LCByZXNpemUpO1xuICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH0sIHsgb25jZTogdHJ1ZSB9KTtcbiAgfSk7XG4vKlxuICBpZiAocHJlZiA9PSAxKSB7XG4gICAgY29uc3QgdG9nZ2xlID0gKHBseTogbnVtYmVyKSA9PiBlbC5jbGFzc0xpc3QudG9nZ2xlKCdub25lJywgcGx5ID49IDIpO1xuICAgIHRvZ2dsZShwbHkpO1xuICAgIHdpbmRvdy5saWNoZXNzLnB1YnN1Yi5vbigncGx5JywgdG9nZ2xlKTtcbiAgfVxuXG4gIGFkZE5hZyhlbCk7XG4qL1xufVxuXG5mdW5jdGlvbiBldmVudFBvc2l0aW9uKGU6IE1vdWNoRXZlbnQpOiBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkIHtcbiAgaWYgKGUuY2xpZW50WCB8fCBlLmNsaWVudFggPT09IDApIHJldHVybiBbZS5jbGllbnRYLCBlLmNsaWVudFldO1xuICBpZiAoZS50b3VjaGVzICYmIGUudGFyZ2V0VG91Y2hlc1swXSkgcmV0dXJuIFtlLnRhcmdldFRvdWNoZXNbMF0uY2xpZW50WCwgZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFldO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuLypcbmZ1bmN0aW9uIGFkZE5hZyhlbDogSFRNTEVsZW1lbnQpIHtcblxuICBjb25zdCBzdG9yYWdlID0gd2luZG93LmxpY2hlc3Muc3RvcmFnZS5tYWtlQm9vbGVhbigncmVzaXplLW5hZycpO1xuICBpZiAoc3RvcmFnZS5nZXQoKSkgcmV0dXJuO1xuXG4gIHdpbmRvdy5saWNoZXNzLmxvYWRDc3NQYXRoKCduYWctY2lyY2xlJyk7XG4gIGVsLnRpdGxlID0gJ0RyYWcgdG8gcmVzaXplJztcbiAgZWwuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9XCJuYWctY2lyY2xlXCI+PC9kaXY+JztcbiAgZWwuYWRkRXZlbnRMaXN0ZW5lcih3aW5kb3cubGljaGVzcy5tb3VzZWRvd25FdmVudCwgKCkgPT4ge1xuICAgIHN0b3JhZ2Uuc2V0KHRydWUpO1xuICAgIGVsLmlubmVySFRNTCA9ICcnO1xuICB9LCB7IG9uY2U6IHRydWUgfSk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiBzdG9yYWdlLnNldCh0cnVlKSwgMTUwMDApO1xufVxuKi8iLCJpbXBvcnQgeyBoIH0gZnJvbSBcInNuYWJiZG9tXCI7XHJcbmltcG9ydCB7IFZOb2RlIH0gZnJvbSAnc25hYmJkb20vdm5vZGUnO1xyXG5pbXBvcnQgUm91bmRDb250cm9sbGVyIGZyb20gJy4vY3RybCc7XHJcbmltcG9ydCB7IFZBUklBTlRTIH0gZnJvbSAnLi9jaGVzcyc7XHJcblxyXG5cclxuZnVuY3Rpb24gcnVuR3JvdW5kKHZub2RlOiBWTm9kZSwgbW9kZWwsIGhhbmRsZXIpIHtcclxuICAgIGNvbnN0IGVsID0gdm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgY29uc3QgY3RybCA9IG5ldyBSb3VuZENvbnRyb2xsZXIoZWwsIG1vZGVsLCBoYW5kbGVyKTtcclxuICAgIGNvbnN0IGNnID0gY3RybC5jaGVzc2dyb3VuZDtcclxuICAgIHdpbmRvd1snY2cnXSA9IGNnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcm91bmRWaWV3KG1vZGVsLCBoYW5kbGVyKTogVk5vZGVbXSB7XHJcbiAgICAvLyBjb25zb2xlLmxvZyhcIi4uLi4uLi5yb3VuZFZpZXcobW9kZWwsIGhhbmRsZXIpXCIsIG1vZGVsLCBoYW5kbGVyKTtcclxuICAgIHZhciBwbGF5ZXJUb3AsIHBsYXllckJvdHRvbSwgZGF0YUljb247XHJcbiAgICBkYXRhSWNvbiA9IFZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0uaWNvbjtcclxuICAgIGlmIChtb2RlbFtcInVzZXJuYW1lXCJdICE9PSBtb2RlbFtcIndwbGF5ZXJcIl0gJiYgbW9kZWxbXCJ1c2VybmFtZVwiXSAhPT0gbW9kZWxbXCJicGxheWVyXCJdKSB7XHJcbiAgICAgICAgLy8gc3BlY3RhdG9yIGdhbWUgdmlld1xyXG4gICAgICAgIHBsYXllclRvcCA9IG1vZGVsW1widmFyaWFudFwiXSA9PT0gJ3Nob2dpJyA/IG1vZGVsW1wid3BsYXllclwiXSA6IG1vZGVsW1wiYnBsYXllclwiXTtcclxuICAgICAgICBwbGF5ZXJCb3R0b20gPSBtb2RlbFtcInZhcmlhbnRcIl0gPT09ICdzaG9naScgPyBtb2RlbFtcImJwbGF5ZXJcIl0gOiBtb2RlbFtcIndwbGF5ZXJcIl07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHBsYXllclRvcCA9IG1vZGVsW1widXNlcm5hbWVcIl0gPT09IG1vZGVsW1wid3BsYXllclwiXSA/IG1vZGVsW1wiYnBsYXllclwiXSA6IG1vZGVsW1wid3BsYXllclwiXTtcclxuICAgICAgICBwbGF5ZXJCb3R0b20gPSBtb2RlbFtcInVzZXJuYW1lXCJdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFtoKCdhc2lkZS5zaWRlYmFyLWZpcnN0JywgW1xyXG4gICAgICAgICAgICAgICAgaCgnZGl2LmdhbWUtaW5mbycsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYnLCBbaCgnaS12YXJpYW50Jywge2F0dHJzOiB7XCJkYXRhLWljb25cIjogZGF0YUljb259LCBjbGFzczoge1wiaWNvblwiOiB0cnVlfX0gKSwgaCgndGMnLCBtb2RlbFtcImJhc2VcIl0gKyBcIitcIiArIG1vZGVsW1wiaW5jXCJdICsgXCIg4oCiIENhc3VhbCDigKIgXCIgKyBtb2RlbFtcInZhcmlhbnRcIl0pXSksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2JywgW2goJ2ktc2lkZScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24td2hpdGVcIjogdHJ1ZX0gfSApLCBoKCdwbGF5ZXInLCBtb2RlbFtcIndwbGF5ZXJcIl0gKyBcIiAoMTUwMD8pXCIpXSksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2JywgW2goJ2ktc2lkZScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tYmxhY2tcIjogdHJ1ZX0gfSApLCBoKCdwbGF5ZXInLCBtb2RlbFtcImJwbGF5ZXJcIl0gKyBcIiAoMTUwMD8pXCIpXSksXHJcbiAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYucm91bmRjaGF0I3JvdW5kY2hhdCcpXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBoKCdtYWluLm1haW4nLCBbXHJcbiAgICAgICAgICAgICAgICBoKGBzZWxlY3Rpb24uJHtWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLmJvYXJkfS4ke1ZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0ucGllY2VzfWAsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKGBkaXYuY2ctd3JhcC4ke1ZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0uY2d9YCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBob29rOiB7IGluc2VydDogKHZub2RlKSA9PiBydW5Hcm91bmQodm5vZGUsIG1vZGVsLCBoYW5kbGVyKX0sXHJcbiAgICAgICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIGgoJ2FzaWRlLnNpZGViYXItc2Vjb25kJywgW1xyXG4gICAgICAgICAgICAgICAgaCgnZGl2I3BvY2tldC13cmFwcGVyJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoYGRpdi4ke1ZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0ucGllY2VzfWAsIFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaCgnZGl2LmNnLXdyYXAucG9ja2V0JywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaCgnZGl2I3BvY2tldDAnKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiNjbG9jazAnKSxcclxuICAgICAgICAgICAgICAgIGgoJ2Rpdi5yb3VuZC1kYXRhJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2Rpdi5wbGF5ZXItZGF0YScsIFtoKCdpLXNpZGUub25saW5lI3RvcC1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiBmYWxzZSwgXCJpY29uLW9mZmxpbmVcIjogdHJ1ZX19KSwgaCgncGxheWVyJywgcGxheWVyVG9wKSwgaCgncmF0aW5nJywgXCIxNTAwP1wiKV0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNtb3ZlLWNvbnRyb2xzJyksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2I21vdmVsaXN0JyksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2I2FmdGVyLWdhbWUnKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYjZ2FtZS1jb250cm9scycpLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2Rpdi5wbGF5ZXItZGF0YScsIFtoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiBmYWxzZSwgXCJpY29uLW9mZmxpbmVcIjogdHJ1ZX19KSwgaCgncGxheWVyJywgcGxheWVyQm90dG9tKSwgaCgncmF0aW5nJywgXCIxNTAwP1wiKV0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjY2xvY2sxJyksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjcG9ja2V0LXdyYXBwZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaChgZGl2LiR7VkFSSUFOVFNbbW9kZWxbXCJ2YXJpYW50XCJdXS5waWVjZXN9YCwgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdkaXYuY2ctd3JhcC5wb2NrZXQnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdkaXYjcG9ja2V0MScpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I2ZsaXAnKSxcclxuICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIGgoJ3VuZGVyLWxlZnQnLCBcIlNwZWN0YXRvcnNcIiksXHJcbiAgICAgICAgICAgIGgoJ3VuZGVyLWJvYXJkJywgW2goJ2Rpdi4jdW5kZXItYm9hcmQnKV0pLFxyXG4gICAgICAgICAgICBoKCd1bmRlci1yaWdodCcsIFtoKCdkaXYjem9vbScpXSksXHJcbiAgICAgICAgXTtcclxufVxyXG4iLCJpbXBvcnQgaCBmcm9tICdzbmFiYmRvbS9oJztcclxuaW1wb3J0IHsgVk5vZGUgfSBmcm9tICdzbmFiYmRvbS92bm9kZSc7XHJcblxyXG5pbXBvcnQgeyBsb2JieVZpZXcgfSBmcm9tICcuL2xvYmJ5JztcclxuaW1wb3J0IHsgcm91bmRWaWV3IH0gZnJvbSAnLi9yb3VuZCc7XHJcblxyXG5leHBvcnQgY29uc3QgQUNDRVBUID0gU3ltYm9sKFwiQWNjZXB0XCIpO1xyXG5leHBvcnQgY29uc3QgQkFDSyA9IFN5bWJvbCgnQmFjaycpO1xyXG5cclxuLy8gbW9kZWwgOiB7aG9tZTogXCJcIiwgdXNlcm5hbWU6IFwiXCIsIHZhcmlhbnQ6IFwiXCIsIGdhbWVJZDogMCwgd3BsYXllcjogXCJcIiwgYnBsYXllcjogXCJcIiwgYmFzZTogXCJcIiwgaW5jOiBcIlwiLCBzZWVrczogW3NlZWtdLCB0djogXCJcIiwgc3RhdHVzOiBcIlwifVxyXG5cclxudmFyIGdldENvb2tpZSA9IGZ1bmN0aW9uKG5hbWUpIHtcclxuICAgIHZhciBjb29raWVzID0gZG9jdW1lbnQuY29va2llLnNwbGl0KCc7Jyk7XHJcbiAgICBmb3IodmFyIGk9MCA7IGkgPCBjb29raWVzLmxlbmd0aCA7ICsraSkge1xyXG4gICAgICAgIHZhciBwYWlyID0gY29va2llc1tpXS50cmltKCkuc3BsaXQoJz0nKTtcclxuICAgICAgICBpZihwYWlyWzBdID09IG5hbWUpXHJcbiAgICAgICAgICAgIHJldHVybiBwYWlyWzFdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFwiXCI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB2aWV3KG1vZGVsLCBoYW5kbGVyKTogVk5vZGUge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJzaXRlLnZpZXcoKSBtb2RlbD1cIiwgbW9kZWwpXHJcbiAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEzOTczMjkvaG93LXRvLXJlbW92ZS10aGUtaGFzaC1mcm9tLXdpbmRvdy1sb2NhdGlvbi13aXRoLWphdmFzY3JpcHQtd2l0aG91dC1wYWdlLXJlZnJlc2gvNTI5ODY4NCM1Mjk4Njg0XHJcbiAgICBjb25zb2xlLmxvZyhcInNpdGUudHMgZG9jdW1lbnQudGl0bGU9XCIsIGRvY3VtZW50LnRpdGxlKTtcclxuICAgIGNvbnNvbGUubG9nKFwic2l0ZS50cyB3aW5kb3cubG9jYXRpb249XCIsIHdpbmRvdy5sb2NhdGlvbik7XHJcbiAgICB3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUoe30sIGRvY3VtZW50LnRpdGxlLCBcIi9cIik7XHJcbiAgICBjb25zdCB1c2VyID0gZ2V0Q29va2llKFwidXNlclwiKTtcclxuICAgIGlmICh1c2VyICE9PSBcIlwiKSBtb2RlbFtcInVzZXJuYW1lXCJdID0gdXNlcjtcclxuXHJcbiAgICB2YXIgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHljaGVzcy12YXJpYW50cycpO1xyXG4gICAgaWYgKGVsIGluc3RhbmNlb2YgRWxlbWVudCAmJiBlbC5oYXNBdHRyaWJ1dGUoXCJkYXRhLWhvbWVcIikpIHtcclxuICAgICAgICBtb2RlbFtcImhvbWVcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWhvbWVcIik7XHJcbiAgICB9XHJcbiAgICBpZiAoZWwgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGVsLmhhc0F0dHJpYnV0ZShcImRhdGEtdmFyaWFudFwiKSkge1xyXG4gICAgICAgIGNvbnN0IHZhcmlhbnQgPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXZhcmlhbnRcIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzaXRlLnZpZXcoKSBkYXRhLXZhcmlhbnQ9XCIsIHZhcmlhbnQpO1xyXG4gICAgICAgIGlmICh2YXJpYW50KSB7XHJcbiAgICAgICAgICAgIG1vZGVsW1widmFyaWFudFwiXSA9IHZhcmlhbnQ7XHJcbiAgICAgICAgICAgIG1vZGVsW1widXNlcm5hbWVcIl0gPSB1c2VyICE9PSBcIlwiID8gdXNlciA6IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdXNlcm5hbWVcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiZ2FtZUlkXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1nYW1laWRcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wid3BsYXllclwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtd3BsYXllclwiKTtcclxuICAgICAgICAgICAgbW9kZWxbXCJicGxheWVyXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1icGxheWVyXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImZlblwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtZmVuXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImJhc2VcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWJhc2VcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiaW5jXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1pbmNcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wic3RhdHVzXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1zdGF0dXNcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1widHZcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXR2XCIpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGgoJ2RpdiNwbGFjZWhvbGRlci5tYWluLXdyYXBwZXInLCBtb2RlbC52YXJpYW50ID8gcm91bmRWaWV3KG1vZGVsLCBoYW5kbGVyKSA6IGxvYmJ5Vmlldyhtb2RlbCwgaGFuZGxlcikpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbml0KCkge1xyXG4gICAgcmV0dXJuIHtob21lOiBcIlwiLCB1c2VybmFtZTogXCJcIiwgdmFyaWFudDogXCJcIiwgZ2FtZUlkOiAwLCB3cGxheWVyOiBcIlwiLCBicGxheWVyOiBcIlwiLCBmZW46IFwiXCIsIGJhc2U6IFwiXCIsIGluYzogXCJcIiwgc2Vla3M6IFtdLCB0djogXCJcIiwgc3RhdHVzOiBcIlwifTtcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlKG1vZGVsLCBhY3Rpb24pIHtcclxuICAgIHJldHVybiBhY3Rpb24udHlwZSA9PT0gQUNDRVBUID9cclxuICAgICAgICB7aG9tZTogbW9kZWxbXCJob21lXCJdLCB1c2VybmFtZTogbW9kZWxbXCJ1c2VybmFtZVwiXSwgdmFyaWFudDogbW9kZWxbXCJ2YXJpYW50XCJdLCBnYW1lSWQ6IG1vZGVsW1wiZ2FtZUlkXCJdLCB3cGxheWVyOiBtb2RlbFtcIndwbGF5ZXJcIl0sIGJwbGF5ZXI6IG1vZGVsW1wiYnBsYXllclwiXSwgZmVuOiBtb2RlbFtcImZlblwiXSwgYmFzZTogbW9kZWxbXCJiYXNlXCJdLCBpbmM6IG1vZGVsW1wiaW5jXCJdLCBzZWVrczogW10sIHR2OiBtb2RlbFtcInR2XCJdLCBzdGF0dXM6IG1vZGVsW1wic3RhdHVzXCJdfVxyXG4gICAgICAgICAgICA6IGFjdGlvbi50eXBlID09PSBCQUNLID9cclxuICAgICAgICAgICAgICAgIHtob21lOiBtb2RlbFtcImhvbWVcIl0sIHVzZXJuYW1lOiBtb2RlbFtcInVzZXJuYW1lXCJdLCB2YXJpYW50OiBcIlwiLCBnYW1lSWQ6IDAsIHdwbGF5ZXI6IFwiXCIsIGJwbGF5ZXI6IFwiXCIsIGZlbjogXCJcIiwgYmFzZTogXCJcIiwgaW5jOiBcIlwiLCBzZWVrczogW10sIHR2OiBcIlwiLCBzdGF0dXM6IFwiXCJ9XHJcbiAgICAgICAgICAgICAgICA6IG1vZGVsO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7IHZpZXcsIGluaXQsIHVwZGF0ZSwgYWN0aW9uczogeyBBQ0NFUFQsIEJBQ0sgfSB9XHJcbiIsImNsYXNzIHNvdW5kcyB7XHJcbiAgICB0cmFja3M7XHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLnRyYWNrcyA9IHtcclxuICAgICAgICAgICAgR2VuZXJpY05vdGlmeTogeyBuYW1lOiAnR2VuZXJpY05vdGlmeScsIHF0eSA6IDEsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICAgICAgTW92ZTogeyBuYW1lOiAnTW92ZScsIHF0eSA6IDgsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICAgICAgQ2FwdHVyZTogeyBuYW1lOiAnQ2FwdHVyZScsIHF0eSA6IDQsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICAgICAgQ2hlY2s6IHsgbmFtZTogJ0NoZWNrJywgcXR5IDogMiwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBEcmF3OiB7IG5hbWU6ICdEcmF3JywgcXR5IDogMSwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBWaWN0b3J5OiB7IG5hbWU6ICdWaWN0b3J5JywgcXR5IDogMSwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBEZWZlYXQ6IHsgbmFtZTogJ0RlZmVhdCcsIHF0eSA6IDEsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMudHJhY2tzKS5mb3JFYWNoKGtleSA9PiB7XHJcbiAgICAgICAgICAgIGxldCB0eXBlID0gdGhpcy50cmFja3Nba2V5XTtcclxuICAgICAgICAgICAgdHlwZS5wb29sID0gdGhpcy5idWlsZE1hbnlTb3VuZHModHlwZS5uYW1lLCB0eXBlLnF0eSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBidWlsZE1hbnlTb3VuZHMgPSAoZmlsZSwgcXR5KSA9PiB7XHJcbiAgICAgICAgdmFyIHNvdW5kQXJyYXk6IEhUTUxBdWRpb0VsZW1lbnRbXSA9IFtdO1xyXG4gICAgICAgIHdoaWxlIChzb3VuZEFycmF5Lmxlbmd0aCA8IHF0eSkge1xyXG4gICAgICAgICAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYXVkaW9cIik7XHJcbiAgICAgICAgICAgIGlmIChlbC5jYW5QbGF5VHlwZSgnYXVkaW8vbXBlZycpKSB7XHJcbiAgICAgICAgICAgICAgICBlbC5zcmMgPSAnL3N0YXRpYy9zb3VuZC8nICsgZmlsZSArICcubXAzJztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGVsLnNyYyA9ICcvc3RhdGljL3NvdW5kLycgKyBmaWxlICsgJy5vZ2cnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsLnNldEF0dHJpYnV0ZShcInByZWxvYWRcIiwgXCJhdXRvXCIpO1xyXG4gICAgICAgICAgICBlbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgICAgIHNvdW5kQXJyYXkucHVzaChlbCk7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc291bmRBcnJheTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFNvdW5kID0gKHR5cGUpID0+IHtcclxuICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy50cmFja3NbdHlwZV07XHJcbiAgICAgICAgdGFyZ2V0LmluZGV4ID0gKHRhcmdldC5pbmRleCArIDEpICUgdGFyZ2V0LnBvb2wubGVuZ3RoO1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiU09VTkQ6XCIsIHR5cGUsIHRhcmdldC5pbmRleCk7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldC5wb29sW3RhcmdldC5pbmRleF07XHJcbiAgICB9XHJcblxyXG4gICAgZ2VuZXJpY05vdGlmeSgpIHsgdGhpcy5nZXRTb3VuZCgnR2VuZXJpY05vdGlmeScpLnBsYXkoKTsgfTtcclxuICAgIG1vdmUoKSB7IHRoaXMuZ2V0U291bmQoJ01vdmUnKS5wbGF5KCk7IH07XHJcbiAgICBjYXB0dXJlKCkgeyB0aGlzLmdldFNvdW5kKCdDYXB0dXJlJykucGxheSgpOyB9O1xyXG4gICAgY2hlY2soKSB7IHRoaXMuZ2V0U291bmQoJ0NoZWNrJykucGxheSgpOyB9O1xyXG4gICAgZHJhdygpIHsgdGhpcy5nZXRTb3VuZCgnRHJhdycpLnBsYXkoKTsgfTtcclxuICAgIHZpY3RvcnkoKSB7IHRoaXMuZ2V0U291bmQoJ1ZpY3RvcnknKS5wbGF5KCk7IH07XHJcbiAgICBkZWZlYXQoKSB7IHRoaXMuZ2V0U291bmQoJ0RlZmVhdCcpLnBsYXkoKTsgfTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHNvdW5kID0gbmV3KHNvdW5kcyk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2hhbmdlQ1NTKGNzc0ZpbGUpIHtcclxuICAgIC8vIGNzcyBmaWxlIGluZGV4IGluIHRlbXBsYXRlLmh0bWxcclxuICAgIGNvbnN0IGNzc0xpbmtJbmRleCA9IDE7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcImxpbmtcIikuaXRlbShjc3NMaW5rSW5kZXgpIS5zZXRBdHRyaWJ1dGUoXCJocmVmXCIsIGNzc0ZpbGUpO1xyXG59XHJcbiIsImltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxuaW1wb3J0IGggZnJvbSAnc25hYmJkb20vaCc7XG5cbi8vIFRPRE86IGNyZWF0ZSBsb2dvdXQgYnV0dG9uIHdoZW4gbG9nZ2VkIGluXG4vKlxuZnVuY3Rpb24gbG9naW4oaG9tZSkge1xuICAgIGNvbnNvbGUubG9nKFwiTE9HSU4gV0lUSCBMSUNIRVNTXCIpO1xuICAgIHdpbmRvdy5sb2NhdGlvbi5hc3NpZ24oaG9tZSArICcvbG9naW4nKTtcbn07XG4qL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclVzZXJuYW1lKGhvbWUsIHVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coXCJyZW5kZXJVc2VybmFtZSgpXCIsIHVzZXJuYW1lLCBob21lKTtcbiAgICB2YXIgb2xkVk5vZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndXNlcm5hbWUnKTtcbiAgICBpZiAob2xkVk5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgIG9sZFZOb2RlLmlubmVySFRNTCA9ICcnO1xuICAgICAgICBwYXRjaChvbGRWTm9kZSBhcyBIVE1MRWxlbWVudCwgaCgnZGl2I3VzZXJuYW1lJywgdXNlcm5hbWUpKTtcbiAgICB9O1xuLypcbiAgICAvLyBpZiB1c2VybmFtZSBpcyBub3QgYSBsb2dnZWQgaW4gbmFtZSBsb2dpbiBlbHNlIGxvZ291dCBidXR0b25cbiAgICB2YXIgb2xkVk5vZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9naW4nKTtcbiAgICBpZiAob2xkVk5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgIG9sZFZOb2RlLmlubmVySFRNTCA9ICcnO1xuICAgICAgICBwYXRjaChvbGRWTm9kZSBhcyBIVE1MRWxlbWVudCwgaCgnYnV0dG9uJywgeyBvbjogeyBjbGljazogKCkgPT4gbG9naW4oaG9tZSkgfSwgcHJvcHM6IHt0aXRsZTogJ0xvZ2luIHdpdGggTGljaGVzcyd9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1zaWduLWluXCI6IHRydWV9IH0gKSwgXSkpO1xuICAgIH07XG4qL1xufVxuIl19
