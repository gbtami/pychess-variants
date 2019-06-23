(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.PychessVariants = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var util = require("./util");
function anim(mutation, state) {
    return state.animation.enabled ? animate(mutation, state) : render(mutation, state);
}
exports.anim = anim;
function render(mutation, state) {
    var result = mutation(state);
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
    return pieces.sort(function (p1, p2) {
        return util.distanceSq(piece.pos, p1.pos) - util.distanceSq(piece.pos, p2.pos);
    })[0];
}
function computePlan(prevPieces, current) {
    var firstRankIs0 = current.dimensions.height === 10;
    var anims = {}, animedOrigs = [], fadings = {}, missings = [], news = [], prePieces = {};
    var curP, preP, i, vector;
    for (i in prevPieces) {
        prePieces[i] = makePiece(i, prevPieces[i], firstRankIs0);
    }
    for (var _i = 0, _a = util.allKeys[current.geometry]; _i < _a.length; _i++) {
        var key = _a[_i];
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
    news.forEach(function (newP) {
        preP = closer(newP, missings.filter(function (p) { return util.samePiece(newP.piece, p.piece); }));
        if (preP) {
            vector = [preP.pos[0] - newP.pos[0], preP.pos[1] - newP.pos[1]];
            anims[newP.key] = vector.concat(vector);
            animedOrigs.push(preP.key);
        }
    });
    missings.forEach(function (p) {
        if (!util.containsX(animedOrigs, p.key))
            fadings[p.key] = p.piece;
    });
    return {
        anims: anims,
        fadings: fadings
    };
}
var perf = window.performance !== undefined ? window.performance : Date;
function step(state, now) {
    var cur = state.animation.current;
    if (cur === undefined) {
        if (!state.dom.destroyed)
            state.dom.redrawNow();
        return;
    }
    var rest = 1 - (now - cur.start) * cur.frequency;
    if (rest <= 0) {
        state.animation.current = undefined;
        state.dom.redrawNow();
    }
    else {
        var ease = easing(rest);
        for (var i in cur.plan.anims) {
            var cfg = cur.plan.anims[i];
            cfg[2] = cfg[0] * ease;
            cfg[3] = cfg[1] * ease;
        }
        state.dom.redrawNow(true);
        util.raf(function (now) {
            if (now === void 0) { now = perf.now(); }
            return step(state, now);
        });
    }
}
function animate(mutation, state) {
    var prevPieces = __assign({}, state.pieces);
    var result = mutation(state);
    var plan = computePlan(prevPieces, state);
    if (!isObjectEmpty(plan.anims) || !isObjectEmpty(plan.fadings)) {
        var alreadyRunning = state.animation.current && state.animation.current.start;
        state.animation.current = {
            start: perf.now(),
            frequency: 1 / state.animation.duration,
            plan: plan
        };
        if (!alreadyRunning)
            step(state, perf.now());
    }
    else {
        state.dom.redraw();
    }
    return result;
}
function isObjectEmpty(o) {
    for (var _ in o)
        return false;
    return true;
}
function easing(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

},{"./util":16}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var board = require("./board");
var fen_1 = require("./fen");
var config_1 = require("./config");
var anim_1 = require("./anim");
var drag_1 = require("./drag");
var explosion_1 = require("./explosion");
function start(state, redrawAll) {
    function toggleOrientation() {
        board.toggleOrientation(state);
        redrawAll();
    }
    ;
    return {
        set: function (config) {
            if (config.orientation && config.orientation !== state.orientation)
                toggleOrientation();
            (config.fen ? anim_1.anim : anim_1.render)(function (state) { return config_1.configure(state, config); }, state);
        },
        state: state,
        getFen: function () { return fen_1.write(state.pieces, state.geometry); },
        toggleOrientation: toggleOrientation,
        setPieces: function (pieces) {
            anim_1.anim(function (state) { return board.setPieces(state, pieces); }, state);
        },
        selectSquare: function (key, force) {
            if (key)
                anim_1.anim(function (state) { return board.selectSquare(state, key, force); }, state);
            else if (state.selected) {
                board.unselect(state);
                state.dom.redraw();
            }
        },
        move: function (orig, dest) {
            anim_1.anim(function (state) { return board.baseMove(state, orig, dest); }, state);
        },
        newPiece: function (piece, key) {
            anim_1.anim(function (state) { return board.baseNewPiece(state, piece, key); }, state);
        },
        playPremove: function () {
            if (state.premovable.current) {
                if (anim_1.anim(board.playPremove, state))
                    return true;
                state.dom.redraw();
            }
            return false;
        },
        playPredrop: function (validate) {
            if (state.predroppable.current) {
                var result = board.playPredrop(state, validate);
                state.dom.redraw();
                return result;
            }
            return false;
        },
        cancelPremove: function () {
            anim_1.render(board.unsetPremove, state);
        },
        cancelPredrop: function () {
            anim_1.render(board.unsetPredrop, state);
        },
        cancelMove: function () {
            anim_1.render(function (state) { board.cancelMove(state); drag_1.cancel(state); }, state);
        },
        stop: function () {
            anim_1.render(function (state) { board.stop(state); drag_1.cancel(state); }, state);
        },
        explode: function (keys) {
            explosion_1.default(state, keys);
        },
        setAutoShapes: function (shapes) {
            anim_1.render(function (state) { return state.drawable.autoShapes = shapes; }, state);
        },
        setShapes: function (shapes) {
            anim_1.render(function (state) { return state.drawable.shapes = shapes; }, state);
        },
        getKeyAtDomPos: function (pos) {
            return board.getKeyAtDomPos(pos, state.orientation === 'white', state.dom.bounds(), state.geometry);
        },
        redrawAll: redrawAll,
        dragNewPiece: function (piece, event, force) {
            drag_1.dragNewPiece(state, piece, event, force);
        },
        destroy: function () {
            board.stop(state);
            state.dom.unbind && state.dom.unbind();
            state.dom.destroyed = true;
        }
    };
}
exports.start = start;

},{"./anim":1,"./board":3,"./config":5,"./drag":6,"./explosion":9,"./fen":10}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
var premove_1 = require("./premove");
var cg = require("./types");
function callUserFunction(f) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    if (f)
        setTimeout(function () { return f.apply(void 0, args); }, 1);
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
    for (var key in pieces) {
        var piece = pieces[key];
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
        for (var k in state.pieces) {
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
    var pd = state.predroppable;
    if (pd.current) {
        pd.current = undefined;
        callUserFunction(pd.events.unset);
    }
}
exports.unsetPredrop = unsetPredrop;
function tryAutoCastle(state, orig, dest) {
    if (!state.autoCastle)
        return false;
    var king = state.pieces[orig];
    if (!king || king.role !== 'king')
        return false;
    var firstRankIs0 = state.dimensions.height === 10;
    var origPos = util_1.key2pos(orig, firstRankIs0);
    if (origPos[0] !== 5)
        return false;
    if (origPos[1] !== 1 && origPos[1] !== 8)
        return false;
    var destPos = util_1.key2pos(dest, firstRankIs0);
    var oldRookPos, newRookPos, newKingPos;
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
    var rook = state.pieces[oldRookPos];
    if (!rook || rook.role !== 'rook')
        return false;
    delete state.pieces[orig];
    delete state.pieces[oldRookPos];
    state.pieces[newKingPos] = king;
    state.pieces[newRookPos] = rook;
    return true;
}
function baseMove(state, orig, dest) {
    var origPiece = state.pieces[orig], destPiece = state.pieces[dest];
    if (orig === dest || !origPiece)
        return false;
    var captured = (destPiece && destPiece.color !== origPiece.color) ? destPiece : undefined;
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
    var result = baseMove(state, orig, dest);
    if (result) {
        state.movable.dests = undefined;
        state.turnColor = util_1.opposite(state.turnColor);
        state.animation.current = undefined;
    }
    return result;
}
function userMove(state, orig, dest) {
    if (canMove(state, orig, dest)) {
        var result = baseUserMove(state, orig, dest);
        if (result) {
            var holdTime = state.hold.stop();
            unselect(state);
            var metadata = {
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
        var piece = state.pieces[orig];
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
    var piece = state.pieces[orig];
    return !!piece && (state.movable.color === 'both' || (state.movable.color === piece.color &&
        state.turnColor === piece.color));
}
function canMove(state, orig, dest) {
    return orig !== dest && isMovable(state, orig) && (state.movable.free || (!!state.movable.dests && util_1.containsX(state.movable.dests[orig], dest)));
}
exports.canMove = canMove;
function canDrop(state, orig, dest) {
    var piece = state.pieces[orig];
    return !!piece && dest && (orig === dest || !state.pieces[dest]) && (state.movable.color === 'both' || (state.movable.color === piece.color &&
        state.turnColor === piece.color));
}
function isPremovable(state, orig) {
    var piece = state.pieces[orig];
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
    var piece = state.pieces[orig];
    var destPiece = state.pieces[dest];
    return !!piece && dest &&
        (!destPiece || destPiece.color !== state.movable.color) &&
        state.predroppable.enabled &&
        (piece.role !== 'pawn' || (dest[1] !== '1' && dest[1] !== '8')) &&
        state.movable.color === piece.color &&
        state.turnColor !== piece.color;
}
function isDraggable(state, orig) {
    var piece = state.pieces[orig];
    return !!piece && state.draggable.enabled && (state.movable.color === 'both' || (state.movable.color === piece.color && (state.turnColor === piece.color || state.premovable.enabled)));
}
exports.isDraggable = isDraggable;
function playPremove(state) {
    var move = state.premovable.current;
    if (!move)
        return false;
    var orig = move[0], dest = move[1];
    var success = false;
    if (canMove(state, orig, dest)) {
        var result = baseUserMove(state, orig, dest);
        if (result) {
            var metadata = { premove: true };
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
    var drop = state.predroppable.current, success = false;
    if (!drop)
        return false;
    if (validate(drop)) {
        var piece = {
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
    var bd = cg.dimensions[geom];
    var file = Math.ceil(bd.width * ((pos[0] - bounds.left) / bounds.width));
    if (!asWhite)
        file = bd.width + 1 - file;
    var rank = Math.ceil(bd.height - (bd.height * ((pos[1] - bounds.top) / bounds.height)));
    if (!asWhite)
        rank = bd.height + 1 - rank;
    return (file > 0 && file < bd.width + 1 && rank > 0 && rank < bd.height + 1) ? util_1.pos2key([file, rank], geom) : undefined;
}
exports.getKeyAtDomPos = getKeyAtDomPos;

},{"./premove":11,"./types":15,"./util":16}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var api_1 = require("./api");
var config_1 = require("./config");
var state_1 = require("./state");
var wrap_1 = require("./wrap");
var events = require("./events");
var render_1 = require("./render");
var svg = require("./svg");
var util = require("./util");
function Chessground(element, config) {
    var state = state_1.defaults();
    config_1.configure(state, config || {});
    function redrawAll() {
        var prevUnbind = state.dom && state.dom.unbind;
        element.classList.add('cg-wrap');
        var relative = state.viewOnly && !state.drawable.visible;
        var elements = wrap_1.default(element, state, relative);
        var bounds = util.memo(function () { return elements.board.getBoundingClientRect(); });
        var redrawNow = function (skipSvg) {
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
            relative: relative
        };
        state.drawable.prevSvgHash = '';
        redrawNow(false);
        events.bindBoard(state);
        if (!prevUnbind)
            state.dom.unbind = events.bindDocument(state, redrawAll);
        state.events.insert && state.events.insert(elements);
    }
    redrawAll();
    var api = api_1.start(state, redrawAll);
    return api;
}
exports.Chessground = Chessground;
;
function debounceRedraw(redrawNow) {
    var redrawing = false;
    return function () {
        if (redrawing)
            return;
        redrawing = true;
        util.raf(function () {
            redrawNow();
            redrawing = false;
        });
    };
}

},{"./api":2,"./config":5,"./events":8,"./render":12,"./state":13,"./svg":14,"./util":16,"./wrap":17}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var board_1 = require("./board");
var fen_1 = require("./fen");
var cg = require("./types");
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
        var rank_1 = state.movable.color === 'white' ? 1 : 8;
        var kingStartPos = 'e' + rank_1;
        var dests_1 = state.movable.dests[kingStartPos];
        var king = state.pieces[kingStartPos];
        if (!dests_1 || !king || king.role !== 'king')
            return;
        state.movable.dests[kingStartPos] = dests_1.filter(function (d) {
            return !((d === 'a' + rank_1) && dests_1.indexOf('c' + rank_1) !== -1) &&
                !((d === 'h' + rank_1) && dests_1.indexOf('g' + rank_1) !== -1);
        });
    }
}
exports.configure = configure;
;
function merge(base, extend) {
    for (var key in extend) {
        if (isObject(base[key]) && isObject(extend[key]))
            merge(base[key], extend[key]);
        else
            base[key] = extend[key];
    }
}
function isObject(o) {
    return typeof o === 'object';
}

},{"./board":3,"./fen":10,"./types":15}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var board = require("./board");
var util = require("./util");
var draw_1 = require("./draw");
var anim_1 = require("./anim");
function start(s, e) {
    if (e.button !== undefined && e.button !== 0)
        return;
    if (e.touches && e.touches.length > 1)
        return;
    if (e.type === 'touchstart')
        s.stats.touched = true;
    else if (e.type === 'mousedown' && s.stats.touched)
        return;
    var asWhite = s.orientation === 'white', bounds = s.dom.bounds(), position = util.eventPosition(e), orig = board.getKeyAtDomPos(position, asWhite, bounds, s.geometry);
    if (!orig)
        return;
    var piece = s.pieces[orig];
    var previouslySelected = s.selected;
    if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || (!piece || piece.color !== s.turnColor)))
        draw_1.clear(s);
    if (!e.touches || piece || previouslySelected || pieceCloseTo(s, position))
        e.preventDefault();
    var hadPremove = !!s.premovable.current;
    var hadPredrop = !!s.predroppable.current;
    s.stats.ctrlKey = e.ctrlKey;
    if (s.selected && board.canMove(s, s.selected, orig)) {
        anim_1.anim(function (state) { return board.selectSquare(state, orig); }, s);
    }
    else {
        board.selectSquare(s, orig);
    }
    var stillSelected = s.selected === orig;
    var element = pieceElementByKey(s, orig);
    var firstRankIs0 = s.dimensions.height === 10;
    if (piece && element && stillSelected && board.isDraggable(s, orig)) {
        var squareBounds = computeSquareBounds(orig, asWhite, bounds, s.dimensions);
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
        var ghost = s.dom.elements.ghost;
        if (ghost) {
            ghost.className = "ghost " + piece.color + " " + piece.role;
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
    var asWhite = s.orientation === 'white', bounds = s.dom.bounds(), radiusSq = Math.pow(bounds.width / 8, 2);
    for (var key in s.pieces) {
        var squareBounds = computeSquareBounds(key, asWhite, bounds, s.dimensions), center = [
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
    var key = 'a0';
    s.pieces[key] = piece;
    s.dom.redraw();
    var position = util.eventPosition(e), asWhite = s.orientation === 'white', bounds = s.dom.bounds(), squareBounds = computeSquareBounds(key, asWhite, bounds, s.dimensions);
    var rel = [
        (asWhite ? 0 : s.dimensions.width - 1) * squareBounds.width + bounds.left,
        (asWhite ? s.dimensions.height : -1) * squareBounds.height + bounds.top
    ];
    var firstRankIs0 = s.dimensions.height === 10;
    s.draggable.current = {
        orig: key,
        origPos: util.key2pos(key, firstRankIs0),
        piece: piece,
        rel: rel,
        epos: position,
        pos: [position[0] - rel[0], position[1] - rel[1]],
        dec: [-squareBounds.width / 2, -squareBounds.height / 2],
        started: true,
        element: function () { return pieceElementByKey(s, key); },
        originTarget: e.target,
        newPiece: true,
        force: force || false
    };
    processDrag(s);
}
exports.dragNewPiece = dragNewPiece;
function processDrag(s) {
    util.raf(function () {
        var cur = s.draggable.current;
        if (!cur)
            return;
        if (s.animation.current && s.animation.current.plan.anims[cur.orig])
            s.animation.current = undefined;
        var origPiece = s.pieces[cur.orig];
        if (!origPiece || !util.samePiece(origPiece, cur.piece))
            cancel(s);
        else {
            if (!cur.started && util.distanceSq(cur.epos, cur.rel) >= Math.pow(s.draggable.distance, 2))
                cur.started = true;
            if (cur.started) {
                if (typeof cur.element === 'function') {
                    var found = cur.element();
                    if (!found)
                        return;
                    cur.element = found;
                    cur.element.cgDragging = true;
                    cur.element.classList.add('dragging');
                }
                var asWhite = s.orientation === 'white', bounds = s.dom.bounds();
                cur.pos = [
                    cur.epos[0] - cur.rel[0],
                    cur.epos[1] - cur.rel[1]
                ];
                var translation = util.posToTranslateAbs(bounds, s.dimensions)(cur.origPos, asWhite);
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
    var cur = s.draggable.current;
    if (!cur)
        return;
    if (e.type === 'touchend' && cur && cur.originTarget !== e.target && !cur.newPiece) {
        s.draggable.current = undefined;
        return;
    }
    board.unsetPremove(s);
    board.unsetPredrop(s);
    var eventPos = util.eventPosition(e) || cur.epos;
    var dest = board.getKeyAtDomPos(eventPos, s.orientation === 'white', s.dom.bounds(), s.geometry);
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
    var cur = s.draggable.current;
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
    var e = s.dom.elements;
    if (e.ghost)
        util.setVisible(e.ghost, false);
}
function computeSquareBounds(key, asWhite, bounds, bd) {
    var firstRankIs0 = bd.height === 10;
    var pos = util.key2pos(key, firstRankIs0);
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
    var el = s.dom.elements.board.firstChild;
    while (el) {
        if (el.cgKey === key && el.tagName === 'PIECE')
            return el;
        el = el.nextSibling;
    }
    return undefined;
}

},{"./anim":1,"./board":3,"./draw":7,"./util":16}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var board_1 = require("./board");
var util_1 = require("./util");
var brushes = ['green', 'red', 'blue', 'yellow'];
function start(state, e) {
    if (e.touches && e.touches.length > 1)
        return;
    e.stopPropagation();
    e.preventDefault();
    e.ctrlKey ? board_1.unselect(state) : board_1.cancelMove(state);
    var position = util_1.eventPosition(e);
    var orig = board_1.getKeyAtDomPos(position, state.orientation === 'white', state.dom.bounds(), state.geometry);
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
    util_1.raf(function () {
        var cur = state.drawable.current;
        if (cur) {
            var mouseSq = board_1.getKeyAtDomPos(cur.pos, state.orientation === 'white', state.dom.bounds(), state.geometry);
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
    var cur = state.drawable.current;
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
    var a = e.shiftKey && util_1.isRightButton(e) ? 1 : 0;
    var b = e.altKey ? 2 : 0;
    return brushes[a + b];
}
function not(f) {
    return function (x) { return !f(x); };
}
function addShape(drawable, cur) {
    var sameShape = function (s) {
        return s.orig === cur.orig && s.dest === cur.dest;
    };
    var similar = drawable.shapes.filter(sameShape)[0];
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

},{"./board":3,"./util":16}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var drag = require("./drag");
var draw = require("./draw");
var util_1 = require("./util");
function bindBoard(s) {
    if (s.viewOnly)
        return;
    var boardEl = s.dom.elements.board, onStart = startDragOrDraw(s);
    boardEl.addEventListener('touchstart', onStart);
    boardEl.addEventListener('mousedown', onStart);
    if (s.disableContextMenu || s.drawable.enabled) {
        boardEl.addEventListener('contextmenu', function (e) { return e.preventDefault(); });
    }
}
exports.bindBoard = bindBoard;
function bindDocument(s, redrawAll) {
    var unbinds = [];
    if (!s.dom.relative && s.resizable) {
        var onResize = function () {
            s.dom.bounds.clear();
            util_1.raf(redrawAll);
        };
        unbinds.push(unbindable(document.body, 'chessground.resize', onResize));
    }
    if (!s.viewOnly) {
        var onmove_1 = dragOrDraw(s, drag.move, draw.move);
        var onend_1 = dragOrDraw(s, drag.end, draw.end);
        ['touchmove', 'mousemove'].forEach(function (ev) { return unbinds.push(unbindable(document, ev, onmove_1)); });
        ['touchend', 'mouseup'].forEach(function (ev) { return unbinds.push(unbindable(document, ev, onend_1)); });
        var onScroll = function () { return s.dom.bounds.clear(); };
        unbinds.push(unbindable(window, 'scroll', onScroll, { passive: true }));
        unbinds.push(unbindable(window, 'resize', onScroll, { passive: true }));
    }
    return function () { return unbinds.forEach(function (f) { return f(); }); };
}
exports.bindDocument = bindDocument;
function unbindable(el, eventName, callback, options) {
    el.addEventListener(eventName, callback, options);
    return function () { return el.removeEventListener(eventName, callback); };
}
function startDragOrDraw(s) {
    return function (e) {
        if (s.draggable.current)
            drag.cancel(s);
        else if (s.drawable.current)
            draw.cancel(s);
        else if (e.shiftKey || util_1.isRightButton(e)) {
            if (s.drawable.enabled)
                draw.start(s, e);
        }
        else if (!s.viewOnly)
            drag.start(s, e);
    };
}
function dragOrDraw(s, withDrag, withDraw) {
    return function (e) {
        if (e.shiftKey || util_1.isRightButton(e)) {
            if (s.drawable.enabled)
                withDraw(s, e);
        }
        else if (!s.viewOnly)
            withDrag(s, e);
    };
}

},{"./drag":6,"./draw":7,"./util":16}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function explosion(state, keys) {
    state.exploding = {
        stage: 1,
        keys: keys
    };
    state.dom.redraw();
    setTimeout(function () {
        setStage(state, 2);
        setTimeout(function () { return setStage(state, undefined); }, 120);
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

},{}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
var cg = require("./types");
exports.initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
var roles8 = {
    p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king', m: 'met', f: 'ferz', s: 'silver', c: 'cancellor', a: 'archbishop', h: 'hawk', e: 'elephant'
};
var roles9 = {
    p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', k: 'king', g: 'gold', s: 'silver', l: 'lance'
};
var roles10 = {
    p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', k: 'king', c: 'cannon', a: 'advisor'
};
var letters8 = {
    pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', queen: 'q', king: 'k', met: 'm', ferz: 'f', silver: 's', cancellor: 'c', archbishop: 'a', hawk: 'h', elephant: 'e'
};
var letters9 = {
    pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', king: 'k', gold: 'g', silver: 's', lance: 'l',
    ppawn: '+p', pknight: '+n', pbishop: '+b', prook: '+r', psilver: '+s', plance: '+l'
};
var letters10 = {
    pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', king: 'k', cannon: 'c', advisor: 'a'
};
function read(fen) {
    if (fen === 'start')
        fen = exports.initial;
    if (fen.indexOf('[') !== -1)
        fen = fen.slice(0, fen.indexOf('['));
    var pieces = {};
    var row = fen.split("/").length;
    var col = 0;
    var promoted = false;
    var roles = row === 10 ? roles10 : row === 9 ? roles9 : roles8;
    var firstRankIs0 = row === 10;
    var shogi = row === 9;
    for (var _i = 0, fen_1 = fen; _i < fen_1.length; _i++) {
        var c = fen_1[_i];
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
                var piece = pieces[cg.files[col] + cg.ranks[firstRankIs0 ? row : row + 1]];
                if (piece)
                    piece.promoted = true;
                break;
            default:
                var nb = c.charCodeAt(0);
                if (nb < 58)
                    col += (c === '0') ? 9 : nb - 48;
                else {
                    ++col;
                    var role = c.toLowerCase();
                    var piece_1 = {
                        role: roles[role],
                        color: (c === role ? shogi ? 'white' : 'black' : shogi ? 'black' : 'white')
                    };
                    if (promoted) {
                        piece_1.role = 'p' + piece_1.role;
                        piece_1.promoted = true;
                        promoted = false;
                    }
                    ;
                    if (shogi) {
                        pieces[cg.files[10 - col - 1] + cg.ranks[10 - row]] = piece_1;
                    }
                    else {
                        pieces[cg.files[col - 1] + cg.ranks[firstRankIs0 ? row - 1 : row]] = piece_1;
                    }
                    ;
                }
        }
    }
    return pieces;
}
exports.read = read;
function write(pieces, geom) {
    var height = cg.dimensions[geom].height;
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
    return util_1.invNRanks.map(function (y) { return util_1.NRanks.map(function (x) {
        var piece = pieces[util_1.pos2key([x, y], geom)];
        if (piece) {
            var letter = letters[piece.role];
            return piece.color === 'white' ? letter.toUpperCase() : letter;
        }
        else
            return '1';
    }).join(''); }).join('/').replace(/1{2,}/g, function (s) { return s.length.toString(); });
}
exports.write = write;

},{"./types":15,"./util":16}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util = require("./util");
var cg = require("./types");
function diff(a, b) {
    return Math.abs(a - b);
}
function pawn(color) {
    return function (x1, y1, x2, y2) { return diff(x1, x2) < 2 && (color === 'white' ? (y2 === y1 + 1 || (y1 <= 2 && y2 === (y1 + 2) && x1 === x2)) : (y2 === y1 - 1 || (y1 >= 7 && y2 === (y1 - 2) && x1 === x2))); };
}
var knight = function (x1, y1, x2, y2) {
    var xd = diff(x1, x2);
    var yd = diff(y1, y2);
    return (xd === 1 && yd === 2) || (xd === 2 && yd === 1);
};
var bishop = function (x1, y1, x2, y2) {
    return diff(x1, x2) === diff(y1, y2);
};
var rook = function (x1, y1, x2, y2) {
    return x1 === x2 || y1 === y2;
};
var queen = function (x1, y1, x2, y2) {
    return bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2);
};
function king(color, rookFiles, canCastle) {
    return function (x1, y1, x2, y2) { return (diff(x1, x2) < 2 && diff(y1, y2) < 2) || (canCastle && y1 === y2 && y1 === (color === 'white' ? 1 : 8) && ((x1 === 5 && (x2 === 3 || x2 === 7)) || util.containsX(rookFiles, x2))); };
}
var met = function (x1, y1, x2, y2) {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 1;
};
var archbishop = function (x1, y1, x2, y2) {
    return bishop(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
var cancellor = function (x1, y1, x2, y2) {
    return rook(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
function lance(color) {
    return function (x1, y1, x2, y2) { return (x2 === x1 && (color === 'white' ? y2 > y1 : y2 < y1)); };
}
function silver(color) {
    return function (x1, y1, x2, y2) { return (met(x1, y1, x2, y2) || (x1 === x2 && color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1)); };
}
function gold(color) {
    return function (x1, y1, x2, y2) { return (diff(x1, x2) < 2 && diff(y1, y2) < 2 && (color === 'white' ?
        !((x2 === x1 - 1 && y2 === y1 - 1) || (x2 === x1 + 1 && y2 === y1 - 1)) :
        !((x2 === x1 + 1 && y2 === y1 + 1) || (x2 === x1 - 1 && y2 === y1 + 1)))); };
}
function spawn(color) {
    return function (x1, y1, x2, y2) { return (x2 === x1 && color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1); };
}
function sknight(color) {
    return function (x1, y1, x2, y2) { return color === 'white' ?
        (y2 === y1 + 2 && x2 === x1 - 1 || y2 === y1 + 2 && x2 === x1 + 1) :
        (y2 === y1 - 2 && x2 === x1 - 1 || y2 === y1 - 2 && x2 === x1 + 1); };
}
var prook = function (x1, y1, x2, y2) {
    return rook(x1, y1, x2, y2) || (diff(x1, x2) < 2 && diff(y1, y2) < 2);
};
var pbishop = function (x1, y1, x2, y2) {
    return bishop(x1, y1, x2, y2) || (diff(x1, x2) < 2 && diff(y1, y2) < 2);
};
var sking = function (x1, y1, x2, y2) {
    return diff(x1, x2) < 2 && diff(y1, y2) < 2;
};
function xpawn(color) {
    return function (x1, y1, x2, y2) { return (x2 === x1 && color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1); };
}
var xbishop = function (x1, y1, x2, y2) {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 2;
};
var advisor = function (x1, y1, x2, y2) {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 1;
};
var xking = function (x1, y1, x2, y2) {
    return (x1 === x2 || y1 === y2) && diff(x1, x2) === 1;
};
function rookFilesOf(pieces, color, firstRankIs0) {
    return Object.keys(pieces).filter(function (key) {
        var piece = pieces[key];
        return piece && piece.color === color && piece.role === 'rook';
    }).map(function (key) { return util.key2pos(key, firstRankIs0)[0]; });
}
function premove(pieces, key, canCastle, geom) {
    var firstRankIs0 = cg.dimensions[geom].height === 10;
    var piece = pieces[key], pos = util.key2pos(key, firstRankIs0);
    var mobility;
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
    var allkeys = util.allKeys[geom];
    var pos2keyGeom = function (geom) { return (function (pos) { return util.pos2key(pos, geom); }); };
    var pos2key = pos2keyGeom(geom);
    var key2posRank0 = function (firstrank0) { return (function (key) { return util.key2pos(key, firstrank0); }); };
    var key2pos = key2posRank0(firstRankIs0);
    return allkeys.map(key2pos).filter(function (pos2) {
        return (pos[0] !== pos2[0] || pos[1] !== pos2[1]) && mobility(pos[0], pos[1], pos2[0], pos2[1]);
    }).map(pos2key);
}
exports.default = premove;
;

},{"./types":15,"./util":16}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
var util = require("./util");
function render(s) {
    var firstRankIs0 = s.dimensions.height === 10;
    var asWhite = s.orientation === 'white', posToTranslate = s.dom.relative ? util.posToTranslateRel : util.posToTranslateAbs(s.dom.bounds(), s.dimensions), translate = s.dom.relative ? util.translateRel : util.translateAbs, boardEl = s.dom.elements.board, pieces = s.pieces, curAnim = s.animation.current, anims = curAnim ? curAnim.plan.anims : {}, fadings = curAnim ? curAnim.plan.fadings : {}, curDrag = s.draggable.current, squares = computeSquareClasses(s), samePieces = {}, sameSquares = {}, movedPieces = {}, movedSquares = {}, piecesKeys = Object.keys(pieces);
    var k, p, el, pieceAtKey, elPieceName, anim, fading, pMvdset, pMvd, sMvdset, sMvd;
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
                    var pos = util_1.key2pos(k, firstRankIs0);
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
            var cn = el.className;
            if (squares[k] === cn)
                sameSquares[k] = true;
            else if (movedSquares[cn])
                movedSquares[cn].push(el);
            else
                movedSquares[cn] = [el];
        }
        el = el.nextSibling;
    }
    for (var sk in squares) {
        if (!sameSquares[sk]) {
            sMvdset = movedSquares[squares[sk]];
            sMvd = sMvdset && sMvdset.pop();
            var translation = posToTranslate(util_1.key2pos(sk, firstRankIs0), asWhite, s.dimensions);
            if (sMvd) {
                sMvd.cgKey = sk;
                translate(sMvd, translation);
            }
            else {
                var squareNode = util_1.createEl('square', squares[sk]);
                squareNode.cgKey = sk;
                translate(squareNode, translation);
                boardEl.insertBefore(squareNode, boardEl.firstChild);
            }
        }
    }
    for (var j in piecesKeys) {
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
                var pos = util_1.key2pos(k, firstRankIs0);
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
                var pieceName = pieceNameOf(p), pieceNode = util_1.createEl('piece', pieceName), pos = util_1.key2pos(k, firstRankIs0);
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
    for (var i in movedPieces)
        removeNodes(s, movedPieces[i]);
    for (var i in movedSquares)
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
    for (var i in nodes)
        s.dom.elements.board.removeChild(nodes[i]);
}
function posZIndex(pos, asWhite) {
    var z = 2 + (pos[1] - 1) * 8 + (8 - pos[0]);
    if (asWhite)
        z = 67 - z;
    return z + '';
}
function pieceNameOf(piece) {
    return piece.color + " " + piece.role;
}
function computeSquareClasses(s) {
    var squares = {};
    var i, k;
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
            var dests = s.movable.dests && s.movable.dests[s.selected];
            if (dests)
                for (i in dests) {
                    k = dests[i];
                    addSquare(squares, k, 'move-dest' + (s.pieces[k] ? ' oc' : ''));
                }
            var pDests = s.premovable.dests;
            if (pDests)
                for (i in pDests) {
                    k = pDests[i];
                    addSquare(squares, k, 'premove-dest' + (s.pieces[k] ? ' oc' : ''));
                }
        }
    }
    var premove = s.premovable.current;
    if (premove)
        for (i in premove)
            addSquare(squares, premove[i], 'current-premove');
    else if (s.predroppable.current)
        addSquare(squares, s.predroppable.current.key, 'current-premove');
    var o = s.exploding;
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

},{"./util":16}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fen = require("./fen");
var util_1 = require("./util");
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
        selectable: {
            enabled: true
        },
        stats: {
            dragged: !('ontouchstart' in window),
            touched: false
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

},{"./fen":10,"./util":16}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
function createElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
exports.createElement = createElement;
function renderSvg(state, root) {
    var d = state.drawable, curD = d.current, cur = curD && curD.mouseSq ? curD : undefined, arrowDests = {};
    d.shapes.concat(d.autoShapes).concat(cur ? [cur] : []).forEach(function (s) {
        if (s.dest)
            arrowDests[s.dest] = (arrowDests[s.dest] || 0) + 1;
    });
    var shapes = d.shapes.concat(d.autoShapes).map(function (s) {
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
    var fullHash = shapes.map(function (sc) { return sc.hash; }).join('');
    if (fullHash === state.drawable.prevSvgHash)
        return;
    state.drawable.prevSvgHash = fullHash;
    var defsEl = root.firstChild;
    syncDefs(d, shapes, defsEl);
    syncShapes(state, shapes, d.brushes, arrowDests, root, defsEl);
}
exports.renderSvg = renderSvg;
function syncDefs(d, shapes, defsEl) {
    var brushes = {};
    var brush;
    shapes.forEach(function (s) {
        if (s.shape.dest) {
            brush = d.brushes[s.shape.brush];
            if (s.shape.modifiers)
                brush = makeCustomBrush(brush, s.shape.modifiers);
            brushes[brush.key] = brush;
        }
    });
    var keysInDom = {};
    var el = defsEl.firstChild;
    while (el) {
        keysInDom[el.getAttribute('cgKey')] = true;
        el = el.nextSibling;
    }
    for (var key in brushes) {
        if (!keysInDom[key])
            defsEl.appendChild(renderMarker(brushes[key]));
    }
}
function syncShapes(state, shapes, brushes, arrowDests, root, defsEl) {
    var bounds = state.dom.bounds(), hashesInDom = {}, toRemove = [];
    shapes.forEach(function (sc) { hashesInDom[sc.hash] = false; });
    var el = defsEl.nextSibling, elHash;
    while (el) {
        elHash = el.getAttribute('cgHash');
        if (hashesInDom.hasOwnProperty(elHash))
            hashesInDom[elHash] = true;
        else
            toRemove.push(el);
        el = el.nextSibling;
    }
    toRemove.forEach(function (el) { return root.removeChild(el); });
    shapes.forEach(function (sc) {
        if (!hashesInDom[sc.hash])
            root.appendChild(renderShape(state, sc, brushes, arrowDests, bounds));
    });
}
function shapeHash(_a, arrowDests, current) {
    var orig = _a.orig, dest = _a.dest, brush = _a.brush, piece = _a.piece, modifiers = _a.modifiers;
    return [current, orig, dest, brush, dest && arrowDests[dest] > 1,
        piece && pieceHash(piece),
        modifiers && modifiersHash(modifiers)
    ].filter(function (x) { return x; }).join('');
}
function pieceHash(piece) {
    return [piece.color, piece.role, piece.scale].filter(function (x) { return x; }).join('');
}
function modifiersHash(m) {
    return '' + (m.lineWidth || '');
}
function renderShape(state, _a, brushes, arrowDests, bounds) {
    var shape = _a.shape, current = _a.current, hash = _a.hash;
    var firstRankIs0 = state.dimensions.height === 10;
    var el;
    if (shape.piece)
        el = renderPiece(state.drawable.pieces.baseUrl, orient(util_1.key2pos(shape.orig, firstRankIs0), state.orientation, state.dimensions), shape.piece, bounds, state.dimensions);
    else {
        var orig = orient(util_1.key2pos(shape.orig, firstRankIs0), state.orientation, state.dimensions);
        if (shape.orig && shape.dest) {
            var brush = brushes[shape.brush];
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
    var o = pos2px(pos, bounds, bd), widths = circleWidth(bounds, bd), radius = (bounds.width / bd.width) / 2;
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
    var m = arrowMargin(bounds, shorten && !current, bd), a = pos2px(orig, bounds, bd), b = pos2px(dest, bounds, bd), dx = b[0] - a[0], dy = b[1] - a[1], angle = Math.atan2(dy, dx), xo = Math.cos(angle) * m, yo = Math.sin(angle) * m;
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
    var o = pos2px(pos, bounds, bd), width = bounds.width / bd.width * (piece.scale || 1), height = bounds.width / bd.height * (piece.scale || 1), name = piece.color[0] + (piece.role === 'knight' ? 'n' : piece.role[0]).toUpperCase();
    return setAttributes(createElement('image'), {
        className: piece.role + " " + piece.color,
        x: o[0] - width / 2,
        y: o[1] - height / 2,
        width: width,
        height: height,
        href: baseUrl + name + '.svg'
    });
}
function renderMarker(brush) {
    var marker = setAttributes(createElement('marker'), {
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
    for (var key in attrs)
        el.setAttribute(key, attrs[key]);
    return el;
}
function orient(pos, color, bd) {
    return color === 'white' ? pos : [bd.width + 1 - pos[0], bd.height + 1 - pos[1]];
}
function makeCustomBrush(base, modifiers) {
    var brush = {
        color: base.color,
        opacity: Math.round(base.opacity * 10) / 10,
        lineWidth: Math.round(modifiers.lineWidth || base.lineWidth)
    };
    brush.key = [base.key, modifiers.lineWidth].filter(function (x) { return x; }).join('');
    return brush;
}
function circleWidth(bounds, bd) {
    var base = bounds.width / (bd.width * 64);
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

},{"./util":16}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
exports.ranks = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
;
exports.dimensions = [{ width: 8, height: 8 }, { width: 9, height: 9 }, { width: 10, height: 8 }, { width: 9, height: 10 }];

},{}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var _a, _b, _c, _d;
var cg = require("./types");
exports.colors = ['white', 'black'];
exports.NRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
exports.invNRanks = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
var files8 = cg.files.slice(0, 8);
var files9 = cg.files.slice(0, 9);
var files10 = cg.files.slice(0, 10);
var ranks8 = cg.ranks.slice(1, 9);
var ranks9 = cg.ranks.slice(1, 10);
var ranks10 = cg.ranks.slice(0, 10);
var allKeys8x8 = (_a = Array.prototype).concat.apply(_a, files8.map(function (c) { return ranks8.map(function (r) { return c + r; }); }));
var allKeys9x9 = (_b = Array.prototype).concat.apply(_b, files9.map(function (c) { return ranks9.map(function (r) { return c + r; }); }));
var allKeys10x8 = (_c = Array.prototype).concat.apply(_c, files10.map(function (c) { return ranks8.map(function (r) { return c + r; }); }));
var allKeys9x10 = (_d = Array.prototype).concat.apply(_d, files9.map(function (c) { return ranks10.map(function (r) { return c + r; }); }));
exports.allKeys = [allKeys8x8, allKeys9x9, allKeys10x8, allKeys9x10];
function pos2key(pos, geom) {
    var bd = cg.dimensions[geom];
    return exports.allKeys[geom][bd.height * pos[0] + pos[1] - bd.height - 1];
}
exports.pos2key = pos2key;
function key2pos(k, firstRankIs0) {
    var shift = firstRankIs0 ? 1 : 0;
    return [k.charCodeAt(0) - 96, k.charCodeAt(1) - 48 + shift];
}
exports.key2pos = key2pos;
function memo(f) {
    var v;
    var ret = function () {
        if (v === undefined)
            v = f();
        return v;
    };
    ret.clear = function () { v = undefined; };
    return ret;
}
exports.memo = memo;
exports.timer = function () {
    var startAt;
    return {
        start: function () { startAt = Date.now(); },
        cancel: function () { startAt = undefined; },
        stop: function () {
            if (!startAt)
                return 0;
            var time = Date.now() - startAt;
            startAt = undefined;
            return time;
        }
    };
};
exports.opposite = function (c) { return c === 'white' ? 'black' : 'white'; };
function containsX(xs, x) {
    return xs !== undefined && xs.indexOf(x) !== -1;
}
exports.containsX = containsX;
exports.distanceSq = function (pos1, pos2) {
    return Math.pow(pos1[0] - pos2[0], 2) + Math.pow(pos1[1] - pos2[1], 2);
};
exports.samePiece = function (p1, p2) {
    return p1.role === p2.role && p1.color === p2.color;
};
var posToTranslateBase = function (pos, asWhite, xFactor, yFactor, bt) { return [
    (asWhite ? pos[0] - 1 : bt.width - pos[0]) * xFactor,
    (asWhite ? bt.height - pos[1] : pos[1] - 1) * yFactor
]; };
exports.posToTranslateAbs = function (bounds, bt) {
    var xFactor = bounds.width / bt.width, yFactor = bounds.height / bt.height;
    return function (pos, asWhite) { return posToTranslateBase(pos, asWhite, xFactor, yFactor, bt); };
};
exports.posToTranslateRel = function (pos, asWhite, bt) { return posToTranslateBase(pos, asWhite, 100 / bt.width, 100 / bt.height, bt); };
exports.translateAbs = function (el, pos) {
    el.style.transform = "translate(" + pos[0] + "px," + pos[1] + "px)";
};
exports.translateRel = function (el, percents) {
    el.style.left = percents[0] + '%';
    el.style.top = percents[1] + '%';
};
exports.setVisible = function (el, v) {
    el.style.visibility = v ? 'visible' : 'hidden';
};
exports.eventPosition = function (e) {
    if (e.clientX || e.clientX === 0)
        return [e.clientX, e.clientY];
    if (e.touches && e.targetTouches[0])
        return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return undefined;
};
exports.isRightButton = function (e) { return e.buttons === 2 || e.button === 2; };
exports.createEl = function (tagName, className) {
    var el = document.createElement(tagName);
    if (className)
        el.className = className;
    return el;
};
exports.raf = (window.requestAnimationFrame || window.setTimeout).bind(window);

},{"./types":15}],17:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
var types_1 = require("./types");
var svg_1 = require("./svg");
function wrap(element, s, relative) {
    element.innerHTML = '';
    element.classList.add('cg-wrap');
    util_1.colors.forEach(function (c) {
        element.classList.toggle('orientation-' + c, s.orientation === c);
    });
    element.classList.toggle('manipulable', !s.viewOnly);
    var helper = util_1.createEl('cg-helper');
    element.appendChild(helper);
    var container = util_1.createEl('cg-container');
    helper.appendChild(container);
    var extension = util_1.createEl('extension');
    container.appendChild(extension);
    var board = util_1.createEl('cg-board');
    container.appendChild(board);
    var svg;
    if (s.drawable.visible && !relative) {
        svg = svg_1.createElement('svg');
        svg.appendChild(svg_1.createElement('defs'));
        container.appendChild(svg);
    }
    if (s.coordinates) {
        var orientClass = s.orientation === 'black' ? ' black' : '';
        var firstRankIs0 = s.dimensions.height === 10;
        var shift = firstRankIs0 ? 0 : 1;
        container.appendChild(renderCoords(types_1.ranks.slice(shift, s.dimensions.height + shift), 'ranks' + orientClass));
        container.appendChild(renderCoords(types_1.files.slice(0, s.dimensions.width), 'files' + orientClass));
    }
    var ghost;
    if (s.draggable.showGhost && !relative) {
        ghost = util_1.createEl('piece', 'ghost');
        util_1.setVisible(ghost, false);
        container.appendChild(ghost);
    }
    return {
        board: board,
        container: container,
        ghost: ghost,
        svg: svg
    };
}
exports.default = wrap;
function renderCoords(elems, className) {
    var el = util_1.createEl('coords', className);
    var f;
    for (var i in elems) {
        f = util_1.createEl('coord');
        f.textContent = elems[i];
        el.appendChild(f);
    }
    return el;
}

},{"./svg":14,"./types":15,"./util":16}],18:[function(require,module,exports){
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

},{"./is":20,"./vnode":28}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.array = Array.isArray;
function primitive(s) {
    return typeof s === 'string' || typeof s === 'number';
}
exports.primitive = primitive;

},{}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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

},{}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
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

},{}],25:[function(require,module,exports){
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

},{"./h":18,"./htmldomapi":19,"./is":20,"./thunk":26,"./vnode":28}],26:[function(require,module,exports){
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

},{"./h":18}],27:[function(require,module,exports){
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

},{"./htmldomapi":19,"./vnode":28}],28:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function vnode(sel, data, children, text, elm) {
    var key = data === undefined ? undefined : data.key;
    return { sel: sel, data: data, children: children,
        text: text, elm: elm, key: key };
}
exports.vnode = vnode;
exports.default = vnode;

},{}],29:[function(require,module,exports){
function noop() {}

module.exports = function (url, opts) {
	opts = opts || {};

	var ws, num=0, $={};
	var max = opts.maxAttempts || Infinity;

	$.open = function () {
		ws = new WebSocket(url, opts.protocols || []);

		ws.onmessage = opts.onmessage || noop;

		ws.onopen = function (e) {
			(opts.onopen || noop)(e);
			num = 0;
		};

		ws.onclose = function (e) {
			e.code === 1e3 || e.code === 1005 || $.reconnect(e);
			(opts.onclose || noop)(e);
		};

		ws.onerror = function (e) {
			(e && e.code==='ECONNREFUSED') ? $.reconnect(e) : (opts.onerror || noop)(e);
		};
	};

	$.reconnect = function (e) {
		(num++ < max) ? setTimeout(function () {
			(opts.onreconnect || noop)(e);
			$.open();
		}, opts.timeout || 1e3) : (opts.onmaximum || noop)(e);
	};

	$.json = function (x) {
		ws.send(JSON.stringify(x));
	};

	$.send = function (x) {
		ws.send(x);
	};

	$.close = function (x, y) {
		ws.close(x || 1e3, y);
	};

	$.open(); // init

	return $;
}

},{}],30:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var h_1 = __importDefault(require("snabbdom/h"));
function chatView(ctrl, chatType) {
    function onKeyPress(e) {
        var message = e.target.value;
        if ((e.keyCode == 13 || e.which == 13) && message.length > 0) {
            ctrl.sock.send(JSON.stringify({ "type": chatType, "message": message, "gameId": ctrl.model["gameId"] }));
            e.target.value = "";
        }
    }
    return h_1.default("div." + chatType + "#" + chatType, { class: { "chat": true } }, [
        h_1.default("ol#" + chatType + "-messages", [h_1.default("div#messages")]),
        h_1.default('input#chat-entry', {
            props: {
                type: "text",
                name: "entry",
                autocomplete: "off",
                placeholder: "Please be nice in the chat!",
                maxlength: "140",
            },
            on: { keypress: function (e) { return onKeyPress(e); } },
        })
    ]);
}
exports.chatView = chatView;
function chatMessage(user, message, chatType) {
    var myDiv = document.getElementById(chatType + '-messages');
    // You must add border widths, padding and margins to the right.
    var isScrolled = myDiv.scrollTop == myDiv.scrollHeight - myDiv.offsetHeight;
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

},{"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],31:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("chessgroundx/util");
exports.variants = ["makruk", "sittuyin", "placement", "crazyhouse", "standard", "shogi", "xiangqi", "capablanca", "seirawan"];
exports.VARIANTS = {
    makruk: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "grid", pieces: "makruk", css: "makruk", icon: "u" },
    sittuyin: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "gridx", pieces: "makruk", css: "sittuyin", icon: "u" },
    shogi: { geom: 1 /* dim9x9 */, cg: "cg-576", board: "grid9x9", pieces: "shogi", css: "shogi0", icon: "u" },
    xiangqi: { geom: 3 /* dim9x10 */, cg: "cg-576-640", board: "river", pieces: "xiangqi", css: "xiangqi", icon: "u" },
    placement: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "standard", icon: "u" },
    crazyhouse: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "standard", icon: "G" },
    capablanca: { geom: 2 /* dim10x8 */, cg: "cg-640", board: "capablanca", pieces: "merida", css: "capablanca", icon: "u" },
    seirawan: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "seirawan", icon: "u" },
    standard: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "standard", icon: "u" },
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
    var xd = diff(pos1[0], pos2[0]);
    var yd = diff(pos1[1], pos2[1]);
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
    var parts = fen.split(" ");
    var placement = parts[0];
    var color = parts[1];
    var castl = parts[2];
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
    var bracketPos = placement.indexOf("[");
    var pockets = placement.slice(bracketPos);
    var ph = lc(pockets, "h", color === 'w') === 1;
    var pe = lc(pockets, "e", color === 'w') === 1;
    return [ph, pe];
}
exports.canGate = canGate;
function isPromotion(variant, piece, orig, dest, meta) {
    if (variant === 'xiangqi')
        return false;
    var pz = promotionZone(variant, piece.color);
    switch (variant) {
        case 'shogi':
            return piece.role !== "king" && piece.role !== 'gold' && (pz.indexOf(orig) !== -1 || pz.indexOf(dest) !== -1);
        case 'sittuyin':
            // See https://vdocuments.net/how-to-play-myanmar-traditional-chess-eng-book-1.html
            var firstRankIs0 = false;
            var dm = diagonalMove(util_1.key2pos(orig, firstRankIs0), util_1.key2pos(dest, firstRankIs0));
            return piece.role === "pawn" && (orig === dest || (!meta.captured && dm));
        default:
            return piece.role === "pawn" && pz.indexOf(dest) !== -1;
    }
}
exports.isPromotion = isPromotion;
function uci2usi(move) {
    var parts = move.split("");
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
    var parts = move.split("");
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

},{"chessgroundx/util":16}],32:[function(require,module,exports){
"use strict";
// https://stackoverflow.com/questions/20618355/the-simplest-possible-javascript-countdown-timer
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var Clock = /** @class */ (function () {
    // game baseTime (min) and increment (sec)
    function Clock(baseTime, increment, el) {
        var _this = this;
        this.start = function (duration) {
            if (_this.running)
                return;
            if (typeof duration !== "undefined")
                _this.duration = duration;
            _this.running = true;
            _this.startTime = Date.now();
            var that = _this;
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
        this.onTick = function (callback) {
            if (typeof callback === 'function') {
                _this.tickCallbacks.push(callback);
            }
            return _this;
        };
        this.onFlag = function (callback) {
            if (typeof callback === 'function') {
                _this.pause(false);
                _this.flagCallback = callback;
            }
            return _this;
        };
        this.pause = function (withIncrement) {
            if (!_this.running)
                return;
            _this.running = false;
            if (_this.timeout)
                clearTimeout(_this.timeout);
            _this.timeout = null;
            _this.duration -= Date.now() - _this.startTime;
            if (withIncrement && _this.increment)
                _this.duration += _this.increment;
            renderTime(_this, _this.duration);
        };
        this.setTime = function (millis) {
            _this.duration = millis;
            renderTime(_this, _this.duration);
        };
        this.parseTime = function (millis) {
            var minutes = Math.floor(millis / 60000);
            var seconds = (millis % 60000) / 1000;
            var secs, mins;
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
    return Clock;
}());
exports.Clock = Clock;
function renderTime(clock, time) {
    if (clock.granularity > 100 && time < 10000)
        clock.granularity = 100;
    var parsed = clock.parseTime(time);
    // console.log("renderTime():", time, parsed);
    var date = new Date(time);
    var millis = date.getUTCMilliseconds();
    clock.el = patch(clock.el, snabbdom_1.h('div.clock-wrap', [snabbdom_1.h('div.clock', [
            snabbdom_1.h('div.clock.time.min', { class: { running: clock.running, hurry: time < 10000, connecting: clock.connecting } }, parsed.minutes),
            snabbdom_1.h('div.clock.sep', { class: { running: clock.running, hurry: time < 10000, low: millis < 500, connecting: clock.connecting } }, ':'),
            snabbdom_1.h('div.clock.time.sec', { class: { running: clock.running, hurry: time < 10000, connecting: clock.connecting } }, parsed.seconds),
        ])]));
}
exports.renderTime = renderTime;

},{"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],33:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var sockette_1 = __importDefault(require("sockette"));
var snabbdom_1 = require("snabbdom");
var h_1 = require("snabbdom/h");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var util_1 = require("chessgroundx/util");
var chessgroundx_1 = require("chessgroundx");
var types_1 = require("chessgroundx/types");
var clock_1 = require("./clock");
var gating_1 = __importDefault(require("./gating"));
var promotion_1 = __importDefault(require("./promotion"));
var pocket_1 = require("./pocket");
var sound_1 = require("./sound");
var chess_1 = require("./chess");
var user_1 = require("./user");
var chat_1 = require("./chat");
var movelist_1 = require("./movelist");
var resize_1 = __importDefault(require("./resize"));
// import { ACCEPT, BACK} from './site';
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var RoundController = /** @class */ (function () {
    function RoundController(el, model, handler) {
        var _this = this;
        this.getGround = function () { return _this.chessground; };
        this.getDests = function () { return _this.dests; };
        this.setZoom = function (zoom) {
            var el = document.querySelector('.cg-wrap');
            if (el) {
                var baseWidth = types_1.dimensions[chess_1.VARIANTS[_this.variant].geom].width * (_this.variant === "shogi" ? 52 : 64);
                var baseHeight = types_1.dimensions[chess_1.VARIANTS[_this.variant].geom].height * (_this.variant === "shogi" ? 60 : 64);
                var pxw = zoom / 100 * baseWidth + "px";
                var pxh = zoom / 100 * baseHeight + "px";
                el.style.width = pxw;
                el.style.height = pxh;
                console.log("setZoom() HEIGHT=", pxh);
                document.body.setAttribute('style', '--cgwrapheight:' + pxh);
                var ev = document.createEvent('Event');
                ev.initEvent('chessground.resize', false, false);
                document.body.dispatchEvent(ev);
            }
        };
        this.onMsgGameStart = function (msg) {
            // console.log("got gameStart msg:", msg);
            if (msg.gameId !== _this.model["gameId"])
                return;
            if (!_this.spectator)
                sound_1.sound.genericNotify();
        };
        this.onMsgAcceptSeek = function (msg) {
            console.log("GameController.onMsgAcceptSeek()", _this.model["gameId"]);
            // this.evtHandler({ type: ACCEPT });
            window.location.assign(_this.model["home"] + '/' + msg["gameId"]);
        };
        this.rematch = function () {
            console.log("REMATCH");
            _this.doSend({ type: "rematch", gameId: _this.model["gameId"] });
            // window.location.assign(home);
        };
        this.newOpponent = function (home) {
            // this.evtHandler({ type: BACK });
            window.location.assign(home);
        };
        this.gameOver = function () {
            _this.gameControls = patch(_this.gameControls, h_1.h('div'));
            var container = document.getElementById('after-game');
            if (_this.spectator) {
                patch(container, h_1.h('div.after-game', [h_1.h('result', _this.result)]));
            }
            else {
                patch(container, h_1.h('div.after-game', [
                    h_1.h('result', _this.result),
                    h_1.h('button.rematch', { on: { click: function () { return _this.rematch(); } } }, "REMATCH"),
                    h_1.h('button.newopp', { on: { click: function () { return _this.newOpponent(_this.model["home"]); } } }, "NEW OPPONENT"),
                ]));
            }
        };
        this.checkStatus = function (msg) {
            if (msg.gameId !== _this.model["gameId"])
                return;
            if (msg.status >= 0) {
                _this.clocks[0].pause(false);
                _this.clocks[1].pause(false);
                _this.result = msg.result;
                switch (msg.result) {
                    case "1/2":
                        sound_1.sound.draw();
                        break;
                    case "1-0":
                        if (!_this.spectator) {
                            if (_this.mycolor === "white") {
                                sound_1.sound.victory();
                            }
                            else {
                                sound_1.sound.defeat();
                            }
                        }
                        break;
                    case "0-1":
                        if (!_this.spectator) {
                            if (_this.mycolor === "black") {
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
                _this.gameOver();
                var container = document.getElementById('under-board');
                patch(container, h_1.h('under-board', [h_1.h('textarea', { attrs: { rows: 13, cols: 80 } }, msg.pgn)]));
                if (_this.tv) {
                    // TODO: send msg to server instead and BACK with new model["gameId"] etc. got from answer
                    setTimeout(function () { window.location.assign(_this.model["home"] + '/tv'); }, 1000);
                }
            }
        };
        // change shogi piece colors according to board orientation
        this.setPieceColors = function (color) {
            if (color === "white") {
                sound_1.changeCSS('/static/shogi0.css', 1);
            }
            else {
                sound_1.changeCSS('/static/shogi1.css', 1);
            }
            ;
        };
        // In Capablanca we have to finelize castling because
        // chessground autoCastle works for standard chess only
        this.castleRook = function (kingDest, color) {
            var diff = {};
            if (kingDest === "c") {
                diff[color === 'white' ? "a1" : "a8"] = undefined;
                diff[color === 'white' ? "d1" : "d8"] = { color: color, role: "rook" };
                _this.chessground.setPieces(diff);
            }
            ;
            if (kingDest === "i") {
                diff[color === 'white' ? "j1" : "j8"] = undefined;
                diff[color === 'white' ? "h1" : "h8"] = { color: color, role: "rook" };
                _this.chessground.setPieces(diff);
            }
            ;
        };
        this.onMsgBoard = function (msg) {
            if (msg.gameId !== _this.model["gameId"])
                return;
            // Game aborted.
            if (msg["status"] === 0)
                return;
            // console.log("got board msg:", msg);
            _this.ply = msg.ply;
            _this.fullfen = msg.fen;
            _this.dests = msg.dests;
            var clocks = msg.clocks;
            var parts = msg.fen.split(" ");
            _this.turnColor = parts[1] === "w" ? "white" : "black";
            if (msg.steps.length > 1) {
                _this.steps = [];
                var container = document.getElementById('movelist');
                patch(container, h_1.h('div#movelist'));
                msg.steps.forEach(function (step) {
                    _this.steps.push(step);
                    movelist_1.updateMovelist(_this);
                });
            }
            else {
                if (msg.ply === _this.steps.length) {
                    var step = {
                        'fen': msg.fen,
                        'move': msg.lastMove[0] + msg.lastMove[1],
                        'check': msg.check,
                        'turnColor': _this.turnColor,
                        'san': msg.steps[0].san,
                    };
                    _this.steps.push(step);
                    movelist_1.updateMovelist(_this);
                }
            }
            _this.abortable = Number(parts[parts.length - 1]) <= 1;
            if (!_this.spectator && !_this.abortable && _this.result === "") {
                var container = document.getElementById('abort');
                patch(container, h_1.h('button#abort', { props: { disabled: true } }));
            }
            var lastMove = msg.lastMove;
            if (lastMove !== null && _this.variant === "shogi") {
                lastMove = chess_1.usi2uci(lastMove[0] + lastMove[1]);
                lastMove = [lastMove.slice(0, 2), lastMove.slice(2, 4)];
            }
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            if (lastMove !== null && lastMove[0][1] === '@')
                lastMove = [lastMove[1]];
            // save capture state before updating chessground
            var capture = lastMove !== null && _this.chessground.state.pieces[lastMove[1]];
            if (lastMove !== null && (_this.turnColor === _this.mycolor || _this.spectator)) {
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
            _this.checkStatus(msg);
            if (msg.check) {
                sound_1.sound.check();
            }
            var oppclock = !_this.flip ? 0 : 1;
            var myclock = 1 - oppclock;
            if (_this.spectator) {
                _this.chessground.set({
                    fen: parts[0],
                    turnColor: _this.turnColor,
                    check: msg.check,
                    lastMove: lastMove,
                });
                pocket_1.updatePockets(_this, _this.vpocket0, _this.vpocket1);
                _this.clocks[0].pause(false);
                _this.clocks[1].pause(false);
                _this.clocks[oppclock].setTime(clocks[_this.oppcolor]);
                _this.clocks[myclock].setTime(clocks[_this.mycolor]);
                if (!_this.abortable && msg.status < 0) {
                    if (_this.turnColor === _this.mycolor) {
                        _this.clocks[myclock].start();
                    }
                    else {
                        _this.clocks[oppclock].start();
                    }
                }
            }
            else {
                if (_this.turnColor === _this.mycolor) {
                    _this.chessground.set({
                        fen: parts[0],
                        turnColor: _this.turnColor,
                        movable: {
                            free: false,
                            color: _this.mycolor,
                            dests: msg.dests,
                        },
                        check: msg.check,
                        lastMove: lastMove,
                    });
                    pocket_1.updatePockets(_this, _this.vpocket0, _this.vpocket1);
                    _this.clocks[oppclock].pause(false);
                    _this.clocks[oppclock].setTime(clocks[_this.oppcolor]);
                    if (!_this.abortable && msg.status < 0) {
                        _this.clocks[myclock].start(clocks[_this.mycolor]);
                        console.log('MY CLOCK STARTED');
                    }
                    // console.log("trying to play premove....");
                    if (_this.premove)
                        _this.performPremove();
                    if (_this.predrop)
                        _this.performPredrop();
                }
                else {
                    _this.chessground.set({
                        turnColor: _this.turnColor,
                        premovable: {
                            dests: msg.dests,
                        },
                        check: msg.check,
                    });
                    _this.clocks[myclock].pause(false);
                    _this.clocks[myclock].setTime(clocks[_this.mycolor]);
                    if (!_this.abortable && msg.status < 0) {
                        _this.clocks[oppclock].start(clocks[_this.oppcolor]);
                        console.log('OPP CLOCK  STARTED');
                    }
                    if (_this.oppIsRandomBOT && msg.rm !== "") {
                        _this.doSend({ type: "move", gameId: _this.model["gameId"], move: msg.rm, clocks: clocks });
                    }
                    ;
                }
                ;
            }
            ;
        };
        this.goPly = function (ply) {
            var step = _this.steps[ply];
            // TODO: update pockets !!!
            _this.chessground.set({
                fen: step.fen,
                turnColor: step.turnColor,
                movable: {
                    free: false,
                    color: _this.spectator ? undefined : step.turnColor,
                    dests: _this.result === "" && ply === _this.steps.length - 1 ? _this.dests : undefined,
                },
                check: step.check,
                lastMove: step.move === undefined ? undefined : [step.move.slice(0, 2), step.move.slice(2, 4)],
            });
            // TODO: play sound if ply == this.ply + 1
            _this.ply = ply;
        };
        this.doSend = function (message) {
            console.log("---> doSend():", message);
            _this.sock.send(JSON.stringify(message));
        };
        this.sendMove = function (orig, dest, promo) {
            // pause() will add increment!
            var oppclock = !_this.flip ? 0 : 1;
            var myclock = 1 - oppclock;
            var movetime = (_this.clocks[myclock].running) ? Date.now() - _this.clocks[myclock].startTime : 0;
            _this.clocks[myclock].pause(true);
            // console.log("sendMove(orig, dest, prom)", orig, dest, promo);
            var uci_move = orig + dest + promo;
            var move = _this.variant === "shogi" ? chess_1.uci2usi(uci_move) : uci_move;
            // console.log("sendMove(move)", move);
            // TODO: if premoved, send 0 time
            var bclock, clocks;
            if (!_this.flip) {
                bclock = _this.mycolor === "black" ? 1 : 0;
            }
            else {
                bclock = _this.mycolor === "black" ? 0 : 1;
            }
            var wclock = 1 - bclock;
            clocks = { movetime: movetime, black: _this.clocks[bclock].duration, white: _this.clocks[wclock].duration };
            _this.doSend({ type: "move", gameId: _this.model["gameId"], move: move, clocks: clocks });
            if (!_this.abortable)
                _this.clocks[oppclock].start();
        };
        this.onMove = function () {
            return function (orig, dest, capturedPiece) {
                console.log("   ground.onMove()", orig, dest, capturedPiece);
                if (capturedPiece) {
                    sound_1.sound.capture();
                }
                else {
                    sound_1.sound.move();
                }
            };
        };
        this.onDrop = function () {
            return function (piece, dest) {
                // console.log("ground.onDrop()", piece, dest);
                if (dest != "a0" && piece.role) {
                    sound_1.sound.move();
                }
            };
        };
        this.setPremove = function (orig, dest, meta) {
            _this.premove = { orig: orig, dest: dest, meta: meta };
            console.log("setPremove() to:", orig, dest, meta);
        };
        this.unsetPremove = function () {
            _this.premove = null;
        };
        this.setPredrop = function (role, key) {
            _this.predrop = { role: role, key: key };
            console.log("setPredrop() to:", role, key);
        };
        this.unsetPredrop = function () {
            _this.predrop = null;
        };
        this.performPremove = function () {
            var _a = _this.premove, orig = _a.orig, dest = _a.dest, meta = _a.meta;
            // TODO: promotion?
            console.log("performPremove()", orig, dest, meta);
            _this.chessground.playPremove();
            _this.premove = null;
        };
        this.performPredrop = function () {
            var _a = _this.predrop, role = _a.role, key = _a.key;
            console.log("performPredrop()", role, key);
            _this.chessground.playPredrop(function (drop) { return pocket_1.dropIsValid(_this.dests, drop.role, drop.key); });
            _this.predrop = null;
        };
        this.onUserMove = function (orig, dest, meta) {
            // chessground doesn't knows about ep, so we have to remove ep captured pawn
            var pieces = _this.chessground.state.pieces;
            var geom = _this.chessground.state.geometry;
            console.log("ground.onUserMove()", orig, dest, meta, pieces);
            var moved = pieces[dest];
            var firstRankIs0 = _this.chessground.state.dimensions.height === 10;
            if (meta.captured === undefined && moved.role === "pawn" && orig[0] != dest[0] && chess_1.hasEp(_this.variant)) {
                var pos = util_1.key2pos(dest, firstRankIs0), pawnPos = [pos[0], pos[1] + (_this.mycolor === 'white' ? -1 : 1)];
                var diff = {};
                diff[util_1.pos2key(pawnPos, geom)] = undefined;
                _this.chessground.setPieces(diff);
                meta.captured = { role: "pawn" };
            }
            ;
            // increase pocket count
            if ((_this.variant === "crazyhouse" || _this.variant === "shogi") && meta.captured) {
                var role = meta.captured.role;
                if (meta.captured.promoted)
                    role = _this.variant === "shogi" ? meta.captured.role.slice(1) : "pawn";
                if (_this.flip) {
                    _this.pockets[0][role]++;
                    _this.vpocket0 = patch(_this.vpocket0, pocket_1.pocketView(_this, _this.mycolor, "top"));
                }
                else {
                    _this.pockets[1][role]++;
                    _this.vpocket1 = patch(_this.vpocket1, pocket_1.pocketView(_this, _this.mycolor, "bottom"));
                }
            }
            ;
            // chessground autoCastle works for standard chess only
            if (_this.variant === "capablanca" && moved.role === "king" && orig[0] === "f")
                _this.castleRook(dest[0], _this.mycolor);
            //  gating elephant/hawk
            if (_this.variant === "seirawan") {
                if (!_this.promotion.start(orig, dest, meta) && !_this.gating.start(_this.fullfen, orig, dest, meta))
                    _this.sendMove(orig, dest, '');
            }
            else {
                if (!_this.promotion.start(orig, dest, meta))
                    _this.sendMove(orig, dest, '');
            }
            ;
        };
        this.onUserDrop = function (role, dest) {
            // console.log("ground.onUserDrop()", role, dest);
            // decrease pocket count
            if (pocket_1.dropIsValid(_this.dests, role, dest)) {
                if (_this.flip) {
                    _this.pockets[0][role]--;
                    _this.vpocket0 = patch(_this.vpocket0, pocket_1.pocketView(_this, _this.mycolor, "top"));
                }
                else {
                    _this.pockets[1][role]--;
                    _this.vpocket1 = patch(_this.vpocket1, pocket_1.pocketView(_this, _this.mycolor, "bottom"));
                }
                _this.sendMove(chess_1.roleToSan[role] + "@", dest, '');
                // console.log("sent move", move);
            }
            else {
                var diff = {};
                diff[dest] = undefined;
                _this.chessground.setPieces(diff);
                console.log("!!! invalid move !!!", role, dest);
                // restore lastMove set by invalid drop
                _this.chessground.set({
                    lastMove: _this.lastmove,
                    turnColor: _this.mycolor,
                    movable: {
                        dests: _this.dests,
                        showDests: true,
                    },
                });
            }
        };
        // use this for sittuyin in place promotion ?
        // Or implement ondblclick handler to emit move in chessground?
        // https://www.w3schools.com/jsref/event_ondblclick.asp
        this.onChange = function (selected) {
            return function () {
                console.log("   ground.onChange()", selected);
            };
        };
        // use this for sittuyin in place promotion ?
        this.onSelect = function (selected) {
            return function (key) {
                console.log("   ground.onSelect()", key, selected);
                // If drop selection was set dropDests we have to restore dests here
                if (_this.chessground.state.movable.dests === undefined)
                    return;
                if (key != "a0" && "a0" in _this.chessground.state.movable.dests) {
                    _this.chessground.set({ movable: { dests: _this.dests } });
                }
                ;
            };
        };
        this.onMsgUserConnected = function (msg) {
            _this.model["username"] = msg["username"];
            user_1.renderUsername(_this.model["home"], _this.model["username"]);
            if (_this.spectator) {
                _this.doSend({ type: "is_user_online", username: _this.wplayer });
                _this.doSend({ type: "is_user_online", username: _this.bplayer });
                // we want to know lastMove and check status
                _this.doSend({ type: "board", gameId: _this.model["gameId"] });
            }
            else {
                var opp_name = _this.model["username"] === _this.wplayer ? _this.bplayer : _this.wplayer;
                _this.doSend({ type: "is_user_online", username: opp_name });
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));
                // prevent sending gameStart message when user just reconecting
                if (msg.ply === 0) {
                    _this.doSend({ type: "ready", gameId: _this.model["gameId"] });
                }
                _this.doSend({ type: "board", gameId: _this.model["gameId"] });
            }
        };
        this.onMsgUserOnline = function (msg) {
            console.log(msg);
            if (msg.username === _this.players[0]) {
                var container = document.getElementById('top-player');
                patch(container, h_1.h('i-side.online#top-player', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));
            }
            else {
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));
            }
        };
        this.onMsgUserDisconnected = function (msg) {
            console.log(msg);
            if (msg.username === _this.players[0]) {
                var container = document.getElementById('top-player');
                patch(container, h_1.h('i-side.online#top-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }));
            }
            else {
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }));
            }
        };
        this.onMsgChat = function (msg) {
            chat_1.chatMessage(msg.user, msg.message, "roundchat");
        };
        this.onMsgOffer = function (msg) {
            chat_1.chatMessage("", msg.message, "roundchat");
        };
        this.onMessage = function (evt) {
            console.log("<+++ onMessage():", evt.data);
            var msg = JSON.parse(evt.data);
            switch (msg.type) {
                case "board":
                    _this.onMsgBoard(msg);
                    break;
                case "gameEnd":
                    _this.checkStatus(msg);
                    break;
                case "gameStart":
                    _this.onMsgGameStart(msg);
                    break;
                case "game_user_connected":
                    _this.onMsgUserConnected(msg);
                    break;
                case "user_online":
                    _this.onMsgUserOnline(msg);
                    break;
                case "user_disconnected":
                    _this.onMsgUserDisconnected(msg);
                    break;
                case "roundchat":
                    _this.onMsgChat(msg);
                    break;
                case "accept_seek":
                    _this.onMsgAcceptSeek(msg);
                    break;
                case "offer":
                    _this.onMsgOffer(msg);
                    break;
            }
        };
        var onOpen = function (evt) {
            console.log("ctrl.onOpen()", evt);
            _this.clocks[0].connecting = false;
            _this.clocks[1].connecting = false;
            _this.doSend({ type: "game_user_connected", username: _this.model["username"], gameId: _this.model["gameId"] });
        };
        var opts = {
            maxAttempts: 10,
            onopen: function (e) { return onOpen(e); },
            onmessage: function (e) { return _this.onMessage(e); },
            onreconnect: function (e) {
                _this.clocks[0].connecting = true;
                _this.clocks[1].connecting = true;
                console.log('Reconnecting in round...', e);
                var container = document.getElementById('bottom-player');
                patch(container, h_1.h('i-side.online#bottom-player', { class: { "icon": true, "icon-online": false, "icon-offline": true } }));
            },
            onmaximum: function (e) { return console.log('Stop Attempting!', e); },
            onclose: function (e) { return console.log('Closed!', e); },
            onerror: function (e) { return console.log('Error:', e); },
        };
        try {
            this.sock = new sockette_1.default("ws://" + location.host + "/ws", opts);
        }
        catch (err) {
            this.sock = new sockette_1.default("wss://" + location.host + "/ws", opts);
        }
        this.model = model;
        this.evtHandler = handler;
        this.variant = model["variant"];
        this.fullfen = model["fen"];
        this.wplayer = model["wplayer"];
        this.bplayer = model["bplayer"];
        this.base = model["base"];
        this.inc = model["inc"];
        this.tv = model["tv"];
        this.steps = [];
        this.ply = 0;
        this.flip = false;
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
        this.oppIsRandomBOT = ((this.mycolor === "white" && this.bplayer === "Random-Mover") ||
            (this.mycolor === "black" && this.wplayer === "Random-Mover"));
        // players[0] is top player, players[1] is bottom player
        this.players = [
            this.mycolor === "white" ? this.bplayer : this.wplayer,
            this.mycolor === "white" ? this.wplayer : this.bplayer
        ];
        this.premove = null;
        this.predrop = null;
        this.result = "";
        var parts = this.fullfen.split(" ");
        this.abortable = Number(parts[parts.length - 1]) <= 1;
        var fen_placement = parts[0];
        this.turnColor = parts[1] === "w" ? "white" : "black";
        if (this.variant === "shogi") {
            this.setPieceColors(this.mycolor);
        }
        else {
            sound_1.changeCSS('/static/' + chess_1.VARIANTS[this.variant].css + '.css', 1);
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
                insert: function (elements) { resize_1.default(elements); }
            }
        });
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
            var pocket0 = document.getElementById('pocket0');
            var pocket1 = document.getElementById('pocket1');
            pocket_1.updatePockets(this, pocket0, pocket1);
        }
        // initialize clocks
        var c0 = new clock_1.Clock(this.base, this.inc, document.getElementById('clock0'));
        var c1 = new clock_1.Clock(this.base, this.inc, document.getElementById('clock1'));
        this.clocks = [c0, c1];
        this.clocks[0].onTick(clock_1.renderTime);
        this.clocks[1].onTick(clock_1.renderTime);
        var flagCallback = function () {
            if (_this.turnColor === _this.mycolor && !_this.spectator) {
                _this.chessground.stop();
                console.log("Flag");
                _this.doSend({ type: "flag", gameId: _this.model["gameId"] });
            }
        };
        this.clocks[1].onFlag(flagCallback);
        // TODO: add dark/light theme buttons (icon-sun-o/icon-moon-o)
        // TODO: add western pieces theme button for xiangqui, shogi, makruk, sittuyin
        // var container = document.getElementById('btn-flip') as HTMLElement;
        // patch(container, h('button', { on: { click: () => toggleOrientation() }, props: {title: 'Flip board'} }, [h('i', {class: {"icon": true, "icon-refresh": true} } ), ]));
        var container = document.getElementById('zoom');
        patch(container, h_1.h('input', {
            attrs: { width: '280px', type: 'range', value: 100, min: 50, max: 150 },
            on: { input: function (e) { _this.setZoom(parseFloat(e.target.value)); } }
        }));
        //const onResize = () => {console.log("onResize()");}
        //var elmnt = document.getElementById('cgwrap') as HTMLElement;
        //elmnt.addEventListener("resize", onResize);
        var abort = function () {
            // TODO: disable when ply > 2
            console.log("Abort");
            _this.doSend({ type: "abort", gameId: _this.model["gameId"] });
        };
        var draw = function () {
            console.log("Draw");
            _this.doSend({ type: "draw", gameId: _this.model["gameId"] });
        };
        var resign = function () {
            console.log("Resign");
            _this.doSend({ type: "resign", gameId: _this.model["gameId"] });
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
                h_1.h('button#abort', { on: { click: function () { return abort(); } }, props: { title: 'Abort' } }, [h_1.h('i', { class: { "icon": true, "icon-abort": true } }),]),
                h_1.h('button#draw', { on: { click: function () { return draw(); } }, props: { title: "Draw" } }, [h_1.h('i', { class: { "icon": true, "icon-hand-paper-o": true } }),]),
                h_1.h('button#resign', { on: { click: function () { return resign(); } }, props: { title: "Resign" } }, [h_1.h('i', { class: { "icon": true, "icon-flag-o": true } }),]),
            ]));
        }
        else {
            this.gameControls = patch(container, h_1.h('div'));
        }
        patch(document.getElementById('movelist'), movelist_1.movelistView(this));
        patch(document.getElementById('roundchat'), chat_1.chatView(this, "roundchat"));
    }
    return RoundController;
}());
exports.default = RoundController;

},{"./chat":30,"./chess":31,"./clock":32,"./gating":34,"./movelist":37,"./pocket":38,"./promotion":39,"./resize":40,"./sound":43,"./user":44,"chessgroundx":4,"chessgroundx/types":15,"chessgroundx/util":16,"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24,"sockette":29}],34:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var tovnode_1 = __importDefault(require("snabbdom/tovnode"));
var util_1 = require("chessgroundx/util");
var chess_1 = require("./chess");
var pocket_1 = require("./pocket");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, eventlisteners_1.default]);
function default_1(ctrl) {
    var gating = false;
    var roles = ["hawk", "elephant", ""];
    function start(fen, orig, dest, meta) {
        var ground = ctrl.getGround();
        var gatable = chess_1.canGate(fen, ground.state.pieces[dest], orig, dest, meta);
        if (gatable[0] || gatable[1]) {
            var color = ctrl.mycolor;
            var orientation_1 = ground.state.orientation;
            if (roles.includes("hawk") && !gatable[0])
                roles.splice(roles.indexOf("hawk"), 1);
            if (roles.includes("elephant") && !gatable[1])
                roles.splice(roles.indexOf("elephant"), 1);
            var origs = [orig];
            var castling = ground.state.pieces[dest].role === "king" && orig[0] === "e" && dest[0] !== "d" && dest[0] !== "e" && dest[0] !== "f";
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
            draw_gating(origs, color, orientation_1);
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
        var g = ctrl.getGround();
        var color = g.state.pieces[dest].color;
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
            var gated = role ? chess_1.roleToSan[role].toLowerCase() : "";
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
            insert: function (vnode) {
                vnode.elm.addEventListener(eventName, function (e) {
                    var res = f(e);
                    if (redraw)
                        redraw();
                    return res;
                });
            }
        };
    }
    function renderSquares(orig, color, orientation, index) {
        var firstRankIs0 = false;
        var left = (8 - util_1.key2pos(orig, firstRankIs0)[0]) * 12.5;
        if (orientation === "white")
            left = 87.5 - left;
        return roles.map(function (serverRole, i) {
            var top = (color === orientation ? 7 - i : i) * 12.5;
            return snabbdom_1.h("square", {
                attrs: { style: "top: " + top + "%;left: " + left + "%" },
                hook: bind("click", function (e) {
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
                insert: function (vnode) {
                    var el = vnode.elm;
                    el.addEventListener("click", function () { return cancel(); });
                    el.addEventListener("contextmenu", function (e) {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        }, squares);
    }
    return {
        start: start,
    };
}
exports.default = default_1;

},{"./chess":31,"./pocket":38,"chessgroundx/util":16,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/tovnode":27}],35:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var sockette_1 = __importDefault(require("sockette"));
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var h_1 = __importDefault(require("snabbdom/h"));
var user_1 = require("./user");
var chat_1 = require("./chat");
var chess_1 = require("./chess");
var site_1 = __importDefault(require("./site"));
exports.ADD = Symbol('Add');
exports.DELETE = Symbol('Delete');
exports.UPDATE = Symbol('Update');
exports.RESET = Symbol('Reset');
var LobbyController = /** @class */ (function () {
    function LobbyController(el, model, handler) {
        var _this = this;
        this.onMsgGetSeeks = function (msg) {
            _this.seeks = msg.seeks;
            // console.log("!!!! got get_seeks msg:", msg);
            var oldVNode = document.getElementById('seeks');
            if (oldVNode instanceof Element) {
                oldVNode.innerHTML = '';
                patch(oldVNode, h_1.default('table#seeks', _this.renderSeeks(msg.seeks)));
            }
        };
        this.onMsgAcceptSeek = function (msg) {
            _this.model["gameId"] = msg["gameId"];
            _this.model["variant"] = msg["variant"];
            _this.model["wplayer"] = msg["wplayer"];
            _this.model["bplayer"] = msg["bplayer"];
            _this.model["fen"] = msg["fen"];
            _this.model["base"] = msg["base"];
            _this.model["inc"] = msg["inc"];
            // console.log("LobbyController.onMsgAcceptSeek()", this.model["gameId"])
            _this.evtHandler({ type: site_1.default });
        };
        this.onMsgUserConnected = function (msg) {
            _this.model["username"] = msg["username"];
            user_1.renderUsername(_this.model["home"], _this.model["username"]);
        };
        this.onMsgChat = function (msg) {
            chat_1.chatMessage(msg.user, msg.message, "lobbychat");
        };
        this.onMsgPing = function (msg) {
            _this.doSend({ type: "pong", timestamp: msg.timestamp });
        };
        this.onMsgShutdown = function (msg) {
            alert(msg.message);
        };
        console.log("LobbyController constructor", el, model);
        this.model = model;
        this.evtHandler = handler;
        this.challengeAI = false;
        var onOpen = function (evt) {
            _this._ws = evt.target;
            console.log("---CONNECTED", evt);
            _this.doSend({ type: "lobby_user_connected", username: _this.model["username"] });
            _this.doSend({ type: "get_seeks" });
        };
        this._ws = { "readyState": -1 };
        var opts = {
            maxAttempts: 20,
            onopen: function (e) { return onOpen(e); },
            onmessage: function (e) { return _this.onMessage(e); },
            onreconnect: function (e) { return console.log('Reconnecting in lobby...', e); },
            onmaximum: function (e) { return console.log('Stop Attempting!', e); },
            onclose: function (e) { console.log('Closed!', e); },
            onerror: function (e) { return console.log('Error:', e); },
        };
        try {
            this.sock = new sockette_1.default("ws://" + location.host + "/ws", opts);
        }
        catch (err) {
            this.sock = new sockette_1.default("wss://" + location.host + "/ws", opts);
        }
        // get seeks when we are coming back after a game
        if (this._ws.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        }
        ;
        patch(document.getElementById('seekbuttons'), h_1.default('ul#seekbuttons', this.renderSeekButtons()));
        patch(document.getElementById('lobbychat'), chat_1.chatView(this, "lobbychat"));
    }
    LobbyController.prototype.doSend = function (message) {
        console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    };
    LobbyController.prototype.createSeekMsg = function (variant, color, fen, minutes, increment) {
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
    };
    LobbyController.prototype.createBotChallengeMsg = function (variant, color, fen, minutes, increment, level) {
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
    };
    LobbyController.prototype.isNewSeek = function (variant, color, fen, minutes, increment) {
        return !this.seeks.some(function (seek) {
            return seek.variant === variant && seek.fen === fen && seek.color === color && seek.tc === minutes + "+" + increment;
        });
    };
    LobbyController.prototype.createSeek = function (color) {
        document.getElementById('id01').style.display = 'none';
        var e;
        e = document.getElementById('variant');
        var variant = e.options[e.selectedIndex].value;
        e = document.getElementById('fen');
        var fen = e.value;
        e = document.getElementById('min');
        var minutes = parseInt(e.value);
        e = document.getElementById('inc');
        var increment = parseInt(e.value);
        if (this.challengeAI) {
            var form = document.getElementById('ailevel');
            var level = parseInt(form.elements['level'].value);
            this.createBotChallengeMsg(variant, color, fen, minutes, increment, level);
        }
        else {
            if (this.isNewSeek(variant, color, fen, minutes, increment)) {
                this.createSeekMsg(variant, color, fen, minutes, increment);
            }
        }
    };
    LobbyController.prototype.renderSeekButtons = function () {
        var _this = this;
        // TODO: save/restore selected values
        var setMinutes = function (minutes) {
            var el = document.getElementById("minutes");
            if (el)
                el.innerHTML = minutes;
        };
        var setIncrement = function (increment) {
            var el = document.getElementById("increment");
            if (el)
                el.innerHTML = increment;
        };
        return [
            h_1.default('div#id01', { class: { "modal": true } }, [
                h_1.default('form.modal-content', [
                    h_1.default('div#closecontainer', [
                        h_1.default('span.close', { on: { click: function () { return document.getElementById('id01').style.display = 'none'; } }, attrs: { 'data-icon': 'j' }, props: { title: "Cancel" } }),
                    ]),
                    h_1.default('div.container', [
                        h_1.default('label', { attrs: { for: "variant" } }, "Variant"),
                        h_1.default('select#variant', { props: { name: "variant" } }, chess_1.variants.map(function (variant) { return h_1.default('option', { props: { value: variant } }, variant); })),
                        h_1.default('label', { attrs: { for: "fen" } }, "Start position"),
                        h_1.default('input#fen', { props: { name: 'fen', placeholder: 'Paste the FEN text here' } }),
                        //h('label', { attrs: {for: "tc"} }, "Time Control"),
                        //h('select#timecontrol', { props: {name: "timecontrol"} }, [
                        //    h('option', { props: {value: "1", selected: true} }, "Real time"),
                        //    h('option', { props: {value: "2"} }, "Unlimited"),
                        //]),
                        h_1.default('label', { attrs: { for: "min" } }, "Minutes per side:"),
                        h_1.default('span#minutes'),
                        h_1.default('input#min', {
                            props: { name: "min", type: "range", min: 0, max: 180, value: 3 },
                            on: { input: function (e) { return setMinutes(e.target.value); } },
                            hook: { insert: function (vnode) { return setMinutes(vnode.elm.value); } },
                        }),
                        h_1.default('label', { attrs: { for: "inc" } }, "Increment in seconds:"),
                        h_1.default('span#increment'),
                        h_1.default('input#inc', {
                            props: { name: "inc", type: "range", min: 0, max: 180, value: 2 },
                            on: { input: function (e) { return setIncrement(e.target.value); } },
                            hook: { insert: function (vnode) { return setIncrement(vnode.elm.value); } },
                        }),
                        // if play with the machine
                        // A.I.Level (1-8 buttons)
                        h_1.default('form#ailevel', [
                            h_1.default('h4', "A.I. Level"),
                            h_1.default('div.radio-group', [
                                h_1.default('input#ai1', { props: { type: "radio", name: "level", value: "1", checked: "checked" } }),
                                h_1.default('label.level-ai.ai1', { attrs: { for: "ai1" } }, "1"),
                                h_1.default('input#ai2', { props: { type: "radio", name: "level", value: "2" } }),
                                h_1.default('label.level-ai.ai2', { attrs: { for: "ai2" } }, "2"),
                                h_1.default('input#ai3', { props: { type: "radio", name: "level", value: "3" } }),
                                h_1.default('label.level-ai.ai3', { attrs: { for: "ai3" } }, "3"),
                                h_1.default('input#ai4', { props: { type: "radio", name: "level", value: "4" } }),
                                h_1.default('label.level-ai.ai4', { attrs: { for: "ai4" } }, "4"),
                                h_1.default('input#ai5', { props: { type: "radio", name: "level", value: "5" } }),
                                h_1.default('label.level-ai.ai5', { attrs: { for: "ai5" } }, "5"),
                                h_1.default('input#ai6', { props: { type: "radio", name: "level", value: "6" } }),
                                h_1.default('label.level-ai.ai6', { attrs: { for: "ai6" } }, "6"),
                                h_1.default('input#ai7', { props: { type: "radio", name: "level", value: "7" } }),
                                h_1.default('label.level-ai.ai7', { attrs: { for: "ai7" } }, "7"),
                                h_1.default('input#ai8', { props: { type: "radio", name: "level", value: "8" } }),
                                h_1.default('label.level-ai.ai8', { attrs: { for: "ai8" } }, "8"),
                            ]),
                        ]),
                        h_1.default('div.button-group', [
                            h_1.default('button.icon.icon-black', { props: { type: "button", title: "Black" }, on: { click: function () { return _this.createSeek('b'); } } }),
                            h_1.default('button.icon.icon-adjust', { props: { type: "button", title: "Random" }, on: { click: function () { return _this.createSeek('r'); } } }),
                            h_1.default('button.icon.icon-white', { props: { type: "button", title: "White" }, on: { click: function () { return _this.createSeek('w'); } } }),
                        ]),
                    ]),
                ]),
            ]),
            h_1.default('button', { class: { 'lobby-button': true }, on: {
                    click: function () {
                        _this.challengeAI = false;
                        document.getElementById('ailevel').style.display = 'none';
                        document.getElementById('id01').style.display = 'block';
                    }
                } }, "Create a game"),
            h_1.default('button', { class: { 'lobby-button': true }, on: {
                    click: function () {
                        _this.challengeAI = true;
                        document.getElementById('ailevel').style.display = 'inline-block';
                        document.getElementById('id01').style.display = 'block';
                    }
                } }, "Play with the machine"),
        ];
    };
    LobbyController.prototype.onClickSeek = function (seek) {
        if (seek["user"] === this.model["username"]) {
            this.doSend({ type: "delete_seek", seekID: seek["seekID"], player: this.model["username"] });
        }
        else {
            this.doSend({ type: "accept_seek", seekID: seek["seekID"], player: this.model["username"] });
        }
    };
    LobbyController.prototype.renderSeeks = function (seeks) {
        var _this = this;
        // TODO: fix header and data row colomns
        // https://stackoverflow.com/questions/37272331/html-table-with-fixed-header-and-footer-and-scrollable-body-without-fixed-widths
        var header = h_1.default('thead', [h_1.default('tr', [h_1.default('th', 'Player'), h_1.default('th', 'Color'), h_1.default('th', 'Rating'), h_1.default('th', 'Time'), h_1.default('th', 'Variant'), h_1.default('th', 'Mode')])]);
        var rows = seeks.map(function (seek) { return h_1.default('tr', { on: { click: function () { return _this.onClickSeek(seek); } } }, [h_1.default('td', seek["user"]), h_1.default('td', seek["color"]), h_1.default('td', '1500?'), h_1.default('td', seek["tc"]), h_1.default('td', seek["variant"]), h_1.default('td', seek["rated"])]); });
        return [header, h_1.default('tbody', rows)];
    };
    LobbyController.prototype.onMessage = function (evt) {
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
    };
    return LobbyController;
}());
function runSeeks(vnode, model, handler) {
    var el = vnode.elm;
    var ctrl = new LobbyController(el, model, handler);
    console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}
function lobbyView(model, handler) {
    // console.log(".......lobbyView(model, handler)", model, handler);
    // Get the modal
    var modal = document.getElementById('id01');
    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };
    return [h_1.default('aside.sidebar-first', [h_1.default('div.lobbychat#lobbychat')]),
        h_1.default('main.main', [h_1.default('table#seeks', { hook: { insert: function (vnode) { return runSeeks(vnode, model, handler); } } })]),
        h_1.default('aside.sidebar-second', [h_1.default('ul#seekbuttons')]),
        h_1.default('under-left', "# of users"),
        h_1.default('under-lobby'),
        h_1.default('under-right'),
    ];
}
exports.lobbyView = lobbyView;

},{"./chat":30,"./chess":31,"./site":42,"./user":44,"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24,"sockette":29}],36:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var site_1 = __importDefault(require("./site"));
function main(initState, oldVnode, _a) {
    var view = _a.view, update = _a.update;
    // console.log(initState, oldVnode);
    var newVnode = view(initState, function (e) {
        var newState = update(initState, e);
        main(newState, newVnode, { view: view, update: update });
    });
    patch(oldVnode, newVnode);
}
main(site_1.default.init(), document.getElementById('placeholder'), site_1.default);

},{"./site":42,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],37:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var h_1 = __importDefault(require("snabbdom/h"));
var pocket_1 = require("./pocket");
var chess_1 = require("./chess");
function selectMove(ctrl, ply) {
    var active = document.querySelector('li.move.active');
    if (active)
        active.classList.remove('active');
    var elPly = document.querySelector("li.move[ply=\"" + ply + "\"]");
    if (elPly)
        elPly.classList.add('active');
    ctrl.goPly(ply);
    scrollToPly(ctrl);
}
function scrollToPly(ctrl) {
    if (ctrl.steps.length < 9)
        return;
    var movesEl = document.getElementById('moves');
    var st = undefined;
    var plyEl = movesEl.querySelector('li.move.active');
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
        var color = ctrl.chessground.state.orientation === "white" ? "white" : "black";
        ctrl.setPieceColors(color);
    }
    ;
    var name_tmp = ctrl.players[0];
    ctrl.players[0] = ctrl.players[1];
    ctrl.players[1] = name_tmp;
    console.log("FLIP");
    if (chess_1.needPockets(ctrl.variant)) {
        var tmp = ctrl.pockets[0];
        ctrl.pockets[0] = ctrl.pockets[1];
        ctrl.pockets[1] = tmp;
        ctrl.vpocket0 = patch(ctrl.vpocket0, pocket_1.pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocket_1.pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }
}
function movelistView(ctrl) {
    var container = document.getElementById('move-controls');
    ctrl.moveControls = patch(container, h_1.default('div.btn-controls', [
        h_1.default('button#flip-board', { on: { click: function () { return toggleOrientation(ctrl); } } }, [h_1.default('i', { props: { title: 'Flip board' }, class: { "icon": true, "icon-refresh": true } }),]),
        h_1.default('button#fastbackward', { on: { click: function () { return selectMove(ctrl, 0); } } }, [h_1.default('i', { class: { "icon": true, "icon-fast-backward": true } }),]),
        h_1.default('button#stepbackward', { on: { click: function () { return selectMove(ctrl, Math.max(ctrl.ply - 1, 0)); } } }, [h_1.default('i', { class: { "icon": true, "icon-step-backward": true } }),]),
        h_1.default('button#stepforward', { on: { click: function () { return selectMove(ctrl, Math.min(ctrl.ply + 1, ctrl.steps.length - 1)); } } }, [h_1.default('i', { class: { "icon": true, "icon-step-forward": true } }),]),
        h_1.default('button#fastforward', { on: { click: function () { return selectMove(ctrl, ctrl.steps.length - 1); } } }, [h_1.default('i', { class: { "icon": true, "icon-fast-forward": true } }),]),
    ]));
    return h_1.default('div#moves', [h_1.default('ol.movelist#movelist')]);
}
exports.movelistView = movelistView;
function updateMovelist(ctrl) {
    var container = document.getElementById('movelist');
    var ply = ctrl.steps.length - 1;
    var move = ctrl.steps[ply]['san'];
    var active = document.querySelector('li.move.active');
    if (active)
        active.classList.remove('active');
    var el = h_1.default('li.move', { class: { active: true }, attrs: { ply: ply }, on: { click: function () { return selectMove(ctrl, ply); } } }, move);
    if (ply % 2 == 0) {
        patch(container, h_1.default('ol.movelist#movelist', [el]));
    }
    else {
        patch(container, h_1.default('ol.movelist#movelist', [h_1.default('li.move.counter', (ply + 1) / 2), el]));
    }
    scrollToPly(ctrl);
}
exports.updateMovelist = updateMovelist;

},{"./chess":31,"./pocket":38,"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],38:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var drag_1 = require("chessgroundx/drag");
var chess_1 = require("./chess");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var eventNames = ['mousedown', 'touchstart'];
function pocketView(ctrl, color, position) {
    var pocket = ctrl.pockets[position === 'top' ? 0 : 1];
    var pieceRoles = Object.keys(pocket);
    return snabbdom_1.h('div.pocket.' + position, {
        class: { usable: true },
        hook: {
            insert: function (vnode) {
                eventNames.forEach(function (name) {
                    vnode.elm.addEventListener(name, function (e) {
                        if (position === (ctrl.flip ? 'top' : 'bottom'))
                            drag(ctrl, e);
                    });
                });
            }
        }
    }, pieceRoles.map(function (role) {
        var nb = pocket[role] || 0;
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
    var el = e.target, role = el.getAttribute('data-role'), color = el.getAttribute('data-color'), number = el.getAttribute('data-nb');
    if (!role || !color || number === '0')
        return;
    // Show possible drop dests on my turn only not to mess up predrop
    if (ctrl.turnColor === ctrl.mycolor) {
        var dropDests = { "a0": ctrl.dests[chess_1.roleToSan[role] + "@"] };
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
    drag_1.dragNewPiece(ctrl.chessground.state, { color: color, role: role }, e);
}
exports.drag = drag;
function dropIsValid(dests, role, key) {
    // console.log("dropDests:", dests, role, key)
    var drops = dests[chess_1.roleToSan[role] + "@"];
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
        var parts = ctrl.fullfen.split(" ");
        var fen_placement = parts[0];
        var pockets = "";
        var bracketPos = fen_placement.indexOf("[");
        if (bracketPos !== -1) {
            pockets = fen_placement.slice(bracketPos);
        }
        var c_1 = ctrl.mycolor[0];
        var o_1 = ctrl.oppcolor[0];
        var roles = chess_1.pocketRoles(ctrl.variant);
        var po = {};
        var pc = {};
        roles.forEach(function (role) { return pc[role] = chess_1.lc(pockets, chess_1.roleToSan[role].toLowerCase(), c_1 === (ctrl.variant === 'shogi' ? 'b' : 'w')); });
        roles.forEach(function (role) { return po[role] = chess_1.lc(pockets, chess_1.roleToSan[role].toLowerCase(), o_1 === (ctrl.variant === 'shogi' ? 'b' : 'w')); });
        if (ctrl.flip) {
            ctrl.pockets = [pc, po];
        }
        else {
            ctrl.pockets = [po, pc];
        }
        console.log(o_1, c_1, po, pc);
        ctrl.vpocket0 = patch(vpocket0, pocketView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(vpocket1, pocketView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }
}
exports.updatePockets = updatePockets;

},{"./chess":31,"chessgroundx/drag":6,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],39:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var tovnode_1 = __importDefault(require("snabbdom/tovnode"));
var util_1 = require("chessgroundx/util");
var chess_1 = require("./chess");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, eventlisteners_1.default]);
function default_1(ctrl) {
    var promoting = false;
    var roles = [];
    function start(orig, dest, meta) {
        var ground = ctrl.getGround();
        if (chess_1.isPromotion(ctrl.variant, ground.state.pieces[dest], orig, dest, meta)) {
            var color = ctrl.mycolor;
            var orientation_1 = ground.state.orientation;
            var movingRole = ground.state.pieces[dest].role;
            roles = chess_1.promotionRoles(ctrl.variant, movingRole);
            switch (ctrl.variant) {
                case "shogi":
                    if (chess_1.mandatoryPromotion(movingRole, dest, color)) {
                        promote(ground, dest, 'p' + ground.state.pieces[dest].role);
                        ctrl.sendMove(orig, dest, '+');
                    }
                    else {
                        draw_promo(dest, color, orientation_1);
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
                    draw_promo(dest, color, orientation_1);
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
            var promoted = promote(ctrl.getGround(), promoting.dest, role);
            var promo = ctrl.variant === "shogi" ? promoted ? "+" : "" : chess_1.roleToSan[role].toLowerCase();
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
            insert: function (vnode) {
                vnode.elm.addEventListener(eventName, function (e) {
                    var res = f(e);
                    if (redraw)
                        redraw();
                    return res;
                });
            }
        };
    }
    function renderPromotion(dest, color, orientation) {
        var dim = ctrl.getGround().state.dimensions;
        var firstRankIs0 = dim.height === 10;
        var left = (dim.width - util_1.key2pos(dest, firstRankIs0)[0]) * (100 / dim.width);
        if (orientation === "white")
            left = (100 / dim.width) * (dim.width - 1) - left;
        var vertical = color === orientation ? "top" : "bottom";
        return snabbdom_1.h("div#extension_choice." + vertical, {
            hook: {
                insert: function (vnode) {
                    var el = vnode.elm;
                    el.addEventListener("click", function () { return cancel(); });
                    el.addEventListener("contextmenu", function (e) {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        }, roles.map(function (serverRole, i) {
            var top = (color === orientation ? i : dim.height - 1 - i) * (100 / dim.height);
            return snabbdom_1.h("square", {
                attrs: { style: "top: " + top + "%;left: " + left + "%" },
                hook: bind("click", function (e) {
                    e.stopPropagation();
                    finish(serverRole);
                }, false)
            }, [snabbdom_1.h("piece." + serverRole + "." + color)]);
        }));
    }
    return {
        start: start,
    };
}
exports.default = default_1;

},{"./chess":31,"chessgroundx/util":16,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/tovnode":27}],40:[function(require,module,exports){
"use strict";
// http://jsfiddle.net/MissoulaLorenzo/gfn6ob3j/
// https://github.com/ornicar/lila/blob/master/ui/common/src/resize.ts
Object.defineProperty(exports, "__esModule", { value: true });
//export default function resizeHandle(els: cg.Elements, pref: number, ply: number) {
function resizeHandle(els) {
    //  if (!pref) return;
    if (true)
        return;
    var el = document.createElement('cg-resize');
    els.container.appendChild(el);
    var mousemoveEvent = 'mousemove';
    var mouseupEvent = 'mouseup';
    el.addEventListener('mousedown', function (start) {
        start.preventDefault();
        var startPos = eventPosition(start);
        var initialZoom = 100; //parseInt(getComputedStyle(document.body).getPropertyValue('--zoom'));
        var zoom = initialZoom;
        /*
            const saveZoom = window.lichess.debounce(() => {
              $.ajax({ method: 'post', url: '/pref/zoom?v=' + (100 + zoom) });
            }, 700);
        */
        var setZoom = function (zoom) {
            var el = document.querySelector('.cg-wrap');
            if (el) {
                //            const baseWidth = dimensions[VARIANTS[this.variant].geom].width * (this.variant === "shogi" ? 52 : 64);
                //            const baseHeight = dimensions[VARIANTS[this.variant].geom].height * (this.variant === "shogi" ? 60 : 64);
                var baseWidth = parseInt(document.defaultView.getComputedStyle(el).width || '', 10);
                var baseHeight = parseInt(document.defaultView.getComputedStyle(el).height || '', 10);
                console.log(baseWidth, baseHeight, zoom);
                var pxw = zoom / 100 * baseWidth + "px";
                var pxh = zoom / 100 * baseHeight + "px";
                el.style.width = pxw;
                el.style.height = pxh;
                var ev = document.createEvent('Event');
                ev.initEvent('chessground.resize', false, false);
                document.body.dispatchEvent(ev);
            }
        };
        var resize = function (move) {
            var pos = eventPosition(move);
            var delta = pos[0] - startPos[0] + pos[1] - startPos[1];
            zoom = Math.round(Math.min(150, Math.max(0, initialZoom + delta / 10)));
            //      document.body.setAttribute('style', '--zoom:' + zoom);
            //      window.lichess.dispatchEvent(window, 'resize');
            setZoom(zoom);
            //      saveZoom();
        };
        document.body.classList.add('resizing');
        document.addEventListener(mousemoveEvent, resize);
        document.addEventListener(mouseupEvent, function () {
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

},{}],41:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var ctrl_1 = __importDefault(require("./ctrl"));
var chess_1 = require("./chess");
function runGround(vnode, model, handler) {
    var el = vnode.elm;
    var ctrl = new ctrl_1.default(el, model, handler);
    var cg = ctrl.chessground;
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
            snabbdom_1.h("selection." + chess_1.VARIANTS[model["variant"]].board + "." + chess_1.VARIANTS[model["variant"]].pieces, [
                snabbdom_1.h("div.cg-wrap." + chess_1.VARIANTS[model["variant"]].cg, { hook: { insert: function (vnode) { return runGround(vnode, model, handler); } },
                }),
            ]),
        ]),
        snabbdom_1.h('aside.sidebar-second', [
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h("div." + chess_1.VARIANTS[model["variant"]].pieces, [
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
                snabbdom_1.h("div." + chess_1.VARIANTS[model["variant"]].pieces, [
                    snabbdom_1.h('div.cg-wrap.pocket', [
                        snabbdom_1.h('div#pocket1'),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#flip'),
            snabbdom_1.h('div#zoom'),
        ]),
        snabbdom_1.h('under-left', "Spectators"),
        snabbdom_1.h('div#under-board'),
    ];
}
exports.roundView = roundView;

},{"./chess":31,"./ctrl":33,"snabbdom":25}],42:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var h_1 = __importDefault(require("snabbdom/h"));
var lobby_1 = require("./lobby");
var round_1 = require("./round");
exports.ACCEPT = Symbol("Accept");
exports.BACK = Symbol('Back');
// model : {home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", base: "", inc: "", seeks: [seek], tv: ""}
function view(model, handler) {
    // console.log("site.view() model=", model)
    // http://stackoverflow.com/questions/1397329/how-to-remove-the-hash-from-window-location-with-javascript-without-page-refresh/5298684#5298684
    console.log("site.ts document.title=", document.title);
    console.log("site.ts window.location=", window.location);
    window.history.pushState({}, document.title, "/");
    var el = document.getElementById('pychess-variants');
    if (el instanceof Element && el.hasAttribute("data-home")) {
        model["home"] = el.getAttribute("data-home");
    }
    if (el instanceof Element && el.hasAttribute("data-variant")) {
        var variant = el.getAttribute("data-variant");
        console.log("site.view() data-variant=", variant);
        if (variant) {
            model["username"] = el.getAttribute("data-username");
            model["variant"] = variant;
            model["gameId"] = el.getAttribute("data-gameid");
            model["wplayer"] = el.getAttribute("data-wplayer");
            model["bplayer"] = el.getAttribute("data-bplayer");
            model["fen"] = el.getAttribute("data-fen");
            model["base"] = el.getAttribute("data-base");
            model["inc"] = el.getAttribute("data-inc");
            model["tv"] = el.getAttribute("data-tv");
        }
        ;
    }
    return h_1.default('div#placeholder.main-wrapper', model.variant ? round_1.roundView(model, handler) : lobby_1.lobbyView(model, handler));
}
exports.view = view;
function init() {
    return { home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "" };
}
function update(model, action) {
    return action.type === exports.ACCEPT ?
        { home: model["home"], username: model["username"], variant: model["variant"], gameId: model["gameId"], wplayer: model["wplayer"], bplayer: model["bplayer"], fen: model["fen"], base: model["base"], inc: model["inc"], seeks: [], tv: model["tv"] }
        : action.type === exports.BACK ?
            { home: model["home"], username: model["username"], variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "" }
            : model;
}
exports.default = { view: view, init: init, update: update, actions: { ACCEPT: exports.ACCEPT, BACK: exports.BACK } };

},{"./lobby":35,"./round":41,"snabbdom/h":18}],43:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var sounds = /** @class */ (function () {
    function sounds() {
        var _this = this;
        this.buildManySounds = function (file, qty) {
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
        this.getSound = function (type) {
            var target = _this.tracks[type];
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
        Object.keys(this.tracks).forEach(function (key) {
            var type = _this.tracks[key];
            type.pool = _this.buildManySounds(type.name, type.qty);
        });
    }
    sounds.prototype.genericNotify = function () { this.getSound('GenericNotify').play(); };
    ;
    sounds.prototype.move = function () { this.getSound('Move').play(); };
    ;
    sounds.prototype.capture = function () { this.getSound('Capture').play(); };
    ;
    sounds.prototype.check = function () { this.getSound('Check').play(); };
    ;
    sounds.prototype.draw = function () { this.getSound('Draw').play(); };
    ;
    sounds.prototype.victory = function () { this.getSound('Victory').play(); };
    ;
    sounds.prototype.defeat = function () { this.getSound('Defeat').play(); };
    ;
    return sounds;
}());
exports.sound = new (sounds);
function changeCSS(cssFile, cssLinkIndex) {
    document.getElementsByTagName("link").item(cssLinkIndex).setAttribute("href", cssFile);
}
exports.changeCSS = changeCSS;

},{}],44:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = __importDefault(require("snabbdom/modules/class"));
var attributes_1 = __importDefault(require("snabbdom/modules/attributes"));
var props_1 = __importDefault(require("snabbdom/modules/props"));
var eventlisteners_1 = __importDefault(require("snabbdom/modules/eventlisteners"));
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var h_1 = __importDefault(require("snabbdom/h"));
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

},{"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}]},{},[36])(36)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FuaW0uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FwaS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvYm9hcmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2NoZXNzZ3JvdW5kLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9jb25maWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYXcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2V2ZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvZXhwbG9zaW9uLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9mZW4uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3ByZW1vdmUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3JlbmRlci5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvc3RhdGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3N2Zy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvdHlwZXMuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3V0aWwuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3dyYXAuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vaC5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9odG1sZG9tYXBpLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL2lzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL2NsYXNzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vbW9kdWxlcy9wcm9wcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9zbmFiYmRvbS5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90aHVuay5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90b3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NvY2tldHRlL2Rpc3Qvc29ja2V0dGUuanMiLCJzcmMvY2hhdC50cyIsInNyYy9jaGVzcy50cyIsInNyYy9jbG9jay50cyIsInNyYy9jdHJsLnRzIiwic3JjL2dhdGluZy50cyIsInNyYy9sb2JieS50cyIsInNyYy9tYWluLnRzIiwic3JjL21vdmVsaXN0LnRzIiwic3JjL3BvY2tldC50cyIsInNyYy9wcm9tb3Rpb24udHMiLCJzcmMvcmVzaXplLnRzIiwic3JjL3JvdW5kLnRzIiwic3JjL3NpdGUudHMiLCJzcmMvc291bmQudHMiLCJzcmMvdXNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1VkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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RSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQzNHLE9BQU8sRUFBRSxFQUFFLElBQUksaUJBQWtCLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQ25ILFNBQVMsRUFBRSxFQUFFLElBQUksZ0JBQWlCLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQ2hILFVBQVUsRUFBRSxFQUFFLElBQUksZ0JBQWlCLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQ2pILFVBQVUsRUFBRSxFQUFFLElBQUksaUJBQWtCLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQ3pILFFBQVEsRUFBRSxFQUFFLElBQUksZ0JBQWlCLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQy9HLFFBQVEsRUFBRSxFQUFFLElBQUksZ0JBQWlCLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUs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R0FBRyxFQUFFLENBQUM7UUFDeEIsS0FBSyxDQUFDLFFBQXVCLEVBQUUsV0FBQyxDQUFDLGNBQWMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0tBQy9EO0lBQUEsQ0FBQztJQUNOOzs7Ozs7O01BT0U7QUFDRixDQUFDO0FBZkQsd0NBZUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBfX2Fzc2lnbiA9ICh0aGlzICYmIHRoaXMuX19hc3NpZ24pIHx8IGZ1bmN0aW9uICgpIHtcbiAgICBfX2Fzc2lnbiA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24odCkge1xuICAgICAgICBmb3IgKHZhciBzLCBpID0gMSwgbiA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHMgPSBhcmd1bWVudHNbaV07XG4gICAgICAgICAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkpXG4gICAgICAgICAgICAgICAgdFtwXSA9IHNbcF07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHQ7XG4gICAgfTtcbiAgICByZXR1cm4gX19hc3NpZ24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbn07XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiBhbmltKG11dGF0aW9uLCBzdGF0ZSkge1xuICAgIHJldHVybiBzdGF0ZS5hbmltYXRpb24uZW5hYmxlZCA/IGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSA6IHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpO1xufVxuZXhwb3J0cy5hbmltID0gYW5pbTtcbmZ1bmN0aW9uIHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpIHtcbiAgICB2YXIgcmVzdWx0ID0gbXV0YXRpb24oc3RhdGUpO1xuICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xufVxuZXhwb3J0cy5yZW5kZXIgPSByZW5kZXI7XG5mdW5jdGlvbiBtYWtlUGllY2Uoa2V5LCBwaWVjZSwgZmlyc3RSYW5rSXMwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHBvczogdXRpbC5rZXkycG9zKGtleSwgZmlyc3RSYW5rSXMwKSxcbiAgICAgICAgcGllY2U6IHBpZWNlXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGNsb3NlcihwaWVjZSwgcGllY2VzKSB7XG4gICAgcmV0dXJuIHBpZWNlcy5zb3J0KGZ1bmN0aW9uIChwMSwgcDIpIHtcbiAgICAgICAgcmV0dXJuIHV0aWwuZGlzdGFuY2VTcShwaWVjZS5wb3MsIHAxLnBvcykgLSB1dGlsLmRpc3RhbmNlU3EocGllY2UucG9zLCBwMi5wb3MpO1xuICAgIH0pWzBdO1xufVxuZnVuY3Rpb24gY29tcHV0ZVBsYW4ocHJldlBpZWNlcywgY3VycmVudCkge1xuICAgIHZhciBmaXJzdFJhbmtJczAgPSBjdXJyZW50LmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICB2YXIgYW5pbXMgPSB7fSwgYW5pbWVkT3JpZ3MgPSBbXSwgZmFkaW5ncyA9IHt9LCBtaXNzaW5ncyA9IFtdLCBuZXdzID0gW10sIHByZVBpZWNlcyA9IHt9O1xuICAgIHZhciBjdXJQLCBwcmVQLCBpLCB2ZWN0b3I7XG4gICAgZm9yIChpIGluIHByZXZQaWVjZXMpIHtcbiAgICAgICAgcHJlUGllY2VzW2ldID0gbWFrZVBpZWNlKGksIHByZXZQaWVjZXNbaV0sIGZpcnN0UmFua0lzMCk7XG4gICAgfVxuICAgIGZvciAodmFyIF9pID0gMCwgX2EgPSB1dGlsLmFsbEtleXNbY3VycmVudC5nZW9tZXRyeV07IF9pIDwgX2EubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgIHZhciBrZXkgPSBfYVtfaV07XG4gICAgICAgIGN1clAgPSBjdXJyZW50LnBpZWNlc1trZXldO1xuICAgICAgICBwcmVQID0gcHJlUGllY2VzW2tleV07XG4gICAgICAgIGlmIChjdXJQKSB7XG4gICAgICAgICAgICBpZiAocHJlUCkge1xuICAgICAgICAgICAgICAgIGlmICghdXRpbC5zYW1lUGllY2UoY3VyUCwgcHJlUC5waWVjZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgbWlzc2luZ3MucHVzaChwcmVQKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3cy5wdXNoKG1ha2VQaWVjZShrZXksIGN1clAsIGZpcnN0UmFua0lzMCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBuZXdzLnB1c2gobWFrZVBpZWNlKGtleSwgY3VyUCwgZmlyc3RSYW5rSXMwKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJlUClcbiAgICAgICAgICAgIG1pc3NpbmdzLnB1c2gocHJlUCk7XG4gICAgfVxuICAgIG5ld3MuZm9yRWFjaChmdW5jdGlvbiAobmV3UCkge1xuICAgICAgICBwcmVQID0gY2xvc2VyKG5ld1AsIG1pc3NpbmdzLmZpbHRlcihmdW5jdGlvbiAocCkgeyByZXR1cm4gdXRpbC5zYW1lUGllY2UobmV3UC5waWVjZSwgcC5waWVjZSk7IH0pKTtcbiAgICAgICAgaWYgKHByZVApIHtcbiAgICAgICAgICAgIHZlY3RvciA9IFtwcmVQLnBvc1swXSAtIG5ld1AucG9zWzBdLCBwcmVQLnBvc1sxXSAtIG5ld1AucG9zWzFdXTtcbiAgICAgICAgICAgIGFuaW1zW25ld1Aua2V5XSA9IHZlY3Rvci5jb25jYXQodmVjdG9yKTtcbiAgICAgICAgICAgIGFuaW1lZE9yaWdzLnB1c2gocHJlUC5rZXkpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgbWlzc2luZ3MuZm9yRWFjaChmdW5jdGlvbiAocCkge1xuICAgICAgICBpZiAoIXV0aWwuY29udGFpbnNYKGFuaW1lZE9yaWdzLCBwLmtleSkpXG4gICAgICAgICAgICBmYWRpbmdzW3Aua2V5XSA9IHAucGllY2U7XG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYW5pbXM6IGFuaW1zLFxuICAgICAgICBmYWRpbmdzOiBmYWRpbmdzXG4gICAgfTtcbn1cbnZhciBwZXJmID0gd2luZG93LnBlcmZvcm1hbmNlICE9PSB1bmRlZmluZWQgPyB3aW5kb3cucGVyZm9ybWFuY2UgOiBEYXRlO1xuZnVuY3Rpb24gc3RlcChzdGF0ZSwgbm93KSB7XG4gICAgdmFyIGN1ciA9IHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50O1xuICAgIGlmIChjdXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoIXN0YXRlLmRvbS5kZXN0cm95ZWQpXG4gICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHJlc3QgPSAxIC0gKG5vdyAtIGN1ci5zdGFydCkgKiBjdXIuZnJlcXVlbmN5O1xuICAgIGlmIChyZXN0IDw9IDApIHtcbiAgICAgICAgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3coKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBlYXNlID0gZWFzaW5nKHJlc3QpO1xuICAgICAgICBmb3IgKHZhciBpIGluIGN1ci5wbGFuLmFuaW1zKSB7XG4gICAgICAgICAgICB2YXIgY2ZnID0gY3VyLnBsYW4uYW5pbXNbaV07XG4gICAgICAgICAgICBjZmdbMl0gPSBjZmdbMF0gKiBlYXNlO1xuICAgICAgICAgICAgY2ZnWzNdID0gY2ZnWzFdICogZWFzZTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KHRydWUpO1xuICAgICAgICB1dGlsLnJhZihmdW5jdGlvbiAobm93KSB7XG4gICAgICAgICAgICBpZiAobm93ID09PSB2b2lkIDApIHsgbm93ID0gcGVyZi5ub3coKTsgfVxuICAgICAgICAgICAgcmV0dXJuIHN0ZXAoc3RhdGUsIG5vdyk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSB7XG4gICAgdmFyIHByZXZQaWVjZXMgPSBfX2Fzc2lnbih7fSwgc3RhdGUucGllY2VzKTtcbiAgICB2YXIgcmVzdWx0ID0gbXV0YXRpb24oc3RhdGUpO1xuICAgIHZhciBwbGFuID0gY29tcHV0ZVBsYW4ocHJldlBpZWNlcywgc3RhdGUpO1xuICAgIGlmICghaXNPYmplY3RFbXB0eShwbGFuLmFuaW1zKSB8fCAhaXNPYmplY3RFbXB0eShwbGFuLmZhZGluZ3MpKSB7XG4gICAgICAgIHZhciBhbHJlYWR5UnVubmluZyA9IHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ICYmIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50LnN0YXJ0O1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiBwZXJmLm5vdygpLFxuICAgICAgICAgICAgZnJlcXVlbmN5OiAxIC8gc3RhdGUuYW5pbWF0aW9uLmR1cmF0aW9uLFxuICAgICAgICAgICAgcGxhbjogcGxhblxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWFscmVhZHlSdW5uaW5nKVxuICAgICAgICAgICAgc3RlcChzdGF0ZSwgcGVyZi5ub3coKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiBpc09iamVjdEVtcHR5KG8pIHtcbiAgICBmb3IgKHZhciBfIGluIG8pXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGVhc2luZyh0KSB7XG4gICAgcmV0dXJuIHQgPCAwLjUgPyA0ICogdCAqIHQgKiB0IDogKHQgLSAxKSAqICgyICogdCAtIDIpICogKDIgKiB0IC0gMikgKyAxO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgYm9hcmQgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbnZhciBmZW5fMSA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbnZhciBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbnZhciBhbmltXzEgPSByZXF1aXJlKFwiLi9hbmltXCIpO1xudmFyIGRyYWdfMSA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG52YXIgZXhwbG9zaW9uXzEgPSByZXF1aXJlKFwiLi9leHBsb3Npb25cIik7XG5mdW5jdGlvbiBzdGFydChzdGF0ZSwgcmVkcmF3QWxsKSB7XG4gICAgZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24oKSB7XG4gICAgICAgIGJvYXJkLnRvZ2dsZU9yaWVudGF0aW9uKHN0YXRlKTtcbiAgICAgICAgcmVkcmF3QWxsKCk7XG4gICAgfVxuICAgIDtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgICAgIGlmIChjb25maWcub3JpZW50YXRpb24gJiYgY29uZmlnLm9yaWVudGF0aW9uICE9PSBzdGF0ZS5vcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB0b2dnbGVPcmllbnRhdGlvbigpO1xuICAgICAgICAgICAgKGNvbmZpZy5mZW4gPyBhbmltXzEuYW5pbSA6IGFuaW1fMS5yZW5kZXIpKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gY29uZmlnXzEuY29uZmlndXJlKHN0YXRlLCBjb25maWcpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgICAgZ2V0RmVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiBmZW5fMS53cml0ZShzdGF0ZS5waWVjZXMsIHN0YXRlLmdlb21ldHJ5KTsgfSxcbiAgICAgICAgdG9nZ2xlT3JpZW50YXRpb246IHRvZ2dsZU9yaWVudGF0aW9uLFxuICAgICAgICBzZXRQaWVjZXM6IGZ1bmN0aW9uIChwaWVjZXMpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gYm9hcmQuc2V0UGllY2VzKHN0YXRlLCBwaWVjZXMpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdFNxdWFyZTogZnVuY3Rpb24gKGtleSwgZm9yY2UpIHtcbiAgICAgICAgICAgIGlmIChrZXkpXG4gICAgICAgICAgICAgICAgYW5pbV8xLmFuaW0oZnVuY3Rpb24gKHN0YXRlKSB7IHJldHVybiBib2FyZC5zZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpOyB9LCBzdGF0ZSk7XG4gICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5zZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGJvYXJkLnVuc2VsZWN0KHN0YXRlKTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG1vdmU6IGZ1bmN0aW9uIChvcmlnLCBkZXN0KSB7XG4gICAgICAgICAgICBhbmltXzEuYW5pbShmdW5jdGlvbiAoc3RhdGUpIHsgcmV0dXJuIGJvYXJkLmJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTsgfSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBuZXdQaWVjZTogZnVuY3Rpb24gKHBpZWNlLCBrZXkpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gYm9hcmQuYmFzZU5ld1BpZWNlKHN0YXRlLCBwaWVjZSwga2V5KTsgfSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBwbGF5UHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnByZW1vdmFibGUuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIGlmIChhbmltXzEuYW5pbShib2FyZC5wbGF5UHJlbW92ZSwgc3RhdGUpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgIHBsYXlQcmVkcm9wOiBmdW5jdGlvbiAodmFsaWRhdGUpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5wcmVkcm9wcGFibGUuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBib2FyZC5wbGF5UHJlZHJvcChzdGF0ZSwgdmFsaWRhdGUpO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxQcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGJvYXJkLnVuc2V0UHJlbW92ZSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxQcmVkcm9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGJvYXJkLnVuc2V0UHJlZHJvcCwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxNb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGZ1bmN0aW9uIChzdGF0ZSkgeyBib2FyZC5jYW5jZWxNb3ZlKHN0YXRlKTsgZHJhZ18xLmNhbmNlbChzdGF0ZSk7IH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihmdW5jdGlvbiAoc3RhdGUpIHsgYm9hcmQuc3RvcChzdGF0ZSk7IGRyYWdfMS5jYW5jZWwoc3RhdGUpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGV4cGxvZGU6IGZ1bmN0aW9uIChrZXlzKSB7XG4gICAgICAgICAgICBleHBsb3Npb25fMS5kZWZhdWx0KHN0YXRlLCBrZXlzKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0QXV0b1NoYXBlczogZnVuY3Rpb24gKHNoYXBlcykge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihmdW5jdGlvbiAoc3RhdGUpIHsgcmV0dXJuIHN0YXRlLmRyYXdhYmxlLmF1dG9TaGFwZXMgPSBzaGFwZXM7IH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0U2hhcGVzOiBmdW5jdGlvbiAoc2hhcGVzKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gc3RhdGUuZHJhd2FibGUuc2hhcGVzID0gc2hhcGVzOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEtleUF0RG9tUG9zOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgICAgICByZXR1cm4gYm9hcmQuZ2V0S2V5QXREb21Qb3MocG9zLCBzdGF0ZS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgc3RhdGUuZG9tLmJvdW5kcygpLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZHJhd0FsbDogcmVkcmF3QWxsLFxuICAgICAgICBkcmFnTmV3UGllY2U6IGZ1bmN0aW9uIChwaWVjZSwgZXZlbnQsIGZvcmNlKSB7XG4gICAgICAgICAgICBkcmFnXzEuZHJhZ05ld1BpZWNlKHN0YXRlLCBwaWVjZSwgZXZlbnQsIGZvcmNlKTtcbiAgICAgICAgfSxcbiAgICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgYm9hcmQuc3RvcChzdGF0ZSk7XG4gICAgICAgICAgICBzdGF0ZS5kb20udW5iaW5kICYmIHN0YXRlLmRvbS51bmJpbmQoKTtcbiAgICAgICAgICAgIHN0YXRlLmRvbS5kZXN0cm95ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgcHJlbW92ZV8xID0gcmVxdWlyZShcIi4vcHJlbW92ZVwiKTtcbnZhciBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZnVuY3Rpb24gY2FsbFVzZXJGdW5jdGlvbihmKSB7XG4gICAgdmFyIGFyZ3MgPSBbXTtcbiAgICBmb3IgKHZhciBfaSA9IDE7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xuICAgICAgICBhcmdzW19pIC0gMV0gPSBhcmd1bWVudHNbX2ldO1xuICAgIH1cbiAgICBpZiAoZilcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBmLmFwcGx5KHZvaWQgMCwgYXJncyk7IH0sIDEpO1xufVxuZXhwb3J0cy5jYWxsVXNlckZ1bmN0aW9uID0gY2FsbFVzZXJGdW5jdGlvbjtcbmZ1bmN0aW9uIHRvZ2dsZU9yaWVudGF0aW9uKHN0YXRlKSB7XG4gICAgc3RhdGUub3JpZW50YXRpb24gPSB1dGlsXzEub3Bwb3NpdGUoc3RhdGUub3JpZW50YXRpb24pO1xuICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID1cbiAgICAgICAgc3RhdGUuZHJhZ2dhYmxlLmN1cnJlbnQgPVxuICAgICAgICAgICAgc3RhdGUuc2VsZWN0ZWQgPSB1bmRlZmluZWQ7XG59XG5leHBvcnRzLnRvZ2dsZU9yaWVudGF0aW9uID0gdG9nZ2xlT3JpZW50YXRpb247XG5mdW5jdGlvbiByZXNldChzdGF0ZSkge1xuICAgIHN0YXRlLmxhc3RNb3ZlID0gdW5kZWZpbmVkO1xuICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG59XG5leHBvcnRzLnJlc2V0ID0gcmVzZXQ7XG5mdW5jdGlvbiBzZXRQaWVjZXMoc3RhdGUsIHBpZWNlcykge1xuICAgIGZvciAodmFyIGtleSBpbiBwaWVjZXMpIHtcbiAgICAgICAgdmFyIHBpZWNlID0gcGllY2VzW2tleV07XG4gICAgICAgIGlmIChwaWVjZSlcbiAgICAgICAgICAgIHN0YXRlLnBpZWNlc1trZXldID0gcGllY2U7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNba2V5XTtcbiAgICB9XG59XG5leHBvcnRzLnNldFBpZWNlcyA9IHNldFBpZWNlcztcbmZ1bmN0aW9uIHNldENoZWNrKHN0YXRlLCBjb2xvcikge1xuICAgIHN0YXRlLmNoZWNrID0gdW5kZWZpbmVkO1xuICAgIGlmIChjb2xvciA9PT0gdHJ1ZSlcbiAgICAgICAgY29sb3IgPSBzdGF0ZS50dXJuQ29sb3I7XG4gICAgaWYgKGNvbG9yKVxuICAgICAgICBmb3IgKHZhciBrIGluIHN0YXRlLnBpZWNlcykge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnBpZWNlc1trXS5yb2xlID09PSAna2luZycgJiYgc3RhdGUucGllY2VzW2tdLmNvbG9yID09PSBjb2xvcikge1xuICAgICAgICAgICAgICAgIHN0YXRlLmNoZWNrID0gaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxufVxuZXhwb3J0cy5zZXRDaGVjayA9IHNldENoZWNrO1xuZnVuY3Rpb24gc2V0UHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCwgbWV0YSkge1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgc3RhdGUucHJlbW92YWJsZS5jdXJyZW50ID0gW29yaWcsIGRlc3RdO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUucHJlbW92YWJsZS5ldmVudHMuc2V0LCBvcmlnLCBkZXN0LCBtZXRhKTtcbn1cbmZ1bmN0aW9uIHVuc2V0UHJlbW92ZShzdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5wcmVtb3ZhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgc3RhdGUucHJlbW92YWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZW1vdmFibGUuZXZlbnRzLnVuc2V0KTtcbiAgICB9XG59XG5leHBvcnRzLnVuc2V0UHJlbW92ZSA9IHVuc2V0UHJlbW92ZTtcbmZ1bmN0aW9uIHNldFByZWRyb3Aoc3RhdGUsIHJvbGUsIGtleSkge1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgc3RhdGUucHJlZHJvcHBhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIHJvbGU6IHJvbGUsXG4gICAgICAgIGtleToga2V5XG4gICAgfTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZWRyb3BwYWJsZS5ldmVudHMuc2V0LCByb2xlLCBrZXkpO1xufVxuZnVuY3Rpb24gdW5zZXRQcmVkcm9wKHN0YXRlKSB7XG4gICAgdmFyIHBkID0gc3RhdGUucHJlZHJvcHBhYmxlO1xuICAgIGlmIChwZC5jdXJyZW50KSB7XG4gICAgICAgIHBkLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIGNhbGxVc2VyRnVuY3Rpb24ocGQuZXZlbnRzLnVuc2V0KTtcbiAgICB9XG59XG5leHBvcnRzLnVuc2V0UHJlZHJvcCA9IHVuc2V0UHJlZHJvcDtcbmZ1bmN0aW9uIHRyeUF1dG9DYXN0bGUoc3RhdGUsIG9yaWcsIGRlc3QpIHtcbiAgICBpZiAoIXN0YXRlLmF1dG9DYXN0bGUpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIga2luZyA9IHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICBpZiAoIWtpbmcgfHwga2luZy5yb2xlICE9PSAna2luZycpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIgZmlyc3RSYW5rSXMwID0gc3RhdGUuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIHZhciBvcmlnUG9zID0gdXRpbF8xLmtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKTtcbiAgICBpZiAob3JpZ1Bvc1swXSAhPT0gNSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChvcmlnUG9zWzFdICE9PSAxICYmIG9yaWdQb3NbMV0gIT09IDgpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIgZGVzdFBvcyA9IHV0aWxfMS5rZXkycG9zKGRlc3QsIGZpcnN0UmFua0lzMCk7XG4gICAgdmFyIG9sZFJvb2tQb3MsIG5ld1Jvb2tQb3MsIG5ld0tpbmdQb3M7XG4gICAgaWYgKGRlc3RQb3NbMF0gPT09IDcgfHwgZGVzdFBvc1swXSA9PT0gOCkge1xuICAgICAgICBvbGRSb29rUG9zID0gdXRpbF8xLnBvczJrZXkoWzgsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIG5ld1Jvb2tQb3MgPSB1dGlsXzEucG9zMmtleShbNiwgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgbmV3S2luZ1BvcyA9IHV0aWxfMS5wb3Mya2V5KFs3LCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgIH1cbiAgICBlbHNlIGlmIChkZXN0UG9zWzBdID09PSAzIHx8IGRlc3RQb3NbMF0gPT09IDEpIHtcbiAgICAgICAgb2xkUm9va1BvcyA9IHV0aWxfMS5wb3Mya2V5KFsxLCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgICAgICBuZXdSb29rUG9zID0gdXRpbF8xLnBvczJrZXkoWzQsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIG5ld0tpbmdQb3MgPSB1dGlsXzEucG9zMmtleShbMywgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgdmFyIHJvb2sgPSBzdGF0ZS5waWVjZXNbb2xkUm9va1Bvc107XG4gICAgaWYgKCFyb29rIHx8IHJvb2sucm9sZSAhPT0gJ3Jvb2snKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICBkZWxldGUgc3RhdGUucGllY2VzW29sZFJvb2tQb3NdO1xuICAgIHN0YXRlLnBpZWNlc1tuZXdLaW5nUG9zXSA9IGtpbmc7XG4gICAgc3RhdGUucGllY2VzW25ld1Jvb2tQb3NdID0gcm9vaztcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgdmFyIG9yaWdQaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXSwgZGVzdFBpZWNlID0gc3RhdGUucGllY2VzW2Rlc3RdO1xuICAgIGlmIChvcmlnID09PSBkZXN0IHx8ICFvcmlnUGllY2UpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIgY2FwdHVyZWQgPSAoZGVzdFBpZWNlICYmIGRlc3RQaWVjZS5jb2xvciAhPT0gb3JpZ1BpZWNlLmNvbG9yKSA/IGRlc3RQaWVjZSA6IHVuZGVmaW5lZDtcbiAgICBpZiAoZGVzdCA9PSBzdGF0ZS5zZWxlY3RlZClcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLm1vdmUsIG9yaWcsIGRlc3QsIGNhcHR1cmVkKTtcbiAgICBpZiAoIXRyeUF1dG9DYXN0bGUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHN0YXRlLnBpZWNlc1tkZXN0XSA9IG9yaWdQaWVjZTtcbiAgICAgICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICB9XG4gICAgc3RhdGUubGFzdE1vdmUgPSBbb3JpZywgZGVzdF07XG4gICAgc3RhdGUuY2hlY2sgPSB1bmRlZmluZWQ7XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5ldmVudHMuY2hhbmdlKTtcbiAgICByZXR1cm4gY2FwdHVyZWQgfHwgdHJ1ZTtcbn1cbmV4cG9ydHMuYmFzZU1vdmUgPSBiYXNlTW92ZTtcbmZ1bmN0aW9uIGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGtleSwgZm9yY2UpIHtcbiAgICBpZiAoc3RhdGUucGllY2VzW2tleV0pIHtcbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgZGVsZXRlIHN0YXRlLnBpZWNlc1trZXldO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLmRyb3BOZXdQaWVjZSwgcGllY2UsIGtleSk7XG4gICAgc3RhdGUucGllY2VzW2tleV0gPSBwaWVjZTtcbiAgICBzdGF0ZS5sYXN0TW92ZSA9IFtrZXldO1xuICAgIHN0YXRlLmNoZWNrID0gdW5kZWZpbmVkO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLmNoYW5nZSk7XG4gICAgc3RhdGUubW92YWJsZS5kZXN0cyA9IHVuZGVmaW5lZDtcbiAgICBzdGF0ZS50dXJuQ29sb3IgPSB1dGlsXzEub3Bwb3NpdGUoc3RhdGUudHVybkNvbG9yKTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmV4cG9ydHMuYmFzZU5ld1BpZWNlID0gYmFzZU5ld1BpZWNlO1xuZnVuY3Rpb24gYmFzZVVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgdmFyIHJlc3VsdCA9IGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciA9IHV0aWxfMS5vcHBvc2l0ZShzdGF0ZS50dXJuQ29sb3IpO1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIHVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgaWYgKGNhbk1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBiYXNlVXNlck1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpO1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICB2YXIgaG9sZFRpbWUgPSBzdGF0ZS5ob2xkLnN0b3AoKTtcbiAgICAgICAgICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICAgICAgICAgIHZhciBtZXRhZGF0YSA9IHtcbiAgICAgICAgICAgICAgICBwcmVtb3ZlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdHJsS2V5OiBzdGF0ZS5zdGF0cy5jdHJsS2V5LFxuICAgICAgICAgICAgICAgIGhvbGRUaW1lOiBob2xkVGltZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlKVxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmNhcHR1cmVkID0gcmVzdWx0O1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlciwgb3JpZywgZGVzdCwgbWV0YWRhdGEpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoY2FuUHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgc2V0UHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCwge1xuICAgICAgICAgICAgY3RybEtleTogc3RhdGUuc3RhdHMuY3RybEtleVxuICAgICAgICB9KTtcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIH1cbiAgICBlbHNlIGlmIChpc01vdmFibGUoc3RhdGUsIGRlc3QpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwgZGVzdCkpIHtcbiAgICAgICAgc2V0U2VsZWN0ZWQoc3RhdGUsIGRlc3QpO1xuICAgICAgICBzdGF0ZS5ob2xkLnN0YXJ0KCk7XG4gICAgfVxuICAgIGVsc2VcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydHMudXNlck1vdmUgPSB1c2VyTW92ZTtcbmZ1bmN0aW9uIGRyb3BOZXdQaWVjZShzdGF0ZSwgb3JpZywgZGVzdCwgZm9yY2UpIHtcbiAgICBpZiAoY2FuRHJvcChzdGF0ZSwgb3JpZywgZGVzdCkgfHwgZm9yY2UpIHtcbiAgICAgICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgICAgICBkZWxldGUgc3RhdGUucGllY2VzW29yaWddO1xuICAgICAgICBiYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBkZXN0LCBmb3JjZSk7XG4gICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgcGllY2Uucm9sZSwgZGVzdCwge1xuICAgICAgICAgICAgcHJlZHJvcDogZmFsc2VcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNhblByZWRyb3Aoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHNldFByZWRyb3Aoc3RhdGUsIHN0YXRlLnBpZWNlc1tvcmlnXS5yb2xlLCBkZXN0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgfVxuICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xufVxuZXhwb3J0cy5kcm9wTmV3UGllY2UgPSBkcm9wTmV3UGllY2U7XG5mdW5jdGlvbiBzZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpIHtcbiAgICBpZiAoc3RhdGUuc2VsZWN0ZWQpIHtcbiAgICAgICAgaWYgKHN0YXRlLnNlbGVjdGVkID09PSBrZXkgJiYgIXN0YXRlLmRyYWdnYWJsZS5lbmFibGVkKSB7XG4gICAgICAgICAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgICAgICAgICBzdGF0ZS5ob2xkLmNhbmNlbCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKChzdGF0ZS5zZWxlY3RhYmxlLmVuYWJsZWQgfHwgZm9yY2UpICYmIHN0YXRlLnNlbGVjdGVkICE9PSBrZXkpIHtcbiAgICAgICAgICAgIGlmICh1c2VyTW92ZShzdGF0ZSwgc3RhdGUuc2VsZWN0ZWQsIGtleSkpXG4gICAgICAgICAgICAgICAgc3RhdGUuc3RhdHMuZHJhZ2dlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0YXRlLmhvbGQuc3RhcnQoKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoaXNNb3ZhYmxlKHN0YXRlLCBrZXkpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwga2V5KSkge1xuICAgICAgICBzZXRTZWxlY3RlZChzdGF0ZSwga2V5KTtcbiAgICAgICAgc3RhdGUuaG9sZC5zdGFydCgpO1xuICAgIH1cbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5zZWxlY3QsIGtleSk7XG59XG5leHBvcnRzLnNlbGVjdFNxdWFyZSA9IHNlbGVjdFNxdWFyZTtcbmZ1bmN0aW9uIHNldFNlbGVjdGVkKHN0YXRlLCBrZXkpIHtcbiAgICBzdGF0ZS5zZWxlY3RlZCA9IGtleTtcbiAgICBpZiAoaXNQcmVtb3ZhYmxlKHN0YXRlLCBrZXkpKSB7XG4gICAgICAgIHN0YXRlLnByZW1vdmFibGUuZGVzdHMgPSBwcmVtb3ZlXzEuZGVmYXVsdChzdGF0ZS5waWVjZXMsIGtleSwgc3RhdGUucHJlbW92YWJsZS5jYXN0bGUsIHN0YXRlLmdlb21ldHJ5KTtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgICBzdGF0ZS5wcmVtb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xufVxuZXhwb3J0cy5zZXRTZWxlY3RlZCA9IHNldFNlbGVjdGVkO1xuZnVuY3Rpb24gdW5zZWxlY3Qoc3RhdGUpIHtcbiAgICBzdGF0ZS5zZWxlY3RlZCA9IHVuZGVmaW5lZDtcbiAgICBzdGF0ZS5wcmVtb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xuICAgIHN0YXRlLmhvbGQuY2FuY2VsKCk7XG59XG5leHBvcnRzLnVuc2VsZWN0ID0gdW5zZWxlY3Q7XG5mdW5jdGlvbiBpc01vdmFibGUoc3RhdGUsIG9yaWcpIHtcbiAgICB2YXIgcGllY2UgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgcmV0dXJuICEhcGllY2UgJiYgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICdib3RoJyB8fCAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yID09PSBwaWVjZS5jb2xvcikpO1xufVxuZnVuY3Rpb24gY2FuTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHJldHVybiBvcmlnICE9PSBkZXN0ICYmIGlzTW92YWJsZShzdGF0ZSwgb3JpZykgJiYgKHN0YXRlLm1vdmFibGUuZnJlZSB8fCAoISFzdGF0ZS5tb3ZhYmxlLmRlc3RzICYmIHV0aWxfMS5jb250YWluc1goc3RhdGUubW92YWJsZS5kZXN0c1tvcmlnXSwgZGVzdCkpKTtcbn1cbmV4cG9ydHMuY2FuTW92ZSA9IGNhbk1vdmU7XG5mdW5jdGlvbiBjYW5Ecm9wKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIGRlc3QgJiYgKG9yaWcgPT09IGRlc3QgfHwgIXN0YXRlLnBpZWNlc1tkZXN0XSkgJiYgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICdib3RoJyB8fCAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yID09PSBwaWVjZS5jb2xvcikpO1xufVxuZnVuY3Rpb24gaXNQcmVtb3ZhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIHN0YXRlLnByZW1vdmFibGUuZW5hYmxlZCAmJlxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxuICAgICAgICBzdGF0ZS50dXJuQ29sb3IgIT09IHBpZWNlLmNvbG9yO1xufVxuZnVuY3Rpb24gY2FuUHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHJldHVybiBvcmlnICE9PSBkZXN0ICYmXG4gICAgICAgIGlzUHJlbW92YWJsZShzdGF0ZSwgb3JpZykgJiZcbiAgICAgICAgdXRpbF8xLmNvbnRhaW5zWChwcmVtb3ZlXzEuZGVmYXVsdChzdGF0ZS5waWVjZXMsIG9yaWcsIHN0YXRlLnByZW1vdmFibGUuY2FzdGxlLCBzdGF0ZS5nZW9tZXRyeSksIGRlc3QpO1xufVxuZnVuY3Rpb24gY2FuUHJlZHJvcChzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHZhciBwaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICB2YXIgZGVzdFBpZWNlID0gc3RhdGUucGllY2VzW2Rlc3RdO1xuICAgIHJldHVybiAhIXBpZWNlICYmIGRlc3QgJiZcbiAgICAgICAgKCFkZXN0UGllY2UgfHwgZGVzdFBpZWNlLmNvbG9yICE9PSBzdGF0ZS5tb3ZhYmxlLmNvbG9yKSAmJlxuICAgICAgICBzdGF0ZS5wcmVkcm9wcGFibGUuZW5hYmxlZCAmJlxuICAgICAgICAocGllY2Uucm9sZSAhPT0gJ3Bhd24nIHx8IChkZXN0WzFdICE9PSAnMScgJiYgZGVzdFsxXSAhPT0gJzgnKSkgJiZcbiAgICAgICAgc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yICE9PSBwaWVjZS5jb2xvcjtcbn1cbmZ1bmN0aW9uIGlzRHJhZ2dhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIHN0YXRlLmRyYWdnYWJsZS5lbmFibGVkICYmIChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmIChzdGF0ZS50dXJuQ29sb3IgPT09IHBpZWNlLmNvbG9yIHx8IHN0YXRlLnByZW1vdmFibGUuZW5hYmxlZCkpKTtcbn1cbmV4cG9ydHMuaXNEcmFnZ2FibGUgPSBpc0RyYWdnYWJsZTtcbmZ1bmN0aW9uIHBsYXlQcmVtb3ZlKHN0YXRlKSB7XG4gICAgdmFyIG1vdmUgPSBzdGF0ZS5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKCFtb3ZlKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgdmFyIG9yaWcgPSBtb3ZlWzBdLCBkZXN0ID0gbW92ZVsxXTtcbiAgICB2YXIgc3VjY2VzcyA9IGZhbHNlO1xuICAgIGlmIChjYW5Nb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gYmFzZVVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgdmFyIG1ldGFkYXRhID0geyBwcmVtb3ZlOiB0cnVlIH07XG4gICAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlKVxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmNhcHR1cmVkID0gcmVzdWx0O1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlciwgb3JpZywgZGVzdCwgbWV0YWRhdGEpO1xuICAgICAgICAgICAgc3VjY2VzcyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdW5zZXRQcmVtb3ZlKHN0YXRlKTtcbiAgICByZXR1cm4gc3VjY2Vzcztcbn1cbmV4cG9ydHMucGxheVByZW1vdmUgPSBwbGF5UHJlbW92ZTtcbmZ1bmN0aW9uIHBsYXlQcmVkcm9wKHN0YXRlLCB2YWxpZGF0ZSkge1xuICAgIHZhciBkcm9wID0gc3RhdGUucHJlZHJvcHBhYmxlLmN1cnJlbnQsIHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICBpZiAoIWRyb3ApXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBpZiAodmFsaWRhdGUoZHJvcCkpIHtcbiAgICAgICAgdmFyIHBpZWNlID0ge1xuICAgICAgICAgICAgcm9sZTogZHJvcC5yb2xlLFxuICAgICAgICAgICAgY29sb3I6IHN0YXRlLm1vdmFibGUuY29sb3JcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGRyb3Aua2V5KSkge1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlck5ld1BpZWNlLCBkcm9wLnJvbGUsIGRyb3Aua2V5LCB7XG4gICAgICAgICAgICAgICAgcHJlZHJvcDogdHJ1ZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xuICAgIHJldHVybiBzdWNjZXNzO1xufVxuZXhwb3J0cy5wbGF5UHJlZHJvcCA9IHBsYXlQcmVkcm9wO1xuZnVuY3Rpb24gY2FuY2VsTW92ZShzdGF0ZSkge1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgdW5zZXRQcmVkcm9wKHN0YXRlKTtcbiAgICB1bnNlbGVjdChzdGF0ZSk7XG59XG5leHBvcnRzLmNhbmNlbE1vdmUgPSBjYW5jZWxNb3ZlO1xuZnVuY3Rpb24gc3RvcChzdGF0ZSkge1xuICAgIHN0YXRlLm1vdmFibGUuY29sb3IgPVxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzID1cbiAgICAgICAgICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgIGNhbmNlbE1vdmUoc3RhdGUpO1xufVxuZXhwb3J0cy5zdG9wID0gc3RvcDtcbmZ1bmN0aW9uIGdldEtleUF0RG9tUG9zKHBvcywgYXNXaGl0ZSwgYm91bmRzLCBnZW9tKSB7XG4gICAgdmFyIGJkID0gY2cuZGltZW5zaW9uc1tnZW9tXTtcbiAgICB2YXIgZmlsZSA9IE1hdGguY2VpbChiZC53aWR0aCAqICgocG9zWzBdIC0gYm91bmRzLmxlZnQpIC8gYm91bmRzLndpZHRoKSk7XG4gICAgaWYgKCFhc1doaXRlKVxuICAgICAgICBmaWxlID0gYmQud2lkdGggKyAxIC0gZmlsZTtcbiAgICB2YXIgcmFuayA9IE1hdGguY2VpbChiZC5oZWlnaHQgLSAoYmQuaGVpZ2h0ICogKChwb3NbMV0gLSBib3VuZHMudG9wKSAvIGJvdW5kcy5oZWlnaHQpKSk7XG4gICAgaWYgKCFhc1doaXRlKVxuICAgICAgICByYW5rID0gYmQuaGVpZ2h0ICsgMSAtIHJhbms7XG4gICAgcmV0dXJuIChmaWxlID4gMCAmJiBmaWxlIDwgYmQud2lkdGggKyAxICYmIHJhbmsgPiAwICYmIHJhbmsgPCBiZC5oZWlnaHQgKyAxKSA/IHV0aWxfMS5wb3Mya2V5KFtmaWxlLCByYW5rXSwgZ2VvbSkgOiB1bmRlZmluZWQ7XG59XG5leHBvcnRzLmdldEtleUF0RG9tUG9zID0gZ2V0S2V5QXREb21Qb3M7XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBhcGlfMSA9IHJlcXVpcmUoXCIuL2FwaVwiKTtcbnZhciBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbnZhciBzdGF0ZV8xID0gcmVxdWlyZShcIi4vc3RhdGVcIik7XG52YXIgd3JhcF8xID0gcmVxdWlyZShcIi4vd3JhcFwiKTtcbnZhciBldmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG52YXIgcmVuZGVyXzEgPSByZXF1aXJlKFwiLi9yZW5kZXJcIik7XG52YXIgc3ZnID0gcmVxdWlyZShcIi4vc3ZnXCIpO1xudmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gQ2hlc3Nncm91bmQoZWxlbWVudCwgY29uZmlnKSB7XG4gICAgdmFyIHN0YXRlID0gc3RhdGVfMS5kZWZhdWx0cygpO1xuICAgIGNvbmZpZ18xLmNvbmZpZ3VyZShzdGF0ZSwgY29uZmlnIHx8IHt9KTtcbiAgICBmdW5jdGlvbiByZWRyYXdBbGwoKSB7XG4gICAgICAgIHZhciBwcmV2VW5iaW5kID0gc3RhdGUuZG9tICYmIHN0YXRlLmRvbS51bmJpbmQ7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2ctd3JhcCcpO1xuICAgICAgICB2YXIgcmVsYXRpdmUgPSBzdGF0ZS52aWV3T25seSAmJiAhc3RhdGUuZHJhd2FibGUudmlzaWJsZTtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gd3JhcF8xLmRlZmF1bHQoZWxlbWVudCwgc3RhdGUsIHJlbGF0aXZlKTtcbiAgICAgICAgdmFyIGJvdW5kcyA9IHV0aWwubWVtbyhmdW5jdGlvbiAoKSB7IHJldHVybiBlbGVtZW50cy5ib2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTsgfSk7XG4gICAgICAgIHZhciByZWRyYXdOb3cgPSBmdW5jdGlvbiAoc2tpcFN2Zykge1xuICAgICAgICAgICAgcmVuZGVyXzEuZGVmYXVsdChzdGF0ZSk7XG4gICAgICAgICAgICBpZiAoIXNraXBTdmcgJiYgZWxlbWVudHMuc3ZnKVxuICAgICAgICAgICAgICAgIHN2Zy5yZW5kZXJTdmcoc3RhdGUsIGVsZW1lbnRzLnN2Zyk7XG4gICAgICAgIH07XG4gICAgICAgIHN0YXRlLmRvbSA9IHtcbiAgICAgICAgICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICAgICAgICAgIGJvdW5kczogYm91bmRzLFxuICAgICAgICAgICAgcmVkcmF3OiBkZWJvdW5jZVJlZHJhdyhyZWRyYXdOb3cpLFxuICAgICAgICAgICAgcmVkcmF3Tm93OiByZWRyYXdOb3csXG4gICAgICAgICAgICB1bmJpbmQ6IHByZXZVbmJpbmQsXG4gICAgICAgICAgICByZWxhdGl2ZTogcmVsYXRpdmVcbiAgICAgICAgfTtcbiAgICAgICAgc3RhdGUuZHJhd2FibGUucHJldlN2Z0hhc2ggPSAnJztcbiAgICAgICAgcmVkcmF3Tm93KGZhbHNlKTtcbiAgICAgICAgZXZlbnRzLmJpbmRCb2FyZChzdGF0ZSk7XG4gICAgICAgIGlmICghcHJldlVuYmluZClcbiAgICAgICAgICAgIHN0YXRlLmRvbS51bmJpbmQgPSBldmVudHMuYmluZERvY3VtZW50KHN0YXRlLCByZWRyYXdBbGwpO1xuICAgICAgICBzdGF0ZS5ldmVudHMuaW5zZXJ0ICYmIHN0YXRlLmV2ZW50cy5pbnNlcnQoZWxlbWVudHMpO1xuICAgIH1cbiAgICByZWRyYXdBbGwoKTtcbiAgICB2YXIgYXBpID0gYXBpXzEuc3RhcnQoc3RhdGUsIHJlZHJhd0FsbCk7XG4gICAgcmV0dXJuIGFwaTtcbn1cbmV4cG9ydHMuQ2hlc3Nncm91bmQgPSBDaGVzc2dyb3VuZDtcbjtcbmZ1bmN0aW9uIGRlYm91bmNlUmVkcmF3KHJlZHJhd05vdykge1xuICAgIHZhciByZWRyYXdpbmcgPSBmYWxzZTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAocmVkcmF3aW5nKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICByZWRyYXdpbmcgPSB0cnVlO1xuICAgICAgICB1dGlsLnJhZihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZWRyYXdOb3coKTtcbiAgICAgICAgICAgIHJlZHJhd2luZyA9IGZhbHNlO1xuICAgICAgICB9KTtcbiAgICB9O1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgYm9hcmRfMSA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xudmFyIGZlbl8xID0gcmVxdWlyZShcIi4vZmVuXCIpO1xudmFyIGNnID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5mdW5jdGlvbiBjb25maWd1cmUoc3RhdGUsIGNvbmZpZykge1xuICAgIGlmIChjb25maWcubW92YWJsZSAmJiBjb25maWcubW92YWJsZS5kZXN0cylcbiAgICAgICAgc3RhdGUubW92YWJsZS5kZXN0cyA9IHVuZGVmaW5lZDtcbiAgICBtZXJnZShzdGF0ZSwgY29uZmlnKTtcbiAgICBpZiAoY29uZmlnLmdlb21ldHJ5KVxuICAgICAgICBzdGF0ZS5kaW1lbnNpb25zID0gY2cuZGltZW5zaW9uc1tjb25maWcuZ2VvbWV0cnldO1xuICAgIGlmIChjb25maWcuZmVuKSB7XG4gICAgICAgIHN0YXRlLnBpZWNlcyA9IGZlbl8xLnJlYWQoY29uZmlnLmZlbik7XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnNoYXBlcyA9IFtdO1xuICAgIH1cbiAgICBpZiAoY29uZmlnLmhhc093blByb3BlcnR5KCdjaGVjaycpKVxuICAgICAgICBib2FyZF8xLnNldENoZWNrKHN0YXRlLCBjb25maWcuY2hlY2sgfHwgZmFsc2UpO1xuICAgIGlmIChjb25maWcuaGFzT3duUHJvcGVydHkoJ2xhc3RNb3ZlJykgJiYgIWNvbmZpZy5sYXN0TW92ZSlcbiAgICAgICAgc3RhdGUubGFzdE1vdmUgPSB1bmRlZmluZWQ7XG4gICAgZWxzZSBpZiAoY29uZmlnLmxhc3RNb3ZlKVxuICAgICAgICBzdGF0ZS5sYXN0TW92ZSA9IGNvbmZpZy5sYXN0TW92ZTtcbiAgICBpZiAoc3RhdGUuc2VsZWN0ZWQpXG4gICAgICAgIGJvYXJkXzEuc2V0U2VsZWN0ZWQoc3RhdGUsIHN0YXRlLnNlbGVjdGVkKTtcbiAgICBpZiAoIXN0YXRlLmFuaW1hdGlvbi5kdXJhdGlvbiB8fCBzdGF0ZS5hbmltYXRpb24uZHVyYXRpb24gPCAxMDApXG4gICAgICAgIHN0YXRlLmFuaW1hdGlvbi5lbmFibGVkID0gZmFsc2U7XG4gICAgaWYgKCFzdGF0ZS5tb3ZhYmxlLnJvb2tDYXN0bGUgJiYgc3RhdGUubW92YWJsZS5kZXN0cykge1xuICAgICAgICB2YXIgcmFua18xID0gc3RhdGUubW92YWJsZS5jb2xvciA9PT0gJ3doaXRlJyA/IDEgOiA4O1xuICAgICAgICB2YXIga2luZ1N0YXJ0UG9zID0gJ2UnICsgcmFua18xO1xuICAgICAgICB2YXIgZGVzdHNfMSA9IHN0YXRlLm1vdmFibGUuZGVzdHNba2luZ1N0YXJ0UG9zXTtcbiAgICAgICAgdmFyIGtpbmcgPSBzdGF0ZS5waWVjZXNba2luZ1N0YXJ0UG9zXTtcbiAgICAgICAgaWYgKCFkZXN0c18xIHx8ICFraW5nIHx8IGtpbmcucm9sZSAhPT0gJ2tpbmcnKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzW2tpbmdTdGFydFBvc10gPSBkZXN0c18xLmZpbHRlcihmdW5jdGlvbiAoZCkge1xuICAgICAgICAgICAgcmV0dXJuICEoKGQgPT09ICdhJyArIHJhbmtfMSkgJiYgZGVzdHNfMS5pbmRleE9mKCdjJyArIHJhbmtfMSkgIT09IC0xKSAmJlxuICAgICAgICAgICAgICAgICEoKGQgPT09ICdoJyArIHJhbmtfMSkgJiYgZGVzdHNfMS5pbmRleE9mKCdnJyArIHJhbmtfMSkgIT09IC0xKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0cy5jb25maWd1cmUgPSBjb25maWd1cmU7XG47XG5mdW5jdGlvbiBtZXJnZShiYXNlLCBleHRlbmQpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gZXh0ZW5kKSB7XG4gICAgICAgIGlmIChpc09iamVjdChiYXNlW2tleV0pICYmIGlzT2JqZWN0KGV4dGVuZFtrZXldKSlcbiAgICAgICAgICAgIG1lcmdlKGJhc2Vba2V5XSwgZXh0ZW5kW2tleV0pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBiYXNlW2tleV0gPSBleHRlbmRba2V5XTtcbiAgICB9XG59XG5mdW5jdGlvbiBpc09iamVjdChvKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvID09PSAnb2JqZWN0Jztcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIGJvYXJkID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG52YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgZHJhd18xID0gcmVxdWlyZShcIi4vZHJhd1wiKTtcbnZhciBhbmltXzEgPSByZXF1aXJlKFwiLi9hbmltXCIpO1xuZnVuY3Rpb24gc3RhcnQocywgZSkge1xuICAgIGlmIChlLmJ1dHRvbiAhPT0gdW5kZWZpbmVkICYmIGUuYnV0dG9uICE9PSAwKVxuICAgICAgICByZXR1cm47XG4gICAgaWYgKGUudG91Y2hlcyAmJiBlLnRvdWNoZXMubGVuZ3RoID4gMSlcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaHN0YXJ0JylcbiAgICAgICAgcy5zdGF0cy50b3VjaGVkID0gdHJ1ZTtcbiAgICBlbHNlIGlmIChlLnR5cGUgPT09ICdtb3VzZWRvd24nICYmIHMuc3RhdHMudG91Y2hlZClcbiAgICAgICAgcmV0dXJuO1xuICAgIHZhciBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgYm91bmRzID0gcy5kb20uYm91bmRzKCksIHBvc2l0aW9uID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpLCBvcmlnID0gYm9hcmQuZ2V0S2V5QXREb21Qb3MocG9zaXRpb24sIGFzV2hpdGUsIGJvdW5kcywgcy5nZW9tZXRyeSk7XG4gICAgaWYgKCFvcmlnKVxuICAgICAgICByZXR1cm47XG4gICAgdmFyIHBpZWNlID0gcy5waWVjZXNbb3JpZ107XG4gICAgdmFyIHByZXZpb3VzbHlTZWxlY3RlZCA9IHMuc2VsZWN0ZWQ7XG4gICAgaWYgKCFwcmV2aW91c2x5U2VsZWN0ZWQgJiYgcy5kcmF3YWJsZS5lbmFibGVkICYmIChzLmRyYXdhYmxlLmVyYXNlT25DbGljayB8fCAoIXBpZWNlIHx8IHBpZWNlLmNvbG9yICE9PSBzLnR1cm5Db2xvcikpKVxuICAgICAgICBkcmF3XzEuY2xlYXIocyk7XG4gICAgaWYgKCFlLnRvdWNoZXMgfHwgcGllY2UgfHwgcHJldmlvdXNseVNlbGVjdGVkIHx8IHBpZWNlQ2xvc2VUbyhzLCBwb3NpdGlvbikpXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB2YXIgaGFkUHJlbW92ZSA9ICEhcy5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgdmFyIGhhZFByZWRyb3AgPSAhIXMucHJlZHJvcHBhYmxlLmN1cnJlbnQ7XG4gICAgcy5zdGF0cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuICAgIGlmIChzLnNlbGVjdGVkICYmIGJvYXJkLmNhbk1vdmUocywgcy5zZWxlY3RlZCwgb3JpZykpIHtcbiAgICAgICAgYW5pbV8xLmFuaW0oZnVuY3Rpb24gKHN0YXRlKSB7IHJldHVybiBib2FyZC5zZWxlY3RTcXVhcmUoc3RhdGUsIG9yaWcpOyB9LCBzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGJvYXJkLnNlbGVjdFNxdWFyZShzLCBvcmlnKTtcbiAgICB9XG4gICAgdmFyIHN0aWxsU2VsZWN0ZWQgPSBzLnNlbGVjdGVkID09PSBvcmlnO1xuICAgIHZhciBlbGVtZW50ID0gcGllY2VFbGVtZW50QnlLZXkocywgb3JpZyk7XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIGlmIChwaWVjZSAmJiBlbGVtZW50ICYmIHN0aWxsU2VsZWN0ZWQgJiYgYm9hcmQuaXNEcmFnZ2FibGUocywgb3JpZykpIHtcbiAgICAgICAgdmFyIHNxdWFyZUJvdW5kcyA9IGNvbXB1dGVTcXVhcmVCb3VuZHMob3JpZywgYXNXaGl0ZSwgYm91bmRzLCBzLmRpbWVuc2lvbnMpO1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0ge1xuICAgICAgICAgICAgb3JpZzogb3JpZyxcbiAgICAgICAgICAgIG9yaWdQb3M6IHV0aWwua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLFxuICAgICAgICAgICAgcGllY2U6IHBpZWNlLFxuICAgICAgICAgICAgcmVsOiBwb3NpdGlvbixcbiAgICAgICAgICAgIGVwb3M6IHBvc2l0aW9uLFxuICAgICAgICAgICAgcG9zOiBbMCwgMF0sXG4gICAgICAgICAgICBkZWM6IHMuZHJhZ2dhYmxlLmNlbnRlclBpZWNlID8gW1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uWzBdIC0gKHNxdWFyZUJvdW5kcy5sZWZ0ICsgc3F1YXJlQm91bmRzLndpZHRoIC8gMiksXG4gICAgICAgICAgICAgICAgcG9zaXRpb25bMV0gLSAoc3F1YXJlQm91bmRzLnRvcCArIHNxdWFyZUJvdW5kcy5oZWlnaHQgLyAyKVxuICAgICAgICAgICAgXSA6IFswLCAwXSxcbiAgICAgICAgICAgIHN0YXJ0ZWQ6IHMuZHJhZ2dhYmxlLmF1dG9EaXN0YW5jZSAmJiBzLnN0YXRzLmRyYWdnZWQsXG4gICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50LFxuICAgICAgICAgICAgcHJldmlvdXNseVNlbGVjdGVkOiBwcmV2aW91c2x5U2VsZWN0ZWQsXG4gICAgICAgICAgICBvcmlnaW5UYXJnZXQ6IGUudGFyZ2V0XG4gICAgICAgIH07XG4gICAgICAgIGVsZW1lbnQuY2dEcmFnZ2luZyA9IHRydWU7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICAgICAgdmFyIGdob3N0ID0gcy5kb20uZWxlbWVudHMuZ2hvc3Q7XG4gICAgICAgIGlmIChnaG9zdCkge1xuICAgICAgICAgICAgZ2hvc3QuY2xhc3NOYW1lID0gXCJnaG9zdCBcIiArIHBpZWNlLmNvbG9yICsgXCIgXCIgKyBwaWVjZS5yb2xlO1xuICAgICAgICAgICAgdXRpbC50cmFuc2xhdGVBYnMoZ2hvc3QsIHV0aWwucG9zVG9UcmFuc2xhdGVBYnMoYm91bmRzLCBzLmRpbWVuc2lvbnMpKHV0aWwua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLCBhc1doaXRlKSk7XG4gICAgICAgICAgICB1dGlsLnNldFZpc2libGUoZ2hvc3QsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHByb2Nlc3NEcmFnKHMpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGhhZFByZW1vdmUpXG4gICAgICAgICAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgICAgIGlmIChoYWRQcmVkcm9wKVxuICAgICAgICAgICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIH1cbiAgICBzLmRvbS5yZWRyYXcoKTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbmZ1bmN0aW9uIHBpZWNlQ2xvc2VUbyhzLCBwb3MpIHtcbiAgICB2YXIgYXNXaGl0ZSA9IHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIGJvdW5kcyA9IHMuZG9tLmJvdW5kcygpLCByYWRpdXNTcSA9IE1hdGgucG93KGJvdW5kcy53aWR0aCAvIDgsIDIpO1xuICAgIGZvciAodmFyIGtleSBpbiBzLnBpZWNlcykge1xuICAgICAgICB2YXIgc3F1YXJlQm91bmRzID0gY29tcHV0ZVNxdWFyZUJvdW5kcyhrZXksIGFzV2hpdGUsIGJvdW5kcywgcy5kaW1lbnNpb25zKSwgY2VudGVyID0gW1xuICAgICAgICAgICAgc3F1YXJlQm91bmRzLmxlZnQgKyBzcXVhcmVCb3VuZHMud2lkdGggLyAyLFxuICAgICAgICAgICAgc3F1YXJlQm91bmRzLnRvcCArIHNxdWFyZUJvdW5kcy5oZWlnaHQgLyAyXG4gICAgICAgIF07XG4gICAgICAgIGlmICh1dGlsLmRpc3RhbmNlU3EoY2VudGVyLCBwb3MpIDw9IHJhZGl1c1NxKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydHMucGllY2VDbG9zZVRvID0gcGllY2VDbG9zZVRvO1xuZnVuY3Rpb24gZHJhZ05ld1BpZWNlKHMsIHBpZWNlLCBlLCBmb3JjZSkge1xuICAgIHZhciBrZXkgPSAnYTAnO1xuICAgIHMucGllY2VzW2tleV0gPSBwaWVjZTtcbiAgICBzLmRvbS5yZWRyYXcoKTtcbiAgICB2YXIgcG9zaXRpb24gPSB1dGlsLmV2ZW50UG9zaXRpb24oZSksIGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKSwgc3F1YXJlQm91bmRzID0gY29tcHV0ZVNxdWFyZUJvdW5kcyhrZXksIGFzV2hpdGUsIGJvdW5kcywgcy5kaW1lbnNpb25zKTtcbiAgICB2YXIgcmVsID0gW1xuICAgICAgICAoYXNXaGl0ZSA/IDAgOiBzLmRpbWVuc2lvbnMud2lkdGggLSAxKSAqIHNxdWFyZUJvdW5kcy53aWR0aCArIGJvdW5kcy5sZWZ0LFxuICAgICAgICAoYXNXaGl0ZSA/IHMuZGltZW5zaW9ucy5oZWlnaHQgOiAtMSkgKiBzcXVhcmVCb3VuZHMuaGVpZ2h0ICsgYm91bmRzLnRvcFxuICAgIF07XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIG9yaWc6IGtleSxcbiAgICAgICAgb3JpZ1BvczogdXRpbC5rZXkycG9zKGtleSwgZmlyc3RSYW5rSXMwKSxcbiAgICAgICAgcGllY2U6IHBpZWNlLFxuICAgICAgICByZWw6IHJlbCxcbiAgICAgICAgZXBvczogcG9zaXRpb24sXG4gICAgICAgIHBvczogW3Bvc2l0aW9uWzBdIC0gcmVsWzBdLCBwb3NpdGlvblsxXSAtIHJlbFsxXV0sXG4gICAgICAgIGRlYzogWy1zcXVhcmVCb3VuZHMud2lkdGggLyAyLCAtc3F1YXJlQm91bmRzLmhlaWdodCAvIDJdLFxuICAgICAgICBzdGFydGVkOiB0cnVlLFxuICAgICAgICBlbGVtZW50OiBmdW5jdGlvbiAoKSB7IHJldHVybiBwaWVjZUVsZW1lbnRCeUtleShzLCBrZXkpOyB9LFxuICAgICAgICBvcmlnaW5UYXJnZXQ6IGUudGFyZ2V0LFxuICAgICAgICBuZXdQaWVjZTogdHJ1ZSxcbiAgICAgICAgZm9yY2U6IGZvcmNlIHx8IGZhbHNlXG4gICAgfTtcbiAgICBwcm9jZXNzRHJhZyhzKTtcbn1cbmV4cG9ydHMuZHJhZ05ld1BpZWNlID0gZHJhZ05ld1BpZWNlO1xuZnVuY3Rpb24gcHJvY2Vzc0RyYWcocykge1xuICAgIHV0aWwucmFmKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgICAgIGlmICghY3VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAocy5hbmltYXRpb24uY3VycmVudCAmJiBzLmFuaW1hdGlvbi5jdXJyZW50LnBsYW4uYW5pbXNbY3VyLm9yaWddKVxuICAgICAgICAgICAgcy5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgdmFyIG9yaWdQaWVjZSA9IHMucGllY2VzW2N1ci5vcmlnXTtcbiAgICAgICAgaWYgKCFvcmlnUGllY2UgfHwgIXV0aWwuc2FtZVBpZWNlKG9yaWdQaWVjZSwgY3VyLnBpZWNlKSlcbiAgICAgICAgICAgIGNhbmNlbChzKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIWN1ci5zdGFydGVkICYmIHV0aWwuZGlzdGFuY2VTcShjdXIuZXBvcywgY3VyLnJlbCkgPj0gTWF0aC5wb3cocy5kcmFnZ2FibGUuZGlzdGFuY2UsIDIpKVxuICAgICAgICAgICAgICAgIGN1ci5zdGFydGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChjdXIuc3RhcnRlZCkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY3VyLmVsZW1lbnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvdW5kID0gY3VyLmVsZW1lbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVsZW1lbnQgPSBmb3VuZDtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVsZW1lbnQuY2dEcmFnZ2luZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGN1ci5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgYm91bmRzID0gcy5kb20uYm91bmRzKCk7XG4gICAgICAgICAgICAgICAgY3VyLnBvcyA9IFtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVwb3NbMF0gLSBjdXIucmVsWzBdLFxuICAgICAgICAgICAgICAgICAgICBjdXIuZXBvc1sxXSAtIGN1ci5yZWxbMV1cbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgICAgIHZhciB0cmFuc2xhdGlvbiA9IHV0aWwucG9zVG9UcmFuc2xhdGVBYnMoYm91bmRzLCBzLmRpbWVuc2lvbnMpKGN1ci5vcmlnUG9zLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGlvblswXSArPSBjdXIucG9zWzBdICsgY3VyLmRlY1swXTtcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGlvblsxXSArPSBjdXIucG9zWzFdICsgY3VyLmRlY1sxXTtcbiAgICAgICAgICAgICAgICB1dGlsLnRyYW5zbGF0ZUFicyhjdXIuZWxlbWVudCwgdHJhbnNsYXRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHByb2Nlc3NEcmFnKHMpO1xuICAgIH0pO1xufVxuZnVuY3Rpb24gbW92ZShzLCBlKSB7XG4gICAgaWYgKHMuZHJhZ2dhYmxlLmN1cnJlbnQgJiYgKCFlLnRvdWNoZXMgfHwgZS50b3VjaGVzLmxlbmd0aCA8IDIpKSB7XG4gICAgICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQuZXBvcyA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKTtcbiAgICB9XG59XG5leHBvcnRzLm1vdmUgPSBtb3ZlO1xuZnVuY3Rpb24gZW5kKHMsIGUpIHtcbiAgICB2YXIgY3VyID0gcy5kcmFnZ2FibGUuY3VycmVudDtcbiAgICBpZiAoIWN1cilcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaGVuZCcgJiYgY3VyICYmIGN1ci5vcmlnaW5UYXJnZXQgIT09IGUudGFyZ2V0ICYmICFjdXIubmV3UGllY2UpIHtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIHZhciBldmVudFBvcyA9IHV0aWwuZXZlbnRQb3NpdGlvbihlKSB8fCBjdXIuZXBvcztcbiAgICB2YXIgZGVzdCA9IGJvYXJkLmdldEtleUF0RG9tUG9zKGV2ZW50UG9zLCBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBzLmRvbS5ib3VuZHMoKSwgcy5nZW9tZXRyeSk7XG4gICAgaWYgKGRlc3QgJiYgY3VyLnN0YXJ0ZWQpIHtcbiAgICAgICAgaWYgKGN1ci5uZXdQaWVjZSlcbiAgICAgICAgICAgIGJvYXJkLmRyb3BOZXdQaWVjZShzLCBjdXIub3JpZywgZGVzdCwgY3VyLmZvcmNlKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzLnN0YXRzLmN0cmxLZXkgPSBlLmN0cmxLZXk7XG4gICAgICAgICAgICBpZiAoYm9hcmQudXNlck1vdmUocywgY3VyLm9yaWcsIGRlc3QpKVxuICAgICAgICAgICAgICAgIHMuc3RhdHMuZHJhZ2dlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoY3VyLm5ld1BpZWNlKSB7XG4gICAgICAgIGRlbGV0ZSBzLnBpZWNlc1tjdXIub3JpZ107XG4gICAgfVxuICAgIGVsc2UgaWYgKHMuZHJhZ2dhYmxlLmRlbGV0ZU9uRHJvcE9mZikge1xuICAgICAgICBkZWxldGUgcy5waWVjZXNbY3VyLm9yaWddO1xuICAgICAgICBib2FyZC5jYWxsVXNlckZ1bmN0aW9uKHMuZXZlbnRzLmNoYW5nZSk7XG4gICAgfVxuICAgIGlmIChjdXIgJiYgY3VyLm9yaWcgPT09IGN1ci5wcmV2aW91c2x5U2VsZWN0ZWQgJiYgKGN1ci5vcmlnID09PSBkZXN0IHx8ICFkZXN0KSlcbiAgICAgICAgYm9hcmQudW5zZWxlY3Qocyk7XG4gICAgZWxzZSBpZiAoIXMuc2VsZWN0YWJsZS5lbmFibGVkKVxuICAgICAgICBib2FyZC51bnNlbGVjdChzKTtcbiAgICByZW1vdmVEcmFnRWxlbWVudHMocyk7XG4gICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICBzLmRvbS5yZWRyYXcoKTtcbn1cbmV4cG9ydHMuZW5kID0gZW5kO1xuZnVuY3Rpb24gY2FuY2VsKHMpIHtcbiAgICB2YXIgY3VyID0gcy5kcmFnZ2FibGUuY3VycmVudDtcbiAgICBpZiAoY3VyKSB7XG4gICAgICAgIGlmIChjdXIubmV3UGllY2UpXG4gICAgICAgICAgICBkZWxldGUgcy5waWVjZXNbY3VyLm9yaWddO1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBib2FyZC51bnNlbGVjdChzKTtcbiAgICAgICAgcmVtb3ZlRHJhZ0VsZW1lbnRzKHMpO1xuICAgICAgICBzLmRvbS5yZWRyYXcoKTtcbiAgICB9XG59XG5leHBvcnRzLmNhbmNlbCA9IGNhbmNlbDtcbmZ1bmN0aW9uIHJlbW92ZURyYWdFbGVtZW50cyhzKSB7XG4gICAgdmFyIGUgPSBzLmRvbS5lbGVtZW50cztcbiAgICBpZiAoZS5naG9zdClcbiAgICAgICAgdXRpbC5zZXRWaXNpYmxlKGUuZ2hvc3QsIGZhbHNlKTtcbn1cbmZ1bmN0aW9uIGNvbXB1dGVTcXVhcmVCb3VuZHMoa2V5LCBhc1doaXRlLCBib3VuZHMsIGJkKSB7XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IGJkLmhlaWdodCA9PT0gMTA7XG4gICAgdmFyIHBvcyA9IHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMCk7XG4gICAgaWYgKCFhc1doaXRlKSB7XG4gICAgICAgIHBvc1swXSA9IGJkLndpZHRoICsgMSAtIHBvc1swXTtcbiAgICAgICAgcG9zWzFdID0gYmQuaGVpZ2h0ICsgMSAtIHBvc1sxXTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGVmdDogYm91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggKiAocG9zWzBdIC0gMSkgLyBiZC53aWR0aCxcbiAgICAgICAgdG9wOiBib3VuZHMudG9wICsgYm91bmRzLmhlaWdodCAqIChiZC5oZWlnaHQgLSBwb3NbMV0pIC8gYmQuaGVpZ2h0LFxuICAgICAgICB3aWR0aDogYm91bmRzLndpZHRoIC8gYmQud2lkdGgsXG4gICAgICAgIGhlaWdodDogYm91bmRzLmhlaWdodCAvIGJkLmhlaWdodFxuICAgIH07XG59XG5mdW5jdGlvbiBwaWVjZUVsZW1lbnRCeUtleShzLCBrZXkpIHtcbiAgICB2YXIgZWwgPSBzLmRvbS5lbGVtZW50cy5ib2FyZC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChlbCkge1xuICAgICAgICBpZiAoZWwuY2dLZXkgPT09IGtleSAmJiBlbC50YWdOYW1lID09PSAnUElFQ0UnKVxuICAgICAgICAgICAgcmV0dXJuIGVsO1xuICAgICAgICBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgYm9hcmRfMSA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xudmFyIHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgYnJ1c2hlcyA9IFsnZ3JlZW4nLCAncmVkJywgJ2JsdWUnLCAneWVsbG93J107XG5mdW5jdGlvbiBzdGFydChzdGF0ZSwgZSkge1xuICAgIGlmIChlLnRvdWNoZXMgJiYgZS50b3VjaGVzLmxlbmd0aCA+IDEpXG4gICAgICAgIHJldHVybjtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLmN0cmxLZXkgPyBib2FyZF8xLnVuc2VsZWN0KHN0YXRlKSA6IGJvYXJkXzEuY2FuY2VsTW92ZShzdGF0ZSk7XG4gICAgdmFyIHBvc2l0aW9uID0gdXRpbF8xLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgdmFyIG9yaWcgPSBib2FyZF8xLmdldEtleUF0RG9tUG9zKHBvc2l0aW9uLCBzdGF0ZS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgc3RhdGUuZG9tLmJvdW5kcygpLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgaWYgKCFvcmlnKVxuICAgICAgICByZXR1cm47XG4gICAgc3RhdGUuZHJhd2FibGUuY3VycmVudCA9IHtcbiAgICAgICAgb3JpZzogb3JpZyxcbiAgICAgICAgcG9zOiBwb3NpdGlvbixcbiAgICAgICAgYnJ1c2g6IGV2ZW50QnJ1c2goZSlcbiAgICB9O1xuICAgIHByb2Nlc3NEcmF3KHN0YXRlKTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbmZ1bmN0aW9uIHByb2Nlc3NEcmF3KHN0YXRlKSB7XG4gICAgdXRpbF8xLnJhZihmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjdXIgPSBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50O1xuICAgICAgICBpZiAoY3VyKSB7XG4gICAgICAgICAgICB2YXIgbW91c2VTcSA9IGJvYXJkXzEuZ2V0S2V5QXREb21Qb3MoY3VyLnBvcywgc3RhdGUub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIHN0YXRlLmRvbS5ib3VuZHMoKSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgICAgICAgICAgaWYgKG1vdXNlU3EgIT09IGN1ci5tb3VzZVNxKSB7XG4gICAgICAgICAgICAgICAgY3VyLm1vdXNlU3EgPSBtb3VzZVNxO1xuICAgICAgICAgICAgICAgIGN1ci5kZXN0ID0gbW91c2VTcSAhPT0gY3VyLm9yaWcgPyBtb3VzZVNxIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3coKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHByb2Nlc3NEcmF3KHN0YXRlKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuZXhwb3J0cy5wcm9jZXNzRHJhdyA9IHByb2Nlc3NEcmF3O1xuZnVuY3Rpb24gbW92ZShzdGF0ZSwgZSkge1xuICAgIGlmIChzdGF0ZS5kcmF3YWJsZS5jdXJyZW50KVxuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50LnBvcyA9IHV0aWxfMS5ldmVudFBvc2l0aW9uKGUpO1xufVxuZXhwb3J0cy5tb3ZlID0gbW92ZTtcbmZ1bmN0aW9uIGVuZChzdGF0ZSkge1xuICAgIHZhciBjdXIgPSBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50O1xuICAgIGlmIChjdXIpIHtcbiAgICAgICAgaWYgKGN1ci5tb3VzZVNxKVxuICAgICAgICAgICAgYWRkU2hhcGUoc3RhdGUuZHJhd2FibGUsIGN1cik7XG4gICAgICAgIGNhbmNlbChzdGF0ZSk7XG4gICAgfVxufVxuZXhwb3J0cy5lbmQgPSBlbmQ7XG5mdW5jdGlvbiBjYW5jZWwoc3RhdGUpIHtcbiAgICBpZiAoc3RhdGUuZHJhd2FibGUuY3VycmVudCkge1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuZXhwb3J0cy5jYW5jZWwgPSBjYW5jZWw7XG5mdW5jdGlvbiBjbGVhcihzdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5kcmF3YWJsZS5zaGFwZXMubGVuZ3RoKSB7XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnNoYXBlcyA9IFtdO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgIG9uQ2hhbmdlKHN0YXRlLmRyYXdhYmxlKTtcbiAgICB9XG59XG5leHBvcnRzLmNsZWFyID0gY2xlYXI7XG5mdW5jdGlvbiBldmVudEJydXNoKGUpIHtcbiAgICB2YXIgYSA9IGUuc2hpZnRLZXkgJiYgdXRpbF8xLmlzUmlnaHRCdXR0b24oZSkgPyAxIDogMDtcbiAgICB2YXIgYiA9IGUuYWx0S2V5ID8gMiA6IDA7XG4gICAgcmV0dXJuIGJydXNoZXNbYSArIGJdO1xufVxuZnVuY3Rpb24gbm90KGYpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgpIHsgcmV0dXJuICFmKHgpOyB9O1xufVxuZnVuY3Rpb24gYWRkU2hhcGUoZHJhd2FibGUsIGN1cikge1xuICAgIHZhciBzYW1lU2hhcGUgPSBmdW5jdGlvbiAocykge1xuICAgICAgICByZXR1cm4gcy5vcmlnID09PSBjdXIub3JpZyAmJiBzLmRlc3QgPT09IGN1ci5kZXN0O1xuICAgIH07XG4gICAgdmFyIHNpbWlsYXIgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKHNhbWVTaGFwZSlbMF07XG4gICAgaWYgKHNpbWlsYXIpXG4gICAgICAgIGRyYXdhYmxlLnNoYXBlcyA9IGRyYXdhYmxlLnNoYXBlcy5maWx0ZXIobm90KHNhbWVTaGFwZSkpO1xuICAgIGlmICghc2ltaWxhciB8fCBzaW1pbGFyLmJydXNoICE9PSBjdXIuYnJ1c2gpXG4gICAgICAgIGRyYXdhYmxlLnNoYXBlcy5wdXNoKGN1cik7XG4gICAgb25DaGFuZ2UoZHJhd2FibGUpO1xufVxuZnVuY3Rpb24gb25DaGFuZ2UoZHJhd2FibGUpIHtcbiAgICBpZiAoZHJhd2FibGUub25DaGFuZ2UpXG4gICAgICAgIGRyYXdhYmxlLm9uQ2hhbmdlKGRyYXdhYmxlLnNoYXBlcyk7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBkcmFnID0gcmVxdWlyZShcIi4vZHJhZ1wiKTtcbnZhciBkcmF3ID0gcmVxdWlyZShcIi4vZHJhd1wiKTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gYmluZEJvYXJkKHMpIHtcbiAgICBpZiAocy52aWV3T25seSlcbiAgICAgICAgcmV0dXJuO1xuICAgIHZhciBib2FyZEVsID0gcy5kb20uZWxlbWVudHMuYm9hcmQsIG9uU3RhcnQgPSBzdGFydERyYWdPckRyYXcocyk7XG4gICAgYm9hcmRFbC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgb25TdGFydCk7XG4gICAgYm9hcmRFbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvblN0YXJ0KTtcbiAgICBpZiAocy5kaXNhYmxlQ29udGV4dE1lbnUgfHwgcy5kcmF3YWJsZS5lbmFibGVkKSB7XG4gICAgICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpOyB9KTtcbiAgICB9XG59XG5leHBvcnRzLmJpbmRCb2FyZCA9IGJpbmRCb2FyZDtcbmZ1bmN0aW9uIGJpbmREb2N1bWVudChzLCByZWRyYXdBbGwpIHtcbiAgICB2YXIgdW5iaW5kcyA9IFtdO1xuICAgIGlmICghcy5kb20ucmVsYXRpdmUgJiYgcy5yZXNpemFibGUpIHtcbiAgICAgICAgdmFyIG9uUmVzaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcy5kb20uYm91bmRzLmNsZWFyKCk7XG4gICAgICAgICAgICB1dGlsXzEucmFmKHJlZHJhd0FsbCk7XG4gICAgICAgIH07XG4gICAgICAgIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LmJvZHksICdjaGVzc2dyb3VuZC5yZXNpemUnLCBvblJlc2l6ZSkpO1xuICAgIH1cbiAgICBpZiAoIXMudmlld09ubHkpIHtcbiAgICAgICAgdmFyIG9ubW92ZV8xID0gZHJhZ09yRHJhdyhzLCBkcmFnLm1vdmUsIGRyYXcubW92ZSk7XG4gICAgICAgIHZhciBvbmVuZF8xID0gZHJhZ09yRHJhdyhzLCBkcmFnLmVuZCwgZHJhdy5lbmQpO1xuICAgICAgICBbJ3RvdWNobW92ZScsICdtb3VzZW1vdmUnXS5mb3JFYWNoKGZ1bmN0aW9uIChldikgeyByZXR1cm4gdW5iaW5kcy5wdXNoKHVuYmluZGFibGUoZG9jdW1lbnQsIGV2LCBvbm1vdmVfMSkpOyB9KTtcbiAgICAgICAgWyd0b3VjaGVuZCcsICdtb3VzZXVwJ10uZm9yRWFjaChmdW5jdGlvbiAoZXYpIHsgcmV0dXJuIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LCBldiwgb25lbmRfMSkpOyB9KTtcbiAgICAgICAgdmFyIG9uU2Nyb2xsID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gcy5kb20uYm91bmRzLmNsZWFyKCk7IH07XG4gICAgICAgIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKHdpbmRvdywgJ3Njcm9sbCcsIG9uU2Nyb2xsLCB7IHBhc3NpdmU6IHRydWUgfSkpO1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZSh3aW5kb3csICdyZXNpemUnLCBvblNjcm9sbCwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHVuYmluZHMuZm9yRWFjaChmdW5jdGlvbiAoZikgeyByZXR1cm4gZigpOyB9KTsgfTtcbn1cbmV4cG9ydHMuYmluZERvY3VtZW50ID0gYmluZERvY3VtZW50O1xuZnVuY3Rpb24gdW5iaW5kYWJsZShlbCwgZXZlbnROYW1lLCBjYWxsYmFjaywgb3B0aW9ucykge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBjYWxsYmFjaywgb3B0aW9ucyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBjYWxsYmFjayk7IH07XG59XG5mdW5jdGlvbiBzdGFydERyYWdPckRyYXcocykge1xuICAgIHJldHVybiBmdW5jdGlvbiAoZSkge1xuICAgICAgICBpZiAocy5kcmFnZ2FibGUuY3VycmVudClcbiAgICAgICAgICAgIGRyYWcuY2FuY2VsKHMpO1xuICAgICAgICBlbHNlIGlmIChzLmRyYXdhYmxlLmN1cnJlbnQpXG4gICAgICAgICAgICBkcmF3LmNhbmNlbChzKTtcbiAgICAgICAgZWxzZSBpZiAoZS5zaGlmdEtleSB8fCB1dGlsXzEuaXNSaWdodEJ1dHRvbihlKSkge1xuICAgICAgICAgICAgaWYgKHMuZHJhd2FibGUuZW5hYmxlZClcbiAgICAgICAgICAgICAgICBkcmF3LnN0YXJ0KHMsIGUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFzLnZpZXdPbmx5KVxuICAgICAgICAgICAgZHJhZy5zdGFydChzLCBlKTtcbiAgICB9O1xufVxuZnVuY3Rpb24gZHJhZ09yRHJhdyhzLCB3aXRoRHJhZywgd2l0aERyYXcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgaWYgKGUuc2hpZnRLZXkgfHwgdXRpbF8xLmlzUmlnaHRCdXR0b24oZSkpIHtcbiAgICAgICAgICAgIGlmIChzLmRyYXdhYmxlLmVuYWJsZWQpXG4gICAgICAgICAgICAgICAgd2l0aERyYXcocywgZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXMudmlld09ubHkpXG4gICAgICAgICAgICB3aXRoRHJhZyhzLCBlKTtcbiAgICB9O1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiBleHBsb3Npb24oc3RhdGUsIGtleXMpIHtcbiAgICBzdGF0ZS5leHBsb2RpbmcgPSB7XG4gICAgICAgIHN0YWdlOiAxLFxuICAgICAgICBrZXlzOiBrZXlzXG4gICAgfTtcbiAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNldFN0YWdlKHN0YXRlLCAyKTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBzZXRTdGFnZShzdGF0ZSwgdW5kZWZpbmVkKTsgfSwgMTIwKTtcbiAgICB9LCAxMjApO1xufVxuZXhwb3J0cy5kZWZhdWx0ID0gZXhwbG9zaW9uO1xuZnVuY3Rpb24gc2V0U3RhZ2Uoc3RhdGUsIHN0YWdlKSB7XG4gICAgaWYgKHN0YXRlLmV4cGxvZGluZykge1xuICAgICAgICBpZiAoc3RhZ2UpXG4gICAgICAgICAgICBzdGF0ZS5leHBsb2Rpbmcuc3RhZ2UgPSBzdGFnZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc3RhdGUuZXhwbG9kaW5nID0gdW5kZWZpbmVkO1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbnZhciBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZXhwb3J0cy5pbml0aWFsID0gJ3JuYnFrYm5yL3BwcHBwcHBwLzgvOC84LzgvUFBQUFBQUFAvUk5CUUtCTlInO1xudmFyIHJvbGVzOCA9IHtcbiAgICBwOiAncGF3bicsIHI6ICdyb29rJywgbjogJ2tuaWdodCcsIGI6ICdiaXNob3AnLCBxOiAncXVlZW4nLCBrOiAna2luZycsIG06ICdtZXQnLCBmOiAnZmVyeicsIHM6ICdzaWx2ZXInLCBjOiAnY2FuY2VsbG9yJywgYTogJ2FyY2hiaXNob3AnLCBoOiAnaGF3aycsIGU6ICdlbGVwaGFudCdcbn07XG52YXIgcm9sZXM5ID0ge1xuICAgIHA6ICdwYXduJywgcjogJ3Jvb2snLCBuOiAna25pZ2h0JywgYjogJ2Jpc2hvcCcsIGs6ICdraW5nJywgZzogJ2dvbGQnLCBzOiAnc2lsdmVyJywgbDogJ2xhbmNlJ1xufTtcbnZhciByb2xlczEwID0ge1xuICAgIHA6ICdwYXduJywgcjogJ3Jvb2snLCBuOiAna25pZ2h0JywgYjogJ2Jpc2hvcCcsIGs6ICdraW5nJywgYzogJ2Nhbm5vbicsIGE6ICdhZHZpc29yJ1xufTtcbnZhciBsZXR0ZXJzOCA9IHtcbiAgICBwYXduOiAncCcsIHJvb2s6ICdyJywga25pZ2h0OiAnbicsIGJpc2hvcDogJ2InLCBxdWVlbjogJ3EnLCBraW5nOiAnaycsIG1ldDogJ20nLCBmZXJ6OiAnZicsIHNpbHZlcjogJ3MnLCBjYW5jZWxsb3I6ICdjJywgYXJjaGJpc2hvcDogJ2EnLCBoYXdrOiAnaCcsIGVsZXBoYW50OiAnZSdcbn07XG52YXIgbGV0dGVyczkgPSB7XG4gICAgcGF3bjogJ3AnLCByb29rOiAncicsIGtuaWdodDogJ24nLCBiaXNob3A6ICdiJywga2luZzogJ2snLCBnb2xkOiAnZycsIHNpbHZlcjogJ3MnLCBsYW5jZTogJ2wnLFxuICAgIHBwYXduOiAnK3AnLCBwa25pZ2h0OiAnK24nLCBwYmlzaG9wOiAnK2InLCBwcm9vazogJytyJywgcHNpbHZlcjogJytzJywgcGxhbmNlOiAnK2wnXG59O1xudmFyIGxldHRlcnMxMCA9IHtcbiAgICBwYXduOiAncCcsIHJvb2s6ICdyJywga25pZ2h0OiAnbicsIGJpc2hvcDogJ2InLCBraW5nOiAnaycsIGNhbm5vbjogJ2MnLCBhZHZpc29yOiAnYSdcbn07XG5mdW5jdGlvbiByZWFkKGZlbikge1xuICAgIGlmIChmZW4gPT09ICdzdGFydCcpXG4gICAgICAgIGZlbiA9IGV4cG9ydHMuaW5pdGlhbDtcbiAgICBpZiAoZmVuLmluZGV4T2YoJ1snKSAhPT0gLTEpXG4gICAgICAgIGZlbiA9IGZlbi5zbGljZSgwLCBmZW4uaW5kZXhPZignWycpKTtcbiAgICB2YXIgcGllY2VzID0ge307XG4gICAgdmFyIHJvdyA9IGZlbi5zcGxpdChcIi9cIikubGVuZ3RoO1xuICAgIHZhciBjb2wgPSAwO1xuICAgIHZhciBwcm9tb3RlZCA9IGZhbHNlO1xuICAgIHZhciByb2xlcyA9IHJvdyA9PT0gMTAgPyByb2xlczEwIDogcm93ID09PSA5ID8gcm9sZXM5IDogcm9sZXM4O1xuICAgIHZhciBmaXJzdFJhbmtJczAgPSByb3cgPT09IDEwO1xuICAgIHZhciBzaG9naSA9IHJvdyA9PT0gOTtcbiAgICBmb3IgKHZhciBfaSA9IDAsIGZlbl8xID0gZmVuOyBfaSA8IGZlbl8xLmxlbmd0aDsgX2krKykge1xuICAgICAgICB2YXIgYyA9IGZlbl8xW19pXTtcbiAgICAgICAgc3dpdGNoIChjKSB7XG4gICAgICAgICAgICBjYXNlICcgJzogcmV0dXJuIHBpZWNlcztcbiAgICAgICAgICAgIGNhc2UgJy8nOlxuICAgICAgICAgICAgICAgIC0tcm93O1xuICAgICAgICAgICAgICAgIGlmIChyb3cgPT09IDApXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwaWVjZXM7XG4gICAgICAgICAgICAgICAgY29sID0gMDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJysnOlxuICAgICAgICAgICAgICAgIHByb21vdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ34nOlxuICAgICAgICAgICAgICAgIHZhciBwaWVjZSA9IHBpZWNlc1tjZy5maWxlc1tjb2xdICsgY2cucmFua3NbZmlyc3RSYW5rSXMwID8gcm93IDogcm93ICsgMV1dO1xuICAgICAgICAgICAgICAgIGlmIChwaWVjZSlcbiAgICAgICAgICAgICAgICAgICAgcGllY2UucHJvbW90ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB2YXIgbmIgPSBjLmNoYXJDb2RlQXQoMCk7XG4gICAgICAgICAgICAgICAgaWYgKG5iIDwgNTgpXG4gICAgICAgICAgICAgICAgICAgIGNvbCArPSAoYyA9PT0gJzAnKSA/IDkgOiBuYiAtIDQ4O1xuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICArK2NvbDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJvbGUgPSBjLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwaWVjZV8xID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZXNbcm9sZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogKGMgPT09IHJvbGUgPyBzaG9naSA/ICd3aGl0ZScgOiAnYmxhY2snIDogc2hvZ2kgPyAnYmxhY2snIDogJ3doaXRlJylcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb21vdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZV8xLnJvbGUgPSAncCcgKyBwaWVjZV8xLnJvbGU7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZV8xLnByb21vdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb21vdGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2hvZ2kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBpZWNlc1tjZy5maWxlc1sxMCAtIGNvbCAtIDFdICsgY2cucmFua3NbMTAgLSByb3ddXSA9IHBpZWNlXzE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZXNbY2cuZmlsZXNbY29sIC0gMV0gKyBjZy5yYW5rc1tmaXJzdFJhbmtJczAgPyByb3cgLSAxIDogcm93XV0gPSBwaWVjZV8xO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpZWNlcztcbn1cbmV4cG9ydHMucmVhZCA9IHJlYWQ7XG5mdW5jdGlvbiB3cml0ZShwaWVjZXMsIGdlb20pIHtcbiAgICB2YXIgaGVpZ2h0ID0gY2cuZGltZW5zaW9uc1tnZW9tXS5oZWlnaHQ7XG4gICAgdmFyIGxldHRlcnMgPSB7fTtcbiAgICBzd2l0Y2ggKGhlaWdodCkge1xuICAgICAgICBjYXNlIDEwOlxuICAgICAgICAgICAgbGV0dGVycyA9IGxldHRlcnMxMDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDk6XG4gICAgICAgICAgICBsZXR0ZXJzID0gbGV0dGVyczk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGxldHRlcnMgPSBsZXR0ZXJzODtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICA7XG4gICAgcmV0dXJuIHV0aWxfMS5pbnZOUmFua3MubWFwKGZ1bmN0aW9uICh5KSB7IHJldHVybiB1dGlsXzEuTlJhbmtzLm1hcChmdW5jdGlvbiAoeCkge1xuICAgICAgICB2YXIgcGllY2UgPSBwaWVjZXNbdXRpbF8xLnBvczJrZXkoW3gsIHldLCBnZW9tKV07XG4gICAgICAgIGlmIChwaWVjZSkge1xuICAgICAgICAgICAgdmFyIGxldHRlciA9IGxldHRlcnNbcGllY2Uucm9sZV07XG4gICAgICAgICAgICByZXR1cm4gcGllY2UuY29sb3IgPT09ICd3aGl0ZScgPyBsZXR0ZXIudG9VcHBlckNhc2UoKSA6IGxldHRlcjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gJzEnO1xuICAgIH0pLmpvaW4oJycpOyB9KS5qb2luKCcvJykucmVwbGFjZSgvMXsyLH0vZywgZnVuY3Rpb24gKHMpIHsgcmV0dXJuIHMubGVuZ3RoLnRvU3RyaW5nKCk7IH0pO1xufVxuZXhwb3J0cy53cml0ZSA9IHdyaXRlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmZ1bmN0aW9uIGRpZmYoYSwgYikge1xuICAgIHJldHVybiBNYXRoLmFicyhhIC0gYik7XG59XG5mdW5jdGlvbiBwYXduKGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gZGlmZih4MSwgeDIpIDwgMiAmJiAoY29sb3IgPT09ICd3aGl0ZScgPyAoeTIgPT09IHkxICsgMSB8fCAoeTEgPD0gMiAmJiB5MiA9PT0gKHkxICsgMikgJiYgeDEgPT09IHgyKSkgOiAoeTIgPT09IHkxIC0gMSB8fCAoeTEgPj0gNyAmJiB5MiA9PT0gKHkxIC0gMikgJiYgeDEgPT09IHgyKSkpOyB9O1xufVxudmFyIGtuaWdodCA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHZhciB4ZCA9IGRpZmYoeDEsIHgyKTtcbiAgICB2YXIgeWQgPSBkaWZmKHkxLCB5Mik7XG4gICAgcmV0dXJuICh4ZCA9PT0gMSAmJiB5ZCA9PT0gMikgfHwgKHhkID09PSAyICYmIHlkID09PSAxKTtcbn07XG52YXIgYmlzaG9wID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpO1xufTtcbnZhciByb29rID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIHgxID09PSB4MiB8fCB5MSA9PT0geTI7XG59O1xudmFyIHF1ZWVuID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIGJpc2hvcCh4MSwgeTEsIHgyLCB5MikgfHwgcm9vayh4MSwgeTEsIHgyLCB5Mik7XG59O1xuZnVuY3Rpb24ga2luZyhjb2xvciwgcm9va0ZpbGVzLCBjYW5DYXN0bGUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7IHJldHVybiAoZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyKSB8fCAoY2FuQ2FzdGxlICYmIHkxID09PSB5MiAmJiB5MSA9PT0gKGNvbG9yID09PSAnd2hpdGUnID8gMSA6IDgpICYmICgoeDEgPT09IDUgJiYgKHgyID09PSAzIHx8IHgyID09PSA3KSkgfHwgdXRpbC5jb250YWluc1gocm9va0ZpbGVzLCB4MikpKTsgfTtcbn1cbnZhciBtZXQgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpID09PSBkaWZmKHkxLCB5MikgJiYgZGlmZih4MSwgeDIpID09PSAxO1xufTtcbnZhciBhcmNoYmlzaG9wID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIGJpc2hvcCh4MSwgeTEsIHgyLCB5MikgfHwga25pZ2h0KHgxLCB5MSwgeDIsIHkyKTtcbn07XG52YXIgY2FuY2VsbG9yID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIHJvb2soeDEsIHkxLCB4MiwgeTIpIHx8IGtuaWdodCh4MSwgeTEsIHgyLCB5Mik7XG59O1xuZnVuY3Rpb24gbGFuY2UoY29sb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7IHJldHVybiAoeDIgPT09IHgxICYmIChjb2xvciA9PT0gJ3doaXRlJyA/IHkyID4geTEgOiB5MiA8IHkxKSk7IH07XG59XG5mdW5jdGlvbiBzaWx2ZXIoY29sb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7IHJldHVybiAobWV0KHgxLCB5MSwgeDIsIHkyKSB8fCAoeDEgPT09IHgyICYmIGNvbG9yID09PSAnd2hpdGUnID8geTIgPT09IHkxICsgMSA6IHkyID09PSB5MSAtIDEpKTsgfTtcbn1cbmZ1bmN0aW9uIGdvbGQoY29sb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7IHJldHVybiAoZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyICYmIChjb2xvciA9PT0gJ3doaXRlJyA/XG4gICAgICAgICEoKHgyID09PSB4MSAtIDEgJiYgeTIgPT09IHkxIC0gMSkgfHwgKHgyID09PSB4MSArIDEgJiYgeTIgPT09IHkxIC0gMSkpIDpcbiAgICAgICAgISgoeDIgPT09IHgxICsgMSAmJiB5MiA9PT0geTEgKyAxKSB8fCAoeDIgPT09IHgxIC0gMSAmJiB5MiA9PT0geTEgKyAxKSkpKTsgfTtcbn1cbmZ1bmN0aW9uIHNwYXduKGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gKHgyID09PSB4MSAmJiBjb2xvciA9PT0gJ3doaXRlJyA/IHkyID09PSB5MSArIDEgOiB5MiA9PT0geTEgLSAxKTsgfTtcbn1cbmZ1bmN0aW9uIHNrbmlnaHQoY29sb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7IHJldHVybiBjb2xvciA9PT0gJ3doaXRlJyA/XG4gICAgICAgICh5MiA9PT0geTEgKyAyICYmIHgyID09PSB4MSAtIDEgfHwgeTIgPT09IHkxICsgMiAmJiB4MiA9PT0geDEgKyAxKSA6XG4gICAgICAgICh5MiA9PT0geTEgLSAyICYmIHgyID09PSB4MSAtIDEgfHwgeTIgPT09IHkxIC0gMiAmJiB4MiA9PT0geDEgKyAxKTsgfTtcbn1cbnZhciBwcm9vayA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiByb29rKHgxLCB5MSwgeDIsIHkyKSB8fCAoZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyKTtcbn07XG52YXIgcGJpc2hvcCA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBiaXNob3AoeDEsIHkxLCB4MiwgeTIpIHx8IChkaWZmKHgxLCB4MikgPCAyICYmIGRpZmYoeTEsIHkyKSA8IDIpO1xufTtcbnZhciBza2luZyA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPCAyICYmIGRpZmYoeTEsIHkyKSA8IDI7XG59O1xuZnVuY3Rpb24geHBhd24oY29sb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7IHJldHVybiAoeDIgPT09IHgxICYmIGNvbG9yID09PSAnd2hpdGUnID8geTIgPT09IHkxICsgMSA6IHkyID09PSB5MSAtIDEpOyB9O1xufVxudmFyIHhiaXNob3AgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpID09PSBkaWZmKHkxLCB5MikgJiYgZGlmZih4MSwgeDIpID09PSAyO1xufTtcbnZhciBhZHZpc29yID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpICYmIGRpZmYoeDEsIHgyKSA9PT0gMTtcbn07XG52YXIgeGtpbmcgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICByZXR1cm4gKHgxID09PSB4MiB8fCB5MSA9PT0geTIpICYmIGRpZmYoeDEsIHgyKSA9PT0gMTtcbn07XG5mdW5jdGlvbiByb29rRmlsZXNPZihwaWVjZXMsIGNvbG9yLCBmaXJzdFJhbmtJczApIHtcbiAgICByZXR1cm4gT2JqZWN0LmtleXMocGllY2VzKS5maWx0ZXIoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB2YXIgcGllY2UgPSBwaWVjZXNba2V5XTtcbiAgICAgICAgcmV0dXJuIHBpZWNlICYmIHBpZWNlLmNvbG9yID09PSBjb2xvciAmJiBwaWVjZS5yb2xlID09PSAncm9vayc7XG4gICAgfSkubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMClbMF07IH0pO1xufVxuZnVuY3Rpb24gcHJlbW92ZShwaWVjZXMsIGtleSwgY2FuQ2FzdGxlLCBnZW9tKSB7XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IGNnLmRpbWVuc2lvbnNbZ2VvbV0uaGVpZ2h0ID09PSAxMDtcbiAgICB2YXIgcGllY2UgPSBwaWVjZXNba2V5XSwgcG9zID0gdXRpbC5rZXkycG9zKGtleSwgZmlyc3RSYW5rSXMwKTtcbiAgICB2YXIgbW9iaWxpdHk7XG4gICAgc3dpdGNoIChnZW9tKSB7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgIHN3aXRjaCAocGllY2Uucm9sZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Bhd24nOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHhwYXduKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnY2Fubm9uJzpcbiAgICAgICAgICAgICAgICBjYXNlICdyb29rJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSByb29rO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdrbmlnaHQnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGtuaWdodDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYmlzaG9wJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSB4YmlzaG9wO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdhZHZpc29yJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBhZHZpc29yO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdraW5nJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSB4a2luZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgIHN3aXRjaCAocGllY2Uucm9sZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Bhd24nOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNwYXduKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna25pZ2h0JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBza25pZ2h0KHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYmlzaG9wJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Jvb2snOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHJvb2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tpbmcnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNraW5nO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzaWx2ZXInOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNpbHZlcihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3BwYXduJzpcbiAgICAgICAgICAgICAgICBjYXNlICdwbGFuY2UnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3BrbmlnaHQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3BzaWx2ZXInOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2dvbGQnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGdvbGQocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdsYW5jZSc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gbGFuY2UocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdwcm9vayc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcHJvb2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3BiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHBiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgc3dpdGNoIChwaWVjZS5yb2xlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAncGF3bic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcGF3bihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tuaWdodCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0ga25pZ2h0O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdiaXNob3AnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGJpc2hvcDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncm9vayc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcm9vaztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncXVlZW4nOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHF1ZWVuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdraW5nJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBraW5nKHBpZWNlLmNvbG9yLCByb29rRmlsZXNPZihwaWVjZXMsIHBpZWNlLmNvbG9yLCBmaXJzdFJhbmtJczApLCBjYW5DYXN0bGUpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdoYXdrJzpcbiAgICAgICAgICAgICAgICBjYXNlICdhcmNoYmlzaG9wJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBhcmNoYmlzaG9wO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdlbGVwaGFudCc6XG4gICAgICAgICAgICAgICAgY2FzZSAnY2FuY2VsbG9yJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBjYW5jZWxsb3I7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ21ldCc6XG4gICAgICAgICAgICAgICAgY2FzZSAnZmVyeic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gbWV0O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzaWx2ZXInOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHNpbHZlcihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgO1xuICAgIH1cbiAgICA7XG4gICAgdmFyIGFsbGtleXMgPSB1dGlsLmFsbEtleXNbZ2VvbV07XG4gICAgdmFyIHBvczJrZXlHZW9tID0gZnVuY3Rpb24gKGdlb20pIHsgcmV0dXJuIChmdW5jdGlvbiAocG9zKSB7IHJldHVybiB1dGlsLnBvczJrZXkocG9zLCBnZW9tKTsgfSk7IH07XG4gICAgdmFyIHBvczJrZXkgPSBwb3Mya2V5R2VvbShnZW9tKTtcbiAgICB2YXIga2V5MnBvc1JhbmswID0gZnVuY3Rpb24gKGZpcnN0cmFuazApIHsgcmV0dXJuIChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdHJhbmswKTsgfSk7IH07XG4gICAgdmFyIGtleTJwb3MgPSBrZXkycG9zUmFuazAoZmlyc3RSYW5rSXMwKTtcbiAgICByZXR1cm4gYWxsa2V5cy5tYXAoa2V5MnBvcykuZmlsdGVyKGZ1bmN0aW9uIChwb3MyKSB7XG4gICAgICAgIHJldHVybiAocG9zWzBdICE9PSBwb3MyWzBdIHx8IHBvc1sxXSAhPT0gcG9zMlsxXSkgJiYgbW9iaWxpdHkocG9zWzBdLCBwb3NbMV0sIHBvczJbMF0sIHBvczJbMV0pO1xuICAgIH0pLm1hcChwb3Mya2V5KTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IHByZW1vdmU7XG47XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xudmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gcmVuZGVyKHMpIHtcbiAgICB2YXIgZmlyc3RSYW5rSXMwID0gcy5kaW1lbnNpb25zLmhlaWdodCA9PT0gMTA7XG4gICAgdmFyIGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBwb3NUb1RyYW5zbGF0ZSA9IHMuZG9tLnJlbGF0aXZlID8gdXRpbC5wb3NUb1RyYW5zbGF0ZVJlbCA6IHV0aWwucG9zVG9UcmFuc2xhdGVBYnMocy5kb20uYm91bmRzKCksIHMuZGltZW5zaW9ucyksIHRyYW5zbGF0ZSA9IHMuZG9tLnJlbGF0aXZlID8gdXRpbC50cmFuc2xhdGVSZWwgOiB1dGlsLnRyYW5zbGF0ZUFicywgYm9hcmRFbCA9IHMuZG9tLmVsZW1lbnRzLmJvYXJkLCBwaWVjZXMgPSBzLnBpZWNlcywgY3VyQW5pbSA9IHMuYW5pbWF0aW9uLmN1cnJlbnQsIGFuaW1zID0gY3VyQW5pbSA/IGN1ckFuaW0ucGxhbi5hbmltcyA6IHt9LCBmYWRpbmdzID0gY3VyQW5pbSA/IGN1ckFuaW0ucGxhbi5mYWRpbmdzIDoge30sIGN1ckRyYWcgPSBzLmRyYWdnYWJsZS5jdXJyZW50LCBzcXVhcmVzID0gY29tcHV0ZVNxdWFyZUNsYXNzZXMocyksIHNhbWVQaWVjZXMgPSB7fSwgc2FtZVNxdWFyZXMgPSB7fSwgbW92ZWRQaWVjZXMgPSB7fSwgbW92ZWRTcXVhcmVzID0ge30sIHBpZWNlc0tleXMgPSBPYmplY3Qua2V5cyhwaWVjZXMpO1xuICAgIHZhciBrLCBwLCBlbCwgcGllY2VBdEtleSwgZWxQaWVjZU5hbWUsIGFuaW0sIGZhZGluZywgcE12ZHNldCwgcE12ZCwgc012ZHNldCwgc012ZDtcbiAgICBlbCA9IGJvYXJkRWwuZmlyc3RDaGlsZDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgayA9IGVsLmNnS2V5O1xuICAgICAgICBpZiAoaXNQaWVjZU5vZGUoZWwpKSB7XG4gICAgICAgICAgICBwaWVjZUF0S2V5ID0gcGllY2VzW2tdO1xuICAgICAgICAgICAgYW5pbSA9IGFuaW1zW2tdO1xuICAgICAgICAgICAgZmFkaW5nID0gZmFkaW5nc1trXTtcbiAgICAgICAgICAgIGVsUGllY2VOYW1lID0gZWwuY2dQaWVjZTtcbiAgICAgICAgICAgIGlmIChlbC5jZ0RyYWdnaW5nICYmICghY3VyRHJhZyB8fCBjdXJEcmFnLm9yaWcgIT09IGspKSB7XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCksIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgIGVsLmNnRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZmFkaW5nICYmIGVsLmNnRmFkaW5nKSB7XG4gICAgICAgICAgICAgICAgZWwuY2dGYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdmYWRpbmcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwaWVjZUF0S2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW0gJiYgZWwuY2dBbmltYXRpbmcgJiYgZWxQaWVjZU5hbWUgPT09IHBpZWNlTmFtZU9mKHBpZWNlQXRLZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwb3MgPSB1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMF0gKz0gYW5pbVsyXTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzFdICs9IGFuaW1bM107XG4gICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5hZGQoJ2FuaW0nKTtcbiAgICAgICAgICAgICAgICAgICAgdHJhbnNsYXRlKGVsLCBwb3NUb1RyYW5zbGF0ZShwb3MsIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChlbC5jZ0FuaW1hdGluZykge1xuICAgICAgICAgICAgICAgICAgICBlbC5jZ0FuaW1hdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdhbmltJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShlbCwgcG9zVG9UcmFuc2xhdGUodXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKSwgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzLmFkZFBpZWNlWkluZGV4KVxuICAgICAgICAgICAgICAgICAgICAgICAgZWwuc3R5bGUuekluZGV4ID0gcG9zWkluZGV4KHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCksIGFzV2hpdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZWxQaWVjZU5hbWUgPT09IHBpZWNlTmFtZU9mKHBpZWNlQXRLZXkpICYmICghZmFkaW5nIHx8ICFlbC5jZ0ZhZGluZykpIHtcbiAgICAgICAgICAgICAgICAgICAgc2FtZVBpZWNlc1trXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmFkaW5nICYmIGVsUGllY2VOYW1lID09PSBwaWVjZU5hbWVPZihmYWRpbmcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdmYWRpbmcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNnRmFkaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdLnB1c2goZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXSA9IFtlbF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAobW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdKVxuICAgICAgICAgICAgICAgICAgICBtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0ucHVzaChlbCk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0gPSBbZWxdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGlzU3F1YXJlTm9kZShlbCkpIHtcbiAgICAgICAgICAgIHZhciBjbiA9IGVsLmNsYXNzTmFtZTtcbiAgICAgICAgICAgIGlmIChzcXVhcmVzW2tdID09PSBjbilcbiAgICAgICAgICAgICAgICBzYW1lU3F1YXJlc1trXSA9IHRydWU7XG4gICAgICAgICAgICBlbHNlIGlmIChtb3ZlZFNxdWFyZXNbY25dKVxuICAgICAgICAgICAgICAgIG1vdmVkU3F1YXJlc1tjbl0ucHVzaChlbCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbW92ZWRTcXVhcmVzW2NuXSA9IFtlbF07XG4gICAgICAgIH1cbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yICh2YXIgc2sgaW4gc3F1YXJlcykge1xuICAgICAgICBpZiAoIXNhbWVTcXVhcmVzW3NrXSkge1xuICAgICAgICAgICAgc012ZHNldCA9IG1vdmVkU3F1YXJlc1tzcXVhcmVzW3NrXV07XG4gICAgICAgICAgICBzTXZkID0gc012ZHNldCAmJiBzTXZkc2V0LnBvcCgpO1xuICAgICAgICAgICAgdmFyIHRyYW5zbGF0aW9uID0gcG9zVG9UcmFuc2xhdGUodXRpbF8xLmtleTJwb3Moc2ssIGZpcnN0UmFua0lzMCksIGFzV2hpdGUsIHMuZGltZW5zaW9ucyk7XG4gICAgICAgICAgICBpZiAoc012ZCkge1xuICAgICAgICAgICAgICAgIHNNdmQuY2dLZXkgPSBzaztcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUoc012ZCwgdHJhbnNsYXRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHNxdWFyZU5vZGUgPSB1dGlsXzEuY3JlYXRlRWwoJ3NxdWFyZScsIHNxdWFyZXNbc2tdKTtcbiAgICAgICAgICAgICAgICBzcXVhcmVOb2RlLmNnS2V5ID0gc2s7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHNxdWFyZU5vZGUsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgICAgICBib2FyZEVsLmluc2VydEJlZm9yZShzcXVhcmVOb2RlLCBib2FyZEVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAodmFyIGogaW4gcGllY2VzS2V5cykge1xuICAgICAgICBrID0gcGllY2VzS2V5c1tqXTtcbiAgICAgICAgcCA9IHBpZWNlc1trXTtcbiAgICAgICAgYW5pbSA9IGFuaW1zW2tdO1xuICAgICAgICBpZiAoIXNhbWVQaWVjZXNba10pIHtcbiAgICAgICAgICAgIHBNdmRzZXQgPSBtb3ZlZFBpZWNlc1twaWVjZU5hbWVPZihwKV07XG4gICAgICAgICAgICBwTXZkID0gcE12ZHNldCAmJiBwTXZkc2V0LnBvcCgpO1xuICAgICAgICAgICAgaWYgKHBNdmQpIHtcbiAgICAgICAgICAgICAgICBwTXZkLmNnS2V5ID0gaztcbiAgICAgICAgICAgICAgICBpZiAocE12ZC5jZ0ZhZGluZykge1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNsYXNzTGlzdC5yZW1vdmUoJ2ZhZGluZycpO1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNnRmFkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBwb3MgPSB1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApO1xuICAgICAgICAgICAgICAgIGlmIChzLmFkZFBpZWNlWkluZGV4KVxuICAgICAgICAgICAgICAgICAgICBwTXZkLnN0eWxlLnpJbmRleCA9IHBvc1pJbmRleChwb3MsIGFzV2hpdGUpO1xuICAgICAgICAgICAgICAgIGlmIChhbmltKSB7XG4gICAgICAgICAgICAgICAgICAgIHBNdmQuY2dBbmltYXRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNsYXNzTGlzdC5hZGQoJ2FuaW0nKTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUocE12ZCwgcG9zVG9UcmFuc2xhdGUocG9zLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBwaWVjZU5hbWUgPSBwaWVjZU5hbWVPZihwKSwgcGllY2VOb2RlID0gdXRpbF8xLmNyZWF0ZUVsKCdwaWVjZScsIHBpZWNlTmFtZSksIHBvcyA9IHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCk7XG4gICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnUGllY2UgPSBwaWVjZU5hbWU7XG4gICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnS2V5ID0gaztcbiAgICAgICAgICAgICAgICBpZiAoYW5pbSkge1xuICAgICAgICAgICAgICAgICAgICBwaWVjZU5vZGUuY2dBbmltYXRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMF0gKz0gYW5pbVsyXTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzFdICs9IGFuaW1bM107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShwaWVjZU5vZGUsIHBvc1RvVHJhbnNsYXRlKHBvcywgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICAgICAgaWYgKHMuYWRkUGllY2VaSW5kZXgpXG4gICAgICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5zdHlsZS56SW5kZXggPSBwb3NaSW5kZXgocG9zLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICBib2FyZEVsLmFwcGVuZENoaWxkKHBpZWNlTm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yICh2YXIgaSBpbiBtb3ZlZFBpZWNlcylcbiAgICAgICAgcmVtb3ZlTm9kZXMocywgbW92ZWRQaWVjZXNbaV0pO1xuICAgIGZvciAodmFyIGkgaW4gbW92ZWRTcXVhcmVzKVxuICAgICAgICByZW1vdmVOb2RlcyhzLCBtb3ZlZFNxdWFyZXNbaV0pO1xufVxuZXhwb3J0cy5kZWZhdWx0ID0gcmVuZGVyO1xuZnVuY3Rpb24gaXNQaWVjZU5vZGUoZWwpIHtcbiAgICByZXR1cm4gZWwudGFnTmFtZSA9PT0gJ1BJRUNFJztcbn1cbmZ1bmN0aW9uIGlzU3F1YXJlTm9kZShlbCkge1xuICAgIHJldHVybiBlbC50YWdOYW1lID09PSAnU1FVQVJFJztcbn1cbmZ1bmN0aW9uIHJlbW92ZU5vZGVzKHMsIG5vZGVzKSB7XG4gICAgZm9yICh2YXIgaSBpbiBub2RlcylcbiAgICAgICAgcy5kb20uZWxlbWVudHMuYm9hcmQucmVtb3ZlQ2hpbGQobm9kZXNbaV0pO1xufVxuZnVuY3Rpb24gcG9zWkluZGV4KHBvcywgYXNXaGl0ZSkge1xuICAgIHZhciB6ID0gMiArIChwb3NbMV0gLSAxKSAqIDggKyAoOCAtIHBvc1swXSk7XG4gICAgaWYgKGFzV2hpdGUpXG4gICAgICAgIHogPSA2NyAtIHo7XG4gICAgcmV0dXJuIHogKyAnJztcbn1cbmZ1bmN0aW9uIHBpZWNlTmFtZU9mKHBpZWNlKSB7XG4gICAgcmV0dXJuIHBpZWNlLmNvbG9yICsgXCIgXCIgKyBwaWVjZS5yb2xlO1xufVxuZnVuY3Rpb24gY29tcHV0ZVNxdWFyZUNsYXNzZXMocykge1xuICAgIHZhciBzcXVhcmVzID0ge307XG4gICAgdmFyIGksIGs7XG4gICAgaWYgKHMubGFzdE1vdmUgJiYgcy5oaWdobGlnaHQubGFzdE1vdmUpXG4gICAgICAgIGZvciAoaSBpbiBzLmxhc3RNb3ZlKSB7XG4gICAgICAgICAgICBpZiAocy5sYXN0TW92ZVtpXSAhPSAnYTAnKSB7XG4gICAgICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMubGFzdE1vdmVbaV0sICdsYXN0LW1vdmUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIGlmIChzLmNoZWNrICYmIHMuaGlnaGxpZ2h0LmNoZWNrKVxuICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcy5jaGVjaywgJ2NoZWNrJyk7XG4gICAgaWYgKHMuc2VsZWN0ZWQpIHtcbiAgICAgICAgaWYgKHMuc2VsZWN0ZWQgIT0gJ2EwJykge1xuICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMuc2VsZWN0ZWQsICdzZWxlY3RlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzLm1vdmFibGUuc2hvd0Rlc3RzKSB7XG4gICAgICAgICAgICB2YXIgZGVzdHMgPSBzLm1vdmFibGUuZGVzdHMgJiYgcy5tb3ZhYmxlLmRlc3RzW3Muc2VsZWN0ZWRdO1xuICAgICAgICAgICAgaWYgKGRlc3RzKVxuICAgICAgICAgICAgICAgIGZvciAoaSBpbiBkZXN0cykge1xuICAgICAgICAgICAgICAgICAgICBrID0gZGVzdHNbaV07XG4gICAgICAgICAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAnbW92ZS1kZXN0JyArIChzLnBpZWNlc1trXSA/ICcgb2MnIDogJycpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgcERlc3RzID0gcy5wcmVtb3ZhYmxlLmRlc3RzO1xuICAgICAgICAgICAgaWYgKHBEZXN0cylcbiAgICAgICAgICAgICAgICBmb3IgKGkgaW4gcERlc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIGsgPSBwRGVzdHNbaV07XG4gICAgICAgICAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAncHJlbW92ZS1kZXN0JyArIChzLnBpZWNlc1trXSA/ICcgb2MnIDogJycpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdmFyIHByZW1vdmUgPSBzLnByZW1vdmFibGUuY3VycmVudDtcbiAgICBpZiAocHJlbW92ZSlcbiAgICAgICAgZm9yIChpIGluIHByZW1vdmUpXG4gICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcHJlbW92ZVtpXSwgJ2N1cnJlbnQtcHJlbW92ZScpO1xuICAgIGVsc2UgaWYgKHMucHJlZHJvcHBhYmxlLmN1cnJlbnQpXG4gICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLnByZWRyb3BwYWJsZS5jdXJyZW50LmtleSwgJ2N1cnJlbnQtcHJlbW92ZScpO1xuICAgIHZhciBvID0gcy5leHBsb2Rpbmc7XG4gICAgaWYgKG8pXG4gICAgICAgIGZvciAoaSBpbiBvLmtleXMpXG4gICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgby5rZXlzW2ldLCAnZXhwbG9kaW5nJyArIG8uc3RhZ2UpO1xuICAgIHJldHVybiBzcXVhcmVzO1xufVxuZnVuY3Rpb24gYWRkU3F1YXJlKHNxdWFyZXMsIGtleSwga2xhc3MpIHtcbiAgICBpZiAoc3F1YXJlc1trZXldKVxuICAgICAgICBzcXVhcmVzW2tleV0gKz0gJyAnICsga2xhc3M7XG4gICAgZWxzZVxuICAgICAgICBzcXVhcmVzW2tleV0gPSBrbGFzcztcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIGZlbiA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gZGVmYXVsdHMoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcGllY2VzOiBmZW4ucmVhZChmZW4uaW5pdGlhbCksXG4gICAgICAgIG9yaWVudGF0aW9uOiAnd2hpdGUnLFxuICAgICAgICB0dXJuQ29sb3I6ICd3aGl0ZScsXG4gICAgICAgIGNvb3JkaW5hdGVzOiB0cnVlLFxuICAgICAgICBhdXRvQ2FzdGxlOiB0cnVlLFxuICAgICAgICB2aWV3T25seTogZmFsc2UsXG4gICAgICAgIGRpc2FibGVDb250ZXh0TWVudTogZmFsc2UsXG4gICAgICAgIHJlc2l6YWJsZTogdHJ1ZSxcbiAgICAgICAgYWRkUGllY2VaSW5kZXg6IGZhbHNlLFxuICAgICAgICBwaWVjZUtleTogZmFsc2UsXG4gICAgICAgIGhpZ2hsaWdodDoge1xuICAgICAgICAgICAgbGFzdE1vdmU6IHRydWUsXG4gICAgICAgICAgICBjaGVjazogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBhbmltYXRpb246IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBkdXJhdGlvbjogMjAwXG4gICAgICAgIH0sXG4gICAgICAgIG1vdmFibGU6IHtcbiAgICAgICAgICAgIGZyZWU6IHRydWUsXG4gICAgICAgICAgICBjb2xvcjogJ2JvdGgnLFxuICAgICAgICAgICAgc2hvd0Rlc3RzOiB0cnVlLFxuICAgICAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgICAgIHJvb2tDYXN0bGU6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgcHJlbW92YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcbiAgICAgICAgICAgIGNhc3RsZTogdHJ1ZSxcbiAgICAgICAgICAgIGV2ZW50czoge31cbiAgICAgICAgfSxcbiAgICAgICAgcHJlZHJvcHBhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgIGV2ZW50czoge31cbiAgICAgICAgfSxcbiAgICAgICAgZHJhZ2dhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgZGlzdGFuY2U6IDMsXG4gICAgICAgICAgICBhdXRvRGlzdGFuY2U6IHRydWUsXG4gICAgICAgICAgICBjZW50ZXJQaWVjZTogdHJ1ZSxcbiAgICAgICAgICAgIHNob3dHaG9zdDogdHJ1ZSxcbiAgICAgICAgICAgIGRlbGV0ZU9uRHJvcE9mZjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBzdGF0czoge1xuICAgICAgICAgICAgZHJhZ2dlZDogISgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpLFxuICAgICAgICAgICAgdG91Y2hlZDogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgZHJhd2FibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICAgICAgZXJhc2VPbkNsaWNrOiB0cnVlLFxuICAgICAgICAgICAgc2hhcGVzOiBbXSxcbiAgICAgICAgICAgIGF1dG9TaGFwZXM6IFtdLFxuICAgICAgICAgICAgYnJ1c2hlczoge1xuICAgICAgICAgICAgICAgIGdyZWVuOiB7IGtleTogJ2cnLCBjb2xvcjogJyMxNTc4MUInLCBvcGFjaXR5OiAxLCBsaW5lV2lkdGg6IDEwIH0sXG4gICAgICAgICAgICAgICAgcmVkOiB7IGtleTogJ3InLCBjb2xvcjogJyM4ODIwMjAnLCBvcGFjaXR5OiAxLCBsaW5lV2lkdGg6IDEwIH0sXG4gICAgICAgICAgICAgICAgYmx1ZTogeyBrZXk6ICdiJywgY29sb3I6ICcjMDAzMDg4Jywgb3BhY2l0eTogMSwgbGluZVdpZHRoOiAxMCB9LFxuICAgICAgICAgICAgICAgIHllbGxvdzogeyBrZXk6ICd5JywgY29sb3I6ICcjZTY4ZjAwJywgb3BhY2l0eTogMSwgbGluZVdpZHRoOiAxMCB9LFxuICAgICAgICAgICAgICAgIHBhbGVCbHVlOiB7IGtleTogJ3BiJywgY29sb3I6ICcjMDAzMDg4Jywgb3BhY2l0eTogMC40LCBsaW5lV2lkdGg6IDE1IH0sXG4gICAgICAgICAgICAgICAgcGFsZUdyZWVuOiB7IGtleTogJ3BnJywgY29sb3I6ICcjMTU3ODFCJywgb3BhY2l0eTogMC40LCBsaW5lV2lkdGg6IDE1IH0sXG4gICAgICAgICAgICAgICAgcGFsZVJlZDogeyBrZXk6ICdwcicsIGNvbG9yOiAnIzg4MjAyMCcsIG9wYWNpdHk6IDAuNCwgbGluZVdpZHRoOiAxNSB9LFxuICAgICAgICAgICAgICAgIHBhbGVHcmV5OiB7IGtleTogJ3BncicsIGNvbG9yOiAnIzRhNGE0YScsIG9wYWNpdHk6IDAuMzUsIGxpbmVXaWR0aDogMTUgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBpZWNlczoge1xuICAgICAgICAgICAgICAgIGJhc2VVcmw6ICdodHRwczovL2xpY2hlc3MxLm9yZy9hc3NldHMvcGllY2UvY2J1cm5ldHQvJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByZXZTdmdIYXNoOiAnJ1xuICAgICAgICB9LFxuICAgICAgICBob2xkOiB1dGlsXzEudGltZXIoKSxcbiAgICAgICAgZGltZW5zaW9uczogeyB3aWR0aDogOCwgaGVpZ2h0OiA4IH0sXG4gICAgICAgIGdlb21ldHJ5OiAwLFxuICAgIH07XG59XG5leHBvcnRzLmRlZmF1bHRzID0gZGVmYXVsdHM7XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gY3JlYXRlRWxlbWVudCh0YWdOYW1lKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCB0YWdOYW1lKTtcbn1cbmV4cG9ydHMuY3JlYXRlRWxlbWVudCA9IGNyZWF0ZUVsZW1lbnQ7XG5mdW5jdGlvbiByZW5kZXJTdmcoc3RhdGUsIHJvb3QpIHtcbiAgICB2YXIgZCA9IHN0YXRlLmRyYXdhYmxlLCBjdXJEID0gZC5jdXJyZW50LCBjdXIgPSBjdXJEICYmIGN1ckQubW91c2VTcSA/IGN1ckQgOiB1bmRlZmluZWQsIGFycm93RGVzdHMgPSB7fTtcbiAgICBkLnNoYXBlcy5jb25jYXQoZC5hdXRvU2hhcGVzKS5jb25jYXQoY3VyID8gW2N1cl0gOiBbXSkuZm9yRWFjaChmdW5jdGlvbiAocykge1xuICAgICAgICBpZiAocy5kZXN0KVxuICAgICAgICAgICAgYXJyb3dEZXN0c1tzLmRlc3RdID0gKGFycm93RGVzdHNbcy5kZXN0XSB8fCAwKSArIDE7XG4gICAgfSk7XG4gICAgdmFyIHNoYXBlcyA9IGQuc2hhcGVzLmNvbmNhdChkLmF1dG9TaGFwZXMpLm1hcChmdW5jdGlvbiAocykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2hhcGU6IHMsXG4gICAgICAgICAgICBjdXJyZW50OiBmYWxzZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChzLCBhcnJvd0Rlc3RzLCBmYWxzZSlcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBpZiAoY3VyKVxuICAgICAgICBzaGFwZXMucHVzaCh7XG4gICAgICAgICAgICBzaGFwZTogY3VyLFxuICAgICAgICAgICAgY3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChjdXIsIGFycm93RGVzdHMsIHRydWUpXG4gICAgICAgIH0pO1xuICAgIHZhciBmdWxsSGFzaCA9IHNoYXBlcy5tYXAoZnVuY3Rpb24gKHNjKSB7IHJldHVybiBzYy5oYXNoOyB9KS5qb2luKCcnKTtcbiAgICBpZiAoZnVsbEhhc2ggPT09IHN0YXRlLmRyYXdhYmxlLnByZXZTdmdIYXNoKVxuICAgICAgICByZXR1cm47XG4gICAgc3RhdGUuZHJhd2FibGUucHJldlN2Z0hhc2ggPSBmdWxsSGFzaDtcbiAgICB2YXIgZGVmc0VsID0gcm9vdC5maXJzdENoaWxkO1xuICAgIHN5bmNEZWZzKGQsIHNoYXBlcywgZGVmc0VsKTtcbiAgICBzeW5jU2hhcGVzKHN0YXRlLCBzaGFwZXMsIGQuYnJ1c2hlcywgYXJyb3dEZXN0cywgcm9vdCwgZGVmc0VsKTtcbn1cbmV4cG9ydHMucmVuZGVyU3ZnID0gcmVuZGVyU3ZnO1xuZnVuY3Rpb24gc3luY0RlZnMoZCwgc2hhcGVzLCBkZWZzRWwpIHtcbiAgICB2YXIgYnJ1c2hlcyA9IHt9O1xuICAgIHZhciBicnVzaDtcbiAgICBzaGFwZXMuZm9yRWFjaChmdW5jdGlvbiAocykge1xuICAgICAgICBpZiAocy5zaGFwZS5kZXN0KSB7XG4gICAgICAgICAgICBicnVzaCA9IGQuYnJ1c2hlc1tzLnNoYXBlLmJydXNoXTtcbiAgICAgICAgICAgIGlmIChzLnNoYXBlLm1vZGlmaWVycylcbiAgICAgICAgICAgICAgICBicnVzaCA9IG1ha2VDdXN0b21CcnVzaChicnVzaCwgcy5zaGFwZS5tb2RpZmllcnMpO1xuICAgICAgICAgICAgYnJ1c2hlc1ticnVzaC5rZXldID0gYnJ1c2g7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICB2YXIga2V5c0luRG9tID0ge307XG4gICAgdmFyIGVsID0gZGVmc0VsLmZpcnN0Q2hpbGQ7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGtleXNJbkRvbVtlbC5nZXRBdHRyaWJ1dGUoJ2NnS2V5JyldID0gdHJ1ZTtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yICh2YXIga2V5IGluIGJydXNoZXMpIHtcbiAgICAgICAgaWYgKCFrZXlzSW5Eb21ba2V5XSlcbiAgICAgICAgICAgIGRlZnNFbC5hcHBlbmRDaGlsZChyZW5kZXJNYXJrZXIoYnJ1c2hlc1trZXldKSk7XG4gICAgfVxufVxuZnVuY3Rpb24gc3luY1NoYXBlcyhzdGF0ZSwgc2hhcGVzLCBicnVzaGVzLCBhcnJvd0Rlc3RzLCByb290LCBkZWZzRWwpIHtcbiAgICB2YXIgYm91bmRzID0gc3RhdGUuZG9tLmJvdW5kcygpLCBoYXNoZXNJbkRvbSA9IHt9LCB0b1JlbW92ZSA9IFtdO1xuICAgIHNoYXBlcy5mb3JFYWNoKGZ1bmN0aW9uIChzYykgeyBoYXNoZXNJbkRvbVtzYy5oYXNoXSA9IGZhbHNlOyB9KTtcbiAgICB2YXIgZWwgPSBkZWZzRWwubmV4dFNpYmxpbmcsIGVsSGFzaDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgZWxIYXNoID0gZWwuZ2V0QXR0cmlidXRlKCdjZ0hhc2gnKTtcbiAgICAgICAgaWYgKGhhc2hlc0luRG9tLmhhc093blByb3BlcnR5KGVsSGFzaCkpXG4gICAgICAgICAgICBoYXNoZXNJbkRvbVtlbEhhc2hdID0gdHJ1ZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdG9SZW1vdmUucHVzaChlbCk7XG4gICAgICAgIGVsID0gZWwubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIHRvUmVtb3ZlLmZvckVhY2goZnVuY3Rpb24gKGVsKSB7IHJldHVybiByb290LnJlbW92ZUNoaWxkKGVsKTsgfSk7XG4gICAgc2hhcGVzLmZvckVhY2goZnVuY3Rpb24gKHNjKSB7XG4gICAgICAgIGlmICghaGFzaGVzSW5Eb21bc2MuaGFzaF0pXG4gICAgICAgICAgICByb290LmFwcGVuZENoaWxkKHJlbmRlclNoYXBlKHN0YXRlLCBzYywgYnJ1c2hlcywgYXJyb3dEZXN0cywgYm91bmRzKSk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiBzaGFwZUhhc2goX2EsIGFycm93RGVzdHMsIGN1cnJlbnQpIHtcbiAgICB2YXIgb3JpZyA9IF9hLm9yaWcsIGRlc3QgPSBfYS5kZXN0LCBicnVzaCA9IF9hLmJydXNoLCBwaWVjZSA9IF9hLnBpZWNlLCBtb2RpZmllcnMgPSBfYS5tb2RpZmllcnM7XG4gICAgcmV0dXJuIFtjdXJyZW50LCBvcmlnLCBkZXN0LCBicnVzaCwgZGVzdCAmJiBhcnJvd0Rlc3RzW2Rlc3RdID4gMSxcbiAgICAgICAgcGllY2UgJiYgcGllY2VIYXNoKHBpZWNlKSxcbiAgICAgICAgbW9kaWZpZXJzICYmIG1vZGlmaWVyc0hhc2gobW9kaWZpZXJzKVxuICAgIF0uZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiB4OyB9KS5qb2luKCcnKTtcbn1cbmZ1bmN0aW9uIHBpZWNlSGFzaChwaWVjZSkge1xuICAgIHJldHVybiBbcGllY2UuY29sb3IsIHBpZWNlLnJvbGUsIHBpZWNlLnNjYWxlXS5maWx0ZXIoZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHg7IH0pLmpvaW4oJycpO1xufVxuZnVuY3Rpb24gbW9kaWZpZXJzSGFzaChtKSB7XG4gICAgcmV0dXJuICcnICsgKG0ubGluZVdpZHRoIHx8ICcnKTtcbn1cbmZ1bmN0aW9uIHJlbmRlclNoYXBlKHN0YXRlLCBfYSwgYnJ1c2hlcywgYXJyb3dEZXN0cywgYm91bmRzKSB7XG4gICAgdmFyIHNoYXBlID0gX2Euc2hhcGUsIGN1cnJlbnQgPSBfYS5jdXJyZW50LCBoYXNoID0gX2EuaGFzaDtcbiAgICB2YXIgZmlyc3RSYW5rSXMwID0gc3RhdGUuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIHZhciBlbDtcbiAgICBpZiAoc2hhcGUucGllY2UpXG4gICAgICAgIGVsID0gcmVuZGVyUGllY2Uoc3RhdGUuZHJhd2FibGUucGllY2VzLmJhc2VVcmwsIG9yaWVudCh1dGlsXzEua2V5MnBvcyhzaGFwZS5vcmlnLCBmaXJzdFJhbmtJczApLCBzdGF0ZS5vcmllbnRhdGlvbiwgc3RhdGUuZGltZW5zaW9ucyksIHNoYXBlLnBpZWNlLCBib3VuZHMsIHN0YXRlLmRpbWVuc2lvbnMpO1xuICAgIGVsc2Uge1xuICAgICAgICB2YXIgb3JpZyA9IG9yaWVudCh1dGlsXzEua2V5MnBvcyhzaGFwZS5vcmlnLCBmaXJzdFJhbmtJczApLCBzdGF0ZS5vcmllbnRhdGlvbiwgc3RhdGUuZGltZW5zaW9ucyk7XG4gICAgICAgIGlmIChzaGFwZS5vcmlnICYmIHNoYXBlLmRlc3QpIHtcbiAgICAgICAgICAgIHZhciBicnVzaCA9IGJydXNoZXNbc2hhcGUuYnJ1c2hdO1xuICAgICAgICAgICAgaWYgKHNoYXBlLm1vZGlmaWVycylcbiAgICAgICAgICAgICAgICBicnVzaCA9IG1ha2VDdXN0b21CcnVzaChicnVzaCwgc2hhcGUubW9kaWZpZXJzKTtcbiAgICAgICAgICAgIGVsID0gcmVuZGVyQXJyb3coYnJ1c2gsIG9yaWcsIG9yaWVudCh1dGlsXzEua2V5MnBvcyhzaGFwZS5kZXN0LCBmaXJzdFJhbmtJczApLCBzdGF0ZS5vcmllbnRhdGlvbiwgc3RhdGUuZGltZW5zaW9ucyksIGN1cnJlbnQsIGFycm93RGVzdHNbc2hhcGUuZGVzdF0gPiAxLCBib3VuZHMsIHN0YXRlLmRpbWVuc2lvbnMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGVsID0gcmVuZGVyQ2lyY2xlKGJydXNoZXNbc2hhcGUuYnJ1c2hdLCBvcmlnLCBjdXJyZW50LCBib3VuZHMsIHN0YXRlLmRpbWVuc2lvbnMpO1xuICAgIH1cbiAgICBlbC5zZXRBdHRyaWJ1dGUoJ2NnSGFzaCcsIGhhc2gpO1xuICAgIHJldHVybiBlbDtcbn1cbmZ1bmN0aW9uIHJlbmRlckNpcmNsZShicnVzaCwgcG9zLCBjdXJyZW50LCBib3VuZHMsIGJkKSB7XG4gICAgdmFyIG8gPSBwb3MycHgocG9zLCBib3VuZHMsIGJkKSwgd2lkdGhzID0gY2lyY2xlV2lkdGgoYm91bmRzLCBiZCksIHJhZGl1cyA9IChib3VuZHMud2lkdGggLyBiZC53aWR0aCkgLyAyO1xuICAgIHJldHVybiBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ2NpcmNsZScpLCB7XG4gICAgICAgIHN0cm9rZTogYnJ1c2guY29sb3IsXG4gICAgICAgICdzdHJva2Utd2lkdGgnOiB3aWR0aHNbY3VycmVudCA/IDAgOiAxXSxcbiAgICAgICAgZmlsbDogJ25vbmUnLFxuICAgICAgICBvcGFjaXR5OiBvcGFjaXR5KGJydXNoLCBjdXJyZW50KSxcbiAgICAgICAgY3g6IG9bMF0sXG4gICAgICAgIGN5OiBvWzFdLFxuICAgICAgICByOiByYWRpdXMgLSB3aWR0aHNbMV0gLyAyXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJBcnJvdyhicnVzaCwgb3JpZywgZGVzdCwgY3VycmVudCwgc2hvcnRlbiwgYm91bmRzLCBiZCkge1xuICAgIHZhciBtID0gYXJyb3dNYXJnaW4oYm91bmRzLCBzaG9ydGVuICYmICFjdXJyZW50LCBiZCksIGEgPSBwb3MycHgob3JpZywgYm91bmRzLCBiZCksIGIgPSBwb3MycHgoZGVzdCwgYm91bmRzLCBiZCksIGR4ID0gYlswXSAtIGFbMF0sIGR5ID0gYlsxXSAtIGFbMV0sIGFuZ2xlID0gTWF0aC5hdGFuMihkeSwgZHgpLCB4byA9IE1hdGguY29zKGFuZ2xlKSAqIG0sIHlvID0gTWF0aC5zaW4oYW5nbGUpICogbTtcbiAgICByZXR1cm4gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdsaW5lJyksIHtcbiAgICAgICAgc3Ryb2tlOiBicnVzaC5jb2xvcixcbiAgICAgICAgJ3N0cm9rZS13aWR0aCc6IGxpbmVXaWR0aChicnVzaCwgY3VycmVudCwgYm91bmRzLCBiZCksXG4gICAgICAgICdzdHJva2UtbGluZWNhcCc6ICdyb3VuZCcsXG4gICAgICAgICdtYXJrZXItZW5kJzogJ3VybCgjYXJyb3doZWFkLScgKyBicnVzaC5rZXkgKyAnKScsXG4gICAgICAgIG9wYWNpdHk6IG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpLFxuICAgICAgICB4MTogYVswXSxcbiAgICAgICAgeTE6IGFbMV0sXG4gICAgICAgIHgyOiBiWzBdIC0geG8sXG4gICAgICAgIHkyOiBiWzFdIC0geW9cbiAgICB9KTtcbn1cbmZ1bmN0aW9uIHJlbmRlclBpZWNlKGJhc2VVcmwsIHBvcywgcGllY2UsIGJvdW5kcywgYmQpIHtcbiAgICB2YXIgbyA9IHBvczJweChwb3MsIGJvdW5kcywgYmQpLCB3aWR0aCA9IGJvdW5kcy53aWR0aCAvIGJkLndpZHRoICogKHBpZWNlLnNjYWxlIHx8IDEpLCBoZWlnaHQgPSBib3VuZHMud2lkdGggLyBiZC5oZWlnaHQgKiAocGllY2Uuc2NhbGUgfHwgMSksIG5hbWUgPSBwaWVjZS5jb2xvclswXSArIChwaWVjZS5yb2xlID09PSAna25pZ2h0JyA/ICduJyA6IHBpZWNlLnJvbGVbMF0pLnRvVXBwZXJDYXNlKCk7XG4gICAgcmV0dXJuIHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgnaW1hZ2UnKSwge1xuICAgICAgICBjbGFzc05hbWU6IHBpZWNlLnJvbGUgKyBcIiBcIiArIHBpZWNlLmNvbG9yLFxuICAgICAgICB4OiBvWzBdIC0gd2lkdGggLyAyLFxuICAgICAgICB5OiBvWzFdIC0gaGVpZ2h0IC8gMixcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgaHJlZjogYmFzZVVybCArIG5hbWUgKyAnLnN2ZydcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIHJlbmRlck1hcmtlcihicnVzaCkge1xuICAgIHZhciBtYXJrZXIgPSBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ21hcmtlcicpLCB7XG4gICAgICAgIGlkOiAnYXJyb3doZWFkLScgKyBicnVzaC5rZXksXG4gICAgICAgIG9yaWVudDogJ2F1dG8nLFxuICAgICAgICBtYXJrZXJXaWR0aDogNCxcbiAgICAgICAgbWFya2VySGVpZ2h0OiA4LFxuICAgICAgICByZWZYOiAyLjA1LFxuICAgICAgICByZWZZOiAyLjAxXG4gICAgfSk7XG4gICAgbWFya2VyLmFwcGVuZENoaWxkKHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgncGF0aCcpLCB7XG4gICAgICAgIGQ6ICdNMCwwIFY0IEwzLDIgWicsXG4gICAgICAgIGZpbGw6IGJydXNoLmNvbG9yXG4gICAgfSkpO1xuICAgIG1hcmtlci5zZXRBdHRyaWJ1dGUoJ2NnS2V5JywgYnJ1c2gua2V5KTtcbiAgICByZXR1cm4gbWFya2VyO1xufVxuZnVuY3Rpb24gc2V0QXR0cmlidXRlcyhlbCwgYXR0cnMpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gYXR0cnMpXG4gICAgICAgIGVsLnNldEF0dHJpYnV0ZShrZXksIGF0dHJzW2tleV0pO1xuICAgIHJldHVybiBlbDtcbn1cbmZ1bmN0aW9uIG9yaWVudChwb3MsIGNvbG9yLCBiZCkge1xuICAgIHJldHVybiBjb2xvciA9PT0gJ3doaXRlJyA/IHBvcyA6IFtiZC53aWR0aCArIDEgLSBwb3NbMF0sIGJkLmhlaWdodCArIDEgLSBwb3NbMV1dO1xufVxuZnVuY3Rpb24gbWFrZUN1c3RvbUJydXNoKGJhc2UsIG1vZGlmaWVycykge1xuICAgIHZhciBicnVzaCA9IHtcbiAgICAgICAgY29sb3I6IGJhc2UuY29sb3IsXG4gICAgICAgIG9wYWNpdHk6IE1hdGgucm91bmQoYmFzZS5vcGFjaXR5ICogMTApIC8gMTAsXG4gICAgICAgIGxpbmVXaWR0aDogTWF0aC5yb3VuZChtb2RpZmllcnMubGluZVdpZHRoIHx8IGJhc2UubGluZVdpZHRoKVxuICAgIH07XG4gICAgYnJ1c2gua2V5ID0gW2Jhc2Uua2V5LCBtb2RpZmllcnMubGluZVdpZHRoXS5maWx0ZXIoZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHg7IH0pLmpvaW4oJycpO1xuICAgIHJldHVybiBicnVzaDtcbn1cbmZ1bmN0aW9uIGNpcmNsZVdpZHRoKGJvdW5kcywgYmQpIHtcbiAgICB2YXIgYmFzZSA9IGJvdW5kcy53aWR0aCAvIChiZC53aWR0aCAqIDY0KTtcbiAgICByZXR1cm4gWzMgKiBiYXNlLCA0ICogYmFzZV07XG59XG5mdW5jdGlvbiBsaW5lV2lkdGgoYnJ1c2gsIGN1cnJlbnQsIGJvdW5kcywgYmQpIHtcbiAgICByZXR1cm4gKGJydXNoLmxpbmVXaWR0aCB8fCAxMCkgKiAoY3VycmVudCA/IDAuODUgOiAxKSAvIChiZC53aWR0aCAqIDY0KSAqIGJvdW5kcy53aWR0aDtcbn1cbmZ1bmN0aW9uIG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpIHtcbiAgICByZXR1cm4gKGJydXNoLm9wYWNpdHkgfHwgMSkgKiAoY3VycmVudCA/IDAuOSA6IDEpO1xufVxuZnVuY3Rpb24gYXJyb3dNYXJnaW4oYm91bmRzLCBzaG9ydGVuLCBiZCkge1xuICAgIHJldHVybiAoc2hvcnRlbiA/IDIwIDogMTApIC8gKGJkLndpZHRoICogNjQpICogYm91bmRzLndpZHRoO1xufVxuZnVuY3Rpb24gcG9zMnB4KHBvcywgYm91bmRzLCBiZCkge1xuICAgIHJldHVybiBbKHBvc1swXSAtIDAuNSkgKiBib3VuZHMud2lkdGggLyBiZC53aWR0aCwgKGJkLmhlaWdodCArIDAuNSAtIHBvc1sxXSkgKiBib3VuZHMuaGVpZ2h0IC8gYmQuaGVpZ2h0XTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5maWxlcyA9IFsnYScsICdiJywgJ2MnLCAnZCcsICdlJywgJ2YnLCAnZycsICdoJywgJ2knLCAnaiddO1xuZXhwb3J0cy5yYW5rcyA9IFsnMCcsICcxJywgJzInLCAnMycsICc0JywgJzUnLCAnNicsICc3JywgJzgnLCAnOSddO1xuO1xuZXhwb3J0cy5kaW1lbnNpb25zID0gW3sgd2lkdGg6IDgsIGhlaWdodDogOCB9LCB7IHdpZHRoOiA5LCBoZWlnaHQ6IDkgfSwgeyB3aWR0aDogMTAsIGhlaWdodDogOCB9LCB7IHdpZHRoOiA5LCBoZWlnaHQ6IDEwIH1dO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgX2EsIF9iLCBfYywgX2Q7XG52YXIgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmV4cG9ydHMuY29sb3JzID0gWyd3aGl0ZScsICdibGFjayddO1xuZXhwb3J0cy5OUmFua3MgPSBbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdO1xuZXhwb3J0cy5pbnZOUmFua3MgPSBbMTAsIDksIDgsIDcsIDYsIDUsIDQsIDMsIDIsIDFdO1xudmFyIGZpbGVzOCA9IGNnLmZpbGVzLnNsaWNlKDAsIDgpO1xudmFyIGZpbGVzOSA9IGNnLmZpbGVzLnNsaWNlKDAsIDkpO1xudmFyIGZpbGVzMTAgPSBjZy5maWxlcy5zbGljZSgwLCAxMCk7XG52YXIgcmFua3M4ID0gY2cucmFua3Muc2xpY2UoMSwgOSk7XG52YXIgcmFua3M5ID0gY2cucmFua3Muc2xpY2UoMSwgMTApO1xudmFyIHJhbmtzMTAgPSBjZy5yYW5rcy5zbGljZSgwLCAxMCk7XG52YXIgYWxsS2V5czh4OCA9IChfYSA9IEFycmF5LnByb3RvdHlwZSkuY29uY2F0LmFwcGx5KF9hLCBmaWxlczgubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiByYW5rczgubWFwKGZ1bmN0aW9uIChyKSB7IHJldHVybiBjICsgcjsgfSk7IH0pKTtcbnZhciBhbGxLZXlzOXg5ID0gKF9iID0gQXJyYXkucHJvdG90eXBlKS5jb25jYXQuYXBwbHkoX2IsIGZpbGVzOS5tYXAoZnVuY3Rpb24gKGMpIHsgcmV0dXJuIHJhbmtzOS5tYXAoZnVuY3Rpb24gKHIpIHsgcmV0dXJuIGMgKyByOyB9KTsgfSkpO1xudmFyIGFsbEtleXMxMHg4ID0gKF9jID0gQXJyYXkucHJvdG90eXBlKS5jb25jYXQuYXBwbHkoX2MsIGZpbGVzMTAubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiByYW5rczgubWFwKGZ1bmN0aW9uIChyKSB7IHJldHVybiBjICsgcjsgfSk7IH0pKTtcbnZhciBhbGxLZXlzOXgxMCA9IChfZCA9IEFycmF5LnByb3RvdHlwZSkuY29uY2F0LmFwcGx5KF9kLCBmaWxlczkubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiByYW5rczEwLm1hcChmdW5jdGlvbiAocikgeyByZXR1cm4gYyArIHI7IH0pOyB9KSk7XG5leHBvcnRzLmFsbEtleXMgPSBbYWxsS2V5czh4OCwgYWxsS2V5czl4OSwgYWxsS2V5czEweDgsIGFsbEtleXM5eDEwXTtcbmZ1bmN0aW9uIHBvczJrZXkocG9zLCBnZW9tKSB7XG4gICAgdmFyIGJkID0gY2cuZGltZW5zaW9uc1tnZW9tXTtcbiAgICByZXR1cm4gZXhwb3J0cy5hbGxLZXlzW2dlb21dW2JkLmhlaWdodCAqIHBvc1swXSArIHBvc1sxXSAtIGJkLmhlaWdodCAtIDFdO1xufVxuZXhwb3J0cy5wb3Mya2V5ID0gcG9zMmtleTtcbmZ1bmN0aW9uIGtleTJwb3MoaywgZmlyc3RSYW5rSXMwKSB7XG4gICAgdmFyIHNoaWZ0ID0gZmlyc3RSYW5rSXMwID8gMSA6IDA7XG4gICAgcmV0dXJuIFtrLmNoYXJDb2RlQXQoMCkgLSA5Niwgay5jaGFyQ29kZUF0KDEpIC0gNDggKyBzaGlmdF07XG59XG5leHBvcnRzLmtleTJwb3MgPSBrZXkycG9zO1xuZnVuY3Rpb24gbWVtbyhmKSB7XG4gICAgdmFyIHY7XG4gICAgdmFyIHJldCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHYgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHYgPSBmKCk7XG4gICAgICAgIHJldHVybiB2O1xuICAgIH07XG4gICAgcmV0LmNsZWFyID0gZnVuY3Rpb24gKCkgeyB2ID0gdW5kZWZpbmVkOyB9O1xuICAgIHJldHVybiByZXQ7XG59XG5leHBvcnRzLm1lbW8gPSBtZW1vO1xuZXhwb3J0cy50aW1lciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc3RhcnRBdDtcbiAgICByZXR1cm4ge1xuICAgICAgICBzdGFydDogZnVuY3Rpb24gKCkgeyBzdGFydEF0ID0gRGF0ZS5ub3coKTsgfSxcbiAgICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7IHN0YXJ0QXQgPSB1bmRlZmluZWQ7IH0sXG4gICAgICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICghc3RhcnRBdClcbiAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgIHZhciB0aW1lID0gRGF0ZS5ub3coKSAtIHN0YXJ0QXQ7XG4gICAgICAgICAgICBzdGFydEF0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgcmV0dXJuIHRpbWU7XG4gICAgICAgIH1cbiAgICB9O1xufTtcbmV4cG9ydHMub3Bwb3NpdGUgPSBmdW5jdGlvbiAoYykgeyByZXR1cm4gYyA9PT0gJ3doaXRlJyA/ICdibGFjaycgOiAnd2hpdGUnOyB9O1xuZnVuY3Rpb24gY29udGFpbnNYKHhzLCB4KSB7XG4gICAgcmV0dXJuIHhzICE9PSB1bmRlZmluZWQgJiYgeHMuaW5kZXhPZih4KSAhPT0gLTE7XG59XG5leHBvcnRzLmNvbnRhaW5zWCA9IGNvbnRhaW5zWDtcbmV4cG9ydHMuZGlzdGFuY2VTcSA9IGZ1bmN0aW9uIChwb3MxLCBwb3MyKSB7XG4gICAgcmV0dXJuIE1hdGgucG93KHBvczFbMF0gLSBwb3MyWzBdLCAyKSArIE1hdGgucG93KHBvczFbMV0gLSBwb3MyWzFdLCAyKTtcbn07XG5leHBvcnRzLnNhbWVQaWVjZSA9IGZ1bmN0aW9uIChwMSwgcDIpIHtcbiAgICByZXR1cm4gcDEucm9sZSA9PT0gcDIucm9sZSAmJiBwMS5jb2xvciA9PT0gcDIuY29sb3I7XG59O1xudmFyIHBvc1RvVHJhbnNsYXRlQmFzZSA9IGZ1bmN0aW9uIChwb3MsIGFzV2hpdGUsIHhGYWN0b3IsIHlGYWN0b3IsIGJ0KSB7IHJldHVybiBbXG4gICAgKGFzV2hpdGUgPyBwb3NbMF0gLSAxIDogYnQud2lkdGggLSBwb3NbMF0pICogeEZhY3RvcixcbiAgICAoYXNXaGl0ZSA/IGJ0LmhlaWdodCAtIHBvc1sxXSA6IHBvc1sxXSAtIDEpICogeUZhY3RvclxuXTsgfTtcbmV4cG9ydHMucG9zVG9UcmFuc2xhdGVBYnMgPSBmdW5jdGlvbiAoYm91bmRzLCBidCkge1xuICAgIHZhciB4RmFjdG9yID0gYm91bmRzLndpZHRoIC8gYnQud2lkdGgsIHlGYWN0b3IgPSBib3VuZHMuaGVpZ2h0IC8gYnQuaGVpZ2h0O1xuICAgIHJldHVybiBmdW5jdGlvbiAocG9zLCBhc1doaXRlKSB7IHJldHVybiBwb3NUb1RyYW5zbGF0ZUJhc2UocG9zLCBhc1doaXRlLCB4RmFjdG9yLCB5RmFjdG9yLCBidCk7IH07XG59O1xuZXhwb3J0cy5wb3NUb1RyYW5zbGF0ZVJlbCA9IGZ1bmN0aW9uIChwb3MsIGFzV2hpdGUsIGJ0KSB7IHJldHVybiBwb3NUb1RyYW5zbGF0ZUJhc2UocG9zLCBhc1doaXRlLCAxMDAgLyBidC53aWR0aCwgMTAwIC8gYnQuaGVpZ2h0LCBidCk7IH07XG5leHBvcnRzLnRyYW5zbGF0ZUFicyA9IGZ1bmN0aW9uIChlbCwgcG9zKSB7XG4gICAgZWwuc3R5bGUudHJhbnNmb3JtID0gXCJ0cmFuc2xhdGUoXCIgKyBwb3NbMF0gKyBcInB4LFwiICsgcG9zWzFdICsgXCJweClcIjtcbn07XG5leHBvcnRzLnRyYW5zbGF0ZVJlbCA9IGZ1bmN0aW9uIChlbCwgcGVyY2VudHMpIHtcbiAgICBlbC5zdHlsZS5sZWZ0ID0gcGVyY2VudHNbMF0gKyAnJSc7XG4gICAgZWwuc3R5bGUudG9wID0gcGVyY2VudHNbMV0gKyAnJSc7XG59O1xuZXhwb3J0cy5zZXRWaXNpYmxlID0gZnVuY3Rpb24gKGVsLCB2KSB7XG4gICAgZWwuc3R5bGUudmlzaWJpbGl0eSA9IHYgPyAndmlzaWJsZScgOiAnaGlkZGVuJztcbn07XG5leHBvcnRzLmV2ZW50UG9zaXRpb24gPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChlLmNsaWVudFggfHwgZS5jbGllbnRYID09PSAwKVxuICAgICAgICByZXR1cm4gW2UuY2xpZW50WCwgZS5jbGllbnRZXTtcbiAgICBpZiAoZS50b3VjaGVzICYmIGUudGFyZ2V0VG91Y2hlc1swXSlcbiAgICAgICAgcmV0dXJuIFtlLnRhcmdldFRvdWNoZXNbMF0uY2xpZW50WCwgZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFldO1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuZXhwb3J0cy5pc1JpZ2h0QnV0dG9uID0gZnVuY3Rpb24gKGUpIHsgcmV0dXJuIGUuYnV0dG9ucyA9PT0gMiB8fCBlLmJ1dHRvbiA9PT0gMjsgfTtcbmV4cG9ydHMuY3JlYXRlRWwgPSBmdW5jdGlvbiAodGFnTmFtZSwgY2xhc3NOYW1lKSB7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcbiAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICBlbC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIGVsO1xufTtcbmV4cG9ydHMucmFmID0gKHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LnNldFRpbWVvdXQpLmJpbmQod2luZG93KTtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgdHlwZXNfMSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xudmFyIHN2Z18xID0gcmVxdWlyZShcIi4vc3ZnXCIpO1xuZnVuY3Rpb24gd3JhcChlbGVtZW50LCBzLCByZWxhdGl2ZSkge1xuICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gJyc7XG4gICAgZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjZy13cmFwJyk7XG4gICAgdXRpbF8xLmNvbG9ycy5mb3JFYWNoKGZ1bmN0aW9uIChjKSB7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnb3JpZW50YXRpb24tJyArIGMsIHMub3JpZW50YXRpb24gPT09IGMpO1xuICAgIH0pO1xuICAgIGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbWFuaXB1bGFibGUnLCAhcy52aWV3T25seSk7XG4gICAgdmFyIGhlbHBlciA9IHV0aWxfMS5jcmVhdGVFbCgnY2ctaGVscGVyJyk7XG4gICAgZWxlbWVudC5hcHBlbmRDaGlsZChoZWxwZXIpO1xuICAgIHZhciBjb250YWluZXIgPSB1dGlsXzEuY3JlYXRlRWwoJ2NnLWNvbnRhaW5lcicpO1xuICAgIGhlbHBlci5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgIHZhciBleHRlbnNpb24gPSB1dGlsXzEuY3JlYXRlRWwoJ2V4dGVuc2lvbicpO1xuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChleHRlbnNpb24pO1xuICAgIHZhciBib2FyZCA9IHV0aWxfMS5jcmVhdGVFbCgnY2ctYm9hcmQnKTtcbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYm9hcmQpO1xuICAgIHZhciBzdmc7XG4gICAgaWYgKHMuZHJhd2FibGUudmlzaWJsZSAmJiAhcmVsYXRpdmUpIHtcbiAgICAgICAgc3ZnID0gc3ZnXzEuY3JlYXRlRWxlbWVudCgnc3ZnJyk7XG4gICAgICAgIHN2Zy5hcHBlbmRDaGlsZChzdmdfMS5jcmVhdGVFbGVtZW50KCdkZWZzJykpO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3ZnKTtcbiAgICB9XG4gICAgaWYgKHMuY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgdmFyIG9yaWVudENsYXNzID0gcy5vcmllbnRhdGlvbiA9PT0gJ2JsYWNrJyA/ICcgYmxhY2snIDogJyc7XG4gICAgICAgIHZhciBmaXJzdFJhbmtJczAgPSBzLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICAgICAgdmFyIHNoaWZ0ID0gZmlyc3RSYW5rSXMwID8gMCA6IDE7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJDb29yZHModHlwZXNfMS5yYW5rcy5zbGljZShzaGlmdCwgcy5kaW1lbnNpb25zLmhlaWdodCArIHNoaWZ0KSwgJ3JhbmtzJyArIG9yaWVudENsYXNzKSk7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJDb29yZHModHlwZXNfMS5maWxlcy5zbGljZSgwLCBzLmRpbWVuc2lvbnMud2lkdGgpLCAnZmlsZXMnICsgb3JpZW50Q2xhc3MpKTtcbiAgICB9XG4gICAgdmFyIGdob3N0O1xuICAgIGlmIChzLmRyYWdnYWJsZS5zaG93R2hvc3QgJiYgIXJlbGF0aXZlKSB7XG4gICAgICAgIGdob3N0ID0gdXRpbF8xLmNyZWF0ZUVsKCdwaWVjZScsICdnaG9zdCcpO1xuICAgICAgICB1dGlsXzEuc2V0VmlzaWJsZShnaG9zdCwgZmFsc2UpO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ2hvc3QpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBib2FyZDogYm9hcmQsXG4gICAgICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgICAgICBnaG9zdDogZ2hvc3QsXG4gICAgICAgIHN2Zzogc3ZnXG4gICAgfTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IHdyYXA7XG5mdW5jdGlvbiByZW5kZXJDb29yZHMoZWxlbXMsIGNsYXNzTmFtZSkge1xuICAgIHZhciBlbCA9IHV0aWxfMS5jcmVhdGVFbCgnY29vcmRzJywgY2xhc3NOYW1lKTtcbiAgICB2YXIgZjtcbiAgICBmb3IgKHZhciBpIGluIGVsZW1zKSB7XG4gICAgICAgIGYgPSB1dGlsXzEuY3JlYXRlRWwoJ2Nvb3JkJyk7XG4gICAgICAgIGYudGV4dENvbnRlbnQgPSBlbGVtc1tpXTtcbiAgICAgICAgZWwuYXBwZW5kQ2hpbGQoZik7XG4gICAgfVxuICAgIHJldHVybiBlbDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHZub2RlXzEgPSByZXF1aXJlKFwiLi92bm9kZVwiKTtcbnZhciBpcyA9IHJlcXVpcmUoXCIuL2lzXCIpO1xuZnVuY3Rpb24gYWRkTlMoZGF0YSwgY2hpbGRyZW4sIHNlbCkge1xuICAgIGRhdGEubnMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xuICAgIGlmIChzZWwgIT09ICdmb3JlaWduT2JqZWN0JyAmJiBjaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBjaGlsZERhdGEgPSBjaGlsZHJlbltpXS5kYXRhO1xuICAgICAgICAgICAgaWYgKGNoaWxkRGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgYWRkTlMoY2hpbGREYXRhLCBjaGlsZHJlbltpXS5jaGlsZHJlbiwgY2hpbGRyZW5baV0uc2VsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIGgoc2VsLCBiLCBjKSB7XG4gICAgdmFyIGRhdGEgPSB7fSwgY2hpbGRyZW4sIHRleHQsIGk7XG4gICAgaWYgKGMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBkYXRhID0gYjtcbiAgICAgICAgaWYgKGlzLmFycmF5KGMpKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGM7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXMucHJpbWl0aXZlKGMpKSB7XG4gICAgICAgICAgICB0ZXh0ID0gYztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjICYmIGMuc2VsKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IFtjXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChiICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKGlzLmFycmF5KGIpKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXMucHJpbWl0aXZlKGIpKSB7XG4gICAgICAgICAgICB0ZXh0ID0gYjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChiICYmIGIuc2VsKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IFtiXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGRhdGEgPSBiO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChjaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaWYgKGlzLnByaW1pdGl2ZShjaGlsZHJlbltpXSkpXG4gICAgICAgICAgICAgICAgY2hpbGRyZW5baV0gPSB2bm9kZV8xLnZub2RlKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoaWxkcmVuW2ldLCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChzZWxbMF0gPT09ICdzJyAmJiBzZWxbMV0gPT09ICd2JyAmJiBzZWxbMl0gPT09ICdnJyAmJlxuICAgICAgICAoc2VsLmxlbmd0aCA9PT0gMyB8fCBzZWxbM10gPT09ICcuJyB8fCBzZWxbM10gPT09ICcjJykpIHtcbiAgICAgICAgYWRkTlMoZGF0YSwgY2hpbGRyZW4sIHNlbCk7XG4gICAgfVxuICAgIHJldHVybiB2bm9kZV8xLnZub2RlKHNlbCwgZGF0YSwgY2hpbGRyZW4sIHRleHQsIHVuZGVmaW5lZCk7XG59XG5leHBvcnRzLmggPSBoO1xuO1xuZXhwb3J0cy5kZWZhdWx0ID0gaDtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWguanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50KHRhZ05hbWUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2VVUkksIHF1YWxpZmllZE5hbWUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZVVSSSwgcXVhbGlmaWVkTmFtZSk7XG59XG5mdW5jdGlvbiBjcmVhdGVUZXh0Tm9kZSh0ZXh0KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpO1xufVxuZnVuY3Rpb24gY3JlYXRlQ29tbWVudCh0ZXh0KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQodGV4dCk7XG59XG5mdW5jdGlvbiBpbnNlcnRCZWZvcmUocGFyZW50Tm9kZSwgbmV3Tm9kZSwgcmVmZXJlbmNlTm9kZSkge1xuICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKG5ld05vZGUsIHJlZmVyZW5jZU5vZGUpO1xufVxuZnVuY3Rpb24gcmVtb3ZlQ2hpbGQobm9kZSwgY2hpbGQpIHtcbiAgICBub2RlLnJlbW92ZUNoaWxkKGNoaWxkKTtcbn1cbmZ1bmN0aW9uIGFwcGVuZENoaWxkKG5vZGUsIGNoaWxkKSB7XG4gICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZCk7XG59XG5mdW5jdGlvbiBwYXJlbnROb2RlKG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5wYXJlbnROb2RlO1xufVxuZnVuY3Rpb24gbmV4dFNpYmxpbmcobm9kZSkge1xuICAgIHJldHVybiBub2RlLm5leHRTaWJsaW5nO1xufVxuZnVuY3Rpb24gdGFnTmFtZShlbG0pIHtcbiAgICByZXR1cm4gZWxtLnRhZ05hbWU7XG59XG5mdW5jdGlvbiBzZXRUZXh0Q29udGVudChub2RlLCB0ZXh0KSB7XG4gICAgbm9kZS50ZXh0Q29udGVudCA9IHRleHQ7XG59XG5mdW5jdGlvbiBnZXRUZXh0Q29udGVudChub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUudGV4dENvbnRlbnQ7XG59XG5mdW5jdGlvbiBpc0VsZW1lbnQobm9kZSkge1xuICAgIHJldHVybiBub2RlLm5vZGVUeXBlID09PSAxO1xufVxuZnVuY3Rpb24gaXNUZXh0KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5ub2RlVHlwZSA9PT0gMztcbn1cbmZ1bmN0aW9uIGlzQ29tbWVudChub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDg7XG59XG5leHBvcnRzLmh0bWxEb21BcGkgPSB7XG4gICAgY3JlYXRlRWxlbWVudDogY3JlYXRlRWxlbWVudCxcbiAgICBjcmVhdGVFbGVtZW50TlM6IGNyZWF0ZUVsZW1lbnROUyxcbiAgICBjcmVhdGVUZXh0Tm9kZTogY3JlYXRlVGV4dE5vZGUsXG4gICAgY3JlYXRlQ29tbWVudDogY3JlYXRlQ29tbWVudCxcbiAgICBpbnNlcnRCZWZvcmU6IGluc2VydEJlZm9yZSxcbiAgICByZW1vdmVDaGlsZDogcmVtb3ZlQ2hpbGQsXG4gICAgYXBwZW5kQ2hpbGQ6IGFwcGVuZENoaWxkLFxuICAgIHBhcmVudE5vZGU6IHBhcmVudE5vZGUsXG4gICAgbmV4dFNpYmxpbmc6IG5leHRTaWJsaW5nLFxuICAgIHRhZ05hbWU6IHRhZ05hbWUsXG4gICAgc2V0VGV4dENvbnRlbnQ6IHNldFRleHRDb250ZW50LFxuICAgIGdldFRleHRDb250ZW50OiBnZXRUZXh0Q29udGVudCxcbiAgICBpc0VsZW1lbnQ6IGlzRWxlbWVudCxcbiAgICBpc1RleHQ6IGlzVGV4dCxcbiAgICBpc0NvbW1lbnQ6IGlzQ29tbWVudCxcbn07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmh0bWxEb21BcGk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1odG1sZG9tYXBpLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5hcnJheSA9IEFycmF5LmlzQXJyYXk7XG5mdW5jdGlvbiBwcmltaXRpdmUocykge1xuICAgIHJldHVybiB0eXBlb2YgcyA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHMgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5wcmltaXRpdmUgPSBwcmltaXRpdmU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pcy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB4bGlua05TID0gJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsnO1xudmFyIHhtbE5TID0gJ2h0dHA6Ly93d3cudzMub3JnL1hNTC8xOTk4L25hbWVzcGFjZSc7XG52YXIgY29sb25DaGFyID0gNTg7XG52YXIgeENoYXIgPSAxMjA7XG5mdW5jdGlvbiB1cGRhdGVBdHRycyhvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICB2YXIga2V5LCBlbG0gPSB2bm9kZS5lbG0sIG9sZEF0dHJzID0gb2xkVm5vZGUuZGF0YS5hdHRycywgYXR0cnMgPSB2bm9kZS5kYXRhLmF0dHJzO1xuICAgIGlmICghb2xkQXR0cnMgJiYgIWF0dHJzKVxuICAgICAgICByZXR1cm47XG4gICAgaWYgKG9sZEF0dHJzID09PSBhdHRycylcbiAgICAgICAgcmV0dXJuO1xuICAgIG9sZEF0dHJzID0gb2xkQXR0cnMgfHwge307XG4gICAgYXR0cnMgPSBhdHRycyB8fCB7fTtcbiAgICAvLyB1cGRhdGUgbW9kaWZpZWQgYXR0cmlidXRlcywgYWRkIG5ldyBhdHRyaWJ1dGVzXG4gICAgZm9yIChrZXkgaW4gYXR0cnMpIHtcbiAgICAgICAgdmFyIGN1ciA9IGF0dHJzW2tleV07XG4gICAgICAgIHZhciBvbGQgPSBvbGRBdHRyc1trZXldO1xuICAgICAgICBpZiAob2xkICE9PSBjdXIpIHtcbiAgICAgICAgICAgIGlmIChjdXIgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKGtleSwgXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjdXIgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgZWxtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5jaGFyQ29kZUF0KDApICE9PSB4Q2hhcikge1xuICAgICAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoa2V5LmNoYXJDb2RlQXQoMykgPT09IGNvbG9uQ2hhcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBBc3N1bWUgeG1sIG5hbWVzcGFjZVxuICAgICAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlTlMoeG1sTlMsIGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoa2V5LmNoYXJDb2RlQXQoNSkgPT09IGNvbG9uQ2hhcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBBc3N1bWUgeGxpbmsgbmFtZXNwYWNlXG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGVOUyh4bGlua05TLCBrZXksIGN1cik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gcmVtb3ZlIHJlbW92ZWQgYXR0cmlidXRlc1xuICAgIC8vIHVzZSBgaW5gIG9wZXJhdG9yIHNpbmNlIHRoZSBwcmV2aW91cyBgZm9yYCBpdGVyYXRpb24gdXNlcyBpdCAoLmkuZS4gYWRkIGV2ZW4gYXR0cmlidXRlcyB3aXRoIHVuZGVmaW5lZCB2YWx1ZSlcbiAgICAvLyB0aGUgb3RoZXIgb3B0aW9uIGlzIHRvIHJlbW92ZSBhbGwgYXR0cmlidXRlcyB3aXRoIHZhbHVlID09IHVuZGVmaW5lZFxuICAgIGZvciAoa2V5IGluIG9sZEF0dHJzKSB7XG4gICAgICAgIGlmICghKGtleSBpbiBhdHRycykpIHtcbiAgICAgICAgICAgIGVsbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmV4cG9ydHMuYXR0cmlidXRlc01vZHVsZSA9IHsgY3JlYXRlOiB1cGRhdGVBdHRycywgdXBkYXRlOiB1cGRhdGVBdHRycyB9O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy5hdHRyaWJ1dGVzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXR0cmlidXRlcy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIHVwZGF0ZUNsYXNzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBjdXIsIG5hbWUsIGVsbSA9IHZub2RlLmVsbSwgb2xkQ2xhc3MgPSBvbGRWbm9kZS5kYXRhLmNsYXNzLCBrbGFzcyA9IHZub2RlLmRhdGEuY2xhc3M7XG4gICAgaWYgKCFvbGRDbGFzcyAmJiAha2xhc3MpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAob2xkQ2xhc3MgPT09IGtsYXNzKVxuICAgICAgICByZXR1cm47XG4gICAgb2xkQ2xhc3MgPSBvbGRDbGFzcyB8fCB7fTtcbiAgICBrbGFzcyA9IGtsYXNzIHx8IHt9O1xuICAgIGZvciAobmFtZSBpbiBvbGRDbGFzcykge1xuICAgICAgICBpZiAoIWtsYXNzW25hbWVdKSB7XG4gICAgICAgICAgICBlbG0uY2xhc3NMaXN0LnJlbW92ZShuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKG5hbWUgaW4ga2xhc3MpIHtcbiAgICAgICAgY3VyID0ga2xhc3NbbmFtZV07XG4gICAgICAgIGlmIChjdXIgIT09IG9sZENsYXNzW25hbWVdKSB7XG4gICAgICAgICAgICBlbG0uY2xhc3NMaXN0W2N1ciA/ICdhZGQnIDogJ3JlbW92ZSddKG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5jbGFzc01vZHVsZSA9IHsgY3JlYXRlOiB1cGRhdGVDbGFzcywgdXBkYXRlOiB1cGRhdGVDbGFzcyB9O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy5jbGFzc01vZHVsZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWNsYXNzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gaW52b2tlSGFuZGxlcihoYW5kbGVyLCB2bm9kZSwgZXZlbnQpIHtcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAvLyBjYWxsIGZ1bmN0aW9uIGhhbmRsZXJcbiAgICAgICAgaGFuZGxlci5jYWxsKHZub2RlLCBldmVudCwgdm5vZGUpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAvLyBjYWxsIGhhbmRsZXIgd2l0aCBhcmd1bWVudHNcbiAgICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyWzBdID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIC8vIHNwZWNpYWwgY2FzZSBmb3Igc2luZ2xlIGFyZ3VtZW50IGZvciBwZXJmb3JtYW5jZVxuICAgICAgICAgICAgaWYgKGhhbmRsZXIubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlclswXS5jYWxsKHZub2RlLCBoYW5kbGVyWzFdLCBldmVudCwgdm5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBoYW5kbGVyLnNsaWNlKDEpO1xuICAgICAgICAgICAgICAgIGFyZ3MucHVzaChldmVudCk7XG4gICAgICAgICAgICAgICAgYXJncy5wdXNoKHZub2RlKTtcbiAgICAgICAgICAgICAgICBoYW5kbGVyWzBdLmFwcGx5KHZub2RlLCBhcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIGNhbGwgbXVsdGlwbGUgaGFuZGxlcnNcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGFuZGxlci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGludm9rZUhhbmRsZXIoaGFuZGxlcltpXSwgdm5vZGUsIGV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIGhhbmRsZUV2ZW50KGV2ZW50LCB2bm9kZSkge1xuICAgIHZhciBuYW1lID0gZXZlbnQudHlwZSwgb24gPSB2bm9kZS5kYXRhLm9uO1xuICAgIC8vIGNhbGwgZXZlbnQgaGFuZGxlcihzKSBpZiBleGlzdHNcbiAgICBpZiAob24gJiYgb25bbmFtZV0pIHtcbiAgICAgICAgaW52b2tlSGFuZGxlcihvbltuYW1lXSwgdm5vZGUsIGV2ZW50KTtcbiAgICB9XG59XG5mdW5jdGlvbiBjcmVhdGVMaXN0ZW5lcigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gaGFuZGxlcihldmVudCkge1xuICAgICAgICBoYW5kbGVFdmVudChldmVudCwgaGFuZGxlci52bm9kZSk7XG4gICAgfTtcbn1cbmZ1bmN0aW9uIHVwZGF0ZUV2ZW50TGlzdGVuZXJzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBvbGRPbiA9IG9sZFZub2RlLmRhdGEub24sIG9sZExpc3RlbmVyID0gb2xkVm5vZGUubGlzdGVuZXIsIG9sZEVsbSA9IG9sZFZub2RlLmVsbSwgb24gPSB2bm9kZSAmJiB2bm9kZS5kYXRhLm9uLCBlbG0gPSAodm5vZGUgJiYgdm5vZGUuZWxtKSwgbmFtZTtcbiAgICAvLyBvcHRpbWl6YXRpb24gZm9yIHJldXNlZCBpbW11dGFibGUgaGFuZGxlcnNcbiAgICBpZiAob2xkT24gPT09IG9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gcmVtb3ZlIGV4aXN0aW5nIGxpc3RlbmVycyB3aGljaCBubyBsb25nZXIgdXNlZFxuICAgIGlmIChvbGRPbiAmJiBvbGRMaXN0ZW5lcikge1xuICAgICAgICAvLyBpZiBlbGVtZW50IGNoYW5nZWQgb3IgZGVsZXRlZCB3ZSByZW1vdmUgYWxsIGV4aXN0aW5nIGxpc3RlbmVycyB1bmNvbmRpdGlvbmFsbHlcbiAgICAgICAgaWYgKCFvbikge1xuICAgICAgICAgICAgZm9yIChuYW1lIGluIG9sZE9uKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGxpc3RlbmVyIGlmIGVsZW1lbnQgd2FzIGNoYW5nZWQgb3IgZXhpc3RpbmcgbGlzdGVuZXJzIHJlbW92ZWRcbiAgICAgICAgICAgICAgICBvbGRFbG0ucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBvbGRMaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9yIChuYW1lIGluIG9sZE9uKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGxpc3RlbmVyIGlmIGV4aXN0aW5nIGxpc3RlbmVyIHJlbW92ZWRcbiAgICAgICAgICAgICAgICBpZiAoIW9uW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIG9sZEVsbS5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIG9sZExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8vIGFkZCBuZXcgbGlzdGVuZXJzIHdoaWNoIGhhcyBub3QgYWxyZWFkeSBhdHRhY2hlZFxuICAgIGlmIChvbikge1xuICAgICAgICAvLyByZXVzZSBleGlzdGluZyBsaXN0ZW5lciBvciBjcmVhdGUgbmV3XG4gICAgICAgIHZhciBsaXN0ZW5lciA9IHZub2RlLmxpc3RlbmVyID0gb2xkVm5vZGUubGlzdGVuZXIgfHwgY3JlYXRlTGlzdGVuZXIoKTtcbiAgICAgICAgLy8gdXBkYXRlIHZub2RlIGZvciBsaXN0ZW5lclxuICAgICAgICBsaXN0ZW5lci52bm9kZSA9IHZub2RlO1xuICAgICAgICAvLyBpZiBlbGVtZW50IGNoYW5nZWQgb3IgYWRkZWQgd2UgYWRkIGFsbCBuZWVkZWQgbGlzdGVuZXJzIHVuY29uZGl0aW9uYWxseVxuICAgICAgICBpZiAoIW9sZE9uKSB7XG4gICAgICAgICAgICBmb3IgKG5hbWUgaW4gb24pIHtcbiAgICAgICAgICAgICAgICAvLyBhZGQgbGlzdGVuZXIgaWYgZWxlbWVudCB3YXMgY2hhbmdlZCBvciBuZXcgbGlzdGVuZXJzIGFkZGVkXG4gICAgICAgICAgICAgICAgZWxtLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgbGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAobmFtZSBpbiBvbikge1xuICAgICAgICAgICAgICAgIC8vIGFkZCBsaXN0ZW5lciBpZiBuZXcgbGlzdGVuZXIgYWRkZWRcbiAgICAgICAgICAgICAgICBpZiAoIW9sZE9uW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGxpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5ldmVudExpc3RlbmVyc01vZHVsZSA9IHtcbiAgICBjcmVhdGU6IHVwZGF0ZUV2ZW50TGlzdGVuZXJzLFxuICAgIHVwZGF0ZTogdXBkYXRlRXZlbnRMaXN0ZW5lcnMsXG4gICAgZGVzdHJveTogdXBkYXRlRXZlbnRMaXN0ZW5lcnNcbn07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmV2ZW50TGlzdGVuZXJzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZXZlbnRsaXN0ZW5lcnMuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiB1cGRhdGVQcm9wcyhvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICB2YXIga2V5LCBjdXIsIG9sZCwgZWxtID0gdm5vZGUuZWxtLCBvbGRQcm9wcyA9IG9sZFZub2RlLmRhdGEucHJvcHMsIHByb3BzID0gdm5vZGUuZGF0YS5wcm9wcztcbiAgICBpZiAoIW9sZFByb3BzICYmICFwcm9wcylcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChvbGRQcm9wcyA9PT0gcHJvcHMpXG4gICAgICAgIHJldHVybjtcbiAgICBvbGRQcm9wcyA9IG9sZFByb3BzIHx8IHt9O1xuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgZm9yIChrZXkgaW4gb2xkUHJvcHMpIHtcbiAgICAgICAgaWYgKCFwcm9wc1trZXldKSB7XG4gICAgICAgICAgICBkZWxldGUgZWxtW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChrZXkgaW4gcHJvcHMpIHtcbiAgICAgICAgY3VyID0gcHJvcHNba2V5XTtcbiAgICAgICAgb2xkID0gb2xkUHJvcHNba2V5XTtcbiAgICAgICAgaWYgKG9sZCAhPT0gY3VyICYmIChrZXkgIT09ICd2YWx1ZScgfHwgZWxtW2tleV0gIT09IGN1cikpIHtcbiAgICAgICAgICAgIGVsbVtrZXldID0gY3VyO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5wcm9wc01vZHVsZSA9IHsgY3JlYXRlOiB1cGRhdGVQcm9wcywgdXBkYXRlOiB1cGRhdGVQcm9wcyB9O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy5wcm9wc01vZHVsZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXByb3BzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHZub2RlXzEgPSByZXF1aXJlKFwiLi92bm9kZVwiKTtcbnZhciBpcyA9IHJlcXVpcmUoXCIuL2lzXCIpO1xudmFyIGh0bWxkb21hcGlfMSA9IHJlcXVpcmUoXCIuL2h0bWxkb21hcGlcIik7XG5mdW5jdGlvbiBpc1VuZGVmKHMpIHsgcmV0dXJuIHMgPT09IHVuZGVmaW5lZDsgfVxuZnVuY3Rpb24gaXNEZWYocykgeyByZXR1cm4gcyAhPT0gdW5kZWZpbmVkOyB9XG52YXIgZW1wdHlOb2RlID0gdm5vZGVfMS5kZWZhdWx0KCcnLCB7fSwgW10sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbmZ1bmN0aW9uIHNhbWVWbm9kZSh2bm9kZTEsIHZub2RlMikge1xuICAgIHJldHVybiB2bm9kZTEua2V5ID09PSB2bm9kZTIua2V5ICYmIHZub2RlMS5zZWwgPT09IHZub2RlMi5zZWw7XG59XG5mdW5jdGlvbiBpc1Zub2RlKHZub2RlKSB7XG4gICAgcmV0dXJuIHZub2RlLnNlbCAhPT0gdW5kZWZpbmVkO1xufVxuZnVuY3Rpb24gY3JlYXRlS2V5VG9PbGRJZHgoY2hpbGRyZW4sIGJlZ2luSWR4LCBlbmRJZHgpIHtcbiAgICB2YXIgaSwgbWFwID0ge30sIGtleSwgY2g7XG4gICAgZm9yIChpID0gYmVnaW5JZHg7IGkgPD0gZW5kSWR4OyArK2kpIHtcbiAgICAgICAgY2ggPSBjaGlsZHJlbltpXTtcbiAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgIGtleSA9IGNoLmtleTtcbiAgICAgICAgICAgIGlmIChrZXkgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICBtYXBba2V5XSA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1hcDtcbn1cbnZhciBob29rcyA9IFsnY3JlYXRlJywgJ3VwZGF0ZScsICdyZW1vdmUnLCAnZGVzdHJveScsICdwcmUnLCAncG9zdCddO1xudmFyIGhfMSA9IHJlcXVpcmUoXCIuL2hcIik7XG5leHBvcnRzLmggPSBoXzEuaDtcbnZhciB0aHVua18xID0gcmVxdWlyZShcIi4vdGh1bmtcIik7XG5leHBvcnRzLnRodW5rID0gdGh1bmtfMS50aHVuaztcbmZ1bmN0aW9uIGluaXQobW9kdWxlcywgZG9tQXBpKSB7XG4gICAgdmFyIGksIGosIGNicyA9IHt9O1xuICAgIHZhciBhcGkgPSBkb21BcGkgIT09IHVuZGVmaW5lZCA/IGRvbUFwaSA6IGh0bWxkb21hcGlfMS5kZWZhdWx0O1xuICAgIGZvciAoaSA9IDA7IGkgPCBob29rcy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjYnNbaG9va3NbaV1dID0gW107XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBtb2R1bGVzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgICB2YXIgaG9vayA9IG1vZHVsZXNbal1baG9va3NbaV1dO1xuICAgICAgICAgICAgaWYgKGhvb2sgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNic1tob29rc1tpXV0ucHVzaChob29rKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBlbXB0eU5vZGVBdChlbG0pIHtcbiAgICAgICAgdmFyIGlkID0gZWxtLmlkID8gJyMnICsgZWxtLmlkIDogJyc7XG4gICAgICAgIHZhciBjID0gZWxtLmNsYXNzTmFtZSA/ICcuJyArIGVsbS5jbGFzc05hbWUuc3BsaXQoJyAnKS5qb2luKCcuJykgOiAnJztcbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdChhcGkudGFnTmFtZShlbG0pLnRvTG93ZXJDYXNlKCkgKyBpZCArIGMsIHt9LCBbXSwgdW5kZWZpbmVkLCBlbG0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjcmVhdGVSbUNiKGNoaWxkRWxtLCBsaXN0ZW5lcnMpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIHJtQ2IoKSB7XG4gICAgICAgICAgICBpZiAoLS1saXN0ZW5lcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFyZW50XzEgPSBhcGkucGFyZW50Tm9kZShjaGlsZEVsbSk7XG4gICAgICAgICAgICAgICAgYXBpLnJlbW92ZUNoaWxkKHBhcmVudF8xLCBjaGlsZEVsbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0ZUVsbSh2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgICAgIHZhciBpLCBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKGlzRGVmKGkgPSBkYXRhLmhvb2spICYmIGlzRGVmKGkgPSBpLmluaXQpKSB7XG4gICAgICAgICAgICAgICAgaSh2bm9kZSk7XG4gICAgICAgICAgICAgICAgZGF0YSA9IHZub2RlLmRhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNoaWxkcmVuID0gdm5vZGUuY2hpbGRyZW4sIHNlbCA9IHZub2RlLnNlbDtcbiAgICAgICAgaWYgKHNlbCA9PT0gJyEnKSB7XG4gICAgICAgICAgICBpZiAoaXNVbmRlZih2bm9kZS50ZXh0KSkge1xuICAgICAgICAgICAgICAgIHZub2RlLnRleHQgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZub2RlLmVsbSA9IGFwaS5jcmVhdGVDb21tZW50KHZub2RlLnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBQYXJzZSBzZWxlY3RvclxuICAgICAgICAgICAgdmFyIGhhc2hJZHggPSBzZWwuaW5kZXhPZignIycpO1xuICAgICAgICAgICAgdmFyIGRvdElkeCA9IHNlbC5pbmRleE9mKCcuJywgaGFzaElkeCk7XG4gICAgICAgICAgICB2YXIgaGFzaCA9IGhhc2hJZHggPiAwID8gaGFzaElkeCA6IHNlbC5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgZG90ID0gZG90SWR4ID4gMCA/IGRvdElkeCA6IHNlbC5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgdGFnID0gaGFzaElkeCAhPT0gLTEgfHwgZG90SWR4ICE9PSAtMSA/IHNlbC5zbGljZSgwLCBNYXRoLm1pbihoYXNoLCBkb3QpKSA6IHNlbDtcbiAgICAgICAgICAgIHZhciBlbG0gPSB2bm9kZS5lbG0gPSBpc0RlZihkYXRhKSAmJiBpc0RlZihpID0gZGF0YS5ucykgPyBhcGkuY3JlYXRlRWxlbWVudE5TKGksIHRhZylcbiAgICAgICAgICAgICAgICA6IGFwaS5jcmVhdGVFbGVtZW50KHRhZyk7XG4gICAgICAgICAgICBpZiAoaGFzaCA8IGRvdClcbiAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKCdpZCcsIHNlbC5zbGljZShoYXNoICsgMSwgZG90KSk7XG4gICAgICAgICAgICBpZiAoZG90SWR4ID4gMClcbiAgICAgICAgICAgICAgICBlbG0uc2V0QXR0cmlidXRlKCdjbGFzcycsIHNlbC5zbGljZShkb3QgKyAxKS5yZXBsYWNlKC9cXC4vZywgJyAnKSk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLmNyZWF0ZS5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgICAgICBjYnMuY3JlYXRlW2ldKGVtcHR5Tm9kZSwgdm5vZGUpO1xuICAgICAgICAgICAgaWYgKGlzLmFycmF5KGNoaWxkcmVuKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2ggPSBjaGlsZHJlbltpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5hcHBlbmRDaGlsZChlbG0sIGNyZWF0ZUVsbShjaCwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUodm5vZGUudGV4dCkpIHtcbiAgICAgICAgICAgICAgICBhcGkuYXBwZW5kQ2hpbGQoZWxtLCBhcGkuY3JlYXRlVGV4dE5vZGUodm5vZGUudGV4dCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaSA9IHZub2RlLmRhdGEuaG9vazsgLy8gUmV1c2UgdmFyaWFibGVcbiAgICAgICAgICAgIGlmIChpc0RlZihpKSkge1xuICAgICAgICAgICAgICAgIGlmIChpLmNyZWF0ZSlcbiAgICAgICAgICAgICAgICAgICAgaS5jcmVhdGUoZW1wdHlOb2RlLCB2bm9kZSk7XG4gICAgICAgICAgICAgICAgaWYgKGkuaW5zZXJ0KVxuICAgICAgICAgICAgICAgICAgICBpbnNlcnRlZFZub2RlUXVldWUucHVzaCh2bm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2bm9kZS5lbG0gPSBhcGkuY3JlYXRlVGV4dE5vZGUodm5vZGUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZub2RlLmVsbTtcbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkVm5vZGVzKHBhcmVudEVsbSwgYmVmb3JlLCB2bm9kZXMsIHN0YXJ0SWR4LCBlbmRJZHgsIGluc2VydGVkVm5vZGVRdWV1ZSkge1xuICAgICAgICBmb3IgKDsgc3RhcnRJZHggPD0gZW5kSWR4OyArK3N0YXJ0SWR4KSB7XG4gICAgICAgICAgICB2YXIgY2ggPSB2bm9kZXNbc3RhcnRJZHhdO1xuICAgICAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKGNoLCBpbnNlcnRlZFZub2RlUXVldWUpLCBiZWZvcmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGludm9rZURlc3Ryb3lIb29rKHZub2RlKSB7XG4gICAgICAgIHZhciBpLCBqLCBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKGlzRGVmKGkgPSBkYXRhLmhvb2spICYmIGlzRGVmKGkgPSBpLmRlc3Ryb3kpKVxuICAgICAgICAgICAgICAgIGkodm5vZGUpO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNicy5kZXN0cm95Lmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGNicy5kZXN0cm95W2ldKHZub2RlKTtcbiAgICAgICAgICAgIGlmICh2bm9kZS5jaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHZub2RlLmNoaWxkcmVuLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgICAgICAgICAgIGkgPSB2bm9kZS5jaGlsZHJlbltqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkgIT0gbnVsbCAmJiB0eXBlb2YgaSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW52b2tlRGVzdHJveUhvb2soaSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gcmVtb3ZlVm5vZGVzKHBhcmVudEVsbSwgdm5vZGVzLCBzdGFydElkeCwgZW5kSWR4KSB7XG4gICAgICAgIGZvciAoOyBzdGFydElkeCA8PSBlbmRJZHg7ICsrc3RhcnRJZHgpIHtcbiAgICAgICAgICAgIHZhciBpXzEgPSB2b2lkIDAsIGxpc3RlbmVycyA9IHZvaWQgMCwgcm0gPSB2b2lkIDAsIGNoID0gdm5vZGVzW3N0YXJ0SWR4XTtcbiAgICAgICAgICAgIGlmIChjaCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzRGVmKGNoLnNlbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW52b2tlRGVzdHJveUhvb2soY2gpO1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBjYnMucmVtb3ZlLmxlbmd0aCArIDE7XG4gICAgICAgICAgICAgICAgICAgIHJtID0gY3JlYXRlUm1DYihjaC5lbG0sIGxpc3RlbmVycyk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaV8xID0gMDsgaV8xIDwgY2JzLnJlbW92ZS5sZW5ndGg7ICsraV8xKVxuICAgICAgICAgICAgICAgICAgICAgICAgY2JzLnJlbW92ZVtpXzFdKGNoLCBybSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0RlZihpXzEgPSBjaC5kYXRhKSAmJiBpc0RlZihpXzEgPSBpXzEuaG9vaykgJiYgaXNEZWYoaV8xID0gaV8xLnJlbW92ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlfMShjaCwgcm0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcm0oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYXBpLnJlbW92ZUNoaWxkKHBhcmVudEVsbSwgY2guZWxtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gdXBkYXRlQ2hpbGRyZW4ocGFyZW50RWxtLCBvbGRDaCwgbmV3Q2gsIGluc2VydGVkVm5vZGVRdWV1ZSkge1xuICAgICAgICB2YXIgb2xkU3RhcnRJZHggPSAwLCBuZXdTdGFydElkeCA9IDA7XG4gICAgICAgIHZhciBvbGRFbmRJZHggPSBvbGRDaC5sZW5ndGggLSAxO1xuICAgICAgICB2YXIgb2xkU3RhcnRWbm9kZSA9IG9sZENoWzBdO1xuICAgICAgICB2YXIgb2xkRW5kVm5vZGUgPSBvbGRDaFtvbGRFbmRJZHhdO1xuICAgICAgICB2YXIgbmV3RW5kSWR4ID0gbmV3Q2gubGVuZ3RoIC0gMTtcbiAgICAgICAgdmFyIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFswXTtcbiAgICAgICAgdmFyIG5ld0VuZFZub2RlID0gbmV3Q2hbbmV3RW5kSWR4XTtcbiAgICAgICAgdmFyIG9sZEtleVRvSWR4O1xuICAgICAgICB2YXIgaWR4SW5PbGQ7XG4gICAgICAgIHZhciBlbG1Ub01vdmU7XG4gICAgICAgIHZhciBiZWZvcmU7XG4gICAgICAgIHdoaWxlIChvbGRTdGFydElkeCA8PSBvbGRFbmRJZHggJiYgbmV3U3RhcnRJZHggPD0gbmV3RW5kSWR4KSB7XG4gICAgICAgICAgICBpZiAob2xkU3RhcnRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgb2xkU3RhcnRWbm9kZSA9IG9sZENoWysrb2xkU3RhcnRJZHhdOyAvLyBWbm9kZSBtaWdodCBoYXZlIGJlZW4gbW92ZWQgbGVmdFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAob2xkRW5kVm5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIG9sZEVuZFZub2RlID0gb2xkQ2hbLS1vbGRFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAobmV3U3RhcnRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAobmV3RW5kVm5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2FtZVZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld1N0YXJ0Vm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRTdGFydFZub2RlLCBuZXdTdGFydFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgICAgIG9sZFN0YXJ0Vm5vZGUgPSBvbGRDaFsrK29sZFN0YXJ0SWR4XTtcbiAgICAgICAgICAgICAgICBuZXdTdGFydFZub2RlID0gbmV3Q2hbKytuZXdTdGFydElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkRW5kVm5vZGUsIG5ld0VuZFZub2RlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkRW5kVm5vZGUsIG5ld0VuZFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgICAgIG9sZEVuZFZub2RlID0gb2xkQ2hbLS1vbGRFbmRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2FtZVZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld0VuZFZub2RlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3RW5kVm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIG9sZFN0YXJ0Vm5vZGUuZWxtLCBhcGkubmV4dFNpYmxpbmcob2xkRW5kVm5vZGUuZWxtKSk7XG4gICAgICAgICAgICAgICAgb2xkU3RhcnRWbm9kZSA9IG9sZENoWysrb2xkU3RhcnRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2FtZVZub2RlKG9sZEVuZFZub2RlLCBuZXdTdGFydFZub2RlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkRW5kVm5vZGUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIG9sZEVuZFZub2RlLmVsbSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgICAgICAgIG9sZEVuZFZub2RlID0gb2xkQ2hbLS1vbGRFbmRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChvbGRLZXlUb0lkeCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG9sZEtleVRvSWR4ID0gY3JlYXRlS2V5VG9PbGRJZHgob2xkQ2gsIG9sZFN0YXJ0SWR4LCBvbGRFbmRJZHgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHhJbk9sZCA9IG9sZEtleVRvSWR4W25ld1N0YXJ0Vm5vZGUua2V5XTtcbiAgICAgICAgICAgICAgICBpZiAoaXNVbmRlZihpZHhJbk9sZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIGNyZWF0ZUVsbShuZXdTdGFydFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpLCBvbGRTdGFydFZub2RlLmVsbSk7XG4gICAgICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbVRvTW92ZSA9IG9sZENoW2lkeEluT2xkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsbVRvTW92ZS5zZWwgIT09IG5ld1N0YXJ0Vm5vZGUuc2VsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSksIG9sZFN0YXJ0Vm5vZGUuZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGNoVm5vZGUoZWxtVG9Nb3ZlLCBuZXdTdGFydFZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgb2xkQ2hbaWR4SW5PbGRdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIGVsbVRvTW92ZS5lbG0sIG9sZFN0YXJ0Vm5vZGUuZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBuZXdTdGFydFZub2RlID0gbmV3Q2hbKytuZXdTdGFydElkeF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvbGRTdGFydElkeCA8PSBvbGRFbmRJZHggfHwgbmV3U3RhcnRJZHggPD0gbmV3RW5kSWR4KSB7XG4gICAgICAgICAgICBpZiAob2xkU3RhcnRJZHggPiBvbGRFbmRJZHgpIHtcbiAgICAgICAgICAgICAgICBiZWZvcmUgPSBuZXdDaFtuZXdFbmRJZHggKyAxXSA9PSBudWxsID8gbnVsbCA6IG5ld0NoW25ld0VuZElkeCArIDFdLmVsbTtcbiAgICAgICAgICAgICAgICBhZGRWbm9kZXMocGFyZW50RWxtLCBiZWZvcmUsIG5ld0NoLCBuZXdTdGFydElkeCwgbmV3RW5kSWR4LCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlVm5vZGVzKHBhcmVudEVsbSwgb2xkQ2gsIG9sZFN0YXJ0SWR4LCBvbGRFbmRJZHgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHBhdGNoVm5vZGUob2xkVm5vZGUsIHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpIHtcbiAgICAgICAgdmFyIGksIGhvb2s7XG4gICAgICAgIGlmIChpc0RlZihpID0gdm5vZGUuZGF0YSkgJiYgaXNEZWYoaG9vayA9IGkuaG9vaykgJiYgaXNEZWYoaSA9IGhvb2sucHJlcGF0Y2gpKSB7XG4gICAgICAgICAgICBpKG9sZFZub2RlLCB2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGVsbSA9IHZub2RlLmVsbSA9IG9sZFZub2RlLmVsbTtcbiAgICAgICAgdmFyIG9sZENoID0gb2xkVm5vZGUuY2hpbGRyZW47XG4gICAgICAgIHZhciBjaCA9IHZub2RlLmNoaWxkcmVuO1xuICAgICAgICBpZiAob2xkVm5vZGUgPT09IHZub2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAodm5vZGUuZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnVwZGF0ZS5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgICAgICBjYnMudXBkYXRlW2ldKG9sZFZub2RlLCB2bm9kZSk7XG4gICAgICAgICAgICBpID0gdm5vZGUuZGF0YS5ob29rO1xuICAgICAgICAgICAgaWYgKGlzRGVmKGkpICYmIGlzRGVmKGkgPSBpLnVwZGF0ZSkpXG4gICAgICAgICAgICAgICAgaShvbGRWbm9kZSwgdm5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc1VuZGVmKHZub2RlLnRleHQpKSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYob2xkQ2gpICYmIGlzRGVmKGNoKSkge1xuICAgICAgICAgICAgICAgIGlmIChvbGRDaCAhPT0gY2gpXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZUNoaWxkcmVuKGVsbSwgb2xkQ2gsIGNoLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaXNEZWYoY2gpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzRGVmKG9sZFZub2RlLnRleHQpKVxuICAgICAgICAgICAgICAgICAgICBhcGkuc2V0VGV4dENvbnRlbnQoZWxtLCAnJyk7XG4gICAgICAgICAgICAgICAgYWRkVm5vZGVzKGVsbSwgbnVsbCwgY2gsIDAsIGNoLmxlbmd0aCAtIDEsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0RlZihvbGRDaCkpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVWbm9kZXMoZWxtLCBvbGRDaCwgMCwgb2xkQ2gubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0RlZihvbGRWbm9kZS50ZXh0KSkge1xuICAgICAgICAgICAgICAgIGFwaS5zZXRUZXh0Q29udGVudChlbG0sICcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvbGRWbm9kZS50ZXh0ICE9PSB2bm9kZS50ZXh0KSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYob2xkQ2gpKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlVm5vZGVzKGVsbSwgb2xkQ2gsIDAsIG9sZENoLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXBpLnNldFRleHRDb250ZW50KGVsbSwgdm5vZGUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzRGVmKGhvb2spICYmIGlzRGVmKGkgPSBob29rLnBvc3RwYXRjaCkpIHtcbiAgICAgICAgICAgIGkob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24gcGF0Y2gob2xkVm5vZGUsIHZub2RlKSB7XG4gICAgICAgIHZhciBpLCBlbG0sIHBhcmVudDtcbiAgICAgICAgdmFyIGluc2VydGVkVm5vZGVRdWV1ZSA9IFtdO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnByZS5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgIGNicy5wcmVbaV0oKTtcbiAgICAgICAgaWYgKCFpc1Zub2RlKG9sZFZub2RlKSkge1xuICAgICAgICAgICAgb2xkVm5vZGUgPSBlbXB0eU5vZGVBdChvbGRWbm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNhbWVWbm9kZShvbGRWbm9kZSwgdm5vZGUpKSB7XG4gICAgICAgICAgICBwYXRjaFZub2RlKG9sZFZub2RlLCB2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVsbSA9IG9sZFZub2RlLmVsbTtcbiAgICAgICAgICAgIHBhcmVudCA9IGFwaS5wYXJlbnROb2RlKGVsbSk7XG4gICAgICAgICAgICBjcmVhdGVFbG0odm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICBpZiAocGFyZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnQsIHZub2RlLmVsbSwgYXBpLm5leHRTaWJsaW5nKGVsbSkpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVZub2RlcyhwYXJlbnQsIFtvbGRWbm9kZV0sIDAsIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBpbnNlcnRlZFZub2RlUXVldWUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGluc2VydGVkVm5vZGVRdWV1ZVtpXS5kYXRhLmhvb2suaW5zZXJ0KGluc2VydGVkVm5vZGVRdWV1ZVtpXSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNicy5wb3N0Lmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgY2JzLnBvc3RbaV0oKTtcbiAgICAgICAgcmV0dXJuIHZub2RlO1xuICAgIH07XG59XG5leHBvcnRzLmluaXQgPSBpbml0O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9c25hYmJkb20uanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgaF8xID0gcmVxdWlyZShcIi4vaFwiKTtcbmZ1bmN0aW9uIGNvcHlUb1RodW5rKHZub2RlLCB0aHVuaykge1xuICAgIHRodW5rLmVsbSA9IHZub2RlLmVsbTtcbiAgICB2bm9kZS5kYXRhLmZuID0gdGh1bmsuZGF0YS5mbjtcbiAgICB2bm9kZS5kYXRhLmFyZ3MgPSB0aHVuay5kYXRhLmFyZ3M7XG4gICAgdGh1bmsuZGF0YSA9IHZub2RlLmRhdGE7XG4gICAgdGh1bmsuY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbjtcbiAgICB0aHVuay50ZXh0ID0gdm5vZGUudGV4dDtcbiAgICB0aHVuay5lbG0gPSB2bm9kZS5lbG07XG59XG5mdW5jdGlvbiBpbml0KHRodW5rKSB7XG4gICAgdmFyIGN1ciA9IHRodW5rLmRhdGE7XG4gICAgdmFyIHZub2RlID0gY3VyLmZuLmFwcGx5KHVuZGVmaW5lZCwgY3VyLmFyZ3MpO1xuICAgIGNvcHlUb1RodW5rKHZub2RlLCB0aHVuayk7XG59XG5mdW5jdGlvbiBwcmVwYXRjaChvbGRWbm9kZSwgdGh1bmspIHtcbiAgICB2YXIgaSwgb2xkID0gb2xkVm5vZGUuZGF0YSwgY3VyID0gdGh1bmsuZGF0YTtcbiAgICB2YXIgb2xkQXJncyA9IG9sZC5hcmdzLCBhcmdzID0gY3VyLmFyZ3M7XG4gICAgaWYgKG9sZC5mbiAhPT0gY3VyLmZuIHx8IG9sZEFyZ3MubGVuZ3RoICE9PSBhcmdzLmxlbmd0aCkge1xuICAgICAgICBjb3B5VG9UaHVuayhjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBhcmdzKSwgdGh1bmspO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGlmIChvbGRBcmdzW2ldICE9PSBhcmdzW2ldKSB7XG4gICAgICAgICAgICBjb3B5VG9UaHVuayhjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBhcmdzKSwgdGh1bmspO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvcHlUb1RodW5rKG9sZFZub2RlLCB0aHVuayk7XG59XG5leHBvcnRzLnRodW5rID0gZnVuY3Rpb24gdGh1bmsoc2VsLCBrZXksIGZuLCBhcmdzKSB7XG4gICAgaWYgKGFyZ3MgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBhcmdzID0gZm47XG4gICAgICAgIGZuID0ga2V5O1xuICAgICAgICBrZXkgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHJldHVybiBoXzEuaChzZWwsIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIGhvb2s6IHsgaW5pdDogaW5pdCwgcHJlcGF0Y2g6IHByZXBhdGNoIH0sXG4gICAgICAgIGZuOiBmbixcbiAgICAgICAgYXJnczogYXJnc1xuICAgIH0pO1xufTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydHMudGh1bms7XG4vLyMgc291cmNlTWFwcGluZ1VSTD10aHVuay5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB2bm9kZV8xID0gcmVxdWlyZShcIi4vdm5vZGVcIik7XG52YXIgaHRtbGRvbWFwaV8xID0gcmVxdWlyZShcIi4vaHRtbGRvbWFwaVwiKTtcbmZ1bmN0aW9uIHRvVk5vZGUobm9kZSwgZG9tQXBpKSB7XG4gICAgdmFyIGFwaSA9IGRvbUFwaSAhPT0gdW5kZWZpbmVkID8gZG9tQXBpIDogaHRtbGRvbWFwaV8xLmRlZmF1bHQ7XG4gICAgdmFyIHRleHQ7XG4gICAgaWYgKGFwaS5pc0VsZW1lbnQobm9kZSkpIHtcbiAgICAgICAgdmFyIGlkID0gbm9kZS5pZCA/ICcjJyArIG5vZGUuaWQgOiAnJztcbiAgICAgICAgdmFyIGNuID0gbm9kZS5nZXRBdHRyaWJ1dGUoJ2NsYXNzJyk7XG4gICAgICAgIHZhciBjID0gY24gPyAnLicgKyBjbi5zcGxpdCgnICcpLmpvaW4oJy4nKSA6ICcnO1xuICAgICAgICB2YXIgc2VsID0gYXBpLnRhZ05hbWUobm9kZSkudG9Mb3dlckNhc2UoKSArIGlkICsgYztcbiAgICAgICAgdmFyIGF0dHJzID0ge307XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IFtdO1xuICAgICAgICB2YXIgbmFtZV8xO1xuICAgICAgICB2YXIgaSA9IHZvaWQgMCwgbiA9IHZvaWQgMDtcbiAgICAgICAgdmFyIGVsbUF0dHJzID0gbm9kZS5hdHRyaWJ1dGVzO1xuICAgICAgICB2YXIgZWxtQ2hpbGRyZW4gPSBub2RlLmNoaWxkTm9kZXM7XG4gICAgICAgIGZvciAoaSA9IDAsIG4gPSBlbG1BdHRycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIG5hbWVfMSA9IGVsbUF0dHJzW2ldLm5vZGVOYW1lO1xuICAgICAgICAgICAgaWYgKG5hbWVfMSAhPT0gJ2lkJyAmJiBuYW1lXzEgIT09ICdjbGFzcycpIHtcbiAgICAgICAgICAgICAgICBhdHRyc1tuYW1lXzFdID0gZWxtQXR0cnNbaV0ubm9kZVZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDAsIG4gPSBlbG1DaGlsZHJlbi5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGNoaWxkcmVuLnB1c2godG9WTm9kZShlbG1DaGlsZHJlbltpXSwgZG9tQXBpKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdChzZWwsIHsgYXR0cnM6IGF0dHJzIH0sIGNoaWxkcmVuLCB1bmRlZmluZWQsIG5vZGUpO1xuICAgIH1cbiAgICBlbHNlIGlmIChhcGkuaXNUZXh0KG5vZGUpKSB7XG4gICAgICAgIHRleHQgPSBhcGkuZ2V0VGV4dENvbnRlbnQobm9kZSk7XG4gICAgICAgIHJldHVybiB2bm9kZV8xLmRlZmF1bHQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGV4dCwgbm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGFwaS5pc0NvbW1lbnQobm9kZSkpIHtcbiAgICAgICAgdGV4dCA9IGFwaS5nZXRUZXh0Q29udGVudChub2RlKTtcbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdCgnIScsIHt9LCBbXSwgdGV4dCwgbm9kZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KCcnLCB7fSwgW10sIHVuZGVmaW5lZCwgbm9kZSk7XG4gICAgfVxufVxuZXhwb3J0cy50b1ZOb2RlID0gdG9WTm9kZTtcbmV4cG9ydHMuZGVmYXVsdCA9IHRvVk5vZGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD10b3Zub2RlLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gdm5vZGUoc2VsLCBkYXRhLCBjaGlsZHJlbiwgdGV4dCwgZWxtKSB7XG4gICAgdmFyIGtleSA9IGRhdGEgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGRhdGEua2V5O1xuICAgIHJldHVybiB7IHNlbDogc2VsLCBkYXRhOiBkYXRhLCBjaGlsZHJlbjogY2hpbGRyZW4sXG4gICAgICAgIHRleHQ6IHRleHQsIGVsbTogZWxtLCBrZXk6IGtleSB9O1xufVxuZXhwb3J0cy52bm9kZSA9IHZub2RlO1xuZXhwb3J0cy5kZWZhdWx0ID0gdm5vZGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD12bm9kZS5qcy5tYXAiLCJmdW5jdGlvbiBub29wKCkge31cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAodXJsLCBvcHRzKSB7XG5cdG9wdHMgPSBvcHRzIHx8IHt9O1xuXG5cdHZhciB3cywgbnVtPTAsICQ9e307XG5cdHZhciBtYXggPSBvcHRzLm1heEF0dGVtcHRzIHx8IEluZmluaXR5O1xuXG5cdCQub3BlbiA9IGZ1bmN0aW9uICgpIHtcblx0XHR3cyA9IG5ldyBXZWJTb2NrZXQodXJsLCBvcHRzLnByb3RvY29scyB8fCBbXSk7XG5cblx0XHR3cy5vbm1lc3NhZ2UgPSBvcHRzLm9ubWVzc2FnZSB8fCBub29wO1xuXG5cdFx0d3Mub25vcGVuID0gZnVuY3Rpb24gKGUpIHtcblx0XHRcdChvcHRzLm9ub3BlbiB8fCBub29wKShlKTtcblx0XHRcdG51bSA9IDA7XG5cdFx0fTtcblxuXHRcdHdzLm9uY2xvc2UgPSBmdW5jdGlvbiAoZSkge1xuXHRcdFx0ZS5jb2RlID09PSAxZTMgfHwgZS5jb2RlID09PSAxMDA1IHx8ICQucmVjb25uZWN0KGUpO1xuXHRcdFx0KG9wdHMub25jbG9zZSB8fCBub29wKShlKTtcblx0XHR9O1xuXG5cdFx0d3Mub25lcnJvciA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHQoZSAmJiBlLmNvZGU9PT0nRUNPTk5SRUZVU0VEJykgPyAkLnJlY29ubmVjdChlKSA6IChvcHRzLm9uZXJyb3IgfHwgbm9vcCkoZSk7XG5cdFx0fTtcblx0fTtcblxuXHQkLnJlY29ubmVjdCA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0KG51bSsrIDwgbWF4KSA/IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0KG9wdHMub25yZWNvbm5lY3QgfHwgbm9vcCkoZSk7XG5cdFx0XHQkLm9wZW4oKTtcblx0XHR9LCBvcHRzLnRpbWVvdXQgfHwgMWUzKSA6IChvcHRzLm9ubWF4aW11bSB8fCBub29wKShlKTtcblx0fTtcblxuXHQkLmpzb24gPSBmdW5jdGlvbiAoeCkge1xuXHRcdHdzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeCkpO1xuXHR9O1xuXG5cdCQuc2VuZCA9IGZ1bmN0aW9uICh4KSB7XG5cdFx0d3Muc2VuZCh4KTtcblx0fTtcblxuXHQkLmNsb3NlID0gZnVuY3Rpb24gKHgsIHkpIHtcblx0XHR3cy5jbG9zZSh4IHx8IDFlMywgeSk7XG5cdH07XG5cblx0JC5vcGVuKCk7IC8vIGluaXRcblxuXHRyZXR1cm4gJDtcbn1cbiIsImltcG9ydCB7IGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG5pbXBvcnQgaCBmcm9tICdzbmFiYmRvbS9oJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNoYXRWaWV3IChjdHJsLCBjaGF0VHlwZSkge1xuICAgIGZ1bmN0aW9uIG9uS2V5UHJlc3MgKGUpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZVxuICAgICAgICBpZiAoKGUua2V5Q29kZSA9PSAxMyB8fCBlLndoaWNoID09IDEzKSAmJiBtZXNzYWdlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGN0cmwuc29jay5zZW5kKEpTT04uc3RyaW5naWZ5KHtcInR5cGVcIjogY2hhdFR5cGUsIFwibWVzc2FnZVwiOiBtZXNzYWdlLCBcImdhbWVJZFwiOiBjdHJsLm1vZGVsW1wiZ2FtZUlkXCJdIH0pKTtcbiAgICAgICAgICAgIChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaChgZGl2LiR7Y2hhdFR5cGV9IyR7Y2hhdFR5cGV9YCwgeyBjbGFzczoge1wiY2hhdFwiOiB0cnVlfSB9LCBbXG4gICAgICAgICAgICAgICAgaChgb2wjJHtjaGF0VHlwZX0tbWVzc2FnZXNgLCBbIGgoXCJkaXYjbWVzc2FnZXNcIildKSxcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNjaGF0LWVudHJ5Jywge1xuICAgICAgICAgICAgICAgICAgICBwcm9wczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcImVudHJ5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRvY29tcGxldGU6IFwib2ZmXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcjogXCJQbGVhc2UgYmUgbmljZSBpbiB0aGUgY2hhdCFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heGxlbmd0aDogXCIxNDBcIixcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgb246IHsga2V5cHJlc3M6IChlKSA9PiBvbktleVByZXNzKGUpIH0sXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF0pXG4gICAgfVxuXG5leHBvcnQgZnVuY3Rpb24gY2hhdE1lc3NhZ2UgKHVzZXIsIG1lc3NhZ2UsIGNoYXRUeXBlKSB7XG4gICAgY29uc3QgbXlEaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjaGF0VHlwZSArICctbWVzc2FnZXMnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAvLyBZb3UgbXVzdCBhZGQgYm9yZGVyIHdpZHRocywgcGFkZGluZyBhbmQgbWFyZ2lucyB0byB0aGUgcmlnaHQuXG4gICAgY29uc3QgaXNTY3JvbGxlZCA9IG15RGl2LnNjcm9sbFRvcCA9PSBteURpdi5zY3JvbGxIZWlnaHQgLSBteURpdi5vZmZzZXRIZWlnaHQ7XG5cbiAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21lc3NhZ2VzJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHVzZXIubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2I21lc3NhZ2VzJywgWyBoKFwibGkubWVzc2FnZS5vZmZlclwiLCBbaChcInRcIiwgbWVzc2FnZSldKSBdKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdkaXYjbWVzc2FnZXMnLCBbIGgoXCJsaS5tZXNzYWdlXCIsIFtoKFwidXNlclwiLCB1c2VyKSwgaChcInRcIiwgbWVzc2FnZSldKSBdKSk7XG4gICAgfTtcblxuICAgIGlmIChpc1Njcm9sbGVkKSBteURpdi5zY3JvbGxUb3AgPSBteURpdi5zY3JvbGxIZWlnaHQ7XG59IiwiaW1wb3J0IHsga2V5MnBvcyB9IGZyb20gJ2NoZXNzZ3JvdW5keC91dGlsJztcclxuaW1wb3J0IHsgQ29sb3IsIEdlb21ldHJ5LCBLZXksIFJvbGUgfSBmcm9tICdjaGVzc2dyb3VuZHgvdHlwZXMnO1xyXG5cclxuZXhwb3J0IGNvbnN0IHZhcmlhbnRzID0gW1wibWFrcnVrXCIsIFwic2l0dHV5aW5cIiwgXCJwbGFjZW1lbnRcIiwgXCJjcmF6eWhvdXNlXCIsIFwic3RhbmRhcmRcIiwgXCJzaG9naVwiLCBcInhpYW5ncWlcIiwgXCJjYXBhYmxhbmNhXCIsIFwic2VpcmF3YW5cIl07XHJcblxyXG5leHBvcnQgY29uc3QgVkFSSUFOVFMgPSB7XHJcbiAgICBtYWtydWs6IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiZ3JpZFwiLCBwaWVjZXM6IFwibWFrcnVrXCIsIGNzczogXCJtYWtydWtcIiwgaWNvbjogXCJ1XCJ9LFxyXG4gICAgc2l0dHV5aW46IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiZ3JpZHhcIiwgcGllY2VzOiBcIm1ha3J1a1wiLCBjc3M6IFwic2l0dHV5aW5cIiwgaWNvbjogXCJ1XCIgfSxcclxuICAgIHNob2dpOiB7IGdlb206IEdlb21ldHJ5LmRpbTl4OSwgY2c6IFwiY2ctNTc2XCIsIGJvYXJkOiBcImdyaWQ5eDlcIiwgcGllY2VzOiBcInNob2dpXCIsIGNzczogXCJzaG9naTBcIiwgaWNvbjogXCJ1XCIgfSxcclxuICAgIHhpYW5ncWk6IHsgZ2VvbTogR2VvbWV0cnkuZGltOXgxMCwgY2c6IFwiY2ctNTc2LTY0MFwiLCBib2FyZDogXCJyaXZlclwiLCBwaWVjZXM6IFwieGlhbmdxaVwiLCBjc3M6IFwieGlhbmdxaVwiLCBpY29uOiBcInVcIiB9LFxyXG4gICAgcGxhY2VtZW50OiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcInN0YW5kYXJkXCIsIGljb246IFwidVwiIH0sXHJcbiAgICBjcmF6eWhvdXNlOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcInN0YW5kYXJkXCIsIGljb246IFwiR1wiIH0sXHJcbiAgICBjYXBhYmxhbmNhOiB7IGdlb206IEdlb21ldHJ5LmRpbTEweDgsIGNnOiBcImNnLTY0MFwiLCBib2FyZDogXCJjYXBhYmxhbmNhXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcImNhcGFibGFuY2FcIiwgaWNvbjogXCJ1XCIgfSxcclxuICAgIHNlaXJhd2FuOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcInNlaXJhd2FuXCIsIGljb246IFwidVwiIH0sXHJcbiAgICBzdGFuZGFyZDogeyBnZW9tOiBHZW9tZXRyeS5kaW04eDgsIGNnOiBcImNnLTUxMlwiLCBib2FyZDogXCJicm93blwiLCBwaWVjZXM6IFwibWVyaWRhXCIsIGNzczogXCJzdGFuZGFyZFwiLCBpY29uOiBcInVcIiB9LFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcG9ja2V0Um9sZXModmFyaWFudDogc3RyaW5nKSB7XHJcbiAgICBzd2l0Y2ggKHZhcmlhbnQpIHtcclxuICAgIGNhc2UgXCJzaXR0dXlpblwiOlxyXG4gICAgICAgIHJldHVybiBbXCJyb29rXCIsIFwia25pZ2h0XCIsIFwic2lsdmVyXCIsIFwiZmVyelwiLCBcImtpbmdcIl07XHJcbiAgICBjYXNlIFwiY3Jhenlob3VzZVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJwYXduXCIsIFwia25pZ2h0XCIsIFwiYmlzaG9wXCIsIFwicm9va1wiLCBcInF1ZWVuXCJdO1xyXG4gICAgY2FzZSBcInNob2dpXCI6XHJcbiAgICAgICAgcmV0dXJuIFtcInBhd25cIiwgXCJsYW5jZVwiLCBcImtuaWdodFwiLCBcImJpc2hvcFwiLCBcInJvb2tcIiwgXCJzaWx2ZXJcIiwgXCJnb2xkXCJdO1xyXG4gICAgY2FzZSBcInNlaXJhd2FuXCI6XHJcbiAgICAgICAgcmV0dXJuIFtcImVsZXBoYW50XCIsIFwiaGF3a1wiXTtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIFtcInJvb2tcIiwgXCJrbmlnaHRcIiwgXCJiaXNob3BcIiwgXCJxdWVlblwiLCBcImtpbmdcIl07XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb21vdGlvblpvbmUodmFyaWFudDogc3RyaW5nLCBjb2xvcjogc3RyaW5nKSB7XHJcbiAgICBzd2l0Y2ggKHZhcmlhbnQpIHtcclxuICAgIGNhc2UgJ3Nob2dpJzpcclxuICAgICAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYTliOWM5ZDllOWY5ZzloOWk5YThiOGM4ZDhlOGY4ZzhoOGk4YTdiN2M3ZDdlN2Y3ZzdoN2k3JyA6ICdhMWIxYzFkMWUxZjFnMWgxaTFhMmIyYzJkMmUyZjJnMmgyaTJhM2IzYzNkM2UzZjNnM2gzaTMnO1xyXG4gICAgY2FzZSAnbWFrcnVrJzpcclxuICAgICAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYTZiNmM2ZDZlNmY2ZzZoNicgOiAnYTNiM2MzZDNlM2YzZzNoMyc7XHJcbiAgICBjYXNlICdzaXR0dXlpbic6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E4YjdjNmQ1ZTVmNmc3aDgnIDogJ2ExYjJjM2Q0ZTRmM2cyaDEnO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyAnYThiOGM4ZDhlOGY4ZzhoOGk4ajgnIDogJ2ExYjFjMWQxZTFmMWcxaDFpMWoxJztcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHByb21vdGlvblJvbGVzKHZhcmlhbnQ6IHN0cmluZywgcm9sZTogUm9sZSkge1xyXG4gICAgc3dpdGNoICh2YXJpYW50KSB7XHJcbiAgICBjYXNlIFwiY2FwYWJsYW5jYVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJxdWVlblwiLCBcImtuaWdodFwiLCBcInJvb2tcIiwgXCJiaXNob3BcIiwgXCJhcmNoYmlzaG9wXCIsIFwiY2FuY2VsbG9yXCJdO1xyXG4gICAgY2FzZSBcInNlaXJhd2FuXCI6XHJcbiAgICAgICAgcmV0dXJuIFtcInF1ZWVuXCIsIFwia25pZ2h0XCIsIFwicm9va1wiLCBcImJpc2hvcFwiLCBcImVsZXBoYW50XCIsIFwiaGF3a1wiXTtcclxuICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJwXCIgKyByb2xlLCByb2xlXTtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIFtcInF1ZWVuXCIsIFwia25pZ2h0XCIsIFwicm9va1wiLCBcImJpc2hvcFwiXTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1hbmRhdG9yeVByb21vdGlvbihyb2xlOiBSb2xlLCBkZXN0OiBLZXksIGNvbG9yOiBDb2xvcikge1xyXG4gICAgc3dpdGNoIChyb2xlKSB7XHJcbiAgICBjYXNlIFwicGF3blwiOlxyXG4gICAgY2FzZSBcImxhbmNlXCI6XHJcbiAgICAgICAgaWYgKGNvbG9yID09PSBcIndoaXRlXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGRlc3RbMV0gPT09IFwiOVwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjFcIjtcclxuICAgICAgICB9XHJcbiAgICBjYXNlIFwia25pZ2h0XCI6XHJcbiAgICAgICAgaWYgKGNvbG9yID09PSBcIndoaXRlXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGRlc3RbMV0gPT09IFwiOVwiIHx8IGRlc3RbMV0gPT09IFwiOFwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjFcIiB8fCBkZXN0WzFdID09PSBcIjJcIjtcclxuICAgICAgICB9XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5lZWRQb2NrZXRzKHZhcmlhbnQ6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHZhcmlhbnQgPT09ICdwbGFjZW1lbnQnIHx8IHZhcmlhbnQgPT09ICdjcmF6eWhvdXNlJyB8fCB2YXJpYW50ID09PSAnc2l0dHV5aW4nIHx8IHZhcmlhbnQgPT09ICdzaG9naScgfHwgdmFyaWFudCA9PT0gJ3NlaXJhd2FuJ1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaGFzRXAodmFyaWFudDogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gdmFyaWFudCA9PT0gJ3N0YW5kYXJkJyB8fCB2YXJpYW50ID09PSAncGxhY2VtZW50JyB8fCB2YXJpYW50ID09PSAnY3Jhenlob3VzZScgfHwgdmFyaWFudCA9PT0gJ2NhcGFibGFuY2EnIHx8IHZhcmlhbnQgPT09ICdzZWlyYXdhbidcclxufVxyXG5cclxuZnVuY3Rpb24gZGlmZihhOiBudW1iZXIsIGI6bnVtYmVyKTpudW1iZXIge1xyXG4gIHJldHVybiBNYXRoLmFicyhhIC0gYik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpYWdvbmFsTW92ZShwb3MxLCBwb3MyKSB7XHJcbiAgICBjb25zdCB4ZCA9IGRpZmYocG9zMVswXSwgcG9zMlswXSk7XHJcbiAgICBjb25zdCB5ZCA9IGRpZmYocG9zMVsxXSwgcG9zMlsxXSk7XHJcbiAgICByZXR1cm4geGQgPT09IHlkICYmIHhkID09PSAxO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FuR2F0ZShmZW4sIHBpZWNlLCBvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIiAgIGlzR2F0aW5nKClcIiwgcGllY2UsIG9yaWcsIGRlc3QsIG1ldGEpO1xyXG4gICAgaWYgKChwaWVjZS5jb2xvciA9PT0gXCJ3aGl0ZVwiICYmIG9yaWcuc2xpY2UoMSkgIT09IFwiMVwiKSB8fFxyXG4gICAgICAgIChwaWVjZS5jb2xvciA9PT0gXCJibGFja1wiICYmIG9yaWcuc2xpY2UoMSkgIT09IFwiOFwiKSB8fFxyXG4gICAgICAgIChwaWVjZS5yb2xlID09PSBcImhhd2tcIikgfHxcclxuICAgICAgICAocGllY2Uucm9sZSA9PT0gXCJlbGVwaGFudFwiKSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG5cclxuICAgIC8vIEluIHN0YXJ0aW5nIHBvc2l0aW9uIGtpbmcgYW5kKCEpIHJvb2sgdmlyZ2luaXR5IGlzIGVuY29kZWQgaW4gS1FrcVxyXG4gICAgLy8gXCJybmJxa2Juci9wcHBwcHBwcC84LzgvOC84L1BQUFBQUFBQL1JOQlFLQk5SW0hFaGVdIHcgS1FCQ0RGR2txYmNkZmcgLSAwIDFcIlxyXG5cclxuICAgIC8vIGJ1dCBhZnRlciBraW5ncyBtb3ZlZCByb29rIHZpcmdpbml0eSBpcyBlbmNvZGVkIGluIEFIYWhcclxuICAgIC8vIHJuYnExYm5yL3BwcHBrcHBwLzgvNHAzLzRQMy84L1BQUFBLUFBQL1JOQlExQk5SW0hFaGVdIHcgQUJDREZHSGFiY2RmZ2ggLSAyIDNcclxuXHJcbiAgICBjb25zdCBwYXJ0cyA9IGZlbi5zcGxpdChcIiBcIik7XHJcbiAgICBjb25zdCBwbGFjZW1lbnQgPSBwYXJ0c1swXTtcclxuICAgIGNvbnN0IGNvbG9yID0gcGFydHNbMV07XHJcbiAgICBjb25zdCBjYXN0bCA9IHBhcnRzWzJdO1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJpc0dhdGluZygpXCIsIG9yaWcsIHBsYWNlbWVudCwgY29sb3IsIGNhc3RsKTtcclxuICAgIHN3aXRjaCAob3JpZykge1xyXG4gICAgY2FzZSBcImExXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJBXCIpID09PSAtMSAmJiBjYXN0bC5pbmRleE9mKFwiUVwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJiMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiQlwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJjMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiQ1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJkMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiRFwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJlMVwiOlxyXG4gICAgICAgIGlmIChwaWVjZS5yb2xlICE9PSBcImtpbmdcIikgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImYxXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJGXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImcxXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJHXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImgxXCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJIXCIpID09PSAtMSAmJiBjYXN0bC5pbmRleE9mKFwiS1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJhOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiYVwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcInFcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYjhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImJcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYzhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImNcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZDhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImRcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZThcIjpcclxuICAgICAgICBpZiAocGllY2Uucm9sZSAhPT0gXCJraW5nXCIpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJmOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiZlwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJnOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiZ1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJoOFwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiaFwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcImtcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9O1xyXG4gICAgY29uc3QgYnJhY2tldFBvcyA9IHBsYWNlbWVudC5pbmRleE9mKFwiW1wiKTtcclxuICAgIGNvbnN0IHBvY2tldHMgPSBwbGFjZW1lbnQuc2xpY2UoYnJhY2tldFBvcyk7XHJcbiAgICBjb25zdCBwaCA9IGxjKHBvY2tldHMsIFwiaFwiLCBjb2xvcj09PSd3JykgPT09IDE7XHJcbiAgICBjb25zdCBwZSA9IGxjKHBvY2tldHMsIFwiZVwiLCBjb2xvcj09PSd3JykgPT09IDE7XHJcblxyXG4gICAgcmV0dXJuIFtwaCwgcGVdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9tb3Rpb24odmFyaWFudCwgcGllY2UsIG9yaWcsIGRlc3QsIG1ldGEpIHtcclxuICAgIGlmICh2YXJpYW50ID09PSAneGlhbmdxaScpIHJldHVybiBmYWxzZTtcclxuICAgIGNvbnN0IHB6ID0gcHJvbW90aW9uWm9uZSh2YXJpYW50LCBwaWVjZS5jb2xvcilcclxuICAgIHN3aXRjaCAodmFyaWFudCkge1xyXG4gICAgY2FzZSAnc2hvZ2knOlxyXG4gICAgICAgIHJldHVybiBwaWVjZS5yb2xlICE9PSBcImtpbmdcIiAmJiBwaWVjZS5yb2xlICE9PSAnZ29sZCcgJiYgKHB6LmluZGV4T2Yob3JpZykgIT09IC0xIHx8IHB6LmluZGV4T2YoZGVzdCkgIT09IC0xKVxyXG4gICAgY2FzZSAnc2l0dHV5aW4nOlxyXG4gICAgICAgIC8vIFNlZSBodHRwczovL3Zkb2N1bWVudHMubmV0L2hvdy10by1wbGF5LW15YW5tYXItdHJhZGl0aW9uYWwtY2hlc3MtZW5nLWJvb2stMS5odG1sXHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgZG0gPSBkaWFnb25hbE1vdmUoa2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLCBrZXkycG9zKGRlc3QsIGZpcnN0UmFua0lzMCkpO1xyXG4gICAgICAgIHJldHVybiBwaWVjZS5yb2xlID09PSBcInBhd25cIiAmJiAoIG9yaWcgPT09IGRlc3QgfHwgKCFtZXRhLmNhcHR1cmVkICYmIGRtKSlcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIHBpZWNlLnJvbGUgPT09IFwicGF3blwiICYmIHB6LmluZGV4T2YoZGVzdCkgIT09IC0xXHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1Y2kydXNpKG1vdmUpIHtcclxuICAgIGNvbnN0IHBhcnRzID0gbW92ZS5zcGxpdChcIlwiKTtcclxuICAgIGlmIChwYXJ0c1sxXSA9PT0gXCJAXCIpIHtcclxuICAgICAgICBwYXJ0c1sxXSA9IFwiKlwiO1xyXG4gICAgICAgIHBhcnRzWzJdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1syXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgICAgICBwYXJ0c1szXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbM10uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHBhcnRzWzBdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1swXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgICAgICBwYXJ0c1sxXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMV0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbMl0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzJdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgICAgIHBhcnRzWzNdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1szXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgIH1cclxuICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXNpMnVjaShtb3ZlKSB7XHJcbiAgICBjb25zdCBwYXJ0cyA9IG1vdmUuc3BsaXQoXCJcIik7XHJcbiAgICBpZiAocGFydHNbMV0gPT09IFwiKlwiKSB7XHJcbiAgICAgICAgcGFydHNbMV0gPSBcIkBcIjtcclxuICAgICAgICBwYXJ0c1syXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMl0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbM10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzNdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBwYXJ0c1swXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMF0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbMV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzFdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgICAgIHBhcnRzWzJdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1syXS5jaGFyQ29kZUF0KCkgKyA0OClcclxuICAgICAgICBwYXJ0c1szXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbM10uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHJvbGVUb1NhbiA9IHtcclxuICAgIHBhd246ICdQJyxcclxuICAgIGtuaWdodDogJ04nLFxyXG4gICAgYmlzaG9wOiAnQicsXHJcbiAgICByb29rOiAnUicsXHJcbiAgICBxdWVlbjogJ1EnLFxyXG4gICAga2luZzogJ0snLFxyXG4gICAgYXJjaGJpc2hvcDogJ0EnLFxyXG4gICAgY2FuY2VsbG9yOiAnQycsXHJcbiAgICBlbGVwaGFudDogXCJFXCIsXHJcbiAgICBoYXdrOiBcIkhcIixcclxuICAgIGZlcno6ICdGJyxcclxuICAgIG1ldDogJ00nLFxyXG4gICAgZ29sZDogJ0cnLFxyXG4gICAgc2lsdmVyOiAnUycsXHJcbiAgICBsYW5jZTogJ0wnLFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IHNhblRvUm9sZSA9IHtcclxuICAgIFA6ICdwYXduJyxcclxuICAgIE46ICdrbmlnaHQnLFxyXG4gICAgQjogJ2Jpc2hvcCcsXHJcbiAgICBSOiAncm9vaycsXHJcbiAgICBROiAncXVlZW4nLFxyXG4gICAgSzogJ2tpbmcnLFxyXG4gICAgQTogJ2FyY2hiaXNob3AnLFxyXG4gICAgQzogJ2NhbmNlbGxvcicsXHJcbiAgICBFOiAnZWxlcGhhbnQnLFxyXG4gICAgSDogJ2hhd2snLFxyXG4gICAgRjogJ2ZlcnonLFxyXG4gICAgTTogJ21ldCcsXHJcbiAgICBHOiAnZ29sZCcsXHJcbiAgICBTOiAnc2lsdmVyJyxcclxuICAgIEw6ICdsYW5jZScsXHJcbiAgICBwOiAncGF3bicsXHJcbiAgICBuOiAna25pZ2h0JyxcclxuICAgIGI6ICdiaXNob3AnLFxyXG4gICAgcjogJ3Jvb2snLFxyXG4gICAgcTogJ3F1ZWVuJyxcclxuICAgIGs6ICdraW5nJyxcclxuICAgIGE6ICdhcmNoYmlzaG9wJyxcclxuICAgIGM6ICdjYW5jZWxsb3InLFxyXG4gICAgZTogJ2VsZXBoYW50JyxcclxuICAgIGg6ICdoYXdrJyxcclxuICAgIGY6ICdmZXJ6JyxcclxuICAgIG06ICdtZXQnLFxyXG4gICAgZzogJ2dvbGQnLFxyXG4gICAgczogJ3NpbHZlcicsXHJcbiAgICBsOiAnbGFuY2UnLFxyXG59O1xyXG5cclxuLy8gQ291bnQgZ2l2ZW4gbGV0dGVyIG9jY3VyZW5jZXMgaW4gYSBzdHJpbmdcclxuZXhwb3J0IGZ1bmN0aW9uIGxjKHN0ciwgbGV0dGVyLCB1cHBlcmNhc2UpIHtcclxuICAgIHZhciBsZXR0ZXJDb3VudCA9IDA7XHJcbiAgICBpZiAodXBwZXJjYXNlKSBsZXR0ZXIgPSBsZXR0ZXIudG9VcHBlckNhc2UoKTtcclxuICAgIGZvciAodmFyIHBvc2l0aW9uID0gMDsgcG9zaXRpb24gPCBzdHIubGVuZ3RoOyBwb3NpdGlvbisrKSB7XHJcbiAgICAgICAgaWYgKHN0ci5jaGFyQXQocG9zaXRpb24pID09PSBsZXR0ZXIpIGxldHRlckNvdW50ICs9IDE7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbGV0dGVyQ291bnQ7XHJcbn1cclxuIiwiLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjA2MTgzNTUvdGhlLXNpbXBsZXN0LXBvc3NpYmxlLWphdmFzY3JpcHQtY291bnRkb3duLXRpbWVyXG5cbmltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG5leHBvcnQgY2xhc3MgQ2xvY2sge1xuICAgIGR1cmF0aW9uOiBudW1iZXI7XG4gICAgaW5jcmVtZW50OiBudW1iZXI7XG4gICAgZ3JhbnVsYXJpdHk6IG51bWJlcjtcbiAgICBydW5uaW5nOiBib29sZWFuO1xuICAgIGNvbm5lY3Rpbmc6IGJvb2xlYW47XG4gICAgdGltZW91dDogYW55O1xuICAgIHN0YXJ0VGltZTogYW55O1xuICAgIHRpY2tDYWxsYmFja3M6IGFueVtdO1xuICAgIGZsYWdDYWxsYmFjazogYW55O1xuICAgIGVsOiBIVE1MRWxlbWVudDtcblxuICAgIC8vIGdhbWUgYmFzZVRpbWUgKG1pbikgYW5kIGluY3JlbWVudCAoc2VjKVxuICAgIGNvbnN0cnVjdG9yKGJhc2VUaW1lLCBpbmNyZW1lbnQsIGVsKSB7XG4gICAgdGhpcy5kdXJhdGlvbiA9IGJhc2VUaW1lICogMTAwMCAqIDYwO1xuICAgIHRoaXMuaW5jcmVtZW50ID0gaW5jcmVtZW50ICogMTAwMDtcbiAgICB0aGlzLmdyYW51bGFyaXR5ID0gNTAwO1xuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgIHRoaXMuY29ubmVjdGluZyA9IGZhbHNlO1xuICAgIHRoaXMudGltZW91dCA9IG51bGw7XG4gICAgdGhpcy5zdGFydFRpbWUgPSBudWxsO1xuICAgIHRoaXMudGlja0NhbGxiYWNrcyA9IFtdO1xuICAgIHRoaXMuZmxhZ0NhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLmVsID0gZWw7XG5cbiAgICByZW5kZXJUaW1lKHRoaXMsIHRoaXMuZHVyYXRpb24pO1xuICAgIH1cblxuICAgIHN0YXJ0ID0gKGR1cmF0aW9uKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICAgICAgaWYgKHR5cGVvZiBkdXJhdGlvbiAhPT0gXCJ1bmRlZmluZWRcIikgdGhpcy5kdXJhdGlvbiA9IGR1cmF0aW9uO1xuXG4gICAgICAgIHRoaXMucnVubmluZyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgZGlmZjtcblxuICAgICAgICAoZnVuY3Rpb24gdGltZXIoKSB7XG4gICAgICAgICAgICBkaWZmID0gdGhhdC5kdXJhdGlvbiAtIChEYXRlLm5vdygpIC0gdGhhdC5zdGFydFRpbWUpO1xuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJ0aW1lcigpXCIsIHRoYXQuZHVyYXRpb24gLSBkaWZmKTtcbiAgICAgICAgICAgIGlmIChkaWZmIDw9IDApIHtcbiAgICAgICAgICAgICAgICB0aGF0LmZsYWdDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIHRoYXQucGF1c2UoZmFsc2UpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoYXQudGltZW91dCA9IHNldFRpbWVvdXQodGltZXIsIHRoYXQuZ3JhbnVsYXJpdHkpO1xuICAgICAgICAgICAgdGhhdC50aWNrQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoYXQsIHRoYXQsIGRpZmYpO1xuICAgICAgICAgICAgfSwgdGhhdCk7XG4gICAgICAgIH0oKSk7XG4gICAgfVxuXG4gICAgb25UaWNrID0gKGNhbGxiYWNrKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMudGlja0NhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbkZsYWcgPSAoY2FsbGJhY2spID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5wYXVzZShmYWxzZSk7XG4gICAgICAgICAgICB0aGlzLmZsYWdDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHBhdXNlID0gKHdpdGhJbmNyZW1lbnQpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcblxuICAgICAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMudGltZW91dCkgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dCk7XG4gICAgICAgIHRoaXMudGltZW91dCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5kdXJhdGlvbiAtPSBEYXRlLm5vdygpIC0gdGhpcy5zdGFydFRpbWU7XG4gICAgICAgIGlmICh3aXRoSW5jcmVtZW50ICYmIHRoaXMuaW5jcmVtZW50KSB0aGlzLmR1cmF0aW9uICs9IHRoaXMuaW5jcmVtZW50O1xuICAgICAgICByZW5kZXJUaW1lKHRoaXMsIHRoaXMuZHVyYXRpb24pO1xuICAgIH1cblxuICAgIHNldFRpbWUgPSAobWlsbGlzKSA9PiB7XG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBtaWxsaXM7XG4gICAgICAgIHJlbmRlclRpbWUodGhpcywgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgcGFyc2VUaW1lID0gKG1pbGxpcykgPT4ge1xuICAgICAgICBsZXQgbWludXRlcyA9IE1hdGguZmxvb3IobWlsbGlzIC8gNjAwMDApO1xuICAgICAgICBsZXQgc2Vjb25kcyA9IChtaWxsaXMgJSA2MDAwMCkgLyAxMDAwO1xuICAgICAgICBsZXQgc2VjcywgbWlucztcbiAgICAgICAgaWYgKE1hdGguZmxvb3Ioc2Vjb25kcykgPT0gNjApIHtcbiAgICAgICAgICAgIG1pbnV0ZXMrKztcbiAgICAgICAgICAgIHNlY29uZHMgPSAwO1xuICAgICAgICB9XG4gICAgICAgIG1pbnV0ZXMgPSBNYXRoLm1heCgwLCBtaW51dGVzKTtcbiAgICAgICAgc2Vjb25kcyA9IE1hdGgubWF4KDAsIHNlY29uZHMpO1xuICAgICAgICBpZiAobWlsbGlzIDwgMTAwMDApIHtcbiAgICAgICAgICAgIHNlY3MgPSBzZWNvbmRzLnRvRml4ZWQoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWNzID0gU3RyaW5nKE1hdGguZmxvb3Ioc2Vjb25kcykpO1xuICAgICAgICB9XG4gICAgICAgIG1pbnMgPSAobWludXRlcyA8IDEwID8gXCIwXCIgOiBcIlwiKSArIFN0cmluZyhtaW51dGVzKTtcbiAgICAgICAgc2VjcyA9IChzZWNvbmRzIDwgMTAgPyBcIjBcIiA6IFwiXCIpICsgc2VjcztcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG1pbnV0ZXM6IG1pbnMsXG4gICAgICAgICAgICBzZWNvbmRzOiBzZWNzLFxuICAgICAgICB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRpbWUoY2xvY2ssIHRpbWUpIHtcbiAgICBpZiAoY2xvY2suZ3JhbnVsYXJpdHkgPiAxMDAgJiYgdGltZSA8IDEwMDAwKSBjbG9jay5ncmFudWxhcml0eSA9IDEwMDtcbiAgICBjb25zdCBwYXJzZWQgPSBjbG9jay5wYXJzZVRpbWUodGltZSk7XG4gICAgLy8gY29uc29sZS5sb2coXCJyZW5kZXJUaW1lKCk6XCIsIHRpbWUsIHBhcnNlZCk7XG5cbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodGltZSk7XG4gICAgY29uc3QgbWlsbGlzID0gZGF0ZS5nZXRVVENNaWxsaXNlY29uZHMoKTtcbiAgICBjbG9jay5lbCA9IHBhdGNoKGNsb2NrLmVsLCBoKCdkaXYuY2xvY2std3JhcCcsIFtoKCdkaXYuY2xvY2snLCBbXG4gICAgICAgIGgoJ2Rpdi5jbG9jay50aW1lLm1pbicsIHtjbGFzczoge3J1bm5pbmc6IGNsb2NrLnJ1bm5pbmcsIGh1cnJ5OiB0aW1lIDwgMTAwMDAsIGNvbm5lY3Rpbmc6IGNsb2NrLmNvbm5lY3Rpbmd9fSwgcGFyc2VkLm1pbnV0ZXMpLFxuICAgICAgICBoKCdkaXYuY2xvY2suc2VwJywge2NsYXNzOiB7cnVubmluZzogY2xvY2sucnVubmluZywgaHVycnk6IHRpbWUgPCAxMDAwMCwgbG93OiBtaWxsaXMgPCA1MDAsIGNvbm5lY3Rpbmc6IGNsb2NrLmNvbm5lY3Rpbmd9fSAsICc6JyksXG4gICAgICAgIGgoJ2Rpdi5jbG9jay50aW1lLnNlYycsIHtjbGFzczoge3J1bm5pbmc6IGNsb2NrLnJ1bm5pbmcsIGh1cnJ5OiB0aW1lIDwgMTAwMDAsIGNvbm5lY3Rpbmc6IGNsb2NrLmNvbm5lY3Rpbmd9fSwgcGFyc2VkLnNlY29uZHMpLFxuICAgICAgICBdKV0pKTtcbn1cbiIsImltcG9ydCBTb2NrZXR0ZSBmcm9tICdzb2NrZXR0ZSc7XHJcblxyXG5pbXBvcnQgeyBpbml0IH0gZnJvbSAnc25hYmJkb20nO1xyXG5pbXBvcnQgeyBoIH0gZnJvbSAnc25hYmJkb20vaCc7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcblxyXG5pbXBvcnQgeyBrZXkycG9zLCBwb3Mya2V5IH0gZnJvbSAnY2hlc3Nncm91bmR4L3V0aWwnO1xyXG5pbXBvcnQgeyBDaGVzc2dyb3VuZCB9IGZyb20gJ2NoZXNzZ3JvdW5keCc7XHJcbmltcG9ydCB7IEFwaSB9IGZyb20gJ2NoZXNzZ3JvdW5keC9hcGknO1xyXG5pbXBvcnQgeyBDb2xvciwgRGVzdHMsIFBpZWNlc0RpZmYsIFJvbGUsIEtleSwgUG9zLCBQaWVjZSwgZGltZW5zaW9ucyB9IGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XHJcblxyXG5pbXBvcnQgeyBDbG9jaywgcmVuZGVyVGltZSB9IGZyb20gJy4vY2xvY2snO1xyXG5pbXBvcnQgbWFrZUdhdGluZyBmcm9tICcuL2dhdGluZyc7XHJcbmltcG9ydCBtYWtlUHJvbW90aW9uIGZyb20gJy4vcHJvbW90aW9uJztcclxuaW1wb3J0IHsgZHJvcElzVmFsaWQsIHBvY2tldFZpZXcsIHVwZGF0ZVBvY2tldHMgfSBmcm9tICcuL3BvY2tldCc7XHJcbmltcG9ydCB7IHNvdW5kLCBjaGFuZ2VDU1MgfSBmcm9tICcuL3NvdW5kJztcclxuaW1wb3J0IHsgaGFzRXAsIG5lZWRQb2NrZXRzLCByb2xlVG9TYW4sIHVjaTJ1c2ksIHVzaTJ1Y2ksIFZBUklBTlRTIH0gZnJvbSAnLi9jaGVzcyc7XHJcbmltcG9ydCB7IHJlbmRlclVzZXJuYW1lIH0gZnJvbSAnLi91c2VyJztcclxuaW1wb3J0IHsgY2hhdE1lc3NhZ2UsIGNoYXRWaWV3IH0gZnJvbSAnLi9jaGF0JztcclxuaW1wb3J0IHsgbW92ZWxpc3RWaWV3LCB1cGRhdGVNb3ZlbGlzdCB9IGZyb20gJy4vbW92ZWxpc3QnO1xyXG5pbXBvcnQgcmVzaXplSGFuZGxlIGZyb20gJy4vcmVzaXplJztcclxuLy8gaW1wb3J0IHsgQUNDRVBULCBCQUNLfSBmcm9tICcuL3NpdGUnO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XHJcblxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUm91bmRDb250cm9sbGVyIHtcclxuICAgIG1vZGVsO1xyXG4gICAgc29jaztcclxuICAgIGV2dEhhbmRsZXI7XHJcbiAgICBjaGVzc2dyb3VuZDogQXBpO1xyXG4gICAgZnVsbGZlbjogc3RyaW5nO1xyXG4gICAgd3BsYXllcjogc3RyaW5nO1xyXG4gICAgYnBsYXllcjogc3RyaW5nO1xyXG4gICAgYmFzZTogbnVtYmVyO1xyXG4gICAgaW5jOiBudW1iZXI7XHJcbiAgICBteWNvbG9yOiBDb2xvcjtcclxuICAgIG9wcGNvbG9yOiBDb2xvcjtcclxuICAgIHR1cm5Db2xvcjogQ29sb3I7XHJcbiAgICBjbG9ja3M6IGFueTtcclxuICAgIGFib3J0YWJsZTogYm9vbGVhbjtcclxuICAgIGdhbWVJZDogc3RyaW5nO1xyXG4gICAgdmFyaWFudDogc3RyaW5nO1xyXG4gICAgcG9ja2V0czogYW55O1xyXG4gICAgdnBvY2tldDA6IGFueTtcclxuICAgIHZwb2NrZXQxOiBhbnk7XHJcbiAgICBnYW1lQ29udHJvbHM6IGFueTtcclxuICAgIG1vdmVDb250cm9sczogYW55O1xyXG4gICAgZ2F0aW5nOiBhbnk7XHJcbiAgICBwcm9tb3Rpb246IGFueTtcclxuICAgIGRlc3RzOiBEZXN0cztcclxuICAgIGxhc3Rtb3ZlOiBLZXlbXTtcclxuICAgIHByZW1vdmU6IGFueTtcclxuICAgIHByZWRyb3A6IGFueTtcclxuICAgIHJlc3VsdDogc3RyaW5nO1xyXG4gICAgZmxpcDogYm9vbGVhbjtcclxuICAgIHNwZWN0YXRvcjogYm9vbGVhbjtcclxuICAgIG9wcElzUmFuZG9tQk9UOiBib29sZWFuO1xyXG4gICAgdHY6IHN0cmluZztcclxuICAgIHN0ZXBzO1xyXG4gICAgcGx5OiBudW1iZXI7XHJcbiAgICBwbGF5ZXJzOiBzdHJpbmdbXTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihlbCwgbW9kZWwsIGhhbmRsZXIpIHtcclxuICAgICAgICBjb25zdCBvbk9wZW4gPSAoZXZ0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiY3RybC5vbk9wZW4oKVwiLCBldnQpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1swXS5jb25uZWN0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzWzFdLmNvbm5lY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImdhbWVfdXNlcl9jb25uZWN0ZWRcIiwgdXNlcm5hbWU6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1heEF0dGVtcHRzOiAxMCxcclxuICAgICAgICAgICAgb25vcGVuOiBlID0+IG9uT3BlbihlKSxcclxuICAgICAgICAgICAgb25tZXNzYWdlOiBlID0+IHRoaXMub25NZXNzYWdlKGUpLFxyXG4gICAgICAgICAgICBvbnJlY29ubmVjdDogZSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1swXS5jb25uZWN0aW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzWzFdLmNvbm5lY3RpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1JlY29ubmVjdGluZyBpbiByb3VuZC4uLicsIGUpO1xyXG5cclxuICAgICAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYm90dG9tLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiBmYWxzZSwgXCJpY29uLW9mZmxpbmVcIjogdHJ1ZX19KSk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBvbm1heGltdW06IGUgPT4gY29uc29sZS5sb2coJ1N0b3AgQXR0ZW1wdGluZyEnLCBlKSxcclxuICAgICAgICAgICAgb25jbG9zZTogZSA9PiBjb25zb2xlLmxvZygnQ2xvc2VkIScsIGUpLFxyXG4gICAgICAgICAgICBvbmVycm9yOiBlID0+IGNvbnNvbGUubG9nKCdFcnJvcjonLCBlKSxcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdGhpcy5zb2NrID0gbmV3IFNvY2tldHRlKFwid3M6Ly9cIiArIGxvY2F0aW9uLmhvc3QgKyBcIi93c1wiLCBvcHRzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2goZXJyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBTb2NrZXR0ZShcIndzczovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzXCIsIG9wdHMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xyXG4gICAgICAgIHRoaXMuZXZ0SGFuZGxlciA9IGhhbmRsZXI7XHJcbiAgICAgICAgdGhpcy52YXJpYW50ID0gbW9kZWxbXCJ2YXJpYW50XCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLmZ1bGxmZW4gPSBtb2RlbFtcImZlblwiXSBhcyBzdHJpbmc7XHJcbiAgICAgICAgdGhpcy53cGxheWVyID0gbW9kZWxbXCJ3cGxheWVyXCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLmJwbGF5ZXIgPSBtb2RlbFtcImJwbGF5ZXJcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuYmFzZSA9IG1vZGVsW1wiYmFzZVwiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5pbmMgPSBtb2RlbFtcImluY1wiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy50diA9IG1vZGVsW1widHZcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuc3RlcHMgPSBbXTtcclxuICAgICAgICB0aGlzLnBseSA9IDA7XHJcblxyXG4gICAgICAgIHRoaXMuZmxpcCA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0aGlzLnNwZWN0YXRvciA9IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSAhPT0gdGhpcy53cGxheWVyICYmIHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSAhPT0gdGhpcy5icGxheWVyO1xyXG4gICAgICAgIGlmICh0aGlzLnR2KSB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5oaXN0b3J5LnB1c2hTdGF0ZSh7fSwgZG9jdW1lbnQudGl0bGUsIFwiL3R2XCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5oaXN0b3J5LnB1c2hTdGF0ZSh7fSwgZG9jdW1lbnQudGl0bGUsIFwiL1wiICsgdGhpcy5tb2RlbFtcImdhbWVJZFwiXSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBvcmllbnRhdGlvbiA9IHRoaXMubXljb2xvclxyXG4gICAgICAgIGlmICh0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICB0aGlzLm15Y29sb3IgPSB0aGlzLnZhcmlhbnQgPT09ICdzaG9naScgPyAnYmxhY2snIDogJ3doaXRlJztcclxuICAgICAgICAgICAgdGhpcy5vcHBjb2xvciA9IHRoaXMudmFyaWFudCA9PT0gJ3Nob2dpJyA/ICd3aGl0ZScgOiAnYmxhY2snO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMubXljb2xvciA9IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSA9PT0gdGhpcy53cGxheWVyID8gJ3doaXRlJyA6ICdibGFjayc7XHJcbiAgICAgICAgICAgIHRoaXMub3BwY29sb3IgPSB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPT09IHRoaXMud3BsYXllciA/ICdibGFjaycgOiAnd2hpdGUnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5vcHBJc1JhbmRvbUJPVCA9IChcclxuICAgICAgICAgICAgKHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiICYmIHRoaXMuYnBsYXllciA9PT0gXCJSYW5kb20tTW92ZXJcIikgfHxcclxuICAgICAgICAgICAgKHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiICYmIHRoaXMud3BsYXllciA9PT0gXCJSYW5kb20tTW92ZXJcIikpO1xyXG5cclxuICAgICAgICAvLyBwbGF5ZXJzWzBdIGlzIHRvcCBwbGF5ZXIsIHBsYXllcnNbMV0gaXMgYm90dG9tIHBsYXllclxyXG4gICAgICAgIHRoaXMucGxheWVycyA9IFtcclxuICAgICAgICAgICAgdGhpcy5teWNvbG9yID09PSBcIndoaXRlXCIgPyB0aGlzLmJwbGF5ZXIgOiB0aGlzLndwbGF5ZXIsXHJcbiAgICAgICAgICAgIHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiID8gdGhpcy53cGxheWVyIDogdGhpcy5icGxheWVyXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0gbnVsbDtcclxuICAgICAgICB0aGlzLnByZWRyb3AgPSBudWxsO1xyXG5cclxuICAgICAgICB0aGlzLnJlc3VsdCA9IFwiXCI7XHJcbiAgICAgICAgY29uc3QgcGFydHMgPSB0aGlzLmZ1bGxmZW4uc3BsaXQoXCIgXCIpO1xyXG4gICAgICAgIHRoaXMuYWJvcnRhYmxlID0gTnVtYmVyKHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdKSA8PSAxO1xyXG5cclxuICAgICAgICBjb25zdCBmZW5fcGxhY2VtZW50ID0gcGFydHNbMF07XHJcbiAgICAgICAgdGhpcy50dXJuQ29sb3IgPSBwYXJ0c1sxXSA9PT0gXCJ3XCIgPyBcIndoaXRlXCIgOiBcImJsYWNrXCI7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikge1xyXG4gICAgICAgICAgICB0aGlzLnNldFBpZWNlQ29sb3JzKHRoaXMubXljb2xvcik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY2hhbmdlQ1NTKCcvc3RhdGljLycgKyBWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmNzcyArICcuY3NzJywgMSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5zdGVwcy5wdXNoKHtcclxuICAgICAgICAgICAgJ2Zlbic6IGZlbl9wbGFjZW1lbnQsXHJcbiAgICAgICAgICAgICdtb3ZlJzogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAnY2hlY2snOiBmYWxzZSxcclxuICAgICAgICAgICAgJ3R1cm5Db2xvcic6IHRoaXMudHVybkNvbG9yLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZCA9IENoZXNzZ3JvdW5kKGVsLCB7XHJcbiAgICAgICAgICAgIGZlbjogZmVuX3BsYWNlbWVudCxcclxuICAgICAgICAgICAgZ2VvbWV0cnk6IFZBUklBTlRTW3RoaXMudmFyaWFudF0uZ2VvbSxcclxuICAgICAgICAgICAgb3JpZW50YXRpb246IHRoaXMubXljb2xvcixcclxuICAgICAgICAgICAgdHVybkNvbG9yOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgYW5pbWF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgIGluc2VydChlbGVtZW50cykge3Jlc2l6ZUhhbmRsZShlbGVtZW50cyk7fVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICB2aWV3T25seTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGV2ZW50czoge1xyXG4gICAgICAgICAgICAgICAgICAgIG1vdmU6IHRoaXMub25Nb3ZlKCksXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgIG1vdmFibGU6IHtcclxuICAgICAgICAgICAgICAgICAgICBmcmVlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWZ0ZXI6IHRoaXMub25Vc2VyTW92ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWZ0ZXJOZXdQaWVjZTogdGhpcy5vblVzZXJEcm9wLFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBwcmVtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0OiB0aGlzLnNldFByZW1vdmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuc2V0OiB0aGlzLnVuc2V0UHJlbW92ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHByZWRyb3BwYWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldDogdGhpcy5zZXRQcmVkcm9wLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1bnNldDogdGhpcy51bnNldFByZWRyb3AsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICBtb3ZlOiB0aGlzLm9uTW92ZSgpLFxyXG4gICAgICAgICAgICAgICAgICAgIGRyb3BOZXdQaWVjZTogdGhpcy5vbkRyb3AoKSxcclxuICAgICAgICAgICAgICAgICAgICBjaGFuZ2U6IHRoaXMub25DaGFuZ2UodGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5zZWxlY3RlZCksXHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0OiB0aGlzLm9uU2VsZWN0KHRoaXMuY2hlc3Nncm91bmQuc3RhdGUuc2VsZWN0ZWQpLFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLmdhdGluZyA9IG1ha2VHYXRpbmcodGhpcyk7XHJcbiAgICAgICAgdGhpcy5wcm9tb3Rpb24gPSBtYWtlUHJvbW90aW9uKHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBpbml0aWFsaXplIHBvY2tldHNcclxuICAgICAgICBpZiAobmVlZFBvY2tldHModGhpcy52YXJpYW50KSkge1xyXG4gICAgICAgICAgICBjb25zdCBwb2NrZXQwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BvY2tldDAnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgcG9ja2V0MSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwb2NrZXQxJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHVwZGF0ZVBvY2tldHModGhpcywgcG9ja2V0MCwgcG9ja2V0MSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBpbml0aWFsaXplIGNsb2Nrc1xyXG4gICAgICAgIGNvbnN0IGMwID0gbmV3IENsb2NrKHRoaXMuYmFzZSwgdGhpcy5pbmMsIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbG9jazAnKSBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgICAgY29uc3QgYzEgPSBuZXcgQ2xvY2sodGhpcy5iYXNlLCB0aGlzLmluYywgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Nsb2NrMScpIGFzIEhUTUxFbGVtZW50KTtcclxuICAgICAgICB0aGlzLmNsb2NrcyA9IFtjMCwgYzFdO1xyXG4gICAgICAgIHRoaXMuY2xvY2tzWzBdLm9uVGljayhyZW5kZXJUaW1lKTtcclxuICAgICAgICB0aGlzLmNsb2Nrc1sxXS5vblRpY2socmVuZGVyVGltZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZsYWdDYWxsYmFjayA9ICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMudHVybkNvbG9yID09PSB0aGlzLm15Y29sb3IgJiYgIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnN0b3AoKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRmxhZ1wiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJmbGFnXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNsb2Nrc1sxXS5vbkZsYWcoZmxhZ0NhbGxiYWNrKTtcclxuXHJcbiAgICAgICAgLy8gVE9ETzogYWRkIGRhcmsvbGlnaHQgdGhlbWUgYnV0dG9ucyAoaWNvbi1zdW4tby9pY29uLW1vb24tbylcclxuICAgICAgICAvLyBUT0RPOiBhZGQgd2VzdGVybiBwaWVjZXMgdGhlbWUgYnV0dG9uIGZvciB4aWFuZ3F1aSwgc2hvZ2ksIG1ha3J1aywgc2l0dHV5aW5cclxuICAgICAgICAvLyB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1mbGlwJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgLy8gcGF0Y2goY29udGFpbmVyLCBoKCdidXR0b24nLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiB0b2dnbGVPcmllbnRhdGlvbigpIH0sIHByb3BzOiB7dGl0bGU6ICdGbGlwIGJvYXJkJ30gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXJlZnJlc2hcIjogdHJ1ZX0gfSApLCBdKSk7XHJcblxyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnem9vbScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGF0dHJzOiB7IHdpZHRoOiAnMjgwcHgnLCB0eXBlOiAncmFuZ2UnLCB2YWx1ZTogMTAwLCBtaW46IDUwLCBtYXg6IDE1MCB9LFxyXG4gICAgICAgICAgICBvbjogeyBpbnB1dDogKGUpID0+IHsgdGhpcy5zZXRab29tKHBhcnNlRmxvYXQoKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKSk7IH0gfSB9KVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vY29uc3Qgb25SZXNpemUgPSAoKSA9PiB7Y29uc29sZS5sb2coXCJvblJlc2l6ZSgpXCIpO31cclxuICAgICAgICAvL3ZhciBlbG1udCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjZ3dyYXAnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAvL2VsbW50LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgb25SZXNpemUpO1xyXG5cclxuICAgICAgICBjb25zdCBhYm9ydCA9ICgpID0+IHtcclxuICAgICAgICAgICAgLy8gVE9ETzogZGlzYWJsZSB3aGVuIHBseSA+IDJcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJBYm9ydFwiKTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImFib3J0XCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRyYXcgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRHJhd1wiKTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImRyYXdcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVzaWduID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlJlc2lnblwiKTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcInJlc2lnblwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG4vKlxyXG4gICAgICAgIGNvbnN0IGRpc2Nvbm5lY3QgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiVGVzdGluZyBzb2NrZXQgZGlzY29ubmVjdC4uLlwiKTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImRpc2Nvbm5lY3RcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH1cclxuKi9cclxuICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWUtY29udHJvbHMnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUNvbnRyb2xzID0gcGF0Y2goY29udGFpbmVyLCBoKCdkaXYuYnRuLWNvbnRyb2xzJywgW1xyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uI2Fib3J0JywgeyBvbjogeyBjbGljazogKCkgPT4gYWJvcnQoKSB9LCBwcm9wczoge3RpdGxlOiAnQWJvcnQnfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tYWJvcnRcIjogdHJ1ZX0gfSApLCBdKSxcclxuICAgICAgICAgICAgICAgIGgoJ2J1dHRvbiNkcmF3JywgeyBvbjogeyBjbGljazogKCkgPT4gZHJhdygpIH0sIHByb3BzOiB7dGl0bGU6IFwiRHJhd1wifSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24taGFuZC1wYXBlci1vXCI6IHRydWV9IH0gKSwgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24jcmVzaWduJywgeyBvbjogeyBjbGljazogKCkgPT4gcmVzaWduKCkgfSwgcHJvcHM6IHt0aXRsZTogXCJSZXNpZ25cIn0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWZsYWctb1wiOiB0cnVlfSB9ICksIF0pLFxyXG4gICAgICAgICAgICAgICAgLy8gaCgnYnV0dG9uI2Rpc2Nvbm5lY3QnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBkaXNjb25uZWN0KCkgfSwgcHJvcHM6IHt0aXRsZTogJ2Rpc2Nvbm5lY3QnfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tc2lnbi1vdXRcIjogdHJ1ZX0gfSApLCBdKSxcclxuICAgICAgICAgICAgICAgIF0pXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lQ29udHJvbHMgPSBwYXRjaChjb250YWluZXIsIGgoJ2RpdicpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHBhdGNoKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb3ZlbGlzdCcpIGFzIEhUTUxFbGVtZW50LCBtb3ZlbGlzdFZpZXcodGhpcykpO1xyXG5cclxuICAgICAgICBwYXRjaChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm91bmRjaGF0JykgYXMgSFRNTEVsZW1lbnQsIGNoYXRWaWV3KHRoaXMsIFwicm91bmRjaGF0XCIpKTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRHcm91bmQgPSAoKSA9PiB0aGlzLmNoZXNzZ3JvdW5kO1xyXG4gICAgZ2V0RGVzdHMgPSAoKSA9PiB0aGlzLmRlc3RzO1xyXG5cclxuICAgIHByaXZhdGUgc2V0Wm9vbSA9ICh6b29tOiBudW1iZXIpID0+IHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jZy13cmFwJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKGVsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGRpbWVuc2lvbnNbVkFSSUFOVFNbdGhpcy52YXJpYW50XS5nZW9tXS53aWR0aCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDUyIDogNjQpO1xyXG4gICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLmhlaWdodCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDYwIDogNjQpO1xyXG4gICAgICAgICAgICBjb25zdCBweHcgPSBgJHt6b29tIC8gMTAwICogYmFzZVdpZHRofXB4YDtcclxuICAgICAgICAgICAgY29uc3QgcHhoID0gYCR7em9vbSAvIDEwMCAqIGJhc2VIZWlnaHR9cHhgO1xyXG4gICAgICAgICAgICBlbC5zdHlsZS53aWR0aCA9IHB4dztcclxuICAgICAgICAgICAgZWwuc3R5bGUuaGVpZ2h0ID0gcHhoO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcInNldFpvb20oKSBIRUlHSFQ9XCIsIHB4aCk7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuc2V0QXR0cmlidXRlKCdzdHlsZScsICctLWNnd3JhcGhlaWdodDonICsgcHhoKTtcclxuICAgICAgICAgICAgY29uc3QgZXYgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcclxuICAgICAgICAgICAgZXYuaW5pdEV2ZW50KCdjaGVzc2dyb3VuZC5yZXNpemUnLCBmYWxzZSwgZmFsc2UpO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmRpc3BhdGNoRXZlbnQoZXYpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnR2FtZVN0YXJ0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ290IGdhbWVTdGFydCBtc2c6XCIsIG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy5nYW1lSWQgIT09IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pIHJldHVybjtcclxuICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSBzb3VuZC5nZW5lcmljTm90aWZ5KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ0FjY2VwdFNlZWsgPSAobXNnKSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJHYW1lQ29udHJvbGxlci5vbk1zZ0FjY2VwdFNlZWsoKVwiLCB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKVxyXG4gICAgICAgIC8vIHRoaXMuZXZ0SGFuZGxlcih7IHR5cGU6IEFDQ0VQVCB9KTtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24uYXNzaWduKHRoaXMubW9kZWxbXCJob21lXCJdICsgJy8nICsgbXNnW1wiZ2FtZUlkXCJdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbWF0Y2ggPSAoKSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJSRU1BVENIXCIpO1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJyZW1hdGNoXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICAvLyB3aW5kb3cubG9jYXRpb24uYXNzaWduKGhvbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbmV3T3Bwb25lbnQgPSAoaG9tZSkgPT4ge1xyXG4gICAgICAgIC8vIHRoaXMuZXZ0SGFuZGxlcih7IHR5cGU6IEJBQ0sgfSk7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbihob21lKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVPdmVyID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZUNvbnRyb2xzID0gcGF0Y2godGhpcy5nYW1lQ29udHJvbHMsIGgoJ2RpdicpKTtcclxuXHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZnRlci1nYW1lJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKHRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmFmdGVyLWdhbWUnLCBbaCgncmVzdWx0JywgdGhpcy5yZXN1bHQpXSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmFmdGVyLWdhbWUnLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdyZXN1bHQnLCB0aGlzLnJlc3VsdCksXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24ucmVtYXRjaCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHRoaXMucmVtYXRjaCgpIH0gfSwgXCJSRU1BVENIXCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uLm5ld29wcCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHRoaXMubmV3T3Bwb25lbnQodGhpcy5tb2RlbFtcImhvbWVcIl0pIH0gfSwgXCJORVcgT1BQT05FTlRcIiksXHJcbiAgICAgICAgICAgIF0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjaGVja1N0YXR1cyA9IChtc2cpID0+IHtcclxuICAgICAgICBpZiAobXNnLmdhbWVJZCAhPT0gdGhpcy5tb2RlbFtcImdhbWVJZFwiXSkgcmV0dXJuO1xyXG4gICAgICAgIGlmIChtc2cuc3RhdHVzID49IDApIHtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMF0ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1sxXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmVzdWx0ID0gbXNnLnJlc3VsdDtcclxuICAgICAgICAgICAgc3dpdGNoIChtc2cucmVzdWx0KSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiMS8yXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgc291bmQuZHJhdygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIjEtMFwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubXljb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZC52aWN0b3J5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZC5kZWZlYXQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCIwLTFcIjpcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm15Y29sb3IgPT09IFwiYmxhY2tcIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291bmQudmljdG9yeSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291bmQuZGVmZWF0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAvLyBBQk9SVEVEXHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndW5kZXItYm9hcmQnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCd1bmRlci1ib2FyZCcsIFtoKCd0ZXh0YXJlYScsIHsgYXR0cnM6IHsgcm93czogMTMsIGNvbHM6IDgwfSB9LCBtc2cucGduKV0pKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnR2KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBzZW5kIG1zZyB0byBzZXJ2ZXIgaW5zdGVhZCBhbmQgQkFDSyB3aXRoIG5ldyBtb2RlbFtcImdhbWVJZFwiXSBldGMuIGdvdCBmcm9tIGFuc3dlclxyXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7d2luZG93LmxvY2F0aW9uLmFzc2lnbih0aGlzLm1vZGVsW1wiaG9tZVwiXSArICcvdHYnKTt9LCAxMDAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBjaGFuZ2Ugc2hvZ2kgcGllY2UgY29sb3JzIGFjY29yZGluZyB0byBib2FyZCBvcmllbnRhdGlvblxyXG4gICAgcHJpdmF0ZSBzZXRQaWVjZUNvbG9ycyA9IChjb2xvcikgPT4ge1xyXG4gICAgICAgIGlmIChjb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgIGNoYW5nZUNTUygnL3N0YXRpYy9zaG9naTAuY3NzJywgMSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY2hhbmdlQ1NTKCcvc3RhdGljL3Nob2dpMS5jc3MnLCAxKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEluIENhcGFibGFuY2Egd2UgaGF2ZSB0byBmaW5lbGl6ZSBjYXN0bGluZyBiZWNhdXNlXHJcbiAgICAvLyBjaGVzc2dyb3VuZCBhdXRvQ2FzdGxlIHdvcmtzIGZvciBzdGFuZGFyZCBjaGVzcyBvbmx5XHJcbiAgICBwcml2YXRlIGNhc3RsZVJvb2sgPSAoa2luZ0Rlc3QsIGNvbG9yKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZGlmZjogUGllY2VzRGlmZiA9IHt9O1xyXG4gICAgICAgIGlmIChraW5nRGVzdCA9PT0gXCJjXCIpIHtcclxuICAgICAgICAgICAgZGlmZltjb2xvciA9PT0gJ3doaXRlJyA/IFwiYTFcIiA6IFwiYThcIl0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGRpZmZbY29sb3IgPT09ICd3aGl0ZScgPyBcImQxXCIgOiBcImQ4XCJdID0ge2NvbG9yOiBjb2xvciwgcm9sZTogXCJyb29rXCJ9O1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldFBpZWNlcyhkaWZmKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGlmIChraW5nRGVzdCA9PT0gXCJpXCIpIHtcclxuICAgICAgICAgICAgZGlmZltjb2xvciA9PT0gJ3doaXRlJyA/IFwiajFcIiA6IFwiajhcIl0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGRpZmZbY29sb3IgPT09ICd3aGl0ZScgPyBcImgxXCIgOiBcImg4XCJdID0ge2NvbG9yOiBjb2xvciwgcm9sZTogXCJyb29rXCJ9O1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldFBpZWNlcyhkaWZmKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dCb2FyZCA9IChtc2cpID0+IHtcclxuICAgICAgICBpZiAobXNnLmdhbWVJZCAhPT0gdGhpcy5tb2RlbFtcImdhbWVJZFwiXSkgcmV0dXJuO1xyXG4gICAgICAgIC8vIEdhbWUgYWJvcnRlZC5cclxuICAgICAgICBpZiAobXNnW1wic3RhdHVzXCJdID09PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ290IGJvYXJkIG1zZzpcIiwgbXNnKTtcclxuICAgICAgICB0aGlzLnBseSA9IG1zZy5wbHlcclxuICAgICAgICB0aGlzLmZ1bGxmZW4gPSBtc2cuZmVuO1xyXG4gICAgICAgIHRoaXMuZGVzdHMgPSBtc2cuZGVzdHM7XHJcbiAgICAgICAgY29uc3QgY2xvY2tzID0gbXNnLmNsb2NrcztcclxuXHJcbiAgICAgICAgY29uc3QgcGFydHMgPSBtc2cuZmVuLnNwbGl0KFwiIFwiKTtcclxuICAgICAgICB0aGlzLnR1cm5Db2xvciA9IHBhcnRzWzFdID09PSBcIndcIiA/IFwid2hpdGVcIiA6IFwiYmxhY2tcIjtcclxuXHJcbiAgICAgICAgaWYgKG1zZy5zdGVwcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RlcHMgPSBbXTtcclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb3ZlbGlzdCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2RpdiNtb3ZlbGlzdCcpKTtcclxuXHJcbiAgICAgICAgICAgIG1zZy5zdGVwcy5mb3JFYWNoKChzdGVwKSA9PiB7IFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGVwcy5wdXNoKHN0ZXApO1xyXG4gICAgICAgICAgICAgICAgdXBkYXRlTW92ZWxpc3QodGhpcyk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAobXNnLnBseSA9PT0gdGhpcy5zdGVwcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHN0ZXAgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgJ2Zlbic6IG1zZy5mZW4sXHJcbiAgICAgICAgICAgICAgICAgICAgJ21vdmUnOiBtc2cubGFzdE1vdmVbMF0gKyBtc2cubGFzdE1vdmVbMV0sXHJcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrJzogbXNnLmNoZWNrLFxyXG4gICAgICAgICAgICAgICAgICAgICd0dXJuQ29sb3InOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgICAgICAgICAnc2FuJzogbXNnLnN0ZXBzWzBdLnNhbixcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGVwcy5wdXNoKHN0ZXApO1xyXG4gICAgICAgICAgICAgICAgdXBkYXRlTW92ZWxpc3QodGhpcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYWJvcnRhYmxlID0gTnVtYmVyKHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdKSA8PSAxO1xyXG4gICAgICAgIGlmICghdGhpcy5zcGVjdGF0b3IgJiYgIXRoaXMuYWJvcnRhYmxlICYmIHRoaXMucmVzdWx0ID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWJvcnQnKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdidXR0b24jYWJvcnQnLCB7IHByb3BzOiB7ZGlzYWJsZWQ6IHRydWV9IH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBsYXN0TW92ZSA9IG1zZy5sYXN0TW92ZTtcclxuICAgICAgICBpZiAobGFzdE1vdmUgIT09IG51bGwgJiYgdGhpcy52YXJpYW50ID09PSBcInNob2dpXCIpIHtcclxuICAgICAgICAgICAgbGFzdE1vdmUgPSB1c2kydWNpKGxhc3RNb3ZlWzBdICsgbGFzdE1vdmVbMV0pO1xyXG4gICAgICAgICAgICBsYXN0TW92ZSA9IFtsYXN0TW92ZS5zbGljZSgwLDIpLCBsYXN0TW92ZS5zbGljZSgyLDQpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gZHJvcCBsYXN0TW92ZSBjYXVzaW5nIHNjcm9sbGJhciBmbGlja2VyLFxyXG4gICAgICAgIC8vIHNvIHdlIHJlbW92ZSBmcm9tIHBhcnQgdG8gYXZvaWQgdGhhdFxyXG4gICAgICAgIGlmIChsYXN0TW92ZSAhPT0gbnVsbCAmJiBsYXN0TW92ZVswXVsxXSA9PT0gJ0AnKSBsYXN0TW92ZSA9IFtsYXN0TW92ZVsxXV07XHJcbiAgICAgICAgLy8gc2F2ZSBjYXB0dXJlIHN0YXRlIGJlZm9yZSB1cGRhdGluZyBjaGVzc2dyb3VuZFxyXG4gICAgICAgIGNvbnN0IGNhcHR1cmUgPSBsYXN0TW92ZSAhPT0gbnVsbCAmJiB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnBpZWNlc1tsYXN0TW92ZVsxXV1cclxuXHJcbiAgICAgICAgaWYgKGxhc3RNb3ZlICE9PSBudWxsICYmICh0aGlzLnR1cm5Db2xvciA9PT0gdGhpcy5teWNvbG9yIHx8IHRoaXMuc3BlY3RhdG9yKSkge1xyXG4gICAgICAgICAgICBpZiAoY2FwdHVyZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQuY2FwdHVyZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbGFzdE1vdmUgPSBbXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jaGVja1N0YXR1cyhtc2cpO1xyXG4gICAgICAgIGlmIChtc2cuY2hlY2spIHtcclxuICAgICAgICAgICAgc291bmQuY2hlY2soKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9wcGNsb2NrID0gIXRoaXMuZmxpcCA/IDAgOiAxO1xyXG4gICAgICAgIGNvbnN0IG15Y2xvY2sgPSAxIC0gb3BwY2xvY2s7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICBmZW46IHBhcnRzWzBdLFxyXG4gICAgICAgICAgICAgICAgdHVybkNvbG9yOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgICAgIGNoZWNrOiBtc2cuY2hlY2ssXHJcbiAgICAgICAgICAgICAgICBsYXN0TW92ZTogbGFzdE1vdmUsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB1cGRhdGVQb2NrZXRzKHRoaXMsIHRoaXMudnBvY2tldDAsIHRoaXMudnBvY2tldDEpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1swXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzWzFdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnNldFRpbWUoY2xvY2tzW3RoaXMub3BwY29sb3JdKTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10uc2V0VGltZShjbG9ja3NbdGhpcy5teWNvbG9yXSk7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5hYm9ydGFibGUgJiYgbXNnLnN0YXR1cyA8IDApIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnR1cm5Db2xvciA9PT0gdGhpcy5teWNvbG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10uc3RhcnQoKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnN0YXJ0KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAodGhpcy50dXJuQ29sb3IgPT09IHRoaXMubXljb2xvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgICAgIGZlbjogcGFydHNbMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgdHVybkNvbG9yOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgICAgICAgICBtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyZWU6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXN0czogbXNnLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgY2hlY2s6IG1zZy5jaGVjayxcclxuICAgICAgICAgICAgICAgICAgICBsYXN0TW92ZTogbGFzdE1vdmUsXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHVwZGF0ZVBvY2tldHModGhpcywgdGhpcy52cG9ja2V0MCwgdGhpcy52cG9ja2V0MSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tvcHBjbG9ja10ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnNldFRpbWUoY2xvY2tzW3RoaXMub3BwY29sb3JdKTtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5hYm9ydGFibGUgJiYgbXNnLnN0YXR1cyA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5zdGFydChjbG9ja3NbdGhpcy5teWNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ01ZIENMT0NLIFNUQVJURUQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwidHJ5aW5nIHRvIHBsYXkgcHJlbW92ZS4uLi5cIik7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wcmVtb3ZlKSB0aGlzLnBlcmZvcm1QcmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wcmVkcm9wKSB0aGlzLnBlcmZvcm1QcmVkcm9wKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICAgICAgdHVybkNvbG9yOiB0aGlzLnR1cm5Db2xvcixcclxuICAgICAgICAgICAgICAgICAgICBwcmVtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc3RzOiBtc2cuZGVzdHMsXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICBjaGVjazogbXNnLmNoZWNrLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5zZXRUaW1lKGNsb2Nrc1t0aGlzLm15Y29sb3JdKTtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5hYm9ydGFibGUgJiYgbXNnLnN0YXR1cyA8IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb2Nrc1tvcHBjbG9ja10uc3RhcnQoY2xvY2tzW3RoaXMub3BwY29sb3JdKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnT1BQIENMT0NLICBTVEFSVEVEJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vcHBJc1JhbmRvbUJPVCAmJiBtc2cucm0gICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcIm1vdmVcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdLCBtb3ZlOiBtc2cucm0sIGNsb2NrczogY2xvY2tzIH0pO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGdvUGx5ID0gKHBseSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHN0ZXAgPSB0aGlzLnN0ZXBzW3BseV07XHJcbiAgICAgICAgLy8gVE9ETzogdXBkYXRlIHBvY2tldHMgISEhXHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICBmZW46IHN0ZXAuZmVuLFxyXG4gICAgICAgICAgICB0dXJuQ29sb3I6IHN0ZXAudHVybkNvbG9yLFxyXG4gICAgICAgICAgICBtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICBmcmVlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIGNvbG9yOiB0aGlzLnNwZWN0YXRvciA/IHVuZGVmaW5lZCA6IHN0ZXAudHVybkNvbG9yLFxyXG4gICAgICAgICAgICAgICAgZGVzdHM6IHRoaXMucmVzdWx0ID09PSBcIlwiICYmIHBseSA9PT0gdGhpcy5zdGVwcy5sZW5ndGggLSAxID8gdGhpcy5kZXN0cyA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGNoZWNrOiBzdGVwLmNoZWNrLFxyXG4gICAgICAgICAgICBsYXN0TW92ZTogc3RlcC5tb3ZlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBbc3RlcC5tb3ZlLnNsaWNlKDAsIDIpLCBzdGVwLm1vdmUuc2xpY2UoMiwgNCldLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFRPRE86IHBsYXkgc291bmQgaWYgcGx5ID09IHRoaXMucGx5ICsgMVxyXG4gICAgICAgIHRoaXMucGx5ID0gcGx5XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkb1NlbmQgPSAobWVzc2FnZSkgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiLS0tPiBkb1NlbmQoKTpcIiwgbWVzc2FnZSk7XHJcbiAgICAgICAgdGhpcy5zb2NrLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2VuZE1vdmUgPSAob3JpZywgZGVzdCwgcHJvbW8pID0+IHtcclxuICAgICAgICAvLyBwYXVzZSgpIHdpbGwgYWRkIGluY3JlbWVudCFcclxuICAgICAgICBjb25zdCBvcHBjbG9jayA9ICF0aGlzLmZsaXAgPyAwIDogMVxyXG4gICAgICAgIGNvbnN0IG15Y2xvY2sgPSAxIC0gb3BwY2xvY2s7XHJcbiAgICAgICAgY29uc3QgbW92ZXRpbWUgPSAodGhpcy5jbG9ja3NbbXljbG9ja10ucnVubmluZykgPyBEYXRlLm5vdygpIC0gdGhpcy5jbG9ja3NbbXljbG9ja10uc3RhcnRUaW1lIDogMDtcclxuICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5wYXVzZSh0cnVlKTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcInNlbmRNb3ZlKG9yaWcsIGRlc3QsIHByb20pXCIsIG9yaWcsIGRlc3QsIHByb21vKTtcclxuICAgICAgICBjb25zdCB1Y2lfbW92ZSA9IG9yaWcgKyBkZXN0ICsgcHJvbW87XHJcbiAgICAgICAgY29uc3QgbW92ZSA9IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gdWNpMnVzaSh1Y2lfbW92ZSkgOiB1Y2lfbW92ZTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcInNlbmRNb3ZlKG1vdmUpXCIsIG1vdmUpO1xyXG4gICAgICAgIC8vIFRPRE86IGlmIHByZW1vdmVkLCBzZW5kIDAgdGltZVxyXG4gICAgICAgIGxldCBiY2xvY2ssIGNsb2NrcztcclxuICAgICAgICBpZiAoIXRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICBiY2xvY2sgPSB0aGlzLm15Y29sb3IgPT09IFwiYmxhY2tcIiA/IDEgOiAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJjbG9jayA9IHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiID8gMCA6IDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHdjbG9jayA9IDEgLSBiY2xvY2tcclxuICAgICAgICBjbG9ja3MgPSB7bW92ZXRpbWU6IG1vdmV0aW1lLCBibGFjazogdGhpcy5jbG9ja3NbYmNsb2NrXS5kdXJhdGlvbiwgd2hpdGU6IHRoaXMuY2xvY2tzW3djbG9ja10uZHVyYXRpb259O1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJtb3ZlXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSwgbW92ZTogbW92ZSwgY2xvY2tzOiBjbG9ja3MgfSk7XHJcbiAgICAgICAgaWYgKCF0aGlzLmFib3J0YWJsZSkgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnN0YXJ0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdmUgPSAoKSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIChvcmlnLCBkZXN0LCBjYXB0dXJlZFBpZWNlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uTW92ZSgpXCIsIG9yaWcsIGRlc3QsIGNhcHR1cmVkUGllY2UpO1xyXG4gICAgICAgICAgICBpZiAoY2FwdHVyZWRQaWVjZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQuY2FwdHVyZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Ecm9wID0gKCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAocGllY2UsIGRlc3QpID0+IHtcclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJncm91bmQub25Ecm9wKClcIiwgcGllY2UsIGRlc3QpO1xyXG4gICAgICAgICAgICBpZiAoZGVzdCAhPSBcImEwXCIgJiYgcGllY2Uucm9sZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0UHJlbW92ZSA9IChvcmlnLCBkZXN0LCBtZXRhKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0geyBvcmlnLCBkZXN0LCBtZXRhIH07XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXRQcmVtb3ZlKCkgdG86XCIsIG9yaWcsIGRlc3QsIG1ldGEpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdW5zZXRQcmVtb3ZlID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRQcmVkcm9wID0gKHJvbGUsIGtleSkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlZHJvcCA9IHsgcm9sZSwga2V5IH07XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXRQcmVkcm9wKCkgdG86XCIsIHJvbGUsIGtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1bnNldFByZWRyb3AgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBlcmZvcm1QcmVtb3ZlID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHsgb3JpZywgZGVzdCwgbWV0YSB9ID0gdGhpcy5wcmVtb3ZlO1xyXG4gICAgICAgIC8vIFRPRE86IHByb21vdGlvbj9cclxuICAgICAgICBjb25zb2xlLmxvZyhcInBlcmZvcm1QcmVtb3ZlKClcIiwgb3JpZywgZGVzdCwgbWV0YSk7XHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5wbGF5UHJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwZXJmb3JtUHJlZHJvcCA9ICgpID0+IHtcclxuICAgICAgICBjb25zdCB7IHJvbGUsIGtleSB9ID0gdGhpcy5wcmVkcm9wO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwicGVyZm9ybVByZWRyb3AoKVwiLCByb2xlLCBrZXkpO1xyXG4gICAgICAgIHRoaXMuY2hlc3Nncm91bmQucGxheVByZWRyb3AoZHJvcCA9PiB7IHJldHVybiBkcm9wSXNWYWxpZCh0aGlzLmRlc3RzLCBkcm9wLnJvbGUsIGRyb3Aua2V5KTsgfSk7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVXNlck1vdmUgPSAob3JpZywgZGVzdCwgbWV0YSkgPT4ge1xyXG4gICAgICAgIC8vIGNoZXNzZ3JvdW5kIGRvZXNuJ3Qga25vd3MgYWJvdXQgZXAsIHNvIHdlIGhhdmUgdG8gcmVtb3ZlIGVwIGNhcHR1cmVkIHBhd25cclxuICAgICAgICBjb25zdCBwaWVjZXMgPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnBpZWNlcztcclxuICAgICAgICBjb25zdCBnZW9tID0gdGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5nZW9tZXRyeTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImdyb3VuZC5vblVzZXJNb3ZlKClcIiwgb3JpZywgZGVzdCwgbWV0YSwgcGllY2VzKTtcclxuICAgICAgICBjb25zdCBtb3ZlZCA9IHBpZWNlc1tkZXN0XSBhcyBQaWVjZTtcclxuICAgICAgICBjb25zdCBmaXJzdFJhbmtJczAgPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcclxuICAgICAgICBpZiAobWV0YS5jYXB0dXJlZCA9PT0gdW5kZWZpbmVkICYmIG1vdmVkLnJvbGUgPT09IFwicGF3blwiICYmIG9yaWdbMF0gIT0gZGVzdFswXSAmJiBoYXNFcCh0aGlzLnZhcmlhbnQpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcyA9IGtleTJwb3MoZGVzdCwgZmlyc3RSYW5rSXMwKSxcclxuICAgICAgICAgICAgcGF3blBvczogUG9zID0gW3Bvc1swXSwgcG9zWzFdICsgKHRoaXMubXljb2xvciA9PT0gJ3doaXRlJyA/IC0xIDogMSldO1xyXG4gICAgICAgICAgICBjb25zdCBkaWZmOiBQaWVjZXNEaWZmID0ge307XHJcbiAgICAgICAgICAgIGRpZmZbcG9zMmtleShwYXduUG9zLCBnZW9tKV0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0UGllY2VzKGRpZmYpO1xyXG4gICAgICAgICAgICBtZXRhLmNhcHR1cmVkID0ge3JvbGU6IFwicGF3blwifTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vIGluY3JlYXNlIHBvY2tldCBjb3VudFxyXG4gICAgICAgIGlmICgodGhpcy52YXJpYW50ID09PSBcImNyYXp5aG91c2VcIiB8fCB0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikgJiYgbWV0YS5jYXB0dXJlZCkge1xyXG4gICAgICAgICAgICB2YXIgcm9sZSA9IG1ldGEuY2FwdHVyZWQucm9sZVxyXG4gICAgICAgICAgICBpZiAobWV0YS5jYXB0dXJlZC5wcm9tb3RlZCkgcm9sZSA9IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gbWV0YS5jYXB0dXJlZC5yb2xlLnNsaWNlKDEpIGFzIFJvbGUgOiBcInBhd25cIjtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmZsaXApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1swXVtyb2xlXSsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MCA9IHBhdGNoKHRoaXMudnBvY2tldDAsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcInRvcFwiKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBvY2tldHNbMV1bcm9sZV0rKztcclxuICAgICAgICAgICAgICAgIHRoaXMudnBvY2tldDEgPSBwYXRjaCh0aGlzLnZwb2NrZXQxLCBwb2NrZXRWaWV3KHRoaXMsIHRoaXMubXljb2xvciwgXCJib3R0b21cIikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICAvLyBjaGVzc2dyb3VuZCBhdXRvQ2FzdGxlIHdvcmtzIGZvciBzdGFuZGFyZCBjaGVzcyBvbmx5XHJcbiAgICAgICAgaWYgKHRoaXMudmFyaWFudCA9PT0gXCJjYXBhYmxhbmNhXCIgJiYgbW92ZWQucm9sZSA9PT0gXCJraW5nXCIgJiYgb3JpZ1swXSA9PT0gXCJmXCIpIHRoaXMuY2FzdGxlUm9vayhkZXN0WzBdLCB0aGlzLm15Y29sb3IpO1xyXG5cclxuICAgICAgICAvLyAgZ2F0aW5nIGVsZXBoYW50L2hhd2tcclxuICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcInNlaXJhd2FuXCIpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnByb21vdGlvbi5zdGFydChvcmlnLCBkZXN0LCBtZXRhKSAmJiAhdGhpcy5nYXRpbmcuc3RhcnQodGhpcy5mdWxsZmVuLCBvcmlnLCBkZXN0LCBtZXRhKSkgdGhpcy5zZW5kTW92ZShvcmlnLCBkZXN0LCAnJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnByb21vdGlvbi5zdGFydChvcmlnLCBkZXN0LCBtZXRhKSkgdGhpcy5zZW5kTW92ZShvcmlnLCBkZXN0LCAnJyk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVXNlckRyb3AgPSAocm9sZSwgZGVzdCkgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ3JvdW5kLm9uVXNlckRyb3AoKVwiLCByb2xlLCBkZXN0KTtcclxuICAgICAgICAvLyBkZWNyZWFzZSBwb2NrZXQgY291bnRcclxuICAgICAgICBpZiAoZHJvcElzVmFsaWQodGhpcy5kZXN0cywgcm9sZSwgZGVzdCkpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wb2NrZXRzWzBdW3JvbGVdLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQwID0gcGF0Y2godGhpcy52cG9ja2V0MCwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLm15Y29sb3IsIFwidG9wXCIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1sxXVtyb2xlXS0tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MSA9IHBhdGNoKHRoaXMudnBvY2tldDEsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcImJvdHRvbVwiKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5zZW5kTW92ZShyb2xlVG9TYW5bcm9sZV0gKyBcIkBcIiwgZGVzdCwgJycpXHJcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwic2VudCBtb3ZlXCIsIG1vdmUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpZmY6IFBpZWNlc0RpZmYgPSB7fTtcclxuICAgICAgICAgICAgZGlmZltkZXN0XSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXRQaWVjZXMoZGlmZik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiISEhIGludmFsaWQgbW92ZSAhISFcIiwgcm9sZSwgZGVzdCk7XHJcbiAgICAgICAgICAgIC8vIHJlc3RvcmUgbGFzdE1vdmUgc2V0IGJ5IGludmFsaWQgZHJvcFxyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICBsYXN0TW92ZTogdGhpcy5sYXN0bW92ZSxcclxuICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGRlc3RzOiB0aGlzLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIC8vIE9yIGltcGxlbWVudCBvbmRibGNsaWNrIGhhbmRsZXIgdG8gZW1pdCBtb3ZlIGluIGNoZXNzZ3JvdW5kP1xyXG4gICAgLy8gaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9qc3JlZi9ldmVudF9vbmRibGNsaWNrLmFzcFxyXG4gICAgcHJpdmF0ZSBvbkNoYW5nZSA9IChzZWxlY3RlZCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uQ2hhbmdlKClcIiwgc2VsZWN0ZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIHByaXZhdGUgb25TZWxlY3QgPSAoc2VsZWN0ZWQpID0+IHtcclxuICAgICAgICByZXR1cm4gKGtleSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIiAgIGdyb3VuZC5vblNlbGVjdCgpXCIsIGtleSwgc2VsZWN0ZWQpO1xyXG4gICAgICAgICAgICAvLyBJZiBkcm9wIHNlbGVjdGlvbiB3YXMgc2V0IGRyb3BEZXN0cyB3ZSBoYXZlIHRvIHJlc3RvcmUgZGVzdHMgaGVyZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5tb3ZhYmxlLmRlc3RzISA9PT0gdW5kZWZpbmVkKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChrZXkgIT0gXCJhMFwiICYmIFwiYTBcIiBpbiB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLm1vdmFibGUuZGVzdHMhKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7IG1vdmFibGU6IHsgZGVzdHM6IHRoaXMuZGVzdHMgfX0pO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImlzX3VzZXJfb25saW5lXCIsIHVzZXJuYW1lOiB0aGlzLndwbGF5ZXIgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJpc191c2VyX29ubGluZVwiLCB1c2VybmFtZTogdGhpcy5icGxheWVyIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gd2Ugd2FudCB0byBrbm93IGxhc3RNb3ZlIGFuZCBjaGVjayBzdGF0dXNcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImJvYXJkXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zdCBvcHBfbmFtZSA9IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSA9PT0gdGhpcy53cGxheWVyID8gdGhpcy5icGxheWVyIDogdGhpcy53cGxheWVyO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiaXNfdXNlcl9vbmxpbmVcIiwgdXNlcm5hbWU6IG9wcF9uYW1lIH0pO1xyXG5cclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdib3R0b20tcGxheWVyJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaS1zaWRlLm9ubGluZSNib3R0b20tcGxheWVyJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1vbmxpbmVcIjogdHJ1ZSwgXCJpY29uLW9mZmxpbmVcIjogZmFsc2V9fSkpO1xyXG5cclxuICAgICAgICAgICAgLy8gcHJldmVudCBzZW5kaW5nIGdhbWVTdGFydCBtZXNzYWdlIHdoZW4gdXNlciBqdXN0IHJlY29uZWN0aW5nXHJcbiAgICAgICAgICAgIGlmIChtc2cucGx5ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwicmVhZHlcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJib2FyZFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyT25saW5lID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy51c2VybmFtZSA9PT0gdGhpcy5wbGF5ZXJzWzBdKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9wLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IHRydWUsIFwiaWNvbi1vZmZsaW5lXCI6IGZhbHNlfX0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiB0cnVlLCBcImljb24tb2ZmbGluZVwiOiBmYWxzZX19KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dVc2VyRGlzY29ubmVjdGVkID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy51c2VybmFtZSA9PT0gdGhpcy5wbGF5ZXJzWzBdKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9wLXBsYXllcicpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2ktc2lkZS5vbmxpbmUjdG9wLXBsYXllcicsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tb25saW5lXCI6IGZhbHNlLCBcImljb24tb2ZmbGluZVwiOiB0cnVlfX0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvdHRvbS1wbGF5ZXInKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdpLXNpZGUub25saW5lI2JvdHRvbS1wbGF5ZXInLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLW9ubGluZVwiOiBmYWxzZSwgXCJpY29uLW9mZmxpbmVcIjogdHJ1ZX19KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dDaGF0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKG1zZy51c2VyLCBtc2cubWVzc2FnZSwgXCJyb3VuZGNoYXRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ09mZmVyID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGNoYXRNZXNzYWdlKFwiXCIsIG1zZy5tZXNzYWdlLCBcInJvdW5kY2hhdFwiKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBvbk1lc3NhZ2UgPSAoZXZ0KSA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCI8KysrIG9uTWVzc2FnZSgpOlwiLCBldnQuZGF0YSk7XHJcbiAgICAgICAgdmFyIG1zZyA9IEpTT04ucGFyc2UoZXZ0LmRhdGEpO1xyXG4gICAgICAgIHN3aXRjaCAobXNnLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImJvYXJkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQm9hcmQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZ2FtZUVuZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja1N0YXR1cyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnYW1lU3RhcnRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dHYW1lU3RhcnQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiZ2FtZV91c2VyX2Nvbm5lY3RlZFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1VzZXJDb25uZWN0ZWQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwidXNlcl9vbmxpbmVcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dVc2VyT25saW5lKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInVzZXJfZGlzY29ubmVjdGVkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXNlckRpc2Nvbm5lY3RlZChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyb3VuZGNoYXRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dDaGF0KG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImFjY2VwdF9zZWVrXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnQWNjZXB0U2Vlayhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJvZmZlclwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ09mZmVyKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgaCwgaW5pdCB9IGZyb20gXCJzbmFiYmRvbVwiO1xyXG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XHJcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcbmltcG9ydCB0b1ZOb2RlIGZyb20gJ3NuYWJiZG9tL3Rvdm5vZGUnO1xyXG5cclxuaW1wb3J0IHsga2V5MnBvcyB9IGZyb20gJ2NoZXNzZ3JvdW5keC91dGlsJztcclxuXHJcbmltcG9ydCB7IGNhbkdhdGUsIHJvbGVUb1NhbiB9IGZyb20gJy4vY2hlc3MnO1xyXG5pbXBvcnQgeyBwb2NrZXRWaWV3IH0gZnJvbSAnLi9wb2NrZXQnO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgbGlzdGVuZXJzXSk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihjdHJsKSB7XHJcblxyXG4gICAgbGV0IGdhdGluZzogYW55ID0gZmFsc2U7XHJcbiAgICB2YXIgcm9sZXMgPSBbXCJoYXdrXCIsIFwiZWxlcGhhbnRcIiwgXCJcIl07XHJcblxyXG4gICAgZnVuY3Rpb24gc3RhcnQoZmVuLCBvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kID0gY3RybC5nZXRHcm91bmQoKTtcclxuICAgICAgICBjb25zdCBnYXRhYmxlID0gY2FuR2F0ZShmZW4sIGdyb3VuZC5zdGF0ZS5waWVjZXNbZGVzdF0sIG9yaWcsIGRlc3QsIG1ldGEpXHJcbiAgICAgICAgaWYgKGdhdGFibGVbMF0gfHwgZ2F0YWJsZVsxXSkge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IGN0cmwubXljb2xvcjtcclxuICAgICAgICAgICAgY29uc3Qgb3JpZW50YXRpb24gPSBncm91bmQuc3RhdGUub3JpZW50YXRpb247XHJcbiAgICAgICAgICAgIGlmIChyb2xlcy5pbmNsdWRlcyhcImhhd2tcIikgJiYgIWdhdGFibGVbMF0pIHJvbGVzLnNwbGljZShyb2xlcy5pbmRleE9mKFwiaGF3a1wiKSwgMSk7XHJcbiAgICAgICAgICAgIGlmIChyb2xlcy5pbmNsdWRlcyhcImVsZXBoYW50XCIpICYmICFnYXRhYmxlWzFdKSByb2xlcy5zcGxpY2Uocm9sZXMuaW5kZXhPZihcImVsZXBoYW50XCIpLCAxKTtcclxuICAgICAgICAgICAgdmFyIG9yaWdzID0gW29yaWddO1xyXG4gICAgICAgICAgICBjb25zdCBjYXN0bGluZyA9IGdyb3VuZC5zdGF0ZS5waWVjZXNbZGVzdF0ucm9sZSA9PT0gXCJraW5nXCIgJiYgb3JpZ1swXSA9PT0gXCJlXCIgJiYgZGVzdFswXSAhPT0gXCJkXCIgJiYgZGVzdFswXSAhPT0gXCJlXCIgJiYgZGVzdFswXSAhPT0gXCJmXCI7XHJcbiAgICAgICAgICAgIHZhciByb29rRGVzdCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGlmIChjYXN0bGluZykge1xyXG4gICAgICAgICAgICAgICAgLy8gTy1PXHJcbiAgICAgICAgICAgICAgICBpZiAoZGVzdFswXSA+IFwiZVwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgb3JpZ3MucHVzaChcImhcIiArIG9yaWdbMV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJvb2tEZXN0ID0gIFwiZVwiICsgb3JpZ1sxXTtcclxuICAgICAgICAgICAgICAgIC8vIE8tTy1PXHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG9yaWdzLnB1c2goXCJhXCIgKyBvcmlnWzFdKTtcclxuICAgICAgICAgICAgICAgICAgICByb29rRGVzdCA9ICBcImVcIiArIG9yaWdbMV07XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBkcmF3X2dhdGluZyhvcmlncywgY29sb3IsIG9yaWVudGF0aW9uKTtcclxuICAgICAgICAgICAgZ2F0aW5nID0ge1xyXG4gICAgICAgICAgICAgICAgb3JpZ3M6IG9yaWdzLFxyXG4gICAgICAgICAgICAgICAgZGVzdDogZGVzdCxcclxuICAgICAgICAgICAgICAgIHJvb2tEZXN0OiByb29rRGVzdCxcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBnYXRlKGN0cmwsIG9yaWcsIGRlc3QsIHJvbGUpIHtcclxuICAgICAgICBjb25zdCBnID0gY3RybC5nZXRHcm91bmQoKTtcclxuICAgICAgICBjb25zdCBjb2xvciA9IGcuc3RhdGUucGllY2VzW2Rlc3RdLmNvbG9yO1xyXG4gICAgICAgIGcubmV3UGllY2Uoe1wicm9sZVwiOiByb2xlLCBcImNvbG9yXCI6IGNvbG9yfSwgb3JpZylcclxuICAgICAgICBjdHJsLnBvY2tldHNbY29sb3IgPT09ICd3aGl0ZScgPyAwIDogMV1bcm9sZV0tLTtcclxuICAgICAgICBjdHJsLnZwb2NrZXQxID0gcGF0Y2goY3RybC52cG9ja2V0MSwgcG9ja2V0VmlldyhjdHJsLCBjb2xvciwgXCJib3R0b21cIikpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRyYXdfZ2F0aW5nKG9yaWdzLCBjb2xvciwgb3JpZW50YXRpb24pIHtcclxuICAgICAgICB2YXIgY29udGFpbmVyID0gdG9WTm9kZShkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdleHRlbnNpb24nKSBhcyBOb2RlKTtcclxuICAgICAgICBwYXRjaChjb250YWluZXIsIHJlbmRlckdhdGluZyhvcmlncywgY29sb3IsIG9yaWVudGF0aW9uKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZHJhd19ub19nYXRpbmcoKSB7XHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb25fY2hvaWNlJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdleHRlbnNpb24nKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmluaXNoKHJvbGUsIGluZGV4KSB7XHJcbiAgICAgICAgaWYgKGdhdGluZykge1xyXG4gICAgICAgICAgICBkcmF3X25vX2dhdGluZygpO1xyXG4gICAgICAgICAgICBpZiAocm9sZSkgZ2F0ZShjdHJsLCBnYXRpbmcub3JpZ3NbaW5kZXhdLCBnYXRpbmcuZGVzdCwgcm9sZSk7XHJcbiAgICAgICAgICAgIGVsc2UgaW5kZXggPSAwO1xyXG4gICAgICAgICAgICBjb25zdCBnYXRlZCA9IHJvbGUgPyByb2xlVG9TYW5bcm9sZV0udG9Mb3dlckNhc2UoKSA6IFwiXCI7XHJcbiAgICAgICAgICAgIGlmIChnYXRpbmcuY2FsbGJhY2spIGdhdGluZy5jYWxsYmFjayhnYXRpbmcub3JpZ3NbaW5kZXhdLCBpbmRleCA9PT0gMCA/IGdhdGluZy5kZXN0IDogZ2F0aW5nLnJvb2tEZXN0LCBnYXRlZCk7XHJcbiAgICAgICAgICAgIGdhdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsKCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGJpbmQoZXZlbnROYW1lOiBzdHJpbmcsIGY6IChlOiBFdmVudCkgPT4gdm9pZCwgcmVkcmF3KSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaW5zZXJ0KHZub2RlKSB7XHJcbiAgICAgICAgICAgICAgICB2bm9kZS5lbG0uYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGYoZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlZHJhdykgcmVkcmF3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJTcXVhcmVzKG9yaWcsIGNvbG9yLCBvcmllbnRhdGlvbiwgaW5kZXgpIHtcclxuICAgICAgICBjb25zdCBmaXJzdFJhbmtJczAgPSBmYWxzZTtcclxuICAgICAgICB2YXIgbGVmdCA9ICg4IC0ga2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApWzBdKSAqIDEyLjU7XHJcbiAgICAgICAgaWYgKG9yaWVudGF0aW9uID09PSBcIndoaXRlXCIpIGxlZnQgPSA4Ny41IC0gbGVmdDtcclxuICAgICAgICByZXR1cm4gcm9sZXMubWFwKChzZXJ2ZXJSb2xlLCBpKSA9PiB7XHJcbiAgICAgICAgICAgIHZhciB0b3AgPSAoY29sb3IgPT09IG9yaWVudGF0aW9uID8gNyAtIGkgOiBpKSAqIDEyLjU7XHJcbiAgICAgICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICAgICAgXCJzcXVhcmVcIixcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBhdHRyczogeyBzdHlsZTogXCJ0b3A6IFwiICsgdG9wICsgXCIlO2xlZnQ6IFwiICsgbGVmdCArIFwiJVwiIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgaG9vazogYmluZChcImNsaWNrXCIsIGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaW5pc2goc2VydmVyUm9sZSwgaW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sIGZhbHNlKVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIFtoKFwicGllY2UuXCIgKyBzZXJ2ZXJSb2xlICsgXCIuXCIgKyBjb2xvcildXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSlcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJHYXRpbmcob3JpZ3MsIGNvbG9yLCBvcmllbnRhdGlvbikge1xyXG4gICAgICAgIHZhciB2ZXJ0aWNhbCA9IGNvbG9yID09PSBvcmllbnRhdGlvbiA/IFwidG9wXCIgOiBcImJvdHRvbVwiO1xyXG4gICAgICAgIHZhciBzcXVhcmVzID0gcmVuZGVyU3F1YXJlcyhvcmlnc1swXSwgY29sb3IsIG9yaWVudGF0aW9uLCAwKTtcclxuICAgICAgICBpZiAob3JpZ3MubGVuZ3RoID4gMSkgc3F1YXJlcyA9IHNxdWFyZXMuY29uY2F0KHJlbmRlclNxdWFyZXMob3JpZ3NbMV0sIGNvbG9yLCBvcmllbnRhdGlvbiwgMSkpO1xyXG4gICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICBcImRpdiNleHRlbnNpb25fY2hvaWNlLlwiICsgdmVydGljYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGhvb2s6IHtcclxuICAgICAgICAgICAgICAgICAgICBpbnNlcnQ6IHZub2RlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWwgPSB2bm9kZS5lbG0gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjYW5jZWwoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBzcXVhcmVzXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXJ0LFxyXG4gICAgfTtcclxufVxyXG4iLCJpbXBvcnQgU29ja2V0dGUgZnJvbSAnc29ja2V0dGUnO1xyXG5cclxuaW1wb3J0IHsgaW5pdCB9IGZyb20gJ3NuYWJiZG9tJztcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuaW1wb3J0IGggZnJvbSAnc25hYmJkb20vaCc7XHJcbmltcG9ydCB7IFZOb2RlIH0gZnJvbSAnc25hYmJkb20vdm5vZGUnO1xyXG5cclxuaW1wb3J0IHsgcmVuZGVyVXNlcm5hbWUgfSBmcm9tICcuL3VzZXInO1xyXG5pbXBvcnQgeyBjaGF0TWVzc2FnZSwgY2hhdFZpZXcgfSBmcm9tICcuL2NoYXQnO1xyXG5pbXBvcnQgeyB2YXJpYW50cyB9IGZyb20gJy4vY2hlc3MnO1xyXG5pbXBvcnQgQUNDRVBUIGZyb20gJy4vc2l0ZSc7XHJcblxyXG5leHBvcnQgY29uc3QgQUREID0gU3ltYm9sKCdBZGQnKTtcclxuZXhwb3J0IGNvbnN0IERFTEVURSA9IFN5bWJvbCgnRGVsZXRlJyk7XHJcbmV4cG9ydCBjb25zdCBVUERBVEUgPSBTeW1ib2woJ1VwZGF0ZScpO1xyXG5leHBvcnQgY29uc3QgUkVTRVQgPSBTeW1ib2woJ1Jlc2V0Jyk7XHJcblxyXG5cclxuY2xhc3MgTG9iYnlDb250cm9sbGVyIHtcclxuICAgIG1vZGVsO1xyXG4gICAgc29jaztcclxuICAgIGV2dEhhbmRsZXI7XHJcbiAgICBwbGF5ZXI7XHJcbiAgICBsb2dnZWRfaW47XHJcbiAgICBjaGFsbGVuZ2VBSTtcclxuICAgIF93cztcclxuICAgIHNlZWtzO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGVsLCBtb2RlbCwgaGFuZGxlcikge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiTG9iYnlDb250cm9sbGVyIGNvbnN0cnVjdG9yXCIsIGVsLCBtb2RlbCk7XHJcblxyXG4gICAgICAgIHRoaXMubW9kZWwgPSBtb2RlbDtcclxuICAgICAgICB0aGlzLmV2dEhhbmRsZXIgPSBoYW5kbGVyO1xyXG4gICAgICAgIHRoaXMuY2hhbGxlbmdlQUkgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3Qgb25PcGVuID0gKGV2dCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl93cyA9IGV2dC50YXJnZXQ7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiLS0tQ09OTkVDVEVEXCIsIGV2dCk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJsb2JieV91c2VyX2Nvbm5lY3RlZFwiLCB1c2VybmFtZTogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJnZXRfc2Vla3NcIiB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX3dzID0ge1wicmVhZHlTdGF0ZVwiOiAtMX07XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWF4QXR0ZW1wdHM6IDIwLFxyXG4gICAgICAgICAgICBvbm9wZW46IGUgPT4gb25PcGVuKGUpLFxyXG4gICAgICAgICAgICBvbm1lc3NhZ2U6IGUgPT4gdGhpcy5vbk1lc3NhZ2UoZSksXHJcbiAgICAgICAgICAgIG9ucmVjb25uZWN0OiBlID0+IGNvbnNvbGUubG9nKCdSZWNvbm5lY3RpbmcgaW4gbG9iYnkuLi4nLCBlKSxcclxuICAgICAgICAgICAgb25tYXhpbXVtOiBlID0+IGNvbnNvbGUubG9nKCdTdG9wIEF0dGVtcHRpbmchJywgZSksXHJcbiAgICAgICAgICAgIG9uY2xvc2U6IGUgPT4ge2NvbnNvbGUubG9nKCdDbG9zZWQhJywgZSk7fSxcclxuICAgICAgICAgICAgb25lcnJvcjogZSA9PiBjb25zb2xlLmxvZygnRXJyb3I6JywgZSksXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdGhpcy5zb2NrID0gbmV3IFNvY2tldHRlKFwid3M6Ly9cIiArIGxvY2F0aW9uLmhvc3QgKyBcIi93c1wiLCBvcHRzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2goZXJyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBTb2NrZXR0ZShcIndzczovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzXCIsIG9wdHMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gZ2V0IHNlZWtzIHdoZW4gd2UgYXJlIGNvbWluZyBiYWNrIGFmdGVyIGEgZ2FtZVxyXG4gICAgICAgIGlmICh0aGlzLl93cy5yZWFkeVN0YXRlID09PSAxKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJnZXRfc2Vla3NcIiB9KTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIHBhdGNoKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZWVrYnV0dG9ucycpIGFzIEhUTUxFbGVtZW50LCBoKCd1bCNzZWVrYnV0dG9ucycsIHRoaXMucmVuZGVyU2Vla0J1dHRvbnMoKSkpO1xyXG4gICAgICAgIHBhdGNoKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieWNoYXQnKSBhcyBIVE1MRWxlbWVudCwgY2hhdFZpZXcodGhpcywgXCJsb2JieWNoYXRcIikpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBkb1NlbmQgKG1lc3NhZ2UpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIi0tLT4gbG9iYnkgZG9TZW5kKCk6XCIsIG1lc3NhZ2UpO1xyXG4gICAgICAgIHRoaXMuc29jay5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcclxuICAgIH1cclxuXHJcbiAgICBjcmVhdGVTZWVrTXNnICh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQpIHtcclxuICAgICAgICB0aGlzLmRvU2VuZCh7XHJcbiAgICAgICAgICAgIHR5cGU6IFwiY3JlYXRlX3NlZWtcIixcclxuICAgICAgICAgICAgdXNlcjogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdLFxyXG4gICAgICAgICAgICB2YXJpYW50OiB2YXJpYW50LFxyXG4gICAgICAgICAgICBmZW46IGZlbixcclxuICAgICAgICAgICAgbWludXRlczogbWludXRlcyxcclxuICAgICAgICAgICAgaW5jcmVtZW50OiBpbmNyZW1lbnQsXHJcbiAgICAgICAgICAgIHJhdGVkOiBmYWxzZSxcclxuICAgICAgICAgICAgY29sb3I6IGNvbG9yIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNyZWF0ZUJvdENoYWxsZW5nZU1zZyAodmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50LCBsZXZlbCkge1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHtcclxuICAgICAgICAgICAgdHlwZTogXCJjcmVhdGVfYWlfY2hhbGxlbmdlXCIsXHJcbiAgICAgICAgICAgIHVzZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSxcclxuICAgICAgICAgICAgdmFyaWFudDogdmFyaWFudCxcclxuICAgICAgICAgICAgZmVuOiBmZW4sXHJcbiAgICAgICAgICAgIG1pbnV0ZXM6IG1pbnV0ZXMsXHJcbiAgICAgICAgICAgIGluY3JlbWVudDogaW5jcmVtZW50LFxyXG4gICAgICAgICAgICByYXRlZDogZmFsc2UsXHJcbiAgICAgICAgICAgIGxldmVsOiBsZXZlbCxcclxuICAgICAgICAgICAgY29sb3I6IGNvbG9yIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGlzTmV3U2VlayAodmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50KSB7XHJcbiAgICAgICAgcmV0dXJuICF0aGlzLnNlZWtzLnNvbWUoc2VlayA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBzZWVrLnZhcmlhbnQgPT09IHZhcmlhbnQgJiYgc2Vlay5mZW4gPT09IGZlbiAmJiBzZWVrLmNvbG9yID09PSBjb2xvciAmJiBzZWVrLnRjID09PSBtaW51dGVzICsgXCIrXCIgKyBpbmNyZW1lbnQ7XHJcbiAgICAgICAgfSlcclxuICAgIH1cclxuXHJcbiAgICBjcmVhdGVTZWVrIChjb2xvcikge1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhLnN0eWxlLmRpc3BsYXk9J25vbmUnO1xyXG4gICAgICAgIGxldCBlO1xyXG4gICAgICAgIGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmFyaWFudCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xyXG4gICAgICAgIGNvbnN0IHZhcmlhbnQgPSBlLm9wdGlvbnNbZS5zZWxlY3RlZEluZGV4XS52YWx1ZTtcclxuXHJcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmZW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGNvbnN0IGZlbiA9IGUudmFsdWU7XHJcblxyXG4gICAgICAgIGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWluJykgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBjb25zdCBtaW51dGVzID0gcGFyc2VJbnQoZS52YWx1ZSk7XHJcblxyXG4gICAgICAgIGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5jJykgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBjb25zdCBpbmNyZW1lbnQgPSBwYXJzZUludChlLnZhbHVlKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY2hhbGxlbmdlQUkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaWxldmVsJykgYXMgSFRNTEZvcm1FbGVtZW50O1xyXG4gICAgICAgICAgICBjb25zdCBsZXZlbCA9IHBhcnNlSW50KGZvcm0uZWxlbWVudHNbJ2xldmVsJ10udmFsdWUpO1xyXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUJvdENoYWxsZW5nZU1zZyh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQsIGxldmVsKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmlzTmV3U2Vlayh2YXJpYW50LCBjb2xvciwgZmVuLCBtaW51dGVzLCBpbmNyZW1lbnQpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNyZWF0ZVNlZWtNc2codmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJTZWVrQnV0dG9ucyAoKSB7XHJcbiAgICAgICAgLy8gVE9ETzogc2F2ZS9yZXN0b3JlIHNlbGVjdGVkIHZhbHVlc1xyXG4gICAgICAgIGNvbnN0IHNldE1pbnV0ZXMgPSAobWludXRlcykgPT4ge1xyXG4gICAgICAgICAgICB2YXIgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pbnV0ZXNcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gbWludXRlcztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHNldEluY3JlbWVudCA9IChpbmNyZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgdmFyIGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbmNyZW1lbnRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gaW5jcmVtZW50O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICBoKCdkaXYjaWQwMScsIHsgY2xhc3M6IHtcIm1vZGFsXCI6IHRydWV9IH0sIFtcclxuICAgICAgICAgIGgoJ2Zvcm0ubW9kYWwtY29udGVudCcsIFtcclxuICAgICAgICAgICAgaCgnZGl2I2Nsb3NlY29udGFpbmVyJywgW1xyXG4gICAgICAgICAgICAgIGgoJ3NwYW4uY2xvc2UnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWQwMScpIS5zdHlsZS5kaXNwbGF5PSdub25lJyB9LCBhdHRyczogeydkYXRhLWljb24nOiAnaid9LCBwcm9wczoge3RpdGxlOiBcIkNhbmNlbFwifSB9KSxcclxuICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIGgoJ2Rpdi5jb250YWluZXInLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgYXR0cnM6IHtmb3I6IFwidmFyaWFudFwifSB9LCBcIlZhcmlhbnRcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdzZWxlY3QjdmFyaWFudCcsIHsgcHJvcHM6IHtuYW1lOiBcInZhcmlhbnRcIn0gfSwgdmFyaWFudHMubWFwKCh2YXJpYW50KSA9PiBoKCdvcHRpb24nLCB7IHByb3BzOiB7dmFsdWU6IHZhcmlhbnR9IH0sIHZhcmlhbnQpKSksXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgYXR0cnM6IHtmb3I6IFwiZmVuXCJ9IH0sIFwiU3RhcnQgcG9zaXRpb25cIiksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNmZW4nLCB7IHByb3BzOiB7bmFtZTogJ2ZlbicsIHBsYWNlaG9sZGVyOiAnUGFzdGUgdGhlIEZFTiB0ZXh0IGhlcmUnfSB9KSxcclxuICAgICAgICAgICAgICAgIC8vaCgnbGFiZWwnLCB7IGF0dHJzOiB7Zm9yOiBcInRjXCJ9IH0sIFwiVGltZSBDb250cm9sXCIpLFxyXG4gICAgICAgICAgICAgICAgLy9oKCdzZWxlY3QjdGltZWNvbnRyb2wnLCB7IHByb3BzOiB7bmFtZTogXCJ0aW1lY29udHJvbFwifSB9LCBbXHJcbiAgICAgICAgICAgICAgICAvLyAgICBoKCdvcHRpb24nLCB7IHByb3BzOiB7dmFsdWU6IFwiMVwiLCBzZWxlY3RlZDogdHJ1ZX0gfSwgXCJSZWFsIHRpbWVcIiksXHJcbiAgICAgICAgICAgICAgICAvLyAgICBoKCdvcHRpb24nLCB7IHByb3BzOiB7dmFsdWU6IFwiMlwifSB9LCBcIlVubGltaXRlZFwiKSxcclxuICAgICAgICAgICAgICAgIC8vXSksXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgYXR0cnM6IHtmb3I6IFwibWluXCJ9IH0sIFwiTWludXRlcyBwZXIgc2lkZTpcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdzcGFuI21pbnV0ZXMnKSxcclxuICAgICAgICAgICAgICAgIGgoJ2lucHV0I21pbicsIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9wczoge25hbWU6IFwibWluXCIsIHR5cGU6IFwicmFuZ2VcIiwgbWluOiAwLCBtYXg6IDE4MCwgdmFsdWU6IDN9LFxyXG4gICAgICAgICAgICAgICAgICAgIG9uOiB7IGlucHV0OiAoZSkgPT4gc2V0TWludXRlcygoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgaG9vazoge2luc2VydDogKHZub2RlKSA9PiBzZXRNaW51dGVzKCh2bm9kZS5lbG0gYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpIH0sXHJcbiAgICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICAgIGgoJ2xhYmVsJywgeyBhdHRyczoge2ZvcjogXCJpbmNcIn0gfSwgXCJJbmNyZW1lbnQgaW4gc2Vjb25kczpcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdzcGFuI2luY3JlbWVudCcpLFxyXG4gICAgICAgICAgICAgICAgaCgnaW5wdXQjaW5jJywge1xyXG4gICAgICAgICAgICAgICAgICAgIHByb3BzOiB7bmFtZTogXCJpbmNcIiwgdHlwZTogXCJyYW5nZVwiLCBtaW46IDAsIG1heDogMTgwLCB2YWx1ZTogMn0sXHJcbiAgICAgICAgICAgICAgICAgICAgb246IHsgaW5wdXQ6IChlKSA9PiBzZXRJbmNyZW1lbnQoKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKSB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGhvb2s6IHtpbnNlcnQ6ICh2bm9kZSkgPT4gc2V0SW5jcmVtZW50KCh2bm9kZS5lbG0gYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpIH0sXHJcbiAgICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICAgIC8vIGlmIHBsYXkgd2l0aCB0aGUgbWFjaGluZVxyXG4gICAgICAgICAgICAgICAgLy8gQS5JLkxldmVsICgxLTggYnV0dG9ucylcclxuICAgICAgICAgICAgICAgIGgoJ2Zvcm0jYWlsZXZlbCcsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2g0JywgXCJBLkkuIExldmVsXCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2LnJhZGlvLWdyb3VwJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2lucHV0I2FpMScsIHsgcHJvcHM6IHsgdHlwZTogXCJyYWRpb1wiLCBuYW1lOiBcImxldmVsXCIsIHZhbHVlOiBcIjFcIiwgY2hlY2tlZDogXCJjaGVja2VkXCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpMScsIHsgYXR0cnM6IHtmb3I6IFwiYWkxXCJ9IH0sIFwiMVwiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTInLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCIyXCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpMicsIHsgYXR0cnM6IHtmb3I6IFwiYWkyXCJ9IH0sIFwiMlwiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTMnLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCIzXCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpMycsIHsgYXR0cnM6IHtmb3I6IFwiYWkzXCJ9IH0sIFwiM1wiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTQnLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCI0XCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpNCcsIHsgYXR0cnM6IHtmb3I6IFwiYWk0XCJ9IH0sIFwiNFwiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTUnLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCI1XCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpNScsIHsgYXR0cnM6IHtmb3I6IFwiYWk1XCJ9IH0sIFwiNVwiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTYnLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCI2XCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpNicsIHsgYXR0cnM6IHtmb3I6IFwiYWk2XCJ9IH0sIFwiNlwiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTcnLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCI3XCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpNycsIHsgYXR0cnM6IHtmb3I6IFwiYWk3XCJ9IH0sIFwiN1wiKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdpbnB1dCNhaTgnLCB7IHByb3BzOiB7IHR5cGU6IFwicmFkaW9cIiwgbmFtZTogXCJsZXZlbFwiLCB2YWx1ZTogXCI4XCJ9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2xhYmVsLmxldmVsLWFpLmFpOCcsIHsgYXR0cnM6IHtmb3I6IFwiYWk4XCJ9IH0sIFwiOFwiKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYuYnV0dG9uLWdyb3VwJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5pY29uLmljb24tYmxhY2snLCB7IHByb3BzOiB7dHlwZTogXCJidXR0b25cIiwgdGl0bGU6IFwiQmxhY2tcIn0sIG9uOiB7Y2xpY2s6ICgpID0+IHRoaXMuY3JlYXRlU2VlaygnYicpIH0gfSksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnYnV0dG9uLmljb24uaWNvbi1hZGp1c3QnLCB7IHByb3BzOiB7dHlwZTogXCJidXR0b25cIiwgdGl0bGU6IFwiUmFuZG9tXCJ9LCBvbjoge2NsaWNrOiAoKSA9PiB0aGlzLmNyZWF0ZVNlZWsoJ3InKX0gfSksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnYnV0dG9uLmljb24uaWNvbi13aGl0ZScsIHsgcHJvcHM6IHt0eXBlOiBcImJ1dHRvblwiLCB0aXRsZTogXCJXaGl0ZVwifSwgb246IHtjbGljazogKCkgPT4gdGhpcy5jcmVhdGVTZWVrKCd3Jyl9IH0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgXSksXHJcbiAgICAgICAgXSksXHJcbiAgICAgICAgaCgnYnV0dG9uJywgeyBjbGFzczogeydsb2JieS1idXR0b24nOiB0cnVlfSwgb246IHtcclxuICAgICAgICAgICAgY2xpY2s6ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbGxlbmdlQUkgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhaWxldmVsJykhLnN0eWxlLmRpc3BsYXk9J25vbmUnO1xyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nYmxvY2snO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IH0sIFwiQ3JlYXRlIGEgZ2FtZVwiKSxcclxuICAgICAgICBoKCdidXR0b24nLCB7IGNsYXNzOiB7J2xvYmJ5LWJ1dHRvbic6IHRydWV9LCBvbjoge1xyXG4gICAgICAgICAgICBjbGljazogKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGFsbGVuZ2VBSSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWlsZXZlbCcpIS5zdHlsZS5kaXNwbGF5PSdpbmxpbmUtYmxvY2snO1xyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nYmxvY2snO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IH0sIFwiUGxheSB3aXRoIHRoZSBtYWNoaW5lXCIpLFxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgb25DbGlja1NlZWsoc2Vlaykge1xyXG4gICAgICAgIGlmIChzZWVrW1widXNlclwiXSA9PT0gdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJkZWxldGVfc2Vla1wiLCBzZWVrSUQ6IHNlZWtbXCJzZWVrSURcIl0sIHBsYXllcjogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJhY2NlcHRfc2Vla1wiLCBzZWVrSUQ6IHNlZWtbXCJzZWVrSURcIl0sIHBsYXllcjogdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJTZWVrcyhzZWVrcykge1xyXG4gICAgICAgIC8vIFRPRE86IGZpeCBoZWFkZXIgYW5kIGRhdGEgcm93IGNvbG9tbnNcclxuICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8zNzI3MjMzMS9odG1sLXRhYmxlLXdpdGgtZml4ZWQtaGVhZGVyLWFuZC1mb290ZXItYW5kLXNjcm9sbGFibGUtYm9keS13aXRob3V0LWZpeGVkLXdpZHRoc1xyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGgoJ3RoZWFkJywgW2goJ3RyJywgW2goJ3RoJywgJ1BsYXllcicpLCBoKCd0aCcsICdDb2xvcicpLCBoKCd0aCcsICdSYXRpbmcnKSwgaCgndGgnLCAnVGltZScpLCBoKCd0aCcsICdWYXJpYW50JyksIGgoJ3RoJywgJ01vZGUnKV0pXSk7XHJcbiAgICAgICAgdmFyIHJvd3MgPSBzZWVrcy5tYXAoKHNlZWspID0+IGgoXHJcbiAgICAgICAgICAgICd0cicsXHJcbiAgICAgICAgICAgIHsgb246IHsgY2xpY2s6ICgpID0+IHRoaXMub25DbGlja1NlZWsoc2VlaykgfSB9LFxyXG4gICAgICAgICAgICBbaCgndGQnLCBzZWVrW1widXNlclwiXSksIGgoJ3RkJywgc2Vla1tcImNvbG9yXCJdKSwgaCgndGQnLCAnMTUwMD8nKSwgaCgndGQnLCBzZWVrW1widGNcIl0pLCBoKCd0ZCcsIHNlZWtbXCJ2YXJpYW50XCJdKSwgaCgndGQnLCBzZWVrW1wicmF0ZWRcIl0pIF0pXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIFtoZWFkZXIsIGgoJ3Rib2R5Jywgcm93cyldO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dHZXRTZWVrcyA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLnNlZWtzID0gbXNnLnNlZWtzO1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiISEhISBnb3QgZ2V0X3NlZWtzIG1zZzpcIiwgbXNnKTtcclxuICAgICAgICBjb25zdCBvbGRWTm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZWVrcycpO1xyXG4gICAgICAgIGlmIChvbGRWTm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgb2xkVk5vZGUuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgICAgIHBhdGNoKG9sZFZOb2RlIGFzIEhUTUxFbGVtZW50LCBoKCd0YWJsZSNzZWVrcycsIHRoaXMucmVuZGVyU2Vla3MobXNnLnNlZWtzKSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnQWNjZXB0U2VlayA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdID0gbXNnW1wiZ2FtZUlkXCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJ2YXJpYW50XCJdID0gbXNnW1widmFyaWFudFwiXTtcclxuICAgICAgICB0aGlzLm1vZGVsW1wid3BsYXllclwiXSA9IG1zZ1tcIndwbGF5ZXJcIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcImJwbGF5ZXJcIl0gPSBtc2dbXCJicGxheWVyXCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJmZW5cIl0gPSBtc2dbXCJmZW5cIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcImJhc2VcIl0gPSBtc2dbXCJiYXNlXCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJpbmNcIl0gPSBtc2dbXCJpbmNcIl07XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJMb2JieUNvbnRyb2xsZXIub25Nc2dBY2NlcHRTZWVrKClcIiwgdGhpcy5tb2RlbFtcImdhbWVJZFwiXSlcclxuICAgICAgICB0aGlzLmV2dEhhbmRsZXIoeyB0eXBlOiBBQ0NFUFQgfSk7XHJcbn1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnQ2hhdCA9IChtc2cpID0+IHtcclxuICAgICAgICBjaGF0TWVzc2FnZShtc2cudXNlciwgbXNnLm1lc3NhZ2UsIFwibG9iYnljaGF0XCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dQaW5nID0gKG1zZykgPT4ge1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHt0eXBlOiBcInBvbmdcIiwgdGltZXN0YW1wOiBtc2cudGltZXN0YW1wfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1zZ1NodXRkb3duID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGFsZXJ0KG1zZy5tZXNzYWdlKTtcclxuICAgIH1cclxuXHJcbiAgICBvbk1lc3NhZ2UgKGV2dCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiPCsrKyBsb2JieSBvbk1lc3NhZ2UoKTpcIiwgZXZ0LmRhdGEpO1xyXG4gICAgICAgIHZhciBtc2cgPSBKU09OLnBhcnNlKGV2dC5kYXRhKTtcclxuICAgICAgICBzd2l0Y2ggKG1zZy50eXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnZXRfc2Vla3NcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dHZXRTZWVrcyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJhY2NlcHRfc2Vla1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ0FjY2VwdFNlZWsobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwibG9iYnlfdXNlcl9jb25uZWN0ZWRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dVc2VyQ29ubmVjdGVkKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImxvYmJ5Y2hhdFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ0NoYXQobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicGluZ1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ1BpbmcobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwic2h1dGRvd25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dTaHV0ZG93bihtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBydW5TZWVrcyh2bm9kZTogVk5vZGUsIG1vZGVsLCBoYW5kbGVyKSB7XHJcbiAgICBjb25zdCBlbCA9IHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IGN0cmwgPSBuZXcgTG9iYnlDb250cm9sbGVyKGVsLCBtb2RlbCwgaGFuZGxlcik7XHJcbiAgICBjb25zb2xlLmxvZyhcImxvYmJ5VmlldygpIC0+IHJ1blNlZWtzKClcIiwgZWwsIG1vZGVsLCBjdHJsKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGxvYmJ5Vmlldyhtb2RlbCwgaGFuZGxlcik6IFZOb2RlW10ge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCIuLi4uLi4ubG9iYnlWaWV3KG1vZGVsLCBoYW5kbGVyKVwiLCBtb2RlbCwgaGFuZGxlcik7XHJcbiAgICAvLyBHZXQgdGhlIG1vZGFsXHJcbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhO1xyXG5cclxuICAgIC8vIFdoZW4gdGhlIHVzZXIgY2xpY2tzIGFueXdoZXJlIG91dHNpZGUgb2YgdGhlIG1vZGFsLCBjbG9zZSBpdFxyXG4gICAgd2luZG93Lm9uY2xpY2sgPSBmdW5jdGlvbihldmVudCkge1xyXG4gICAgICAgIGlmIChldmVudC50YXJnZXQgPT0gbW9kYWwpIHtcclxuICAgICAgICAgICAgbW9kYWwuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gW2goJ2FzaWRlLnNpZGViYXItZmlyc3QnLCBbIGgoJ2Rpdi5sb2JieWNoYXQjbG9iYnljaGF0JykgXSksXHJcbiAgICAgICAgICAgIGgoJ21haW4ubWFpbicsIFsgaCgndGFibGUjc2Vla3MnLCB7aG9vazogeyBpbnNlcnQ6ICh2bm9kZSkgPT4gcnVuU2Vla3Modm5vZGUsIG1vZGVsLCBoYW5kbGVyKSB9IH0pIF0pLFxyXG4gICAgICAgICAgICBoKCdhc2lkZS5zaWRlYmFyLXNlY29uZCcsIFsgaCgndWwjc2Vla2J1dHRvbnMnKSBdKSxcclxuICAgICAgICAgICAgaCgndW5kZXItbGVmdCcsIFwiIyBvZiB1c2Vyc1wiKSxcclxuICAgICAgICAgICAgaCgndW5kZXItbG9iYnknKSxcclxuICAgICAgICAgICAgaCgndW5kZXItcmlnaHQnKSxcclxuICAgICAgICBdO1xyXG59XHJcbiIsImltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcbmltcG9ydCBzaXRlIGZyb20gJy4vc2l0ZSc7XHJcblxyXG5mdW5jdGlvbiBtYWluKGluaXRTdGF0ZSwgb2xkVm5vZGUsIHsgdmlldywgdXBkYXRlIH0pIHtcclxuICAgIC8vIGNvbnNvbGUubG9nKGluaXRTdGF0ZSwgb2xkVm5vZGUpO1xyXG4gICAgY29uc3QgbmV3Vm5vZGUgPSB2aWV3KGluaXRTdGF0ZSwgZSA9PiB7XHJcbiAgICAgICAgY29uc3QgbmV3U3RhdGUgPSB1cGRhdGUoaW5pdFN0YXRlLCBlKTtcclxuICAgICAgICBtYWluKG5ld1N0YXRlLCBuZXdWbm9kZSwgeyB2aWV3LCB1cGRhdGUgfSk7XHJcbiAgICB9KTtcclxuICAgIHBhdGNoKG9sZFZub2RlLCBuZXdWbm9kZSk7XHJcbn1cclxuXHJcbm1haW4oXHJcbiAgICBzaXRlLmluaXQoKSxcclxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwbGFjZWhvbGRlcicpLFxyXG4gICAgc2l0ZVxyXG4pO1xyXG4iLCJpbXBvcnQgeyBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxuaW1wb3J0IGggZnJvbSAnc25hYmJkb20vaCc7XG5cbmltcG9ydCB7IHBvY2tldFZpZXcgfSBmcm9tICcuL3BvY2tldCc7XG5pbXBvcnQgeyBuZWVkUG9ja2V0cyB9IGZyb20gJy4vY2hlc3MnO1xuXG5cbmZ1bmN0aW9uIHNlbGVjdE1vdmUgKGN0cmwsIHBseSkge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2xpLm1vdmUuYWN0aXZlJyk7XG4gICAgaWYgKGFjdGl2ZSkgYWN0aXZlLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuICAgIGNvbnN0IGVsUGx5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgbGkubW92ZVtwbHk9XCIke3BseX1cIl1gKTtcbiAgICBpZiAoZWxQbHkpIGVsUGx5LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgIGN0cmwuZ29QbHkocGx5KVxuICAgIHNjcm9sbFRvUGx5KGN0cmwpO1xufVxuXG5mdW5jdGlvbiBzY3JvbGxUb1BseSAoY3RybCkge1xuICAgIGlmIChjdHJsLnN0ZXBzLmxlbmd0aCA8IDkpIHJldHVybjtcbiAgICBjb25zdCBtb3Zlc0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vdmVzJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgbGV0IHN0OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgY29uc3QgcGx5RWwgPSBtb3Zlc0VsLnF1ZXJ5U2VsZWN0b3IoJ2xpLm1vdmUuYWN0aXZlJykgYXMgSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG4gICAgaWYgKGN0cmwucGx5ID09IDApIHN0ID0gMDtcbiAgICBlbHNlIGlmIChjdHJsLnBseSA9PSBjdHJsLnN0ZXBzLmxlbmd0aCAtIDEpIHN0ID0gOTk5OTk7XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChwbHlFbCkgc3QgPSBwbHlFbC5vZmZzZXRUb3AgLSBtb3Zlc0VsLm9mZnNldEhlaWdodCArIHBseUVsLm9mZnNldEhlaWdodDtcbiAgICB9XG4gICAgY29uc29sZS5sb2coXCJzY3JvbGxUb1BseVwiLCBjdHJsLnBseSwgc3QpO1xuICAgIGlmICh0eXBlb2Ygc3QgPT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKHN0ID09IDAgfHwgc3QgPT0gOTk5OTkpIG1vdmVzRWwuc2Nyb2xsVG9wID0gc3Q7XG4gICAgICAgIGVsc2UgaWYgKHBseUVsKSB7XG4gICAgICAgICAgICB2YXIgaXNTbW9vdGhTY3JvbGxTdXBwb3J0ZWQgPSAnc2Nyb2xsQmVoYXZpb3InIGluIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZTtcbiAgICAgICAgICAgIGlmKGlzU21vb3RoU2Nyb2xsU3VwcG9ydGVkKSB7XG4gICAgICAgICAgICAgICAgcGx5RWwuc2Nyb2xsSW50b1ZpZXcoe2JlaGF2aW9yOiBcInNtb290aFwiLCBibG9jazogXCJjZW50ZXJcIn0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwbHlFbC5zY3JvbGxJbnRvVmlldyhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIGZsaXBcbi8vIFRPRE86IHBsYXllcnMsIGNsb2Nrc1xuZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24gKGN0cmwpIHtcbiAgICBjdHJsLmZsaXAgPSAhY3RybC5mbGlwO1xuICAgIGN0cmwuY2hlc3Nncm91bmQudG9nZ2xlT3JpZW50YXRpb24oKTtcbiAgICBpZiAoY3RybC52YXJpYW50ID09PSBcInNob2dpXCIpIHtcbiAgICAgICAgY29uc3QgY29sb3IgPSBjdHJsLmNoZXNzZ3JvdW5kLnN0YXRlLm9yaWVudGF0aW9uID09PSBcIndoaXRlXCIgPyBcIndoaXRlXCIgOiBcImJsYWNrXCI7XG4gICAgICAgIGN0cmwuc2V0UGllY2VDb2xvcnMoY29sb3IpO1xuICAgIH07XG5cbiAgICBjb25zdCBuYW1lX3RtcCA9IGN0cmwucGxheWVyc1swXTtcbiAgICBjdHJsLnBsYXllcnNbMF0gPSBjdHJsLnBsYXllcnNbMV07XG4gICAgY3RybC5wbGF5ZXJzWzFdID0gbmFtZV90bXA7XG5cbiAgICBjb25zb2xlLmxvZyhcIkZMSVBcIik7XG4gICAgaWYgKG5lZWRQb2NrZXRzKGN0cmwudmFyaWFudCkpIHtcbiAgICAgICAgY29uc3QgdG1wID0gY3RybC5wb2NrZXRzWzBdO1xuICAgICAgICBjdHJsLnBvY2tldHNbMF0gPSBjdHJsLnBvY2tldHNbMV07XG4gICAgICAgIGN0cmwucG9ja2V0c1sxXSA9IHRtcDtcbiAgICAgICAgY3RybC52cG9ja2V0MCA9IHBhdGNoKGN0cmwudnBvY2tldDAsIHBvY2tldFZpZXcoY3RybCwgY3RybC5mbGlwID8gY3RybC5teWNvbG9yIDogY3RybC5vcHBjb2xvciwgXCJ0b3BcIikpO1xuICAgICAgICBjdHJsLnZwb2NrZXQxID0gcGF0Y2goY3RybC52cG9ja2V0MSwgcG9ja2V0VmlldyhjdHJsLCBjdHJsLmZsaXAgPyBjdHJsLm9wcGNvbG9yIDogY3RybC5teWNvbG9yLCBcImJvdHRvbVwiKSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbW92ZWxpc3RWaWV3IChjdHJsKSB7XG4gICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb3ZlLWNvbnRyb2xzJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY3RybC5tb3ZlQ29udHJvbHMgPSBwYXRjaChjb250YWluZXIsIGgoJ2Rpdi5idG4tY29udHJvbHMnLCBbXG4gICAgICAgICAgICBoKCdidXR0b24jZmxpcC1ib2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHRvZ2dsZU9yaWVudGF0aW9uKGN0cmwpIH0gfSwgW2goJ2knLCB7cHJvcHM6IHt0aXRsZTogJ0ZsaXAgYm9hcmQnfSwgY2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXJlZnJlc2hcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNmYXN0YmFja3dhcmQnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBzZWxlY3RNb3ZlKGN0cmwsIDApIH0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWZhc3QtYmFja3dhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNzdGVwYmFja3dhcmQnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBzZWxlY3RNb3ZlKGN0cmwsIE1hdGgubWF4KGN0cmwucGx5IC0gMSwgMCkpIH0gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXN0ZXAtYmFja3dhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNzdGVwZm9yd2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHNlbGVjdE1vdmUoY3RybCwgTWF0aC5taW4oY3RybC5wbHkgKyAxLCBjdHJsLnN0ZXBzLmxlbmd0aCAtIDEpKSB9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1zdGVwLWZvcndhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgICAgIGgoJ2J1dHRvbiNmYXN0Zm9yd2FyZCcsIHsgb246IHsgY2xpY2s6ICgpID0+IHNlbGVjdE1vdmUoY3RybCwgY3RybC5zdGVwcy5sZW5ndGggLSAxKSB9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1mYXN0LWZvcndhcmRcIjogdHJ1ZX0gfSApLCBdKSxcbiAgICAgICAgXSlcbiAgICApO1xuICAgIHJldHVybiBoKCdkaXYjbW92ZXMnLCBbaCgnb2wubW92ZWxpc3QjbW92ZWxpc3QnKV0pXG4gICAgfVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTW92ZWxpc3QgKGN0cmwpIHtcbiAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vdmVsaXN0JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY29uc3QgcGx5ID0gY3RybC5zdGVwcy5sZW5ndGggLSAxO1xuICAgIGNvbnN0IG1vdmUgPSBjdHJsLnN0ZXBzW3BseV1bJ3NhbiddO1xuICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2xpLm1vdmUuYWN0aXZlJyk7XG4gICAgaWYgKGFjdGl2ZSkgYWN0aXZlLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuICAgIGNvbnN0IGVsID0gaCgnbGkubW92ZScsIHtjbGFzczoge2FjdGl2ZTogdHJ1ZX0sIGF0dHJzOiB7cGx5OiBwbHl9LCBvbjogeyBjbGljazogKCkgPT4gc2VsZWN0TW92ZShjdHJsLCBwbHkpIH19LCBtb3ZlKTtcbiAgICBpZiAocGx5ICUgMiA9PSAwKSB7XG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnb2wubW92ZWxpc3QjbW92ZWxpc3QnLCBbZWxdKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdvbC5tb3ZlbGlzdCNtb3ZlbGlzdCcsIFtoKCdsaS5tb3ZlLmNvdW50ZXInLCAocGx5ICsgMSkgLyAyKSwgZWxdKSk7XG4gICAgfVxuICAgIHNjcm9sbFRvUGx5KGN0cmwpO1xufSIsImltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmltcG9ydCAqIGFzIGNnIGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XG5pbXBvcnQgeyBkcmFnTmV3UGllY2UgfSBmcm9tICdjaGVzc2dyb3VuZHgvZHJhZyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJ2NoZXNzZ3JvdW5keC90eXBlcyc7XG5cbmltcG9ydCB7IHJvbGVUb1NhbiwgbmVlZFBvY2tldHMsIHBvY2tldFJvbGVzLCBsYyB9IGZyb20gJy4vY2hlc3MnO1xuaW1wb3J0IFJvdW5kQ29udHJvbGxlciBmcm9tICcuL2N0cmwnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxudHlwZSBQb3NpdGlvbiA9ICd0b3AnIHwgJ2JvdHRvbSc7XG5cbmNvbnN0IGV2ZW50TmFtZXMgPSBbJ21vdXNlZG93bicsICd0b3VjaHN0YXJ0J107XG5cbmV4cG9ydCBmdW5jdGlvbiBwb2NrZXRWaWV3KGN0cmw6IFJvdW5kQ29udHJvbGxlciwgY29sb3I6IENvbG9yLCBwb3NpdGlvbjogUG9zaXRpb24pIHtcbiAgY29uc3QgcG9ja2V0ID0gY3RybC5wb2NrZXRzW3Bvc2l0aW9uID09PSAndG9wJyA/IDAgOiAxXTtcbiAgY29uc3QgcGllY2VSb2xlcyA9IE9iamVjdC5rZXlzKHBvY2tldCk7XG4gIHJldHVybiBoKCdkaXYucG9ja2V0LicgKyBwb3NpdGlvbiwge1xuICAgIGNsYXNzOiB7IHVzYWJsZTogdHJ1ZSB9LFxuICAgIGhvb2s6IHtcbiAgICAgIGluc2VydDogdm5vZGUgPT4ge1xuICAgICAgICBldmVudE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgKHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCAoZTogY2cuTW91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKHBvc2l0aW9uID09PSAoY3RybC5mbGlwID8gJ3RvcCcgOiAnYm90dG9tJykpIGRyYWcoY3RybCwgZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9LCBwaWVjZVJvbGVzLm1hcChyb2xlID0+IHtcbiAgICBsZXQgbmIgPSBwb2NrZXRbcm9sZV0gfHwgMDtcbiAgICByZXR1cm4gaCgncGllY2UuJyArIHJvbGUgKyAnLicgKyBjb2xvciwge1xuICAgICAgYXR0cnM6IHtcbiAgICAgICAgJ2RhdGEtcm9sZSc6IHJvbGUsXG4gICAgICAgICdkYXRhLWNvbG9yJzogY29sb3IsXG4gICAgICAgICdkYXRhLW5iJzogbmIsXG4gICAgICB9XG4gICAgfSk7XG4gIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRyYWcoY3RybDogUm91bmRDb250cm9sbGVyLCBlOiBjZy5Nb3VjaEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKGUuYnV0dG9uICE9PSB1bmRlZmluZWQgJiYgZS5idXR0b24gIT09IDApIHJldHVybjsgLy8gb25seSB0b3VjaCBvciBsZWZ0IGNsaWNrXG4gICAgY29uc3QgZWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCxcbiAgICByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJvbGUnKSBhcyBjZy5Sb2xlLFxuICAgIGNvbG9yID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWNvbG9yJykgYXMgY2cuQ29sb3IsXG4gICAgbnVtYmVyID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLW5iJyk7XG4gICAgaWYgKCFyb2xlIHx8ICFjb2xvciB8fCBudW1iZXIgPT09ICcwJykgcmV0dXJuO1xuXG4gICAgLy8gU2hvdyBwb3NzaWJsZSBkcm9wIGRlc3RzIG9uIG15IHR1cm4gb25seSBub3QgdG8gbWVzcyB1cCBwcmVkcm9wXG4gICAgaWYgKGN0cmwudHVybkNvbG9yID09PSBjdHJsLm15Y29sb3IpIHtcbiAgICAgICAgY29uc3QgZHJvcERlc3RzID0geyBcImEwXCI6IGN0cmwuZGVzdHNbcm9sZVRvU2FuW3JvbGVdICsgXCJAXCJdIH07XG4gICAgICAgIGN0cmwuY2hlc3Nncm91bmQubmV3UGllY2Uoe1wicm9sZVwiOiBcInBhd25cIiwgXCJjb2xvclwiOiBjb2xvcn0sIFwiYTBcIilcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5zZXQoe1xuICAgICAgICAgICAgdHVybkNvbG9yOiBjb2xvcixcbiAgICAgICAgICAgIG1vdmFibGU6IHtcbiAgICAgICAgICAgICAgICBkZXN0czogZHJvcERlc3RzLFxuICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBjdHJsLmNoZXNzZ3JvdW5kLnNlbGVjdFNxdWFyZShcImEwXCIpO1xuICAgICAgICBjdHJsLmNoZXNzZ3JvdW5kLnNldCh7IGxhc3RNb3ZlOiBjdHJsLmxhc3Rtb3ZlIH0pO1xuICAgIH1cbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBkcmFnTmV3UGllY2UoY3RybC5jaGVzc2dyb3VuZC5zdGF0ZSwgeyBjb2xvciwgcm9sZSB9LCBlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRyb3BJc1ZhbGlkKGRlc3RzOiBjZy5EZXN0cywgcm9sZTogY2cuUm9sZSwga2V5OiBjZy5LZXkpOiBib29sZWFuIHtcbiAgICAvLyBjb25zb2xlLmxvZyhcImRyb3BEZXN0czpcIiwgZGVzdHMsIHJvbGUsIGtleSlcbiAgICBjb25zdCBkcm9wcyA9IGRlc3RzW3JvbGVUb1Nhbltyb2xlXSArIFwiQFwiXTtcbiAgICAvLyBjb25zb2xlLmxvZyhcImRyb3BzOlwiLCBkcm9wcylcblxuICAgIGlmIChkcm9wcyA9PT0gdW5kZWZpbmVkIHx8IGRyb3BzID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgICByZXR1cm4gZHJvcHMuaW5kZXhPZihrZXkpICE9PSAtMTtcbn1cblxuLy8gVE9ETzogYWZyZSAxIG1vdmUgbWFkZSBvbmx5IDEgcG9ja2V0IHVwZGF0ZSBuZWVkZWQgYXQgb25jZSwgbm8gbmVlZCB0byB1cGRhdGUgYm90aFxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVBvY2tldHMoY3RybDogUm91bmRDb250cm9sbGVyLCB2cG9ja2V0MCwgdnBvY2tldDEpOiB2b2lkIHtcbiAgICAvLyB1cGRhdGUgcG9ja2V0cyBmcm9tIGZlblxuICAgIGlmIChuZWVkUG9ja2V0cyhjdHJsLnZhcmlhbnQpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gY3RybC5mdWxsZmVuLnNwbGl0KFwiIFwiKTtcbiAgICAgICAgY29uc3QgZmVuX3BsYWNlbWVudCA9IHBhcnRzWzBdO1xuICAgICAgICB2YXIgcG9ja2V0cyA9IFwiXCI7XG4gICAgICAgIGNvbnN0IGJyYWNrZXRQb3MgPSBmZW5fcGxhY2VtZW50LmluZGV4T2YoXCJbXCIpO1xuICAgICAgICBpZiAoYnJhY2tldFBvcyAhPT0gLTEpIHtcbiAgICAgICAgICAgIHBvY2tldHMgPSBmZW5fcGxhY2VtZW50LnNsaWNlKGJyYWNrZXRQb3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYyA9IGN0cmwubXljb2xvclswXTtcbiAgICAgICAgY29uc3QgbyA9IGN0cmwub3BwY29sb3JbMF07XG4gICAgICAgIGNvbnN0IHJvbGVzID0gcG9ja2V0Um9sZXMoY3RybC52YXJpYW50KTtcbiAgICAgICAgdmFyIHBvID0ge307XG4gICAgICAgIHZhciBwYyA9IHt9O1xuICAgICAgICByb2xlcy5mb3JFYWNoKHJvbGUgPT4gcGNbcm9sZV0gPSBsYyhwb2NrZXRzLCByb2xlVG9TYW5bcm9sZV0udG9Mb3dlckNhc2UoKSwgYz09PShjdHJsLnZhcmlhbnQ9PT0nc2hvZ2knID8gJ2InIDogJ3cnKSkpO1xuICAgICAgICByb2xlcy5mb3JFYWNoKHJvbGUgPT4gcG9bcm9sZV0gPSBsYyhwb2NrZXRzLCByb2xlVG9TYW5bcm9sZV0udG9Mb3dlckNhc2UoKSwgbz09PShjdHJsLnZhcmlhbnQ9PT0nc2hvZ2knID8gJ2InIDogJ3cnKSkpO1xuICAgICAgICBpZiAoY3RybC5mbGlwKSB7XG4gICAgICAgICAgICBjdHJsLnBvY2tldHMgPSBbcGMsIHBvXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN0cmwucG9ja2V0cyA9IFtwbywgcGNdO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKG8sYyxwbyxwYylcbiAgICAgICAgY3RybC52cG9ja2V0MCA9IHBhdGNoKHZwb2NrZXQwLCBwb2NrZXRWaWV3KGN0cmwsIGN0cmwuZmxpcCA/IGN0cmwubXljb2xvciA6IGN0cmwub3BwY29sb3IsIFwidG9wXCIpKTtcbiAgICAgICAgY3RybC52cG9ja2V0MSA9IHBhdGNoKHZwb2NrZXQxLCBwb2NrZXRWaWV3KGN0cmwsIGN0cmwuZmxpcCA/IGN0cmwub3BwY29sb3IgOiBjdHJsLm15Y29sb3IsIFwiYm90dG9tXCIpKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBoLCBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuaW1wb3J0IHRvVk5vZGUgZnJvbSAnc25hYmJkb20vdG92bm9kZSc7XHJcblxyXG5pbXBvcnQgeyBrZXkycG9zIH0gZnJvbSAnY2hlc3Nncm91bmR4L3V0aWwnO1xyXG5cclxuaW1wb3J0IHsgaXNQcm9tb3Rpb24sIG1hbmRhdG9yeVByb21vdGlvbiwgcHJvbW90aW9uUm9sZXMsIHJvbGVUb1NhbiB9IGZyb20gJy4vY2hlc3MnO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgbGlzdGVuZXJzXSk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihjdHJsKSB7XHJcblxyXG4gICAgbGV0IHByb21vdGluZzogYW55ID0gZmFsc2U7XHJcbiAgICBsZXQgcm9sZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICBmdW5jdGlvbiBzdGFydChvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kID0gY3RybC5nZXRHcm91bmQoKTtcclxuICAgICAgICBpZiAoaXNQcm9tb3Rpb24oY3RybC52YXJpYW50LCBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLCBvcmlnLCBkZXN0LCBtZXRhKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IGN0cmwubXljb2xvcjtcclxuICAgICAgICAgICAgY29uc3Qgb3JpZW50YXRpb24gPSBncm91bmQuc3RhdGUub3JpZW50YXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmluZ1JvbGUgPSBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLnJvbGU7XHJcbiAgICAgICAgICAgIHJvbGVzID0gcHJvbW90aW9uUm9sZXMoY3RybC52YXJpYW50LCBtb3ZpbmdSb2xlKTtcclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoY3RybC52YXJpYW50KSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKG1hbmRhdG9yeVByb21vdGlvbihtb3ZpbmdSb2xlLCBkZXN0LCBjb2xvcikpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9tb3RlKGdyb3VuZCwgZGVzdCwgJ3AnICsgZ3JvdW5kLnN0YXRlLnBpZWNlc1tkZXN0XS5yb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBjdHJsLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICcrJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGRyYXdfcHJvbW8oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBwcm9tb3RpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWc6IG9yaWcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc3Q6IGRlc3QsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ21ha3J1ayc6XHJcbiAgICAgICAgICAgICAgICBwcm9tb3RlKGdyb3VuZCwgZGVzdCwgJ21ldCcpO1xyXG4gICAgICAgICAgICAgICAgY3RybC5zZW5kTW92ZShvcmlnLCBkZXN0LCAnbScpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NpdHR1eWluJzpcclxuICAgICAgICAgICAgICAgIHByb21vdGUoZ3JvdW5kLCBkZXN0LCAnZmVyeicpO1xyXG4gICAgICAgICAgICAgICAgY3RybC5zZW5kTW92ZShvcmlnLCBkZXN0LCAnZicpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBkcmF3X3Byb21vKGRlc3QsIGNvbG9yLCBvcmllbnRhdGlvbik7XHJcbiAgICAgICAgICAgICAgICBwcm9tb3RpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgb3JpZzogb3JpZyxcclxuICAgICAgICAgICAgICAgICAgICBkZXN0OiBkZXN0LFxyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBjdHJsLnNlbmRNb3ZlLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gcHJvbW90ZShnLCBrZXksIHJvbGUpIHtcclxuICAgICAgICB2YXIgcGllY2VzID0ge307XHJcbiAgICAgICAgdmFyIHBpZWNlID0gZy5zdGF0ZS5waWVjZXNba2V5XTtcclxuICAgICAgICBpZiAoZy5zdGF0ZS5waWVjZXNba2V5XS5yb2xlID09PSByb2xlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwaWVjZXNba2V5XSA9IHtcclxuICAgICAgICAgICAgICAgIGNvbG9yOiBwaWVjZS5jb2xvcixcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBwcm9tb3RlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBnLnNldFBpZWNlcyhwaWVjZXMpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZHJhd19wcm9tbyhkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pIHtcclxuICAgICAgICB2YXIgY29udGFpbmVyID0gdG9WTm9kZShkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdleHRlbnNpb24nKSBhcyBOb2RlKTtcclxuICAgICAgICBwYXRjaChjb250YWluZXIsIHJlbmRlclByb21vdGlvbihkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X25vX3Byb21vKCkge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uX2Nob2ljZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZXh0ZW5zaW9uJykpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmlzaChyb2xlKSB7XHJcbiAgICAgICAgaWYgKHByb21vdGluZykge1xyXG4gICAgICAgICAgICBkcmF3X25vX3Byb21vKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21vdGVkID0gcHJvbW90ZShjdHJsLmdldEdyb3VuZCgpLCBwcm9tb3RpbmcuZGVzdCwgcm9sZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21vID0gY3RybC52YXJpYW50ID09PSBcInNob2dpXCIgPyBwcm9tb3RlZCA/IFwiK1wiIDogXCJcIiA6IHJvbGVUb1Nhbltyb2xlXS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBpZiAocHJvbW90aW5nLmNhbGxiYWNrKSBwcm9tb3RpbmcuY2FsbGJhY2socHJvbW90aW5nLm9yaWcsIHByb21vdGluZy5kZXN0LCBwcm9tbyk7XHJcbiAgICAgICAgICAgIHByb21vdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsKCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGJpbmQoZXZlbnROYW1lOiBzdHJpbmcsIGY6IChlOiBFdmVudCkgPT4gdm9pZCwgcmVkcmF3KSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaW5zZXJ0KHZub2RlKSB7XHJcbiAgICAgICAgICAgICAgICB2bm9kZS5lbG0uYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGYoZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlZHJhdykgcmVkcmF3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJQcm9tb3Rpb24oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKSB7XHJcbiAgICAgICAgY29uc3QgZGltID0gY3RybC5nZXRHcm91bmQoKS5zdGF0ZS5kaW1lbnNpb25zXHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5rSXMwID0gZGltLmhlaWdodCA9PT0gMTA7XHJcbiAgICAgICAgdmFyIGxlZnQgPSAoZGltLndpZHRoIC0ga2V5MnBvcyhkZXN0LCBmaXJzdFJhbmtJczApWzBdKSAqICgxMDAgLyBkaW0ud2lkdGgpO1xyXG4gICAgICAgIGlmIChvcmllbnRhdGlvbiA9PT0gXCJ3aGl0ZVwiKSBsZWZ0ID0gKDEwMCAvIGRpbS53aWR0aCkgKiAoZGltLndpZHRoIC0gMSkgLSBsZWZ0O1xyXG4gICAgICAgIHZhciB2ZXJ0aWNhbCA9IGNvbG9yID09PSBvcmllbnRhdGlvbiA/IFwidG9wXCIgOiBcImJvdHRvbVwiO1xyXG4gICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICBcImRpdiNleHRlbnNpb25fY2hvaWNlLlwiICsgdmVydGljYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGhvb2s6IHtcclxuICAgICAgICAgICAgICAgICAgICBpbnNlcnQ6IHZub2RlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWwgPSB2bm9kZS5lbG0gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjYW5jZWwoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICByb2xlcy5tYXAoKHNlcnZlclJvbGUsIGkpID0+IHtcclxuICAgICAgICAgICAgICAgIHZhciB0b3AgPSAoY29sb3IgPT09IG9yaWVudGF0aW9uID8gaSA6IGRpbS5oZWlnaHQgLTEgLSBpKSAqICgxMDAgLyBkaW0uaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBoKFxyXG4gICAgICAgICAgICAgICAgICAgIFwic3F1YXJlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhdHRyczogeyBzdHlsZTogXCJ0b3A6IFwiICsgdG9wICsgXCIlO2xlZnQ6IFwiICsgbGVmdCArIFwiJVwiIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvb2s6IGJpbmQoXCJjbGlja1wiLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5pc2goc2VydmVyUm9sZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZhbHNlKVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgW2goXCJwaWVjZS5cIiArIHNlcnZlclJvbGUgKyBcIi5cIiArIGNvbG9yKV1cclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXJ0LFxyXG4gICAgfTtcclxufVxyXG4iLCIvLyBodHRwOi8vanNmaWRkbGUubmV0L01pc3NvdWxhTG9yZW56by9nZm42b2Izai9cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9vcm5pY2FyL2xpbGEvYmxvYi9tYXN0ZXIvdWkvY29tbW9uL3NyYy9yZXNpemUudHNcblxuaW1wb3J0ICogYXMgY2cgZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcblxuZXhwb3J0IHR5cGUgTW91Y2hFdmVudCA9IE1vdXNlRXZlbnQgJiBUb3VjaEV2ZW50O1xuXG4vL2V4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHJlc2l6ZUhhbmRsZShlbHM6IGNnLkVsZW1lbnRzLCBwcmVmOiBudW1iZXIsIHBseTogbnVtYmVyKSB7XG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiByZXNpemVIYW5kbGUoZWxzOiBjZy5FbGVtZW50cykge1xuXG4vLyAgaWYgKCFwcmVmKSByZXR1cm47XG4gIGlmICh0cnVlKSByZXR1cm47XG5cbiAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjZy1yZXNpemUnKTtcbiAgZWxzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cbiAgY29uc3QgbW91c2Vtb3ZlRXZlbnQgPSAnbW91c2Vtb3ZlJztcbiAgY29uc3QgbW91c2V1cEV2ZW50ID0gJ21vdXNldXAnO1xuXG4gIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChzdGFydDogTW91Y2hFdmVudCkgPT4ge1xuXG4gICAgc3RhcnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGNvbnN0IHN0YXJ0UG9zID0gZXZlbnRQb3NpdGlvbihzdGFydCkhO1xuICAgIGNvbnN0IGluaXRpYWxab29tID0gMTAwOyAgLy9wYXJzZUludChnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpLmdldFByb3BlcnR5VmFsdWUoJy0tem9vbScpKTtcbiAgICBsZXQgem9vbSA9IGluaXRpYWxab29tO1xuLypcbiAgICBjb25zdCBzYXZlWm9vbSA9IHdpbmRvdy5saWNoZXNzLmRlYm91bmNlKCgpID0+IHtcbiAgICAgICQuYWpheCh7IG1ldGhvZDogJ3Bvc3QnLCB1cmw6ICcvcHJlZi96b29tP3Y9JyArICgxMDAgKyB6b29tKSB9KTtcbiAgICB9LCA3MDApO1xuKi9cblxuICAgIGNvbnN0IHNldFpvb20gPSAoem9vbTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNnLXdyYXAnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgaWYgKGVsKSB7XG4vLyAgICAgICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGRpbWVuc2lvbnNbVkFSSUFOVFNbdGhpcy52YXJpYW50XS5nZW9tXS53aWR0aCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDUyIDogNjQpO1xuLy8gICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLmhlaWdodCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDYwIDogNjQpO1xuICAgICAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gcGFyc2VJbnQoIGRvY3VtZW50LmRlZmF1bHRWaWV3LmdldENvbXB1dGVkU3R5bGUoIGVsICkud2lkdGggfHwgJycsIDEwKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2VIZWlnaHQgPSBwYXJzZUludChkb2N1bWVudC5kZWZhdWx0Vmlldy5nZXRDb21wdXRlZFN0eWxlKCBlbCApLmhlaWdodCB8fCAnJywgMTApO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYmFzZVdpZHRoLCBiYXNlSGVpZ2h0LCB6b29tKTtcbiAgICAgICAgICAgIGNvbnN0IHB4dyA9IGAke3pvb20gLyAxMDAgKiBiYXNlV2lkdGh9cHhgO1xuICAgICAgICAgICAgY29uc3QgcHhoID0gYCR7em9vbSAvIDEwMCAqIGJhc2VIZWlnaHR9cHhgO1xuICAgICAgICAgICAgZWwuc3R5bGUud2lkdGggPSBweHc7XG4gICAgICAgICAgICBlbC5zdHlsZS5oZWlnaHQgPSBweGg7XG4gICAgICAgICAgICBjb25zdCBldiA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdFdmVudCcpO1xuICAgICAgICAgICAgZXYuaW5pdEV2ZW50KCdjaGVzc2dyb3VuZC5yZXNpemUnLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5kaXNwYXRjaEV2ZW50KGV2KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJlc2l6ZSA9IChtb3ZlOiBNb3VjaEV2ZW50KSA9PiB7XG5cbiAgICAgIGNvbnN0IHBvcyA9IGV2ZW50UG9zaXRpb24obW92ZSkhO1xuICAgICAgY29uc3QgZGVsdGEgPSBwb3NbMF0gLSBzdGFydFBvc1swXSArIHBvc1sxXSAtIHN0YXJ0UG9zWzFdO1xuXG4gICAgICB6b29tID0gTWF0aC5yb3VuZChNYXRoLm1pbigxNTAsIE1hdGgubWF4KDAsIGluaXRpYWxab29tICsgZGVsdGEgLyAxMCkpKTtcblxuLy8gICAgICBkb2N1bWVudC5ib2R5LnNldEF0dHJpYnV0ZSgnc3R5bGUnLCAnLS16b29tOicgKyB6b29tKTtcbi8vICAgICAgd2luZG93LmxpY2hlc3MuZGlzcGF0Y2hFdmVudCh3aW5kb3csICdyZXNpemUnKTtcbiAgICAgIHNldFpvb20oem9vbSk7XG4vLyAgICAgIHNhdmVab29tKCk7XG4gICAgfTtcblxuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgncmVzaXppbmcnKTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIobW91c2Vtb3ZlRXZlbnQsIHJlc2l6ZSk7XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKG1vdXNldXBFdmVudCwgKCkgPT4ge1xuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihtb3VzZW1vdmVFdmVudCwgcmVzaXplKTtcbiAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgncmVzaXppbmcnKTtcbiAgICB9LCB7IG9uY2U6IHRydWUgfSk7XG4gIH0pO1xuLypcbiAgaWYgKHByZWYgPT0gMSkge1xuICAgIGNvbnN0IHRvZ2dsZSA9IChwbHk6IG51bWJlcikgPT4gZWwuY2xhc3NMaXN0LnRvZ2dsZSgnbm9uZScsIHBseSA+PSAyKTtcbiAgICB0b2dnbGUocGx5KTtcbiAgICB3aW5kb3cubGljaGVzcy5wdWJzdWIub24oJ3BseScsIHRvZ2dsZSk7XG4gIH1cblxuICBhZGROYWcoZWwpO1xuKi9cbn1cblxuZnVuY3Rpb24gZXZlbnRQb3NpdGlvbihlOiBNb3VjaEV2ZW50KTogW251bWJlciwgbnVtYmVyXSB8IHVuZGVmaW5lZCB7XG4gIGlmIChlLmNsaWVudFggfHwgZS5jbGllbnRYID09PSAwKSByZXR1cm4gW2UuY2xpZW50WCwgZS5jbGllbnRZXTtcbiAgaWYgKGUudG91Y2hlcyAmJiBlLnRhcmdldFRvdWNoZXNbMF0pIHJldHVybiBbZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFgsIGUudGFyZ2V0VG91Y2hlc1swXS5jbGllbnRZXTtcbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cbi8qXG5mdW5jdGlvbiBhZGROYWcoZWw6IEhUTUxFbGVtZW50KSB7XG5cbiAgY29uc3Qgc3RvcmFnZSA9IHdpbmRvdy5saWNoZXNzLnN0b3JhZ2UubWFrZUJvb2xlYW4oJ3Jlc2l6ZS1uYWcnKTtcbiAgaWYgKHN0b3JhZ2UuZ2V0KCkpIHJldHVybjtcblxuICB3aW5kb3cubGljaGVzcy5sb2FkQ3NzUGF0aCgnbmFnLWNpcmNsZScpO1xuICBlbC50aXRsZSA9ICdEcmFnIHRvIHJlc2l6ZSc7XG4gIGVsLmlubmVySFRNTCA9ICc8ZGl2IGNsYXNzPVwibmFnLWNpcmNsZVwiPjwvZGl2Pic7XG4gIGVsLmFkZEV2ZW50TGlzdGVuZXIod2luZG93LmxpY2hlc3MubW91c2Vkb3duRXZlbnQsICgpID0+IHtcbiAgICBzdG9yYWdlLnNldCh0cnVlKTtcbiAgICBlbC5pbm5lckhUTUwgPSAnJztcbiAgfSwgeyBvbmNlOiB0cnVlIH0pO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4gc3RvcmFnZS5zZXQodHJ1ZSksIDE1MDAwKTtcbn1cbiovIiwiaW1wb3J0IHsgaCB9IGZyb20gXCJzbmFiYmRvbVwiO1xyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gJ3NuYWJiZG9tL3Zub2RlJztcclxuaW1wb3J0IFJvdW5kQ29udHJvbGxlciBmcm9tICcuL2N0cmwnO1xyXG5pbXBvcnQgeyBWQVJJQU5UUyB9IGZyb20gJy4vY2hlc3MnO1xyXG5cclxuXHJcbmZ1bmN0aW9uIHJ1bkdyb3VuZCh2bm9kZTogVk5vZGUsIG1vZGVsLCBoYW5kbGVyKSB7XHJcbiAgICBjb25zdCBlbCA9IHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IGN0cmwgPSBuZXcgUm91bmRDb250cm9sbGVyKGVsLCBtb2RlbCwgaGFuZGxlcik7XHJcbiAgICBjb25zdCBjZyA9IGN0cmwuY2hlc3Nncm91bmQ7XHJcbiAgICB3aW5kb3dbJ2NnJ10gPSBjZztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJvdW5kVmlldyhtb2RlbCwgaGFuZGxlcik6IFZOb2RlW10ge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCIuLi4uLi4ucm91bmRWaWV3KG1vZGVsLCBoYW5kbGVyKVwiLCBtb2RlbCwgaGFuZGxlcik7XHJcbiAgICB2YXIgcGxheWVyVG9wLCBwbGF5ZXJCb3R0b20sIGRhdGFJY29uO1xyXG4gICAgZGF0YUljb24gPSBWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLmljb247XHJcbiAgICBpZiAobW9kZWxbXCJ1c2VybmFtZVwiXSAhPT0gbW9kZWxbXCJ3cGxheWVyXCJdICYmIG1vZGVsW1widXNlcm5hbWVcIl0gIT09IG1vZGVsW1wiYnBsYXllclwiXSkge1xyXG4gICAgICAgIC8vIHNwZWN0YXRvciBnYW1lIHZpZXdcclxuICAgICAgICBwbGF5ZXJUb3AgPSBtb2RlbFtcInZhcmlhbnRcIl0gPT09ICdzaG9naScgPyBtb2RlbFtcIndwbGF5ZXJcIl0gOiBtb2RlbFtcImJwbGF5ZXJcIl07XHJcbiAgICAgICAgcGxheWVyQm90dG9tID0gbW9kZWxbXCJ2YXJpYW50XCJdID09PSAnc2hvZ2knID8gbW9kZWxbXCJicGxheWVyXCJdIDogbW9kZWxbXCJ3cGxheWVyXCJdO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBwbGF5ZXJUb3AgPSBtb2RlbFtcInVzZXJuYW1lXCJdID09PSBtb2RlbFtcIndwbGF5ZXJcIl0gPyBtb2RlbFtcImJwbGF5ZXJcIl0gOiBtb2RlbFtcIndwbGF5ZXJcIl07XHJcbiAgICAgICAgcGxheWVyQm90dG9tID0gbW9kZWxbXCJ1c2VybmFtZVwiXTtcclxuICAgIH1cclxuICAgIHJldHVybiBbaCgnYXNpZGUuc2lkZWJhci1maXJzdCcsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2Rpdi5nYW1lLWluZm8nLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2JywgW2goJ2ktdmFyaWFudCcsIHthdHRyczoge1wiZGF0YS1pY29uXCI6IGRhdGFJY29ufSwgY2xhc3M6IHtcImljb25cIjogdHJ1ZX19ICksIGgoJ3RjJywgbW9kZWxbXCJiYXNlXCJdICsgXCIrXCIgKyBtb2RlbFtcImluY1wiXSArIFwiIOKAoiBDYXN1YWwg4oCiIFwiICsgbW9kZWxbXCJ2YXJpYW50XCJdKV0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdicsIFtoKCdpLXNpZGUnLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXdoaXRlXCI6IHRydWV9IH0gKSwgaCgncGxheWVyJywgbW9kZWxbXCJ3cGxheWVyXCJdICsgXCIgKDE1MDA/KVwiKV0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdicsIFtoKCdpLXNpZGUnLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLWJsYWNrXCI6IHRydWV9IH0gKSwgaCgncGxheWVyJywgbW9kZWxbXCJicGxheWVyXCJdICsgXCIgKDE1MDA/KVwiKV0pLFxyXG4gICAgICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2LnJvdW5kY2hhdCNyb3VuZGNoYXQnKVxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgaCgnbWFpbi5tYWluJywgW1xyXG4gICAgICAgICAgICAgICAgaChgc2VsZWN0aW9uLiR7VkFSSUFOVFNbbW9kZWxbXCJ2YXJpYW50XCJdXS5ib2FyZH0uJHtWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLnBpZWNlc31gLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaChgZGl2LmNnLXdyYXAuJHtWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLmNnfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgaG9vazogeyBpbnNlcnQ6ICh2bm9kZSkgPT4gcnVuR3JvdW5kKHZub2RlLCBtb2RlbCwgaGFuZGxlcil9LFxyXG4gICAgICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICBoKCdhc2lkZS5zaWRlYmFyLXNlY29uZCcsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiNwb2NrZXQtd3JhcHBlcicsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKGBkaXYuJHtWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLnBpZWNlc31gLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2Rpdi5jZy13cmFwLnBvY2tldCcsIFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNwb2NrZXQwJyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjY2xvY2swJyksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYucm91bmQtZGF0YScsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYucGxheWVyLWRhdGEnLCBbaCgnaS1zaWRlLm9ubGluZSN0b3AtcGxheWVyJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1vbmxpbmVcIjogZmFsc2UsIFwiaWNvbi1vZmZsaW5lXCI6IHRydWV9fSksIGgoJ3BsYXllcicsIHBsYXllclRvcCksIGgoJ3JhdGluZycsIFwiMTUwMD9cIildKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYjbW92ZS1jb250cm9scycpLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNtb3ZlbGlzdCcpLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ2RpdiNhZnRlci1nYW1lJyksXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnZGl2I2dhbWUtY29udHJvbHMnKSxcclxuICAgICAgICAgICAgICAgICAgICBoKCdkaXYucGxheWVyLWRhdGEnLCBbaCgnaS1zaWRlLm9ubGluZSNib3R0b20tcGxheWVyJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1vbmxpbmVcIjogZmFsc2UsIFwiaWNvbi1vZmZsaW5lXCI6IHRydWV9fSksIGgoJ3BsYXllcicsIHBsYXllckJvdHRvbSksIGgoJ3JhdGluZycsIFwiMTUwMD9cIildKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I2Nsb2NrMScpLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I3BvY2tldC13cmFwcGVyJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGgoYGRpdi4ke1ZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0ucGllY2VzfWAsIFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaCgnZGl2LmNnLXdyYXAucG9ja2V0JywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaCgnZGl2I3BvY2tldDEnKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiNmbGlwJyksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjem9vbScpLFxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgaCgndW5kZXItbGVmdCcsIFwiU3BlY3RhdG9yc1wiKSxcclxuICAgICAgICAgICAgaCgnZGl2I3VuZGVyLWJvYXJkJyksXHJcbiAgICAgICAgXTtcclxufVxyXG4iLCJpbXBvcnQgaCBmcm9tICdzbmFiYmRvbS9oJztcclxuaW1wb3J0IHsgVk5vZGUgfSBmcm9tICdzbmFiYmRvbS92bm9kZSc7XHJcblxyXG5pbXBvcnQgeyBsb2JieVZpZXcgfSBmcm9tICcuL2xvYmJ5JztcclxuaW1wb3J0IHsgcm91bmRWaWV3IH0gZnJvbSAnLi9yb3VuZCc7XHJcblxyXG5leHBvcnQgY29uc3QgQUNDRVBUID0gU3ltYm9sKFwiQWNjZXB0XCIpO1xyXG5leHBvcnQgY29uc3QgQkFDSyA9IFN5bWJvbCgnQmFjaycpO1xyXG5cclxuLy8gbW9kZWwgOiB7aG9tZTogXCJcIiwgdXNlcm5hbWU6IFwiXCIsIHZhcmlhbnQ6IFwiXCIsIGdhbWVJZDogMCwgd3BsYXllcjogXCJcIiwgYnBsYXllcjogXCJcIiwgYmFzZTogXCJcIiwgaW5jOiBcIlwiLCBzZWVrczogW3NlZWtdLCB0djogXCJcIn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB2aWV3KG1vZGVsLCBoYW5kbGVyKTogVk5vZGUge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJzaXRlLnZpZXcoKSBtb2RlbD1cIiwgbW9kZWwpXHJcbiAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEzOTczMjkvaG93LXRvLXJlbW92ZS10aGUtaGFzaC1mcm9tLXdpbmRvdy1sb2NhdGlvbi13aXRoLWphdmFzY3JpcHQtd2l0aG91dC1wYWdlLXJlZnJlc2gvNTI5ODY4NCM1Mjk4Njg0XHJcbiAgICBjb25zb2xlLmxvZyhcInNpdGUudHMgZG9jdW1lbnQudGl0bGU9XCIsIGRvY3VtZW50LnRpdGxlKVxyXG4gICAgY29uc29sZS5sb2coXCJzaXRlLnRzIHdpbmRvdy5sb2NhdGlvbj1cIiwgd2luZG93LmxvY2F0aW9uKVxyXG4gICAgd2luZG93Lmhpc3RvcnkucHVzaFN0YXRlKHt9LCBkb2N1bWVudC50aXRsZSwgXCIvXCIpO1xyXG5cclxuICAgIHZhciBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdweWNoZXNzLXZhcmlhbnRzJyk7XHJcbiAgICBpZiAoZWwgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGVsLmhhc0F0dHJpYnV0ZShcImRhdGEtaG9tZVwiKSkge1xyXG4gICAgICAgIG1vZGVsW1wiaG9tZVwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtaG9tZVwiKTtcclxuICAgIH1cclxuICAgIGlmIChlbCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgZWwuaGFzQXR0cmlidXRlKFwiZGF0YS12YXJpYW50XCIpKSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFudCA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdmFyaWFudFwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInNpdGUudmlldygpIGRhdGEtdmFyaWFudD1cIiwgdmFyaWFudCk7XHJcbiAgICAgICAgaWYgKHZhcmlhbnQpIHtcclxuICAgICAgICAgICAgbW9kZWxbXCJ1c2VybmFtZVwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdXNlcm5hbWVcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1widmFyaWFudFwiXSA9IHZhcmlhbnQ7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiZ2FtZUlkXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1nYW1laWRcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wid3BsYXllclwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtd3BsYXllclwiKTtcclxuICAgICAgICAgICAgbW9kZWxbXCJicGxheWVyXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1icGxheWVyXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImZlblwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtZmVuXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImJhc2VcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWJhc2VcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiaW5jXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1pbmNcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1widHZcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXR2XCIpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGgoJ2RpdiNwbGFjZWhvbGRlci5tYWluLXdyYXBwZXInLCBtb2RlbC52YXJpYW50ID8gcm91bmRWaWV3KG1vZGVsLCBoYW5kbGVyKSA6IGxvYmJ5Vmlldyhtb2RlbCwgaGFuZGxlcikpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbml0KCkge1xyXG4gICAgcmV0dXJuIHtob21lOiBcIlwiLCB1c2VybmFtZTogXCJcIiwgdmFyaWFudDogXCJcIiwgZ2FtZUlkOiAwLCB3cGxheWVyOiBcIlwiLCBicGxheWVyOiBcIlwiLCBmZW46IFwiXCIsIGJhc2U6IFwiXCIsIGluYzogXCJcIiwgc2Vla3M6IFtdLCB0djogXCJcIn07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZShtb2RlbCwgYWN0aW9uKSB7XHJcbiAgICByZXR1cm4gYWN0aW9uLnR5cGUgPT09IEFDQ0VQVCA/XHJcbiAgICAgICAge2hvbWU6IG1vZGVsW1wiaG9tZVwiXSwgdXNlcm5hbWU6IG1vZGVsW1widXNlcm5hbWVcIl0sIHZhcmlhbnQ6IG1vZGVsW1widmFyaWFudFwiXSwgZ2FtZUlkOiBtb2RlbFtcImdhbWVJZFwiXSwgd3BsYXllcjogbW9kZWxbXCJ3cGxheWVyXCJdLCBicGxheWVyOiBtb2RlbFtcImJwbGF5ZXJcIl0sIGZlbjogbW9kZWxbXCJmZW5cIl0sIGJhc2U6IG1vZGVsW1wiYmFzZVwiXSwgaW5jOiBtb2RlbFtcImluY1wiXSwgc2Vla3M6IFtdLCB0djogbW9kZWxbXCJ0dlwiXX1cclxuICAgICAgICAgICAgOiBhY3Rpb24udHlwZSA9PT0gQkFDSyA/XHJcbiAgICAgICAgICAgICAgICB7aG9tZTogbW9kZWxbXCJob21lXCJdLCB1c2VybmFtZTogbW9kZWxbXCJ1c2VybmFtZVwiXSwgdmFyaWFudDogXCJcIiwgZ2FtZUlkOiAwLCB3cGxheWVyOiBcIlwiLCBicGxheWVyOiBcIlwiLCBmZW46IFwiXCIsIGJhc2U6IFwiXCIsIGluYzogXCJcIiwgc2Vla3M6IFtdLCB0djogXCJcIn1cclxuICAgICAgICAgICAgICAgIDogbW9kZWw7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IHsgdmlldywgaW5pdCwgdXBkYXRlLCBhY3Rpb25zOiB7IEFDQ0VQVCwgQkFDSyB9IH1cclxuIiwiY2xhc3Mgc291bmRzIHtcclxuICAgIHRyYWNrcztcclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMudHJhY2tzID0ge1xyXG4gICAgICAgICAgICBHZW5lcmljTm90aWZ5OiB7IG5hbWU6ICdHZW5lcmljTm90aWZ5JywgcXR5IDogMSwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBNb3ZlOiB7IG5hbWU6ICdNb3ZlJywgcXR5IDogOCwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBDYXB0dXJlOiB7IG5hbWU6ICdDYXB0dXJlJywgcXR5IDogNCwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgICAgICBDaGVjazogeyBuYW1lOiAnQ2hlY2snLCBxdHkgOiAyLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIERyYXc6IHsgbmFtZTogJ0RyYXcnLCBxdHkgOiAxLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIFZpY3Rvcnk6IHsgbmFtZTogJ1ZpY3RvcnknLCBxdHkgOiAxLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIERlZmVhdDogeyBuYW1lOiAnRGVmZWF0JywgcXR5IDogMSwgcG9vbCA6IFtdLCBpbmRleCA6IDB9LFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy50cmFja3MpLmZvckVhY2goa2V5ID0+IHtcclxuICAgICAgICAgICAgbGV0IHR5cGUgPSB0aGlzLnRyYWNrc1trZXldO1xyXG4gICAgICAgICAgICB0eXBlLnBvb2wgPSB0aGlzLmJ1aWxkTWFueVNvdW5kcyh0eXBlLm5hbWUsIHR5cGUucXR5KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGJ1aWxkTWFueVNvdW5kcyA9IChmaWxlLCBxdHkpID0+IHtcclxuICAgICAgICB2YXIgc291bmRBcnJheTogSFRNTEF1ZGlvRWxlbWVudFtdID0gW107XHJcbiAgICAgICAgd2hpbGUgKHNvdW5kQXJyYXkubGVuZ3RoIDwgcXR5KSB7XHJcbiAgICAgICAgICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhdWRpb1wiKTtcclxuICAgICAgICAgICAgaWYgKGVsLmNhblBsYXlUeXBlKCdhdWRpby9tcGVnJykpIHtcclxuICAgICAgICAgICAgICAgIGVsLnNyYyA9ICcvc3RhdGljL3NvdW5kLycgKyBmaWxlICsgJy5tcDMnO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZWwuc3JjID0gJy9zdGF0aWMvc291bmQvJyArIGZpbGUgKyAnLm9nZyc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWwuc2V0QXR0cmlidXRlKFwicHJlbG9hZFwiLCBcImF1dG9cIik7XHJcbiAgICAgICAgICAgIGVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICAgICAgc291bmRBcnJheS5wdXNoKGVsKTtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBzb3VuZEFycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0U291bmQgPSAodHlwZSkgPT4ge1xyXG4gICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLnRyYWNrc1t0eXBlXTtcclxuICAgICAgICB0YXJnZXQuaW5kZXggPSAodGFyZ2V0LmluZGV4ICsgMSkgJSB0YXJnZXQucG9vbC5sZW5ndGg7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJTT1VORDpcIiwgdHlwZSwgdGFyZ2V0LmluZGV4KTtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0LnBvb2xbdGFyZ2V0LmluZGV4XTtcclxuICAgIH1cclxuXHJcbiAgICBnZW5lcmljTm90aWZ5KCkgeyB0aGlzLmdldFNvdW5kKCdHZW5lcmljTm90aWZ5JykucGxheSgpOyB9O1xyXG4gICAgbW92ZSgpIHsgdGhpcy5nZXRTb3VuZCgnTW92ZScpLnBsYXkoKTsgfTtcclxuICAgIGNhcHR1cmUoKSB7IHRoaXMuZ2V0U291bmQoJ0NhcHR1cmUnKS5wbGF5KCk7IH07XHJcbiAgICBjaGVjaygpIHsgdGhpcy5nZXRTb3VuZCgnQ2hlY2snKS5wbGF5KCk7IH07XHJcbiAgICBkcmF3KCkgeyB0aGlzLmdldFNvdW5kKCdEcmF3JykucGxheSgpOyB9O1xyXG4gICAgdmljdG9yeSgpIHsgdGhpcy5nZXRTb3VuZCgnVmljdG9yeScpLnBsYXkoKTsgfTtcclxuICAgIGRlZmVhdCgpIHsgdGhpcy5nZXRTb3VuZCgnRGVmZWF0JykucGxheSgpOyB9O1xyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgc291bmQgPSBuZXcoc291bmRzKTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjaGFuZ2VDU1MoY3NzRmlsZSwgY3NzTGlua0luZGV4KSB7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcImxpbmtcIikuaXRlbShjc3NMaW5rSW5kZXgpLnNldEF0dHJpYnV0ZShcImhyZWZcIiwgY3NzRmlsZSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgaW5pdCB9IGZyb20gJ3NuYWJiZG9tJztcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG5pbXBvcnQgaCBmcm9tICdzbmFiYmRvbS9oJztcblxuLy8gVE9ETzogY3JlYXRlIGxvZ291dCBidXR0b24gd2hlbiBsb2dnZWQgaW5cbi8qXG5mdW5jdGlvbiBsb2dpbihob21lKSB7XG4gICAgY29uc29sZS5sb2coXCJMT0dJTiBXSVRIIExJQ0hFU1NcIik7XG4gICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbihob21lICsgJy9sb2dpbicpO1xufTtcbiovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVXNlcm5hbWUoaG9tZSwgdXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhcInJlbmRlclVzZXJuYW1lKClcIiwgdXNlcm5hbWUsIGhvbWUpO1xuICAgIHZhciBvbGRWTm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd1c2VybmFtZScpO1xuICAgIGlmIChvbGRWTm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgb2xkVk5vZGUuaW5uZXJIVE1MID0gJyc7XG4gICAgICAgIHBhdGNoKG9sZFZOb2RlIGFzIEhUTUxFbGVtZW50LCBoKCdkaXYjdXNlcm5hbWUnLCB1c2VybmFtZSkpO1xuICAgIH07XG4vKlxuICAgIC8vIGlmIHVzZXJuYW1lIGlzIG5vdCBhIGxvZ2dlZCBpbiBuYW1lIGxvZ2luIGVsc2UgbG9nb3V0IGJ1dHRvblxuICAgIHZhciBvbGRWTm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dpbicpO1xuICAgIGlmIChvbGRWTm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgb2xkVk5vZGUuaW5uZXJIVE1MID0gJyc7XG4gICAgICAgIHBhdGNoKG9sZFZOb2RlIGFzIEhUTUxFbGVtZW50LCBoKCdidXR0b24nLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBsb2dpbihob21lKSB9LCBwcm9wczoge3RpdGxlOiAnTG9naW4gd2l0aCBMaWNoZXNzJ30gfSwgW2goJ2knLCB7Y2xhc3M6IHtcImljb25cIjogdHJ1ZSwgXCJpY29uLXNpZ24taW5cIjogdHJ1ZX0gfSApLCBdKSk7XG4gICAgfTtcbiovXG59XG4iXX0=
