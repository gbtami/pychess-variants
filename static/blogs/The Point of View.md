<h1 align="center">The Point of View</h1>
<div class="meta-headline">
    <div class="meta">
        <span class="text">2026.07.23</span>
        <span class="text"><a href="/@/gbtami">@gbtami</a></span>
        <span class="text">Software development · Shogi</span>
    </div>
    <div class="headline">How a Yari Shogi bug taught our pieces to turn around</div>
</div>
</br>

There is a small button beside the board that most players never think about. Press it, and the table turns around. The pieces exchange places on the screen, the coordinates reverse, and the player who was at the top is now sitting at the bottom.

In an ordinary chess game this is almost boring. That is a compliment: good interface work often disappears completely. But in Shogi, the same innocent button carries a little more responsibility. It must turn not only the board, but also the meaning of every piece on it.

This is the story of why that distinction matters, how PyChess originally represented it with duplicated artwork, how a custom Yari Shogi set found a hole in the system, and how one tiny CSS rotation finally closed it.

## When rotation was only a change of viewpoint

On a physical chessboard, the two armies are deliberately easy to tell apart. One is light and one is dark. A white rook remains a white rook whether you look at it from White's chair, Black's chair, or over somebody's shoulder.

The same is true in a browser. Turning a chessboard is mostly a coordinate operation. The square that had been drawn in the upper-left corner moves to the lower-right; pieces receive new screen coordinates; ranks and files are relabelled. The white and black images themselves do not acquire a new identity.

![Two ordinary chess boards shown from White's and Black's viewpoints](/static/images/ThePointOfView/01-chess-perspective.png "For chess, board rotation changes the square mapping")

Our board library, [chessgroundx](https://github.com/gbtami/chessgroundx), handles this kind of visual state. Each piece is a small DOM element, and chessgroundx gives it a translation so it appears on the correct square. Flip the board and those translations change. The artwork can remain exactly as it was.

For most chess variants this model is enough. Colours identify the armies; the camera moves; the actors keep their costumes.

## In Shogi, shape is ownership

Shogi pieces tell a different story. Except for the two king names, opposing pieces are not separated by colour or by a permanent player marking. Both sides use the same wooden, wedge-shaped pieces. A captured piece can even return to the board under its captor's control.

Ownership is communicated by direction: the pointed end faces the opponent. A piece pointing away from you is yours; a piece pointing toward you belongs to the other side. This is not an ornamental flourish. It is part of how the position is read.

![A Shogi board and close-up explanation of the two piece directions](/static/images/ThePointOfView/02-shogi-direction.png "Shogi piece orientation communicates ownership")

That means a digital Shogi board has two coordinate systems to maintain at once:

1. **Game coordinates** say which square contains the piece.
2. **Viewer-relative direction** says which way its pointed silhouette must face.

When the board turns, both must remain correct. Moving every piece to the opposite screen square is only half the job.

## The dependable, duplicated solution

PyChess supported this for years with a very direct arrangement: store two versions of every Shogi image.

The piece directories contained files such as `0FU.svg` and `1FU.svg`. They showed the same pawn facing opposite ways. Larger Shogi variants multiplied the pattern across every role and promoted role.

Chessgroundx already gave pieces two useful, viewer-relative classes: `ally` and `enemy`. Unlike the underlying `white` and `black` game colours, these classes change meaning when the board is turned. Our piece-set CSS could therefore choose the appropriate file:

```css
piece.p-piece.ally {
    background-image: url(0FU.svg);
}

piece.p-piece.enemy {
    background-image: url(1FU.svg);
}
```

![Two directional SVG assets feeding ally and enemy CSS selectors](/static/images/ThePointOfView/03-directional-assets.png "The original duplicated-image solution")

This was simple, explicit, and reliable. It also meant carrying two almost identical SVGs for every piece. That was acceptable for a curated site set: we prepared both orientations and wrote the `ally` and `enemy` selectors ourselves.

Then custom variants arrived.

## The Yari Shogi piece set that found the gap

User-defined variants can upload a custom SVG piece set. The uploader asks for the minimum complete set needed by the variant: a white and black image for each role, plus promoted roles where necessary. It does not ask an author to understand chessgroundx internals or to supply additional viewer-relative copies.

That is exactly how it should be. A piece artist should prepare pieces, not reverse-engineer the board renderer.

The custom Yari Shogi set was complete. It contained the required white and black SVGs, and in the initial orientation everything looked right. Then the board was turned.

The generated custom CSS knew about `white` and `black`, but it had not created the extra `ally` and `enemy` behaviour used by the built-in Shogi sets. Chessgroundx correctly moved every piece to its new screen square and correctly changed its relationship classes. The background image, however, remained tied only to the game colour. The army had changed ends of the table without turning its pieces around.

![A reconstructed Yari Shogi board before the flip, with the old bug, and after the fix](/static/images/ThePointOfView/04-yarishogi-bug-and-fix.png "Reconstruction of the Yari Shogi orientation bug and its fix")

Yari Shogi demonstrated the bug cleanly, but it was not really a Yari-only problem. Any Shogi-based user-defined variant with a custom set could encounter it. The same design question also applied to suitable built-in sets: if the second image was only a rotated copy, did we still need to store it?

## A useful detour through Lishogi

We first revisited a memory that Lishogi might rotate its pieces dynamically. The local Lishogi source gave us a small plot twist: it also keeps directional `0` and `1` assets and selects between them. The remembered implementation was not quite the implementation we found.

But the question was still the right one. Modern browsers are perfectly capable of rotating an image layer. The challenge was deciding *which* layer to rotate.

## Do not rotate the piece

The tempting fix is one line:

```css
piece.enemy {
    transform: rotate(180deg);
}
```

Unfortunately, the `<piece>` element is not merely artwork. Chessgroundx uses its inline `transform` to translate it to a board square. Rotating that same element also rotates or replaces the coordinate transform. In a real Chromium test, the piece did not just turn—it moved away from its square.

The safe answer was to separate *where the piece is* from *how the piece is painted*.

The real piece element remains under chessgroundx's control. Its SVG background is drawn on a full-size pseudo-element instead:

```css
piece::before {
    content: "";
    display: block;
    width: 100%;
    height: 100%;
    background-position: center;
    background-size: contain;
    background-repeat: no-repeat;
}
```

Now we can rotate `piece::before` while leaving the parent element—and therefore its board translation—untouched.

Custom uploads already contain white and black source images pointing in their normal, opposite directions. After the viewpoint changes, precisely two combinations need to turn:

```css
piece.white.enemy::before,
piece.black.ally::before {
    transform: rotate(180deg);
}
```

The selectors look slightly unusual until we follow the board around. In White's view, the white image is an ally and the black image is an enemy, so both source orientations are already correct. In Black's view, white becomes the enemy and black becomes the ally. Those are the two images that must rotate.

No SVG is generated or modified at request time. The server still sanitizes and stores exactly the files that were uploaded. It only generates CSS which paints and, when necessary, rotates them. Ordinary non-Shogi custom sets keep their previous rendering path.

The decision is based on the variant's Shogi ancestry or an explicit directional piece-family override. Promotion style alone is deliberately not enough: red promoted glyphs do not necessarily imply that a piece's silhouette carries ownership.

## The tiny trick spreads

Once the upload path was fixed, we audited the built-in `cz` and `czalt` families by Eventlesstew. Their opposite-facing SVGs were effectively 180-degree counterparts, making them ideal candidates for the same technique.

Shogi CZ, Cannon Shogi CZ, Cannon Shogi CZ Alt, and Tori Shogi CZ now keep a single canonical orientation. Their artwork is painted on `::before`, and the `enemy` paint layer is rotated. The Shogi kings still retain their two distinct glyph identities; only their direction is shared.

That change removed 46 redundant orientation SVGs. Because PyChess embeds piece images into generated CSS, the combined generated CSS for those four styles fell from about **1.22 MB to 615 KB**—almost exactly half—without runtime SVG generation and without changing how the sets look across the board.

### Why not deduplicate every Shogi set?

The `cz`, `czalt`, and related `czech` names identify a promising visual family, but the name or the general wooden-piece style is not enough by itself. We used this method only where the two directional files could be audited as effectively the same drawing after a 180-degree rotation. In those sets, one canonical image really can stand in for both directions.

Other Shogi sets may contain deliberate differences between their two sides: separately positioned calligraphy, colour or texture changes, fixed lighting and shadows, asymmetric decoration, or hand-adjusted outlines. Some also distinguish kings or players in ways that must survive a board flip. Replacing such artwork with an automatic rotation could save files while quietly changing the artist's intended result.

So the remaining sets keep their paired images until each family is checked individually. This optimisation is intentionally conservative: deduplication is safe only when *visual equivalence* has been demonstrated, not merely because two SVGs happen to face opposite ways.

## The shadow that refused to turn

Then two more candidates stepped out of that cautious remainder: the simple one-kanji `ctk` set and its two-kanji relative.

At first glance, their paired SVGs looked perfect for deduplication. Turn a `0` image through 180 degrees and its outline, wood, and calligraphy agreed with the corresponding `1` image. One small detail refused to cooperate: every pentagon carried a soft shadow on its right and bottom edges.

That shadow was not a browser effect. It lived inside each SVG as a filter with a two-unit horizontal and vertical offset. Rotating the finished image therefore rotated its little lighting system too. The piece faced the correct opponent, but the shadow moved to the upper-left—as if somebody had carried the lamp to the other side of the room while the board was turning.

The obvious next idea was to remove the filter from the canonical SVG and reproduce it with CSS. That worked for an ally piece. An enemy piece was more subtle, because its painted layer was also being rotated. We tried compensating for that rotation with a reversed shadow offset. It looked correct in Firefox, and for a moment the problem seemed finished.

BrowserStack supplied the less cheerful second opinion. Chromium, Safari, and Edge put the compensated shadow on the upper-left. A correction that depended on how a transformed, filtered layer was composed had traded one orientation bug for a browser-dependent one.

The reliable solution was another separation of responsibilities:

```css
piece {
    filter: drop-shadow(var(--shadow) var(--shadow) var(--shadow) #000);
}

piece::before {
    /* The canonical SVG is painted here. */
}

piece.enemy::before {
    transform: rotate(180deg);
}
```

The inner `::before` layer turns the artwork. The outer `<piece>` element never turns, so its shadow always falls toward the same bottom-right corner of the screen. Chessgroundx still owns the parent's translation, the pseudo-element owns direction, and the parent filter owns lighting. Each transform now has exactly one job.

![Rotating an entire Shogi piece moves its shadow, while rotating only the artwork leaves the shadow fixed](/static/images/ThePointOfView/05-shadow-layers.png "The shadow stays outside the rotating artwork layer")

The CSS shadow is scaled from the actual board geometry rather than being a single fixed number. A pawn on a 5×5 Kyoto board, a normal 9×9 Shogi board, and a 10×10 Decimal Shogi board occupy different-sized rectangles. Their shadow must grow with the rendered piece if it is to reproduce the original SVG offset.

We also made the extraction deliberately mechanical. A small script recognises the exact SVG filter graph we audited, removes that filter and its reference, and refuses unfamiliar structures. This is not a general promise that every SVG shadow can be reconstructed. It is a repeatable operation for a known family of files.

The `ctk` set became the prototype. Its one-kanji artwork now serves Shogi, Kyoto Shogi, and Decimal Shogi from one orientation, with 23 opposite-facing files removed. The generated CSS for the affected styles shrank by about **311 KB**. More importantly, direct local testing and BrowserStack agreed on the bottom-right shadow in Firefox, Chromium, Safari, and Edge.

With that result established, the two-kanji set followed. Fifteen opposite-facing SVGs disappeared; previews, lobby artwork, and the two-kanji kings used by a mixed Kyoto set received the same CSS shadow where necessary. Two experimental Drunken Elephant files disappeared as well after we confirmed that this piece style is deliberately excluded from Sho Shogi. Together, the affected two-kanji generated styles fell by about **595 KB**.

This does not overturn the conservative rule above. It sharpens it. A fixed shadow is a meaningful difference between two rendered images, but it does not always require two copies of the underlying drawing. When the artwork, orientation, lighting, and board movement can be placed on separate layers, each can be tested—and reused—on its own.

## A turn nobody should notice

There is something pleasing about a fix whose final behaviour is invisible. A player presses the rotation button. Every square moves. Every Shogi piece quietly faces the right opponent. Nothing jumps, no artwork is duplicated unnecessarily, and custom variant authors do not need to upload secret extra files.

The whole result is a pseudo-element, a shadow on its parent, and a 180-degree turn.

Tiny magic, perhaps—but it understands the point of view.

-gbtami
