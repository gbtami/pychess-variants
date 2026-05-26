(function () {
  "use strict";

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHref(url) {
    var value = (url || "").trim();
    if (!value) return null;
    if (value.startsWith("/")) return value;
    try {
      var parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
      return null;
    } catch (_err) {
      return null;
    }
  }

  function renderInline(text) {
    var escaped = escapeHtml(text);
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, href) {
      var safe = safeHref(href);
      if (!safe) return label;
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer nofollow">' + label + "</a>";
    });
    return escaped;
  }

  function renderMarkdown(text) {
    var lines = (text || "").replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var inList = false;
    var inCode = false;

    for (var i = 0; i < lines.length; i += 1) {
      var raw = lines[i];
      var line = raw.trim();

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
        html.push("<li>" + renderInline(line.slice(2)) + "</li>");
        continue;
      }

      if (inList) {
        html.push("</ul>");
        inList = false;
      }

      if (line.startsWith("### ")) {
        html.push("<h3>" + renderInline(line.slice(4)) + "</h3>");
        continue;
      }
      if (line.startsWith("## ")) {
        html.push("<h2>" + renderInline(line.slice(3)) + "</h2>");
        continue;
      }
      if (line.startsWith("# ")) {
        html.push("<h1>" + renderInline(line.slice(2)) + "</h1>");
        continue;
      }
      if (line.startsWith("> ")) {
        html.push("<blockquote>" + renderInline(line.slice(2)) + "</blockquote>");
        continue;
      }

      html.push("<p>" + renderInline(raw) + "</p>");
    }

    if (inList) html.push("</ul>");
    if (inCode) html.push("</code></pre>");
    return html.join("");
  }

  var source = document.getElementById("ublog-markdown-source");
  var render = document.getElementById("ublog-markdown-render");
  if (source && render) {
    render.innerHTML = renderMarkdown(source.value || source.textContent || "");
  }

  var formSource = document.getElementById("ublog-form-markdown");
  var preview = document.getElementById("ublog-form-preview");
  if (formSource && preview) {
    var repaint = function () {
      preview.innerHTML = renderMarkdown(formSource.value || "");
    };
    repaint();
    formSource.addEventListener("input", repaint);
  }
})();
