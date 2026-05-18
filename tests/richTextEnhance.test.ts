import { enhanceRichText, expandGameEmbeds } from "../client/richTextEnhance";

test("embeds direct imgur links as images", () => {
    const html = enhanceRichText("https://i.imgur.com/HFn4lkh.jpeg");
    expect(html).toContain('href="https://i.imgur.com/HFn4lkh.jpg"');
    expect(html).toContain('<img class="inbox-msg-inline-image" src="https://i.imgur.com/HFn4lkh.jpg"');
    expect(html).toContain('referrerpolicy="no-referrer"');
});

test("can disable external media embeds and keep external image as link only", () => {
    const html = enhanceRichText("https://i.imgur.com/HFn4lkh.jpeg", { allowExternalMediaEmbeds: false });
    expect(html).toContain('href="https://i.imgur.com/HFn4lkh.jpeg">i.imgur.com/HFn4lkh.jpeg</a>');
    expect(html).not.toContain("<img ");
});

test("keeps imgur galleries as regular links", () => {
    const input = "https://imgur.com/gallery/lichess-is-down-404-image-HFn4lkh";
    const html = enhanceRichText(input);
    expect(html).toContain(`href="${input}"`);
    expect(html).toContain(">imgur.com/gallery/lichess-is-down-404-image-HFn4lkh</a>");
    expect(html).not.toContain("<img ");
});

test("bulk game ids get text class like lichess", () => {
    const html = enhanceRichText("Your game with @somebody is ready: #gameIdXX.");
    expect(html).toContain('href="/@/somebody">@somebody</a>');
    expect(html).toContain('class="text" target="_blank" rel="nofollow noreferrer noopener" href="/gameIdXX">#gameIdXX</a>');
});

test("regular game urls stay regular links", () => {
    const html = enhanceRichText("I played a game: https://pychess.org/GameIdXX");
    expect(html).toContain('href="https://pychess.org/GameIdXX">pychess.org/GameIdXX</a>');
    expect(html).not.toContain('class="text" target="_blank" rel="nofollow noreferrer noopener" href="https://pychess.org/GameIdXX"');
});

test("game embed expansion ignores known non-game routes", () => {
    document.body.innerHTML = `<div id="root"><a href="${window.location.origin}/analysis">analysis</a></div>`;
    const root = document.getElementById("root") as HTMLElement;
    expandGameEmbeds(root);
    expect(root.querySelector("iframe")).toBeNull();
});

test("game embed expansion transforms real local game links", () => {
    document.body.innerHTML = `<div id="root"><a href="${window.location.origin}/abc123xy">link</a></div>`;
    const root = document.getElementById("root") as HTMLElement;
    expandGameEmbeds(root);
    const iframe = root.querySelector(".inbox-msg-game-embed iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("/embed/abc123xy");
});

test("game embed expansion transforms lichess game links", () => {
    document.body.innerHTML = `<div id="root"><a href="https://lichess.org/XaY4A7dB/black#13">link</a></div>`;
    const root = document.getElementById("root") as HTMLElement;
    expandGameEmbeds(root);
    const iframe = root.querySelector(".inbox-msg-game-embed iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("https://lichess.org/embed/game/XaY4A7dB/black#13");
});

test("game embed expansion transforms pychess.org game links", () => {
    document.body.innerHTML = `<div id="root"><a href="https://www.pychess.org/AbC123xY#21">link</a></div>`;
    const root = document.getElementById("root") as HTMLElement;
    expandGameEmbeds(root);
    const iframe = root.querySelector(".inbox-msg-game-embed iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("https://www.pychess.org/embed/AbC123xY#21");
});
