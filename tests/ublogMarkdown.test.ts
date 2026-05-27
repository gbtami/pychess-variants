import { initUblogMarkdown } from "../client/ublogMarkdown";

function renderBlogMarkdown(markdown: string): HTMLElement {
    document.body.innerHTML = `
        <textarea id="ublog-markdown-source"></textarea>
        <div id="ublog-markdown-render"></div>
    `;
    const source = document.getElementById("ublog-markdown-source") as HTMLTextAreaElement;
    source.value = markdown;
    initUblogMarkdown();
    return document.getElementById("ublog-markdown-render") as HTMLElement;
}

test("keeps youtube iframe embeds playable", () => {
    const root = renderBlogMarkdown(
        '<iframe width="560" height="315" src="https://www.youtube.com/embed/rz3f5febUAU" frameborder="0" allowfullscreen></iframe>'
    );
    const iframe = root.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube.com/embed/rz3f5febUAU");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
});

test("drops iframe embeds with unsafe src", () => {
    const root = renderBlogMarkdown('<iframe src="javascript:alert(1)"></iframe>');
    expect(root.querySelector("iframe")).toBeNull();
});
