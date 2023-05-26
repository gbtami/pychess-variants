import { h, VNode } from 'snabbdom'
import * as cg from 'chessgroundx/types';

import { _ } from './i18n';
import { AnalysisController } from './analysisCtrl';
import { PyChessModel } from "./types";
import { patch } from './document';
import { uci2LastMove, UCIMove, uci2cg } from './chess';
import { updateMovelist } from './movelist';
import { variants } from './variants';
import { RatedSettings, AutoNextSettings } from './puzzleSettings';


export class PuzzleController extends AnalysisController {
    username: string;
    _id: string;
    site: string;
    played: number;
    playerEl: VNode | HTMLElement;
    solution: UCIMove[];
    solutionSan: string[];
    moves: UCIMove[] = [];
    color: string;
    failed: boolean;
    completed: boolean;
    posted: boolean;
    isRated: boolean;
    autoNext: boolean;
    gaugeNeeded: boolean;
    wrating: string;
    brating: string;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        const data = JSON.parse(model.puzzle);
        this._id = data._id;
        this.site = data.site;
        this.played = data.played ?? "0";
        // We have to split the duck move list on every second comma!
        this.solution = (model.variant==='duck') ? data.moves.match(/[^,]+,[^,]+/g) : data.moves.split(',');
        this.username = model.username;
        this.moves = [];
        this.steps = [{"fen": this.fullfen, "turnColor": this.turnColor, "check": false, "move": undefined}];
        this.ply = 0;
        this.plyVari = 0;
        this.color = this.turnColor;
        this.failed = false;
        this.completed = false;
        this.posted = false;
        this.wrating = model.wrating;
        this.brating = model.brating;
        this.isRated = localStorage.puzzle_rated === undefined ? true : localStorage.puzzle_rated === "true";
        this.autoNext = localStorage.puzzle_autoNext === undefined ? false : localStorage.puzzle_autoNext === "true";
        this.localAnalysis = false;

        this.chessground.set({
            orientation: this.turnColor,
            turnColor: this.turnColor,
            movable: {
                free: false,
                color: this.turnColor,
                events: {
                    after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
                    afterNewPiece: (role, dest, meta) => this.onUserDrop(role, dest, meta),
                }
            },
            events: {
                move: this.onMove(),
                dropNewPiece: this.onDrop(),
                select: this.onSelect(),
            },
        });

        const rt = document.querySelector('.rated-toggle') as HTMLElement;
        if (this.anon) {
            patch(rt, h('div', [
                h('div', 'To solve the puzzles rated'),
                h('button.join',
                    { on: { click: () => window.location.assign('/login') } },
                    _('LOGIN')
                )
            ]));
        } else {
            const ratedSettings = new RatedSettings(this);
            patch(rt, ratedSettings.view());
            this.renderRating(this.isRated, this.color, this.wrating, this.brating);
        }

        const autoNextSettings = new AutoNextSettings(this);
        const ant = document.querySelector('.auto-next-toggle') as HTMLElement;
        patch(ant, autoNextSettings.view());

        this.playerEl = document.querySelector('.player') as HTMLElement;
        this.yourTurn();

        const gaugeEl = document.getElementById('gauge') as HTMLElement;
        // On mobile view (and while solving) we don't use gauge
        this.gaugeNeeded = window.getComputedStyle(gaugeEl).display === 'block';
        if (this.gaugeNeeded) gaugeEl.style.display = 'none';

        const engineEl = document.querySelector('.engine') as HTMLElement;
        engineEl.style.display = 'none';
        
        const viewHintEl = document.querySelector('.hint') as HTMLElement;
        patch(viewHintEl,
            h('a.button.hint.button-empty',
                { on: { click: () => this.viewHint() } },
                _('Hint')
            )
        );

        const viewSolutionEl = document.querySelector('.solution') as HTMLElement;
        patch(viewSolutionEl,
            h('a.button.solution.button-empty',
                { on: { click: () => this.viewSolution() } },
                _('View the solution')
            )
        );

        this.renderInfos();

        // When we have no puzzle for a given variant just show start FEN with _id: '0'
        if (this._id === '0') {
            this.puzzleComplete(false);
            return;
        }

        function showHintAndSolution() {
            const viewHintEl = document.querySelector('.view-hint') as HTMLElement;
            patch(viewHintEl, h('div.view-hint', { class: { show: true } }));
            const viewSolutionEl = document.querySelector('.view-solution') as HTMLElement;
            patch(viewSolutionEl, h('div.view-solution', { class: { show: true } }));
        }
        setTimeout(showHintAndSolution, 4000);
    }

    renderRating(isRated:boolean, color: string, wrating: string, brating: string, success: boolean | undefined=undefined, diff=undefined) {
        if (isRated) {
            var diffEl: VNode | string = '';
            if (diff) {
                if (success) {
                    diffEl = h('good.rp', [h('span', { attrs: { "data-icon": '⬈' } }, ' '), '+' + diff]);
                } else {
                    diffEl = h('bad.rp', [h('span', { attrs: { "data-icon": '⬊' } }, ' '), diff]);
                }
            }
            const ratingEl = document.querySelector('.rating') as HTMLElement;
            patch(ratingEl, h(`div.rating.${(diff)?'final':'rated'}`, [
                h('strong', [
                    (color==="white") ? wrating : brating,
                    diffEl
                ]),
            ]));
        } else {
            const ratingEl = document.querySelector('.rating') as HTMLElement;
            patch(ratingEl, h('div.rating.casual', 
                _('Your puzzle rating will not change. Note that puzzles are not a competition. Ratings help select the best puzzles for your current skill.')
                )
            );
        }
    }

    renderInfos() {
        const source = (!this.site || this.site.includes('fairy-stockfish')) ? 'https://fairy-stockfish.github.io' : this.site;
        const infosEl = document.querySelector('.infos') as HTMLElement;
        patch(infosEl, h('div.game-info', [
            h('section', [
                h('div.info0.icon.icon-puzzle', [
                    h('div.info2', [
                        h('div', [_('Puzzle '), h('a', { attrs: { href: `/puzzle/${this._id}` } }, `#${this._id}`) ]),
                        h('div', [_('Rating: '), h('span.hidden', _('hidden'))]),
                        h('div', [_('Played: '), this.played])
                    ])
                ]),
            ]),
            h('div.info0.icon', { attrs: { "data-icon": this.variant.icon() } }, [
                h('div.info2', [
                    _('Source: '),
                    h('a', { attrs: { href: source } }, source.slice(source.indexOf('://') + 3))
                ]),
            ])
        ]));
    }
            
    viewSolution() {
        this.solution.slice(this.ply).forEach((move: UCIMove) => this.makeMove(move));
        this.puzzleComplete(false);
    }

    viewHint() {
        this.failed = true;
        const pv_move = uci2cg(this.solution[this.ply]);
        const shapes0 = this.shapeFromMove(pv_move, this.turnColor);
        this.chessground.set({
            drawable: {autoShapes: shapes0},
        });
    }

    doSendMove(move: string) {
        if (this.completed) {
            super.doSendMove(move);
            return;
        }

        if (this.solution[this.ply] !== move) {
            if (this.moves.length + 1 === this.solution.length) {
                this.ffishBoard.push(move);
                const win_result = (this.turnColor === 'white' ? '1-0' : '0-1');
                // last move can be any winning one
                if (this.ffishBoard.result() === win_result){
                    this.ffishBoard.pop();
                    this.makeMove(move);
                    this.puzzleComplete(true);
                    return;
                } else {
                    this.ffishBoard.pop();
                };
            };

            this.goPly(this.ply);
            this.ffishBoard.setFen(this.fullfen);
            this.setDests();
            const san = this.ffishBoard.sanMove(move, this.notationAsObject);
            this.notTheMove(san);
            return;
        }

        this.makeMove(move);
        
        if (this.moves.length < this.solution.length) {
            this.makeMove(this.solution[this.ply]);
            this.bestMove();
        } else {
            this.puzzleComplete(true);
        }
    }

    makeMove(move: string) {
        const san = this.ffishBoard.sanMove(move, this.notationAsObject);
        this.moves.push(move as UCIMove);
        this.ffishBoard.push(move);

        this.chessground.set(this.cgConfig(move));
        this.setDests();

        const step = {
            'fen': this.fullfen,
            'move': move,
            'check': this.ffishBoard.isCheck(),
            'turnColor': this.turnColor,
            'san': san,
            };
        this.steps.push(step);
        this.ply += 1
        updateMovelist(this);
    }

    cgConfig = (move: string) => {
        this.fullfen = this.ffishBoard.fen(this.variant.ui.showPromoted, 0);
        this.turnColor = this.fullfen.split(" ")[1] === "w" ? "white" : "black" as cg.Color;
        return {
            fen: this.fullfen,
            turnColor: this.turnColor,
            movable: {
                color: this.turnColor,
            },
            check: this.ffishBoard.isCheck(),
            lastMove: uci2LastMove(move),
            drawable: {autoShapes: []},
        }
    }
    yourTurn() {
        const turnColor = this.fullfen.split(" ")[1];
        const first = _(this.variant.colors.first);
        const second = _(this.variant.colors.second);
        this.playerEl = patch(this.playerEl,
            h('div.player', [
                h(`piece.${this.variant.pieceFamily}.${turnColor}.no-square`),
                h('div.instruction', [
                    h('strong', _('Your turn')),
                    h('em', _('Find the best move for %1.', (turnColor === 'w') ? first : second)),
                ]),
            ])
        );
    }

    notTheMove(san: string) {
        // post only on first failed move
        if (!this.failed) {
            this.postSuccess(false);
        }
        this.failed = true;
        this.playerEl = patch(this.playerEl,
            h('div.player', [
                h('div.icon', '✗'),
                h('div.instruction', [
                    h('san', [san, h('span.fail', '?')]),
                    h('strong', _("That's not the move!")),
                    h('em', _('Try something else.')),
                ]),
            ])
        );
        const feedbackEl = document.querySelector('.feedback') as HTMLInputElement;
        feedbackEl.classList.toggle('good', false);
        feedbackEl.classList.toggle('fail', true);
    }

    bestMove() {
        this.playerEl = patch(this.playerEl,
            h('div.player', [
                h('div.icon', '✓'),
                h('div.instruction', [
                    h('strong', _("Best move!")),
                    h('em', _('Keep going...')),
                ]),
            ])
        );
        const feedbackEl = document.querySelector('.feedback') as HTMLInputElement;
        feedbackEl.classList.toggle('fail', false);
        feedbackEl.classList.toggle('good', true);
    }

    puzzleComplete(success: boolean) {
        var text: string = '';
        if (!this.failed && success) {
            // completed without any failed move
            text = _('Success!');
            this.postSuccess(true);
        } else if (!success) {
            if (this._id !== '0') {
                // failed by viewing the solution
                text = _('Puzzle complete!');
                this.postSuccess(false);
            } else {
                text = _('We have no more puzzle for this variant.');
            }
        }
        this.completed = true;
        const feedbackEl = document.querySelector('.feedback') as HTMLInputElement;
        patch(feedbackEl, 
            h('div.feedback.after', [
                h('div.complete', text),
                h('div.more', [
                    h('a',
                        { on: { click: () => this.continueTraining() } },
                        _('Continue training')
                    ),
                ]),
            ])
        )
        if (this.gaugeNeeded) {
            const gaugeEl = document.getElementById('gauge') as HTMLElement;
            gaugeEl.style.display = 'block';
        }
        const engineEl = document.querySelector('.engine') as HTMLElement;
        engineEl.style.display = 'flex';

        const settingsEl = document.getElementById('bars') as HTMLElement;
        settingsEl.style.display = 'block';

        if (this.autoNext && success) {
            this.continueTraining();
        } else {
            this.localAnalysis = localStorage.localAnalysis === undefined ? false : localStorage.localAnalysis === "true";
        }
    }

    continueTraining() {
        let loc = location.href;
        if (!loc.endsWith('/puzzle')) {
            const parts = loc.split('/');
            const tail = parts[parts.length - 1];
            // individual puzzle pages (id at the URL end) and daily have to continue on /puzzle page
            if (!variants.includes(tail)) {
                loc = '/puzzle/' + this.variant.name;
            }
        }
        window.location.assign(loc);
    }

    postSuccess(success: boolean) {
        if (this.posted) return;
        this.posted = true;

        const XHR = new XMLHttpRequest();
        const FD  = new FormData();
        FD.append('win', `${success}`);
        FD.append('variant', this.variant.name);
        FD.append('color', this.color);
        FD.append('rated', `${this.isRated}`);

        const isRated = this.isRated;
        const color = this.color;
        const wrating = this.wrating;
        const brating = this.brating;
        const renderRating = this.renderRating;

        XHR.onreadystatechange = function() {
            if (this.readyState === 4 && this.status === 200) {
                const response = JSON.parse(this.responseText);
                // console.log("RESPONSE:", response);
                if (response['error'] !== undefined) {
                    console.log(response['error']);
                } else {
                    patch(document.getElementById('puzzle-rated') as HTMLElement, h('input#puzzle-rated', {attrs: {disabled: true}}));
                    if (isRated) {
                        const hiddenEl = document.querySelector('.hidden') as HTMLElement;
                        patch(hiddenEl, h('span.hidden', (color==="white") ? brating : wrating));

                        const diff = response[(color==="white" ? 0 : 1)]
                        renderRating(isRated, color, wrating, brating, success, diff);
                    }
                }
            }
        }
        XHR.open("POST", `/puzzle/complete/${this._id}`, true);
        XHR.send(FD);
        // console.log("XHR.send()", FD);
    }
}
