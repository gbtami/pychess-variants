function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeHref(url: string): string | null {
    const value = (url || "").trim();
    if (!value) return null;
    if (value.startsWith("/")) return value;
    try {
        const parsed = new URL(value);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href;
        }
        return null;
    } catch {
        return null;
    }
}

function renderInline(text: string): string {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
        const safe = safeHref(href);
        if (!safe) return label;
        return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
    });
    return escaped;
}

function renderMarkdown(text: string): string {
    const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
    const html: string[] = [];
    let inList = false;
    let inCode = false;

    for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i];
        const line = raw.trim();

        if (line.startsWith("```")) {
            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            html.push(inCode ? "</code></pre>" : "<pre><code>");
            inCode = !inCode;
            continue;
        }

        if (inCode) {
            html.push(escapeHtml(raw));
            continue;
        }

        if (!line) {
            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            continue;
        }

        if (line.startsWith("- ") || line.startsWith("* ")) {
            if (!inList) {
                html.push("<ul>");
                inList = true;
            }
            html.push(`<li>${renderInline(line.slice(2))}</li>`);
            continue;
        }

        if (inList) {
            html.push("</ul>");
            inList = false;
        }

        if (line.startsWith("### ")) {
            html.push(`<h3>${renderInline(line.slice(4))}</h3>`);
            continue;
        }
        if (line.startsWith("## ")) {
            html.push(`<h2>${renderInline(line.slice(3))}</h2>`);
            continue;
        }
        if (line.startsWith("# ")) {
            html.push(`<h1>${renderInline(line.slice(2))}</h1>`);
            continue;
        }
        if (line.startsWith("> ")) {
            html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
            continue;
        }

        html.push(`<p>${renderInline(raw)}</p>`);
    }

    if (inList) html.push("</ul>");
    if (inCode) html.push("</code></pre>");
    return html.join("");
}

export function initUblogMarkdown(): void {
    const source = document.getElementById("ublog-markdown-source") as HTMLTextAreaElement | null;
    const render = document.getElementById("ublog-markdown-render");
    if (source && render) {
        render.innerHTML = renderMarkdown(source.value || source.textContent || "");
    }

    const formSource = document.getElementById("ublog-form-markdown") as HTMLTextAreaElement | null;
    const preview = document.getElementById("ublog-form-preview");
    if (formSource && preview) {
        const repaint = () => {
            preview.innerHTML = renderMarkdown(formSource.value || "");
        };
        repaint();
        formSource.addEventListener("input", repaint);
    }
}
