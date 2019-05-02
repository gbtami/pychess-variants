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
        element.classList.add('cg-board-wrap');
        var bounds = util.memo(function () { return element.getBoundingClientRect(); });
        var relative = state.viewOnly && !state.drawable.visible;
        var elements = wrap_1.default(element, state, relative ? undefined : bounds());
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
    e.preventDefault();
    var asWhite = s.orientation === 'white', bounds = s.dom.bounds(), position = util.eventPosition(e), orig = board.getKeyAtDomPos(position, asWhite, bounds, s.geometry);
    if (!orig)
        return;
    var piece = s.pieces[orig];
    var previouslySelected = s.selected;
    if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || (!piece || piece.color !== s.turnColor)))
        draw_1.clear(s);
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

},{"./fen":10,"./util":16}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("./util");
function createElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
exports.createElement = createElement;
var isTrident;
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
    if (isTrident === undefined)
        isTrident = util_1.computeIsTrident();
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
        'marker-end': isTrident ? undefined : 'url(#arrowhead-' + brush.key + ')',
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
    return isTrident ? 0 : ((shorten ? 20 : 10) / (bd.width * 64) * bounds.width);
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
exports.computeIsTrident = function () { return window.navigator.userAgent.indexOf('Trident/') > -1; };
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
function wrap(element, s, bounds) {
    element.innerHTML = '';
    element.classList.add('cg-board-wrap');
    util_1.colors.forEach(function (c) {
        element.classList.toggle('orientation-' + c, s.orientation === c);
    });
    element.classList.toggle('manipulable', !s.viewOnly);
    var extension = util_1.createEl('div', 'extension');
    element.appendChild(extension);
    var board = util_1.createEl('div', 'cg-board');
    element.appendChild(board);
    var svg;
    if (s.drawable.visible && bounds) {
        svg = svg_1.createElement('svg');
        svg.appendChild(svg_1.createElement('defs'));
        element.appendChild(svg);
    }
    if (s.coordinates) {
        var orientClass = s.orientation === 'black' ? ' black' : '';
        var firstRankIs0 = s.dimensions.height === 10;
        var shift = firstRankIs0 ? 0 : 1;
        element.appendChild(renderCoords(types_1.ranks.slice(shift, s.dimensions.height + shift), 'ranks' + orientClass));
        element.appendChild(renderCoords(types_1.files.slice(0, s.dimensions.width), 'files' + orientClass));
    }
    var ghost;
    if (bounds && s.draggable.showGhost) {
        ghost = util_1.createEl('piece', 'ghost');
        util_1.setVisible(ghost, false);
        element.appendChild(ghost);
    }
    return {
        board: board,
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
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("chessgroundx/util");
exports.variants = ["makruk", "sittuyin", "placement", "crazyhouse", "standard", "shogi", "xiangqi", "capablanca", "seirawan"];
exports.VARIANTS = {
    makruk: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "grid", pieces: "makruk", css: "makruk" },
    sittuyin: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "gridx", pieces: "makruk", css: "sittuyin" },
    shogi: { geom: 1 /* dim9x9 */, cg: "cg-576", board: "grid9x9", pieces: "shogi", css: "shogi0" },
    xiangqi: { geom: 3 /* dim9x10 */, cg: "cg-576-640", board: "river", pieces: "xiangqi", css: "xiangqi" },
    placement: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "standard" },
    crazyhouse: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "standard" },
    capablanca: { geom: 2 /* dim10x8 */, cg: "cg-640", board: "capablanca", pieces: "merida", css: "capablanca" },
    seirawan: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "seirawan" },
    standard: { geom: 0 /* dim8x8 */, cg: "cg-512", board: "brown", pieces: "merida", css: "standard" },
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

},{"chessgroundx/util":16}],30:[function(require,module,exports){
"use strict";
// https://stackoverflow.com/questions/20618355/the-simplest-possible-javascript-countdown-timer
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var props_1 = require("snabbdom/modules/props");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
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
    clock.el = patch(clock.el, snabbdom_1.h('div.clock', { class: { running: clock.running, hurry: time < 10000 } }, [
        snabbdom_1.h('div', parsed.minutes),
        snabbdom_1.h('div.clock.sep', { class: { running: clock.running, hurry: time < 10000, low: millis < 500 } }, ':'),
        snabbdom_1.h('div', parsed.seconds),
    ]));
}
exports.renderTime = renderTime;

},{"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],31:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var h_1 = require("snabbdom/h");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var props_1 = require("snabbdom/modules/props");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
var util_1 = require("chessgroundx/util");
var chessgroundx_1 = require("chessgroundx");
var types_1 = require("chessgroundx/types");
var clock_1 = require("./clock");
var gating_1 = require("./gating");
var promotion_1 = require("./promotion");
var pocket_1 = require("./pocket");
var sound_1 = require("./sound");
var chess_1 = require("./chess");
var user_1 = require("./user");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var RoundController = /** @class */ (function () {
    function RoundController(el, model) {
        var _this = this;
        this.getGround = function () { return _this.chessground; };
        this.getDests = function () { return _this.dests; };
        this.redraw = function () { return false; };
        this.onMsgGameStart = function (msg) {
            // console.log("got gameStart msg:", msg);
            if (msg.gameId !== _this.model["gameId"])
                return;
            if (!_this.spectator)
                sound_1.sound.genericNotify();
        };
        this.newOpponent = function (home) {
            window.location.assign(home);
        };
        this.gameOver = function () {
            _this.controls = patch(_this.controls, h_1.h('div'));
            var container = document.getElementById('result');
            patch(container, h_1.h('result', _this.result));
            if (!_this.spectator) {
                var container = document.getElementById('after-game');
                // TODO: rematch button
                patch(container, h_1.h('button', { on: { click: function () { return _this.newOpponent(_this.model["home"]); } } }, "New opponent"));
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
            _this.fullfen = msg.fen;
            _this.dests = msg.dests;
            var clocks = msg.clocks;
            var parts = msg.fen.split(" ");
            _this.turnColor = parts[1] === "w" ? "white" : "black";
            _this.abortable = Number(parts[parts.length - 1]) <= 1;
            if (!_this.spectator && !_this.abortable) {
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
            console.log("...", msg.lastMove, lastMove);
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
                }
                ;
            }
            ;
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
                // we want to know lastMove and check status
                _this.doSend({ type: "board", gameId: _this.model["gameId"] });
            }
            else {
                _this.doSend({ type: "ready", gameId: _this.model["gameId"] });
                _this.doSend({ type: "board", gameId: _this.model["gameId"] });
            }
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
            }
        };
        // TODO: use auto reconnecting sockette in lobby and round ctrl
        try {
            this.sock = new WebSocket("ws://" + location.host + "/ws");
        }
        catch (err) {
            this.sock = new WebSocket("wss://" + location.host + "/ws");
        }
        this.sock.onmessage = function (evt) { _this.onMessage(evt); };
        this.model = model;
        this.variant = model["variant"];
        this.fullfen = model["fen"];
        this.wplayer = model["wplayer"];
        this.bplayer = model["bplayer"];
        this.base = model["base"];
        this.inc = model["inc"];
        this.tv = model["tv"];
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
        this.chessground = chessgroundx_1.Chessground(el, {
            fen: fen_placement,
            geometry: chess_1.VARIANTS[this.variant].geom,
            orientation: this.mycolor,
            turnColor: this.turnColor,
            animation: {
                enabled: true,
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
        // render game data
        var container = document.getElementById('result');
        patch(container, h_1.h('div#result', this.variant));
        // flip
        // TODO: clocks
        var toggleOrientation = function () {
            _this.flip = !_this.flip;
            _this.chessground.toggleOrientation();
            if (_this.variant === "shogi") {
                var color = _this.chessground.state.orientation === "white" ? "white" : "black";
                _this.setPieceColors(color);
            }
            ;
            console.log("FLIP");
            if (chess_1.needPockets(_this.variant)) {
                var tmp = _this.pockets[0];
                _this.pockets[0] = _this.pockets[1];
                _this.pockets[1] = tmp;
                _this.vpocket0 = patch(_this.vpocket0, pocket_1.pocketView(_this, _this.flip ? _this.mycolor : _this.oppcolor, "top"));
                _this.vpocket1 = patch(_this.vpocket1, pocket_1.pocketView(_this, _this.flip ? _this.oppcolor : _this.mycolor, "bottom"));
            }
        };
        // TODO: add dark/light theme buttons (icon-sun-o/icon-moon-o)
        // TODO: add western pieces theme button for xiangqui, shogi, makruk, sittuyin
        var container = document.getElementById('btn-flip');
        patch(container, h_1.h('button', { on: { click: function () { return toggleOrientation(); } }, props: { title: 'Flip board' } }, [h_1.h('i', { class: { "icon": true, "icon-refresh": true } }),]));
        var container = document.getElementById('zoom');
        var setZoom = function (zoom) {
            var el = document.querySelector('.cg-board-wrap');
            if (el) {
                var baseWidth = types_1.dimensions[chess_1.VARIANTS[_this.variant].geom].width * (_this.variant === "shogi" ? 52 : 64);
                var baseHeight = types_1.dimensions[chess_1.VARIANTS[_this.variant].geom].height * (_this.variant === "shogi" ? 60 : 64);
                var pxw = zoom / 100 * baseWidth + "px";
                var pxh = zoom / 100 * baseHeight + "px";
                el.style.width = pxw;
                el.style.height = pxh;
                var ev = document.createEvent('Event');
                ev.initEvent('chessground.resize', false, false);
                document.body.dispatchEvent(ev);
            }
        };
        patch(container, h_1.h('input', {
            attrs: { width: '280px', type: 'range', value: 100, min: 50, max: 150 },
            on: { input: function (e) { setZoom(parseFloat(e.target.value)); } }
        }));
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
        var container = document.getElementById('game-controls');
        if (!this.spectator) {
            this.controls = patch(container, h_1.h('div', [
                h_1.h('button#abort', { on: { click: function () { return abort(); } }, props: { title: 'Abort' } }, [h_1.h('i', { class: { "icon": true, "icon-times": true } }),]),
                h_1.h('button#draw', { on: { click: function () { return draw(); } }, props: { title: "Draw" } }, [h_1.h('i', { class: { "icon": true, "icon-hand-paper-o": true } }),]),
                h_1.h('button#resign', { on: { click: function () { return resign(); } }, props: { title: "Resign" } }, [h_1.h('i', { class: { "icon": true, "icon-flag-o": true } }),]),
            ]));
        }
        else {
            this.controls = patch(container, h_1.h('div'));
        }
        var onOpen = function (evt) {
            console.log("ctrl.onOpen()", evt);
            _this.doSend({ type: "game_user_connected", gameId: _this.model["gameId"] });
        };
        this.sock.onopen = function (evt) { onOpen(evt); };
    }
    return RoundController;
}());
exports.default = RoundController;

},{"./chess":29,"./clock":30,"./gating":32,"./pocket":35,"./promotion":36,"./sound":39,"./user":40,"chessgroundx":4,"chessgroundx/types":15,"chessgroundx/util":16,"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],32:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
var tovnode_1 = require("snabbdom/tovnode");
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
        // console.log("canGate() returned:", gatable);
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
        var container = tovnode_1.default(document.querySelector('.extension'));
        patch(container, renderGating(origs, color, orientation));
    }
    function draw_no_gating() {
        var container = document.getElementById('extension_choice');
        patch(container, snabbdom_1.h('div.extension'));
    }
    function finish(role, index) {
        if (gating) {
            draw_no_gating();
            gate(ctrl, gating.origs[index], gating.dest, role);
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

},{"./chess":29,"./pocket":35,"chessgroundx/util":16,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/tovnode":27}],33:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var props_1 = require("snabbdom/modules/props");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var h_1 = require("snabbdom/h");
var user_1 = require("./user");
var chess_1 = require("./chess");
exports.ACCEPT = Symbol("Accept");
exports.ADD = Symbol('Add');
exports.DELETE = Symbol('Delete');
exports.UPDATE = Symbol('Update');
exports.RESET = Symbol('Reset');
var LobbyController = /** @class */ (function () {
    function LobbyController(el, model, handler) {
        var _this = this;
        this.onMsgGetSeeks = function (msg) {
            // console.log("!!!! got get_seeks msg:", msg);
            var oldVNode = document.getElementById('seeks');
            if (oldVNode instanceof Element) {
                oldVNode.innerHTML = '';
                patch(oldVNode, h_1.default('table#seeks', _this.renderSeeks(msg.seeks)));
            }
        };
        this.onMsgCreateSeek = function (msg) {
            // console.log("!! got create_seek msg:", msg);
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
            _this.evtHandler({ type: exports.ACCEPT });
        };
        this.onMsgUserConnected = function (msg) {
            _this.model["username"] = msg["username"];
            user_1.renderUsername(_this.model["home"], _this.model["username"]);
        };
        console.log("LobbyController constructor", el, model);
        // TODO: use auto reconnecting sockette in lobby and round ctrl
        try {
            this.sock = new WebSocket("ws://" + location.host + "/ws");
        }
        catch (err) {
            this.sock = new WebSocket("wss://" + location.host + "/ws");
        }
        this.model = model;
        this.evtHandler = handler;
        var onOpen = function (evt) {
            console.log("---CONNECTED", evt);
            _this.doSend({ type: "lobby_user_connected" });
            _this.doSend({ type: "get_seeks" });
        };
        this.sock.onopen = function (evt) { onOpen(evt); };
        this.sock.onclose = function (evt) {
            console.log("---DISCONNECTED", evt.code, evt.reason);
            _this.doSend({ type: "close" });
        };
        this.sock.onerror = function (evt) { console.log("---ERROR:", evt.data); };
        this.sock.onmessage = function (evt) { _this.onMessage(evt); };
        // get seeks when we are coming back after a game
        if (this.sock.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        }
        ;
        patch(document.getElementById('seekbuttons'), h_1.default('ul#seekbuttons', this.renderSeekButtons()));
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
            color: color
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
        this.createSeekMsg(variant, color, fen, minutes, increment);
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
                        h_1.default('h2', "Create a game"),
                        h_1.default('label', { props: { for: "variant" } }, "Variant"),
                        h_1.default('select#variant', { props: { name: "variant" } }, chess_1.variants.map(function (variant) { return h_1.default('option', { props: { value: variant } }, variant); })),
                        h_1.default('label', { props: { for: "fen" } }, "Start position"),
                        h_1.default('input#fen', { props: { name: 'fen', placeholder: 'Paste the FEN text here' } }),
                        h_1.default('label', { props: { for: "tc" } }, "Time Control"),
                        h_1.default('select#timecontrol', { props: { name: "timecontrol" } }, [
                            h_1.default('option', { props: { value: "1", selected: true } }, "Real time"),
                            h_1.default('option', { props: { value: "2" } }, "Unlimited"),
                        ]),
                        h_1.default('label', { props: { for: "min" } }, "Minutes per side:"),
                        h_1.default('span#minutes'),
                        h_1.default('input#min', {
                            attrs: { name: "min", type: "range", min: 0, max: 180, value: 3 },
                            on: { input: function (e) { setMinutes(e.target.value); } }
                        }),
                        h_1.default('label', { props: { for: "inc" } }, "Increment in seconds:"),
                        h_1.default('span#increment'),
                        h_1.default('input#inc', {
                            attrs: { name: "inc", type: "range", min: 0, max: 180, value: 2 },
                            on: { input: function (e) { setIncrement(e.target.value); } }
                        }),
                        // if play with the machine
                        // A.I.Level (1-8 buttons)
                        h_1.default('button.icon.icon-circle', { props: { type: "button", title: "Black" }, on: { click: function () { return _this.createSeek('b'); } } }),
                        h_1.default('button.icon.icon-adjust', { props: { type: "button", title: "Random" }, on: { click: function () { return _this.createSeek('r'); } } }),
                        h_1.default('button.icon.icon-circle-o', { props: { type: "button", title: "White" }, on: { click: function () { return _this.createSeek('w'); } } }),
                    ]),
                ]),
            ]),
            h_1.default('button', { class: { 'button': true }, on: { click: function () { return document.getElementById('id01').style.display = 'block'; } } }, "Create a game"),
            h_1.default('button', { class: { 'button': true }, on: { click: function () { return document.getElementById('id01').style.display = 'block'; } } }, "Play with the machine"),
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
            case "create_seek":
                this.onMsgCreateSeek(msg);
                break;
            case "accept_seek":
                this.onMsgAcceptSeek(msg);
                break;
            case "lobby_user_connected":
                this.onMsgUserConnected(msg);
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
    return h_1.default('div.columns', [
        h_1.default('main.main', [h_1.default('table#seeks', { hook: { insert: function (vnode) { return runSeeks(vnode, model, handler); } } })]),
        h_1.default('aside.sidebar-first', ""),
        h_1.default('aside.sidebar-second', [h_1.default('ul#seekbuttons')]),
    ]);
}
exports.lobbyView = lobbyView;

},{"./chess":29,"./user":40,"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],34:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var props_1 = require("snabbdom/modules/props");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var site_1 = require("./site");
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

},{"./site":38,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],35:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var props_1 = require("snabbdom/modules/props");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
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

},{"./chess":29,"chessgroundx/drag":6,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}],36:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
var tovnode_1 = require("snabbdom/tovnode");
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
        var container = tovnode_1.default(document.querySelector('.extension'));
        patch(container, renderPromotion(dest, color, orientation));
    }
    function draw_no_promo() {
        var container = document.getElementById('extension_choice');
        patch(container, snabbdom_1.h('div.extension'));
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

},{"./chess":29,"chessgroundx/util":16,"snabbdom":25,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/tovnode":27}],37:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var ctrl_1 = require("./ctrl");
var chess_1 = require("./chess");
exports.BACK = Symbol('Back');
// export const RESIGN = Symbol('Resign');
function runGround(vnode, model) {
    var el = vnode.elm;
    var ctrl = new ctrl_1.default(el, model);
    var cg = ctrl.chessground;
    window['cg'] = cg;
}
function roundView(model, handler) {
    console.log(".......roundView(model, handler)", model, handler);
    var playerTop, playerBottom;
    if (model["username"] !== model["wplayer"] && model["username"] !== model["bplayer"]) {
        // spectator game view
        playerTop = model["variant"] === 'shogi' ? model["wplayer"] : model["bplayer"];
        playerBottom = model["variant"] === 'shogi' ? model["bplayer"] : model["wplayer"];
    }
    else {
        playerTop = model["username"] === model["wplayer"] ? model["bplayer"] : model["wplayer"];
        playerBottom = model["username"];
    }
    return snabbdom_1.h('div.columns', [
        snabbdom_1.h('main.main', [
            snabbdom_1.h("selection." + chess_1.VARIANTS[model["variant"]].board + "." + chess_1.VARIANTS[model["variant"]].pieces, [
                snabbdom_1.h("div.cg-board-wrap." + chess_1.VARIANTS[model["variant"]].cg, { hook: { insert: function (vnode) { return runGround(vnode, model); } },
                }),
            ]),
        ]),
        snabbdom_1.h('aside.sidebar-first', ""),
        snabbdom_1.h('aside.sidebar-second', [
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h("div." + chess_1.VARIANTS[model["variant"]].pieces, [
                    snabbdom_1.h('div.cg-board-wrap.pocket', [
                        snabbdom_1.h('div#pocket0'),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#clock0'),
            snabbdom_1.h('h1', playerTop + " (1500?)"),
            snabbdom_1.h('div#result'),
            snabbdom_1.h('div#after-game'),
            snabbdom_1.h('div#game-controls'),
            snabbdom_1.h('h1', playerBottom + " (1500?)"),
            snabbdom_1.h('div#clock1'),
            snabbdom_1.h('div#pocket-wrapper', [
                snabbdom_1.h("div." + chess_1.VARIANTS[model["variant"]].pieces, [
                    snabbdom_1.h('div.cg-board-wrap.pocket', [
                        snabbdom_1.h('div#pocket1'),
                    ]),
                ]),
            ]),
            snabbdom_1.h('div#flip'),
            snabbdom_1.h('div#zoom'),
        ]),
    ]);
}
exports.roundView = roundView;

},{"./chess":29,"./ctrl":31,"snabbdom":25}],38:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var h_1 = require("snabbdom/h");
var lobby_1 = require("./lobby");
var round_1 = require("./round");
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
    return h_1.default('div#placeholder.main-wrapper', [
        h_1.default('section.content', [model.variant ? round_1.roundView(model, handler) : lobby_1.lobbyView(model, handler),]),
    ]);
}
exports.view = view;
function init() {
    return { home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "" };
}
function update(model, action) {
    return action.type === lobby_1.ACCEPT ?
        { home: model["home"], username: model["username"], variant: model["variant"], gameId: model["gameId"], wplayer: model["wplayer"], bplayer: model["bplayer"], fen: model["fen"], base: model["base"], inc: model["inc"], seeks: [], tv: model["tv"] }
        : action.type === round_1.BACK ?
            { home: model["home"], username: model["username"], variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "" }
            : model;
}
exports.default = { view: view, init: init, update: update, actions: { ACCEPT: lobby_1.ACCEPT, BACK: round_1.BACK } };

},{"./lobby":33,"./round":37,"snabbdom/h":18}],39:[function(require,module,exports){
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

},{}],40:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var snabbdom_1 = require("snabbdom");
var class_1 = require("snabbdom/modules/class");
var attributes_1 = require("snabbdom/modules/attributes");
var props_1 = require("snabbdom/modules/props");
var eventlisteners_1 = require("snabbdom/modules/eventlisteners");
var patch = snabbdom_1.init([class_1.default, attributes_1.default, props_1.default, eventlisteners_1.default]);
var h_1 = require("snabbdom/h");
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

},{"snabbdom":25,"snabbdom/h":18,"snabbdom/modules/attributes":21,"snabbdom/modules/class":22,"snabbdom/modules/eventlisteners":23,"snabbdom/modules/props":24}]},{},[34])(34)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FuaW0uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2FwaS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvYm9hcmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2NoZXNzZ3JvdW5kLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9jb25maWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2RyYXcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L2V2ZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvZXhwbG9zaW9uLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5keC9mZW4uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3ByZW1vdmUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3JlbmRlci5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvc3RhdGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3N2Zy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZHgvdHlwZXMuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3V0aWwuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmR4L3dyYXAuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vaC5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9odG1sZG9tYXBpLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL2lzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL2NsYXNzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vbW9kdWxlcy9wcm9wcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9zbmFiYmRvbS5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90aHVuay5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS90b3Zub2RlLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL3Zub2RlLmpzIiwic3JjL2NoZXNzLnRzIiwic3JjL2Nsb2NrLnRzIiwic3JjL2N0cmwudHMiLCJzcmMvZ2F0aW5nLnRzIiwic3JjL2xvYmJ5LnRzIiwic3JjL21haW4udHMiLCJzcmMvcG9ja2V0LnRzIiwic3JjL3Byb21vdGlvbi50cyIsInNyYy9yb3VuZC50cyIsInNyYy9zaXRlLnRzIiwic3JjL3NvdW5kLnRzIiwic3JjL3VzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDck1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDVEEsMENBQTRDO0FBRy9CLFFB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ZkQsd0NBZUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBfX2Fzc2lnbiA9ICh0aGlzICYmIHRoaXMuX19hc3NpZ24pIHx8IGZ1bmN0aW9uICgpIHtcbiAgICBfX2Fzc2lnbiA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24odCkge1xuICAgICAgICBmb3IgKHZhciBzLCBpID0gMSwgbiA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHMgPSBhcmd1bWVudHNbaV07XG4gICAgICAgICAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkpXG4gICAgICAgICAgICAgICAgdFtwXSA9IHNbcF07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHQ7XG4gICAgfTtcbiAgICByZXR1cm4gX19hc3NpZ24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbn07XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiBhbmltKG11dGF0aW9uLCBzdGF0ZSkge1xuICAgIHJldHVybiBzdGF0ZS5hbmltYXRpb24uZW5hYmxlZCA/IGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSA6IHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpO1xufVxuZXhwb3J0cy5hbmltID0gYW5pbTtcbmZ1bmN0aW9uIHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpIHtcbiAgICB2YXIgcmVzdWx0ID0gbXV0YXRpb24oc3RhdGUpO1xuICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xufVxuZXhwb3J0cy5yZW5kZXIgPSByZW5kZXI7XG5mdW5jdGlvbiBtYWtlUGllY2Uoa2V5LCBwaWVjZSwgZmlyc3RSYW5rSXMwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHBvczogdXRpbC5rZXkycG9zKGtleSwgZmlyc3RSYW5rSXMwKSxcbiAgICAgICAgcGllY2U6IHBpZWNlXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGNsb3NlcihwaWVjZSwgcGllY2VzKSB7XG4gICAgcmV0dXJuIHBpZWNlcy5zb3J0KGZ1bmN0aW9uIChwMSwgcDIpIHtcbiAgICAgICAgcmV0dXJuIHV0aWwuZGlzdGFuY2VTcShwaWVjZS5wb3MsIHAxLnBvcykgLSB1dGlsLmRpc3RhbmNlU3EocGllY2UucG9zLCBwMi5wb3MpO1xuICAgIH0pWzBdO1xufVxuZnVuY3Rpb24gY29tcHV0ZVBsYW4ocHJldlBpZWNlcywgY3VycmVudCkge1xuICAgIHZhciBmaXJzdFJhbmtJczAgPSBjdXJyZW50LmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICB2YXIgYW5pbXMgPSB7fSwgYW5pbWVkT3JpZ3MgPSBbXSwgZmFkaW5ncyA9IHt9LCBtaXNzaW5ncyA9IFtdLCBuZXdzID0gW10sIHByZVBpZWNlcyA9IHt9O1xuICAgIHZhciBjdXJQLCBwcmVQLCBpLCB2ZWN0b3I7XG4gICAgZm9yIChpIGluIHByZXZQaWVjZXMpIHtcbiAgICAgICAgcHJlUGllY2VzW2ldID0gbWFrZVBpZWNlKGksIHByZXZQaWVjZXNbaV0sIGZpcnN0UmFua0lzMCk7XG4gICAgfVxuICAgIGZvciAodmFyIF9pID0gMCwgX2EgPSB1dGlsLmFsbEtleXNbY3VycmVudC5nZW9tZXRyeV07IF9pIDwgX2EubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgIHZhciBrZXkgPSBfYVtfaV07XG4gICAgICAgIGN1clAgPSBjdXJyZW50LnBpZWNlc1trZXldO1xuICAgICAgICBwcmVQID0gcHJlUGllY2VzW2tleV07XG4gICAgICAgIGlmIChjdXJQKSB7XG4gICAgICAgICAgICBpZiAocHJlUCkge1xuICAgICAgICAgICAgICAgIGlmICghdXRpbC5zYW1lUGllY2UoY3VyUCwgcHJlUC5waWVjZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgbWlzc2luZ3MucHVzaChwcmVQKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3cy5wdXNoKG1ha2VQaWVjZShrZXksIGN1clAsIGZpcnN0UmFua0lzMCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBuZXdzLnB1c2gobWFrZVBpZWNlKGtleSwgY3VyUCwgZmlyc3RSYW5rSXMwKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJlUClcbiAgICAgICAgICAgIG1pc3NpbmdzLnB1c2gocHJlUCk7XG4gICAgfVxuICAgIG5ld3MuZm9yRWFjaChmdW5jdGlvbiAobmV3UCkge1xuICAgICAgICBwcmVQID0gY2xvc2VyKG5ld1AsIG1pc3NpbmdzLmZpbHRlcihmdW5jdGlvbiAocCkgeyByZXR1cm4gdXRpbC5zYW1lUGllY2UobmV3UC5waWVjZSwgcC5waWVjZSk7IH0pKTtcbiAgICAgICAgaWYgKHByZVApIHtcbiAgICAgICAgICAgIHZlY3RvciA9IFtwcmVQLnBvc1swXSAtIG5ld1AucG9zWzBdLCBwcmVQLnBvc1sxXSAtIG5ld1AucG9zWzFdXTtcbiAgICAgICAgICAgIGFuaW1zW25ld1Aua2V5XSA9IHZlY3Rvci5jb25jYXQodmVjdG9yKTtcbiAgICAgICAgICAgIGFuaW1lZE9yaWdzLnB1c2gocHJlUC5rZXkpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgbWlzc2luZ3MuZm9yRWFjaChmdW5jdGlvbiAocCkge1xuICAgICAgICBpZiAoIXV0aWwuY29udGFpbnNYKGFuaW1lZE9yaWdzLCBwLmtleSkpXG4gICAgICAgICAgICBmYWRpbmdzW3Aua2V5XSA9IHAucGllY2U7XG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYW5pbXM6IGFuaW1zLFxuICAgICAgICBmYWRpbmdzOiBmYWRpbmdzXG4gICAgfTtcbn1cbnZhciBwZXJmID0gd2luZG93LnBlcmZvcm1hbmNlICE9PSB1bmRlZmluZWQgPyB3aW5kb3cucGVyZm9ybWFuY2UgOiBEYXRlO1xuZnVuY3Rpb24gc3RlcChzdGF0ZSwgbm93KSB7XG4gICAgdmFyIGN1ciA9IHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50O1xuICAgIGlmIChjdXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoIXN0YXRlLmRvbS5kZXN0cm95ZWQpXG4gICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHJlc3QgPSAxIC0gKG5vdyAtIGN1ci5zdGFydCkgKiBjdXIuZnJlcXVlbmN5O1xuICAgIGlmIChyZXN0IDw9IDApIHtcbiAgICAgICAgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3coKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBlYXNlID0gZWFzaW5nKHJlc3QpO1xuICAgICAgICBmb3IgKHZhciBpIGluIGN1ci5wbGFuLmFuaW1zKSB7XG4gICAgICAgICAgICB2YXIgY2ZnID0gY3VyLnBsYW4uYW5pbXNbaV07XG4gICAgICAgICAgICBjZmdbMl0gPSBjZmdbMF0gKiBlYXNlO1xuICAgICAgICAgICAgY2ZnWzNdID0gY2ZnWzFdICogZWFzZTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KHRydWUpO1xuICAgICAgICB1dGlsLnJhZihmdW5jdGlvbiAobm93KSB7XG4gICAgICAgICAgICBpZiAobm93ID09PSB2b2lkIDApIHsgbm93ID0gcGVyZi5ub3coKTsgfVxuICAgICAgICAgICAgcmV0dXJuIHN0ZXAoc3RhdGUsIG5vdyk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSB7XG4gICAgdmFyIHByZXZQaWVjZXMgPSBfX2Fzc2lnbih7fSwgc3RhdGUucGllY2VzKTtcbiAgICB2YXIgcmVzdWx0ID0gbXV0YXRpb24oc3RhdGUpO1xuICAgIHZhciBwbGFuID0gY29tcHV0ZVBsYW4ocHJldlBpZWNlcywgc3RhdGUpO1xuICAgIGlmICghaXNPYmplY3RFbXB0eShwbGFuLmFuaW1zKSB8fCAhaXNPYmplY3RFbXB0eShwbGFuLmZhZGluZ3MpKSB7XG4gICAgICAgIHZhciBhbHJlYWR5UnVubmluZyA9IHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ICYmIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50LnN0YXJ0O1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiBwZXJmLm5vdygpLFxuICAgICAgICAgICAgZnJlcXVlbmN5OiAxIC8gc3RhdGUuYW5pbWF0aW9uLmR1cmF0aW9uLFxuICAgICAgICAgICAgcGxhbjogcGxhblxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWFscmVhZHlSdW5uaW5nKVxuICAgICAgICAgICAgc3RlcChzdGF0ZSwgcGVyZi5ub3coKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiBpc09iamVjdEVtcHR5KG8pIHtcbiAgICBmb3IgKHZhciBfIGluIG8pXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGVhc2luZyh0KSB7XG4gICAgcmV0dXJuIHQgPCAwLjUgPyA0ICogdCAqIHQgKiB0IDogKHQgLSAxKSAqICgyICogdCAtIDIpICogKDIgKiB0IC0gMikgKyAxO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgYm9hcmQgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbnZhciBmZW5fMSA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbnZhciBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbnZhciBhbmltXzEgPSByZXF1aXJlKFwiLi9hbmltXCIpO1xudmFyIGRyYWdfMSA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG52YXIgZXhwbG9zaW9uXzEgPSByZXF1aXJlKFwiLi9leHBsb3Npb25cIik7XG5mdW5jdGlvbiBzdGFydChzdGF0ZSwgcmVkcmF3QWxsKSB7XG4gICAgZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24oKSB7XG4gICAgICAgIGJvYXJkLnRvZ2dsZU9yaWVudGF0aW9uKHN0YXRlKTtcbiAgICAgICAgcmVkcmF3QWxsKCk7XG4gICAgfVxuICAgIDtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgICAgIGlmIChjb25maWcub3JpZW50YXRpb24gJiYgY29uZmlnLm9yaWVudGF0aW9uICE9PSBzdGF0ZS5vcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB0b2dnbGVPcmllbnRhdGlvbigpO1xuICAgICAgICAgICAgKGNvbmZpZy5mZW4gPyBhbmltXzEuYW5pbSA6IGFuaW1fMS5yZW5kZXIpKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gY29uZmlnXzEuY29uZmlndXJlKHN0YXRlLCBjb25maWcpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgICAgZ2V0RmVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiBmZW5fMS53cml0ZShzdGF0ZS5waWVjZXMsIHN0YXRlLmdlb21ldHJ5KTsgfSxcbiAgICAgICAgdG9nZ2xlT3JpZW50YXRpb246IHRvZ2dsZU9yaWVudGF0aW9uLFxuICAgICAgICBzZXRQaWVjZXM6IGZ1bmN0aW9uIChwaWVjZXMpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gYm9hcmQuc2V0UGllY2VzKHN0YXRlLCBwaWVjZXMpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdFNxdWFyZTogZnVuY3Rpb24gKGtleSwgZm9yY2UpIHtcbiAgICAgICAgICAgIGlmIChrZXkpXG4gICAgICAgICAgICAgICAgYW5pbV8xLmFuaW0oZnVuY3Rpb24gKHN0YXRlKSB7IHJldHVybiBib2FyZC5zZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpOyB9LCBzdGF0ZSk7XG4gICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5zZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGJvYXJkLnVuc2VsZWN0KHN0YXRlKTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG1vdmU6IGZ1bmN0aW9uIChvcmlnLCBkZXN0KSB7XG4gICAgICAgICAgICBhbmltXzEuYW5pbShmdW5jdGlvbiAoc3RhdGUpIHsgcmV0dXJuIGJvYXJkLmJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTsgfSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBuZXdQaWVjZTogZnVuY3Rpb24gKHBpZWNlLCBrZXkpIHtcbiAgICAgICAgICAgIGFuaW1fMS5hbmltKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gYm9hcmQuYmFzZU5ld1BpZWNlKHN0YXRlLCBwaWVjZSwga2V5KTsgfSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBwbGF5UHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnByZW1vdmFibGUuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIGlmIChhbmltXzEuYW5pbShib2FyZC5wbGF5UHJlbW92ZSwgc3RhdGUpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgIHBsYXlQcmVkcm9wOiBmdW5jdGlvbiAodmFsaWRhdGUpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5wcmVkcm9wcGFibGUuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBib2FyZC5wbGF5UHJlZHJvcChzdGF0ZSwgdmFsaWRhdGUpO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxQcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGJvYXJkLnVuc2V0UHJlbW92ZSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxQcmVkcm9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGJvYXJkLnVuc2V0UHJlZHJvcCwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxNb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGZ1bmN0aW9uIChzdGF0ZSkgeyBib2FyZC5jYW5jZWxNb3ZlKHN0YXRlKTsgZHJhZ18xLmNhbmNlbChzdGF0ZSk7IH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihmdW5jdGlvbiAoc3RhdGUpIHsgYm9hcmQuc3RvcChzdGF0ZSk7IGRyYWdfMS5jYW5jZWwoc3RhdGUpOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGV4cGxvZGU6IGZ1bmN0aW9uIChrZXlzKSB7XG4gICAgICAgICAgICBleHBsb3Npb25fMS5kZWZhdWx0KHN0YXRlLCBrZXlzKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0QXV0b1NoYXBlczogZnVuY3Rpb24gKHNoYXBlcykge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihmdW5jdGlvbiAoc3RhdGUpIHsgcmV0dXJuIHN0YXRlLmRyYXdhYmxlLmF1dG9TaGFwZXMgPSBzaGFwZXM7IH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0U2hhcGVzOiBmdW5jdGlvbiAoc2hhcGVzKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGZ1bmN0aW9uIChzdGF0ZSkgeyByZXR1cm4gc3RhdGUuZHJhd2FibGUuc2hhcGVzID0gc2hhcGVzOyB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEtleUF0RG9tUG9zOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgICAgICByZXR1cm4gYm9hcmQuZ2V0S2V5QXREb21Qb3MocG9zLCBzdGF0ZS5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgc3RhdGUuZG9tLmJvdW5kcygpLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZHJhd0FsbDogcmVkcmF3QWxsLFxuICAgICAgICBkcmFnTmV3UGllY2U6IGZ1bmN0aW9uIChwaWVjZSwgZXZlbnQsIGZvcmNlKSB7XG4gICAgICAgICAgICBkcmFnXzEuZHJhZ05ld1BpZWNlKHN0YXRlLCBwaWVjZSwgZXZlbnQsIGZvcmNlKTtcbiAgICAgICAgfSxcbiAgICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgYm9hcmQuc3RvcChzdGF0ZSk7XG4gICAgICAgICAgICBzdGF0ZS5kb20udW5iaW5kICYmIHN0YXRlLmRvbS51bmJpbmQoKTtcbiAgICAgICAgICAgIHN0YXRlLmRvbS5kZXN0cm95ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgcHJlbW92ZV8xID0gcmVxdWlyZShcIi4vcHJlbW92ZVwiKTtcbnZhciBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZnVuY3Rpb24gY2FsbFVzZXJGdW5jdGlvbihmKSB7XG4gICAgdmFyIGFyZ3MgPSBbXTtcbiAgICBmb3IgKHZhciBfaSA9IDE7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xuICAgICAgICBhcmdzW19pIC0gMV0gPSBhcmd1bWVudHNbX2ldO1xuICAgIH1cbiAgICBpZiAoZilcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBmLmFwcGx5KHZvaWQgMCwgYXJncyk7IH0sIDEpO1xufVxuZXhwb3J0cy5jYWxsVXNlckZ1bmN0aW9uID0gY2FsbFVzZXJGdW5jdGlvbjtcbmZ1bmN0aW9uIHRvZ2dsZU9yaWVudGF0aW9uKHN0YXRlKSB7XG4gICAgc3RhdGUub3JpZW50YXRpb24gPSB1dGlsXzEub3Bwb3NpdGUoc3RhdGUub3JpZW50YXRpb24pO1xuICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID1cbiAgICAgICAgc3RhdGUuZHJhZ2dhYmxlLmN1cnJlbnQgPVxuICAgICAgICAgICAgc3RhdGUuc2VsZWN0ZWQgPSB1bmRlZmluZWQ7XG59XG5leHBvcnRzLnRvZ2dsZU9yaWVudGF0aW9uID0gdG9nZ2xlT3JpZW50YXRpb247XG5mdW5jdGlvbiByZXNldChzdGF0ZSkge1xuICAgIHN0YXRlLmxhc3RNb3ZlID0gdW5kZWZpbmVkO1xuICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG59XG5leHBvcnRzLnJlc2V0ID0gcmVzZXQ7XG5mdW5jdGlvbiBzZXRQaWVjZXMoc3RhdGUsIHBpZWNlcykge1xuICAgIGZvciAodmFyIGtleSBpbiBwaWVjZXMpIHtcbiAgICAgICAgdmFyIHBpZWNlID0gcGllY2VzW2tleV07XG4gICAgICAgIGlmIChwaWVjZSlcbiAgICAgICAgICAgIHN0YXRlLnBpZWNlc1trZXldID0gcGllY2U7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNba2V5XTtcbiAgICB9XG59XG5leHBvcnRzLnNldFBpZWNlcyA9IHNldFBpZWNlcztcbmZ1bmN0aW9uIHNldENoZWNrKHN0YXRlLCBjb2xvcikge1xuICAgIHN0YXRlLmNoZWNrID0gdW5kZWZpbmVkO1xuICAgIGlmIChjb2xvciA9PT0gdHJ1ZSlcbiAgICAgICAgY29sb3IgPSBzdGF0ZS50dXJuQ29sb3I7XG4gICAgaWYgKGNvbG9yKVxuICAgICAgICBmb3IgKHZhciBrIGluIHN0YXRlLnBpZWNlcykge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnBpZWNlc1trXS5yb2xlID09PSAna2luZycgJiYgc3RhdGUucGllY2VzW2tdLmNvbG9yID09PSBjb2xvcikge1xuICAgICAgICAgICAgICAgIHN0YXRlLmNoZWNrID0gaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxufVxuZXhwb3J0cy5zZXRDaGVjayA9IHNldENoZWNrO1xuZnVuY3Rpb24gc2V0UHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCwgbWV0YSkge1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgc3RhdGUucHJlbW92YWJsZS5jdXJyZW50ID0gW29yaWcsIGRlc3RdO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUucHJlbW92YWJsZS5ldmVudHMuc2V0LCBvcmlnLCBkZXN0LCBtZXRhKTtcbn1cbmZ1bmN0aW9uIHVuc2V0UHJlbW92ZShzdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5wcmVtb3ZhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgc3RhdGUucHJlbW92YWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZW1vdmFibGUuZXZlbnRzLnVuc2V0KTtcbiAgICB9XG59XG5leHBvcnRzLnVuc2V0UHJlbW92ZSA9IHVuc2V0UHJlbW92ZTtcbmZ1bmN0aW9uIHNldFByZWRyb3Aoc3RhdGUsIHJvbGUsIGtleSkge1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgc3RhdGUucHJlZHJvcHBhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIHJvbGU6IHJvbGUsXG4gICAgICAgIGtleToga2V5XG4gICAgfTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZWRyb3BwYWJsZS5ldmVudHMuc2V0LCByb2xlLCBrZXkpO1xufVxuZnVuY3Rpb24gdW5zZXRQcmVkcm9wKHN0YXRlKSB7XG4gICAgdmFyIHBkID0gc3RhdGUucHJlZHJvcHBhYmxlO1xuICAgIGlmIChwZC5jdXJyZW50KSB7XG4gICAgICAgIHBkLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIGNhbGxVc2VyRnVuY3Rpb24ocGQuZXZlbnRzLnVuc2V0KTtcbiAgICB9XG59XG5leHBvcnRzLnVuc2V0UHJlZHJvcCA9IHVuc2V0UHJlZHJvcDtcbmZ1bmN0aW9uIHRyeUF1dG9DYXN0bGUoc3RhdGUsIG9yaWcsIGRlc3QpIHtcbiAgICBpZiAoIXN0YXRlLmF1dG9DYXN0bGUpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIga2luZyA9IHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICBpZiAoIWtpbmcgfHwga2luZy5yb2xlICE9PSAna2luZycpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIgZmlyc3RSYW5rSXMwID0gc3RhdGUuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIHZhciBvcmlnUG9zID0gdXRpbF8xLmtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKTtcbiAgICBpZiAob3JpZ1Bvc1swXSAhPT0gNSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChvcmlnUG9zWzFdICE9PSAxICYmIG9yaWdQb3NbMV0gIT09IDgpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIgZGVzdFBvcyA9IHV0aWxfMS5rZXkycG9zKGRlc3QsIGZpcnN0UmFua0lzMCk7XG4gICAgdmFyIG9sZFJvb2tQb3MsIG5ld1Jvb2tQb3MsIG5ld0tpbmdQb3M7XG4gICAgaWYgKGRlc3RQb3NbMF0gPT09IDcgfHwgZGVzdFBvc1swXSA9PT0gOCkge1xuICAgICAgICBvbGRSb29rUG9zID0gdXRpbF8xLnBvczJrZXkoWzgsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIG5ld1Jvb2tQb3MgPSB1dGlsXzEucG9zMmtleShbNiwgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgbmV3S2luZ1BvcyA9IHV0aWxfMS5wb3Mya2V5KFs3LCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgIH1cbiAgICBlbHNlIGlmIChkZXN0UG9zWzBdID09PSAzIHx8IGRlc3RQb3NbMF0gPT09IDEpIHtcbiAgICAgICAgb2xkUm9va1BvcyA9IHV0aWxfMS5wb3Mya2V5KFsxLCBvcmlnUG9zWzFdXSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgICAgICBuZXdSb29rUG9zID0gdXRpbF8xLnBvczJrZXkoWzQsIG9yaWdQb3NbMV1dLCBzdGF0ZS5nZW9tZXRyeSk7XG4gICAgICAgIG5ld0tpbmdQb3MgPSB1dGlsXzEucG9zMmtleShbMywgb3JpZ1Bvc1sxXV0sIHN0YXRlLmdlb21ldHJ5KTtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgdmFyIHJvb2sgPSBzdGF0ZS5waWVjZXNbb2xkUm9va1Bvc107XG4gICAgaWYgKCFyb29rIHx8IHJvb2sucm9sZSAhPT0gJ3Jvb2snKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICBkZWxldGUgc3RhdGUucGllY2VzW29sZFJvb2tQb3NdO1xuICAgIHN0YXRlLnBpZWNlc1tuZXdLaW5nUG9zXSA9IGtpbmc7XG4gICAgc3RhdGUucGllY2VzW25ld1Jvb2tQb3NdID0gcm9vaztcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgdmFyIG9yaWdQaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXSwgZGVzdFBpZWNlID0gc3RhdGUucGllY2VzW2Rlc3RdO1xuICAgIGlmIChvcmlnID09PSBkZXN0IHx8ICFvcmlnUGllY2UpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB2YXIgY2FwdHVyZWQgPSAoZGVzdFBpZWNlICYmIGRlc3RQaWVjZS5jb2xvciAhPT0gb3JpZ1BpZWNlLmNvbG9yKSA/IGRlc3RQaWVjZSA6IHVuZGVmaW5lZDtcbiAgICBpZiAoZGVzdCA9PSBzdGF0ZS5zZWxlY3RlZClcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLm1vdmUsIG9yaWcsIGRlc3QsIGNhcHR1cmVkKTtcbiAgICBpZiAoIXRyeUF1dG9DYXN0bGUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHN0YXRlLnBpZWNlc1tkZXN0XSA9IG9yaWdQaWVjZTtcbiAgICAgICAgZGVsZXRlIHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICB9XG4gICAgc3RhdGUubGFzdE1vdmUgPSBbb3JpZywgZGVzdF07XG4gICAgc3RhdGUuY2hlY2sgPSB1bmRlZmluZWQ7XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5ldmVudHMuY2hhbmdlKTtcbiAgICByZXR1cm4gY2FwdHVyZWQgfHwgdHJ1ZTtcbn1cbmV4cG9ydHMuYmFzZU1vdmUgPSBiYXNlTW92ZTtcbmZ1bmN0aW9uIGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGtleSwgZm9yY2UpIHtcbiAgICBpZiAoc3RhdGUucGllY2VzW2tleV0pIHtcbiAgICAgICAgaWYgKGZvcmNlKVxuICAgICAgICAgICAgZGVsZXRlIHN0YXRlLnBpZWNlc1trZXldO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLmRyb3BOZXdQaWVjZSwgcGllY2UsIGtleSk7XG4gICAgc3RhdGUucGllY2VzW2tleV0gPSBwaWVjZTtcbiAgICBzdGF0ZS5sYXN0TW92ZSA9IFtrZXldO1xuICAgIHN0YXRlLmNoZWNrID0gdW5kZWZpbmVkO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLmNoYW5nZSk7XG4gICAgc3RhdGUubW92YWJsZS5kZXN0cyA9IHVuZGVmaW5lZDtcbiAgICBzdGF0ZS50dXJuQ29sb3IgPSB1dGlsXzEub3Bwb3NpdGUoc3RhdGUudHVybkNvbG9yKTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmV4cG9ydHMuYmFzZU5ld1BpZWNlID0gYmFzZU5ld1BpZWNlO1xuZnVuY3Rpb24gYmFzZVVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgdmFyIHJlc3VsdCA9IGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciA9IHV0aWxfMS5vcHBvc2l0ZShzdGF0ZS50dXJuQ29sb3IpO1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIHVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgaWYgKGNhbk1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBiYXNlVXNlck1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpO1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICB2YXIgaG9sZFRpbWUgPSBzdGF0ZS5ob2xkLnN0b3AoKTtcbiAgICAgICAgICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICAgICAgICAgIHZhciBtZXRhZGF0YSA9IHtcbiAgICAgICAgICAgICAgICBwcmVtb3ZlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdHJsS2V5OiBzdGF0ZS5zdGF0cy5jdHJsS2V5LFxuICAgICAgICAgICAgICAgIGhvbGRUaW1lOiBob2xkVGltZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlKVxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmNhcHR1cmVkID0gcmVzdWx0O1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlciwgb3JpZywgZGVzdCwgbWV0YWRhdGEpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoY2FuUHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgc2V0UHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCwge1xuICAgICAgICAgICAgY3RybEtleTogc3RhdGUuc3RhdHMuY3RybEtleVxuICAgICAgICB9KTtcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIH1cbiAgICBlbHNlIGlmIChpc01vdmFibGUoc3RhdGUsIGRlc3QpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwgZGVzdCkpIHtcbiAgICAgICAgc2V0U2VsZWN0ZWQoc3RhdGUsIGRlc3QpO1xuICAgICAgICBzdGF0ZS5ob2xkLnN0YXJ0KCk7XG4gICAgfVxuICAgIGVsc2VcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydHMudXNlck1vdmUgPSB1c2VyTW92ZTtcbmZ1bmN0aW9uIGRyb3BOZXdQaWVjZShzdGF0ZSwgb3JpZywgZGVzdCwgZm9yY2UpIHtcbiAgICBpZiAoY2FuRHJvcChzdGF0ZSwgb3JpZywgZGVzdCkgfHwgZm9yY2UpIHtcbiAgICAgICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgICAgICBkZWxldGUgc3RhdGUucGllY2VzW29yaWddO1xuICAgICAgICBiYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBkZXN0LCBmb3JjZSk7XG4gICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgcGllY2Uucm9sZSwgZGVzdCwge1xuICAgICAgICAgICAgcHJlZHJvcDogZmFsc2VcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNhblByZWRyb3Aoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHNldFByZWRyb3Aoc3RhdGUsIHN0YXRlLnBpZWNlc1tvcmlnXS5yb2xlLCBkZXN0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgfVxuICAgIGRlbGV0ZSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xufVxuZXhwb3J0cy5kcm9wTmV3UGllY2UgPSBkcm9wTmV3UGllY2U7XG5mdW5jdGlvbiBzZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpIHtcbiAgICBpZiAoc3RhdGUuc2VsZWN0ZWQpIHtcbiAgICAgICAgaWYgKHN0YXRlLnNlbGVjdGVkID09PSBrZXkgJiYgIXN0YXRlLmRyYWdnYWJsZS5lbmFibGVkKSB7XG4gICAgICAgICAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgICAgICAgICBzdGF0ZS5ob2xkLmNhbmNlbCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKChzdGF0ZS5zZWxlY3RhYmxlLmVuYWJsZWQgfHwgZm9yY2UpICYmIHN0YXRlLnNlbGVjdGVkICE9PSBrZXkpIHtcbiAgICAgICAgICAgIGlmICh1c2VyTW92ZShzdGF0ZSwgc3RhdGUuc2VsZWN0ZWQsIGtleSkpXG4gICAgICAgICAgICAgICAgc3RhdGUuc3RhdHMuZHJhZ2dlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0YXRlLmhvbGQuc3RhcnQoKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoaXNNb3ZhYmxlKHN0YXRlLCBrZXkpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwga2V5KSkge1xuICAgICAgICBzZXRTZWxlY3RlZChzdGF0ZSwga2V5KTtcbiAgICAgICAgc3RhdGUuaG9sZC5zdGFydCgpO1xuICAgIH1cbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5zZWxlY3QsIGtleSk7XG59XG5leHBvcnRzLnNlbGVjdFNxdWFyZSA9IHNlbGVjdFNxdWFyZTtcbmZ1bmN0aW9uIHNldFNlbGVjdGVkKHN0YXRlLCBrZXkpIHtcbiAgICBzdGF0ZS5zZWxlY3RlZCA9IGtleTtcbiAgICBpZiAoaXNQcmVtb3ZhYmxlKHN0YXRlLCBrZXkpKSB7XG4gICAgICAgIHN0YXRlLnByZW1vdmFibGUuZGVzdHMgPSBwcmVtb3ZlXzEuZGVmYXVsdChzdGF0ZS5waWVjZXMsIGtleSwgc3RhdGUucHJlbW92YWJsZS5jYXN0bGUsIHN0YXRlLmdlb21ldHJ5KTtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgICBzdGF0ZS5wcmVtb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xufVxuZXhwb3J0cy5zZXRTZWxlY3RlZCA9IHNldFNlbGVjdGVkO1xuZnVuY3Rpb24gdW5zZWxlY3Qoc3RhdGUpIHtcbiAgICBzdGF0ZS5zZWxlY3RlZCA9IHVuZGVmaW5lZDtcbiAgICBzdGF0ZS5wcmVtb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xuICAgIHN0YXRlLmhvbGQuY2FuY2VsKCk7XG59XG5leHBvcnRzLnVuc2VsZWN0ID0gdW5zZWxlY3Q7XG5mdW5jdGlvbiBpc01vdmFibGUoc3RhdGUsIG9yaWcpIHtcbiAgICB2YXIgcGllY2UgPSBzdGF0ZS5waWVjZXNbb3JpZ107XG4gICAgcmV0dXJuICEhcGllY2UgJiYgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICdib3RoJyB8fCAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yID09PSBwaWVjZS5jb2xvcikpO1xufVxuZnVuY3Rpb24gY2FuTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHJldHVybiBvcmlnICE9PSBkZXN0ICYmIGlzTW92YWJsZShzdGF0ZSwgb3JpZykgJiYgKHN0YXRlLm1vdmFibGUuZnJlZSB8fCAoISFzdGF0ZS5tb3ZhYmxlLmRlc3RzICYmIHV0aWxfMS5jb250YWluc1goc3RhdGUubW92YWJsZS5kZXN0c1tvcmlnXSwgZGVzdCkpKTtcbn1cbmV4cG9ydHMuY2FuTW92ZSA9IGNhbk1vdmU7XG5mdW5jdGlvbiBjYW5Ecm9wKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIGRlc3QgJiYgKG9yaWcgPT09IGRlc3QgfHwgIXN0YXRlLnBpZWNlc1tkZXN0XSkgJiYgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICdib3RoJyB8fCAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yID09PSBwaWVjZS5jb2xvcikpO1xufVxuZnVuY3Rpb24gaXNQcmVtb3ZhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIHN0YXRlLnByZW1vdmFibGUuZW5hYmxlZCAmJlxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxuICAgICAgICBzdGF0ZS50dXJuQ29sb3IgIT09IHBpZWNlLmNvbG9yO1xufVxuZnVuY3Rpb24gY2FuUHJlbW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHJldHVybiBvcmlnICE9PSBkZXN0ICYmXG4gICAgICAgIGlzUHJlbW92YWJsZShzdGF0ZSwgb3JpZykgJiZcbiAgICAgICAgdXRpbF8xLmNvbnRhaW5zWChwcmVtb3ZlXzEuZGVmYXVsdChzdGF0ZS5waWVjZXMsIG9yaWcsIHN0YXRlLnByZW1vdmFibGUuY2FzdGxlLCBzdGF0ZS5nZW9tZXRyeSksIGRlc3QpO1xufVxuZnVuY3Rpb24gY2FuUHJlZHJvcChzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHZhciBwaWVjZSA9IHN0YXRlLnBpZWNlc1tvcmlnXTtcbiAgICB2YXIgZGVzdFBpZWNlID0gc3RhdGUucGllY2VzW2Rlc3RdO1xuICAgIHJldHVybiAhIXBpZWNlICYmIGRlc3QgJiZcbiAgICAgICAgKCFkZXN0UGllY2UgfHwgZGVzdFBpZWNlLmNvbG9yICE9PSBzdGF0ZS5tb3ZhYmxlLmNvbG9yKSAmJlxuICAgICAgICBzdGF0ZS5wcmVkcm9wcGFibGUuZW5hYmxlZCAmJlxuICAgICAgICAocGllY2Uucm9sZSAhPT0gJ3Bhd24nIHx8IChkZXN0WzFdICE9PSAnMScgJiYgZGVzdFsxXSAhPT0gJzgnKSkgJiZcbiAgICAgICAgc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiZcbiAgICAgICAgc3RhdGUudHVybkNvbG9yICE9PSBwaWVjZS5jb2xvcjtcbn1cbmZ1bmN0aW9uIGlzRHJhZ2dhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgdmFyIHBpZWNlID0gc3RhdGUucGllY2VzW29yaWddO1xuICAgIHJldHVybiAhIXBpZWNlICYmIHN0YXRlLmRyYWdnYWJsZS5lbmFibGVkICYmIChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmIChzdGF0ZS50dXJuQ29sb3IgPT09IHBpZWNlLmNvbG9yIHx8IHN0YXRlLnByZW1vdmFibGUuZW5hYmxlZCkpKTtcbn1cbmV4cG9ydHMuaXNEcmFnZ2FibGUgPSBpc0RyYWdnYWJsZTtcbmZ1bmN0aW9uIHBsYXlQcmVtb3ZlKHN0YXRlKSB7XG4gICAgdmFyIG1vdmUgPSBzdGF0ZS5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKCFtb3ZlKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgdmFyIG9yaWcgPSBtb3ZlWzBdLCBkZXN0ID0gbW92ZVsxXTtcbiAgICB2YXIgc3VjY2VzcyA9IGZhbHNlO1xuICAgIGlmIChjYW5Nb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gYmFzZVVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgdmFyIG1ldGFkYXRhID0geyBwcmVtb3ZlOiB0cnVlIH07XG4gICAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlKVxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmNhcHR1cmVkID0gcmVzdWx0O1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlciwgb3JpZywgZGVzdCwgbWV0YWRhdGEpO1xuICAgICAgICAgICAgc3VjY2VzcyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdW5zZXRQcmVtb3ZlKHN0YXRlKTtcbiAgICByZXR1cm4gc3VjY2Vzcztcbn1cbmV4cG9ydHMucGxheVByZW1vdmUgPSBwbGF5UHJlbW92ZTtcbmZ1bmN0aW9uIHBsYXlQcmVkcm9wKHN0YXRlLCB2YWxpZGF0ZSkge1xuICAgIHZhciBkcm9wID0gc3RhdGUucHJlZHJvcHBhYmxlLmN1cnJlbnQsIHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICBpZiAoIWRyb3ApXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBpZiAodmFsaWRhdGUoZHJvcCkpIHtcbiAgICAgICAgdmFyIHBpZWNlID0ge1xuICAgICAgICAgICAgcm9sZTogZHJvcC5yb2xlLFxuICAgICAgICAgICAgY29sb3I6IHN0YXRlLm1vdmFibGUuY29sb3JcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGRyb3Aua2V5KSkge1xuICAgICAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5tb3ZhYmxlLmV2ZW50cy5hZnRlck5ld1BpZWNlLCBkcm9wLnJvbGUsIGRyb3Aua2V5LCB7XG4gICAgICAgICAgICAgICAgcHJlZHJvcDogdHJ1ZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xuICAgIHJldHVybiBzdWNjZXNzO1xufVxuZXhwb3J0cy5wbGF5UHJlZHJvcCA9IHBsYXlQcmVkcm9wO1xuZnVuY3Rpb24gY2FuY2VsTW92ZShzdGF0ZSkge1xuICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgdW5zZXRQcmVkcm9wKHN0YXRlKTtcbiAgICB1bnNlbGVjdChzdGF0ZSk7XG59XG5leHBvcnRzLmNhbmNlbE1vdmUgPSBjYW5jZWxNb3ZlO1xuZnVuY3Rpb24gc3RvcChzdGF0ZSkge1xuICAgIHN0YXRlLm1vdmFibGUuY29sb3IgPVxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzID1cbiAgICAgICAgICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgIGNhbmNlbE1vdmUoc3RhdGUpO1xufVxuZXhwb3J0cy5zdG9wID0gc3RvcDtcbmZ1bmN0aW9uIGdldEtleUF0RG9tUG9zKHBvcywgYXNXaGl0ZSwgYm91bmRzLCBnZW9tKSB7XG4gICAgdmFyIGJkID0gY2cuZGltZW5zaW9uc1tnZW9tXTtcbiAgICB2YXIgZmlsZSA9IE1hdGguY2VpbChiZC53aWR0aCAqICgocG9zWzBdIC0gYm91bmRzLmxlZnQpIC8gYm91bmRzLndpZHRoKSk7XG4gICAgaWYgKCFhc1doaXRlKVxuICAgICAgICBmaWxlID0gYmQud2lkdGggKyAxIC0gZmlsZTtcbiAgICB2YXIgcmFuayA9IE1hdGguY2VpbChiZC5oZWlnaHQgLSAoYmQuaGVpZ2h0ICogKChwb3NbMV0gLSBib3VuZHMudG9wKSAvIGJvdW5kcy5oZWlnaHQpKSk7XG4gICAgaWYgKCFhc1doaXRlKVxuICAgICAgICByYW5rID0gYmQuaGVpZ2h0ICsgMSAtIHJhbms7XG4gICAgcmV0dXJuIChmaWxlID4gMCAmJiBmaWxlIDwgYmQud2lkdGggKyAxICYmIHJhbmsgPiAwICYmIHJhbmsgPCBiZC5oZWlnaHQgKyAxKSA/IHV0aWxfMS5wb3Mya2V5KFtmaWxlLCByYW5rXSwgZ2VvbSkgOiB1bmRlZmluZWQ7XG59XG5leHBvcnRzLmdldEtleUF0RG9tUG9zID0gZ2V0S2V5QXREb21Qb3M7XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBhcGlfMSA9IHJlcXVpcmUoXCIuL2FwaVwiKTtcbnZhciBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbnZhciBzdGF0ZV8xID0gcmVxdWlyZShcIi4vc3RhdGVcIik7XG52YXIgd3JhcF8xID0gcmVxdWlyZShcIi4vd3JhcFwiKTtcbnZhciBldmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG52YXIgcmVuZGVyXzEgPSByZXF1aXJlKFwiLi9yZW5kZXJcIik7XG52YXIgc3ZnID0gcmVxdWlyZShcIi4vc3ZnXCIpO1xudmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gQ2hlc3Nncm91bmQoZWxlbWVudCwgY29uZmlnKSB7XG4gICAgdmFyIHN0YXRlID0gc3RhdGVfMS5kZWZhdWx0cygpO1xuICAgIGNvbmZpZ18xLmNvbmZpZ3VyZShzdGF0ZSwgY29uZmlnIHx8IHt9KTtcbiAgICBmdW5jdGlvbiByZWRyYXdBbGwoKSB7XG4gICAgICAgIHZhciBwcmV2VW5iaW5kID0gc3RhdGUuZG9tICYmIHN0YXRlLmRvbS51bmJpbmQ7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2ctYm9hcmQtd3JhcCcpO1xuICAgICAgICB2YXIgYm91bmRzID0gdXRpbC5tZW1vKGZ1bmN0aW9uICgpIHsgcmV0dXJuIGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7IH0pO1xuICAgICAgICB2YXIgcmVsYXRpdmUgPSBzdGF0ZS52aWV3T25seSAmJiAhc3RhdGUuZHJhd2FibGUudmlzaWJsZTtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gd3JhcF8xLmRlZmF1bHQoZWxlbWVudCwgc3RhdGUsIHJlbGF0aXZlID8gdW5kZWZpbmVkIDogYm91bmRzKCkpO1xuICAgICAgICB2YXIgcmVkcmF3Tm93ID0gZnVuY3Rpb24gKHNraXBTdmcpIHtcbiAgICAgICAgICAgIHJlbmRlcl8xLmRlZmF1bHQoc3RhdGUpO1xuICAgICAgICAgICAgaWYgKCFza2lwU3ZnICYmIGVsZW1lbnRzLnN2ZylcbiAgICAgICAgICAgICAgICBzdmcucmVuZGVyU3ZnKHN0YXRlLCBlbGVtZW50cy5zdmcpO1xuICAgICAgICB9O1xuICAgICAgICBzdGF0ZS5kb20gPSB7XG4gICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHMsXG4gICAgICAgICAgICBib3VuZHM6IGJvdW5kcyxcbiAgICAgICAgICAgIHJlZHJhdzogZGVib3VuY2VSZWRyYXcocmVkcmF3Tm93KSxcbiAgICAgICAgICAgIHJlZHJhd05vdzogcmVkcmF3Tm93LFxuICAgICAgICAgICAgdW5iaW5kOiBwcmV2VW5iaW5kLFxuICAgICAgICAgICAgcmVsYXRpdmU6IHJlbGF0aXZlXG4gICAgICAgIH07XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnByZXZTdmdIYXNoID0gJyc7XG4gICAgICAgIHJlZHJhd05vdyhmYWxzZSk7XG4gICAgICAgIGV2ZW50cy5iaW5kQm9hcmQoc3RhdGUpO1xuICAgICAgICBpZiAoIXByZXZVbmJpbmQpXG4gICAgICAgICAgICBzdGF0ZS5kb20udW5iaW5kID0gZXZlbnRzLmJpbmREb2N1bWVudChzdGF0ZSwgcmVkcmF3QWxsKTtcbiAgICB9XG4gICAgcmVkcmF3QWxsKCk7XG4gICAgdmFyIGFwaSA9IGFwaV8xLnN0YXJ0KHN0YXRlLCByZWRyYXdBbGwpO1xuICAgIHJldHVybiBhcGk7XG59XG5leHBvcnRzLkNoZXNzZ3JvdW5kID0gQ2hlc3Nncm91bmQ7XG47XG5mdW5jdGlvbiBkZWJvdW5jZVJlZHJhdyhyZWRyYXdOb3cpIHtcbiAgICB2YXIgcmVkcmF3aW5nID0gZmFsc2U7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHJlZHJhd2luZylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgcmVkcmF3aW5nID0gdHJ1ZTtcbiAgICAgICAgdXRpbC5yYWYoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmVkcmF3Tm93KCk7XG4gICAgICAgICAgICByZWRyYXdpbmcgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIGJvYXJkXzEgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbnZhciBmZW5fMSA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbnZhciBjZyA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuZnVuY3Rpb24gY29uZmlndXJlKHN0YXRlLCBjb25maWcpIHtcbiAgICBpZiAoY29uZmlnLm1vdmFibGUgJiYgY29uZmlnLm1vdmFibGUuZGVzdHMpXG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgbWVyZ2Uoc3RhdGUsIGNvbmZpZyk7XG4gICAgaWYgKGNvbmZpZy5nZW9tZXRyeSlcbiAgICAgICAgc3RhdGUuZGltZW5zaW9ucyA9IGNnLmRpbWVuc2lvbnNbY29uZmlnLmdlb21ldHJ5XTtcbiAgICBpZiAoY29uZmlnLmZlbikge1xuICAgICAgICBzdGF0ZS5waWVjZXMgPSBmZW5fMS5yZWFkKGNvbmZpZy5mZW4pO1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5zaGFwZXMgPSBbXTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eSgnY2hlY2snKSlcbiAgICAgICAgYm9hcmRfMS5zZXRDaGVjayhzdGF0ZSwgY29uZmlnLmNoZWNrIHx8IGZhbHNlKTtcbiAgICBpZiAoY29uZmlnLmhhc093blByb3BlcnR5KCdsYXN0TW92ZScpICYmICFjb25maWcubGFzdE1vdmUpXG4gICAgICAgIHN0YXRlLmxhc3RNb3ZlID0gdW5kZWZpbmVkO1xuICAgIGVsc2UgaWYgKGNvbmZpZy5sYXN0TW92ZSlcbiAgICAgICAgc3RhdGUubGFzdE1vdmUgPSBjb25maWcubGFzdE1vdmU7XG4gICAgaWYgKHN0YXRlLnNlbGVjdGVkKVxuICAgICAgICBib2FyZF8xLnNldFNlbGVjdGVkKHN0YXRlLCBzdGF0ZS5zZWxlY3RlZCk7XG4gICAgaWYgKCFzdGF0ZS5hbmltYXRpb24uZHVyYXRpb24gfHwgc3RhdGUuYW5pbWF0aW9uLmR1cmF0aW9uIDwgMTAwKVxuICAgICAgICBzdGF0ZS5hbmltYXRpb24uZW5hYmxlZCA9IGZhbHNlO1xuICAgIGlmICghc3RhdGUubW92YWJsZS5yb29rQ2FzdGxlICYmIHN0YXRlLm1vdmFibGUuZGVzdHMpIHtcbiAgICAgICAgdmFyIHJhbmtfMSA9IHN0YXRlLm1vdmFibGUuY29sb3IgPT09ICd3aGl0ZScgPyAxIDogODtcbiAgICAgICAgdmFyIGtpbmdTdGFydFBvcyA9ICdlJyArIHJhbmtfMTtcbiAgICAgICAgdmFyIGRlc3RzXzEgPSBzdGF0ZS5tb3ZhYmxlLmRlc3RzW2tpbmdTdGFydFBvc107XG4gICAgICAgIHZhciBraW5nID0gc3RhdGUucGllY2VzW2tpbmdTdGFydFBvc107XG4gICAgICAgIGlmICghZGVzdHNfMSB8fCAha2luZyB8fCBraW5nLnJvbGUgIT09ICdraW5nJylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgc3RhdGUubW92YWJsZS5kZXN0c1traW5nU3RhcnRQb3NdID0gZGVzdHNfMS5maWx0ZXIoZnVuY3Rpb24gKGQpIHtcbiAgICAgICAgICAgIHJldHVybiAhKChkID09PSAnYScgKyByYW5rXzEpICYmIGRlc3RzXzEuaW5kZXhPZignYycgKyByYW5rXzEpICE9PSAtMSkgJiZcbiAgICAgICAgICAgICAgICAhKChkID09PSAnaCcgKyByYW5rXzEpICYmIGRlc3RzXzEuaW5kZXhPZignZycgKyByYW5rXzEpICE9PSAtMSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydHMuY29uZmlndXJlID0gY29uZmlndXJlO1xuO1xuZnVuY3Rpb24gbWVyZ2UoYmFzZSwgZXh0ZW5kKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGV4dGVuZCkge1xuICAgICAgICBpZiAoaXNPYmplY3QoYmFzZVtrZXldKSAmJiBpc09iamVjdChleHRlbmRba2V5XSkpXG4gICAgICAgICAgICBtZXJnZShiYXNlW2tleV0sIGV4dGVuZFtrZXldKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgYmFzZVtrZXldID0gZXh0ZW5kW2tleV07XG4gICAgfVxufVxuZnVuY3Rpb24gaXNPYmplY3Qobykge1xuICAgIHJldHVybiB0eXBlb2YgbyA9PT0gJ29iamVjdCc7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBib2FyZCA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xudmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xudmFyIGRyYXdfMSA9IHJlcXVpcmUoXCIuL2RyYXdcIik7XG52YXIgYW5pbV8xID0gcmVxdWlyZShcIi4vYW5pbVwiKTtcbmZ1bmN0aW9uIHN0YXJ0KHMsIGUpIHtcbiAgICBpZiAoZS5idXR0b24gIT09IHVuZGVmaW5lZCAmJiBlLmJ1dHRvbiAhPT0gMClcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChlLnRvdWNoZXMgJiYgZS50b3VjaGVzLmxlbmd0aCA+IDEpXG4gICAgICAgIHJldHVybjtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgdmFyIGFzV2hpdGUgPSBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKSwgcG9zaXRpb24gPSB1dGlsLmV2ZW50UG9zaXRpb24oZSksIG9yaWcgPSBib2FyZC5nZXRLZXlBdERvbVBvcyhwb3NpdGlvbiwgYXNXaGl0ZSwgYm91bmRzLCBzLmdlb21ldHJ5KTtcbiAgICBpZiAoIW9yaWcpXG4gICAgICAgIHJldHVybjtcbiAgICB2YXIgcGllY2UgPSBzLnBpZWNlc1tvcmlnXTtcbiAgICB2YXIgcHJldmlvdXNseVNlbGVjdGVkID0gcy5zZWxlY3RlZDtcbiAgICBpZiAoIXByZXZpb3VzbHlTZWxlY3RlZCAmJiBzLmRyYXdhYmxlLmVuYWJsZWQgJiYgKHMuZHJhd2FibGUuZXJhc2VPbkNsaWNrIHx8ICghcGllY2UgfHwgcGllY2UuY29sb3IgIT09IHMudHVybkNvbG9yKSkpXG4gICAgICAgIGRyYXdfMS5jbGVhcihzKTtcbiAgICB2YXIgaGFkUHJlbW92ZSA9ICEhcy5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgdmFyIGhhZFByZWRyb3AgPSAhIXMucHJlZHJvcHBhYmxlLmN1cnJlbnQ7XG4gICAgcy5zdGF0cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuICAgIGlmIChzLnNlbGVjdGVkICYmIGJvYXJkLmNhbk1vdmUocywgcy5zZWxlY3RlZCwgb3JpZykpIHtcbiAgICAgICAgYW5pbV8xLmFuaW0oZnVuY3Rpb24gKHN0YXRlKSB7IHJldHVybiBib2FyZC5zZWxlY3RTcXVhcmUoc3RhdGUsIG9yaWcpOyB9LCBzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGJvYXJkLnNlbGVjdFNxdWFyZShzLCBvcmlnKTtcbiAgICB9XG4gICAgdmFyIHN0aWxsU2VsZWN0ZWQgPSBzLnNlbGVjdGVkID09PSBvcmlnO1xuICAgIHZhciBlbGVtZW50ID0gcGllY2VFbGVtZW50QnlLZXkocywgb3JpZyk7XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIGlmIChwaWVjZSAmJiBlbGVtZW50ICYmIHN0aWxsU2VsZWN0ZWQgJiYgYm9hcmQuaXNEcmFnZ2FibGUocywgb3JpZykpIHtcbiAgICAgICAgdmFyIHNxdWFyZUJvdW5kcyA9IGNvbXB1dGVTcXVhcmVCb3VuZHMob3JpZywgYXNXaGl0ZSwgYm91bmRzLCBzLmRpbWVuc2lvbnMpO1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0ge1xuICAgICAgICAgICAgb3JpZzogb3JpZyxcbiAgICAgICAgICAgIG9yaWdQb3M6IHV0aWwua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLFxuICAgICAgICAgICAgcGllY2U6IHBpZWNlLFxuICAgICAgICAgICAgcmVsOiBwb3NpdGlvbixcbiAgICAgICAgICAgIGVwb3M6IHBvc2l0aW9uLFxuICAgICAgICAgICAgcG9zOiBbMCwgMF0sXG4gICAgICAgICAgICBkZWM6IHMuZHJhZ2dhYmxlLmNlbnRlclBpZWNlID8gW1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uWzBdIC0gKHNxdWFyZUJvdW5kcy5sZWZ0ICsgc3F1YXJlQm91bmRzLndpZHRoIC8gMiksXG4gICAgICAgICAgICAgICAgcG9zaXRpb25bMV0gLSAoc3F1YXJlQm91bmRzLnRvcCArIHNxdWFyZUJvdW5kcy5oZWlnaHQgLyAyKVxuICAgICAgICAgICAgXSA6IFswLCAwXSxcbiAgICAgICAgICAgIHN0YXJ0ZWQ6IHMuZHJhZ2dhYmxlLmF1dG9EaXN0YW5jZSAmJiBzLnN0YXRzLmRyYWdnZWQsXG4gICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50LFxuICAgICAgICAgICAgcHJldmlvdXNseVNlbGVjdGVkOiBwcmV2aW91c2x5U2VsZWN0ZWQsXG4gICAgICAgICAgICBvcmlnaW5UYXJnZXQ6IGUudGFyZ2V0XG4gICAgICAgIH07XG4gICAgICAgIGVsZW1lbnQuY2dEcmFnZ2luZyA9IHRydWU7XG4gICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICAgICAgdmFyIGdob3N0ID0gcy5kb20uZWxlbWVudHMuZ2hvc3Q7XG4gICAgICAgIGlmIChnaG9zdCkge1xuICAgICAgICAgICAgZ2hvc3QuY2xhc3NOYW1lID0gXCJnaG9zdCBcIiArIHBpZWNlLmNvbG9yICsgXCIgXCIgKyBwaWVjZS5yb2xlO1xuICAgICAgICAgICAgdXRpbC50cmFuc2xhdGVBYnMoZ2hvc3QsIHV0aWwucG9zVG9UcmFuc2xhdGVBYnMoYm91bmRzLCBzLmRpbWVuc2lvbnMpKHV0aWwua2V5MnBvcyhvcmlnLCBmaXJzdFJhbmtJczApLCBhc1doaXRlKSk7XG4gICAgICAgICAgICB1dGlsLnNldFZpc2libGUoZ2hvc3QsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHByb2Nlc3NEcmFnKHMpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGhhZFByZW1vdmUpXG4gICAgICAgICAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgICAgIGlmIChoYWRQcmVkcm9wKVxuICAgICAgICAgICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIH1cbiAgICBzLmRvbS5yZWRyYXcoKTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbmZ1bmN0aW9uIGRyYWdOZXdQaWVjZShzLCBwaWVjZSwgZSwgZm9yY2UpIHtcbiAgICB2YXIga2V5ID0gJ2EwJztcbiAgICBzLnBpZWNlc1trZXldID0gcGllY2U7XG4gICAgcy5kb20ucmVkcmF3KCk7XG4gICAgdmFyIHBvc2l0aW9uID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpLCBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgYm91bmRzID0gcy5kb20uYm91bmRzKCksIHNxdWFyZUJvdW5kcyA9IGNvbXB1dGVTcXVhcmVCb3VuZHMoa2V5LCBhc1doaXRlLCBib3VuZHMsIHMuZGltZW5zaW9ucyk7XG4gICAgdmFyIHJlbCA9IFtcbiAgICAgICAgKGFzV2hpdGUgPyAwIDogcy5kaW1lbnNpb25zLndpZHRoIC0gMSkgKiBzcXVhcmVCb3VuZHMud2lkdGggKyBib3VuZHMubGVmdCxcbiAgICAgICAgKGFzV2hpdGUgPyBzLmRpbWVuc2lvbnMuaGVpZ2h0IDogLTEpICogc3F1YXJlQm91bmRzLmhlaWdodCArIGJvdW5kcy50b3BcbiAgICBdO1xuICAgIHZhciBmaXJzdFJhbmtJczAgPSBzLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0ge1xuICAgICAgICBvcmlnOiBrZXksXG4gICAgICAgIG9yaWdQb3M6IHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMCksXG4gICAgICAgIHBpZWNlOiBwaWVjZSxcbiAgICAgICAgcmVsOiByZWwsXG4gICAgICAgIGVwb3M6IHBvc2l0aW9uLFxuICAgICAgICBwb3M6IFtwb3NpdGlvblswXSAtIHJlbFswXSwgcG9zaXRpb25bMV0gLSByZWxbMV1dLFxuICAgICAgICBkZWM6IFstc3F1YXJlQm91bmRzLndpZHRoIC8gMiwgLXNxdWFyZUJvdW5kcy5oZWlnaHQgLyAyXSxcbiAgICAgICAgc3RhcnRlZDogdHJ1ZSxcbiAgICAgICAgZWxlbWVudDogZnVuY3Rpb24gKCkgeyByZXR1cm4gcGllY2VFbGVtZW50QnlLZXkocywga2V5KTsgfSxcbiAgICAgICAgb3JpZ2luVGFyZ2V0OiBlLnRhcmdldCxcbiAgICAgICAgbmV3UGllY2U6IHRydWUsXG4gICAgICAgIGZvcmNlOiBmb3JjZSB8fCBmYWxzZVxuICAgIH07XG4gICAgcHJvY2Vzc0RyYWcocyk7XG59XG5leHBvcnRzLmRyYWdOZXdQaWVjZSA9IGRyYWdOZXdQaWVjZTtcbmZ1bmN0aW9uIHByb2Nlc3NEcmFnKHMpIHtcbiAgICB1dGlsLnJhZihmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjdXIgPSBzLmRyYWdnYWJsZS5jdXJyZW50O1xuICAgICAgICBpZiAoIWN1cilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKHMuYW5pbWF0aW9uLmN1cnJlbnQgJiYgcy5hbmltYXRpb24uY3VycmVudC5wbGFuLmFuaW1zW2N1ci5vcmlnXSlcbiAgICAgICAgICAgIHMuYW5pbWF0aW9uLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHZhciBvcmlnUGllY2UgPSBzLnBpZWNlc1tjdXIub3JpZ107XG4gICAgICAgIGlmICghb3JpZ1BpZWNlIHx8ICF1dGlsLnNhbWVQaWVjZShvcmlnUGllY2UsIGN1ci5waWVjZSkpXG4gICAgICAgICAgICBjYW5jZWwocyk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKCFjdXIuc3RhcnRlZCAmJiB1dGlsLmRpc3RhbmNlU3EoY3VyLmVwb3MsIGN1ci5yZWwpID49IE1hdGgucG93KHMuZHJhZ2dhYmxlLmRpc3RhbmNlLCAyKSlcbiAgICAgICAgICAgICAgICBjdXIuc3RhcnRlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoY3VyLnN0YXJ0ZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGN1ci5lbGVtZW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb3VuZCA9IGN1ci5lbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZm91bmQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGN1ci5lbGVtZW50ID0gZm91bmQ7XG4gICAgICAgICAgICAgICAgICAgIGN1ci5lbGVtZW50LmNnRHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjdXIuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgYXNXaGl0ZSA9IHMub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIGJvdW5kcyA9IHMuZG9tLmJvdW5kcygpO1xuICAgICAgICAgICAgICAgIGN1ci5wb3MgPSBbXG4gICAgICAgICAgICAgICAgICAgIGN1ci5lcG9zWzBdIC0gY3VyLnJlbFswXSxcbiAgICAgICAgICAgICAgICAgICAgY3VyLmVwb3NbMV0gLSBjdXIucmVsWzFdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgICAgICB2YXIgdHJhbnNsYXRpb24gPSB1dGlsLnBvc1RvVHJhbnNsYXRlQWJzKGJvdW5kcywgcy5kaW1lbnNpb25zKShjdXIub3JpZ1BvcywgYXNXaGl0ZSk7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRpb25bMF0gKz0gY3VyLnBvc1swXSArIGN1ci5kZWNbMF07XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRpb25bMV0gKz0gY3VyLnBvc1sxXSArIGN1ci5kZWNbMV07XG4gICAgICAgICAgICAgICAgdXRpbC50cmFuc2xhdGVBYnMoY3VyLmVsZW1lbnQsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBwcm9jZXNzRHJhZyhzKTtcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIG1vdmUocywgZSkge1xuICAgIGlmIChzLmRyYWdnYWJsZS5jdXJyZW50ICYmICghZS50b3VjaGVzIHx8IGUudG91Y2hlcy5sZW5ndGggPCAyKSkge1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50LmVwb3MgPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgfVxufVxuZXhwb3J0cy5tb3ZlID0gbW92ZTtcbmZ1bmN0aW9uIGVuZChzLCBlKSB7XG4gICAgdmFyIGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKCFjdXIpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAoZS50eXBlID09PSAndG91Y2hlbmQnICYmIGN1ciAmJiBjdXIub3JpZ2luVGFyZ2V0ICE9PSBlLnRhcmdldCAmJiAhY3VyLm5ld1BpZWNlKSB7XG4gICAgICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYm9hcmQudW5zZXRQcmVtb3ZlKHMpO1xuICAgIGJvYXJkLnVuc2V0UHJlZHJvcChzKTtcbiAgICB2YXIgZXZlbnRQb3MgPSB1dGlsLmV2ZW50UG9zaXRpb24oZSkgfHwgY3VyLmVwb3M7XG4gICAgdmFyIGRlc3QgPSBib2FyZC5nZXRLZXlBdERvbVBvcyhldmVudFBvcywgcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgcy5kb20uYm91bmRzKCksIHMuZ2VvbWV0cnkpO1xuICAgIGlmIChkZXN0ICYmIGN1ci5zdGFydGVkKSB7XG4gICAgICAgIGlmIChjdXIubmV3UGllY2UpXG4gICAgICAgICAgICBib2FyZC5kcm9wTmV3UGllY2UocywgY3VyLm9yaWcsIGRlc3QsIGN1ci5mb3JjZSk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcy5zdGF0cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuICAgICAgICAgICAgaWYgKGJvYXJkLnVzZXJNb3ZlKHMsIGN1ci5vcmlnLCBkZXN0KSlcbiAgICAgICAgICAgICAgICBzLnN0YXRzLmRyYWdnZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGN1ci5uZXdQaWVjZSkge1xuICAgICAgICBkZWxldGUgcy5waWVjZXNbY3VyLm9yaWddO1xuICAgIH1cbiAgICBlbHNlIGlmIChzLmRyYWdnYWJsZS5kZWxldGVPbkRyb3BPZmYpIHtcbiAgICAgICAgZGVsZXRlIHMucGllY2VzW2N1ci5vcmlnXTtcbiAgICAgICAgYm9hcmQuY2FsbFVzZXJGdW5jdGlvbihzLmV2ZW50cy5jaGFuZ2UpO1xuICAgIH1cbiAgICBpZiAoY3VyICYmIGN1ci5vcmlnID09PSBjdXIucHJldmlvdXNseVNlbGVjdGVkICYmIChjdXIub3JpZyA9PT0gZGVzdCB8fCAhZGVzdCkpXG4gICAgICAgIGJvYXJkLnVuc2VsZWN0KHMpO1xuICAgIGVsc2UgaWYgKCFzLnNlbGVjdGFibGUuZW5hYmxlZClcbiAgICAgICAgYm9hcmQudW5zZWxlY3Qocyk7XG4gICAgcmVtb3ZlRHJhZ0VsZW1lbnRzKHMpO1xuICAgIHMuZHJhZ2dhYmxlLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgcy5kb20ucmVkcmF3KCk7XG59XG5leHBvcnRzLmVuZCA9IGVuZDtcbmZ1bmN0aW9uIGNhbmNlbChzKSB7XG4gICAgdmFyIGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKGN1cikge1xuICAgICAgICBpZiAoY3VyLm5ld1BpZWNlKVxuICAgICAgICAgICAgZGVsZXRlIHMucGllY2VzW2N1ci5vcmlnXTtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgYm9hcmQudW5zZWxlY3Qocyk7XG4gICAgICAgIHJlbW92ZURyYWdFbGVtZW50cyhzKTtcbiAgICAgICAgcy5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuZXhwb3J0cy5jYW5jZWwgPSBjYW5jZWw7XG5mdW5jdGlvbiByZW1vdmVEcmFnRWxlbWVudHMocykge1xuICAgIHZhciBlID0gcy5kb20uZWxlbWVudHM7XG4gICAgaWYgKGUuZ2hvc3QpXG4gICAgICAgIHV0aWwuc2V0VmlzaWJsZShlLmdob3N0LCBmYWxzZSk7XG59XG5mdW5jdGlvbiBjb21wdXRlU3F1YXJlQm91bmRzKGtleSwgYXNXaGl0ZSwgYm91bmRzLCBiZCkge1xuICAgIHZhciBmaXJzdFJhbmtJczAgPSBiZC5oZWlnaHQgPT09IDEwO1xuICAgIHZhciBwb3MgPSB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApO1xuICAgIGlmICghYXNXaGl0ZSkge1xuICAgICAgICBwb3NbMF0gPSBiZC53aWR0aCArIDEgLSBwb3NbMF07XG4gICAgICAgIHBvc1sxXSA9IGJkLmhlaWdodCArIDEgLSBwb3NbMV07XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIGxlZnQ6IGJvdW5kcy5sZWZ0ICsgYm91bmRzLndpZHRoICogKHBvc1swXSAtIDEpIC8gYmQud2lkdGgsXG4gICAgICAgIHRvcDogYm91bmRzLnRvcCArIGJvdW5kcy5oZWlnaHQgKiAoYmQuaGVpZ2h0IC0gcG9zWzFdKSAvIGJkLmhlaWdodCxcbiAgICAgICAgd2lkdGg6IGJvdW5kcy53aWR0aCAvIGJkLndpZHRoLFxuICAgICAgICBoZWlnaHQ6IGJvdW5kcy5oZWlnaHQgLyBiZC5oZWlnaHRcbiAgICB9O1xufVxuZnVuY3Rpb24gcGllY2VFbGVtZW50QnlLZXkocywga2V5KSB7XG4gICAgdmFyIGVsID0gcy5kb20uZWxlbWVudHMuYm9hcmQuZmlyc3RDaGlsZDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgaWYgKGVsLmNnS2V5ID09PSBrZXkgJiYgZWwudGFnTmFtZSA9PT0gJ1BJRUNFJylcbiAgICAgICAgICAgIHJldHVybiBlbDtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIGJvYXJkXzEgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xudmFyIGJydXNoZXMgPSBbJ2dyZWVuJywgJ3JlZCcsICdibHVlJywgJ3llbGxvdyddO1xuZnVuY3Rpb24gc3RhcnQoc3RhdGUsIGUpIHtcbiAgICBpZiAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPiAxKVxuICAgICAgICByZXR1cm47XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5jdHJsS2V5ID8gYm9hcmRfMS51bnNlbGVjdChzdGF0ZSkgOiBib2FyZF8xLmNhbmNlbE1vdmUoc3RhdGUpO1xuICAgIHZhciBwb3NpdGlvbiA9IHV0aWxfMS5ldmVudFBvc2l0aW9uKGUpO1xuICAgIHZhciBvcmlnID0gYm9hcmRfMS5nZXRLZXlBdERvbVBvcyhwb3NpdGlvbiwgc3RhdGUub3JpZW50YXRpb24gPT09ICd3aGl0ZScsIHN0YXRlLmRvbS5ib3VuZHMoKSwgc3RhdGUuZ2VvbWV0cnkpO1xuICAgIGlmICghb3JpZylcbiAgICAgICAgcmV0dXJuO1xuICAgIHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIG9yaWc6IG9yaWcsXG4gICAgICAgIHBvczogcG9zaXRpb24sXG4gICAgICAgIGJydXNoOiBldmVudEJydXNoKGUpXG4gICAgfTtcbiAgICBwcm9jZXNzRHJhdyhzdGF0ZSk7XG59XG5leHBvcnRzLnN0YXJ0ID0gc3RhcnQ7XG5mdW5jdGlvbiBwcm9jZXNzRHJhdyhzdGF0ZSkge1xuICAgIHV0aWxfMS5yYWYoZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY3VyID0gc3RhdGUuZHJhd2FibGUuY3VycmVudDtcbiAgICAgICAgaWYgKGN1cikge1xuICAgICAgICAgICAgdmFyIG1vdXNlU3EgPSBib2FyZF8xLmdldEtleUF0RG9tUG9zKGN1ci5wb3MsIHN0YXRlLm9yaWVudGF0aW9uID09PSAnd2hpdGUnLCBzdGF0ZS5kb20uYm91bmRzKCksIHN0YXRlLmdlb21ldHJ5KTtcbiAgICAgICAgICAgIGlmIChtb3VzZVNxICE9PSBjdXIubW91c2VTcSkge1xuICAgICAgICAgICAgICAgIGN1ci5tb3VzZVNxID0gbW91c2VTcTtcbiAgICAgICAgICAgICAgICBjdXIuZGVzdCA9IG1vdXNlU3EgIT09IGN1ci5vcmlnID8gbW91c2VTcSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcm9jZXNzRHJhdyhzdGF0ZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbmV4cG9ydHMucHJvY2Vzc0RyYXcgPSBwcm9jZXNzRHJhdztcbmZ1bmN0aW9uIG1vdmUoc3RhdGUsIGUpIHtcbiAgICBpZiAoc3RhdGUuZHJhd2FibGUuY3VycmVudClcbiAgICAgICAgc3RhdGUuZHJhd2FibGUuY3VycmVudC5wb3MgPSB1dGlsXzEuZXZlbnRQb3NpdGlvbihlKTtcbn1cbmV4cG9ydHMubW92ZSA9IG1vdmU7XG5mdW5jdGlvbiBlbmQoc3RhdGUpIHtcbiAgICB2YXIgY3VyID0gc3RhdGUuZHJhd2FibGUuY3VycmVudDtcbiAgICBpZiAoY3VyKSB7XG4gICAgICAgIGlmIChjdXIubW91c2VTcSlcbiAgICAgICAgICAgIGFkZFNoYXBlKHN0YXRlLmRyYXdhYmxlLCBjdXIpO1xuICAgICAgICBjYW5jZWwoc3RhdGUpO1xuICAgIH1cbn1cbmV4cG9ydHMuZW5kID0gZW5kO1xuZnVuY3Rpb24gY2FuY2VsKHN0YXRlKSB7XG4gICAgaWYgKHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgc3RhdGUuZHJhd2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIH1cbn1cbmV4cG9ydHMuY2FuY2VsID0gY2FuY2VsO1xuZnVuY3Rpb24gY2xlYXIoc3RhdGUpIHtcbiAgICBpZiAoc3RhdGUuZHJhd2FibGUuc2hhcGVzLmxlbmd0aCkge1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5zaGFwZXMgPSBbXTtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgICAgICBvbkNoYW5nZShzdGF0ZS5kcmF3YWJsZSk7XG4gICAgfVxufVxuZXhwb3J0cy5jbGVhciA9IGNsZWFyO1xuZnVuY3Rpb24gZXZlbnRCcnVzaChlKSB7XG4gICAgdmFyIGEgPSBlLnNoaWZ0S2V5ICYmIHV0aWxfMS5pc1JpZ2h0QnV0dG9uKGUpID8gMSA6IDA7XG4gICAgdmFyIGIgPSBlLmFsdEtleSA/IDIgOiAwO1xuICAgIHJldHVybiBicnVzaGVzW2EgKyBiXTtcbn1cbmZ1bmN0aW9uIG5vdChmKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4KSB7IHJldHVybiAhZih4KTsgfTtcbn1cbmZ1bmN0aW9uIGFkZFNoYXBlKGRyYXdhYmxlLCBjdXIpIHtcbiAgICB2YXIgc2FtZVNoYXBlID0gZnVuY3Rpb24gKHMpIHtcbiAgICAgICAgcmV0dXJuIHMub3JpZyA9PT0gY3VyLm9yaWcgJiYgcy5kZXN0ID09PSBjdXIuZGVzdDtcbiAgICB9O1xuICAgIHZhciBzaW1pbGFyID0gZHJhd2FibGUuc2hhcGVzLmZpbHRlcihzYW1lU2hhcGUpWzBdO1xuICAgIGlmIChzaW1pbGFyKVxuICAgICAgICBkcmF3YWJsZS5zaGFwZXMgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKG5vdChzYW1lU2hhcGUpKTtcbiAgICBpZiAoIXNpbWlsYXIgfHwgc2ltaWxhci5icnVzaCAhPT0gY3VyLmJydXNoKVxuICAgICAgICBkcmF3YWJsZS5zaGFwZXMucHVzaChjdXIpO1xuICAgIG9uQ2hhbmdlKGRyYXdhYmxlKTtcbn1cbmZ1bmN0aW9uIG9uQ2hhbmdlKGRyYXdhYmxlKSB7XG4gICAgaWYgKGRyYXdhYmxlLm9uQ2hhbmdlKVxuICAgICAgICBkcmF3YWJsZS5vbkNoYW5nZShkcmF3YWJsZS5zaGFwZXMpO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgZHJhZyA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG52YXIgZHJhdyA9IHJlcXVpcmUoXCIuL2RyYXdcIik7XG52YXIgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIGJpbmRCb2FyZChzKSB7XG4gICAgaWYgKHMudmlld09ubHkpXG4gICAgICAgIHJldHVybjtcbiAgICB2YXIgYm9hcmRFbCA9IHMuZG9tLmVsZW1lbnRzLmJvYXJkLCBvblN0YXJ0ID0gc3RhcnREcmFnT3JEcmF3KHMpO1xuICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIG9uU3RhcnQpO1xuICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25TdGFydCk7XG4gICAgaWYgKHMuZGlzYWJsZUNvbnRleHRNZW51IHx8IHMuZHJhd2FibGUuZW5hYmxlZCkge1xuICAgICAgICBib2FyZEVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRleHRtZW51JywgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIGUucHJldmVudERlZmF1bHQoKTsgfSk7XG4gICAgfVxufVxuZXhwb3J0cy5iaW5kQm9hcmQgPSBiaW5kQm9hcmQ7XG5mdW5jdGlvbiBiaW5kRG9jdW1lbnQocywgcmVkcmF3QWxsKSB7XG4gICAgdmFyIHVuYmluZHMgPSBbXTtcbiAgICBpZiAoIXMuZG9tLnJlbGF0aXZlICYmIHMucmVzaXphYmxlKSB7XG4gICAgICAgIHZhciBvblJlc2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHMuZG9tLmJvdW5kcy5jbGVhcigpO1xuICAgICAgICAgICAgdXRpbF8xLnJhZihyZWRyYXdBbGwpO1xuICAgICAgICB9O1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudC5ib2R5LCAnY2hlc3Nncm91bmQucmVzaXplJywgb25SZXNpemUpKTtcbiAgICB9XG4gICAgaWYgKCFzLnZpZXdPbmx5KSB7XG4gICAgICAgIHZhciBvbm1vdmVfMSA9IGRyYWdPckRyYXcocywgZHJhZy5tb3ZlLCBkcmF3Lm1vdmUpO1xuICAgICAgICB2YXIgb25lbmRfMSA9IGRyYWdPckRyYXcocywgZHJhZy5lbmQsIGRyYXcuZW5kKTtcbiAgICAgICAgWyd0b3VjaG1vdmUnLCAnbW91c2Vtb3ZlJ10uZm9yRWFjaChmdW5jdGlvbiAoZXYpIHsgcmV0dXJuIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LCBldiwgb25tb3ZlXzEpKTsgfSk7XG4gICAgICAgIFsndG91Y2hlbmQnLCAnbW91c2V1cCddLmZvckVhY2goZnVuY3Rpb24gKGV2KSB7IHJldHVybiB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudCwgZXYsIG9uZW5kXzEpKTsgfSk7XG4gICAgICAgIHZhciBvblNjcm9sbCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHMuZG9tLmJvdW5kcy5jbGVhcigpOyB9O1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZSh3aW5kb3csICdzY3JvbGwnLCBvblNjcm9sbCwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcbiAgICAgICAgdW5iaW5kcy5wdXNoKHVuYmluZGFibGUod2luZG93LCAncmVzaXplJywgb25TY3JvbGwsIHsgcGFzc2l2ZTogdHJ1ZSB9KSk7XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7IHJldHVybiB1bmJpbmRzLmZvckVhY2goZnVuY3Rpb24gKGYpIHsgcmV0dXJuIGYoKTsgfSk7IH07XG59XG5leHBvcnRzLmJpbmREb2N1bWVudCA9IGJpbmREb2N1bWVudDtcbmZ1bmN0aW9uIHVuYmluZGFibGUoZWwsIGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7IHJldHVybiBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgY2FsbGJhY2spOyB9O1xufVxuZnVuY3Rpb24gc3RhcnREcmFnT3JEcmF3KHMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgaWYgKHMuZHJhZ2dhYmxlLmN1cnJlbnQpXG4gICAgICAgICAgICBkcmFnLmNhbmNlbChzKTtcbiAgICAgICAgZWxzZSBpZiAocy5kcmF3YWJsZS5jdXJyZW50KVxuICAgICAgICAgICAgZHJhdy5jYW5jZWwocyk7XG4gICAgICAgIGVsc2UgaWYgKGUuc2hpZnRLZXkgfHwgdXRpbF8xLmlzUmlnaHRCdXR0b24oZSkpIHtcbiAgICAgICAgICAgIGlmIChzLmRyYXdhYmxlLmVuYWJsZWQpXG4gICAgICAgICAgICAgICAgZHJhdy5zdGFydChzLCBlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghcy52aWV3T25seSlcbiAgICAgICAgICAgIGRyYWcuc3RhcnQocywgZSk7XG4gICAgfTtcbn1cbmZ1bmN0aW9uIGRyYWdPckRyYXcocywgd2l0aERyYWcsIHdpdGhEcmF3KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIGlmIChlLnNoaWZ0S2V5IHx8IHV0aWxfMS5pc1JpZ2h0QnV0dG9uKGUpKSB7XG4gICAgICAgICAgICBpZiAocy5kcmF3YWJsZS5lbmFibGVkKVxuICAgICAgICAgICAgICAgIHdpdGhEcmF3KHMsIGUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFzLnZpZXdPbmx5KVxuICAgICAgICAgICAgd2l0aERyYWcocywgZSk7XG4gICAgfTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gZXhwbG9zaW9uKHN0YXRlLCBrZXlzKSB7XG4gICAgc3RhdGUuZXhwbG9kaW5nID0ge1xuICAgICAgICBzdGFnZTogMSxcbiAgICAgICAga2V5czoga2V5c1xuICAgIH07XG4gICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICBzZXRTdGFnZShzdGF0ZSwgMik7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gc2V0U3RhZ2Uoc3RhdGUsIHVuZGVmaW5lZCk7IH0sIDEyMCk7XG4gICAgfSwgMTIwKTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IGV4cGxvc2lvbjtcbmZ1bmN0aW9uIHNldFN0YWdlKHN0YXRlLCBzdGFnZSkge1xuICAgIGlmIChzdGF0ZS5leHBsb2RpbmcpIHtcbiAgICAgICAgaWYgKHN0YWdlKVxuICAgICAgICAgICAgc3RhdGUuZXhwbG9kaW5nLnN0YWdlID0gc3RhZ2U7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0YXRlLmV4cGxvZGluZyA9IHVuZGVmaW5lZDtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIH1cbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG52YXIgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmV4cG9ydHMuaW5pdGlhbCA9ICdybmJxa2Juci9wcHBwcHBwcC84LzgvOC84L1BQUFBQUFBQL1JOQlFLQk5SJztcbnZhciByb2xlczggPSB7XG4gICAgcDogJ3Bhd24nLCByOiAncm9vaycsIG46ICdrbmlnaHQnLCBiOiAnYmlzaG9wJywgcTogJ3F1ZWVuJywgazogJ2tpbmcnLCBtOiAnbWV0JywgZjogJ2ZlcnonLCBzOiAnc2lsdmVyJywgYzogJ2NhbmNlbGxvcicsIGE6ICdhcmNoYmlzaG9wJywgaDogJ2hhd2snLCBlOiAnZWxlcGhhbnQnXG59O1xudmFyIHJvbGVzOSA9IHtcbiAgICBwOiAncGF3bicsIHI6ICdyb29rJywgbjogJ2tuaWdodCcsIGI6ICdiaXNob3AnLCBrOiAna2luZycsIGc6ICdnb2xkJywgczogJ3NpbHZlcicsIGw6ICdsYW5jZSdcbn07XG52YXIgcm9sZXMxMCA9IHtcbiAgICBwOiAncGF3bicsIHI6ICdyb29rJywgbjogJ2tuaWdodCcsIGI6ICdiaXNob3AnLCBrOiAna2luZycsIGM6ICdjYW5ub24nLCBhOiAnYWR2aXNvcidcbn07XG52YXIgbGV0dGVyczggPSB7XG4gICAgcGF3bjogJ3AnLCByb29rOiAncicsIGtuaWdodDogJ24nLCBiaXNob3A6ICdiJywgcXVlZW46ICdxJywga2luZzogJ2snLCBtZXQ6ICdtJywgZmVyejogJ2YnLCBzaWx2ZXI6ICdzJywgY2FuY2VsbG9yOiAnYycsIGFyY2hiaXNob3A6ICdhJywgaGF3azogJ2gnLCBlbGVwaGFudDogJ2UnXG59O1xudmFyIGxldHRlcnM5ID0ge1xuICAgIHBhd246ICdwJywgcm9vazogJ3InLCBrbmlnaHQ6ICduJywgYmlzaG9wOiAnYicsIGtpbmc6ICdrJywgZ29sZDogJ2cnLCBzaWx2ZXI6ICdzJywgbGFuY2U6ICdsJyxcbiAgICBwcGF3bjogJytwJywgcGtuaWdodDogJytuJywgcGJpc2hvcDogJytiJywgcHJvb2s6ICcrcicsIHBzaWx2ZXI6ICcrcycsIHBsYW5jZTogJytsJ1xufTtcbnZhciBsZXR0ZXJzMTAgPSB7XG4gICAgcGF3bjogJ3AnLCByb29rOiAncicsIGtuaWdodDogJ24nLCBiaXNob3A6ICdiJywga2luZzogJ2snLCBjYW5ub246ICdjJywgYWR2aXNvcjogJ2EnXG59O1xuZnVuY3Rpb24gcmVhZChmZW4pIHtcbiAgICBpZiAoZmVuID09PSAnc3RhcnQnKVxuICAgICAgICBmZW4gPSBleHBvcnRzLmluaXRpYWw7XG4gICAgaWYgKGZlbi5pbmRleE9mKCdbJykgIT09IC0xKVxuICAgICAgICBmZW4gPSBmZW4uc2xpY2UoMCwgZmVuLmluZGV4T2YoJ1snKSk7XG4gICAgdmFyIHBpZWNlcyA9IHt9O1xuICAgIHZhciByb3cgPSBmZW4uc3BsaXQoXCIvXCIpLmxlbmd0aDtcbiAgICB2YXIgY29sID0gMDtcbiAgICB2YXIgcHJvbW90ZWQgPSBmYWxzZTtcbiAgICB2YXIgcm9sZXMgPSByb3cgPT09IDEwID8gcm9sZXMxMCA6IHJvdyA9PT0gOSA/IHJvbGVzOSA6IHJvbGVzODtcbiAgICB2YXIgZmlyc3RSYW5rSXMwID0gcm93ID09PSAxMDtcbiAgICB2YXIgc2hvZ2kgPSByb3cgPT09IDk7XG4gICAgZm9yICh2YXIgX2kgPSAwLCBmZW5fMSA9IGZlbjsgX2kgPCBmZW5fMS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgdmFyIGMgPSBmZW5fMVtfaV07XG4gICAgICAgIHN3aXRjaCAoYykge1xuICAgICAgICAgICAgY2FzZSAnICc6IHJldHVybiBwaWVjZXM7XG4gICAgICAgICAgICBjYXNlICcvJzpcbiAgICAgICAgICAgICAgICAtLXJvdztcbiAgICAgICAgICAgICAgICBpZiAocm93ID09PSAwKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGllY2VzO1xuICAgICAgICAgICAgICAgIGNvbCA9IDA7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICcrJzpcbiAgICAgICAgICAgICAgICBwcm9tb3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd+JzpcbiAgICAgICAgICAgICAgICB2YXIgcGllY2UgPSBwaWVjZXNbY2cuZmlsZXNbY29sXSArIGNnLnJhbmtzW2ZpcnN0UmFua0lzMCA/IHJvdyA6IHJvdyArIDFdXTtcbiAgICAgICAgICAgICAgICBpZiAocGllY2UpXG4gICAgICAgICAgICAgICAgICAgIHBpZWNlLnByb21vdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdmFyIG5iID0gYy5jaGFyQ29kZUF0KDApO1xuICAgICAgICAgICAgICAgIGlmIChuYiA8IDU4KVxuICAgICAgICAgICAgICAgICAgICBjb2wgKz0gKGMgPT09ICcwJykgPyA5IDogbmIgLSA0ODtcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgKytjb2w7XG4gICAgICAgICAgICAgICAgICAgIHZhciByb2xlID0gYy50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcGllY2VfMSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGVzW3JvbGVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IChjID09PSByb2xlID8gc2hvZ2kgPyAnd2hpdGUnIDogJ2JsYWNrJyA6IHNob2dpID8gJ2JsYWNrJyA6ICd3aGl0ZScpXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9tb3RlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGllY2VfMS5yb2xlID0gJ3AnICsgcGllY2VfMS5yb2xlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGllY2VfMS5wcm9tb3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9tb3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNob2dpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaWVjZXNbY2cuZmlsZXNbMTAgLSBjb2wgLSAxXSArIGNnLnJhbmtzWzEwIC0gcm93XV0gPSBwaWVjZV8xO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGllY2VzW2NnLmZpbGVzW2NvbCAtIDFdICsgY2cucmFua3NbZmlyc3RSYW5rSXMwID8gcm93IC0gMSA6IHJvd11dID0gcGllY2VfMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwaWVjZXM7XG59XG5leHBvcnRzLnJlYWQgPSByZWFkO1xuZnVuY3Rpb24gd3JpdGUocGllY2VzLCBnZW9tKSB7XG4gICAgdmFyIGhlaWdodCA9IGNnLmRpbWVuc2lvbnNbZ2VvbV0uaGVpZ2h0O1xuICAgIHZhciBsZXR0ZXJzID0ge307XG4gICAgc3dpdGNoIChoZWlnaHQpIHtcbiAgICAgICAgY2FzZSAxMDpcbiAgICAgICAgICAgIGxldHRlcnMgPSBsZXR0ZXJzMTA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA5OlxuICAgICAgICAgICAgbGV0dGVycyA9IGxldHRlcnM5O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBsZXR0ZXJzID0gbGV0dGVyczg7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgO1xuICAgIHJldHVybiB1dGlsXzEuaW52TlJhbmtzLm1hcChmdW5jdGlvbiAoeSkgeyByZXR1cm4gdXRpbF8xLk5SYW5rcy5tYXAoZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgdmFyIHBpZWNlID0gcGllY2VzW3V0aWxfMS5wb3Mya2V5KFt4LCB5XSwgZ2VvbSldO1xuICAgICAgICBpZiAocGllY2UpIHtcbiAgICAgICAgICAgIHZhciBsZXR0ZXIgPSBsZXR0ZXJzW3BpZWNlLnJvbGVdO1xuICAgICAgICAgICAgcmV0dXJuIHBpZWNlLmNvbG9yID09PSAnd2hpdGUnID8gbGV0dGVyLnRvVXBwZXJDYXNlKCkgOiBsZXR0ZXI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuICcxJztcbiAgICB9KS5qb2luKCcnKTsgfSkuam9pbignLycpLnJlcGxhY2UoLzF7Mix9L2csIGZ1bmN0aW9uIChzKSB7IHJldHVybiBzLmxlbmd0aC50b1N0cmluZygpOyB9KTtcbn1cbmV4cG9ydHMud3JpdGUgPSB3cml0ZTtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xudmFyIGNnID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5mdW5jdGlvbiBkaWZmKGEsIGIpIHtcbiAgICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpO1xufVxuZnVuY3Rpb24gcGF3bihjb2xvcikge1xuICAgIHJldHVybiBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHsgcmV0dXJuIGRpZmYoeDEsIHgyKSA8IDIgJiYgKGNvbG9yID09PSAnd2hpdGUnID8gKHkyID09PSB5MSArIDEgfHwgKHkxIDw9IDIgJiYgeTIgPT09ICh5MSArIDIpICYmIHgxID09PSB4MikpIDogKHkyID09PSB5MSAtIDEgfHwgKHkxID49IDcgJiYgeTIgPT09ICh5MSAtIDIpICYmIHgxID09PSB4MikpKTsgfTtcbn1cbnZhciBrbmlnaHQgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICB2YXIgeGQgPSBkaWZmKHgxLCB4Mik7XG4gICAgdmFyIHlkID0gZGlmZih5MSwgeTIpO1xuICAgIHJldHVybiAoeGQgPT09IDEgJiYgeWQgPT09IDIpIHx8ICh4ZCA9PT0gMiAmJiB5ZCA9PT0gMSk7XG59O1xudmFyIGJpc2hvcCA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPT09IGRpZmYoeTEsIHkyKTtcbn07XG52YXIgcm9vayA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiB4MSA9PT0geDIgfHwgeTEgPT09IHkyO1xufTtcbnZhciBxdWVlbiA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBiaXNob3AoeDEsIHkxLCB4MiwgeTIpIHx8IHJvb2soeDEsIHkxLCB4MiwgeTIpO1xufTtcbmZ1bmN0aW9uIGtpbmcoY29sb3IsIHJvb2tGaWxlcywgY2FuQ2FzdGxlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMikgfHwgKGNhbkNhc3RsZSAmJiB5MSA9PT0geTIgJiYgeTEgPT09IChjb2xvciA9PT0gJ3doaXRlJyA/IDEgOiA4KSAmJiAoKHgxID09PSA1ICYmICh4MiA9PT0gMyB8fCB4MiA9PT0gNykpIHx8IHV0aWwuY29udGFpbnNYKHJvb2tGaWxlcywgeDIpKSk7IH07XG59XG52YXIgbWV0ID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpICYmIGRpZmYoeDEsIHgyKSA9PT0gMTtcbn07XG52YXIgYXJjaGJpc2hvcCA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBiaXNob3AoeDEsIHkxLCB4MiwgeTIpIHx8IGtuaWdodCh4MSwgeTEsIHgyLCB5Mik7XG59O1xudmFyIGNhbmNlbGxvciA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiByb29rKHgxLCB5MSwgeDIsIHkyKSB8fCBrbmlnaHQoeDEsIHkxLCB4MiwgeTIpO1xufTtcbmZ1bmN0aW9uIGxhbmNlKGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gKHgyID09PSB4MSAmJiAoY29sb3IgPT09ICd3aGl0ZScgPyB5MiA+IHkxIDogeTIgPCB5MSkpOyB9O1xufVxuZnVuY3Rpb24gc2lsdmVyKGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gKG1ldCh4MSwgeTEsIHgyLCB5MikgfHwgKHgxID09PSB4MiAmJiBjb2xvciA9PT0gJ3doaXRlJyA/IHkyID09PSB5MSArIDEgOiB5MiA9PT0geTEgLSAxKSk7IH07XG59XG5mdW5jdGlvbiBnb2xkKGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMiAmJiAoY29sb3IgPT09ICd3aGl0ZScgP1xuICAgICAgICAhKCh4MiA9PT0geDEgLSAxICYmIHkyID09PSB5MSAtIDEpIHx8ICh4MiA9PT0geDEgKyAxICYmIHkyID09PSB5MSAtIDEpKSA6XG4gICAgICAgICEoKHgyID09PSB4MSArIDEgJiYgeTIgPT09IHkxICsgMSkgfHwgKHgyID09PSB4MSAtIDEgJiYgeTIgPT09IHkxICsgMSkpKSk7IH07XG59XG5mdW5jdGlvbiBzcGF3bihjb2xvcikge1xuICAgIHJldHVybiBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHsgcmV0dXJuICh4MiA9PT0geDEgJiYgY29sb3IgPT09ICd3aGl0ZScgPyB5MiA9PT0geTEgKyAxIDogeTIgPT09IHkxIC0gMSk7IH07XG59XG5mdW5jdGlvbiBza25pZ2h0KGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgP1xuICAgICAgICAoeTIgPT09IHkxICsgMiAmJiB4MiA9PT0geDEgLSAxIHx8IHkyID09PSB5MSArIDIgJiYgeDIgPT09IHgxICsgMSkgOlxuICAgICAgICAoeTIgPT09IHkxIC0gMiAmJiB4MiA9PT0geDEgLSAxIHx8IHkyID09PSB5MSAtIDIgJiYgeDIgPT09IHgxICsgMSk7IH07XG59XG52YXIgcHJvb2sgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICByZXR1cm4gcm9vayh4MSwgeTEsIHgyLCB5MikgfHwgKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMik7XG59O1xudmFyIHBiaXNob3AgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICByZXR1cm4gYmlzaG9wKHgxLCB5MSwgeDIsIHkyKSB8fCAoZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyKTtcbn07XG52YXIgc2tpbmcgPSBmdW5jdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICByZXR1cm4gZGlmZih4MSwgeDIpIDwgMiAmJiBkaWZmKHkxLCB5MikgPCAyO1xufTtcbmZ1bmN0aW9uIHhwYXduKGNvbG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5MikgeyByZXR1cm4gKHgyID09PSB4MSAmJiBjb2xvciA9PT0gJ3doaXRlJyA/IHkyID09PSB5MSArIDEgOiB5MiA9PT0geTEgLSAxKTsgfTtcbn1cbnZhciB4YmlzaG9wID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpICYmIGRpZmYoeDEsIHgyKSA9PT0gMjtcbn07XG52YXIgYWR2aXNvciA9IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBkaWZmKHgxLCB4MikgPT09IGRpZmYoeTEsIHkyKSAmJiBkaWZmKHgxLCB4MikgPT09IDE7XG59O1xudmFyIHhraW5nID0gZnVuY3Rpb24gKHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuICh4MSA9PT0geDIgfHwgeTEgPT09IHkyKSAmJiBkaWZmKHgxLCB4MikgPT09IDE7XG59O1xuZnVuY3Rpb24gcm9va0ZpbGVzT2YocGllY2VzLCBjb2xvciwgZmlyc3RSYW5rSXMwKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHBpZWNlcykuZmlsdGVyKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHBpZWNlID0gcGllY2VzW2tleV07XG4gICAgICAgIHJldHVybiBwaWVjZSAmJiBwaWVjZS5jb2xvciA9PT0gY29sb3IgJiYgcGllY2Uucm9sZSA9PT0gJ3Jvb2snO1xuICAgIH0pLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiB1dGlsLmtleTJwb3Moa2V5LCBmaXJzdFJhbmtJczApWzBdOyB9KTtcbn1cbmZ1bmN0aW9uIHByZW1vdmUocGllY2VzLCBrZXksIGNhbkNhc3RsZSwgZ2VvbSkge1xuICAgIHZhciBmaXJzdFJhbmtJczAgPSBjZy5kaW1lbnNpb25zW2dlb21dLmhlaWdodCA9PT0gMTA7XG4gICAgdmFyIHBpZWNlID0gcGllY2VzW2tleV0sIHBvcyA9IHV0aWwua2V5MnBvcyhrZXksIGZpcnN0UmFua0lzMCk7XG4gICAgdmFyIG1vYmlsaXR5O1xuICAgIHN3aXRjaCAoZ2VvbSkge1xuICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICBzd2l0Y2ggKHBpZWNlLnJvbGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdwYXduJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSB4cGF3bihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Nhbm5vbic6XG4gICAgICAgICAgICAgICAgY2FzZSAncm9vayc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gcm9vaztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna25pZ2h0JzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBrbmlnaHQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0geGJpc2hvcDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYWR2aXNvcic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gYWR2aXNvcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna2luZyc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0geGtpbmc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICBzd2l0Y2ggKHBpZWNlLnJvbGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdwYXduJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBzcGF3bihwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2tuaWdodCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gc2tuaWdodChwaWVjZS5jb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gYmlzaG9wO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdyb29rJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSByb29rO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdraW5nJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBza2luZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2lsdmVyJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBzaWx2ZXIocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdwcGF3bic6XG4gICAgICAgICAgICAgICAgY2FzZSAncGxhbmNlJzpcbiAgICAgICAgICAgICAgICBjYXNlICdwa25pZ2h0JzpcbiAgICAgICAgICAgICAgICBjYXNlICdwc2lsdmVyJzpcbiAgICAgICAgICAgICAgICBjYXNlICdnb2xkJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBnb2xkKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbGFuY2UnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGxhbmNlKHBpZWNlLmNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncHJvb2snOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHByb29rO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdwYmlzaG9wJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBwYmlzaG9wO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHN3aXRjaCAocGllY2Uucm9sZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Bhd24nOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHBhd24ocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdrbmlnaHQnOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IGtuaWdodDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYmlzaG9wJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBiaXNob3A7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Jvb2snOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IHJvb2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3F1ZWVuJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBxdWVlbjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAna2luZyc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0ga2luZyhwaWVjZS5jb2xvciwgcm9va0ZpbGVzT2YocGllY2VzLCBwaWVjZS5jb2xvciwgZmlyc3RSYW5rSXMwKSwgY2FuQ2FzdGxlKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaGF3ayc6XG4gICAgICAgICAgICAgICAgY2FzZSAnYXJjaGJpc2hvcCc6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gYXJjaGJpc2hvcDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZWxlcGhhbnQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2NhbmNlbGxvcic6XG4gICAgICAgICAgICAgICAgICAgIG1vYmlsaXR5ID0gY2FuY2VsbG9yO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdtZXQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2ZlcnonOlxuICAgICAgICAgICAgICAgICAgICBtb2JpbGl0eSA9IG1ldDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2lsdmVyJzpcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHkgPSBzaWx2ZXIocGllY2UuY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDtcbiAgICB9XG4gICAgO1xuICAgIHZhciBhbGxrZXlzID0gdXRpbC5hbGxLZXlzW2dlb21dO1xuICAgIHZhciBwb3Mya2V5R2VvbSA9IGZ1bmN0aW9uIChnZW9tKSB7IHJldHVybiAoZnVuY3Rpb24gKHBvcykgeyByZXR1cm4gdXRpbC5wb3Mya2V5KHBvcywgZ2VvbSk7IH0pOyB9O1xuICAgIHZhciBwb3Mya2V5ID0gcG9zMmtleUdlb20oZ2VvbSk7XG4gICAgdmFyIGtleTJwb3NSYW5rMCA9IGZ1bmN0aW9uIChmaXJzdHJhbmswKSB7IHJldHVybiAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gdXRpbC5rZXkycG9zKGtleSwgZmlyc3RyYW5rMCk7IH0pOyB9O1xuICAgIHZhciBrZXkycG9zID0ga2V5MnBvc1JhbmswKGZpcnN0UmFua0lzMCk7XG4gICAgcmV0dXJuIGFsbGtleXMubWFwKGtleTJwb3MpLmZpbHRlcihmdW5jdGlvbiAocG9zMikge1xuICAgICAgICByZXR1cm4gKHBvc1swXSAhPT0gcG9zMlswXSB8fCBwb3NbMV0gIT09IHBvczJbMV0pICYmIG1vYmlsaXR5KHBvc1swXSwgcG9zWzFdLCBwb3MyWzBdLCBwb3MyWzFdKTtcbiAgICB9KS5tYXAocG9zMmtleSk7XG59XG5leHBvcnRzLmRlZmF1bHQgPSBwcmVtb3ZlO1xuO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbnZhciB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIHJlbmRlcihzKSB7XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IHMuZGltZW5zaW9ucy5oZWlnaHQgPT09IDEwO1xuICAgIHZhciBhc1doaXRlID0gcy5vcmllbnRhdGlvbiA9PT0gJ3doaXRlJywgcG9zVG9UcmFuc2xhdGUgPSBzLmRvbS5yZWxhdGl2ZSA/IHV0aWwucG9zVG9UcmFuc2xhdGVSZWwgOiB1dGlsLnBvc1RvVHJhbnNsYXRlQWJzKHMuZG9tLmJvdW5kcygpLCBzLmRpbWVuc2lvbnMpLCB0cmFuc2xhdGUgPSBzLmRvbS5yZWxhdGl2ZSA/IHV0aWwudHJhbnNsYXRlUmVsIDogdXRpbC50cmFuc2xhdGVBYnMsIGJvYXJkRWwgPSBzLmRvbS5lbGVtZW50cy5ib2FyZCwgcGllY2VzID0gcy5waWVjZXMsIGN1ckFuaW0gPSBzLmFuaW1hdGlvbi5jdXJyZW50LCBhbmltcyA9IGN1ckFuaW0gPyBjdXJBbmltLnBsYW4uYW5pbXMgOiB7fSwgZmFkaW5ncyA9IGN1ckFuaW0gPyBjdXJBbmltLnBsYW4uZmFkaW5ncyA6IHt9LCBjdXJEcmFnID0gcy5kcmFnZ2FibGUuY3VycmVudCwgc3F1YXJlcyA9IGNvbXB1dGVTcXVhcmVDbGFzc2VzKHMpLCBzYW1lUGllY2VzID0ge30sIHNhbWVTcXVhcmVzID0ge30sIG1vdmVkUGllY2VzID0ge30sIG1vdmVkU3F1YXJlcyA9IHt9LCBwaWVjZXNLZXlzID0gT2JqZWN0LmtleXMocGllY2VzKTtcbiAgICB2YXIgaywgcCwgZWwsIHBpZWNlQXRLZXksIGVsUGllY2VOYW1lLCBhbmltLCBmYWRpbmcsIHBNdmRzZXQsIHBNdmQsIHNNdmRzZXQsIHNNdmQ7XG4gICAgZWwgPSBib2FyZEVsLmZpcnN0Q2hpbGQ7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGsgPSBlbC5jZ0tleTtcbiAgICAgICAgaWYgKGlzUGllY2VOb2RlKGVsKSkge1xuICAgICAgICAgICAgcGllY2VBdEtleSA9IHBpZWNlc1trXTtcbiAgICAgICAgICAgIGFuaW0gPSBhbmltc1trXTtcbiAgICAgICAgICAgIGZhZGluZyA9IGZhZGluZ3Nba107XG4gICAgICAgICAgICBlbFBpZWNlTmFtZSA9IGVsLmNnUGllY2U7XG4gICAgICAgICAgICBpZiAoZWwuY2dEcmFnZ2luZyAmJiAoIWN1ckRyYWcgfHwgY3VyRHJhZy5vcmlnICE9PSBrKSkge1xuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJyk7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKGVsLCBwb3NUb1RyYW5zbGF0ZSh1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpKTtcbiAgICAgICAgICAgICAgICBlbC5jZ0RyYWdnaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWZhZGluZyAmJiBlbC5jZ0ZhZGluZykge1xuICAgICAgICAgICAgICAgIGVsLmNnRmFkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnZmFkaW5nJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGllY2VBdEtleSkge1xuICAgICAgICAgICAgICAgIGlmIChhbmltICYmIGVsLmNnQW5pbWF0aW5nICYmIGVsUGllY2VOYW1lID09PSBwaWVjZU5hbWVPZihwaWVjZUF0S2V5KSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcG9zID0gdXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdhbmltJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShlbCwgcG9zVG9UcmFuc2xhdGUocG9zLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoZWwuY2dBbmltYXRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgZWwuY2dBbmltYXRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnYW5pbScpO1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKGssIGZpcnN0UmFua0lzMCksIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocy5hZGRQaWVjZVpJbmRleClcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLnN0eWxlLnpJbmRleCA9IHBvc1pJbmRleCh1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGVsUGllY2VOYW1lID09PSBwaWVjZU5hbWVPZihwaWVjZUF0S2V5KSAmJiAoIWZhZGluZyB8fCAhZWwuY2dGYWRpbmcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNhbWVQaWVjZXNba10gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZhZGluZyAmJiBlbFBpZWNlTmFtZSA9PT0gcGllY2VOYW1lT2YoZmFkaW5nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnZmFkaW5nJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5jZ0ZhZGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXS5wdXNoKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb3ZlZFBpZWNlc1tlbFBpZWNlTmFtZV0gPSBbZWxdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKG1vdmVkUGllY2VzW2VsUGllY2VOYW1lXSlcbiAgICAgICAgICAgICAgICAgICAgbW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdLnB1c2goZWwpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgbW92ZWRQaWVjZXNbZWxQaWVjZU5hbWVdID0gW2VsXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc1NxdWFyZU5vZGUoZWwpKSB7XG4gICAgICAgICAgICB2YXIgY24gPSBlbC5jbGFzc05hbWU7XG4gICAgICAgICAgICBpZiAoc3F1YXJlc1trXSA9PT0gY24pXG4gICAgICAgICAgICAgICAgc2FtZVNxdWFyZXNba10gPSB0cnVlO1xuICAgICAgICAgICAgZWxzZSBpZiAobW92ZWRTcXVhcmVzW2NuXSlcbiAgICAgICAgICAgICAgICBtb3ZlZFNxdWFyZXNbY25dLnB1c2goZWwpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG1vdmVkU3F1YXJlc1tjbl0gPSBbZWxdO1xuICAgICAgICB9XG4gICAgICAgIGVsID0gZWwubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIGZvciAodmFyIHNrIGluIHNxdWFyZXMpIHtcbiAgICAgICAgaWYgKCFzYW1lU3F1YXJlc1tza10pIHtcbiAgICAgICAgICAgIHNNdmRzZXQgPSBtb3ZlZFNxdWFyZXNbc3F1YXJlc1tza11dO1xuICAgICAgICAgICAgc012ZCA9IHNNdmRzZXQgJiYgc012ZHNldC5wb3AoKTtcbiAgICAgICAgICAgIHZhciB0cmFuc2xhdGlvbiA9IHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKHNrLCBmaXJzdFJhbmtJczApLCBhc1doaXRlLCBzLmRpbWVuc2lvbnMpO1xuICAgICAgICAgICAgaWYgKHNNdmQpIHtcbiAgICAgICAgICAgICAgICBzTXZkLmNnS2V5ID0gc2s7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHNNdmQsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBzcXVhcmVOb2RlID0gdXRpbF8xLmNyZWF0ZUVsKCdzcXVhcmUnLCBzcXVhcmVzW3NrXSk7XG4gICAgICAgICAgICAgICAgc3F1YXJlTm9kZS5jZ0tleSA9IHNrO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShzcXVhcmVOb2RlLCB0cmFuc2xhdGlvbik7XG4gICAgICAgICAgICAgICAgYm9hcmRFbC5pbnNlcnRCZWZvcmUoc3F1YXJlTm9kZSwgYm9hcmRFbC5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKHZhciBqIGluIHBpZWNlc0tleXMpIHtcbiAgICAgICAgayA9IHBpZWNlc0tleXNbal07XG4gICAgICAgIHAgPSBwaWVjZXNba107XG4gICAgICAgIGFuaW0gPSBhbmltc1trXTtcbiAgICAgICAgaWYgKCFzYW1lUGllY2VzW2tdKSB7XG4gICAgICAgICAgICBwTXZkc2V0ID0gbW92ZWRQaWVjZXNbcGllY2VOYW1lT2YocCldO1xuICAgICAgICAgICAgcE12ZCA9IHBNdmRzZXQgJiYgcE12ZHNldC5wb3AoKTtcbiAgICAgICAgICAgIGlmIChwTXZkKSB7XG4gICAgICAgICAgICAgICAgcE12ZC5jZ0tleSA9IGs7XG4gICAgICAgICAgICAgICAgaWYgKHBNdmQuY2dGYWRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5jbGFzc0xpc3QucmVtb3ZlKCdmYWRpbmcnKTtcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5jZ0ZhZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gdXRpbF8xLmtleTJwb3MoaywgZmlyc3RSYW5rSXMwKTtcbiAgICAgICAgICAgICAgICBpZiAocy5hZGRQaWVjZVpJbmRleClcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5zdHlsZS56SW5kZXggPSBwb3NaSW5kZXgocG9zLCBhc1doaXRlKTtcbiAgICAgICAgICAgICAgICBpZiAoYW5pbSkge1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNnQW5pbWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcE12ZC5jbGFzc0xpc3QuYWRkKCdhbmltJyk7XG4gICAgICAgICAgICAgICAgICAgIHBvc1swXSArPSBhbmltWzJdO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMV0gKz0gYW5pbVszXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHBNdmQsIHBvc1RvVHJhbnNsYXRlKHBvcywgYXNXaGl0ZSwgcy5kaW1lbnNpb25zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcGllY2VOYW1lID0gcGllY2VOYW1lT2YocCksIHBpZWNlTm9kZSA9IHV0aWxfMS5jcmVhdGVFbCgncGllY2UnLCBwaWVjZU5hbWUpLCBwb3MgPSB1dGlsXzEua2V5MnBvcyhrLCBmaXJzdFJhbmtJczApO1xuICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5jZ1BpZWNlID0gcGllY2VOYW1lO1xuICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5jZ0tleSA9IGs7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnQW5pbWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUocGllY2VOb2RlLCBwb3NUb1RyYW5zbGF0ZShwb3MsIGFzV2hpdGUsIHMuZGltZW5zaW9ucykpO1xuICAgICAgICAgICAgICAgIGlmIChzLmFkZFBpZWNlWkluZGV4KVxuICAgICAgICAgICAgICAgICAgICBwaWVjZU5vZGUuc3R5bGUuekluZGV4ID0gcG9zWkluZGV4KHBvcywgYXNXaGl0ZSk7XG4gICAgICAgICAgICAgICAgYm9hcmRFbC5hcHBlbmRDaGlsZChwaWVjZU5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAodmFyIGkgaW4gbW92ZWRQaWVjZXMpXG4gICAgICAgIHJlbW92ZU5vZGVzKHMsIG1vdmVkUGllY2VzW2ldKTtcbiAgICBmb3IgKHZhciBpIGluIG1vdmVkU3F1YXJlcylcbiAgICAgICAgcmVtb3ZlTm9kZXMocywgbW92ZWRTcXVhcmVzW2ldKTtcbn1cbmV4cG9ydHMuZGVmYXVsdCA9IHJlbmRlcjtcbmZ1bmN0aW9uIGlzUGllY2VOb2RlKGVsKSB7XG4gICAgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdQSUVDRSc7XG59XG5mdW5jdGlvbiBpc1NxdWFyZU5vZGUoZWwpIHtcbiAgICByZXR1cm4gZWwudGFnTmFtZSA9PT0gJ1NRVUFSRSc7XG59XG5mdW5jdGlvbiByZW1vdmVOb2RlcyhzLCBub2Rlcykge1xuICAgIGZvciAodmFyIGkgaW4gbm9kZXMpXG4gICAgICAgIHMuZG9tLmVsZW1lbnRzLmJvYXJkLnJlbW92ZUNoaWxkKG5vZGVzW2ldKTtcbn1cbmZ1bmN0aW9uIHBvc1pJbmRleChwb3MsIGFzV2hpdGUpIHtcbiAgICB2YXIgeiA9IDIgKyAocG9zWzFdIC0gMSkgKiA4ICsgKDggLSBwb3NbMF0pO1xuICAgIGlmIChhc1doaXRlKVxuICAgICAgICB6ID0gNjcgLSB6O1xuICAgIHJldHVybiB6ICsgJyc7XG59XG5mdW5jdGlvbiBwaWVjZU5hbWVPZihwaWVjZSkge1xuICAgIHJldHVybiBwaWVjZS5jb2xvciArIFwiIFwiICsgcGllY2Uucm9sZTtcbn1cbmZ1bmN0aW9uIGNvbXB1dGVTcXVhcmVDbGFzc2VzKHMpIHtcbiAgICB2YXIgc3F1YXJlcyA9IHt9O1xuICAgIHZhciBpLCBrO1xuICAgIGlmIChzLmxhc3RNb3ZlICYmIHMuaGlnaGxpZ2h0Lmxhc3RNb3ZlKVxuICAgICAgICBmb3IgKGkgaW4gcy5sYXN0TW92ZSkge1xuICAgICAgICAgICAgaWYgKHMubGFzdE1vdmVbaV0gIT0gJ2EwJykge1xuICAgICAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLmxhc3RNb3ZlW2ldLCAnbGFzdC1tb3ZlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICBpZiAocy5jaGVjayAmJiBzLmhpZ2hsaWdodC5jaGVjaylcbiAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMuY2hlY2ssICdjaGVjaycpO1xuICAgIGlmIChzLnNlbGVjdGVkKSB7XG4gICAgICAgIGlmIChzLnNlbGVjdGVkICE9ICdhMCcpIHtcbiAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLnNlbGVjdGVkLCAnc2VsZWN0ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocy5tb3ZhYmxlLnNob3dEZXN0cykge1xuICAgICAgICAgICAgdmFyIGRlc3RzID0gcy5tb3ZhYmxlLmRlc3RzICYmIHMubW92YWJsZS5kZXN0c1tzLnNlbGVjdGVkXTtcbiAgICAgICAgICAgIGlmIChkZXN0cylcbiAgICAgICAgICAgICAgICBmb3IgKGkgaW4gZGVzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgayA9IGRlc3RzW2ldO1xuICAgICAgICAgICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgaywgJ21vdmUtZGVzdCcgKyAocy5waWVjZXNba10gPyAnIG9jJyA6ICcnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHBEZXN0cyA9IHMucHJlbW92YWJsZS5kZXN0cztcbiAgICAgICAgICAgIGlmIChwRGVzdHMpXG4gICAgICAgICAgICAgICAgZm9yIChpIGluIHBEZXN0cykge1xuICAgICAgICAgICAgICAgICAgICBrID0gcERlc3RzW2ldO1xuICAgICAgICAgICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgaywgJ3ByZW1vdmUtZGVzdCcgKyAocy5waWVjZXNba10gPyAnIG9jJyA6ICcnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHZhciBwcmVtb3ZlID0gcy5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKHByZW1vdmUpXG4gICAgICAgIGZvciAoaSBpbiBwcmVtb3ZlKVxuICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHByZW1vdmVbaV0sICdjdXJyZW50LXByZW1vdmUnKTtcbiAgICBlbHNlIGlmIChzLnByZWRyb3BwYWJsZS5jdXJyZW50KVxuICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcy5wcmVkcm9wcGFibGUuY3VycmVudC5rZXksICdjdXJyZW50LXByZW1vdmUnKTtcbiAgICB2YXIgbyA9IHMuZXhwbG9kaW5nO1xuICAgIGlmIChvKVxuICAgICAgICBmb3IgKGkgaW4gby5rZXlzKVxuICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIG8ua2V5c1tpXSwgJ2V4cGxvZGluZycgKyBvLnN0YWdlKTtcbiAgICByZXR1cm4gc3F1YXJlcztcbn1cbmZ1bmN0aW9uIGFkZFNxdWFyZShzcXVhcmVzLCBrZXksIGtsYXNzKSB7XG4gICAgaWYgKHNxdWFyZXNba2V5XSlcbiAgICAgICAgc3F1YXJlc1trZXldICs9ICcgJyArIGtsYXNzO1xuICAgIGVsc2VcbiAgICAgICAgc3F1YXJlc1trZXldID0ga2xhc3M7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBmZW4gPSByZXF1aXJlKFwiLi9mZW5cIik7XG52YXIgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIGRlZmF1bHRzKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHBpZWNlczogZmVuLnJlYWQoZmVuLmluaXRpYWwpLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3doaXRlJyxcbiAgICAgICAgdHVybkNvbG9yOiAnd2hpdGUnLFxuICAgICAgICBjb29yZGluYXRlczogdHJ1ZSxcbiAgICAgICAgYXV0b0Nhc3RsZTogdHJ1ZSxcbiAgICAgICAgdmlld09ubHk6IGZhbHNlLFxuICAgICAgICBkaXNhYmxlQ29udGV4dE1lbnU6IGZhbHNlLFxuICAgICAgICByZXNpemFibGU6IHRydWUsXG4gICAgICAgIGFkZFBpZWNlWkluZGV4OiBmYWxzZSxcbiAgICAgICAgcGllY2VLZXk6IGZhbHNlLFxuICAgICAgICBoaWdobGlnaHQ6IHtcbiAgICAgICAgICAgIGxhc3RNb3ZlOiB0cnVlLFxuICAgICAgICAgICAgY2hlY2s6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgYW5pbWF0aW9uOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgZHVyYXRpb246IDIwMFxuICAgICAgICB9LFxuICAgICAgICBtb3ZhYmxlOiB7XG4gICAgICAgICAgICBmcmVlOiB0cnVlLFxuICAgICAgICAgICAgY29sb3I6ICdib3RoJyxcbiAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcbiAgICAgICAgICAgIGV2ZW50czoge30sXG4gICAgICAgICAgICByb29rQ2FzdGxlOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIHByZW1vdmFibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBzaG93RGVzdHM6IHRydWUsXG4gICAgICAgICAgICBjYXN0bGU6IHRydWUsXG4gICAgICAgICAgICBldmVudHM6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIHByZWRyb3BwYWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICBldmVudHM6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIGRyYWdnYWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGRpc3RhbmNlOiAzLFxuICAgICAgICAgICAgYXV0b0Rpc3RhbmNlOiB0cnVlLFxuICAgICAgICAgICAgY2VudGVyUGllY2U6IHRydWUsXG4gICAgICAgICAgICBzaG93R2hvc3Q6IHRydWUsXG4gICAgICAgICAgICBkZWxldGVPbkRyb3BPZmY6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdGFibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdHM6IHtcbiAgICAgICAgICAgIGRyYWdnZWQ6ICEoJ29udG91Y2hzdGFydCcgaW4gd2luZG93KVxuICAgICAgICB9LFxuICAgICAgICBldmVudHM6IHt9LFxuICAgICAgICBkcmF3YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgICAgICBlcmFzZU9uQ2xpY2s6IHRydWUsXG4gICAgICAgICAgICBzaGFwZXM6IFtdLFxuICAgICAgICAgICAgYXV0b1NoYXBlczogW10sXG4gICAgICAgICAgICBicnVzaGVzOiB7XG4gICAgICAgICAgICAgICAgZ3JlZW46IHsga2V5OiAnZycsIGNvbG9yOiAnIzE1NzgxQicsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICByZWQ6IHsga2V5OiAncicsIGNvbG9yOiAnIzg4MjAyMCcsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICBibHVlOiB7IGtleTogJ2InLCBjb2xvcjogJyMwMDMwODgnLCBvcGFjaXR5OiAxLCBsaW5lV2lkdGg6IDEwIH0sXG4gICAgICAgICAgICAgICAgeWVsbG93OiB7IGtleTogJ3knLCBjb2xvcjogJyNlNjhmMDAnLCBvcGFjaXR5OiAxLCBsaW5lV2lkdGg6IDEwIH0sXG4gICAgICAgICAgICAgICAgcGFsZUJsdWU6IHsga2V5OiAncGInLCBjb2xvcjogJyMwMDMwODgnLCBvcGFjaXR5OiAwLjQsIGxpbmVXaWR0aDogMTUgfSxcbiAgICAgICAgICAgICAgICBwYWxlR3JlZW46IHsga2V5OiAncGcnLCBjb2xvcjogJyMxNTc4MUInLCBvcGFjaXR5OiAwLjQsIGxpbmVXaWR0aDogMTUgfSxcbiAgICAgICAgICAgICAgICBwYWxlUmVkOiB7IGtleTogJ3ByJywgY29sb3I6ICcjODgyMDIwJywgb3BhY2l0eTogMC40LCBsaW5lV2lkdGg6IDE1IH0sXG4gICAgICAgICAgICAgICAgcGFsZUdyZXk6IHsga2V5OiAncGdyJywgY29sb3I6ICcjNGE0YTRhJywgb3BhY2l0eTogMC4zNSwgbGluZVdpZHRoOiAxNSB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGllY2VzOiB7XG4gICAgICAgICAgICAgICAgYmFzZVVybDogJ2h0dHBzOi8vbGljaGVzczEub3JnL2Fzc2V0cy9waWVjZS9jYnVybmV0dC8nXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJldlN2Z0hhc2g6ICcnXG4gICAgICAgIH0sXG4gICAgICAgIGhvbGQ6IHV0aWxfMS50aW1lcigpLFxuICAgICAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiA4LCBoZWlnaHQ6IDggfSxcbiAgICAgICAgZ2VvbWV0cnk6IDAsXG4gICAgfTtcbn1cbmV4cG9ydHMuZGVmYXVsdHMgPSBkZWZhdWx0cztcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50KHRhZ05hbWUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsIHRhZ05hbWUpO1xufVxuZXhwb3J0cy5jcmVhdGVFbGVtZW50ID0gY3JlYXRlRWxlbWVudDtcbnZhciBpc1RyaWRlbnQ7XG5mdW5jdGlvbiByZW5kZXJTdmcoc3RhdGUsIHJvb3QpIHtcbiAgICB2YXIgZCA9IHN0YXRlLmRyYXdhYmxlLCBjdXJEID0gZC5jdXJyZW50LCBjdXIgPSBjdXJEICYmIGN1ckQubW91c2VTcSA/IGN1ckQgOiB1bmRlZmluZWQsIGFycm93RGVzdHMgPSB7fTtcbiAgICBkLnNoYXBlcy5jb25jYXQoZC5hdXRvU2hhcGVzKS5jb25jYXQoY3VyID8gW2N1cl0gOiBbXSkuZm9yRWFjaChmdW5jdGlvbiAocykge1xuICAgICAgICBpZiAocy5kZXN0KVxuICAgICAgICAgICAgYXJyb3dEZXN0c1tzLmRlc3RdID0gKGFycm93RGVzdHNbcy5kZXN0XSB8fCAwKSArIDE7XG4gICAgfSk7XG4gICAgdmFyIHNoYXBlcyA9IGQuc2hhcGVzLmNvbmNhdChkLmF1dG9TaGFwZXMpLm1hcChmdW5jdGlvbiAocykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2hhcGU6IHMsXG4gICAgICAgICAgICBjdXJyZW50OiBmYWxzZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChzLCBhcnJvd0Rlc3RzLCBmYWxzZSlcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBpZiAoY3VyKVxuICAgICAgICBzaGFwZXMucHVzaCh7XG4gICAgICAgICAgICBzaGFwZTogY3VyLFxuICAgICAgICAgICAgY3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChjdXIsIGFycm93RGVzdHMsIHRydWUpXG4gICAgICAgIH0pO1xuICAgIHZhciBmdWxsSGFzaCA9IHNoYXBlcy5tYXAoZnVuY3Rpb24gKHNjKSB7IHJldHVybiBzYy5oYXNoOyB9KS5qb2luKCcnKTtcbiAgICBpZiAoZnVsbEhhc2ggPT09IHN0YXRlLmRyYXdhYmxlLnByZXZTdmdIYXNoKVxuICAgICAgICByZXR1cm47XG4gICAgc3RhdGUuZHJhd2FibGUucHJldlN2Z0hhc2ggPSBmdWxsSGFzaDtcbiAgICB2YXIgZGVmc0VsID0gcm9vdC5maXJzdENoaWxkO1xuICAgIHN5bmNEZWZzKGQsIHNoYXBlcywgZGVmc0VsKTtcbiAgICBzeW5jU2hhcGVzKHN0YXRlLCBzaGFwZXMsIGQuYnJ1c2hlcywgYXJyb3dEZXN0cywgcm9vdCwgZGVmc0VsKTtcbn1cbmV4cG9ydHMucmVuZGVyU3ZnID0gcmVuZGVyU3ZnO1xuZnVuY3Rpb24gc3luY0RlZnMoZCwgc2hhcGVzLCBkZWZzRWwpIHtcbiAgICB2YXIgYnJ1c2hlcyA9IHt9O1xuICAgIHZhciBicnVzaDtcbiAgICBzaGFwZXMuZm9yRWFjaChmdW5jdGlvbiAocykge1xuICAgICAgICBpZiAocy5zaGFwZS5kZXN0KSB7XG4gICAgICAgICAgICBicnVzaCA9IGQuYnJ1c2hlc1tzLnNoYXBlLmJydXNoXTtcbiAgICAgICAgICAgIGlmIChzLnNoYXBlLm1vZGlmaWVycylcbiAgICAgICAgICAgICAgICBicnVzaCA9IG1ha2VDdXN0b21CcnVzaChicnVzaCwgcy5zaGFwZS5tb2RpZmllcnMpO1xuICAgICAgICAgICAgYnJ1c2hlc1ticnVzaC5rZXldID0gYnJ1c2g7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICB2YXIga2V5c0luRG9tID0ge307XG4gICAgdmFyIGVsID0gZGVmc0VsLmZpcnN0Q2hpbGQ7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGtleXNJbkRvbVtlbC5nZXRBdHRyaWJ1dGUoJ2NnS2V5JyldID0gdHJ1ZTtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yICh2YXIga2V5IGluIGJydXNoZXMpIHtcbiAgICAgICAgaWYgKCFrZXlzSW5Eb21ba2V5XSlcbiAgICAgICAgICAgIGRlZnNFbC5hcHBlbmRDaGlsZChyZW5kZXJNYXJrZXIoYnJ1c2hlc1trZXldKSk7XG4gICAgfVxufVxuZnVuY3Rpb24gc3luY1NoYXBlcyhzdGF0ZSwgc2hhcGVzLCBicnVzaGVzLCBhcnJvd0Rlc3RzLCByb290LCBkZWZzRWwpIHtcbiAgICBpZiAoaXNUcmlkZW50ID09PSB1bmRlZmluZWQpXG4gICAgICAgIGlzVHJpZGVudCA9IHV0aWxfMS5jb21wdXRlSXNUcmlkZW50KCk7XG4gICAgdmFyIGJvdW5kcyA9IHN0YXRlLmRvbS5ib3VuZHMoKSwgaGFzaGVzSW5Eb20gPSB7fSwgdG9SZW1vdmUgPSBbXTtcbiAgICBzaGFwZXMuZm9yRWFjaChmdW5jdGlvbiAoc2MpIHsgaGFzaGVzSW5Eb21bc2MuaGFzaF0gPSBmYWxzZTsgfSk7XG4gICAgdmFyIGVsID0gZGVmc0VsLm5leHRTaWJsaW5nLCBlbEhhc2g7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGVsSGFzaCA9IGVsLmdldEF0dHJpYnV0ZSgnY2dIYXNoJyk7XG4gICAgICAgIGlmIChoYXNoZXNJbkRvbS5oYXNPd25Qcm9wZXJ0eShlbEhhc2gpKVxuICAgICAgICAgICAgaGFzaGVzSW5Eb21bZWxIYXNoXSA9IHRydWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRvUmVtb3ZlLnB1c2goZWwpO1xuICAgICAgICBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgICB0b1JlbW92ZS5mb3JFYWNoKGZ1bmN0aW9uIChlbCkgeyByZXR1cm4gcm9vdC5yZW1vdmVDaGlsZChlbCk7IH0pO1xuICAgIHNoYXBlcy5mb3JFYWNoKGZ1bmN0aW9uIChzYykge1xuICAgICAgICBpZiAoIWhhc2hlc0luRG9tW3NjLmhhc2hdKVxuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZChyZW5kZXJTaGFwZShzdGF0ZSwgc2MsIGJydXNoZXMsIGFycm93RGVzdHMsIGJvdW5kcykpO1xuICAgIH0pO1xufVxuZnVuY3Rpb24gc2hhcGVIYXNoKF9hLCBhcnJvd0Rlc3RzLCBjdXJyZW50KSB7XG4gICAgdmFyIG9yaWcgPSBfYS5vcmlnLCBkZXN0ID0gX2EuZGVzdCwgYnJ1c2ggPSBfYS5icnVzaCwgcGllY2UgPSBfYS5waWVjZSwgbW9kaWZpZXJzID0gX2EubW9kaWZpZXJzO1xuICAgIHJldHVybiBbY3VycmVudCwgb3JpZywgZGVzdCwgYnJ1c2gsIGRlc3QgJiYgYXJyb3dEZXN0c1tkZXN0XSA+IDEsXG4gICAgICAgIHBpZWNlICYmIHBpZWNlSGFzaChwaWVjZSksXG4gICAgICAgIG1vZGlmaWVycyAmJiBtb2RpZmllcnNIYXNoKG1vZGlmaWVycylcbiAgICBdLmZpbHRlcihmdW5jdGlvbiAoeCkgeyByZXR1cm4geDsgfSkuam9pbignJyk7XG59XG5mdW5jdGlvbiBwaWVjZUhhc2gocGllY2UpIHtcbiAgICByZXR1cm4gW3BpZWNlLmNvbG9yLCBwaWVjZS5yb2xlLCBwaWVjZS5zY2FsZV0uZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiB4OyB9KS5qb2luKCcnKTtcbn1cbmZ1bmN0aW9uIG1vZGlmaWVyc0hhc2gobSkge1xuICAgIHJldHVybiAnJyArIChtLmxpbmVXaWR0aCB8fCAnJyk7XG59XG5mdW5jdGlvbiByZW5kZXJTaGFwZShzdGF0ZSwgX2EsIGJydXNoZXMsIGFycm93RGVzdHMsIGJvdW5kcykge1xuICAgIHZhciBzaGFwZSA9IF9hLnNoYXBlLCBjdXJyZW50ID0gX2EuY3VycmVudCwgaGFzaCA9IF9hLmhhc2g7XG4gICAgdmFyIGZpcnN0UmFua0lzMCA9IHN0YXRlLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICB2YXIgZWw7XG4gICAgaWYgKHNoYXBlLnBpZWNlKVxuICAgICAgICBlbCA9IHJlbmRlclBpZWNlKHN0YXRlLmRyYXdhYmxlLnBpZWNlcy5iYXNlVXJsLCBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUub3JpZywgZmlyc3RSYW5rSXMwKSwgc3RhdGUub3JpZW50YXRpb24sIHN0YXRlLmRpbWVuc2lvbnMpLCBzaGFwZS5waWVjZSwgYm91bmRzLCBzdGF0ZS5kaW1lbnNpb25zKTtcbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIG9yaWcgPSBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUub3JpZywgZmlyc3RSYW5rSXMwKSwgc3RhdGUub3JpZW50YXRpb24sIHN0YXRlLmRpbWVuc2lvbnMpO1xuICAgICAgICBpZiAoc2hhcGUub3JpZyAmJiBzaGFwZS5kZXN0KSB7XG4gICAgICAgICAgICB2YXIgYnJ1c2ggPSBicnVzaGVzW3NoYXBlLmJydXNoXTtcbiAgICAgICAgICAgIGlmIChzaGFwZS5tb2RpZmllcnMpXG4gICAgICAgICAgICAgICAgYnJ1c2ggPSBtYWtlQ3VzdG9tQnJ1c2goYnJ1c2gsIHNoYXBlLm1vZGlmaWVycyk7XG4gICAgICAgICAgICBlbCA9IHJlbmRlckFycm93KGJydXNoLCBvcmlnLCBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUuZGVzdCwgZmlyc3RSYW5rSXMwKSwgc3RhdGUub3JpZW50YXRpb24sIHN0YXRlLmRpbWVuc2lvbnMpLCBjdXJyZW50LCBhcnJvd0Rlc3RzW3NoYXBlLmRlc3RdID4gMSwgYm91bmRzLCBzdGF0ZS5kaW1lbnNpb25zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBlbCA9IHJlbmRlckNpcmNsZShicnVzaGVzW3NoYXBlLmJydXNoXSwgb3JpZywgY3VycmVudCwgYm91bmRzLCBzdGF0ZS5kaW1lbnNpb25zKTtcbiAgICB9XG4gICAgZWwuc2V0QXR0cmlidXRlKCdjZ0hhc2gnLCBoYXNoKTtcbiAgICByZXR1cm4gZWw7XG59XG5mdW5jdGlvbiByZW5kZXJDaXJjbGUoYnJ1c2gsIHBvcywgY3VycmVudCwgYm91bmRzLCBiZCkge1xuICAgIHZhciBvID0gcG9zMnB4KHBvcywgYm91bmRzLCBiZCksIHdpZHRocyA9IGNpcmNsZVdpZHRoKGJvdW5kcywgYmQpLCByYWRpdXMgPSAoYm91bmRzLndpZHRoIC8gYmQud2lkdGgpIC8gMjtcbiAgICByZXR1cm4gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdjaXJjbGUnKSwge1xuICAgICAgICBzdHJva2U6IGJydXNoLmNvbG9yLFxuICAgICAgICAnc3Ryb2tlLXdpZHRoJzogd2lkdGhzW2N1cnJlbnQgPyAwIDogMV0sXG4gICAgICAgIGZpbGw6ICdub25lJyxcbiAgICAgICAgb3BhY2l0eTogb3BhY2l0eShicnVzaCwgY3VycmVudCksXG4gICAgICAgIGN4OiBvWzBdLFxuICAgICAgICBjeTogb1sxXSxcbiAgICAgICAgcjogcmFkaXVzIC0gd2lkdGhzWzFdIC8gMlxuICAgIH0pO1xufVxuZnVuY3Rpb24gcmVuZGVyQXJyb3coYnJ1c2gsIG9yaWcsIGRlc3QsIGN1cnJlbnQsIHNob3J0ZW4sIGJvdW5kcywgYmQpIHtcbiAgICB2YXIgbSA9IGFycm93TWFyZ2luKGJvdW5kcywgc2hvcnRlbiAmJiAhY3VycmVudCwgYmQpLCBhID0gcG9zMnB4KG9yaWcsIGJvdW5kcywgYmQpLCBiID0gcG9zMnB4KGRlc3QsIGJvdW5kcywgYmQpLCBkeCA9IGJbMF0gLSBhWzBdLCBkeSA9IGJbMV0gLSBhWzFdLCBhbmdsZSA9IE1hdGguYXRhbjIoZHksIGR4KSwgeG8gPSBNYXRoLmNvcyhhbmdsZSkgKiBtLCB5byA9IE1hdGguc2luKGFuZ2xlKSAqIG07XG4gICAgcmV0dXJuIHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgnbGluZScpLCB7XG4gICAgICAgIHN0cm9rZTogYnJ1c2guY29sb3IsXG4gICAgICAgICdzdHJva2Utd2lkdGgnOiBsaW5lV2lkdGgoYnJ1c2gsIGN1cnJlbnQsIGJvdW5kcywgYmQpLFxuICAgICAgICAnc3Ryb2tlLWxpbmVjYXAnOiAncm91bmQnLFxuICAgICAgICAnbWFya2VyLWVuZCc6IGlzVHJpZGVudCA/IHVuZGVmaW5lZCA6ICd1cmwoI2Fycm93aGVhZC0nICsgYnJ1c2gua2V5ICsgJyknLFxuICAgICAgICBvcGFjaXR5OiBvcGFjaXR5KGJydXNoLCBjdXJyZW50KSxcbiAgICAgICAgeDE6IGFbMF0sXG4gICAgICAgIHkxOiBhWzFdLFxuICAgICAgICB4MjogYlswXSAtIHhvLFxuICAgICAgICB5MjogYlsxXSAtIHlvXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJQaWVjZShiYXNlVXJsLCBwb3MsIHBpZWNlLCBib3VuZHMsIGJkKSB7XG4gICAgdmFyIG8gPSBwb3MycHgocG9zLCBib3VuZHMsIGJkKSwgd2lkdGggPSBib3VuZHMud2lkdGggLyBiZC53aWR0aCAqIChwaWVjZS5zY2FsZSB8fCAxKSwgaGVpZ2h0ID0gYm91bmRzLndpZHRoIC8gYmQuaGVpZ2h0ICogKHBpZWNlLnNjYWxlIHx8IDEpLCBuYW1lID0gcGllY2UuY29sb3JbMF0gKyAocGllY2Uucm9sZSA9PT0gJ2tuaWdodCcgPyAnbicgOiBwaWVjZS5yb2xlWzBdKS50b1VwcGVyQ2FzZSgpO1xuICAgIHJldHVybiBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ2ltYWdlJyksIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwaWVjZS5yb2xlICsgXCIgXCIgKyBwaWVjZS5jb2xvcixcbiAgICAgICAgeDogb1swXSAtIHdpZHRoIC8gMixcbiAgICAgICAgeTogb1sxXSAtIGhlaWdodCAvIDIsXG4gICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgIGhyZWY6IGJhc2VVcmwgKyBuYW1lICsgJy5zdmcnXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJNYXJrZXIoYnJ1c2gpIHtcbiAgICB2YXIgbWFya2VyID0gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdtYXJrZXInKSwge1xuICAgICAgICBpZDogJ2Fycm93aGVhZC0nICsgYnJ1c2gua2V5LFxuICAgICAgICBvcmllbnQ6ICdhdXRvJyxcbiAgICAgICAgbWFya2VyV2lkdGg6IDQsXG4gICAgICAgIG1hcmtlckhlaWdodDogOCxcbiAgICAgICAgcmVmWDogMi4wNSxcbiAgICAgICAgcmVmWTogMi4wMVxuICAgIH0pO1xuICAgIG1hcmtlci5hcHBlbmRDaGlsZChzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ3BhdGgnKSwge1xuICAgICAgICBkOiAnTTAsMCBWNCBMMywyIFonLFxuICAgICAgICBmaWxsOiBicnVzaC5jb2xvclxuICAgIH0pKTtcbiAgICBtYXJrZXIuc2V0QXR0cmlidXRlKCdjZ0tleScsIGJydXNoLmtleSk7XG4gICAgcmV0dXJuIG1hcmtlcjtcbn1cbmZ1bmN0aW9uIHNldEF0dHJpYnV0ZXMoZWwsIGF0dHJzKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGF0dHJzKVxuICAgICAgICBlbC5zZXRBdHRyaWJ1dGUoa2V5LCBhdHRyc1trZXldKTtcbiAgICByZXR1cm4gZWw7XG59XG5mdW5jdGlvbiBvcmllbnQocG9zLCBjb2xvciwgYmQpIHtcbiAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyBwb3MgOiBbYmQud2lkdGggKyAxIC0gcG9zWzBdLCBiZC5oZWlnaHQgKyAxIC0gcG9zWzFdXTtcbn1cbmZ1bmN0aW9uIG1ha2VDdXN0b21CcnVzaChiYXNlLCBtb2RpZmllcnMpIHtcbiAgICB2YXIgYnJ1c2ggPSB7XG4gICAgICAgIGNvbG9yOiBiYXNlLmNvbG9yLFxuICAgICAgICBvcGFjaXR5OiBNYXRoLnJvdW5kKGJhc2Uub3BhY2l0eSAqIDEwKSAvIDEwLFxuICAgICAgICBsaW5lV2lkdGg6IE1hdGgucm91bmQobW9kaWZpZXJzLmxpbmVXaWR0aCB8fCBiYXNlLmxpbmVXaWR0aClcbiAgICB9O1xuICAgIGJydXNoLmtleSA9IFtiYXNlLmtleSwgbW9kaWZpZXJzLmxpbmVXaWR0aF0uZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiB4OyB9KS5qb2luKCcnKTtcbiAgICByZXR1cm4gYnJ1c2g7XG59XG5mdW5jdGlvbiBjaXJjbGVXaWR0aChib3VuZHMsIGJkKSB7XG4gICAgdmFyIGJhc2UgPSBib3VuZHMud2lkdGggLyAoYmQud2lkdGggKiA2NCk7XG4gICAgcmV0dXJuIFszICogYmFzZSwgNCAqIGJhc2VdO1xufVxuZnVuY3Rpb24gbGluZVdpZHRoKGJydXNoLCBjdXJyZW50LCBib3VuZHMsIGJkKSB7XG4gICAgcmV0dXJuIChicnVzaC5saW5lV2lkdGggfHwgMTApICogKGN1cnJlbnQgPyAwLjg1IDogMSkgLyAoYmQud2lkdGggKiA2NCkgKiBib3VuZHMud2lkdGg7XG59XG5mdW5jdGlvbiBvcGFjaXR5KGJydXNoLCBjdXJyZW50KSB7XG4gICAgcmV0dXJuIChicnVzaC5vcGFjaXR5IHx8IDEpICogKGN1cnJlbnQgPyAwLjkgOiAxKTtcbn1cbmZ1bmN0aW9uIGFycm93TWFyZ2luKGJvdW5kcywgc2hvcnRlbiwgYmQpIHtcbiAgICByZXR1cm4gaXNUcmlkZW50ID8gMCA6ICgoc2hvcnRlbiA/IDIwIDogMTApIC8gKGJkLndpZHRoICogNjQpICogYm91bmRzLndpZHRoKTtcbn1cbmZ1bmN0aW9uIHBvczJweChwb3MsIGJvdW5kcywgYmQpIHtcbiAgICByZXR1cm4gWyhwb3NbMF0gLSAwLjUpICogYm91bmRzLndpZHRoIC8gYmQud2lkdGgsIChiZC5oZWlnaHQgKyAwLjUgLSBwb3NbMV0pICogYm91bmRzLmhlaWdodCAvIGJkLmhlaWdodF07XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZmlsZXMgPSBbJ2EnLCAnYicsICdjJywgJ2QnLCAnZScsICdmJywgJ2cnLCAnaCcsICdpJywgJ2onXTtcbmV4cG9ydHMucmFua3MgPSBbJzAnLCAnMScsICcyJywgJzMnLCAnNCcsICc1JywgJzYnLCAnNycsICc4JywgJzknXTtcbjtcbmV4cG9ydHMuZGltZW5zaW9ucyA9IFt7IHdpZHRoOiA4LCBoZWlnaHQ6IDggfSwgeyB3aWR0aDogOSwgaGVpZ2h0OiA5IH0sIHsgd2lkdGg6IDEwLCBoZWlnaHQ6IDggfSwgeyB3aWR0aDogOSwgaGVpZ2h0OiAxMCB9XTtcbiIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIF9hLCBfYiwgX2MsIF9kO1xudmFyIGNnID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5leHBvcnRzLmNvbG9ycyA9IFsnd2hpdGUnLCAnYmxhY2snXTtcbmV4cG9ydHMuTlJhbmtzID0gWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwXTtcbmV4cG9ydHMuaW52TlJhbmtzID0gWzEwLCA5LCA4LCA3LCA2LCA1LCA0LCAzLCAyLCAxXTtcbnZhciBmaWxlczggPSBjZy5maWxlcy5zbGljZSgwLCA4KTtcbnZhciBmaWxlczkgPSBjZy5maWxlcy5zbGljZSgwLCA5KTtcbnZhciBmaWxlczEwID0gY2cuZmlsZXMuc2xpY2UoMCwgMTApO1xudmFyIHJhbmtzOCA9IGNnLnJhbmtzLnNsaWNlKDEsIDkpO1xudmFyIHJhbmtzOSA9IGNnLnJhbmtzLnNsaWNlKDEsIDEwKTtcbnZhciByYW5rczEwID0gY2cucmFua3Muc2xpY2UoMCwgMTApO1xudmFyIGFsbEtleXM4eDggPSAoX2EgPSBBcnJheS5wcm90b3R5cGUpLmNvbmNhdC5hcHBseShfYSwgZmlsZXM4Lm1hcChmdW5jdGlvbiAoYykgeyByZXR1cm4gcmFua3M4Lm1hcChmdW5jdGlvbiAocikgeyByZXR1cm4gYyArIHI7IH0pOyB9KSk7XG52YXIgYWxsS2V5czl4OSA9IChfYiA9IEFycmF5LnByb3RvdHlwZSkuY29uY2F0LmFwcGx5KF9iLCBmaWxlczkubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiByYW5rczkubWFwKGZ1bmN0aW9uIChyKSB7IHJldHVybiBjICsgcjsgfSk7IH0pKTtcbnZhciBhbGxLZXlzMTB4OCA9IChfYyA9IEFycmF5LnByb3RvdHlwZSkuY29uY2F0LmFwcGx5KF9jLCBmaWxlczEwLm1hcChmdW5jdGlvbiAoYykgeyByZXR1cm4gcmFua3M4Lm1hcChmdW5jdGlvbiAocikgeyByZXR1cm4gYyArIHI7IH0pOyB9KSk7XG52YXIgYWxsS2V5czl4MTAgPSAoX2QgPSBBcnJheS5wcm90b3R5cGUpLmNvbmNhdC5hcHBseShfZCwgZmlsZXM5Lm1hcChmdW5jdGlvbiAoYykgeyByZXR1cm4gcmFua3MxMC5tYXAoZnVuY3Rpb24gKHIpIHsgcmV0dXJuIGMgKyByOyB9KTsgfSkpO1xuZXhwb3J0cy5hbGxLZXlzID0gW2FsbEtleXM4eDgsIGFsbEtleXM5eDksIGFsbEtleXMxMHg4LCBhbGxLZXlzOXgxMF07XG5mdW5jdGlvbiBwb3Mya2V5KHBvcywgZ2VvbSkge1xuICAgIHZhciBiZCA9IGNnLmRpbWVuc2lvbnNbZ2VvbV07XG4gICAgcmV0dXJuIGV4cG9ydHMuYWxsS2V5c1tnZW9tXVtiZC5oZWlnaHQgKiBwb3NbMF0gKyBwb3NbMV0gLSBiZC5oZWlnaHQgLSAxXTtcbn1cbmV4cG9ydHMucG9zMmtleSA9IHBvczJrZXk7XG5mdW5jdGlvbiBrZXkycG9zKGssIGZpcnN0UmFua0lzMCkge1xuICAgIHZhciBzaGlmdCA9IGZpcnN0UmFua0lzMCA/IDEgOiAwO1xuICAgIHJldHVybiBbay5jaGFyQ29kZUF0KDApIC0gOTYsIGsuY2hhckNvZGVBdCgxKSAtIDQ4ICsgc2hpZnRdO1xufVxuZXhwb3J0cy5rZXkycG9zID0ga2V5MnBvcztcbmZ1bmN0aW9uIG1lbW8oZikge1xuICAgIHZhciB2O1xuICAgIHZhciByZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh2ID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB2ID0gZigpO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9O1xuICAgIHJldC5jbGVhciA9IGZ1bmN0aW9uICgpIHsgdiA9IHVuZGVmaW5lZDsgfTtcbiAgICByZXR1cm4gcmV0O1xufVxuZXhwb3J0cy5tZW1vID0gbWVtbztcbmV4cG9ydHMudGltZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN0YXJ0QXQ7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uICgpIHsgc3RhcnRBdCA9IERhdGUubm93KCk7IH0sXG4gICAgICAgIGNhbmNlbDogZnVuY3Rpb24gKCkgeyBzdGFydEF0ID0gdW5kZWZpbmVkOyB9LFxuICAgICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXJ0QXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgdGltZSA9IERhdGUubm93KCkgLSBzdGFydEF0O1xuICAgICAgICAgICAgc3RhcnRBdCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHJldHVybiB0aW1lO1xuICAgICAgICB9XG4gICAgfTtcbn07XG5leHBvcnRzLm9wcG9zaXRlID0gZnVuY3Rpb24gKGMpIHsgcmV0dXJuIGMgPT09ICd3aGl0ZScgPyAnYmxhY2snIDogJ3doaXRlJzsgfTtcbmZ1bmN0aW9uIGNvbnRhaW5zWCh4cywgeCkge1xuICAgIHJldHVybiB4cyAhPT0gdW5kZWZpbmVkICYmIHhzLmluZGV4T2YoeCkgIT09IC0xO1xufVxuZXhwb3J0cy5jb250YWluc1ggPSBjb250YWluc1g7XG5leHBvcnRzLmRpc3RhbmNlU3EgPSBmdW5jdGlvbiAocG9zMSwgcG9zMikge1xuICAgIHJldHVybiBNYXRoLnBvdyhwb3MxWzBdIC0gcG9zMlswXSwgMikgKyBNYXRoLnBvdyhwb3MxWzFdIC0gcG9zMlsxXSwgMik7XG59O1xuZXhwb3J0cy5zYW1lUGllY2UgPSBmdW5jdGlvbiAocDEsIHAyKSB7XG4gICAgcmV0dXJuIHAxLnJvbGUgPT09IHAyLnJvbGUgJiYgcDEuY29sb3IgPT09IHAyLmNvbG9yO1xufTtcbmV4cG9ydHMuY29tcHV0ZUlzVHJpZGVudCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHdpbmRvdy5uYXZpZ2F0b3IudXNlckFnZW50LmluZGV4T2YoJ1RyaWRlbnQvJykgPiAtMTsgfTtcbnZhciBwb3NUb1RyYW5zbGF0ZUJhc2UgPSBmdW5jdGlvbiAocG9zLCBhc1doaXRlLCB4RmFjdG9yLCB5RmFjdG9yLCBidCkgeyByZXR1cm4gW1xuICAgIChhc1doaXRlID8gcG9zWzBdIC0gMSA6IGJ0LndpZHRoIC0gcG9zWzBdKSAqIHhGYWN0b3IsXG4gICAgKGFzV2hpdGUgPyBidC5oZWlnaHQgLSBwb3NbMV0gOiBwb3NbMV0gLSAxKSAqIHlGYWN0b3Jcbl07IH07XG5leHBvcnRzLnBvc1RvVHJhbnNsYXRlQWJzID0gZnVuY3Rpb24gKGJvdW5kcywgYnQpIHtcbiAgICB2YXIgeEZhY3RvciA9IGJvdW5kcy53aWR0aCAvIGJ0LndpZHRoLCB5RmFjdG9yID0gYm91bmRzLmhlaWdodCAvIGJ0LmhlaWdodDtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHBvcywgYXNXaGl0ZSkgeyByZXR1cm4gcG9zVG9UcmFuc2xhdGVCYXNlKHBvcywgYXNXaGl0ZSwgeEZhY3RvciwgeUZhY3RvciwgYnQpOyB9O1xufTtcbmV4cG9ydHMucG9zVG9UcmFuc2xhdGVSZWwgPSBmdW5jdGlvbiAocG9zLCBhc1doaXRlLCBidCkgeyByZXR1cm4gcG9zVG9UcmFuc2xhdGVCYXNlKHBvcywgYXNXaGl0ZSwgMTAwIC8gYnQud2lkdGgsIDEwMCAvIGJ0LmhlaWdodCwgYnQpOyB9O1xuZXhwb3J0cy50cmFuc2xhdGVBYnMgPSBmdW5jdGlvbiAoZWwsIHBvcykge1xuICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IFwidHJhbnNsYXRlKFwiICsgcG9zWzBdICsgXCJweCxcIiArIHBvc1sxXSArIFwicHgpXCI7XG59O1xuZXhwb3J0cy50cmFuc2xhdGVSZWwgPSBmdW5jdGlvbiAoZWwsIHBlcmNlbnRzKSB7XG4gICAgZWwuc3R5bGUubGVmdCA9IHBlcmNlbnRzWzBdICsgJyUnO1xuICAgIGVsLnN0eWxlLnRvcCA9IHBlcmNlbnRzWzFdICsgJyUnO1xufTtcbmV4cG9ydHMuc2V0VmlzaWJsZSA9IGZ1bmN0aW9uIChlbCwgdikge1xuICAgIGVsLnN0eWxlLnZpc2liaWxpdHkgPSB2ID8gJ3Zpc2libGUnIDogJ2hpZGRlbic7XG59O1xuZXhwb3J0cy5ldmVudFBvc2l0aW9uID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS5jbGllbnRYIHx8IGUuY2xpZW50WCA9PT0gMClcbiAgICAgICAgcmV0dXJuIFtlLmNsaWVudFgsIGUuY2xpZW50WV07XG4gICAgaWYgKGUudG91Y2hlcyAmJiBlLnRhcmdldFRvdWNoZXNbMF0pXG4gICAgICAgIHJldHVybiBbZS50YXJnZXRUb3VjaGVzWzBdLmNsaWVudFgsIGUudGFyZ2V0VG91Y2hlc1swXS5jbGllbnRZXTtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcbmV4cG9ydHMuaXNSaWdodEJ1dHRvbiA9IGZ1bmN0aW9uIChlKSB7IHJldHVybiBlLmJ1dHRvbnMgPT09IDIgfHwgZS5idXR0b24gPT09IDI7IH07XG5leHBvcnRzLmNyZWF0ZUVsID0gZnVuY3Rpb24gKHRhZ05hbWUsIGNsYXNzTmFtZSkge1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG4gICAgaWYgKGNsYXNzTmFtZSlcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIHJldHVybiBlbDtcbn07XG5leHBvcnRzLnJhZiA9ICh3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5zZXRUaW1lb3V0KS5iaW5kKHdpbmRvdyk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xudmFyIHR5cGVzXzEgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbnZhciBzdmdfMSA9IHJlcXVpcmUoXCIuL3N2Z1wiKTtcbmZ1bmN0aW9uIHdyYXAoZWxlbWVudCwgcywgYm91bmRzKSB7XG4gICAgZWxlbWVudC5pbm5lckhUTUwgPSAnJztcbiAgICBlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NnLWJvYXJkLXdyYXAnKTtcbiAgICB1dGlsXzEuY29sb3JzLmZvckVhY2goZnVuY3Rpb24gKGMpIHtcbiAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdvcmllbnRhdGlvbi0nICsgYywgcy5vcmllbnRhdGlvbiA9PT0gYyk7XG4gICAgfSk7XG4gICAgZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtYW5pcHVsYWJsZScsICFzLnZpZXdPbmx5KTtcbiAgICB2YXIgZXh0ZW5zaW9uID0gdXRpbF8xLmNyZWF0ZUVsKCdkaXYnLCAnZXh0ZW5zaW9uJyk7XG4gICAgZWxlbWVudC5hcHBlbmRDaGlsZChleHRlbnNpb24pO1xuICAgIHZhciBib2FyZCA9IHV0aWxfMS5jcmVhdGVFbCgnZGl2JywgJ2NnLWJvYXJkJyk7XG4gICAgZWxlbWVudC5hcHBlbmRDaGlsZChib2FyZCk7XG4gICAgdmFyIHN2ZztcbiAgICBpZiAocy5kcmF3YWJsZS52aXNpYmxlICYmIGJvdW5kcykge1xuICAgICAgICBzdmcgPSBzdmdfMS5jcmVhdGVFbGVtZW50KCdzdmcnKTtcbiAgICAgICAgc3ZnLmFwcGVuZENoaWxkKHN2Z18xLmNyZWF0ZUVsZW1lbnQoJ2RlZnMnKSk7XG4gICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoc3ZnKTtcbiAgICB9XG4gICAgaWYgKHMuY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgdmFyIG9yaWVudENsYXNzID0gcy5vcmllbnRhdGlvbiA9PT0gJ2JsYWNrJyA/ICcgYmxhY2snIDogJyc7XG4gICAgICAgIHZhciBmaXJzdFJhbmtJczAgPSBzLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcbiAgICAgICAgdmFyIHNoaWZ0ID0gZmlyc3RSYW5rSXMwID8gMCA6IDE7XG4gICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQocmVuZGVyQ29vcmRzKHR5cGVzXzEucmFua3Muc2xpY2Uoc2hpZnQsIHMuZGltZW5zaW9ucy5oZWlnaHQgKyBzaGlmdCksICdyYW5rcycgKyBvcmllbnRDbGFzcykpO1xuICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKHJlbmRlckNvb3Jkcyh0eXBlc18xLmZpbGVzLnNsaWNlKDAsIHMuZGltZW5zaW9ucy53aWR0aCksICdmaWxlcycgKyBvcmllbnRDbGFzcykpO1xuICAgIH1cbiAgICB2YXIgZ2hvc3Q7XG4gICAgaWYgKGJvdW5kcyAmJiBzLmRyYWdnYWJsZS5zaG93R2hvc3QpIHtcbiAgICAgICAgZ2hvc3QgPSB1dGlsXzEuY3JlYXRlRWwoJ3BpZWNlJywgJ2dob3N0Jyk7XG4gICAgICAgIHV0aWxfMS5zZXRWaXNpYmxlKGdob3N0LCBmYWxzZSk7XG4gICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoZ2hvc3QpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBib2FyZDogYm9hcmQsXG4gICAgICAgIGdob3N0OiBnaG9zdCxcbiAgICAgICAgc3ZnOiBzdmdcbiAgICB9O1xufVxuZXhwb3J0cy5kZWZhdWx0ID0gd3JhcDtcbmZ1bmN0aW9uIHJlbmRlckNvb3JkcyhlbGVtcywgY2xhc3NOYW1lKSB7XG4gICAgdmFyIGVsID0gdXRpbF8xLmNyZWF0ZUVsKCdjb29yZHMnLCBjbGFzc05hbWUpO1xuICAgIHZhciBmO1xuICAgIGZvciAodmFyIGkgaW4gZWxlbXMpIHtcbiAgICAgICAgZiA9IHV0aWxfMS5jcmVhdGVFbCgnY29vcmQnKTtcbiAgICAgICAgZi50ZXh0Q29udGVudCA9IGVsZW1zW2ldO1xuICAgICAgICBlbC5hcHBlbmRDaGlsZChmKTtcbiAgICB9XG4gICAgcmV0dXJuIGVsO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdm5vZGVfMSA9IHJlcXVpcmUoXCIuL3Zub2RlXCIpO1xudmFyIGlzID0gcmVxdWlyZShcIi4vaXNcIik7XG5mdW5jdGlvbiBhZGROUyhkYXRhLCBjaGlsZHJlbiwgc2VsKSB7XG4gICAgZGF0YS5ucyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG4gICAgaWYgKHNlbCAhPT0gJ2ZvcmVpZ25PYmplY3QnICYmIGNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoaWxkRGF0YSA9IGNoaWxkcmVuW2ldLmRhdGE7XG4gICAgICAgICAgICBpZiAoY2hpbGREYXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBhZGROUyhjaGlsZERhdGEsIGNoaWxkcmVuW2ldLmNoaWxkcmVuLCBjaGlsZHJlbltpXS5zZWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gaChzZWwsIGIsIGMpIHtcbiAgICB2YXIgZGF0YSA9IHt9LCBjaGlsZHJlbiwgdGV4dCwgaTtcbiAgICBpZiAoYyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRhdGEgPSBiO1xuICAgICAgICBpZiAoaXMuYXJyYXkoYykpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gYztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUoYykpIHtcbiAgICAgICAgICAgIHRleHQgPSBjO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGMgJiYgYy5zZWwpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gW2NdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoaXMuYXJyYXkoYikpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gYjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUoYikpIHtcbiAgICAgICAgICAgIHRleHQgPSBiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGIgJiYgYi5zZWwpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gW2JdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZGF0YSA9IGI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBpZiAoaXMucHJpbWl0aXZlKGNoaWxkcmVuW2ldKSlcbiAgICAgICAgICAgICAgICBjaGlsZHJlbltpXSA9IHZub2RlXzEudm5vZGUodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY2hpbGRyZW5baV0sIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHNlbFswXSA9PT0gJ3MnICYmIHNlbFsxXSA9PT0gJ3YnICYmIHNlbFsyXSA9PT0gJ2cnICYmXG4gICAgICAgIChzZWwubGVuZ3RoID09PSAzIHx8IHNlbFszXSA9PT0gJy4nIHx8IHNlbFszXSA9PT0gJyMnKSkge1xuICAgICAgICBhZGROUyhkYXRhLCBjaGlsZHJlbiwgc2VsKTtcbiAgICB9XG4gICAgcmV0dXJuIHZub2RlXzEudm5vZGUoc2VsLCBkYXRhLCBjaGlsZHJlbiwgdGV4dCwgdW5kZWZpbmVkKTtcbn1cbmV4cG9ydHMuaCA9IGg7XG47XG5leHBvcnRzLmRlZmF1bHQgPSBoO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aC5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQodGFnTmFtZSkge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpO1xufVxuZnVuY3Rpb24gY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZVVSSSwgcXVhbGlmaWVkTmFtZSkge1xuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlVVJJLCBxdWFsaWZpZWROYW1lKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZVRleHROb2RlKHRleHQpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG59XG5mdW5jdGlvbiBjcmVhdGVDb21tZW50KHRleHQpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCh0ZXh0KTtcbn1cbmZ1bmN0aW9uIGluc2VydEJlZm9yZShwYXJlbnROb2RlLCBuZXdOb2RlLCByZWZlcmVuY2VOb2RlKSB7XG4gICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobmV3Tm9kZSwgcmVmZXJlbmNlTm9kZSk7XG59XG5mdW5jdGlvbiByZW1vdmVDaGlsZChub2RlLCBjaGlsZCkge1xuICAgIG5vZGUucmVtb3ZlQ2hpbGQoY2hpbGQpO1xufVxuZnVuY3Rpb24gYXBwZW5kQ2hpbGQobm9kZSwgY2hpbGQpIHtcbiAgICBub2RlLmFwcGVuZENoaWxkKGNoaWxkKTtcbn1cbmZ1bmN0aW9uIHBhcmVudE5vZGUobm9kZSkge1xuICAgIHJldHVybiBub2RlLnBhcmVudE5vZGU7XG59XG5mdW5jdGlvbiBuZXh0U2libGluZyhub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubmV4dFNpYmxpbmc7XG59XG5mdW5jdGlvbiB0YWdOYW1lKGVsbSkge1xuICAgIHJldHVybiBlbG0udGFnTmFtZTtcbn1cbmZ1bmN0aW9uIHNldFRleHRDb250ZW50KG5vZGUsIHRleHQpIHtcbiAgICBub2RlLnRleHRDb250ZW50ID0gdGV4dDtcbn1cbmZ1bmN0aW9uIGdldFRleHRDb250ZW50KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS50ZXh0Q29udGVudDtcbn1cbmZ1bmN0aW9uIGlzRWxlbWVudChub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDE7XG59XG5mdW5jdGlvbiBpc1RleHQobm9kZSkge1xuICAgIHJldHVybiBub2RlLm5vZGVUeXBlID09PSAzO1xufVxuZnVuY3Rpb24gaXNDb21tZW50KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5ub2RlVHlwZSA9PT0gODtcbn1cbmV4cG9ydHMuaHRtbERvbUFwaSA9IHtcbiAgICBjcmVhdGVFbGVtZW50OiBjcmVhdGVFbGVtZW50LFxuICAgIGNyZWF0ZUVsZW1lbnROUzogY3JlYXRlRWxlbWVudE5TLFxuICAgIGNyZWF0ZVRleHROb2RlOiBjcmVhdGVUZXh0Tm9kZSxcbiAgICBjcmVhdGVDb21tZW50OiBjcmVhdGVDb21tZW50LFxuICAgIGluc2VydEJlZm9yZTogaW5zZXJ0QmVmb3JlLFxuICAgIHJlbW92ZUNoaWxkOiByZW1vdmVDaGlsZCxcbiAgICBhcHBlbmRDaGlsZDogYXBwZW5kQ2hpbGQsXG4gICAgcGFyZW50Tm9kZTogcGFyZW50Tm9kZSxcbiAgICBuZXh0U2libGluZzogbmV4dFNpYmxpbmcsXG4gICAgdGFnTmFtZTogdGFnTmFtZSxcbiAgICBzZXRUZXh0Q29udGVudDogc2V0VGV4dENvbnRlbnQsXG4gICAgZ2V0VGV4dENvbnRlbnQ6IGdldFRleHRDb250ZW50LFxuICAgIGlzRWxlbWVudDogaXNFbGVtZW50LFxuICAgIGlzVGV4dDogaXNUZXh0LFxuICAgIGlzQ29tbWVudDogaXNDb21tZW50LFxufTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydHMuaHRtbERvbUFwaTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWh0bWxkb21hcGkuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmFycmF5ID0gQXJyYXkuaXNBcnJheTtcbmZ1bmN0aW9uIHByaW1pdGl2ZShzKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBzID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgcyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLnByaW1pdGl2ZSA9IHByaW1pdGl2ZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWlzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHhsaW5rTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayc7XG52YXIgeG1sTlMgPSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJztcbnZhciBjb2xvbkNoYXIgPSA1ODtcbnZhciB4Q2hhciA9IDEyMDtcbmZ1bmN0aW9uIHVwZGF0ZUF0dHJzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBrZXksIGVsbSA9IHZub2RlLmVsbSwgb2xkQXR0cnMgPSBvbGRWbm9kZS5kYXRhLmF0dHJzLCBhdHRycyA9IHZub2RlLmRhdGEuYXR0cnM7XG4gICAgaWYgKCFvbGRBdHRycyAmJiAhYXR0cnMpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAob2xkQXR0cnMgPT09IGF0dHJzKVxuICAgICAgICByZXR1cm47XG4gICAgb2xkQXR0cnMgPSBvbGRBdHRycyB8fCB7fTtcbiAgICBhdHRycyA9IGF0dHJzIHx8IHt9O1xuICAgIC8vIHVwZGF0ZSBtb2RpZmllZCBhdHRyaWJ1dGVzLCBhZGQgbmV3IGF0dHJpYnV0ZXNcbiAgICBmb3IgKGtleSBpbiBhdHRycykge1xuICAgICAgICB2YXIgY3VyID0gYXR0cnNba2V5XTtcbiAgICAgICAgdmFyIG9sZCA9IG9sZEF0dHJzW2tleV07XG4gICAgICAgIGlmIChvbGQgIT09IGN1cikge1xuICAgICAgICAgICAgaWYgKGN1ciA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoa2V5LCBcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGN1ciA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBlbG0ucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5LmNoYXJDb2RlQXQoMCkgIT09IHhDaGFyKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoa2V5LCBjdXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChrZXkuY2hhckNvZGVBdCgzKSA9PT0gY29sb25DaGFyKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc3VtZSB4bWwgbmFtZXNwYWNlXG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGVOUyh4bWxOUywga2V5LCBjdXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChrZXkuY2hhckNvZGVBdCg1KSA9PT0gY29sb25DaGFyKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc3VtZSB4bGluayBuYW1lc3BhY2VcbiAgICAgICAgICAgICAgICAgICAgZWxtLnNldEF0dHJpYnV0ZU5TKHhsaW5rTlMsIGtleSwgY3VyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoa2V5LCBjdXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICAvLyByZW1vdmUgcmVtb3ZlZCBhdHRyaWJ1dGVzXG4gICAgLy8gdXNlIGBpbmAgb3BlcmF0b3Igc2luY2UgdGhlIHByZXZpb3VzIGBmb3JgIGl0ZXJhdGlvbiB1c2VzIGl0ICguaS5lLiBhZGQgZXZlbiBhdHRyaWJ1dGVzIHdpdGggdW5kZWZpbmVkIHZhbHVlKVxuICAgIC8vIHRoZSBvdGhlciBvcHRpb24gaXMgdG8gcmVtb3ZlIGFsbCBhdHRyaWJ1dGVzIHdpdGggdmFsdWUgPT0gdW5kZWZpbmVkXG4gICAgZm9yIChrZXkgaW4gb2xkQXR0cnMpIHtcbiAgICAgICAgaWYgKCEoa2V5IGluIGF0dHJzKSkge1xuICAgICAgICAgICAgZWxtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0cy5hdHRyaWJ1dGVzTW9kdWxlID0geyBjcmVhdGU6IHVwZGF0ZUF0dHJzLCB1cGRhdGU6IHVwZGF0ZUF0dHJzIH07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmF0dHJpYnV0ZXNNb2R1bGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1hdHRyaWJ1dGVzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZnVuY3Rpb24gdXBkYXRlQ2xhc3Mob2xkVm5vZGUsIHZub2RlKSB7XG4gICAgdmFyIGN1ciwgbmFtZSwgZWxtID0gdm5vZGUuZWxtLCBvbGRDbGFzcyA9IG9sZFZub2RlLmRhdGEuY2xhc3MsIGtsYXNzID0gdm5vZGUuZGF0YS5jbGFzcztcbiAgICBpZiAoIW9sZENsYXNzICYmICFrbGFzcylcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChvbGRDbGFzcyA9PT0ga2xhc3MpXG4gICAgICAgIHJldHVybjtcbiAgICBvbGRDbGFzcyA9IG9sZENsYXNzIHx8IHt9O1xuICAgIGtsYXNzID0ga2xhc3MgfHwge307XG4gICAgZm9yIChuYW1lIGluIG9sZENsYXNzKSB7XG4gICAgICAgIGlmICgha2xhc3NbbmFtZV0pIHtcbiAgICAgICAgICAgIGVsbS5jbGFzc0xpc3QucmVtb3ZlKG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobmFtZSBpbiBrbGFzcykge1xuICAgICAgICBjdXIgPSBrbGFzc1tuYW1lXTtcbiAgICAgICAgaWYgKGN1ciAhPT0gb2xkQ2xhc3NbbmFtZV0pIHtcbiAgICAgICAgICAgIGVsbS5jbGFzc0xpc3RbY3VyID8gJ2FkZCcgOiAncmVtb3ZlJ10obmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnRzLmNsYXNzTW9kdWxlID0geyBjcmVhdGU6IHVwZGF0ZUNsYXNzLCB1cGRhdGU6IHVwZGF0ZUNsYXNzIH07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLmNsYXNzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9Y2xhc3MuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiBpbnZva2VIYW5kbGVyKGhhbmRsZXIsIHZub2RlLCBldmVudCkge1xuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIC8vIGNhbGwgZnVuY3Rpb24gaGFuZGxlclxuICAgICAgICBoYW5kbGVyLmNhbGwodm5vZGUsIGV2ZW50LCB2bm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBoYW5kbGVyID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIC8vIGNhbGwgaGFuZGxlciB3aXRoIGFyZ3VtZW50c1xuICAgICAgICBpZiAodHlwZW9mIGhhbmRsZXJbMF0gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgLy8gc3BlY2lhbCBjYXNlIGZvciBzaW5nbGUgYXJndW1lbnQgZm9yIHBlcmZvcm1hbmNlXG4gICAgICAgICAgICBpZiAoaGFuZGxlci5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVyWzBdLmNhbGwodm5vZGUsIGhhbmRsZXJbMV0sIGV2ZW50LCB2bm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IGhhbmRsZXIuc2xpY2UoMSk7XG4gICAgICAgICAgICAgICAgYXJncy5wdXNoKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBhcmdzLnB1c2godm5vZGUpO1xuICAgICAgICAgICAgICAgIGhhbmRsZXJbMF0uYXBwbHkodm5vZGUsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gY2FsbCBtdWx0aXBsZSBoYW5kbGVyc1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYW5kbGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaW52b2tlSGFuZGxlcihoYW5kbGVyW2ldLCB2bm9kZSwgZXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gaGFuZGxlRXZlbnQoZXZlbnQsIHZub2RlKSB7XG4gICAgdmFyIG5hbWUgPSBldmVudC50eXBlLCBvbiA9IHZub2RlLmRhdGEub247XG4gICAgLy8gY2FsbCBldmVudCBoYW5kbGVyKHMpIGlmIGV4aXN0c1xuICAgIGlmIChvbiAmJiBvbltuYW1lXSkge1xuICAgICAgICBpbnZva2VIYW5kbGVyKG9uW25hbWVdLCB2bm9kZSwgZXZlbnQpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGNyZWF0ZUxpc3RlbmVyKCkge1xuICAgIHJldHVybiBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50KSB7XG4gICAgICAgIGhhbmRsZUV2ZW50KGV2ZW50LCBoYW5kbGVyLnZub2RlKTtcbiAgICB9O1xufVxuZnVuY3Rpb24gdXBkYXRlRXZlbnRMaXN0ZW5lcnMob2xkVm5vZGUsIHZub2RlKSB7XG4gICAgdmFyIG9sZE9uID0gb2xkVm5vZGUuZGF0YS5vbiwgb2xkTGlzdGVuZXIgPSBvbGRWbm9kZS5saXN0ZW5lciwgb2xkRWxtID0gb2xkVm5vZGUuZWxtLCBvbiA9IHZub2RlICYmIHZub2RlLmRhdGEub24sIGVsbSA9ICh2bm9kZSAmJiB2bm9kZS5lbG0pLCBuYW1lO1xuICAgIC8vIG9wdGltaXphdGlvbiBmb3IgcmV1c2VkIGltbXV0YWJsZSBoYW5kbGVyc1xuICAgIGlmIChvbGRPbiA9PT0gb24pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyByZW1vdmUgZXhpc3RpbmcgbGlzdGVuZXJzIHdoaWNoIG5vIGxvbmdlciB1c2VkXG4gICAgaWYgKG9sZE9uICYmIG9sZExpc3RlbmVyKSB7XG4gICAgICAgIC8vIGlmIGVsZW1lbnQgY2hhbmdlZCBvciBkZWxldGVkIHdlIHJlbW92ZSBhbGwgZXhpc3RpbmcgbGlzdGVuZXJzIHVuY29uZGl0aW9uYWxseVxuICAgICAgICBpZiAoIW9uKSB7XG4gICAgICAgICAgICBmb3IgKG5hbWUgaW4gb2xkT24pIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgbGlzdGVuZXIgaWYgZWxlbWVudCB3YXMgY2hhbmdlZCBvciBleGlzdGluZyBsaXN0ZW5lcnMgcmVtb3ZlZFxuICAgICAgICAgICAgICAgIG9sZEVsbS5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIG9sZExpc3RlbmVyLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb3IgKG5hbWUgaW4gb2xkT24pIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgbGlzdGVuZXIgaWYgZXhpc3RpbmcgbGlzdGVuZXIgcmVtb3ZlZFxuICAgICAgICAgICAgICAgIGlmICghb25bbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgb2xkRWxtLnJlbW92ZUV2ZW50TGlzdGVuZXIobmFtZSwgb2xkTGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gYWRkIG5ldyBsaXN0ZW5lcnMgd2hpY2ggaGFzIG5vdCBhbHJlYWR5IGF0dGFjaGVkXG4gICAgaWYgKG9uKSB7XG4gICAgICAgIC8vIHJldXNlIGV4aXN0aW5nIGxpc3RlbmVyIG9yIGNyZWF0ZSBuZXdcbiAgICAgICAgdmFyIGxpc3RlbmVyID0gdm5vZGUubGlzdGVuZXIgPSBvbGRWbm9kZS5saXN0ZW5lciB8fCBjcmVhdGVMaXN0ZW5lcigpO1xuICAgICAgICAvLyB1cGRhdGUgdm5vZGUgZm9yIGxpc3RlbmVyXG4gICAgICAgIGxpc3RlbmVyLnZub2RlID0gdm5vZGU7XG4gICAgICAgIC8vIGlmIGVsZW1lbnQgY2hhbmdlZCBvciBhZGRlZCB3ZSBhZGQgYWxsIG5lZWRlZCBsaXN0ZW5lcnMgdW5jb25kaXRpb25hbGx5XG4gICAgICAgIGlmICghb2xkT24pIHtcbiAgICAgICAgICAgIGZvciAobmFtZSBpbiBvbikge1xuICAgICAgICAgICAgICAgIC8vIGFkZCBsaXN0ZW5lciBpZiBlbGVtZW50IHdhcyBjaGFuZ2VkIG9yIG5ldyBsaXN0ZW5lcnMgYWRkZWRcbiAgICAgICAgICAgICAgICBlbG0uYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCBsaXN0ZW5lciwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9yIChuYW1lIGluIG9uKSB7XG4gICAgICAgICAgICAgICAgLy8gYWRkIGxpc3RlbmVyIGlmIG5ldyBsaXN0ZW5lciBhZGRlZFxuICAgICAgICAgICAgICAgIGlmICghb2xkT25bbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZWxtLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgbGlzdGVuZXIsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnRzLmV2ZW50TGlzdGVuZXJzTW9kdWxlID0ge1xuICAgIGNyZWF0ZTogdXBkYXRlRXZlbnRMaXN0ZW5lcnMsXG4gICAgdXBkYXRlOiB1cGRhdGVFdmVudExpc3RlbmVycyxcbiAgICBkZXN0cm95OiB1cGRhdGVFdmVudExpc3RlbmVyc1xufTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydHMuZXZlbnRMaXN0ZW5lcnNNb2R1bGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1ldmVudGxpc3RlbmVycy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmZ1bmN0aW9uIHVwZGF0ZVByb3BzKG9sZFZub2RlLCB2bm9kZSkge1xuICAgIHZhciBrZXksIGN1ciwgb2xkLCBlbG0gPSB2bm9kZS5lbG0sIG9sZFByb3BzID0gb2xkVm5vZGUuZGF0YS5wcm9wcywgcHJvcHMgPSB2bm9kZS5kYXRhLnByb3BzO1xuICAgIGlmICghb2xkUHJvcHMgJiYgIXByb3BzKVxuICAgICAgICByZXR1cm47XG4gICAgaWYgKG9sZFByb3BzID09PSBwcm9wcylcbiAgICAgICAgcmV0dXJuO1xuICAgIG9sZFByb3BzID0gb2xkUHJvcHMgfHwge307XG4gICAgcHJvcHMgPSBwcm9wcyB8fCB7fTtcbiAgICBmb3IgKGtleSBpbiBvbGRQcm9wcykge1xuICAgICAgICBpZiAoIXByb3BzW2tleV0pIHtcbiAgICAgICAgICAgIGRlbGV0ZSBlbG1ba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGtleSBpbiBwcm9wcykge1xuICAgICAgICBjdXIgPSBwcm9wc1trZXldO1xuICAgICAgICBvbGQgPSBvbGRQcm9wc1trZXldO1xuICAgICAgICBpZiAob2xkICE9PSBjdXIgJiYgKGtleSAhPT0gJ3ZhbHVlJyB8fCBlbG1ba2V5XSAhPT0gY3VyKSkge1xuICAgICAgICAgICAgZWxtW2tleV0gPSBjdXI7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnRzLnByb3BzTW9kdWxlID0geyBjcmVhdGU6IHVwZGF0ZVByb3BzLCB1cGRhdGU6IHVwZGF0ZVByb3BzIH07XG5leHBvcnRzLmRlZmF1bHQgPSBleHBvcnRzLnByb3BzTW9kdWxlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cHJvcHMuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgdm5vZGVfMSA9IHJlcXVpcmUoXCIuL3Zub2RlXCIpO1xudmFyIGlzID0gcmVxdWlyZShcIi4vaXNcIik7XG52YXIgaHRtbGRvbWFwaV8xID0gcmVxdWlyZShcIi4vaHRtbGRvbWFwaVwiKTtcbmZ1bmN0aW9uIGlzVW5kZWYocykgeyByZXR1cm4gcyA9PT0gdW5kZWZpbmVkOyB9XG5mdW5jdGlvbiBpc0RlZihzKSB7IHJldHVybiBzICE9PSB1bmRlZmluZWQ7IH1cbnZhciBlbXB0eU5vZGUgPSB2bm9kZV8xLmRlZmF1bHQoJycsIHt9LCBbXSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuZnVuY3Rpb24gc2FtZVZub2RlKHZub2RlMSwgdm5vZGUyKSB7XG4gICAgcmV0dXJuIHZub2RlMS5rZXkgPT09IHZub2RlMi5rZXkgJiYgdm5vZGUxLnNlbCA9PT0gdm5vZGUyLnNlbDtcbn1cbmZ1bmN0aW9uIGlzVm5vZGUodm5vZGUpIHtcbiAgICByZXR1cm4gdm5vZGUuc2VsICE9PSB1bmRlZmluZWQ7XG59XG5mdW5jdGlvbiBjcmVhdGVLZXlUb09sZElkeChjaGlsZHJlbiwgYmVnaW5JZHgsIGVuZElkeCkge1xuICAgIHZhciBpLCBtYXAgPSB7fSwga2V5LCBjaDtcbiAgICBmb3IgKGkgPSBiZWdpbklkeDsgaSA8PSBlbmRJZHg7ICsraSkge1xuICAgICAgICBjaCA9IGNoaWxkcmVuW2ldO1xuICAgICAgICBpZiAoY2ggIT0gbnVsbCkge1xuICAgICAgICAgICAga2V5ID0gY2gua2V5O1xuICAgICAgICAgICAgaWYgKGtleSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIG1hcFtrZXldID0gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWFwO1xufVxudmFyIGhvb2tzID0gWydjcmVhdGUnLCAndXBkYXRlJywgJ3JlbW92ZScsICdkZXN0cm95JywgJ3ByZScsICdwb3N0J107XG52YXIgaF8xID0gcmVxdWlyZShcIi4vaFwiKTtcbmV4cG9ydHMuaCA9IGhfMS5oO1xudmFyIHRodW5rXzEgPSByZXF1aXJlKFwiLi90aHVua1wiKTtcbmV4cG9ydHMudGh1bmsgPSB0aHVua18xLnRodW5rO1xuZnVuY3Rpb24gaW5pdChtb2R1bGVzLCBkb21BcGkpIHtcbiAgICB2YXIgaSwgaiwgY2JzID0ge307XG4gICAgdmFyIGFwaSA9IGRvbUFwaSAhPT0gdW5kZWZpbmVkID8gZG9tQXBpIDogaHRtbGRvbWFwaV8xLmRlZmF1bHQ7XG4gICAgZm9yIChpID0gMDsgaSA8IGhvb2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNic1tob29rc1tpXV0gPSBbXTtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IG1vZHVsZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICAgIHZhciBob29rID0gbW9kdWxlc1tqXVtob29rc1tpXV07XG4gICAgICAgICAgICBpZiAoaG9vayAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2JzW2hvb2tzW2ldXS5wdXNoKGhvb2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGVtcHR5Tm9kZUF0KGVsbSkge1xuICAgICAgICB2YXIgaWQgPSBlbG0uaWQgPyAnIycgKyBlbG0uaWQgOiAnJztcbiAgICAgICAgdmFyIGMgPSBlbG0uY2xhc3NOYW1lID8gJy4nICsgZWxtLmNsYXNzTmFtZS5zcGxpdCgnICcpLmpvaW4oJy4nKSA6ICcnO1xuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KGFwaS50YWdOYW1lKGVsbSkudG9Mb3dlckNhc2UoKSArIGlkICsgYywge30sIFtdLCB1bmRlZmluZWQsIGVsbSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0ZVJtQ2IoY2hpbGRFbG0sIGxpc3RlbmVycykge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gcm1DYigpIHtcbiAgICAgICAgICAgIGlmICgtLWxpc3RlbmVycyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHZhciBwYXJlbnRfMSA9IGFwaS5wYXJlbnROb2RlKGNoaWxkRWxtKTtcbiAgICAgICAgICAgICAgICBhcGkucmVtb3ZlQ2hpbGQocGFyZW50XzEsIGNoaWxkRWxtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY3JlYXRlRWxtKHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpIHtcbiAgICAgICAgdmFyIGksIGRhdGEgPSB2bm9kZS5kYXRhO1xuICAgICAgICBpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYoaSA9IGRhdGEuaG9vaykgJiYgaXNEZWYoaSA9IGkuaW5pdCkpIHtcbiAgICAgICAgICAgICAgICBpKHZub2RlKTtcbiAgICAgICAgICAgICAgICBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB2YXIgY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbiwgc2VsID0gdm5vZGUuc2VsO1xuICAgICAgICBpZiAoc2VsID09PSAnIScpIHtcbiAgICAgICAgICAgIGlmIChpc1VuZGVmKHZub2RlLnRleHQpKSB7XG4gICAgICAgICAgICAgICAgdm5vZGUudGV4dCA9ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdm5vZGUuZWxtID0gYXBpLmNyZWF0ZUNvbW1lbnQodm5vZGUudGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2VsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIFBhcnNlIHNlbGVjdG9yXG4gICAgICAgICAgICB2YXIgaGFzaElkeCA9IHNlbC5pbmRleE9mKCcjJyk7XG4gICAgICAgICAgICB2YXIgZG90SWR4ID0gc2VsLmluZGV4T2YoJy4nLCBoYXNoSWR4KTtcbiAgICAgICAgICAgIHZhciBoYXNoID0gaGFzaElkeCA+IDAgPyBoYXNoSWR4IDogc2VsLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBkb3QgPSBkb3RJZHggPiAwID8gZG90SWR4IDogc2VsLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciB0YWcgPSBoYXNoSWR4ICE9PSAtMSB8fCBkb3RJZHggIT09IC0xID8gc2VsLnNsaWNlKDAsIE1hdGgubWluKGhhc2gsIGRvdCkpIDogc2VsO1xuICAgICAgICAgICAgdmFyIGVsbSA9IHZub2RlLmVsbSA9IGlzRGVmKGRhdGEpICYmIGlzRGVmKGkgPSBkYXRhLm5zKSA/IGFwaS5jcmVhdGVFbGVtZW50TlMoaSwgdGFnKVxuICAgICAgICAgICAgICAgIDogYXBpLmNyZWF0ZUVsZW1lbnQodGFnKTtcbiAgICAgICAgICAgIGlmIChoYXNoIDwgZG90KVxuICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoJ2lkJywgc2VsLnNsaWNlKGhhc2ggKyAxLCBkb3QpKTtcbiAgICAgICAgICAgIGlmIChkb3RJZHggPiAwKVxuICAgICAgICAgICAgICAgIGVsbS5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgc2VsLnNsaWNlKGRvdCArIDEpLnJlcGxhY2UoL1xcLi9nLCAnICcpKTtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYnMuY3JlYXRlLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGNicy5jcmVhdGVbaV0oZW1wdHlOb2RlLCB2bm9kZSk7XG4gICAgICAgICAgICBpZiAoaXMuYXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaCA9IGNoaWxkcmVuW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2ggIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXBpLmFwcGVuZENoaWxkKGVsbSwgY3JlYXRlRWxtKGNoLCBpbnNlcnRlZFZub2RlUXVldWUpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzLnByaW1pdGl2ZSh2bm9kZS50ZXh0KSkge1xuICAgICAgICAgICAgICAgIGFwaS5hcHBlbmRDaGlsZChlbG0sIGFwaS5jcmVhdGVUZXh0Tm9kZSh2bm9kZS50ZXh0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpID0gdm5vZGUuZGF0YS5ob29rOyAvLyBSZXVzZSB2YXJpYWJsZVxuICAgICAgICAgICAgaWYgKGlzRGVmKGkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkuY3JlYXRlKVxuICAgICAgICAgICAgICAgICAgICBpLmNyZWF0ZShlbXB0eU5vZGUsIHZub2RlKTtcbiAgICAgICAgICAgICAgICBpZiAoaS5pbnNlcnQpXG4gICAgICAgICAgICAgICAgICAgIGluc2VydGVkVm5vZGVRdWV1ZS5wdXNoKHZub2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZub2RlLmVsbSA9IGFwaS5jcmVhdGVUZXh0Tm9kZSh2bm9kZS50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdm5vZGUuZWxtO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhZGRWbm9kZXMocGFyZW50RWxtLCBiZWZvcmUsIHZub2Rlcywgc3RhcnRJZHgsIGVuZElkeCwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgICAgIGZvciAoOyBzdGFydElkeCA8PSBlbmRJZHg7ICsrc3RhcnRJZHgpIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHZub2Rlc1tzdGFydElkeF07XG4gICAgICAgICAgICBpZiAoY2ggIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBjcmVhdGVFbG0oY2gsIGluc2VydGVkVm5vZGVRdWV1ZSksIGJlZm9yZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gaW52b2tlRGVzdHJveUhvb2sodm5vZGUpIHtcbiAgICAgICAgdmFyIGksIGosIGRhdGEgPSB2bm9kZS5kYXRhO1xuICAgICAgICBpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBpZiAoaXNEZWYoaSA9IGRhdGEuaG9vaykgJiYgaXNEZWYoaSA9IGkuZGVzdHJveSkpXG4gICAgICAgICAgICAgICAgaSh2bm9kZSk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLmRlc3Ryb3kubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICAgICAgY2JzLmRlc3Ryb3lbaV0odm5vZGUpO1xuICAgICAgICAgICAgaWYgKHZub2RlLmNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IHZub2RlLmNoaWxkcmVuW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSAhPSBudWxsICYmIHR5cGVvZiBpICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnZva2VEZXN0cm95SG9vayhpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiByZW1vdmVWbm9kZXMocGFyZW50RWxtLCB2bm9kZXMsIHN0YXJ0SWR4LCBlbmRJZHgpIHtcbiAgICAgICAgZm9yICg7IHN0YXJ0SWR4IDw9IGVuZElkeDsgKytzdGFydElkeCkge1xuICAgICAgICAgICAgdmFyIGlfMSA9IHZvaWQgMCwgbGlzdGVuZXJzID0gdm9pZCAwLCBybSA9IHZvaWQgMCwgY2ggPSB2bm9kZXNbc3RhcnRJZHhdO1xuICAgICAgICAgICAgaWYgKGNoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNEZWYoY2guc2VsKSkge1xuICAgICAgICAgICAgICAgICAgICBpbnZva2VEZXN0cm95SG9vayhjaCk7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IGNicy5yZW1vdmUubGVuZ3RoICsgMTtcbiAgICAgICAgICAgICAgICAgICAgcm0gPSBjcmVhdGVSbUNiKGNoLmVsbSwgbGlzdGVuZXJzKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpXzEgPSAwOyBpXzEgPCBjYnMucmVtb3ZlLmxlbmd0aDsgKytpXzEpXG4gICAgICAgICAgICAgICAgICAgICAgICBjYnMucmVtb3ZlW2lfMV0oY2gsIHJtKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzRGVmKGlfMSA9IGNoLmRhdGEpICYmIGlzRGVmKGlfMSA9IGlfMS5ob29rKSAmJiBpc0RlZihpXzEgPSBpXzEucmVtb3ZlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaV8xKGNoLCBybSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBybSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhcGkucmVtb3ZlQ2hpbGQocGFyZW50RWxtLCBjaC5lbG0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiB1cGRhdGVDaGlsZHJlbihwYXJlbnRFbG0sIG9sZENoLCBuZXdDaCwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgICAgIHZhciBvbGRTdGFydElkeCA9IDAsIG5ld1N0YXJ0SWR4ID0gMDtcbiAgICAgICAgdmFyIG9sZEVuZElkeCA9IG9sZENoLmxlbmd0aCAtIDE7XG4gICAgICAgIHZhciBvbGRTdGFydFZub2RlID0gb2xkQ2hbMF07XG4gICAgICAgIHZhciBvbGRFbmRWbm9kZSA9IG9sZENoW29sZEVuZElkeF07XG4gICAgICAgIHZhciBuZXdFbmRJZHggPSBuZXdDaC5sZW5ndGggLSAxO1xuICAgICAgICB2YXIgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWzBdO1xuICAgICAgICB2YXIgbmV3RW5kVm5vZGUgPSBuZXdDaFtuZXdFbmRJZHhdO1xuICAgICAgICB2YXIgb2xkS2V5VG9JZHg7XG4gICAgICAgIHZhciBpZHhJbk9sZDtcbiAgICAgICAgdmFyIGVsbVRvTW92ZTtcbiAgICAgICAgdmFyIGJlZm9yZTtcbiAgICAgICAgd2hpbGUgKG9sZFN0YXJ0SWR4IDw9IG9sZEVuZElkeCAmJiBuZXdTdGFydElkeCA8PSBuZXdFbmRJZHgpIHtcbiAgICAgICAgICAgIGlmIChvbGRTdGFydFZub2RlID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBvbGRTdGFydFZub2RlID0gb2xkQ2hbKytvbGRTdGFydElkeF07IC8vIFZub2RlIG1pZ2h0IGhhdmUgYmVlbiBtb3ZlZCBsZWZ0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChvbGRFbmRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChuZXdTdGFydFZub2RlID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBuZXdTdGFydFZub2RlID0gbmV3Q2hbKytuZXdTdGFydElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChuZXdFbmRWbm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgbmV3RW5kVm5vZGUgPSBuZXdDaFstLW5ld0VuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3U3RhcnRWbm9kZSkpIHtcbiAgICAgICAgICAgICAgICBwYXRjaFZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgb2xkU3RhcnRWbm9kZSA9IG9sZENoWysrb2xkU3RhcnRJZHhdO1xuICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHNhbWVWbm9kZShvbGRFbmRWbm9kZSwgbmV3RW5kVm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRFbmRWbm9kZSwgbmV3RW5kVm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgICAgICAgICAgbmV3RW5kVm5vZGUgPSBuZXdDaFstLW5ld0VuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3RW5kVm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRTdGFydFZub2RlLCBuZXdFbmRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgb2xkU3RhcnRWbm9kZS5lbG0sIGFwaS5uZXh0U2libGluZyhvbGRFbmRWbm9kZS5lbG0pKTtcbiAgICAgICAgICAgICAgICBvbGRTdGFydFZub2RlID0gb2xkQ2hbKytvbGRTdGFydElkeF07XG4gICAgICAgICAgICAgICAgbmV3RW5kVm5vZGUgPSBuZXdDaFstLW5ld0VuZElkeF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzYW1lVm5vZGUob2xkRW5kVm5vZGUsIG5ld1N0YXJ0Vm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShvbGRFbmRWbm9kZSwgbmV3U3RhcnRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgb2xkRW5kVm5vZGUuZWxtLCBvbGRTdGFydFZub2RlLmVsbSk7XG4gICAgICAgICAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKG9sZEtleVRvSWR4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgb2xkS2V5VG9JZHggPSBjcmVhdGVLZXlUb09sZElkeChvbGRDaCwgb2xkU3RhcnRJZHgsIG9sZEVuZElkeCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlkeEluT2xkID0gb2xkS2V5VG9JZHhbbmV3U3RhcnRWbm9kZS5rZXldO1xuICAgICAgICAgICAgICAgIGlmIChpc1VuZGVmKGlkeEluT2xkKSkge1xuICAgICAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSksIG9sZFN0YXJ0Vm5vZGUuZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZWxtVG9Nb3ZlID0gb2xkQ2hbaWR4SW5PbGRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZWxtVG9Nb3ZlLnNlbCAhPT0gbmV3U3RhcnRWbm9kZS5zZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBjcmVhdGVFbG0obmV3U3RhcnRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGF0Y2hWbm9kZShlbG1Ub01vdmUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvbGRDaFtpZHhJbk9sZF0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgZWxtVG9Nb3ZlLmVsbSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9sZFN0YXJ0SWR4IDw9IG9sZEVuZElkeCB8fCBuZXdTdGFydElkeCA8PSBuZXdFbmRJZHgpIHtcbiAgICAgICAgICAgIGlmIChvbGRTdGFydElkeCA+IG9sZEVuZElkeCkge1xuICAgICAgICAgICAgICAgIGJlZm9yZSA9IG5ld0NoW25ld0VuZElkeCArIDFdID09IG51bGwgPyBudWxsIDogbmV3Q2hbbmV3RW5kSWR4ICsgMV0uZWxtO1xuICAgICAgICAgICAgICAgIGFkZFZub2RlcyhwYXJlbnRFbG0sIGJlZm9yZSwgbmV3Q2gsIG5ld1N0YXJ0SWR4LCBuZXdFbmRJZHgsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZW1vdmVWbm9kZXMocGFyZW50RWxtLCBvbGRDaCwgb2xkU3RhcnRJZHgsIG9sZEVuZElkeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gcGF0Y2hWbm9kZShvbGRWbm9kZSwgdm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSkge1xuICAgICAgICB2YXIgaSwgaG9vaztcbiAgICAgICAgaWYgKGlzRGVmKGkgPSB2bm9kZS5kYXRhKSAmJiBpc0RlZihob29rID0gaS5ob29rKSAmJiBpc0RlZihpID0gaG9vay5wcmVwYXRjaCkpIHtcbiAgICAgICAgICAgIGkob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgZWxtID0gdm5vZGUuZWxtID0gb2xkVm5vZGUuZWxtO1xuICAgICAgICB2YXIgb2xkQ2ggPSBvbGRWbm9kZS5jaGlsZHJlbjtcbiAgICAgICAgdmFyIGNoID0gdm5vZGUuY2hpbGRyZW47XG4gICAgICAgIGlmIChvbGRWbm9kZSA9PT0gdm5vZGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICh2bm9kZS5kYXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYnMudXBkYXRlLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGNicy51cGRhdGVbaV0ob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgICAgICAgIGkgPSB2bm9kZS5kYXRhLmhvb2s7XG4gICAgICAgICAgICBpZiAoaXNEZWYoaSkgJiYgaXNEZWYoaSA9IGkudXBkYXRlKSlcbiAgICAgICAgICAgICAgICBpKG9sZFZub2RlLCB2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzVW5kZWYodm5vZGUudGV4dCkpIHtcbiAgICAgICAgICAgIGlmIChpc0RlZihvbGRDaCkgJiYgaXNEZWYoY2gpKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9sZENoICE9PSBjaClcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlQ2hpbGRyZW4oZWxtLCBvbGRDaCwgY2gsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0RlZihjaCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNEZWYob2xkVm5vZGUudGV4dCkpXG4gICAgICAgICAgICAgICAgICAgIGFwaS5zZXRUZXh0Q29udGVudChlbG0sICcnKTtcbiAgICAgICAgICAgICAgICBhZGRWbm9kZXMoZWxtLCBudWxsLCBjaCwgMCwgY2gubGVuZ3RoIC0gMSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzRGVmKG9sZENoKSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZVZub2RlcyhlbG0sIG9sZENoLCAwLCBvbGRDaC5sZW5ndGggLSAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzRGVmKG9sZFZub2RlLnRleHQpKSB7XG4gICAgICAgICAgICAgICAgYXBpLnNldFRleHRDb250ZW50KGVsbSwgJycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9sZFZub2RlLnRleHQgIT09IHZub2RlLnRleHQpIHtcbiAgICAgICAgICAgIGlmIChpc0RlZihvbGRDaCkpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVWbm9kZXMoZWxtLCBvbGRDaCwgMCwgb2xkQ2gubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhcGkuc2V0VGV4dENvbnRlbnQoZWxtLCB2bm9kZS50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNEZWYoaG9vaykgJiYgaXNEZWYoaSA9IGhvb2sucG9zdHBhdGNoKSkge1xuICAgICAgICAgICAgaShvbGRWbm9kZSwgdm5vZGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbiBwYXRjaChvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICAgICAgdmFyIGksIGVsbSwgcGFyZW50O1xuICAgICAgICB2YXIgaW5zZXJ0ZWRWbm9kZVF1ZXVlID0gW107XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYnMucHJlLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgY2JzLnByZVtpXSgpO1xuICAgICAgICBpZiAoIWlzVm5vZGUob2xkVm5vZGUpKSB7XG4gICAgICAgICAgICBvbGRWbm9kZSA9IGVtcHR5Tm9kZUF0KG9sZFZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2FtZVZub2RlKG9sZFZub2RlLCB2bm9kZSkpIHtcbiAgICAgICAgICAgIHBhdGNoVm5vZGUob2xkVm5vZGUsIHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZWxtID0gb2xkVm5vZGUuZWxtO1xuICAgICAgICAgICAgcGFyZW50ID0gYXBpLnBhcmVudE5vZGUoZWxtKTtcbiAgICAgICAgICAgIGNyZWF0ZUVsbSh2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgICAgIGlmIChwYXJlbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudCwgdm5vZGUuZWxtLCBhcGkubmV4dFNpYmxpbmcoZWxtKSk7XG4gICAgICAgICAgICAgICAgcmVtb3ZlVm5vZGVzKHBhcmVudCwgW29sZFZub2RlXSwgMCwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGluc2VydGVkVm5vZGVRdWV1ZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaW5zZXJ0ZWRWbm9kZVF1ZXVlW2ldLmRhdGEuaG9vay5pbnNlcnQoaW5zZXJ0ZWRWbm9kZVF1ZXVlW2ldKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnBvc3QubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICBjYnMucG9zdFtpXSgpO1xuICAgICAgICByZXR1cm4gdm5vZGU7XG4gICAgfTtcbn1cbmV4cG9ydHMuaW5pdCA9IGluaXQ7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1zbmFiYmRvbS5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBoXzEgPSByZXF1aXJlKFwiLi9oXCIpO1xuZnVuY3Rpb24gY29weVRvVGh1bmsodm5vZGUsIHRodW5rKSB7XG4gICAgdGh1bmsuZWxtID0gdm5vZGUuZWxtO1xuICAgIHZub2RlLmRhdGEuZm4gPSB0aHVuay5kYXRhLmZuO1xuICAgIHZub2RlLmRhdGEuYXJncyA9IHRodW5rLmRhdGEuYXJncztcbiAgICB0aHVuay5kYXRhID0gdm5vZGUuZGF0YTtcbiAgICB0aHVuay5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuO1xuICAgIHRodW5rLnRleHQgPSB2bm9kZS50ZXh0O1xuICAgIHRodW5rLmVsbSA9IHZub2RlLmVsbTtcbn1cbmZ1bmN0aW9uIGluaXQodGh1bmspIHtcbiAgICB2YXIgY3VyID0gdGh1bmsuZGF0YTtcbiAgICB2YXIgdm5vZGUgPSBjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBjdXIuYXJncyk7XG4gICAgY29weVRvVGh1bmsodm5vZGUsIHRodW5rKTtcbn1cbmZ1bmN0aW9uIHByZXBhdGNoKG9sZFZub2RlLCB0aHVuaykge1xuICAgIHZhciBpLCBvbGQgPSBvbGRWbm9kZS5kYXRhLCBjdXIgPSB0aHVuay5kYXRhO1xuICAgIHZhciBvbGRBcmdzID0gb2xkLmFyZ3MsIGFyZ3MgPSBjdXIuYXJncztcbiAgICBpZiAob2xkLmZuICE9PSBjdXIuZm4gfHwgb2xkQXJncy5sZW5ndGggIT09IGFyZ3MubGVuZ3RoKSB7XG4gICAgICAgIGNvcHlUb1RodW5rKGN1ci5mbi5hcHBseSh1bmRlZmluZWQsIGFyZ3MpLCB0aHVuayk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgaWYgKG9sZEFyZ3NbaV0gIT09IGFyZ3NbaV0pIHtcbiAgICAgICAgICAgIGNvcHlUb1RodW5rKGN1ci5mbi5hcHBseSh1bmRlZmluZWQsIGFyZ3MpLCB0aHVuayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29weVRvVGh1bmsob2xkVm5vZGUsIHRodW5rKTtcbn1cbmV4cG9ydHMudGh1bmsgPSBmdW5jdGlvbiB0aHVuayhzZWwsIGtleSwgZm4sIGFyZ3MpIHtcbiAgICBpZiAoYXJncyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFyZ3MgPSBmbjtcbiAgICAgICAgZm4gPSBrZXk7XG4gICAgICAgIGtleSA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIGhfMS5oKHNlbCwge1xuICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgaG9vazogeyBpbml0OiBpbml0LCBwcmVwYXRjaDogcHJlcGF0Y2ggfSxcbiAgICAgICAgZm46IGZuLFxuICAgICAgICBhcmdzOiBhcmdzXG4gICAgfSk7XG59O1xuZXhwb3J0cy5kZWZhdWx0ID0gZXhwb3J0cy50aHVuaztcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXRodW5rLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xudmFyIHZub2RlXzEgPSByZXF1aXJlKFwiLi92bm9kZVwiKTtcbnZhciBodG1sZG9tYXBpXzEgPSByZXF1aXJlKFwiLi9odG1sZG9tYXBpXCIpO1xuZnVuY3Rpb24gdG9WTm9kZShub2RlLCBkb21BcGkpIHtcbiAgICB2YXIgYXBpID0gZG9tQXBpICE9PSB1bmRlZmluZWQgPyBkb21BcGkgOiBodG1sZG9tYXBpXzEuZGVmYXVsdDtcbiAgICB2YXIgdGV4dDtcbiAgICBpZiAoYXBpLmlzRWxlbWVudChub2RlKSkge1xuICAgICAgICB2YXIgaWQgPSBub2RlLmlkID8gJyMnICsgbm9kZS5pZCA6ICcnO1xuICAgICAgICB2YXIgY24gPSBub2RlLmdldEF0dHJpYnV0ZSgnY2xhc3MnKTtcbiAgICAgICAgdmFyIGMgPSBjbiA/ICcuJyArIGNuLnNwbGl0KCcgJykuam9pbignLicpIDogJyc7XG4gICAgICAgIHZhciBzZWwgPSBhcGkudGFnTmFtZShub2RlKS50b0xvd2VyQ2FzZSgpICsgaWQgKyBjO1xuICAgICAgICB2YXIgYXR0cnMgPSB7fTtcbiAgICAgICAgdmFyIGNoaWxkcmVuID0gW107XG4gICAgICAgIHZhciBuYW1lXzE7XG4gICAgICAgIHZhciBpID0gdm9pZCAwLCBuID0gdm9pZCAwO1xuICAgICAgICB2YXIgZWxtQXR0cnMgPSBub2RlLmF0dHJpYnV0ZXM7XG4gICAgICAgIHZhciBlbG1DaGlsZHJlbiA9IG5vZGUuY2hpbGROb2RlcztcbiAgICAgICAgZm9yIChpID0gMCwgbiA9IGVsbUF0dHJzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgbmFtZV8xID0gZWxtQXR0cnNbaV0ubm9kZU5hbWU7XG4gICAgICAgICAgICBpZiAobmFtZV8xICE9PSAnaWQnICYmIG5hbWVfMSAhPT0gJ2NsYXNzJykge1xuICAgICAgICAgICAgICAgIGF0dHJzW25hbWVfMV0gPSBlbG1BdHRyc1tpXS5ub2RlVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMCwgbiA9IGVsbUNoaWxkcmVuLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgY2hpbGRyZW4ucHVzaCh0b1ZOb2RlKGVsbUNoaWxkcmVuW2ldLCBkb21BcGkpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KHNlbCwgeyBhdHRyczogYXR0cnMgfSwgY2hpbGRyZW4sIHVuZGVmaW5lZCwgbm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGFwaS5pc1RleHQobm9kZSkpIHtcbiAgICAgICAgdGV4dCA9IGFwaS5nZXRUZXh0Q29udGVudChub2RlKTtcbiAgICAgICAgcmV0dXJuIHZub2RlXzEuZGVmYXVsdCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0ZXh0LCBub2RlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoYXBpLmlzQ29tbWVudChub2RlKSkge1xuICAgICAgICB0ZXh0ID0gYXBpLmdldFRleHRDb250ZW50KG5vZGUpO1xuICAgICAgICByZXR1cm4gdm5vZGVfMS5kZWZhdWx0KCchJywge30sIFtdLCB0ZXh0LCBub2RlKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiB2bm9kZV8xLmRlZmF1bHQoJycsIHt9LCBbXSwgdW5kZWZpbmVkLCBub2RlKTtcbiAgICB9XG59XG5leHBvcnRzLnRvVk5vZGUgPSB0b1ZOb2RlO1xuZXhwb3J0cy5kZWZhdWx0ID0gdG9WTm9kZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXRvdm5vZGUuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5mdW5jdGlvbiB2bm9kZShzZWwsIGRhdGEsIGNoaWxkcmVuLCB0ZXh0LCBlbG0pIHtcbiAgICB2YXIga2V5ID0gZGF0YSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogZGF0YS5rZXk7XG4gICAgcmV0dXJuIHsgc2VsOiBzZWwsIGRhdGE6IGRhdGEsIGNoaWxkcmVuOiBjaGlsZHJlbixcbiAgICAgICAgdGV4dDogdGV4dCwgZWxtOiBlbG0sIGtleToga2V5IH07XG59XG5leHBvcnRzLnZub2RlID0gdm5vZGU7XG5leHBvcnRzLmRlZmF1bHQgPSB2bm9kZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXZub2RlLmpzLm1hcCIsImltcG9ydCB7IGtleTJwb3MgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcbmltcG9ydCB7IENvbG9yLCBHZW9tZXRyeSwgS2V5LCBSb2xlIH0gZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcclxuXHJcbmV4cG9ydCBjb25zdCB2YXJpYW50cyA9IFtcIm1ha3J1a1wiLCBcInNpdHR1eWluXCIsIFwicGxhY2VtZW50XCIsIFwiY3Jhenlob3VzZVwiLCBcInN0YW5kYXJkXCIsIFwic2hvZ2lcIiwgXCJ4aWFuZ3FpXCIsIFwiY2FwYWJsYW5jYVwiLCBcInNlaXJhd2FuXCJdO1xyXG5cclxuZXhwb3J0IGNvbnN0IFZBUklBTlRTID0ge1xyXG4gICAgbWFrcnVrOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImdyaWRcIiwgcGllY2VzOiBcIm1ha3J1a1wiLCBjc3M6IFwibWFrcnVrXCJ9LFxyXG4gICAgc2l0dHV5aW46IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiZ3JpZHhcIiwgcGllY2VzOiBcIm1ha3J1a1wiLCBjc3M6IFwic2l0dHV5aW5cIiB9LFxyXG4gICAgc2hvZ2k6IHsgZ2VvbTogR2VvbWV0cnkuZGltOXg5LCBjZzogXCJjZy01NzZcIiwgYm9hcmQ6IFwiZ3JpZDl4OVwiLCBwaWVjZXM6IFwic2hvZ2lcIiwgY3NzOiBcInNob2dpMFwiIH0sXHJcbiAgICB4aWFuZ3FpOiB7IGdlb206IEdlb21ldHJ5LmRpbTl4MTAsIGNnOiBcImNnLTU3Ni02NDBcIiwgYm9hcmQ6IFwicml2ZXJcIiwgcGllY2VzOiBcInhpYW5ncWlcIiwgY3NzOiBcInhpYW5ncWlcIiB9LFxyXG4gICAgcGxhY2VtZW50OiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcInN0YW5kYXJkXCIgfSxcclxuICAgIGNyYXp5aG91c2U6IHsgZ2VvbTogR2VvbWV0cnkuZGltOHg4LCBjZzogXCJjZy01MTJcIiwgYm9hcmQ6IFwiYnJvd25cIiwgcGllY2VzOiBcIm1lcmlkYVwiLCBjc3M6IFwic3RhbmRhcmRcIiB9LFxyXG4gICAgY2FwYWJsYW5jYTogeyBnZW9tOiBHZW9tZXRyeS5kaW0xMHg4LCBjZzogXCJjZy02NDBcIiwgYm9hcmQ6IFwiY2FwYWJsYW5jYVwiLCBwaWVjZXM6IFwibWVyaWRhXCIsIGNzczogXCJjYXBhYmxhbmNhXCIgfSxcclxuICAgIHNlaXJhd2FuOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcInNlaXJhd2FuXCIgfSxcclxuICAgIHN0YW5kYXJkOiB7IGdlb206IEdlb21ldHJ5LmRpbTh4OCwgY2c6IFwiY2ctNTEyXCIsIGJvYXJkOiBcImJyb3duXCIsIHBpZWNlczogXCJtZXJpZGFcIiwgY3NzOiBcInN0YW5kYXJkXCIgfSxcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBvY2tldFJvbGVzKHZhcmlhbnQ6IHN0cmluZykge1xyXG4gICAgc3dpdGNoICh2YXJpYW50KSB7XHJcbiAgICBjYXNlIFwic2l0dHV5aW5cIjpcclxuICAgICAgICByZXR1cm4gW1wicm9va1wiLCBcImtuaWdodFwiLCBcInNpbHZlclwiLCBcImZlcnpcIiwgXCJraW5nXCJdO1xyXG4gICAgY2FzZSBcImNyYXp5aG91c2VcIjpcclxuICAgICAgICByZXR1cm4gW1wicGF3blwiLCBcImtuaWdodFwiLCBcImJpc2hvcFwiLCBcInJvb2tcIiwgXCJxdWVlblwiXTtcclxuICAgIGNhc2UgXCJzaG9naVwiOlxyXG4gICAgICAgIHJldHVybiBbXCJwYXduXCIsIFwibGFuY2VcIiwgXCJrbmlnaHRcIiwgXCJiaXNob3BcIiwgXCJyb29rXCIsIFwic2lsdmVyXCIsIFwiZ29sZFwiXTtcclxuICAgIGNhc2UgXCJzZWlyYXdhblwiOlxyXG4gICAgICAgIHJldHVybiBbXCJlbGVwaGFudFwiLCBcImhhd2tcIl07XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBbXCJyb29rXCIsIFwia25pZ2h0XCIsIFwiYmlzaG9wXCIsIFwicXVlZW5cIiwgXCJraW5nXCJdO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwcm9tb3Rpb25ab25lKHZhcmlhbnQ6IHN0cmluZywgY29sb3I6IHN0cmluZykge1xyXG4gICAgc3dpdGNoICh2YXJpYW50KSB7XHJcbiAgICBjYXNlICdzaG9naSc6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E5YjljOWQ5ZTlmOWc5aDlpOWE4YjhjOGQ4ZThmOGc4aDhpOGE3YjdjN2Q3ZTdmN2c3aDdpNycgOiAnYTFiMWMxZDFlMWYxZzFoMWkxYTJiMmMyZDJlMmYyZzJoMmkyYTNiM2MzZDNlM2YzZzNoM2kzJztcclxuICAgIGNhc2UgJ21ha3J1ayc6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E2YjZjNmQ2ZTZmNmc2aDYnIDogJ2EzYjNjM2QzZTNmM2czaDMnO1xyXG4gICAgY2FzZSAnc2l0dHV5aW4nOlxyXG4gICAgICAgIHJldHVybiBjb2xvciA9PT0gJ3doaXRlJyA/ICdhOGI3YzZkNWU1ZjZnN2g4JyA6ICdhMWIyYzNkNGU0ZjNnMmgxJztcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIGNvbG9yID09PSAnd2hpdGUnID8gJ2E4YjhjOGQ4ZThmOGc4aDhpOGo4JyA6ICdhMWIxYzFkMWUxZjFnMWgxaTFqMSc7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwcm9tb3Rpb25Sb2xlcyh2YXJpYW50OiBzdHJpbmcsIHJvbGU6IFJvbGUpIHtcclxuICAgIHN3aXRjaCAodmFyaWFudCkge1xyXG4gICAgY2FzZSBcImNhcGFibGFuY2FcIjpcclxuICAgICAgICByZXR1cm4gW1wicXVlZW5cIiwgXCJrbmlnaHRcIiwgXCJyb29rXCIsIFwiYmlzaG9wXCIsIFwiYXJjaGJpc2hvcFwiLCBcImNhbmNlbGxvclwiXTtcclxuICAgIGNhc2UgXCJzZWlyYXdhblwiOlxyXG4gICAgICAgIHJldHVybiBbXCJxdWVlblwiLCBcImtuaWdodFwiLCBcInJvb2tcIiwgXCJiaXNob3BcIiwgXCJlbGVwaGFudFwiLCBcImhhd2tcIl07XHJcbiAgICBjYXNlIFwic2hvZ2lcIjpcclxuICAgICAgICByZXR1cm4gW1wicFwiICsgcm9sZSwgcm9sZV07XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBbXCJxdWVlblwiLCBcImtuaWdodFwiLCBcInJvb2tcIiwgXCJiaXNob3BcIl07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBtYW5kYXRvcnlQcm9tb3Rpb24ocm9sZTogUm9sZSwgZGVzdDogS2V5LCBjb2xvcjogQ29sb3IpIHtcclxuICAgIHN3aXRjaCAocm9sZSkge1xyXG4gICAgY2FzZSBcInBhd25cIjpcclxuICAgIGNhc2UgXCJsYW5jZVwiOlxyXG4gICAgICAgIGlmIChjb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjlcIjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gZGVzdFsxXSA9PT0gXCIxXCI7XHJcbiAgICAgICAgfVxyXG4gICAgY2FzZSBcImtuaWdodFwiOlxyXG4gICAgICAgIGlmIChjb2xvciA9PT0gXCJ3aGl0ZVwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkZXN0WzFdID09PSBcIjlcIiB8fCBkZXN0WzFdID09PSBcIjhcIjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gZGVzdFsxXSA9PT0gXCIxXCIgfHwgZGVzdFsxXSA9PT0gXCIyXCI7XHJcbiAgICAgICAgfVxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBuZWVkUG9ja2V0cyh2YXJpYW50OiBzdHJpbmcpIHtcclxuICAgIHJldHVybiB2YXJpYW50ID09PSAncGxhY2VtZW50JyB8fCB2YXJpYW50ID09PSAnY3Jhenlob3VzZScgfHwgdmFyaWFudCA9PT0gJ3NpdHR1eWluJyB8fCB2YXJpYW50ID09PSAnc2hvZ2knIHx8IHZhcmlhbnQgPT09ICdzZWlyYXdhbidcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0VwKHZhcmlhbnQ6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHZhcmlhbnQgPT09ICdzdGFuZGFyZCcgfHwgdmFyaWFudCA9PT0gJ3BsYWNlbWVudCcgfHwgdmFyaWFudCA9PT0gJ2NyYXp5aG91c2UnIHx8IHZhcmlhbnQgPT09ICdjYXBhYmxhbmNhJyB8fCB2YXJpYW50ID09PSAnc2VpcmF3YW4nXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpZmYoYTogbnVtYmVyLCBiOm51bWJlcik6bnVtYmVyIHtcclxuICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkaWFnb25hbE1vdmUocG9zMSwgcG9zMikge1xyXG4gICAgY29uc3QgeGQgPSBkaWZmKHBvczFbMF0sIHBvczJbMF0pO1xyXG4gICAgY29uc3QgeWQgPSBkaWZmKHBvczFbMV0sIHBvczJbMV0pO1xyXG4gICAgcmV0dXJuIHhkID09PSB5ZCAmJiB4ZCA9PT0gMTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNhbkdhdGUoZmVuLCBwaWVjZSwgb3JpZywgZGVzdCwgbWV0YSkge1xyXG4gICAgY29uc29sZS5sb2coXCIgICBpc0dhdGluZygpXCIsIHBpZWNlLCBvcmlnLCBkZXN0LCBtZXRhKTtcclxuICAgIGlmICgocGllY2UuY29sb3IgPT09IFwid2hpdGVcIiAmJiBvcmlnLnNsaWNlKDEpICE9PSBcIjFcIikgfHxcclxuICAgICAgICAocGllY2UuY29sb3IgPT09IFwiYmxhY2tcIiAmJiBvcmlnLnNsaWNlKDEpICE9PSBcIjhcIikgfHxcclxuICAgICAgICAocGllY2Uucm9sZSA9PT0gXCJoYXdrXCIpIHx8XHJcbiAgICAgICAgKHBpZWNlLnJvbGUgPT09IFwiZWxlcGhhbnRcIikpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuXHJcbiAgICAvLyBJbiBzdGFydGluZyBwb3NpdGlvbiBraW5nIGFuZCghKSByb29rIHZpcmdpbml0eSBpcyBlbmNvZGVkIGluIEtRa3FcclxuICAgIC8vIFwicm5icWtibnIvcHBwcHBwcHAvOC84LzgvOC9QUFBQUFBQUC9STkJRS0JOUltIRWhlXSB3IEtRQkNERkdrcWJjZGZnIC0gMCAxXCJcclxuXHJcbiAgICAvLyBidXQgYWZ0ZXIga2luZ3MgbW92ZWQgcm9vayB2aXJnaW5pdHkgaXMgZW5jb2RlZCBpbiBBSGFoXHJcbiAgICAvLyBybmJxMWJuci9wcHBwa3BwcC84LzRwMy80UDMvOC9QUFBQS1BQUC9STkJRMUJOUltIRWhlXSB3IEFCQ0RGR0hhYmNkZmdoIC0gMiAzXHJcblxyXG4gICAgY29uc3QgcGFydHMgPSBmZW4uc3BsaXQoXCIgXCIpO1xyXG4gICAgY29uc3QgcGxhY2VtZW50ID0gcGFydHNbMF07XHJcbiAgICBjb25zdCBjb2xvciA9IHBhcnRzWzFdO1xyXG4gICAgY29uc3QgY2FzdGwgPSBwYXJ0c1syXTtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwiaXNHYXRpbmcoKVwiLCBvcmlnLCBwbGFjZW1lbnQsIGNvbG9yLCBjYXN0bCk7XHJcbiAgICBzd2l0Y2ggKG9yaWcpIHtcclxuICAgIGNhc2UgXCJhMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiQVwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcIlFcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYjFcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcIkJcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYzFcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcIkNcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZDFcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcIkRcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZTFcIjpcclxuICAgICAgICBpZiAocGllY2Uucm9sZSAhPT0gXCJraW5nXCIpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJmMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiRlwiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJnMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiR1wiKSA9PT0gLTEpIHJldHVybiBbZmFsc2UsIGZhbHNlXTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJoMVwiOlxyXG4gICAgICAgIGlmIChjYXN0bC5pbmRleE9mKFwiSFwiKSA9PT0gLTEgJiYgY2FzdGwuaW5kZXhPZihcIktcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiYThcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImFcIikgPT09IC0xICYmIGNhc3RsLmluZGV4T2YoXCJxXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImI4XCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJiXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImM4XCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJjXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImQ4XCI6XHJcbiAgICAgICAgaWYgKGNhc3RsLmluZGV4T2YoXCJkXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcImU4XCI6XHJcbiAgICAgICAgaWYgKHBpZWNlLnJvbGUgIT09IFwia2luZ1wiKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZjhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImZcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZzhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImdcIikgPT09IC0xKSByZXR1cm4gW2ZhbHNlLCBmYWxzZV07XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiaDhcIjpcclxuICAgICAgICBpZiAoY2FzdGwuaW5kZXhPZihcImhcIikgPT09IC0xICYmIGNhc3RsLmluZGV4T2YoXCJrXCIpID09PSAtMSkgcmV0dXJuIFtmYWxzZSwgZmFsc2VdO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfTtcclxuICAgIGNvbnN0IGJyYWNrZXRQb3MgPSBwbGFjZW1lbnQuaW5kZXhPZihcIltcIik7XHJcbiAgICBjb25zdCBwb2NrZXRzID0gcGxhY2VtZW50LnNsaWNlKGJyYWNrZXRQb3MpO1xyXG4gICAgY29uc3QgcGggPSBsYyhwb2NrZXRzLCBcImhcIiwgY29sb3I9PT0ndycpID09PSAxO1xyXG4gICAgY29uc3QgcGUgPSBsYyhwb2NrZXRzLCBcImVcIiwgY29sb3I9PT0ndycpID09PSAxO1xyXG5cclxuICAgIHJldHVybiBbcGgsIHBlXTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvbW90aW9uKHZhcmlhbnQsIHBpZWNlLCBvcmlnLCBkZXN0LCBtZXRhKSB7XHJcbiAgICBpZiAodmFyaWFudCA9PT0gJ3hpYW5ncWknKSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBweiA9IHByb21vdGlvblpvbmUodmFyaWFudCwgcGllY2UuY29sb3IpXHJcbiAgICBzd2l0Y2ggKHZhcmlhbnQpIHtcclxuICAgIGNhc2UgJ3Nob2dpJzpcclxuICAgICAgICByZXR1cm4gcGllY2Uucm9sZSAhPT0gXCJraW5nXCIgJiYgcGllY2Uucm9sZSAhPT0gJ2dvbGQnICYmIChwei5pbmRleE9mKG9yaWcpICE9PSAtMSB8fCBwei5pbmRleE9mKGRlc3QpICE9PSAtMSlcclxuICAgIGNhc2UgJ3NpdHR1eWluJzpcclxuICAgICAgICAvLyBTZWUgaHR0cHM6Ly92ZG9jdW1lbnRzLm5ldC9ob3ctdG8tcGxheS1teWFubWFyLXRyYWRpdGlvbmFsLWNoZXNzLWVuZy1ib29rLTEuaHRtbFxyXG4gICAgICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGRtID0gZGlhZ29uYWxNb3ZlKGtleTJwb3Mob3JpZywgZmlyc3RSYW5rSXMwKSwga2V5MnBvcyhkZXN0LCBmaXJzdFJhbmtJczApKTtcclxuICAgICAgICByZXR1cm4gcGllY2Uucm9sZSA9PT0gXCJwYXduXCIgJiYgKCBvcmlnID09PSBkZXN0IHx8ICghbWV0YS5jYXB0dXJlZCAmJiBkbSkpXHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBwaWVjZS5yb2xlID09PSBcInBhd25cIiAmJiBwei5pbmRleE9mKGRlc3QpICE9PSAtMVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdWNpMnVzaShtb3ZlKSB7XHJcbiAgICBjb25zdCBwYXJ0cyA9IG1vdmUuc3BsaXQoXCJcIik7XHJcbiAgICBpZiAocGFydHNbMV0gPT09IFwiQFwiKSB7XHJcbiAgICAgICAgcGFydHNbMV0gPSBcIipcIjtcclxuICAgICAgICBwYXJ0c1syXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMl0uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICAgICAgcGFydHNbM10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzNdLmNoYXJDb2RlQXQoKSArIDQ4KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBwYXJ0c1swXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMF0uY2hhckNvZGVBdCgpIC0gNDgpXHJcbiAgICAgICAgcGFydHNbMV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzFdLmNoYXJDb2RlQXQoKSArIDQ4KVxyXG4gICAgICAgIHBhcnRzWzJdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1syXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgICAgICBwYXJ0c1szXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbM10uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHVzaTJ1Y2kobW92ZSkge1xyXG4gICAgY29uc3QgcGFydHMgPSBtb3ZlLnNwbGl0KFwiXCIpO1xyXG4gICAgaWYgKHBhcnRzWzFdID09PSBcIipcIikge1xyXG4gICAgICAgIHBhcnRzWzFdID0gXCJAXCI7XHJcbiAgICAgICAgcGFydHNbMl0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzJdLmNoYXJDb2RlQXQoKSArIDQ4KVxyXG4gICAgICAgIHBhcnRzWzNdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1szXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcGFydHNbMF0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzBdLmNoYXJDb2RlQXQoKSArIDQ4KVxyXG4gICAgICAgIHBhcnRzWzFdID0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJ0c1sxXS5jaGFyQ29kZUF0KCkgLSA0OClcclxuICAgICAgICBwYXJ0c1syXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFydHNbMl0uY2hhckNvZGVBdCgpICsgNDgpXHJcbiAgICAgICAgcGFydHNbM10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnRzWzNdLmNoYXJDb2RlQXQoKSAtIDQ4KVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIik7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCByb2xlVG9TYW4gPSB7XHJcbiAgICBwYXduOiAnUCcsXHJcbiAgICBrbmlnaHQ6ICdOJyxcclxuICAgIGJpc2hvcDogJ0InLFxyXG4gICAgcm9vazogJ1InLFxyXG4gICAgcXVlZW46ICdRJyxcclxuICAgIGtpbmc6ICdLJyxcclxuICAgIGFyY2hiaXNob3A6ICdBJyxcclxuICAgIGNhbmNlbGxvcjogJ0MnLFxyXG4gICAgZWxlcGhhbnQ6IFwiRVwiLFxyXG4gICAgaGF3azogXCJIXCIsXHJcbiAgICBmZXJ6OiAnRicsXHJcbiAgICBtZXQ6ICdNJyxcclxuICAgIGdvbGQ6ICdHJyxcclxuICAgIHNpbHZlcjogJ1MnLFxyXG4gICAgbGFuY2U6ICdMJyxcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBzYW5Ub1JvbGUgPSB7XHJcbiAgICBQOiAncGF3bicsXHJcbiAgICBOOiAna25pZ2h0JyxcclxuICAgIEI6ICdiaXNob3AnLFxyXG4gICAgUjogJ3Jvb2snLFxyXG4gICAgUTogJ3F1ZWVuJyxcclxuICAgIEs6ICdraW5nJyxcclxuICAgIEE6ICdhcmNoYmlzaG9wJyxcclxuICAgIEM6ICdjYW5jZWxsb3InLFxyXG4gICAgRTogJ2VsZXBoYW50JyxcclxuICAgIEg6ICdoYXdrJyxcclxuICAgIEY6ICdmZXJ6JyxcclxuICAgIE06ICdtZXQnLFxyXG4gICAgRzogJ2dvbGQnLFxyXG4gICAgUzogJ3NpbHZlcicsXHJcbiAgICBMOiAnbGFuY2UnLFxyXG4gICAgcDogJ3Bhd24nLFxyXG4gICAgbjogJ2tuaWdodCcsXHJcbiAgICBiOiAnYmlzaG9wJyxcclxuICAgIHI6ICdyb29rJyxcclxuICAgIHE6ICdxdWVlbicsXHJcbiAgICBrOiAna2luZycsXHJcbiAgICBhOiAnYXJjaGJpc2hvcCcsXHJcbiAgICBjOiAnY2FuY2VsbG9yJyxcclxuICAgIGU6ICdlbGVwaGFudCcsXHJcbiAgICBoOiAnaGF3aycsXHJcbiAgICBmOiAnZmVyeicsXHJcbiAgICBtOiAnbWV0JyxcclxuICAgIGc6ICdnb2xkJyxcclxuICAgIHM6ICdzaWx2ZXInLFxyXG4gICAgbDogJ2xhbmNlJyxcclxufTtcclxuXHJcbi8vIENvdW50IGdpdmVuIGxldHRlciBvY2N1cmVuY2VzIGluIGEgc3RyaW5nXHJcbmV4cG9ydCBmdW5jdGlvbiBsYyhzdHIsIGxldHRlciwgdXBwZXJjYXNlKSB7XHJcbiAgICB2YXIgbGV0dGVyQ291bnQgPSAwO1xyXG4gICAgaWYgKHVwcGVyY2FzZSkgbGV0dGVyID0gbGV0dGVyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBmb3IgKHZhciBwb3NpdGlvbiA9IDA7IHBvc2l0aW9uIDwgc3RyLmxlbmd0aDsgcG9zaXRpb24rKykge1xyXG4gICAgICAgIGlmIChzdHIuY2hhckF0KHBvc2l0aW9uKSA9PT0gbGV0dGVyKSBsZXR0ZXJDb3VudCArPSAxO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGxldHRlckNvdW50O1xyXG59XHJcbiIsIi8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzIwNjE4MzU1L3RoZS1zaW1wbGVzdC1wb3NzaWJsZS1qYXZhc2NyaXB0LWNvdW50ZG93bi10aW1lclxuXG5pbXBvcnQgeyBoLCBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xuXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcblxuZXhwb3J0IGNsYXNzIENsb2NrIHtcbiAgICBkdXJhdGlvbjogbnVtYmVyO1xuICAgIGluY3JlbWVudDogbnVtYmVyO1xuICAgIGdyYW51bGFyaXR5OiBudW1iZXI7XG4gICAgcnVubmluZzogYm9vbGVhbjtcbiAgICB0aW1lb3V0OiBhbnk7XG4gICAgc3RhcnRUaW1lOiBhbnk7XG4gICAgdGlja0NhbGxiYWNrczogYW55W107XG4gICAgZmxhZ0NhbGxiYWNrOiBhbnk7XG4gICAgZWw6IEhUTUxFbGVtZW50O1xuXG4gICAgLy8gZ2FtZSBiYXNlVGltZSAobWluKSBhbmQgaW5jcmVtZW50IChzZWMpXG4gICAgY29uc3RydWN0b3IoYmFzZVRpbWUsIGluY3JlbWVudCwgZWwpIHtcbiAgICB0aGlzLmR1cmF0aW9uID0gYmFzZVRpbWUgKiAxMDAwICogNjA7XG4gICAgdGhpcy5pbmNyZW1lbnQgPSBpbmNyZW1lbnQgKiAxMDAwO1xuICAgIHRoaXMuZ3JhbnVsYXJpdHkgPSA1MDA7XG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG4gICAgdGhpcy50aW1lb3V0ID0gbnVsbDtcbiAgICB0aGlzLnN0YXJ0VGltZSA9IG51bGw7XG4gICAgdGhpcy50aWNrQ2FsbGJhY2tzID0gW107XG4gICAgdGhpcy5mbGFnQ2FsbGJhY2sgPSBudWxsO1xuICAgIHRoaXMuZWwgPSBlbDtcblxuICAgIHJlbmRlclRpbWUodGhpcywgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgc3RhcnQgPSAoZHVyYXRpb24pID0+IHtcbiAgICAgICAgaWYgKHRoaXMucnVubmluZykgcmV0dXJuO1xuICAgICAgICBpZiAodHlwZW9mIGR1cmF0aW9uICE9PSBcInVuZGVmaW5lZFwiKSB0aGlzLmR1cmF0aW9uID0gZHVyYXRpb247XG5cbiAgICAgICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgIHZhciBkaWZmO1xuXG4gICAgICAgIChmdW5jdGlvbiB0aW1lcigpIHtcbiAgICAgICAgICAgIGRpZmYgPSB0aGF0LmR1cmF0aW9uIC0gKERhdGUubm93KCkgLSB0aGF0LnN0YXJ0VGltZSk7XG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcInRpbWVyKClcIiwgdGhhdC5kdXJhdGlvbiAtIGRpZmYpO1xuICAgICAgICAgICAgaWYgKGRpZmYgPD0gMCkge1xuICAgICAgICAgICAgICAgIHRoYXQuZmxhZ0NhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgdGhhdC5wYXVzZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhhdC50aW1lb3V0ID0gc2V0VGltZW91dCh0aW1lciwgdGhhdC5ncmFudWxhcml0eSk7XG4gICAgICAgICAgICB0aGF0LnRpY2tDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhhdCwgdGhhdCwgZGlmZik7XG4gICAgICAgICAgICB9LCB0aGF0KTtcbiAgICAgICAgfSgpKTtcbiAgICB9XG5cbiAgICBvblRpY2sgPSAoY2FsbGJhY2spID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy50aWNrQ2FsbGJhY2tzLnB1c2goY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uRmxhZyA9IChjYWxsYmFjaykgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLnBhdXNlKGZhbHNlKTtcbiAgICAgICAgICAgIHRoaXMuZmxhZ0NhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcGF1c2UgPSAod2l0aEluY3JlbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy50aW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KTtcbiAgICAgICAgdGhpcy50aW1lb3V0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLmR1cmF0aW9uIC09IERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZTtcbiAgICAgICAgaWYgKHdpdGhJbmNyZW1lbnQgJiYgdGhpcy5pbmNyZW1lbnQpIHRoaXMuZHVyYXRpb24gKz0gdGhpcy5pbmNyZW1lbnQ7XG4gICAgICAgIHJlbmRlclRpbWUodGhpcywgdGhpcy5kdXJhdGlvbik7XG4gICAgfVxuXG4gICAgc2V0VGltZSA9IChtaWxsaXMpID0+IHtcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IG1pbGxpcztcbiAgICAgICAgcmVuZGVyVGltZSh0aGlzLCB0aGlzLmR1cmF0aW9uKTtcbiAgICB9XG5cbiAgICBwYXJzZVRpbWUgPSAobWlsbGlzKSA9PiB7XG4gICAgICAgIGxldCBtaW51dGVzID0gTWF0aC5mbG9vcihtaWxsaXMgLyA2MDAwMCk7XG4gICAgICAgIGxldCBzZWNvbmRzID0gKG1pbGxpcyAlIDYwMDAwKSAvIDEwMDA7XG4gICAgICAgIGxldCBzZWNzLCBtaW5zO1xuICAgICAgICBpZiAoTWF0aC5mbG9vcihzZWNvbmRzKSA9PSA2MCkge1xuICAgICAgICAgICAgbWludXRlcysrO1xuICAgICAgICAgICAgc2Vjb25kcyA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgbWludXRlcyA9IE1hdGgubWF4KDAsIG1pbnV0ZXMpO1xuICAgICAgICBzZWNvbmRzID0gTWF0aC5tYXgoMCwgc2Vjb25kcyk7XG4gICAgICAgIGlmIChtaWxsaXMgPCAxMDAwMCkge1xuICAgICAgICAgICAgc2VjcyA9IHNlY29uZHMudG9GaXhlZCgxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlY3MgPSBTdHJpbmcoTWF0aC5mbG9vcihzZWNvbmRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgbWlucyA9IChtaW51dGVzIDwgMTAgPyBcIjBcIiA6IFwiXCIpICsgU3RyaW5nKG1pbnV0ZXMpO1xuICAgICAgICBzZWNzID0gKHNlY29uZHMgPCAxMCA/IFwiMFwiIDogXCJcIikgKyBzZWNzO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWludXRlczogbWlucyxcbiAgICAgICAgICAgIHNlY29uZHM6IHNlY3MsXG4gICAgICAgIH07XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVGltZShjbG9jaywgdGltZSkge1xuICAgIGlmIChjbG9jay5ncmFudWxhcml0eSA+IDEwMCAmJiB0aW1lIDwgMTAwMDApIGNsb2NrLmdyYW51bGFyaXR5ID0gMTAwO1xuICAgIGNvbnN0IHBhcnNlZCA9IGNsb2NrLnBhcnNlVGltZSh0aW1lKTtcbiAgICAvLyBjb25zb2xlLmxvZyhcInJlbmRlclRpbWUoKTpcIiwgdGltZSwgcGFyc2VkKTtcblxuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0aW1lKTtcbiAgICBjb25zdCBtaWxsaXMgPSBkYXRlLmdldFVUQ01pbGxpc2Vjb25kcygpO1xuICAgIGNsb2NrLmVsID0gcGF0Y2goY2xvY2suZWwsIGgoJ2Rpdi5jbG9jaycsIHtjbGFzczoge3J1bm5pbmc6IGNsb2NrLnJ1bm5pbmcsIGh1cnJ5OiB0aW1lIDwgMTAwMDB9fSwgW1xuICAgICAgICBoKCdkaXYnLCBwYXJzZWQubWludXRlcyksXG4gICAgICAgIGgoJ2Rpdi5jbG9jay5zZXAnLCB7Y2xhc3M6IHtydW5uaW5nOiBjbG9jay5ydW5uaW5nLCBodXJyeTogdGltZSA8IDEwMDAwLCBsb3c6IG1pbGxpcyA8IDUwMH19ICwgJzonKSxcbiAgICAgICAgaCgnZGl2JywgcGFyc2VkLnNlY29uZHMpLFxuICAgICAgICBdKSk7XG59XG4iLCJpbXBvcnQgeyBpbml0IH0gZnJvbSBcInNuYWJiZG9tXCI7XHJcbmltcG9ydCB7IGggfSBmcm9tICdzbmFiYmRvbS9oJztcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgcHJvcGVydGllcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJztcclxuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcclxuXHJcbmltcG9ydCB7IGtleTJwb3MsIHBvczJrZXkgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcbmltcG9ydCB7IENoZXNzZ3JvdW5kIH0gZnJvbSAnY2hlc3Nncm91bmR4JztcclxuaW1wb3J0IHsgQXBpIH0gZnJvbSAnY2hlc3Nncm91bmR4L2FwaSc7XHJcbmltcG9ydCB7IENvbG9yLCBEZXN0cywgUGllY2VzRGlmZiwgUm9sZSwgS2V5LCBQb3MsIFBpZWNlLCBkaW1lbnNpb25zIH0gZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcclxuXHJcbmltcG9ydCB7IENsb2NrLCByZW5kZXJUaW1lIH0gZnJvbSAnLi9jbG9jayc7XHJcbmltcG9ydCBtYWtlR2F0aW5nIGZyb20gJy4vZ2F0aW5nJztcclxuaW1wb3J0IG1ha2VQcm9tb3Rpb24gZnJvbSAnLi9wcm9tb3Rpb24nO1xyXG5pbXBvcnQgeyBkcm9wSXNWYWxpZCwgcG9ja2V0VmlldywgdXBkYXRlUG9ja2V0cyB9IGZyb20gJy4vcG9ja2V0JztcclxuaW1wb3J0IHsgc291bmQsIGNoYW5nZUNTUyB9IGZyb20gJy4vc291bmQnO1xyXG5pbXBvcnQgeyBoYXNFcCwgbmVlZFBvY2tldHMsIHJvbGVUb1NhbiwgdWNpMnVzaSwgdXNpMnVjaSwgVkFSSUFOVFMgfSBmcm9tICcuL2NoZXNzJztcclxuaW1wb3J0IHsgcmVuZGVyVXNlcm5hbWUgfSBmcm9tICcuL3VzZXInO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBSb3VuZENvbnRyb2xsZXIge1xyXG4gICAgbW9kZWw7XHJcbiAgICBzb2NrO1xyXG4gICAgY2hlc3Nncm91bmQ6IEFwaTtcclxuICAgIGZ1bGxmZW46IHN0cmluZztcclxuICAgIHdwbGF5ZXI6IHN0cmluZztcclxuICAgIGJwbGF5ZXI6IHN0cmluZztcclxuICAgIGJhc2U6IG51bWJlcjtcclxuICAgIGluYzogbnVtYmVyO1xyXG4gICAgbXljb2xvcjogQ29sb3I7XHJcbiAgICBvcHBjb2xvcjogQ29sb3I7XHJcbiAgICB0dXJuQ29sb3I6IENvbG9yO1xyXG4gICAgY2xvY2tzOiBhbnk7XHJcbiAgICBhYm9ydGFibGU6IGJvb2xlYW47XHJcbiAgICBnYW1lSWQ6IHN0cmluZztcclxuICAgIHZhcmlhbnQ6IHN0cmluZztcclxuICAgIHBvY2tldHM6IGFueTtcclxuICAgIHZwb2NrZXQwOiBhbnk7XHJcbiAgICB2cG9ja2V0MTogYW55O1xyXG4gICAgY29udHJvbHM6IGFueTtcclxuICAgIGdhdGluZzogYW55O1xyXG4gICAgcHJvbW90aW9uOiBhbnk7XHJcbiAgICBkZXN0czogRGVzdHM7XHJcbiAgICBsYXN0bW92ZTogS2V5W107XHJcbiAgICBwcmVtb3ZlOiBhbnk7XHJcbiAgICBwcmVkcm9wOiBhbnk7XHJcbiAgICByZXN1bHQ6IHN0cmluZztcclxuICAgIGZsaXA6IGJvb2xlYW47XHJcbiAgICBzcGVjdGF0b3I6IGJvb2xlYW47XHJcbiAgICB0djogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGVsLCBtb2RlbCkge1xyXG4gICAgICAgIC8vIFRPRE86IHVzZSBhdXRvIHJlY29ubmVjdGluZyBzb2NrZXR0ZSBpbiBsb2JieSBhbmQgcm91bmQgY3RybFxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlcnIpIHtcclxuICAgICAgICAgICAgdGhpcy5zb2NrID0gbmV3IFdlYlNvY2tldChcIndzczovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzXCIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zb2NrLm9ubWVzc2FnZSA9IChldnQpID0+IHsgdGhpcy5vbk1lc3NhZ2UoZXZ0KSB9O1xyXG5cclxuICAgICAgICB0aGlzLm1vZGVsID0gbW9kZWw7XHJcbiAgICAgICAgdGhpcy52YXJpYW50ID0gbW9kZWxbXCJ2YXJpYW50XCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLmZ1bGxmZW4gPSBtb2RlbFtcImZlblwiXSBhcyBzdHJpbmc7XHJcbiAgICAgICAgdGhpcy53cGxheWVyID0gbW9kZWxbXCJ3cGxheWVyXCJdIGFzIHN0cmluZztcclxuICAgICAgICB0aGlzLmJwbGF5ZXIgPSBtb2RlbFtcImJwbGF5ZXJcIl0gYXMgc3RyaW5nO1xyXG4gICAgICAgIHRoaXMuYmFzZSA9IG1vZGVsW1wiYmFzZVwiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5pbmMgPSBtb2RlbFtcImluY1wiXSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy50diA9IG1vZGVsW1widHZcIl0gYXMgc3RyaW5nO1xyXG5cclxuICAgICAgICB0aGlzLmZsaXAgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdGhpcy5zcGVjdGF0b3IgPSB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gIT09IHRoaXMud3BsYXllciAmJiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gIT09IHRoaXMuYnBsYXllcjtcclxuICAgICAgICBpZiAodGhpcy50dikge1xyXG4gICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUoe30sIGRvY3VtZW50LnRpdGxlLCBcIi90dlwiKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUoe30sIGRvY3VtZW50LnRpdGxlLCBcIi9cIiArIHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gb3JpZW50YXRpb24gPSB0aGlzLm15Y29sb3JcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5teWNvbG9yID0gdGhpcy52YXJpYW50ID09PSAnc2hvZ2knID8gJ2JsYWNrJyA6ICd3aGl0ZSc7XHJcbiAgICAgICAgICAgIHRoaXMub3BwY29sb3IgPSB0aGlzLnZhcmlhbnQgPT09ICdzaG9naScgPyAnd2hpdGUnIDogJ2JsYWNrJztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLm15Y29sb3IgPSB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPT09IHRoaXMud3BsYXllciA/ICd3aGl0ZScgOiAnYmxhY2snO1xyXG4gICAgICAgICAgICB0aGlzLm9wcGNvbG9yID0gdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdID09PSB0aGlzLndwbGF5ZXIgPyAnYmxhY2snIDogJ3doaXRlJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuXHJcbiAgICAgICAgdGhpcy5yZXN1bHQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnN0IHBhcnRzID0gdGhpcy5mdWxsZmVuLnNwbGl0KFwiIFwiKTtcclxuICAgICAgICB0aGlzLmFib3J0YWJsZSA9IE51bWJlcihwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSkgPD0gMTtcclxuXHJcbiAgICAgICAgY29uc3QgZmVuX3BsYWNlbWVudCA9IHBhcnRzWzBdO1xyXG4gICAgICAgIHRoaXMudHVybkNvbG9yID0gcGFydHNbMV0gPT09IFwid1wiID8gXCJ3aGl0ZVwiIDogXCJibGFja1wiO1xyXG5cclxuICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcInNob2dpXCIpIHtcclxuICAgICAgICAgICAgdGhpcy5zZXRQaWVjZUNvbG9ycyh0aGlzLm15Y29sb3IpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNoYW5nZUNTUygnL3N0YXRpYy8nICsgVkFSSUFOVFNbdGhpcy52YXJpYW50XS5jc3MgKyAnLmNzcycsIDEpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuY2hlc3Nncm91bmQgPSBDaGVzc2dyb3VuZChlbCwge1xyXG4gICAgICAgICAgICBmZW46IGZlbl9wbGFjZW1lbnQsXHJcbiAgICAgICAgICAgIGdlb21ldHJ5OiBWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb20sXHJcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiB0aGlzLm15Y29sb3IsXHJcbiAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgIGFuaW1hdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgdmlld09ubHk6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBldmVudHM6IHtcclxuICAgICAgICAgICAgICAgICAgICBtb3ZlOiB0aGlzLm9uTW92ZSgpLFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICBtb3ZhYmxlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgZnJlZTogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IHRoaXMubXljb2xvcixcclxuICAgICAgICAgICAgICAgICAgICBzaG93RGVzdHM6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFmdGVyOiB0aGlzLm9uVXNlck1vdmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFmdGVyTmV3UGllY2U6IHRoaXMub25Vc2VyRHJvcCxcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgcHJlbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldDogdGhpcy5zZXRQcmVtb3ZlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1bnNldDogdGhpcy51bnNldFByZW1vdmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBwcmVkcm9wcGFibGU6IHtcclxuICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50czoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQ6IHRoaXMuc2V0UHJlZHJvcCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdW5zZXQ6IHRoaXMudW5zZXRQcmVkcm9wLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgZXZlbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbW92ZTogdGhpcy5vbk1vdmUoKSxcclxuICAgICAgICAgICAgICAgICAgICBkcm9wTmV3UGllY2U6IHRoaXMub25Ecm9wKCksXHJcbiAgICAgICAgICAgICAgICAgICAgY2hhbmdlOiB0aGlzLm9uQ2hhbmdlKHRoaXMuY2hlc3Nncm91bmQuc3RhdGUuc2VsZWN0ZWQpLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdDogdGhpcy5vblNlbGVjdCh0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnNlbGVjdGVkKSxcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5nYXRpbmcgPSBtYWtlR2F0aW5nKHRoaXMpO1xyXG4gICAgICAgIHRoaXMucHJvbW90aW9uID0gbWFrZVByb21vdGlvbih0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gaW5pdGlhbGl6ZSBwb2NrZXRzXHJcbiAgICAgICAgaWYgKG5lZWRQb2NrZXRzKHRoaXMudmFyaWFudCkpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9ja2V0MCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwb2NrZXQwJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvY2tldDEgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncG9ja2V0MScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICB1cGRhdGVQb2NrZXRzKHRoaXMsIHBvY2tldDAsIHBvY2tldDEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gaW5pdGlhbGl6ZSBjbG9ja3NcclxuICAgICAgICBjb25zdCBjMCA9IG5ldyBDbG9jayh0aGlzLmJhc2UsIHRoaXMuaW5jLCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2xvY2swJykgYXMgSFRNTEVsZW1lbnQpO1xyXG4gICAgICAgIGNvbnN0IGMxID0gbmV3IENsb2NrKHRoaXMuYmFzZSwgdGhpcy5pbmMsIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbG9jazEnKSBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgICAgdGhpcy5jbG9ja3MgPSBbYzAsIGMxXTtcclxuICAgICAgICB0aGlzLmNsb2Nrc1swXS5vblRpY2socmVuZGVyVGltZSk7XHJcbiAgICAgICAgdGhpcy5jbG9ja3NbMV0ub25UaWNrKHJlbmRlclRpbWUpO1xyXG5cclxuICAgICAgICBjb25zdCBmbGFnQ2FsbGJhY2sgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnR1cm5Db2xvciA9PT0gdGhpcy5teWNvbG9yICYmICF0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zdG9wKCk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkZsYWdcIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZmxhZ1wiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jbG9ja3NbMV0ub25GbGFnKGZsYWdDYWxsYmFjayk7XHJcblxyXG4gICAgICAgIC8vIHJlbmRlciBnYW1lIGRhdGFcclxuICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3VsdCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2I3Jlc3VsdCcsIHRoaXMudmFyaWFudCkpO1xyXG5cclxuICAgICAgICAvLyBmbGlwXHJcbiAgICAgICAgLy8gVE9ETzogY2xvY2tzXHJcbiAgICAgICAgY29uc3QgdG9nZ2xlT3JpZW50YXRpb24gPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuZmxpcCA9ICF0aGlzLmZsaXA7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQudG9nZ2xlT3JpZW50YXRpb24oKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xvciA9IHRoaXMuY2hlc3Nncm91bmQuc3RhdGUub3JpZW50YXRpb24gPT09IFwid2hpdGVcIiA/IFwid2hpdGVcIiA6IFwiYmxhY2tcIjtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0UGllY2VDb2xvcnMoY29sb3IpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkZMSVBcIik7XHJcbiAgICAgICAgICAgIGlmIChuZWVkUG9ja2V0cyh0aGlzLnZhcmlhbnQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0bXAgPSB0aGlzLnBvY2tldHNbMF07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBvY2tldHNbMF0gPSB0aGlzLnBvY2tldHNbMV07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBvY2tldHNbMV0gPSB0bXA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQwID0gcGF0Y2godGhpcy52cG9ja2V0MCwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLmZsaXAgPyB0aGlzLm15Y29sb3IgOiB0aGlzLm9wcGNvbG9yLCBcInRvcFwiKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQxID0gcGF0Y2godGhpcy52cG9ja2V0MSwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLmZsaXAgPyB0aGlzLm9wcGNvbG9yIDogdGhpcy5teWNvbG9yLCBcImJvdHRvbVwiKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRPRE86IGFkZCBkYXJrL2xpZ2h0IHRoZW1lIGJ1dHRvbnMgKGljb24tc3VuLW8vaWNvbi1tb29uLW8pXHJcbiAgICAgICAgLy8gVE9ETzogYWRkIHdlc3Rlcm4gcGllY2VzIHRoZW1lIGJ1dHRvbiBmb3IgeGlhbmdxdWksIHNob2dpLCBtYWtydWssIHNpdHR1eWluXHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG4tZmxpcCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnYnV0dG9uJywgeyBvbjogeyBjbGljazogKCkgPT4gdG9nZ2xlT3JpZW50YXRpb24oKSB9LCBwcm9wczoge3RpdGxlOiAnRmxpcCBib2FyZCd9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1yZWZyZXNoXCI6IHRydWV9IH0gKSwgXSkpO1xyXG5cclxuICAgICAgICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3pvb20nKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICBjb25zdCBzZXRab29tID0gKHpvb206IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jZy1ib2FyZC13cmFwJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlmIChlbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLndpZHRoICogKHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gNTIgOiA2NCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBiYXNlSGVpZ2h0ID0gZGltZW5zaW9uc1tWQVJJQU5UU1t0aGlzLnZhcmlhbnRdLmdlb21dLmhlaWdodCAqICh0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIiA/IDYwIDogNjQpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcHh3ID0gYCR7em9vbSAvIDEwMCAqIGJhc2VXaWR0aH1weGA7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBweGggPSBgJHt6b29tIC8gMTAwICogYmFzZUhlaWdodH1weGA7XHJcbiAgICAgICAgICAgICAgICBlbC5zdHlsZS53aWR0aCA9IHB4dztcclxuICAgICAgICAgICAgICAgIGVsLnN0eWxlLmhlaWdodCA9IHB4aDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV2ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XHJcbiAgICAgICAgICAgICAgICBldi5pbml0RXZlbnQoJ2NoZXNzZ3JvdW5kLnJlc2l6ZScsIGZhbHNlLCBmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LmRpc3BhdGNoRXZlbnQoZXYpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGF0dHJzOiB7IHdpZHRoOiAnMjgwcHgnLCB0eXBlOiAncmFuZ2UnLCB2YWx1ZTogMTAwLCBtaW46IDUwLCBtYXg6IDE1MCB9LFxyXG4gICAgICAgICAgICBvbjogeyBpbnB1dChlKSB7IHNldFpvb20ocGFyc2VGbG9hdCgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpKTsgfSB9IH0pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgY29uc3QgYWJvcnQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIFRPRE86IGRpc2FibGUgd2hlbiBwbHkgPiAyXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQWJvcnRcIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJhYm9ydFwiLCBnYW1lSWQ6IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0gfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBkcmF3ID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkRyYXdcIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJkcmF3XCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc2lnbiA9ICgpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJSZXNpZ25cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJyZXNpZ25cIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lLWNvbnRyb2xzJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xzID0gcGF0Y2goY29udGFpbmVyLCBoKCdkaXYnLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24jYWJvcnQnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBhYm9ydCgpIH0sIHByb3BzOiB7dGl0bGU6ICdBYm9ydCd9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi10aW1lc1wiOiB0cnVlfSB9ICksIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uI2RyYXcnLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiBkcmF3KCkgfSwgcHJvcHM6IHt0aXRsZTogXCJEcmF3XCJ9IH0sIFtoKCdpJywge2NsYXNzOiB7XCJpY29uXCI6IHRydWUsIFwiaWNvbi1oYW5kLXBhcGVyLW9cIjogdHJ1ZX0gfSApLCBdKSxcclxuICAgICAgICAgICAgICAgIGgoJ2J1dHRvbiNyZXNpZ24nLCB7IG9uOiB7IGNsaWNrOiAoKSA9PiByZXNpZ24oKSB9LCBwcm9wczoge3RpdGxlOiBcIlJlc2lnblwifSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tZmxhZy1vXCI6IHRydWV9IH0gKSwgXSksXHJcbiAgICAgICAgICAgICAgICBdKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udHJvbHMgPSBwYXRjaChjb250YWluZXIsIGgoJ2RpdicpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9uT3BlbiA9IChldnQpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJjdHJsLm9uT3BlbigpXCIsIGV2dCk7XHJcbiAgICAgICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJnYW1lX3VzZXJfY29ubmVjdGVkXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuc29jay5vbm9wZW4gPSAoZXZ0KSA9PiB7IG9uT3BlbihldnQpIH07XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0R3JvdW5kID0gKCkgPT4gdGhpcy5jaGVzc2dyb3VuZDtcclxuICAgIGdldERlc3RzID0gKCkgPT4gdGhpcy5kZXN0cztcclxuXHJcbiAgICByZWRyYXcgPSAoKSA9PiBmYWxzZTtcclxuXHJcbiAgICBwcml2YXRlIG9uTXNnR2FtZVN0YXJ0ID0gKG1zZykgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ290IGdhbWVTdGFydCBtc2c6XCIsIG1zZyk7XHJcbiAgICAgICAgaWYgKG1zZy5nYW1lSWQgIT09IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pIHJldHVybjtcclxuICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSBzb3VuZC5nZW5lcmljTm90aWZ5KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBuZXdPcHBvbmVudCA9IChob21lKSA9PiB7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmFzc2lnbihob21lKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVPdmVyID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuY29udHJvbHMgPSBwYXRjaCh0aGlzLmNvbnRyb2xzLCBoKCdkaXYnKSk7XHJcblxyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVzdWx0JykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdyZXN1bHQnLCB0aGlzLnJlc3VsdCkpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuc3BlY3RhdG9yKSB7XHJcbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWZ0ZXItZ2FtZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAvLyBUT0RPOiByZW1hdGNoIGJ1dHRvblxyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2J1dHRvbicsIHsgb246IHsgY2xpY2s6ICgpID0+IHRoaXMubmV3T3Bwb25lbnQodGhpcy5tb2RlbFtcImhvbWVcIl0pIH0gfSwgXCJOZXcgb3Bwb25lbnRcIikpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrU3RhdHVzID0gKG1zZykgPT4ge1xyXG4gICAgICAgIGlmIChtc2cuZ2FtZUlkICE9PSB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdKSByZXR1cm47XHJcbiAgICAgICAgaWYgKG1zZy5zdGF0dXMgPj0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1swXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzWzFdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgdGhpcy5yZXN1bHQgPSBtc2cucmVzdWx0O1xyXG4gICAgICAgICAgICBzd2l0Y2ggKG1zZy5yZXN1bHQpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCIxLzJcIjpcclxuICAgICAgICAgICAgICAgICAgICBzb3VuZC5kcmF3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiMS0wXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5teWNvbG9yID09PSBcIndoaXRlXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdW5kLnZpY3RvcnkoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdW5kLmRlZmVhdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIjAtMVwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZC52aWN0b3J5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZC5kZWZlYXQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIC8vIEFCT1JURURcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy50dikge1xyXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogc2VuZCBtc2cgdG8gc2VydmVyIGluc3RlYWQgYW5kIEJBQ0sgd2l0aCBuZXcgbW9kZWxbXCJnYW1lSWRcIl0gZXRjLiBnb3QgZnJvbSBhbnN3ZXJcclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge3dpbmRvdy5sb2NhdGlvbi5hc3NpZ24odGhpcy5tb2RlbFtcImhvbWVcIl0gKyAnL3R2Jyk7fSwgMTAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gY2hhbmdlIHNob2dpIHBpZWNlIGNvbG9ycyBhY2NvcmRpbmcgdG8gYm9hcmQgb3JpZW50YXRpb25cclxuICAgIHByaXZhdGUgc2V0UGllY2VDb2xvcnMgPSAoY29sb3IpID0+IHtcclxuICAgICAgICBpZiAoY29sb3IgPT09IFwid2hpdGVcIikge1xyXG4gICAgICAgICAgICBjaGFuZ2VDU1MoJy9zdGF0aWMvc2hvZ2kwLmNzcycsIDEpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNoYW5nZUNTUygnL3N0YXRpYy9zaG9naTEuY3NzJywgMSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJbiBDYXBhYmxhbmNhIHdlIGhhdmUgdG8gZmluZWxpemUgY2FzdGxpbmcgYmVjYXVzZVxyXG4gICAgLy8gY2hlc3Nncm91bmQgYXV0b0Nhc3RsZSB3b3JrcyBmb3Igc3RhbmRhcmQgY2hlc3Mgb25seVxyXG4gICAgcHJpdmF0ZSBjYXN0bGVSb29rID0gKGtpbmdEZXN0LCBjb2xvcikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGRpZmY6IFBpZWNlc0RpZmYgPSB7fTtcclxuICAgICAgICBpZiAoa2luZ0Rlc3QgPT09IFwiY1wiKSB7XHJcbiAgICAgICAgICAgIGRpZmZbY29sb3IgPT09ICd3aGl0ZScgPyBcImExXCIgOiBcImE4XCJdID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBkaWZmW2NvbG9yID09PSAnd2hpdGUnID8gXCJkMVwiIDogXCJkOFwiXSA9IHtjb2xvcjogY29sb3IsIHJvbGU6IFwicm9va1wifTtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXRQaWVjZXMoZGlmZik7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBpZiAoa2luZ0Rlc3QgPT09IFwiaVwiKSB7XHJcbiAgICAgICAgICAgIGRpZmZbY29sb3IgPT09ICd3aGl0ZScgPyBcImoxXCIgOiBcImo4XCJdID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBkaWZmW2NvbG9yID09PSAnd2hpdGUnID8gXCJoMVwiIDogXCJoOFwiXSA9IHtjb2xvcjogY29sb3IsIHJvbGU6IFwicm9va1wifTtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXRQaWVjZXMoZGlmZik7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnQm9hcmQgPSAobXNnKSA9PiB7XHJcbiAgICAgICAgaWYgKG1zZy5nYW1lSWQgIT09IHRoaXMubW9kZWxbXCJnYW1lSWRcIl0pIHJldHVybjtcclxuICAgICAgICAvLyBHYW1lIGFib3J0ZWQuXHJcbiAgICAgICAgaWYgKG1zZ1tcInN0YXR1c1wiXSA9PT0gMCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcImdvdCBib2FyZCBtc2c6XCIsIG1zZyk7XHJcbiAgICAgICAgdGhpcy5mdWxsZmVuID0gbXNnLmZlbjtcclxuICAgICAgICB0aGlzLmRlc3RzID0gbXNnLmRlc3RzO1xyXG4gICAgICAgIGNvbnN0IGNsb2NrcyA9IG1zZy5jbG9ja3M7XHJcblxyXG4gICAgICAgIGNvbnN0IHBhcnRzID0gbXNnLmZlbi5zcGxpdChcIiBcIik7XHJcbiAgICAgICAgdGhpcy50dXJuQ29sb3IgPSBwYXJ0c1sxXSA9PT0gXCJ3XCIgPyBcIndoaXRlXCIgOiBcImJsYWNrXCI7XHJcbiAgICAgICAgdGhpcy5hYm9ydGFibGUgPSBOdW1iZXIocGFydHNbcGFydHMubGVuZ3RoIC0gMV0pIDw9IDE7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNwZWN0YXRvciAmJiAhdGhpcy5hYm9ydGFibGUpIHtcclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhYm9ydCcpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICBwYXRjaChjb250YWluZXIsIGgoJ2J1dHRvbiNhYm9ydCcsIHsgcHJvcHM6IHtkaXNhYmxlZDogdHJ1ZX0gfSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGxhc3RNb3ZlID0gbXNnLmxhc3RNb3ZlO1xyXG4gICAgICAgIGlmIChsYXN0TW92ZSAhPT0gbnVsbCAmJiB0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikge1xyXG4gICAgICAgICAgICBsYXN0TW92ZSA9IHVzaTJ1Y2kobGFzdE1vdmVbMF0gKyBsYXN0TW92ZVsxXSk7XHJcbiAgICAgICAgICAgIGxhc3RNb3ZlID0gW2xhc3RNb3ZlLnNsaWNlKDAsMiksIGxhc3RNb3ZlLnNsaWNlKDIsNCldO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBkcm9wIGxhc3RNb3ZlIGNhdXNpbmcgc2Nyb2xsYmFyIGZsaWNrZXIsXHJcbiAgICAgICAgLy8gc28gd2UgcmVtb3ZlIGZyb20gcGFydCB0byBhdm9pZCB0aGF0XHJcbiAgICAgICAgaWYgKGxhc3RNb3ZlICE9PSBudWxsICYmIGxhc3RNb3ZlWzBdWzFdID09PSAnQCcpIGxhc3RNb3ZlID0gW2xhc3RNb3ZlWzFdXTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIi4uLlwiLG1zZy5sYXN0TW92ZSwgbGFzdE1vdmUpO1xyXG4gICAgICAgIC8vIHNhdmUgY2FwdHVyZSBzdGF0ZSBiZWZvcmUgdXBkYXRpbmcgY2hlc3Nncm91bmRcclxuICAgICAgICBjb25zdCBjYXB0dXJlID0gbGFzdE1vdmUgIT09IG51bGwgJiYgdGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5waWVjZXNbbGFzdE1vdmVbMV1dXHJcblxyXG4gICAgICAgIGlmIChsYXN0TW92ZSAhPT0gbnVsbCAmJiAodGhpcy50dXJuQ29sb3IgPT09IHRoaXMubXljb2xvciB8fCB0aGlzLnNwZWN0YXRvcikpIHtcclxuICAgICAgICAgICAgaWYgKGNhcHR1cmUpIHtcclxuICAgICAgICAgICAgICAgIHNvdW5kLmNhcHR1cmUoKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHNvdW5kLm1vdmUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGxhc3RNb3ZlID0gW107XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2hlY2tTdGF0dXMobXNnKTtcclxuICAgICAgICBpZiAobXNnLmNoZWNrKSB7XHJcbiAgICAgICAgICAgIHNvdW5kLmNoZWNrKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvcHBjbG9jayA9ICF0aGlzLmZsaXAgPyAwIDogMTtcclxuICAgICAgICBjb25zdCBteWNsb2NrID0gMSAtIG9wcGNsb2NrO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgZmVuOiBwYXJ0c1swXSxcclxuICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgICAgICBjaGVjazogbXNnLmNoZWNrLFxyXG4gICAgICAgICAgICAgICAgbGFzdE1vdmU6IGxhc3RNb3ZlLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdXBkYXRlUG9ja2V0cyh0aGlzLCB0aGlzLnZwb2NrZXQwLCB0aGlzLnZwb2NrZXQxKTtcclxuICAgICAgICAgICAgdGhpcy5jbG9ja3NbMF0ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb2Nrc1sxXS5wYXVzZShmYWxzZSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zZXRUaW1lKGNsb2Nrc1t0aGlzLm9wcGNvbG9yXSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnNldFRpbWUoY2xvY2tzW3RoaXMubXljb2xvcl0pO1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlICYmIG1zZy5zdGF0dXMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50dXJuQ29sb3IgPT09IHRoaXMubXljb2xvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW215Y2xvY2tdLnN0YXJ0KCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zdGFydCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMudHVybkNvbG9yID09PSB0aGlzLm15Y29sb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0KHtcclxuICAgICAgICAgICAgICAgICAgICBmZW46IHBhcnRzWzBdLFxyXG4gICAgICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmcmVlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IHRoaXMubXljb2xvcixcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzdHM6IG1zZy5kZXN0cyxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrOiBtc2cuY2hlY2ssXHJcbiAgICAgICAgICAgICAgICAgICAgbGFzdE1vdmU6IGxhc3RNb3ZlLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB1cGRhdGVQb2NrZXRzKHRoaXMsIHRoaXMudnBvY2tldDAsIHRoaXMudnBvY2tldDEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnBhdXNlKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2xvY2tzW29wcGNsb2NrXS5zZXRUaW1lKGNsb2Nrc1t0aGlzLm9wcGNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlICYmIG1zZy5zdGF0dXMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10uc3RhcnQoY2xvY2tzW3RoaXMubXljb2xvcl0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdNWSBDTE9DSyBTVEFSVEVEJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcInRyeWluZyB0byBwbGF5IHByZW1vdmUuLi4uXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlbW92ZSkgdGhpcy5wZXJmb3JtUHJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlZHJvcCkgdGhpcy5wZXJmb3JtUHJlZHJvcCgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy50dXJuQ29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXN0czogbXNnLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgY2hlY2s6IG1zZy5jaGVjayxcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10ucGF1c2UoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jbG9ja3NbbXljbG9ja10uc2V0VGltZShjbG9ja3NbdGhpcy5teWNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWJvcnRhYmxlICYmIG1zZy5zdGF0dXMgPCAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnN0YXJ0KGNsb2Nrc1t0aGlzLm9wcGNvbG9yXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ09QUCBDTE9DSyAgU1RBUlRFRCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkb1NlbmQgPSAobWVzc2FnZSkgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiLS0tPiBkb1NlbmQoKTpcIiwgbWVzc2FnZSk7XHJcbiAgICAgICAgdGhpcy5zb2NrLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2VuZE1vdmUgPSAob3JpZywgZGVzdCwgcHJvbW8pID0+IHtcclxuICAgICAgICAvLyBwYXVzZSgpIHdpbGwgYWRkIGluY3JlbWVudCFcclxuICAgICAgICBjb25zdCBvcHBjbG9jayA9ICF0aGlzLmZsaXAgPyAwIDogMVxyXG4gICAgICAgIGNvbnN0IG15Y2xvY2sgPSAxIC0gb3BwY2xvY2s7XHJcbiAgICAgICAgY29uc3QgbW92ZXRpbWUgPSAodGhpcy5jbG9ja3NbbXljbG9ja10ucnVubmluZykgPyBEYXRlLm5vdygpIC0gdGhpcy5jbG9ja3NbbXljbG9ja10uc3RhcnRUaW1lIDogMDtcclxuICAgICAgICB0aGlzLmNsb2Nrc1tteWNsb2NrXS5wYXVzZSh0cnVlKTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcInNlbmRNb3ZlKG9yaWcsIGRlc3QsIHByb20pXCIsIG9yaWcsIGRlc3QsIHByb21vKTtcclxuICAgICAgICBjb25zdCB1Y2lfbW92ZSA9IG9yaWcgKyBkZXN0ICsgcHJvbW87XHJcbiAgICAgICAgY29uc3QgbW92ZSA9IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gdWNpMnVzaSh1Y2lfbW92ZSkgOiB1Y2lfbW92ZTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcInNlbmRNb3ZlKG1vdmUpXCIsIG1vdmUpO1xyXG4gICAgICAgIC8vIFRPRE86IGlmIHByZW1vdmVkLCBzZW5kIDAgdGltZVxyXG4gICAgICAgIGxldCBiY2xvY2ssIGNsb2NrcztcclxuICAgICAgICBpZiAoIXRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICBiY2xvY2sgPSB0aGlzLm15Y29sb3IgPT09IFwiYmxhY2tcIiA/IDEgOiAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJjbG9jayA9IHRoaXMubXljb2xvciA9PT0gXCJibGFja1wiID8gMCA6IDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHdjbG9jayA9IDEgLSBiY2xvY2tcclxuICAgICAgICBjbG9ja3MgPSB7bW92ZXRpbWU6IG1vdmV0aW1lLCBibGFjazogdGhpcy5jbG9ja3NbYmNsb2NrXS5kdXJhdGlvbiwgd2hpdGU6IHRoaXMuY2xvY2tzW3djbG9ja10uZHVyYXRpb259O1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHsgdHlwZTogXCJtb3ZlXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSwgbW92ZTogbW92ZSwgY2xvY2tzOiBjbG9ja3MgfSk7XHJcbiAgICAgICAgaWYgKCF0aGlzLmFib3J0YWJsZSkgdGhpcy5jbG9ja3Nbb3BwY2xvY2tdLnN0YXJ0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdmUgPSAoKSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIChvcmlnLCBkZXN0LCBjYXB0dXJlZFBpZWNlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uTW92ZSgpXCIsIG9yaWcsIGRlc3QsIGNhcHR1cmVkUGllY2UpO1xyXG4gICAgICAgICAgICBpZiAoY2FwdHVyZWRQaWVjZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQuY2FwdHVyZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Ecm9wID0gKCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAocGllY2UsIGRlc3QpID0+IHtcclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJncm91bmQub25Ecm9wKClcIiwgcGllY2UsIGRlc3QpO1xyXG4gICAgICAgICAgICBpZiAoZGVzdCAhPSBcImEwXCIgJiYgcGllY2Uucm9sZSkge1xyXG4gICAgICAgICAgICAgICAgc291bmQubW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0UHJlbW92ZSA9IChvcmlnLCBkZXN0LCBtZXRhKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVtb3ZlID0geyBvcmlnLCBkZXN0LCBtZXRhIH07XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXRQcmVtb3ZlKCkgdG86XCIsIG9yaWcsIGRlc3QsIG1ldGEpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdW5zZXRQcmVtb3ZlID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXRQcmVkcm9wID0gKHJvbGUsIGtleSkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlZHJvcCA9IHsgcm9sZSwga2V5IH07XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXRQcmVkcm9wKCkgdG86XCIsIHJvbGUsIGtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1bnNldFByZWRyb3AgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBlcmZvcm1QcmVtb3ZlID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHsgb3JpZywgZGVzdCwgbWV0YSB9ID0gdGhpcy5wcmVtb3ZlO1xyXG4gICAgICAgIC8vIFRPRE86IHByb21vdGlvbj9cclxuICAgICAgICBjb25zb2xlLmxvZyhcInBlcmZvcm1QcmVtb3ZlKClcIiwgb3JpZywgZGVzdCwgbWV0YSk7XHJcbiAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5wbGF5UHJlbW92ZSgpO1xyXG4gICAgICAgIHRoaXMucHJlbW92ZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwZXJmb3JtUHJlZHJvcCA9ICgpID0+IHtcclxuICAgICAgICBjb25zdCB7IHJvbGUsIGtleSB9ID0gdGhpcy5wcmVkcm9wO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwicGVyZm9ybVByZWRyb3AoKVwiLCByb2xlLCBrZXkpO1xyXG4gICAgICAgIHRoaXMuY2hlc3Nncm91bmQucGxheVByZWRyb3AoZHJvcCA9PiB7IHJldHVybiBkcm9wSXNWYWxpZCh0aGlzLmRlc3RzLCBkcm9wLnJvbGUsIGRyb3Aua2V5KTsgfSk7XHJcbiAgICAgICAgdGhpcy5wcmVkcm9wID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVXNlck1vdmUgPSAob3JpZywgZGVzdCwgbWV0YSkgPT4ge1xyXG4gICAgICAgIC8vIGNoZXNzZ3JvdW5kIGRvZXNuJ3Qga25vd3MgYWJvdXQgZXAsIHNvIHdlIGhhdmUgdG8gcmVtb3ZlIGVwIGNhcHR1cmVkIHBhd25cclxuICAgICAgICBjb25zdCBwaWVjZXMgPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLnBpZWNlcztcclxuICAgICAgICBjb25zdCBnZW9tID0gdGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5nZW9tZXRyeTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImdyb3VuZC5vblVzZXJNb3ZlKClcIiwgb3JpZywgZGVzdCwgbWV0YSwgcGllY2VzKTtcclxuICAgICAgICBjb25zdCBtb3ZlZCA9IHBpZWNlc1tkZXN0XSBhcyBQaWVjZTtcclxuICAgICAgICBjb25zdCBmaXJzdFJhbmtJczAgPSB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLmRpbWVuc2lvbnMuaGVpZ2h0ID09PSAxMDtcclxuICAgICAgICBpZiAobWV0YS5jYXB0dXJlZCA9PT0gdW5kZWZpbmVkICYmIG1vdmVkLnJvbGUgPT09IFwicGF3blwiICYmIG9yaWdbMF0gIT0gZGVzdFswXSAmJiBoYXNFcCh0aGlzLnZhcmlhbnQpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcyA9IGtleTJwb3MoZGVzdCwgZmlyc3RSYW5rSXMwKSxcclxuICAgICAgICAgICAgcGF3blBvczogUG9zID0gW3Bvc1swXSwgcG9zWzFdICsgKHRoaXMubXljb2xvciA9PT0gJ3doaXRlJyA/IC0xIDogMSldO1xyXG4gICAgICAgICAgICBjb25zdCBkaWZmOiBQaWVjZXNEaWZmID0ge307XHJcbiAgICAgICAgICAgIGRpZmZbcG9zMmtleShwYXduUG9zLCBnZW9tKV0gPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHRoaXMuY2hlc3Nncm91bmQuc2V0UGllY2VzKGRpZmYpO1xyXG4gICAgICAgICAgICBtZXRhLmNhcHR1cmVkID0ge3JvbGU6IFwicGF3blwifTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vIGluY3JlYXNlIHBvY2tldCBjb3VudFxyXG4gICAgICAgIGlmICgodGhpcy52YXJpYW50ID09PSBcImNyYXp5aG91c2VcIiB8fCB0aGlzLnZhcmlhbnQgPT09IFwic2hvZ2lcIikgJiYgbWV0YS5jYXB0dXJlZCkge1xyXG4gICAgICAgICAgICB2YXIgcm9sZSA9IG1ldGEuY2FwdHVyZWQucm9sZVxyXG4gICAgICAgICAgICBpZiAobWV0YS5jYXB0dXJlZC5wcm9tb3RlZCkgcm9sZSA9IHRoaXMudmFyaWFudCA9PT0gXCJzaG9naVwiID8gbWV0YS5jYXB0dXJlZC5yb2xlLnNsaWNlKDEpIGFzIFJvbGUgOiBcInBhd25cIjtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmZsaXApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1swXVtyb2xlXSsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MCA9IHBhdGNoKHRoaXMudnBvY2tldDAsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcInRvcFwiKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBvY2tldHNbMV1bcm9sZV0rKztcclxuICAgICAgICAgICAgICAgIHRoaXMudnBvY2tldDEgPSBwYXRjaCh0aGlzLnZwb2NrZXQxLCBwb2NrZXRWaWV3KHRoaXMsIHRoaXMubXljb2xvciwgXCJib3R0b21cIikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICAvLyBjaGVzc2dyb3VuZCBhdXRvQ2FzdGxlIHdvcmtzIGZvciBzdGFuZGFyZCBjaGVzcyBvbmx5XHJcbiAgICAgICAgaWYgKHRoaXMudmFyaWFudCA9PT0gXCJjYXBhYmxhbmNhXCIgJiYgbW92ZWQucm9sZSA9PT0gXCJraW5nXCIgJiYgb3JpZ1swXSA9PT0gXCJmXCIpIHRoaXMuY2FzdGxlUm9vayhkZXN0WzBdLCB0aGlzLm15Y29sb3IpO1xyXG5cclxuICAgICAgICAvLyAgZ2F0aW5nIGVsZXBoYW50L2hhd2tcclxuICAgICAgICBpZiAodGhpcy52YXJpYW50ID09PSBcInNlaXJhd2FuXCIpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnByb21vdGlvbi5zdGFydChvcmlnLCBkZXN0LCBtZXRhKSAmJiAhdGhpcy5nYXRpbmcuc3RhcnQodGhpcy5mdWxsZmVuLCBvcmlnLCBkZXN0LCBtZXRhKSkgdGhpcy5zZW5kTW92ZShvcmlnLCBkZXN0LCAnJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnByb21vdGlvbi5zdGFydChvcmlnLCBkZXN0LCBtZXRhKSkgdGhpcy5zZW5kTW92ZShvcmlnLCBkZXN0LCAnJyk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVXNlckRyb3AgPSAocm9sZSwgZGVzdCkgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiZ3JvdW5kLm9uVXNlckRyb3AoKVwiLCByb2xlLCBkZXN0KTtcclxuICAgICAgICAvLyBkZWNyZWFzZSBwb2NrZXQgY291bnRcclxuICAgICAgICBpZiAoZHJvcElzVmFsaWQodGhpcy5kZXN0cywgcm9sZSwgZGVzdCkpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZmxpcCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wb2NrZXRzWzBdW3JvbGVdLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZwb2NrZXQwID0gcGF0Y2godGhpcy52cG9ja2V0MCwgcG9ja2V0Vmlldyh0aGlzLCB0aGlzLm15Y29sb3IsIFwidG9wXCIpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucG9ja2V0c1sxXVtyb2xlXS0tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52cG9ja2V0MSA9IHBhdGNoKHRoaXMudnBvY2tldDEsIHBvY2tldFZpZXcodGhpcywgdGhpcy5teWNvbG9yLCBcImJvdHRvbVwiKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5zZW5kTW92ZShyb2xlVG9TYW5bcm9sZV0gKyBcIkBcIiwgZGVzdCwgJycpXHJcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwic2VudCBtb3ZlXCIsIG1vdmUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpZmY6IFBpZWNlc0RpZmYgPSB7fTtcclxuICAgICAgICAgICAgZGlmZltkZXN0XSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgdGhpcy5jaGVzc2dyb3VuZC5zZXRQaWVjZXMoZGlmZik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiISEhIGludmFsaWQgbW92ZSAhISFcIiwgcm9sZSwgZGVzdCk7XHJcbiAgICAgICAgICAgIC8vIHJlc3RvcmUgbGFzdE1vdmUgc2V0IGJ5IGludmFsaWQgZHJvcFxyXG4gICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7XHJcbiAgICAgICAgICAgICAgICBsYXN0TW92ZTogdGhpcy5sYXN0bW92ZSxcclxuICAgICAgICAgICAgICAgIHR1cm5Db2xvcjogdGhpcy5teWNvbG9yLFxyXG4gICAgICAgICAgICAgICAgbW92YWJsZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGRlc3RzOiB0aGlzLmRlc3RzLFxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dEZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIC8vIE9yIGltcGxlbWVudCBvbmRibGNsaWNrIGhhbmRsZXIgdG8gZW1pdCBtb3ZlIGluIGNoZXNzZ3JvdW5kP1xyXG4gICAgLy8gaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9qc3JlZi9ldmVudF9vbmRibGNsaWNrLmFzcFxyXG4gICAgcHJpdmF0ZSBvbkNoYW5nZSA9IChzZWxlY3RlZCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiICAgZ3JvdW5kLm9uQ2hhbmdlKClcIiwgc2VsZWN0ZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1c2UgdGhpcyBmb3Igc2l0dHV5aW4gaW4gcGxhY2UgcHJvbW90aW9uID9cclxuICAgIHByaXZhdGUgb25TZWxlY3QgPSAoc2VsZWN0ZWQpID0+IHtcclxuICAgICAgICByZXR1cm4gKGtleSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIiAgIGdyb3VuZC5vblNlbGVjdCgpXCIsIGtleSwgc2VsZWN0ZWQpO1xyXG4gICAgICAgICAgICAvLyBJZiBkcm9wIHNlbGVjdGlvbiB3YXMgc2V0IGRyb3BEZXN0cyB3ZSBoYXZlIHRvIHJlc3RvcmUgZGVzdHMgaGVyZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5jaGVzc2dyb3VuZC5zdGF0ZS5tb3ZhYmxlLmRlc3RzISA9PT0gdW5kZWZpbmVkKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChrZXkgIT0gXCJhMFwiICYmIFwiYTBcIiBpbiB0aGlzLmNoZXNzZ3JvdW5kLnN0YXRlLm1vdmFibGUuZGVzdHMhKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZXNzZ3JvdW5kLnNldCh7IG1vdmFibGU6IHsgZGVzdHM6IHRoaXMuZGVzdHMgfX0pO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgICAgICBpZiAodGhpcy5zcGVjdGF0b3IpIHtcclxuICAgICAgICAgICAgLy8gd2Ugd2FudCB0byBrbm93IGxhc3RNb3ZlIGFuZCBjaGVjayBzdGF0dXNcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImJvYXJkXCIsIGdhbWVJZDogdGhpcy5tb2RlbFtcImdhbWVJZFwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwicmVhZHlcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiYm9hcmRcIiwgZ2FtZUlkOiB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTWVzc2FnZSA9IChldnQpID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIjwrKysgb25NZXNzYWdlKCk6XCIsIGV2dC5kYXRhKTtcclxuICAgICAgICB2YXIgbXNnID0gSlNPTi5wYXJzZShldnQuZGF0YSk7XHJcbiAgICAgICAgc3dpdGNoIChtc2cudHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiYm9hcmRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dCb2FyZChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnYW1lRW5kXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrU3RhdHVzKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImdhbWVTdGFydFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ0dhbWVTdGFydChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnYW1lX3VzZXJfY29ubmVjdGVkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXNlckNvbm5lY3RlZChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcbiIsImltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xyXG5pbXBvcnQgdG9WTm9kZSBmcm9tICdzbmFiYmRvbS90b3Zub2RlJztcclxuXHJcbmltcG9ydCB7IGtleTJwb3MgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcblxyXG5pbXBvcnQgeyBjYW5HYXRlLCByb2xlVG9TYW4gfSBmcm9tICcuL2NoZXNzJztcclxuaW1wb3J0IHsgcG9ja2V0VmlldyB9IGZyb20gJy4vcG9ja2V0JztcclxuXHJcbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIGxpc3RlbmVyc10pO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oY3RybCkge1xyXG5cclxuICAgIGxldCBnYXRpbmc6IGFueSA9IGZhbHNlO1xyXG4gICAgdmFyIHJvbGVzID0gW1wiaGF3a1wiLCBcImVsZXBoYW50XCIsIFwiXCJdO1xyXG5cclxuICAgIGZ1bmN0aW9uIHN0YXJ0KGZlbiwgb3JpZywgZGVzdCwgbWV0YSkge1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZCA9IGN0cmwuZ2V0R3JvdW5kKCk7XHJcbiAgICAgICAgY29uc3QgZ2F0YWJsZSA9IGNhbkdhdGUoZmVuLCBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLCBvcmlnLCBkZXN0LCBtZXRhKVxyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiY2FuR2F0ZSgpIHJldHVybmVkOlwiLCBnYXRhYmxlKTtcclxuICAgICAgICBpZiAoZ2F0YWJsZVswXSB8fCBnYXRhYmxlWzFdKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gY3RybC5teWNvbG9yO1xyXG4gICAgICAgICAgICBjb25zdCBvcmllbnRhdGlvbiA9IGdyb3VuZC5zdGF0ZS5vcmllbnRhdGlvbjtcclxuICAgICAgICAgICAgaWYgKHJvbGVzLmluY2x1ZGVzKFwiaGF3a1wiKSAmJiAhZ2F0YWJsZVswXSkgcm9sZXMuc3BsaWNlKHJvbGVzLmluZGV4T2YoXCJoYXdrXCIpLCAxKTtcclxuICAgICAgICAgICAgaWYgKHJvbGVzLmluY2x1ZGVzKFwiZWxlcGhhbnRcIikgJiYgIWdhdGFibGVbMV0pIHJvbGVzLnNwbGljZShyb2xlcy5pbmRleE9mKFwiZWxlcGhhbnRcIiksIDEpO1xyXG4gICAgICAgICAgICB2YXIgb3JpZ3MgPSBbb3JpZ107XHJcbiAgICAgICAgICAgIGNvbnN0IGNhc3RsaW5nID0gZ3JvdW5kLnN0YXRlLnBpZWNlc1tkZXN0XS5yb2xlID09PSBcImtpbmdcIiAmJiBvcmlnWzBdID09PSBcImVcIiAmJiBkZXN0WzBdICE9PSBcImRcIiAmJiBkZXN0WzBdICE9PSBcImVcIiAmJiBkZXN0WzBdICE9PSBcImZcIjtcclxuICAgICAgICAgICAgdmFyIHJvb2tEZXN0ID0gXCJcIjtcclxuICAgICAgICAgICAgaWYgKGNhc3RsaW5nKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBPLU9cclxuICAgICAgICAgICAgICAgIGlmIChkZXN0WzBdID4gXCJlXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBvcmlncy5wdXNoKFwiaFwiICsgb3JpZ1sxXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcm9va0Rlc3QgPSAgXCJlXCIgKyBvcmlnWzFdO1xyXG4gICAgICAgICAgICAgICAgLy8gTy1PLU9cclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgb3JpZ3MucHVzaChcImFcIiArIG9yaWdbMV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJvb2tEZXN0ID0gIFwiZVwiICsgb3JpZ1sxXTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGRyYXdfZ2F0aW5nKG9yaWdzLCBjb2xvciwgb3JpZW50YXRpb24pO1xyXG4gICAgICAgICAgICBnYXRpbmcgPSB7XHJcbiAgICAgICAgICAgICAgICBvcmlnczogb3JpZ3MsXHJcbiAgICAgICAgICAgICAgICBkZXN0OiBkZXN0LFxyXG4gICAgICAgICAgICAgICAgcm9va0Rlc3Q6IHJvb2tEZXN0LFxyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2s6IGN0cmwuc2VuZE1vdmUsXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGdhdGUoY3RybCwgb3JpZywgZGVzdCwgcm9sZSkge1xyXG4gICAgICAgIGNvbnN0IGcgPSBjdHJsLmdldEdyb3VuZCgpO1xyXG4gICAgICAgIGNvbnN0IGNvbG9yID0gZy5zdGF0ZS5waWVjZXNbZGVzdF0uY29sb3I7XHJcbiAgICAgICAgZy5uZXdQaWVjZSh7XCJyb2xlXCI6IHJvbGUsIFwiY29sb3JcIjogY29sb3J9LCBvcmlnKVxyXG4gICAgICAgIGN0cmwucG9ja2V0c1tjb2xvciA9PT0gJ3doaXRlJyA/IDAgOiAxXVtyb2xlXS0tO1xyXG4gICAgICAgIGN0cmwudnBvY2tldDEgPSBwYXRjaChjdHJsLnZwb2NrZXQxLCBwb2NrZXRWaWV3KGN0cmwsIGNvbG9yLCBcImJvdHRvbVwiKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZHJhd19nYXRpbmcob3JpZ3MsIGNvbG9yLCBvcmllbnRhdGlvbikge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSB0b1ZOb2RlKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5leHRlbnNpb24nKSBhcyBOb2RlKTtcclxuICAgICAgICBwYXRjaChjb250YWluZXIsIHJlbmRlckdhdGluZyhvcmlncywgY29sb3IsIG9yaWVudGF0aW9uKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZHJhd19ub19nYXRpbmcoKSB7XHJcbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb25fY2hvaWNlJykgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgcGF0Y2goY29udGFpbmVyLCBoKCdkaXYuZXh0ZW5zaW9uJykpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmlzaChyb2xlLCBpbmRleCkge1xyXG4gICAgICAgIGlmIChnYXRpbmcpIHtcclxuICAgICAgICAgICAgZHJhd19ub19nYXRpbmcoKTtcclxuICAgICAgICAgICAgZ2F0ZShjdHJsLCBnYXRpbmcub3JpZ3NbaW5kZXhdLCBnYXRpbmcuZGVzdCwgcm9sZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGdhdGVkID0gcm9sZSA/IHJvbGVUb1Nhbltyb2xlXS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcclxuICAgICAgICAgICAgaWYgKGdhdGluZy5jYWxsYmFjaykgZ2F0aW5nLmNhbGxiYWNrKGdhdGluZy5vcmlnc1tpbmRleF0sIGluZGV4ID09PSAwID8gZ2F0aW5nLmRlc3QgOiBnYXRpbmcucm9va0Rlc3QsIGdhdGVkKTtcclxuICAgICAgICAgICAgZ2F0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjYW5jZWwoKSB7XHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYmluZChldmVudE5hbWU6IHN0cmluZywgZjogKGU6IEV2ZW50KSA9PiB2b2lkLCByZWRyYXcpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBpbnNlcnQodm5vZGUpIHtcclxuICAgICAgICAgICAgICAgIHZub2RlLmVsbS5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzID0gZihlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocmVkcmF3KSByZWRyYXcoKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlbmRlclNxdWFyZXMob3JpZywgY29sb3IsIG9yaWVudGF0aW9uLCBpbmRleCkge1xyXG4gICAgICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IGZhbHNlO1xyXG4gICAgICAgIHZhciBsZWZ0ID0gKDggLSBrZXkycG9zKG9yaWcsIGZpcnN0UmFua0lzMClbMF0pICogMTIuNTtcclxuICAgICAgICBpZiAob3JpZW50YXRpb24gPT09IFwid2hpdGVcIikgbGVmdCA9IDg3LjUgLSBsZWZ0O1xyXG4gICAgICAgIHJldHVybiByb2xlcy5tYXAoKHNlcnZlclJvbGUsIGkpID0+IHtcclxuICAgICAgICAgICAgdmFyIHRvcCA9IChjb2xvciA9PT0gb3JpZW50YXRpb24gPyA3IC0gaSA6IGkpICogMTIuNTtcclxuICAgICAgICAgICAgcmV0dXJuIGgoXHJcbiAgICAgICAgICAgICAgICBcInNxdWFyZVwiLFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGF0dHJzOiB7IHN0eWxlOiBcInRvcDogXCIgKyB0b3AgKyBcIiU7bGVmdDogXCIgKyBsZWZ0ICsgXCIlXCIgfSxcclxuICAgICAgICAgICAgICAgICAgICBob29rOiBiaW5kKFwiY2xpY2tcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpbmlzaChzZXJ2ZXJSb2xlLCBpbmRleCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSwgZmFsc2UpXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgW2goXCJwaWVjZS5cIiArIHNlcnZlclJvbGUgKyBcIi5cIiArIGNvbG9yKV1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9KVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlbmRlckdhdGluZyhvcmlncywgY29sb3IsIG9yaWVudGF0aW9uKSB7XHJcbiAgICAgICAgdmFyIHZlcnRpY2FsID0gY29sb3IgPT09IG9yaWVudGF0aW9uID8gXCJ0b3BcIiA6IFwiYm90dG9tXCI7XHJcbiAgICAgICAgdmFyIHNxdWFyZXMgPSByZW5kZXJTcXVhcmVzKG9yaWdzWzBdLCBjb2xvciwgb3JpZW50YXRpb24sIDApO1xyXG4gICAgICAgIGlmIChvcmlncy5sZW5ndGggPiAxKSBzcXVhcmVzID0gc3F1YXJlcy5jb25jYXQocmVuZGVyU3F1YXJlcyhvcmlnc1sxXSwgY29sb3IsIG9yaWVudGF0aW9uLCAxKSk7XHJcbiAgICAgICAgcmV0dXJuIGgoXHJcbiAgICAgICAgICAgIFwiZGl2I2V4dGVuc2lvbl9jaG9pY2UuXCIgKyB2ZXJ0aWNhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgaG9vazoge1xyXG4gICAgICAgICAgICAgICAgICAgIGluc2VydDogdm5vZGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBlbCA9IHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGNhbmNlbCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihcImNvbnRleHRtZW51XCIsIGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHNxdWFyZXNcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhcnQsXHJcbiAgICB9O1xyXG59XHJcbiIsImltcG9ydCB7IGluaXQgfSBmcm9tICdzbmFiYmRvbSc7XHJcbmltcG9ydCBrbGFzcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJztcclxuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcclxuaW1wb3J0IHByb3BlcnRpZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9wcm9wcyc7XHJcbmltcG9ydCBsaXN0ZW5lcnMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9ldmVudGxpc3RlbmVycyc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBwcm9wZXJ0aWVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcbmltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gJ3NuYWJiZG9tL3Zub2RlJztcclxuXHJcbmltcG9ydCB7IHJlbmRlclVzZXJuYW1lIH0gZnJvbSAnLi91c2VyJztcclxuaW1wb3J0IHsgdmFyaWFudHMgfSBmcm9tICcuL2NoZXNzJztcclxuXHJcbmV4cG9ydCBjb25zdCBBQ0NFUFQgPSBTeW1ib2woXCJBY2NlcHRcIik7XHJcbmV4cG9ydCBjb25zdCBBREQgPSBTeW1ib2woJ0FkZCcpO1xyXG5leHBvcnQgY29uc3QgREVMRVRFID0gU3ltYm9sKCdEZWxldGUnKTtcclxuZXhwb3J0IGNvbnN0IFVQREFURSA9IFN5bWJvbCgnVXBkYXRlJyk7XHJcbmV4cG9ydCBjb25zdCBSRVNFVCA9IFN5bWJvbCgnUmVzZXQnKTtcclxuXHJcblxyXG5jbGFzcyBMb2JieUNvbnRyb2xsZXIge1xyXG4gICAgbW9kZWw7XHJcbiAgICBzb2NrO1xyXG4gICAgZXZ0SGFuZGxlcjtcclxuICAgIHBsYXllcjtcclxuICAgIGxvZ2dlZF9pbjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihlbCwgbW9kZWwsIGhhbmRsZXIpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkxvYmJ5Q29udHJvbGxlciBjb25zdHJ1Y3RvclwiLCBlbCwgbW9kZWwpO1xyXG4gICAgICAgIC8vIFRPRE86IHVzZSBhdXRvIHJlY29ubmVjdGluZyBzb2NrZXR0ZSBpbiBsb2JieSBhbmQgcm91bmQgY3RybFxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuc29jayA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlcnIpIHtcclxuICAgICAgICAgICAgdGhpcy5zb2NrID0gbmV3IFdlYlNvY2tldChcIndzczovL1wiICsgbG9jYXRpb24uaG9zdCArIFwiL3dzXCIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xyXG4gICAgICAgIHRoaXMuZXZ0SGFuZGxlciA9IGhhbmRsZXJcclxuXHJcbiAgICAgICAgY29uc3Qgb25PcGVuID0gKGV2dCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIi0tLUNPTk5FQ1RFRFwiLCBldnQpO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwibG9iYnlfdXNlcl9jb25uZWN0ZWRcIiB9KTtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImdldF9zZWVrc1wiIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zb2NrLm9ub3BlbiA9IChldnQpID0+IHsgb25PcGVuKGV2dCkgfTtcclxuICAgICAgICB0aGlzLnNvY2sub25jbG9zZSA9IChldnQpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCItLS1ESVNDT05ORUNURURcIiwgZXZ0LmNvZGUsIGV2dC5yZWFzb24pO1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiY2xvc2VcIiB9KTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuc29jay5vbmVycm9yID0gKGV2dCkgPT4geyBjb25zb2xlLmxvZyhcIi0tLUVSUk9SOlwiLCBldnQuZGF0YSkgfTtcclxuICAgICAgICB0aGlzLnNvY2sub25tZXNzYWdlID0gKGV2dCkgPT4geyB0aGlzLm9uTWVzc2FnZShldnQpIH07XHJcblxyXG4gICAgICAgIC8vIGdldCBzZWVrcyB3aGVuIHdlIGFyZSBjb21pbmcgYmFjayBhZnRlciBhIGdhbWVcclxuICAgICAgICBpZiAodGhpcy5zb2NrLnJlYWR5U3RhdGUgPT09IDEpIHtcclxuICAgICAgICAgICAgdGhpcy5kb1NlbmQoeyB0eXBlOiBcImdldF9zZWVrc1wiIH0pO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgcGF0Y2goZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlZWtidXR0b25zJykgYXMgSFRNTEVsZW1lbnQsIGgoJ3VsI3NlZWtidXR0b25zJywgdGhpcy5yZW5kZXJTZWVrQnV0dG9ucygpKSk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIGRvU2VuZCAobWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiLS0tPiBsb2JieSBkb1NlbmQoKTpcIiwgbWVzc2FnZSk7XHJcbiAgICAgICAgdGhpcy5zb2NrLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGNyZWF0ZVNlZWtNc2cgKHZhcmlhbnQsIGNvbG9yLCBmZW4sIG1pbnV0ZXMsIGluY3JlbWVudCkge1xyXG4gICAgICAgIHRoaXMuZG9TZW5kKHtcclxuICAgICAgICAgICAgdHlwZTogXCJjcmVhdGVfc2Vla1wiLFxyXG4gICAgICAgICAgICB1c2VyOiB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0sXHJcbiAgICAgICAgICAgIHZhcmlhbnQ6IHZhcmlhbnQsXHJcbiAgICAgICAgICAgIGZlbjogZmVuLFxyXG4gICAgICAgICAgICBtaW51dGVzOiBtaW51dGVzLFxyXG4gICAgICAgICAgICBpbmNyZW1lbnQ6IGluY3JlbWVudCxcclxuICAgICAgICAgICAgY29sb3I6IGNvbG9yIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNyZWF0ZVNlZWsgKGNvbG9yKSB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nbm9uZSc7XHJcbiAgICAgICAgbGV0IGU7XHJcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YXJpYW50JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XHJcbiAgICAgICAgY29uc3QgdmFyaWFudCA9IGUub3B0aW9uc1tlLnNlbGVjdGVkSW5kZXhdLnZhbHVlO1xyXG5cclxuICAgICAgICBlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZlbicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgY29uc3QgZmVuID0gZS52YWx1ZTtcclxuXHJcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtaW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGNvbnN0IG1pbnV0ZXMgPSBwYXJzZUludChlLnZhbHVlKTtcclxuXHJcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbmMnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGNvbnN0IGluY3JlbWVudCA9IHBhcnNlSW50KGUudmFsdWUpO1xyXG5cclxuICAgICAgICB0aGlzLmNyZWF0ZVNlZWtNc2codmFyaWFudCwgY29sb3IsIGZlbiwgbWludXRlcywgaW5jcmVtZW50KVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlclNlZWtCdXR0b25zICgpIHtcclxuICAgICAgICAvLyBUT0RPOiBzYXZlL3Jlc3RvcmUgc2VsZWN0ZWQgdmFsdWVzXHJcbiAgICAgICAgY29uc3Qgc2V0TWludXRlcyA9IChtaW51dGVzKSA9PiB7XHJcbiAgICAgICAgICAgIHZhciBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWludXRlc1wiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSBtaW51dGVzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc2V0SW5jcmVtZW50ID0gKGluY3JlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICB2YXIgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImluY3JlbWVudFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSBpbmNyZW1lbnQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgIGgoJ2RpdiNpZDAxJywgeyBjbGFzczoge1wibW9kYWxcIjogdHJ1ZX0gfSwgW1xyXG4gICAgICAgICAgaCgnZm9ybS5tb2RhbC1jb250ZW50JywgW1xyXG4gICAgICAgICAgICBoKCdkaXYjY2xvc2Vjb250YWluZXInLCBbXHJcbiAgICAgICAgICAgICAgaCgnc3Bhbi5jbG9zZScsIHsgb246IHsgY2xpY2s6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpZDAxJykhLnN0eWxlLmRpc3BsYXk9J25vbmUnIH0sIGF0dHJzOiB7J2RhdGEtaWNvbic6ICdqJ30sIHByb3BzOiB7dGl0bGU6IFwiQ2FuY2VsXCJ9IH0pLFxyXG4gICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgaCgnZGl2LmNvbnRhaW5lcicsIFtcclxuICAgICAgICAgICAgICAgIGgoJ2gyJywgXCJDcmVhdGUgYSBnYW1lXCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IHByb3BzOiB7Zm9yOiBcInZhcmlhbnRcIn0gfSwgXCJWYXJpYW50XCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnc2VsZWN0I3ZhcmlhbnQnLCB7IHByb3BzOiB7bmFtZTogXCJ2YXJpYW50XCJ9IH0sIHZhcmlhbnRzLm1hcCgodmFyaWFudCkgPT4gaCgnb3B0aW9uJywgeyBwcm9wczoge3ZhbHVlOiB2YXJpYW50fSB9LCB2YXJpYW50KSkpLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IHByb3BzOiB7Zm9yOiBcImZlblwifSB9LCBcIlN0YXJ0IHBvc2l0aW9uXCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnaW5wdXQjZmVuJywgeyBwcm9wczoge25hbWU6ICdmZW4nLCBwbGFjZWhvbGRlcjogJ1Bhc3RlIHRoZSBGRU4gdGV4dCBoZXJlJ30gfSksXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgcHJvcHM6IHtmb3I6IFwidGNcIn0gfSwgXCJUaW1lIENvbnRyb2xcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdzZWxlY3QjdGltZWNvbnRyb2wnLCB7IHByb3BzOiB7bmFtZTogXCJ0aW1lY29udHJvbFwifSB9LCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaCgnb3B0aW9uJywgeyBwcm9wczoge3ZhbHVlOiBcIjFcIiwgc2VsZWN0ZWQ6IHRydWV9IH0sIFwiUmVhbCB0aW1lXCIpLFxyXG4gICAgICAgICAgICAgICAgICAgIGgoJ29wdGlvbicsIHsgcHJvcHM6IHt2YWx1ZTogXCIyXCJ9IH0sIFwiVW5saW1pdGVkXCIpLFxyXG4gICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICBoKCdsYWJlbCcsIHsgcHJvcHM6IHtmb3I6IFwibWluXCJ9IH0sIFwiTWludXRlcyBwZXIgc2lkZTpcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdzcGFuI21pbnV0ZXMnKSxcclxuICAgICAgICAgICAgICAgIGgoJ2lucHV0I21pbicsIHtcclxuICAgICAgICAgICAgICAgICAgICBhdHRyczoge25hbWU6IFwibWluXCIsIHR5cGU6IFwicmFuZ2VcIiwgbWluOiAwLCBtYXg6IDE4MCwgdmFsdWU6IDN9LFxyXG4gICAgICAgICAgICAgICAgICAgIG9uOiB7IGlucHV0KGUpIHsgc2V0TWludXRlcygoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpOyB9IH1cclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgaCgnbGFiZWwnLCB7IHByb3BzOiB7Zm9yOiBcImluY1wifSB9LCBcIkluY3JlbWVudCBpbiBzZWNvbmRzOlwiKSxcclxuICAgICAgICAgICAgICAgIGgoJ3NwYW4jaW5jcmVtZW50JyksXHJcbiAgICAgICAgICAgICAgICBoKCdpbnB1dCNpbmMnLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXR0cnM6IHtuYW1lOiBcImluY1wiLCB0eXBlOiBcInJhbmdlXCIsIG1pbjogMCwgbWF4OiAxODAsIHZhbHVlOiAyfSxcclxuICAgICAgICAgICAgICAgICAgICBvbjogeyBpbnB1dChlKSB7IHNldEluY3JlbWVudCgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpOyB9IH1cclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgLy8gaWYgcGxheSB3aXRoIHRoZSBtYWNoaW5lXHJcbiAgICAgICAgICAgICAgICAvLyBBLkkuTGV2ZWwgKDEtOCBidXR0b25zKVxyXG4gICAgICAgICAgICAgICAgaCgnYnV0dG9uLmljb24uaWNvbi1jaXJjbGUnLCB7IHByb3BzOiB7dHlwZTogXCJidXR0b25cIiwgdGl0bGU6IFwiQmxhY2tcIn0sIG9uOiB7Y2xpY2s6ICgpID0+IHRoaXMuY3JlYXRlU2VlaygnYicpIH0gfSksXHJcbiAgICAgICAgICAgICAgICBoKCdidXR0b24uaWNvbi5pY29uLWFkanVzdCcsIHsgcHJvcHM6IHt0eXBlOiBcImJ1dHRvblwiLCB0aXRsZTogXCJSYW5kb21cIn0sIG9uOiB7Y2xpY2s6ICgpID0+IHRoaXMuY3JlYXRlU2VlaygncicpfSB9KSxcclxuICAgICAgICAgICAgICAgIGgoJ2J1dHRvbi5pY29uLmljb24tY2lyY2xlLW8nLCB7IHByb3BzOiB7dHlwZTogXCJidXR0b25cIiwgdGl0bGU6IFwiV2hpdGVcIn0sIG9uOiB7Y2xpY2s6ICgpID0+IHRoaXMuY3JlYXRlU2VlaygndycpfSB9KSxcclxuICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICBdKSxcclxuICAgICAgICBdKSxcclxuICAgICAgICBoKCdidXR0b24nLCB7IGNsYXNzOiB7J2J1dHRvbic6IHRydWV9LCBvbjogeyBjbGljazogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkMDEnKSEuc3R5bGUuZGlzcGxheT0nYmxvY2snIH0gfSwgXCJDcmVhdGUgYSBnYW1lXCIpLFxyXG4gICAgICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IHsnYnV0dG9uJzogdHJ1ZX0sIG9uOiB7IGNsaWNrOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWQwMScpIS5zdHlsZS5kaXNwbGF5PSdibG9jaycgfSB9LCBcIlBsYXkgd2l0aCB0aGUgbWFjaGluZVwiKSxcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIG9uQ2xpY2tTZWVrKHNlZWspIHtcclxuICAgICAgICBpZiAoc2Vla1tcInVzZXJcIl0gPT09IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSkge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiZGVsZXRlX3NlZWtcIiwgc2Vla0lEOiBzZWVrW1wic2Vla0lEXCJdLCBwbGF5ZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmRvU2VuZCh7IHR5cGU6IFwiYWNjZXB0X3NlZWtcIiwgc2Vla0lEOiBzZWVrW1wic2Vla0lEXCJdLCBwbGF5ZXI6IHRoaXMubW9kZWxbXCJ1c2VybmFtZVwiXSB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyU2Vla3Moc2Vla3MpIHtcclxuICAgICAgICAvLyBUT0RPOiBmaXggaGVhZGVyIGFuZCBkYXRhIHJvdyBjb2xvbW5zXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMzcyNzIzMzEvaHRtbC10YWJsZS13aXRoLWZpeGVkLWhlYWRlci1hbmQtZm9vdGVyLWFuZC1zY3JvbGxhYmxlLWJvZHktd2l0aG91dC1maXhlZC13aWR0aHNcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBoKCd0aGVhZCcsIFtoKCd0cicsIFtoKCd0aCcsICdQbGF5ZXInKSwgaCgndGgnLCAnQ29sb3InKSwgaCgndGgnLCAnUmF0aW5nJyksIGgoJ3RoJywgJ1RpbWUnKSwgaCgndGgnLCAnVmFyaWFudCcpLCBoKCd0aCcsICdNb2RlJyldKV0pO1xyXG4gICAgICAgIHZhciByb3dzID0gc2Vla3MubWFwKChzZWVrKSA9PiBoKFxyXG4gICAgICAgICAgICAndHInLFxyXG4gICAgICAgICAgICB7IG9uOiB7IGNsaWNrOiAoKSA9PiB0aGlzLm9uQ2xpY2tTZWVrKHNlZWspIH0gfSxcclxuICAgICAgICAgICAgW2goJ3RkJywgc2Vla1tcInVzZXJcIl0pLCBoKCd0ZCcsIHNlZWtbXCJjb2xvclwiXSksIGgoJ3RkJywgJzE1MDA/JyksIGgoJ3RkJywgc2Vla1tcInRjXCJdKSwgaCgndGQnLCBzZWVrW1widmFyaWFudFwiXSksIGgoJ3RkJywgc2Vla1tcInJhdGVkXCJdKSBdKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBbaGVhZGVyLCBoKCd0Ym9keScsIHJvd3MpXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnR2V0U2Vla3MgPSAobXNnKSA9PiB7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCIhISEhIGdvdCBnZXRfc2Vla3MgbXNnOlwiLCBtc2cpO1xyXG4gICAgICAgIGNvbnN0IG9sZFZOb2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlZWtzJyk7XHJcbiAgICAgICAgaWYgKG9sZFZOb2RlIGluc3RhbmNlb2YgRWxlbWVudCkge1xyXG4gICAgICAgICAgICBvbGRWTm9kZS5pbm5lckhUTUwgPSAnJztcclxuICAgICAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ3RhYmxlI3NlZWtzJywgdGhpcy5yZW5kZXJTZWVrcyhtc2cuc2Vla3MpKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nc2dDcmVhdGVTZWVrID0gKG1zZykgPT4ge1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiISEgZ290IGNyZWF0ZV9zZWVrIG1zZzpcIiwgbXNnKTtcclxuICAgICAgICBjb25zdCBvbGRWTm9kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZWVrcycpO1xyXG4gICAgICAgIGlmIChvbGRWTm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgb2xkVk5vZGUuaW5uZXJIVE1MID0gJyc7XHJcbiAgICAgICAgICAgIHBhdGNoKG9sZFZOb2RlIGFzIEhUTUxFbGVtZW50LCBoKCd0YWJsZSNzZWVrcycsIHRoaXMucmVuZGVyU2Vla3MobXNnLnNlZWtzKSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnQWNjZXB0U2VlayA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1wiZ2FtZUlkXCJdID0gbXNnW1wiZ2FtZUlkXCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJ2YXJpYW50XCJdID0gbXNnW1widmFyaWFudFwiXTtcclxuICAgICAgICB0aGlzLm1vZGVsW1wid3BsYXllclwiXSA9IG1zZ1tcIndwbGF5ZXJcIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcImJwbGF5ZXJcIl0gPSBtc2dbXCJicGxheWVyXCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJmZW5cIl0gPSBtc2dbXCJmZW5cIl07XHJcbiAgICAgICAgdGhpcy5tb2RlbFtcImJhc2VcIl0gPSBtc2dbXCJiYXNlXCJdO1xyXG4gICAgICAgIHRoaXMubW9kZWxbXCJpbmNcIl0gPSBtc2dbXCJpbmNcIl07XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJMb2JieUNvbnRyb2xsZXIub25Nc2dBY2NlcHRTZWVrKClcIiwgdGhpcy5tb2RlbFtcImdhbWVJZFwiXSlcclxuICAgICAgICB0aGlzLmV2dEhhbmRsZXIoeyB0eXBlOiBBQ0NFUFQgfSk7XHJcbn1cclxuXHJcbiAgICBwcml2YXRlIG9uTXNnVXNlckNvbm5lY3RlZCA9IChtc2cpID0+IHtcclxuICAgICAgICB0aGlzLm1vZGVsW1widXNlcm5hbWVcIl0gPSBtc2dbXCJ1c2VybmFtZVwiXTtcclxuICAgICAgICByZW5kZXJVc2VybmFtZSh0aGlzLm1vZGVsW1wiaG9tZVwiXSwgdGhpcy5tb2RlbFtcInVzZXJuYW1lXCJdKTtcclxuICAgIH1cclxuXHJcbiAgICBvbk1lc3NhZ2UgKGV2dCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiPCsrKyBsb2JieSBvbk1lc3NhZ2UoKTpcIiwgZXZ0LmRhdGEpO1xyXG4gICAgICAgIHZhciBtc2cgPSBKU09OLnBhcnNlKGV2dC5kYXRhKTtcclxuICAgICAgICBzd2l0Y2ggKG1zZy50eXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJnZXRfc2Vla3NcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dHZXRTZWVrcyhtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJjcmVhdGVfc2Vla1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbk1zZ0NyZWF0ZVNlZWsobXNnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiYWNjZXB0X3NlZWtcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Nc2dBY2NlcHRTZWVrKG1zZyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImxvYmJ5X3VzZXJfY29ubmVjdGVkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uTXNnVXNlckNvbm5lY3RlZChtc2cpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBydW5TZWVrcyh2bm9kZTogVk5vZGUsIG1vZGVsLCBoYW5kbGVyKSB7XHJcbiAgICBjb25zdCBlbCA9IHZub2RlLmVsbSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IGN0cmwgPSBuZXcgTG9iYnlDb250cm9sbGVyKGVsLCBtb2RlbCwgaGFuZGxlcik7XHJcbiAgICBjb25zb2xlLmxvZyhcImxvYmJ5VmlldygpIC0+IHJ1blNlZWtzKClcIiwgZWwsIG1vZGVsLCBjdHJsKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGxvYmJ5Vmlldyhtb2RlbCwgaGFuZGxlcik6IFZOb2RlIHtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwiLi4uLi4uLmxvYmJ5Vmlldyhtb2RlbCwgaGFuZGxlcilcIiwgbW9kZWwsIGhhbmRsZXIpO1xyXG4gICAgLy8gR2V0IHRoZSBtb2RhbFxyXG4gICAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWQwMScpITtcclxuXHJcbiAgICAvLyBXaGVuIHRoZSB1c2VyIGNsaWNrcyBhbnl3aGVyZSBvdXRzaWRlIG9mIHRoZSBtb2RhbCwgY2xvc2UgaXRcclxuICAgIHdpbmRvdy5vbmNsaWNrID0gZnVuY3Rpb24oZXZlbnQpIHtcclxuICAgICAgICBpZiAoZXZlbnQudGFyZ2V0ID09IG1vZGFsKSB7XHJcbiAgICAgICAgICAgIG1vZGFsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGgoJ2Rpdi5jb2x1bW5zJywgW1xyXG4gICAgICAgICAgICBoKCdtYWluLm1haW4nLCBbIGgoJ3RhYmxlI3NlZWtzJywge2hvb2s6IHsgaW5zZXJ0OiAodm5vZGUpID0+IHJ1blNlZWtzKHZub2RlLCBtb2RlbCwgaGFuZGxlcikgfSB9KSBdKSxcclxuICAgICAgICAgICAgaCgnYXNpZGUuc2lkZWJhci1maXJzdCcsIFwiXCIpLFxyXG4gICAgICAgICAgICBoKCdhc2lkZS5zaWRlYmFyLXNlY29uZCcsIFsgaCgndWwjc2Vla2J1dHRvbnMnKSBdKSxcclxuICAgICAgICBdKTtcclxufVxyXG4iLCJpbXBvcnQgeyBpbml0IH0gZnJvbSAnc25hYmJkb20nO1xyXG5pbXBvcnQga2xhc3MgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9jbGFzcyc7XHJcbmltcG9ydCBhdHRyaWJ1dGVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvYXR0cmlidXRlcyc7XHJcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xyXG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xyXG5cclxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XHJcblxyXG5pbXBvcnQgc2l0ZSBmcm9tICcuL3NpdGUnO1xyXG5cclxuZnVuY3Rpb24gbWFpbihpbml0U3RhdGUsIG9sZFZub2RlLCB7IHZpZXcsIHVwZGF0ZSB9KSB7XHJcbiAgICAvLyBjb25zb2xlLmxvZyhpbml0U3RhdGUsIG9sZFZub2RlKTtcclxuICAgIGNvbnN0IG5ld1Zub2RlID0gdmlldyhpbml0U3RhdGUsIGUgPT4ge1xyXG4gICAgICAgIGNvbnN0IG5ld1N0YXRlID0gdXBkYXRlKGluaXRTdGF0ZSwgZSk7XHJcbiAgICAgICAgbWFpbihuZXdTdGF0ZSwgbmV3Vm5vZGUsIHsgdmlldywgdXBkYXRlIH0pO1xyXG4gICAgfSk7XHJcbiAgICBwYXRjaChvbGRWbm9kZSwgbmV3Vm5vZGUpO1xyXG59XHJcblxyXG5tYWluKFxyXG4gICAgc2l0ZS5pbml0KCksXHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGxhY2Vob2xkZXInKSxcclxuICAgIHNpdGVcclxuKTtcclxuIiwiaW1wb3J0IHsgaCwgaW5pdCB9IGZyb20gXCJzbmFiYmRvbVwiO1xuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcblxuaW1wb3J0ICogYXMgY2cgZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcbmltcG9ydCB7IGRyYWdOZXdQaWVjZSB9IGZyb20gJ2NoZXNzZ3JvdW5keC9kcmFnJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnY2hlc3Nncm91bmR4L3R5cGVzJztcblxuaW1wb3J0IHsgcm9sZVRvU2FuLCBuZWVkUG9ja2V0cywgcG9ja2V0Um9sZXMsIGxjIH0gZnJvbSAnLi9jaGVzcyc7XG5pbXBvcnQgUm91bmRDb250cm9sbGVyIGZyb20gJy4vY3RybCc7XG5cbmNvbnN0IHBhdGNoID0gaW5pdChba2xhc3MsIGF0dHJpYnV0ZXMsIHByb3BlcnRpZXMsIGxpc3RlbmVyc10pO1xuXG50eXBlIFBvc2l0aW9uID0gJ3RvcCcgfCAnYm90dG9tJztcblxuY29uc3QgZXZlbnROYW1lcyA9IFsnbW91c2Vkb3duJywgJ3RvdWNoc3RhcnQnXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBvY2tldFZpZXcoY3RybDogUm91bmRDb250cm9sbGVyLCBjb2xvcjogQ29sb3IsIHBvc2l0aW9uOiBQb3NpdGlvbikge1xuICBjb25zdCBwb2NrZXQgPSBjdHJsLnBvY2tldHNbcG9zaXRpb24gPT09ICd0b3AnID8gMCA6IDFdO1xuICBjb25zdCBwaWVjZVJvbGVzID0gT2JqZWN0LmtleXMocG9ja2V0KTtcbiAgcmV0dXJuIGgoJ2Rpdi5wb2NrZXQuJyArIHBvc2l0aW9uLCB7XG4gICAgY2xhc3M6IHsgdXNhYmxlOiB0cnVlIH0sXG4gICAgaG9vazoge1xuICAgICAgaW5zZXJ0OiB2bm9kZSA9PiB7XG4gICAgICAgIGV2ZW50TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICAodm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIChlOiBjZy5Nb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IChjdHJsLmZsaXAgPyAndG9wJyA6ICdib3R0b20nKSkgZHJhZyhjdHJsLCBlKTtcbiAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH0sIHBpZWNlUm9sZXMubWFwKHJvbGUgPT4ge1xuICAgIGxldCBuYiA9IHBvY2tldFtyb2xlXSB8fCAwO1xuICAgIHJldHVybiBoKCdwaWVjZS4nICsgcm9sZSArICcuJyArIGNvbG9yLCB7XG4gICAgICBhdHRyczoge1xuICAgICAgICAnZGF0YS1yb2xlJzogcm9sZSxcbiAgICAgICAgJ2RhdGEtY29sb3InOiBjb2xvcixcbiAgICAgICAgJ2RhdGEtbmInOiBuYixcbiAgICAgIH1cbiAgICB9KTtcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZHJhZyhjdHJsOiBSb3VuZENvbnRyb2xsZXIsIGU6IGNnLk1vdWNoRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZS5idXR0b24gIT09IHVuZGVmaW5lZCAmJiBlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuOyAvLyBvbmx5IHRvdWNoIG9yIGxlZnQgY2xpY2tcbiAgICBjb25zdCBlbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50LFxuICAgIHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcm9sZScpIGFzIGNnLlJvbGUsXG4gICAgY29sb3IgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29sb3InKSBhcyBjZy5Db2xvcixcbiAgICBudW1iZXIgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtbmInKTtcbiAgICBpZiAoIXJvbGUgfHwgIWNvbG9yIHx8IG51bWJlciA9PT0gJzAnKSByZXR1cm47XG5cbiAgICAvLyBTaG93IHBvc3NpYmxlIGRyb3AgZGVzdHMgb24gbXkgdHVybiBvbmx5IG5vdCB0byBtZXNzIHVwIHByZWRyb3BcbiAgICBpZiAoY3RybC50dXJuQ29sb3IgPT09IGN0cmwubXljb2xvcikge1xuICAgICAgICBjb25zdCBkcm9wRGVzdHMgPSB7IFwiYTBcIjogY3RybC5kZXN0c1tyb2xlVG9TYW5bcm9sZV0gKyBcIkBcIl0gfTtcbiAgICAgICAgY3RybC5jaGVzc2dyb3VuZC5uZXdQaWVjZSh7XCJyb2xlXCI6IFwicGF3blwiLCBcImNvbG9yXCI6IGNvbG9yfSwgXCJhMFwiKVxuICAgICAgICBjdHJsLmNoZXNzZ3JvdW5kLnNldCh7XG4gICAgICAgICAgICB0dXJuQ29sb3I6IGNvbG9yLFxuICAgICAgICAgICAgbW92YWJsZToge1xuICAgICAgICAgICAgICAgIGRlc3RzOiBkcm9wRGVzdHMsXG4gICAgICAgICAgICAgICAgc2hvd0Rlc3RzOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGN0cmwuY2hlc3Nncm91bmQuc2VsZWN0U3F1YXJlKFwiYTBcIik7XG4gICAgICAgIGN0cmwuY2hlc3Nncm91bmQuc2V0KHsgbGFzdE1vdmU6IGN0cmwubGFzdG1vdmUgfSk7XG4gICAgfVxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGRyYWdOZXdQaWVjZShjdHJsLmNoZXNzZ3JvdW5kLnN0YXRlLCB7IGNvbG9yLCByb2xlIH0sIGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZHJvcElzVmFsaWQoZGVzdHM6IGNnLkRlc3RzLCByb2xlOiBjZy5Sb2xlLCBrZXk6IGNnLktleSk6IGJvb2xlYW4ge1xuICAgIC8vIGNvbnNvbGUubG9nKFwiZHJvcERlc3RzOlwiLCBkZXN0cywgcm9sZSwga2V5KVxuICAgIGNvbnN0IGRyb3BzID0gZGVzdHNbcm9sZVRvU2FuW3JvbGVdICsgXCJAXCJdO1xuICAgIC8vIGNvbnNvbGUubG9nKFwiZHJvcHM6XCIsIGRyb3BzKVxuXG4gICAgaWYgKGRyb3BzID09PSB1bmRlZmluZWQgfHwgZHJvcHMgPT09IG51bGwpIHJldHVybiBmYWxzZTtcblxuICAgIHJldHVybiBkcm9wcy5pbmRleE9mKGtleSkgIT09IC0xO1xufVxuXG4vLyBUT0RPOiBhZnJlIDEgbW92ZSBtYWRlIG9ubHkgMSBwb2NrZXQgdXBkYXRlIG5lZWRlZCBhdCBvbmNlLCBubyBuZWVkIHRvIHVwZGF0ZSBib3RoXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlUG9ja2V0cyhjdHJsOiBSb3VuZENvbnRyb2xsZXIsIHZwb2NrZXQwLCB2cG9ja2V0MSk6IHZvaWQge1xuICAgIC8vIHVwZGF0ZSBwb2NrZXRzIGZyb20gZmVuXG4gICAgaWYgKG5lZWRQb2NrZXRzKGN0cmwudmFyaWFudCkpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBjdHJsLmZ1bGxmZW4uc3BsaXQoXCIgXCIpO1xuICAgICAgICBjb25zdCBmZW5fcGxhY2VtZW50ID0gcGFydHNbMF07XG4gICAgICAgIHZhciBwb2NrZXRzID0gXCJcIjtcbiAgICAgICAgY29uc3QgYnJhY2tldFBvcyA9IGZlbl9wbGFjZW1lbnQuaW5kZXhPZihcIltcIik7XG4gICAgICAgIGlmIChicmFja2V0UG9zICE9PSAtMSkge1xuICAgICAgICAgICAgcG9ja2V0cyA9IGZlbl9wbGFjZW1lbnQuc2xpY2UoYnJhY2tldFBvcyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjID0gY3RybC5teWNvbG9yWzBdO1xuICAgICAgICBjb25zdCBvID0gY3RybC5vcHBjb2xvclswXTtcbiAgICAgICAgY29uc3Qgcm9sZXMgPSBwb2NrZXRSb2xlcyhjdHJsLnZhcmlhbnQpO1xuICAgICAgICB2YXIgcG8gPSB7fTtcbiAgICAgICAgdmFyIHBjID0ge307XG4gICAgICAgIHJvbGVzLmZvckVhY2gocm9sZSA9PiBwY1tyb2xlXSA9IGxjKHBvY2tldHMsIHJvbGVUb1Nhbltyb2xlXS50b0xvd2VyQ2FzZSgpLCBjPT09KGN0cmwudmFyaWFudD09PSdzaG9naScgPyAnYicgOiAndycpKSk7XG4gICAgICAgIHJvbGVzLmZvckVhY2gocm9sZSA9PiBwb1tyb2xlXSA9IGxjKHBvY2tldHMsIHJvbGVUb1Nhbltyb2xlXS50b0xvd2VyQ2FzZSgpLCBvPT09KGN0cmwudmFyaWFudD09PSdzaG9naScgPyAnYicgOiAndycpKSk7XG4gICAgICAgIGlmIChjdHJsLmZsaXApIHtcbiAgICAgICAgICAgIGN0cmwucG9ja2V0cyA9IFtwYywgcG9dO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3RybC5wb2NrZXRzID0gW3BvLCBwY107XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2cobyxjLHBvLHBjKVxuICAgICAgICBjdHJsLnZwb2NrZXQwID0gcGF0Y2godnBvY2tldDAsIHBvY2tldFZpZXcoY3RybCwgY3RybC5mbGlwID8gY3RybC5teWNvbG9yIDogY3RybC5vcHBjb2xvciwgXCJ0b3BcIikpO1xuICAgICAgICBjdHJsLnZwb2NrZXQxID0gcGF0Y2godnBvY2tldDEsIHBvY2tldFZpZXcoY3RybCwgY3RybC5mbGlwID8gY3RybC5vcHBjb2xvciA6IGN0cmwubXljb2xvciwgXCJib3R0b21cIikpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IGgsIGluaXQgfSBmcm9tIFwic25hYmJkb21cIjtcclxuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xyXG5pbXBvcnQgYXR0cmlidXRlcyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnO1xyXG5pbXBvcnQgbGlzdGVuZXJzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvZXZlbnRsaXN0ZW5lcnMnO1xyXG5pbXBvcnQgdG9WTm9kZSBmcm9tICdzbmFiYmRvbS90b3Zub2RlJztcclxuXHJcbmltcG9ydCB7IGtleTJwb3MgfSBmcm9tICdjaGVzc2dyb3VuZHgvdXRpbCc7XHJcblxyXG5pbXBvcnQgeyBpc1Byb21vdGlvbiwgbWFuZGF0b3J5UHJvbW90aW9uLCBwcm9tb3Rpb25Sb2xlcywgcm9sZVRvU2FuIH0gZnJvbSAnLi9jaGVzcyc7XHJcblxyXG5jb25zdCBwYXRjaCA9IGluaXQoW2tsYXNzLCBhdHRyaWJ1dGVzLCBsaXN0ZW5lcnNdKTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGN0cmwpIHtcclxuXHJcbiAgICBsZXQgcHJvbW90aW5nOiBhbnkgPSBmYWxzZTtcclxuICAgIGxldCByb2xlczogc3RyaW5nW10gPSBbXTtcclxuICAgIGZ1bmN0aW9uIHN0YXJ0KG9yaWcsIGRlc3QsIG1ldGEpIHtcclxuICAgICAgICBjb25zdCBncm91bmQgPSBjdHJsLmdldEdyb3VuZCgpO1xyXG4gICAgICAgIGlmIChpc1Byb21vdGlvbihjdHJsLnZhcmlhbnQsIGdyb3VuZC5zdGF0ZS5waWVjZXNbZGVzdF0sIG9yaWcsIGRlc3QsIG1ldGEpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gY3RybC5teWNvbG9yO1xyXG4gICAgICAgICAgICBjb25zdCBvcmllbnRhdGlvbiA9IGdyb3VuZC5zdGF0ZS5vcmllbnRhdGlvbjtcclxuICAgICAgICAgICAgY29uc3QgbW92aW5nUm9sZSA9IGdyb3VuZC5zdGF0ZS5waWVjZXNbZGVzdF0ucm9sZTtcclxuICAgICAgICAgICAgcm9sZXMgPSBwcm9tb3Rpb25Sb2xlcyhjdHJsLnZhcmlhbnQsIG1vdmluZ1JvbGUpO1xyXG5cclxuICAgICAgICAgICAgc3dpdGNoIChjdHJsLnZhcmlhbnQpIHtcclxuICAgICAgICAgICAgY2FzZSBcInNob2dpXCI6XHJcbiAgICAgICAgICAgICAgICBpZiAobWFuZGF0b3J5UHJvbW90aW9uKG1vdmluZ1JvbGUsIGRlc3QsIGNvbG9yKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHByb21vdGUoZ3JvdW5kLCBkZXN0LCAncCcgKyBncm91bmQuc3RhdGUucGllY2VzW2Rlc3RdLnJvbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0cmwuc2VuZE1vdmUob3JpZywgZGVzdCwgJysnKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZHJhd19wcm9tbyhkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pO1xyXG4gICAgICAgICAgICAgICAgICAgIHByb21vdGluZyA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3JpZzogb3JpZyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzdDogZGVzdCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IGN0cmwuc2VuZE1vdmUsXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbWFrcnVrJzpcclxuICAgICAgICAgICAgICAgIHByb21vdGUoZ3JvdW5kLCBkZXN0LCAnbWV0Jyk7XHJcbiAgICAgICAgICAgICAgICBjdHJsLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICdtJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnc2l0dHV5aW4nOlxyXG4gICAgICAgICAgICAgICAgcHJvbW90ZShncm91bmQsIGRlc3QsICdmZXJ6Jyk7XHJcbiAgICAgICAgICAgICAgICBjdHJsLnNlbmRNb3ZlKG9yaWcsIGRlc3QsICdmJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGRyYXdfcHJvbW8oZGVzdCwgY29sb3IsIG9yaWVudGF0aW9uKTtcclxuICAgICAgICAgICAgICAgIHByb21vdGluZyA9IHtcclxuICAgICAgICAgICAgICAgICAgICBvcmlnOiBvcmlnLFxyXG4gICAgICAgICAgICAgICAgICAgIGRlc3Q6IGRlc3QsXHJcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IGN0cmwuc2VuZE1vdmUsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBwcm9tb3RlKGcsIGtleSwgcm9sZSkge1xyXG4gICAgICAgIHZhciBwaWVjZXMgPSB7fTtcclxuICAgICAgICB2YXIgcGllY2UgPSBnLnN0YXRlLnBpZWNlc1trZXldO1xyXG4gICAgICAgIGlmIChnLnN0YXRlLnBpZWNlc1trZXldLnJvbGUgPT09IHJvbGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBpZWNlc1trZXldID0ge1xyXG4gICAgICAgICAgICAgICAgY29sb3I6IHBpZWNlLmNvbG9yLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgIHByb21vdGVkOiB0cnVlXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGcuc2V0UGllY2VzKHBpZWNlcyk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X3Byb21vKGRlc3QsIGNvbG9yLCBvcmllbnRhdGlvbikge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSB0b1ZOb2RlKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5leHRlbnNpb24nKSBhcyBOb2RlKTtcclxuICAgICAgICBwYXRjaChjb250YWluZXIsIHJlbmRlclByb21vdGlvbihkZXN0LCBjb2xvciwgb3JpZW50YXRpb24pKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkcmF3X25vX3Byb21vKCkge1xyXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uX2Nob2ljZScpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgIHBhdGNoKGNvbnRhaW5lciwgaCgnZGl2LmV4dGVuc2lvbicpKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBmaW5pc2gocm9sZSkge1xyXG4gICAgICAgIGlmIChwcm9tb3RpbmcpIHtcclxuICAgICAgICAgICAgZHJhd19ub19wcm9tbygpO1xyXG4gICAgICAgICAgICBjb25zdCBwcm9tb3RlZCA9IHByb21vdGUoY3RybC5nZXRHcm91bmQoKSwgcHJvbW90aW5nLmRlc3QsIHJvbGUpO1xyXG4gICAgICAgICAgICBjb25zdCBwcm9tbyA9IGN0cmwudmFyaWFudCA9PT0gXCJzaG9naVwiID8gcHJvbW90ZWQgPyBcIitcIiA6IFwiXCIgOiByb2xlVG9TYW5bcm9sZV0udG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgaWYgKHByb21vdGluZy5jYWxsYmFjaykgcHJvbW90aW5nLmNhbGxiYWNrKHByb21vdGluZy5vcmlnLCBwcm9tb3RpbmcuZGVzdCwgcHJvbW8pO1xyXG4gICAgICAgICAgICBwcm9tb3RpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNhbmNlbCgpIHtcclxuICAgICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBiaW5kKGV2ZW50TmFtZTogc3RyaW5nLCBmOiAoZTogRXZlbnQpID0+IHZvaWQsIHJlZHJhdykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGluc2VydCh2bm9kZSkge1xyXG4gICAgICAgICAgICAgICAgdm5vZGUuZWxtLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBmKGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWRyYXcpIHJlZHJhdygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXM7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVuZGVyUHJvbW90aW9uKGRlc3QsIGNvbG9yLCBvcmllbnRhdGlvbikge1xyXG4gICAgICAgIGNvbnN0IGRpbSA9IGN0cmwuZ2V0R3JvdW5kKCkuc3RhdGUuZGltZW5zaW9uc1xyXG4gICAgICAgIGNvbnN0IGZpcnN0UmFua0lzMCA9IGRpbS5oZWlnaHQgPT09IDEwO1xyXG4gICAgICAgIHZhciBsZWZ0ID0gKGRpbS53aWR0aCAtIGtleTJwb3MoZGVzdCwgZmlyc3RSYW5rSXMwKVswXSkgKiAoMTAwIC8gZGltLndpZHRoKTtcclxuICAgICAgICBpZiAob3JpZW50YXRpb24gPT09IFwid2hpdGVcIikgbGVmdCA9ICgxMDAgLyBkaW0ud2lkdGgpICogKGRpbS53aWR0aCAtIDEpIC0gbGVmdDtcclxuICAgICAgICB2YXIgdmVydGljYWwgPSBjb2xvciA9PT0gb3JpZW50YXRpb24gPyBcInRvcFwiIDogXCJib3R0b21cIjtcclxuICAgICAgICByZXR1cm4gaChcclxuICAgICAgICAgICAgXCJkaXYjZXh0ZW5zaW9uX2Nob2ljZS5cIiArIHZlcnRpY2FsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBob29rOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0OiB2bm9kZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gdm5vZGUuZWxtIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gY2FuY2VsKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgcm9sZXMubWFwKChzZXJ2ZXJSb2xlLCBpKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB2YXIgdG9wID0gKGNvbG9yID09PSBvcmllbnRhdGlvbiA/IGkgOiBkaW0uaGVpZ2h0IC0xIC0gaSkgKiAoMTAwIC8gZGltLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaChcclxuICAgICAgICAgICAgICAgICAgICBcInNxdWFyZVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXR0cnM6IHsgc3R5bGU6IFwidG9wOiBcIiArIHRvcCArIFwiJTtsZWZ0OiBcIiArIGxlZnQgKyBcIiVcIiB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBob29rOiBiaW5kKFwiY2xpY2tcIiwgZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluaXNoKHNlcnZlclJvbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBmYWxzZSlcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIFtoKFwicGllY2UuXCIgKyBzZXJ2ZXJSb2xlICsgXCIuXCIgKyBjb2xvcildXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBzdGFydCxcclxuICAgIH07XHJcbn1cclxuIiwiaW1wb3J0IHsgaCB9IGZyb20gXCJzbmFiYmRvbVwiO1xyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gJ3NuYWJiZG9tL3Zub2RlJztcclxuaW1wb3J0IFJvdW5kQ29udHJvbGxlciBmcm9tICcuL2N0cmwnO1xyXG5pbXBvcnQgeyBWQVJJQU5UUyB9IGZyb20gJy4vY2hlc3MnO1xyXG5cclxuZXhwb3J0IGNvbnN0IEJBQ0sgPSBTeW1ib2woJ0JhY2snKTtcclxuLy8gZXhwb3J0IGNvbnN0IFJFU0lHTiA9IFN5bWJvbCgnUmVzaWduJyk7XHJcblxyXG5mdW5jdGlvbiBydW5Hcm91bmQodm5vZGU6IFZOb2RlLCBtb2RlbCkge1xyXG4gICAgY29uc3QgZWwgPSB2bm9kZS5lbG0gYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICBjb25zdCBjdHJsID0gbmV3IFJvdW5kQ29udHJvbGxlcihlbCwgbW9kZWwpO1xyXG4gICAgY29uc3QgY2cgPSBjdHJsLmNoZXNzZ3JvdW5kO1xyXG4gICAgd2luZG93WydjZyddID0gY2c7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByb3VuZFZpZXcobW9kZWwsIGhhbmRsZXIpOiBWTm9kZSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIi4uLi4uLi5yb3VuZFZpZXcobW9kZWwsIGhhbmRsZXIpXCIsIG1vZGVsLCBoYW5kbGVyKTtcclxuICAgIHZhciBwbGF5ZXJUb3AsIHBsYXllckJvdHRvbTtcclxuICAgIGlmIChtb2RlbFtcInVzZXJuYW1lXCJdICE9PSBtb2RlbFtcIndwbGF5ZXJcIl0gJiYgbW9kZWxbXCJ1c2VybmFtZVwiXSAhPT0gbW9kZWxbXCJicGxheWVyXCJdKSB7XHJcbiAgICAgICAgLy8gc3BlY3RhdG9yIGdhbWUgdmlld1xyXG4gICAgICAgIHBsYXllclRvcCA9IG1vZGVsW1widmFyaWFudFwiXSA9PT0gJ3Nob2dpJyA/IG1vZGVsW1wid3BsYXllclwiXSA6IG1vZGVsW1wiYnBsYXllclwiXTtcclxuICAgICAgICBwbGF5ZXJCb3R0b20gPSBtb2RlbFtcInZhcmlhbnRcIl0gPT09ICdzaG9naScgPyBtb2RlbFtcImJwbGF5ZXJcIl0gOiBtb2RlbFtcIndwbGF5ZXJcIl07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHBsYXllclRvcCA9IG1vZGVsW1widXNlcm5hbWVcIl0gPT09IG1vZGVsW1wid3BsYXllclwiXSA/IG1vZGVsW1wiYnBsYXllclwiXSA6IG1vZGVsW1wid3BsYXllclwiXTtcclxuICAgICAgICBwbGF5ZXJCb3R0b20gPSBtb2RlbFtcInVzZXJuYW1lXCJdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGgoJ2Rpdi5jb2x1bW5zJywgW1xyXG4gICAgICAgICAgICBoKCdtYWluLm1haW4nLCBbXHJcbiAgICAgICAgICAgICAgICBoKGBzZWxlY3Rpb24uJHtWQVJJQU5UU1ttb2RlbFtcInZhcmlhbnRcIl1dLmJvYXJkfS4ke1ZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0ucGllY2VzfWAsIFtcclxuICAgICAgICAgICAgICAgICAgICBoKGBkaXYuY2ctYm9hcmQtd3JhcC4ke1ZBUklBTlRTW21vZGVsW1widmFyaWFudFwiXV0uY2d9YCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBob29rOiB7IGluc2VydDogKHZub2RlKSA9PiBydW5Hcm91bmQodm5vZGUsIG1vZGVsKX0sXHJcbiAgICAgICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgIGgoJ2FzaWRlLnNpZGViYXItZmlyc3QnLCBcIlwiKSxcclxuICAgICAgICAgICAgaCgnYXNpZGUuc2lkZWJhci1zZWNvbmQnLCBbXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjcG9ja2V0LXdyYXBwZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaChgZGl2LiR7VkFSSUFOVFNbbW9kZWxbXCJ2YXJpYW50XCJdXS5waWVjZXN9YCwgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdkaXYuY2ctYm9hcmQtd3JhcC5wb2NrZXQnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdkaXYjcG9ja2V0MCcpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I2Nsb2NrMCcpLFxyXG4gICAgICAgICAgICAgICAgaCgnaDEnLCBwbGF5ZXJUb3AgKyBcIiAoMTUwMD8pXCIpLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I3Jlc3VsdCcpLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I2FmdGVyLWdhbWUnKSxcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiNnYW1lLWNvbnRyb2xzJyksXHJcbiAgICAgICAgICAgICAgICBoKCdoMScsIHBsYXllckJvdHRvbSArIFwiICgxNTAwPylcIiksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjY2xvY2sxJyksXHJcbiAgICAgICAgICAgICAgICBoKCdkaXYjcG9ja2V0LXdyYXBwZXInLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgaChgZGl2LiR7VkFSSUFOVFNbbW9kZWxbXCJ2YXJpYW50XCJdXS5waWVjZXN9YCwgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoKCdkaXYuY2ctYm9hcmQtd3JhcC5wb2NrZXQnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoKCdkaXYjcG9ja2V0MScpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgaCgnZGl2I2ZsaXAnKSxcclxuICAgICAgICAgICAgICAgIGgoJ2RpdiN6b29tJyksXHJcbiAgICAgICAgICAgIF0pLFxyXG4gICAgICAgIF0pO1xyXG59XHJcbiIsImltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xyXG5pbXBvcnQgeyBWTm9kZSB9IGZyb20gJ3NuYWJiZG9tL3Zub2RlJztcclxuXHJcbmltcG9ydCB7IGxvYmJ5VmlldywgQUNDRVBUIH0gZnJvbSAnLi9sb2JieSc7XHJcbmltcG9ydCB7IHJvdW5kVmlldywgQkFDSyB9IGZyb20gJy4vcm91bmQnO1xyXG5cclxuLy8gbW9kZWwgOiB7aG9tZTogXCJcIiwgdXNlcm5hbWU6IFwiXCIsIHZhcmlhbnQ6IFwiXCIsIGdhbWVJZDogMCwgd3BsYXllcjogXCJcIiwgYnBsYXllcjogXCJcIiwgYmFzZTogXCJcIiwgaW5jOiBcIlwiLCBzZWVrczogW3NlZWtdLCB0djogXCJcIn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB2aWV3KG1vZGVsLCBoYW5kbGVyKTogVk5vZGUge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJzaXRlLnZpZXcoKSBtb2RlbD1cIiwgbW9kZWwpXHJcbiAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEzOTczMjkvaG93LXRvLXJlbW92ZS10aGUtaGFzaC1mcm9tLXdpbmRvdy1sb2NhdGlvbi13aXRoLWphdmFzY3JpcHQtd2l0aG91dC1wYWdlLXJlZnJlc2gvNTI5ODY4NCM1Mjk4Njg0XHJcbiAgICBjb25zb2xlLmxvZyhcInNpdGUudHMgZG9jdW1lbnQudGl0bGU9XCIsIGRvY3VtZW50LnRpdGxlKVxyXG4gICAgY29uc29sZS5sb2coXCJzaXRlLnRzIHdpbmRvdy5sb2NhdGlvbj1cIiwgd2luZG93LmxvY2F0aW9uKVxyXG4gICAgd2luZG93Lmhpc3RvcnkucHVzaFN0YXRlKHt9LCBkb2N1bWVudC50aXRsZSwgXCIvXCIpO1xyXG5cclxuICAgIHZhciBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdweWNoZXNzLXZhcmlhbnRzJyk7XHJcbiAgICBpZiAoZWwgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGVsLmhhc0F0dHJpYnV0ZShcImRhdGEtaG9tZVwiKSkge1xyXG4gICAgICAgIG1vZGVsW1wiaG9tZVwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtaG9tZVwiKTtcclxuICAgIH1cclxuICAgIGlmIChlbCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgZWwuaGFzQXR0cmlidXRlKFwiZGF0YS12YXJpYW50XCIpKSB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFudCA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdmFyaWFudFwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInNpdGUudmlldygpIGRhdGEtdmFyaWFudD1cIiwgdmFyaWFudCk7XHJcbiAgICAgICAgaWYgKHZhcmlhbnQpIHtcclxuICAgICAgICAgICAgbW9kZWxbXCJ1c2VybmFtZVwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdXNlcm5hbWVcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1widmFyaWFudFwiXSA9IHZhcmlhbnQ7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiZ2FtZUlkXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1nYW1laWRcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wid3BsYXllclwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtd3BsYXllclwiKTtcclxuICAgICAgICAgICAgbW9kZWxbXCJicGxheWVyXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1icGxheWVyXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImZlblwiXSA9IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtZmVuXCIpO1xyXG4gICAgICAgICAgICBtb2RlbFtcImJhc2VcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWJhc2VcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1wiaW5jXCJdID0gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1pbmNcIik7XHJcbiAgICAgICAgICAgIG1vZGVsW1widHZcIl0gPSBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXR2XCIpO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGgoJ2RpdiNwbGFjZWhvbGRlci5tYWluLXdyYXBwZXInLCBbXHJcbiAgICAgICAgaCgnc2VjdGlvbi5jb250ZW50JywgWyBtb2RlbC52YXJpYW50ID8gcm91bmRWaWV3KG1vZGVsLCBoYW5kbGVyKSA6IGxvYmJ5Vmlldyhtb2RlbCwgaGFuZGxlciksIF0pLFxyXG4gICAgXSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICByZXR1cm4ge2hvbWU6IFwiXCIsIHVzZXJuYW1lOiBcIlwiLCB2YXJpYW50OiBcIlwiLCBnYW1lSWQ6IDAsIHdwbGF5ZXI6IFwiXCIsIGJwbGF5ZXI6IFwiXCIsIGZlbjogXCJcIiwgYmFzZTogXCJcIiwgaW5jOiBcIlwiLCBzZWVrczogW10sIHR2OiBcIlwifTtcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlKG1vZGVsLCBhY3Rpb24pIHtcclxuICAgIHJldHVybiBhY3Rpb24udHlwZSA9PT0gQUNDRVBUID9cclxuICAgICAgICB7aG9tZTogbW9kZWxbXCJob21lXCJdLCB1c2VybmFtZTogbW9kZWxbXCJ1c2VybmFtZVwiXSwgdmFyaWFudDogbW9kZWxbXCJ2YXJpYW50XCJdLCBnYW1lSWQ6IG1vZGVsW1wiZ2FtZUlkXCJdLCB3cGxheWVyOiBtb2RlbFtcIndwbGF5ZXJcIl0sIGJwbGF5ZXI6IG1vZGVsW1wiYnBsYXllclwiXSwgZmVuOiBtb2RlbFtcImZlblwiXSwgYmFzZTogbW9kZWxbXCJiYXNlXCJdLCBpbmM6IG1vZGVsW1wiaW5jXCJdLCBzZWVrczogW10sIHR2OiBtb2RlbFtcInR2XCJdfVxyXG4gICAgICAgICAgICA6IGFjdGlvbi50eXBlID09PSBCQUNLID9cclxuICAgICAgICAgICAgICAgIHtob21lOiBtb2RlbFtcImhvbWVcIl0sIHVzZXJuYW1lOiBtb2RlbFtcInVzZXJuYW1lXCJdLCB2YXJpYW50OiBcIlwiLCBnYW1lSWQ6IDAsIHdwbGF5ZXI6IFwiXCIsIGJwbGF5ZXI6IFwiXCIsIGZlbjogXCJcIiwgYmFzZTogXCJcIiwgaW5jOiBcIlwiLCBzZWVrczogW10sIHR2OiBcIlwifVxyXG4gICAgICAgICAgICAgICAgOiBtb2RlbDtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgeyB2aWV3LCBpbml0LCB1cGRhdGUsIGFjdGlvbnM6IHsgQUNDRVBULCBCQUNLIH0gfVxyXG4iLCJjbGFzcyBzb3VuZHMge1xyXG4gICAgdHJhY2tzO1xyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy50cmFja3MgPSB7XHJcbiAgICAgICAgICAgIEdlbmVyaWNOb3RpZnk6IHsgbmFtZTogJ0dlbmVyaWNOb3RpZnknLCBxdHkgOiAxLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIE1vdmU6IHsgbmFtZTogJ01vdmUnLCBxdHkgOiA4LCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIENhcHR1cmU6IHsgbmFtZTogJ0NhcHR1cmUnLCBxdHkgOiA0LCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgICAgIENoZWNrOiB7IG5hbWU6ICdDaGVjaycsIHF0eSA6IDIsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICAgICAgRHJhdzogeyBuYW1lOiAnRHJhdycsIHF0eSA6IDEsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICAgICAgVmljdG9yeTogeyBuYW1lOiAnVmljdG9yeScsIHF0eSA6IDEsIHBvb2wgOiBbXSwgaW5kZXggOiAwfSxcclxuICAgICAgICAgICAgRGVmZWF0OiB7IG5hbWU6ICdEZWZlYXQnLCBxdHkgOiAxLCBwb29sIDogW10sIGluZGV4IDogMH0sXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLnRyYWNrcykuZm9yRWFjaChrZXkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgdHlwZSA9IHRoaXMudHJhY2tzW2tleV07XHJcbiAgICAgICAgICAgIHR5cGUucG9vbCA9IHRoaXMuYnVpbGRNYW55U291bmRzKHR5cGUubmFtZSwgdHlwZS5xdHkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYnVpbGRNYW55U291bmRzID0gKGZpbGUsIHF0eSkgPT4ge1xyXG4gICAgICAgIHZhciBzb3VuZEFycmF5OiBIVE1MQXVkaW9FbGVtZW50W10gPSBbXTtcclxuICAgICAgICB3aGlsZSAoc291bmRBcnJheS5sZW5ndGggPCBxdHkpIHtcclxuICAgICAgICAgICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImF1ZGlvXCIpO1xyXG4gICAgICAgICAgICBpZiAoZWwuY2FuUGxheVR5cGUoJ2F1ZGlvL21wZWcnKSkge1xyXG4gICAgICAgICAgICAgICAgZWwuc3JjID0gJy9zdGF0aWMvc291bmQvJyArIGZpbGUgKyAnLm1wMyc7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBlbC5zcmMgPSAnL3N0YXRpYy9zb3VuZC8nICsgZmlsZSArICcub2dnJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbC5zZXRBdHRyaWJ1dGUoXCJwcmVsb2FkXCIsIFwiYXV0b1wiKTtcclxuICAgICAgICAgICAgZWwuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gICAgICAgICAgICBzb3VuZEFycmF5LnB1c2goZWwpO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHNvdW5kQXJyYXk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRTb3VuZCA9ICh0eXBlKSA9PiB7XHJcbiAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMudHJhY2tzW3R5cGVdO1xyXG4gICAgICAgIHRhcmdldC5pbmRleCA9ICh0YXJnZXQuaW5kZXggKyAxKSAlIHRhcmdldC5wb29sLmxlbmd0aDtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcIlNPVU5EOlwiLCB0eXBlLCB0YXJnZXQuaW5kZXgpO1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQucG9vbFt0YXJnZXQuaW5kZXhdO1xyXG4gICAgfVxyXG5cclxuICAgIGdlbmVyaWNOb3RpZnkoKSB7IHRoaXMuZ2V0U291bmQoJ0dlbmVyaWNOb3RpZnknKS5wbGF5KCk7IH07XHJcbiAgICBtb3ZlKCkgeyB0aGlzLmdldFNvdW5kKCdNb3ZlJykucGxheSgpOyB9O1xyXG4gICAgY2FwdHVyZSgpIHsgdGhpcy5nZXRTb3VuZCgnQ2FwdHVyZScpLnBsYXkoKTsgfTtcclxuICAgIGNoZWNrKCkgeyB0aGlzLmdldFNvdW5kKCdDaGVjaycpLnBsYXkoKTsgfTtcclxuICAgIGRyYXcoKSB7IHRoaXMuZ2V0U291bmQoJ0RyYXcnKS5wbGF5KCk7IH07XHJcbiAgICB2aWN0b3J5KCkgeyB0aGlzLmdldFNvdW5kKCdWaWN0b3J5JykucGxheSgpOyB9O1xyXG4gICAgZGVmZWF0KCkgeyB0aGlzLmdldFNvdW5kKCdEZWZlYXQnKS5wbGF5KCk7IH07XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBzb3VuZCA9IG5ldyhzb3VuZHMpO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNoYW5nZUNTUyhjc3NGaWxlLCBjc3NMaW5rSW5kZXgpIHtcclxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwibGlua1wiKS5pdGVtKGNzc0xpbmtJbmRleCkuc2V0QXR0cmlidXRlKFwiaHJlZlwiLCBjc3NGaWxlKTtcclxufVxyXG4iLCJpbXBvcnQgeyBpbml0IH0gZnJvbSAnc25hYmJkb20nO1xuaW1wb3J0IGtsYXNzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvY2xhc3MnO1xuaW1wb3J0IGF0dHJpYnV0ZXMgZnJvbSAnc25hYmJkb20vbW9kdWxlcy9hdHRyaWJ1dGVzJztcbmltcG9ydCBwcm9wZXJ0aWVzIGZyb20gJ3NuYWJiZG9tL21vZHVsZXMvcHJvcHMnO1xuaW1wb3J0IGxpc3RlbmVycyBmcm9tICdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJztcblxuY29uc3QgcGF0Y2ggPSBpbml0KFtrbGFzcywgYXR0cmlidXRlcywgcHJvcGVydGllcywgbGlzdGVuZXJzXSk7XG5cbmltcG9ydCBoIGZyb20gJ3NuYWJiZG9tL2gnO1xuXG4vLyBUT0RPOiBjcmVhdGUgbG9nb3V0IGJ1dHRvbiB3aGVuIGxvZ2dlZCBpblxuLypcbmZ1bmN0aW9uIGxvZ2luKGhvbWUpIHtcbiAgICBjb25zb2xlLmxvZyhcIkxPR0lOIFdJVEggTElDSEVTU1wiKTtcbiAgICB3aW5kb3cubG9jYXRpb24uYXNzaWduKGhvbWUgKyAnL2xvZ2luJyk7XG59O1xuKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJVc2VybmFtZShob21lLCB1c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKFwicmVuZGVyVXNlcm5hbWUoKVwiLCB1c2VybmFtZSwgaG9tZSk7XG4gICAgdmFyIG9sZFZOb2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3VzZXJuYW1lJyk7XG4gICAgaWYgKG9sZFZOb2RlIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICBvbGRWTm9kZS5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ2RpdiN1c2VybmFtZScsIHVzZXJuYW1lKSk7XG4gICAgfTtcbi8qXG4gICAgLy8gaWYgdXNlcm5hbWUgaXMgbm90IGEgbG9nZ2VkIGluIG5hbWUgbG9naW4gZWxzZSBsb2dvdXQgYnV0dG9uXG4gICAgdmFyIG9sZFZOb2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ2luJyk7XG4gICAgaWYgKG9sZFZOb2RlIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICBvbGRWTm9kZS5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgcGF0Y2gob2xkVk5vZGUgYXMgSFRNTEVsZW1lbnQsIGgoJ2J1dHRvbicsIHsgb246IHsgY2xpY2s6ICgpID0+IGxvZ2luKGhvbWUpIH0sIHByb3BzOiB7dGl0bGU6ICdMb2dpbiB3aXRoIExpY2hlc3MnfSB9LCBbaCgnaScsIHtjbGFzczoge1wiaWNvblwiOiB0cnVlLCBcImljb24tc2lnbi1pblwiOiB0cnVlfSB9ICksIF0pKTtcbiAgICB9O1xuKi9cbn1cbiJdfQ==
