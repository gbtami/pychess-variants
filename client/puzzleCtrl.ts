import { h, VNode } from 'snabbdom'
import * as cg from 'chessgroundx/types';

import { _ } from './i18n';
import { AnalysisController } from './analysisCtrl';
import { PyChessModel } from "./types";
import { patch } from './document';
import { uci2LastMove, UCIMove, cg2uci } from './chess';
import { updateMovelist } from './movelist';

export class PuzzleController extends AnalysisController {
    username: string;
    _id: string;
    playerEl: VNode | HTMLElement;
    solution: UCIMove[];
    solutionSan: string[];
    moves: UCIMove[] = [];
    failed: boolean;
    completed: boolean;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);

        const data = JSON.parse(model.puzzle);
        this.solution = data.moves.split(',');
        this.username = model.username;
        this.moves = [];
        this.steps = [{"fen": this.fullfen, "turnColor": this.turnColor, "check": false, "move": undefined}];
        this.ply = 0;
        this.plyVari = 0;
        this.failed = false;
        this.completed = false;

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

        this.playerEl = document.querySelector('.player') as HTMLElement;
        this.yourTurn();

        const gaugeEl = document.getElementById('gauge') as HTMLElement;
        gaugeEl.style.display = 'none';

        const engineEl = document.querySelector('.engine') as HTMLElement;
        engineEl.style.display = 'none';
        
        const viewSolutionEl = document.querySelector('.solution') as HTMLElement;
        patch(viewSolutionEl,
            h('a.button.solution.button-empty',
                { on: { click: () => this.viewSolution() } },
                _('View the solution')
            )
        );

        function showSolution() {
            const viewSolutionEl = document.querySelector('.view-solution') as HTMLElement;
            patch(viewSolutionEl, h('div.view-solution', { class: { show: true } }));
        }
        setTimeout(showSolution, 4000);
    }

    viewSolution() {
        this.solution.slice(this.ply).forEach((move: UCIMove) => this.makeMove(move));
        this.puzzleComplete();
    }

    doSendMove(orig: cg.Orig, dest: cg.Key, promo: string) {
        if (this.completed) {
            super.doSendMove(orig, dest, promo);
            return;
        }

        const move = cg2uci(orig + dest + promo) as UCIMove;
        if (this.solution[this.ply] !== move) {
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
            this.puzzleComplete();
        }
    }

    makeMove(move: UCIMove) {
        const san = this.ffishBoard.sanMove(move, this.notationAsObject);
        this.moves.push(move);
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

    cgConfig = (move: UCIMove) => {
        this.fullfen = this.ffishBoard.fen(this.variant.showPromoted, 0);
        this.turnColor = this.fullfen.split(" ")[1] === "w" ? "white" : "black" as cg.Color;
        return {
            fen: this.fullfen,
            turnColor: this.turnColor,
            movable: {
                color: this.turnColor,
            },
            check: this.ffishBoard.isCheck(),
            lastMove: uci2LastMove(move)
        }
    }
    yourTurn() {
        const turnColor = this.fullfen.split(" ")[1];
        const tc = (turnColor === 'w') ? this.variant.firstColor : this.variant.secondColor;
        const first = _(this.variant.firstColor);
        const second = _(this.variant.secondColor);
        this.playerEl = patch(this.playerEl,
            h('div.player', [
                h(`piece.${this.variant.piece}.${turnColor}.no-square`, {
                    class: {
                        "turn-white": tc === "White",
                        "turn-black": tc === "Black",
                        "turn-red":   tc === "Red",
                        "turn-blue":  tc === "Blue",
                        "turn-gold":  tc === "Gold",
                        "turn-pink":  tc === "Pink",
                        "turn-green": tc === "Green",
                    }
                }),
                h('div.instruction', [
                    h('strong', _('Your turn')),
                    h('em', _('Find the best move for %1.', (turnColor === 'w') ? first : second)),
                ]),
            ])
        );
    }

    notTheMove(san: string) {
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

    puzzleComplete() {
        this.completed = true;
        const feedbackEl = document.querySelector('.feedback') as HTMLInputElement;
        patch(feedbackEl, 
            h('div.feedback.after', [
                h('div.complete', _('Puzzle complete!')),
                h('div.more', [
                    h('a',
                        { on: { click: () => this.continueTraining() } },
                        _('Continue training')
                    ),
                ]),
            ])
        )
        // TODO: this breaks mobile view!
        //const gaugeEl = document.getElementById('gauge') as HTMLElement;
        //gaugeEl.style.display = 'block';
        const engineEl = document.querySelector('.engine') as HTMLElement;
        engineEl.style.display = 'flex';
    }

    continueTraining() {
        window.location.assign(location.href);
    }
}
