# ![Atomic](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Atomic.svg) Atomic

_Nuke your opponent's king to win!_

## Rules

* In addition to standard rules, all captures cause an explosion by which the captured piece, the piece used to capture, and all surrounding pieces except pawns that are within a one square radius are removed from the board.
* It is illegal to capture a piece that would blow up your king, nor can a king capture any piece as according to atomic rules, the captured piece blows up and is removed from the board.
* Traditional checkmate applies to atomic as well, **but any move that results in blowing up the opposite king will result in an immediate victory, overriding all checks and checkmates.**

This lichess study explains the rules of atomic chess in detail: [https://lichess.org/study/uf9GpQyI](https://lichess.org/study/uf9GpQyI)

## Clarification

In Atomic the kings can be connected by moving one into the adjacent squares of the other side’s king. **When the kings are connected, checks do not apply.** As it is illegal for a capture to blow up your own king, it is not possible to capture the other king directly. To win such an endgame, it is necessary to cause the kings to detach by zugzwang or explode a piece of the opposite color while the king is next to it.

## Strategy

[https://illion-atomic.netlify.app/](https://illion-atomic.netlify.app/) by Illion is recommended for everyone.
