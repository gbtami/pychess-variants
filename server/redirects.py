from __future__ import annotations

from urllib.parse import urlparse

from settings import URI


def safe_redirect_path(referer: str | None, fallback: str = "/") -> str:
    if not referer:
        return fallback

    parsed = urlparse(referer)
    if parsed.scheme or parsed.netloc:
        base = urlparse(URI)
        if parsed.scheme != base.scheme or parsed.netloc != base.netloc:
            return fallback

    if not parsed.path.startswith("/") or parsed.path.startswith("//"):
        return fallback

    redirect_url = parsed.path
    if parsed.query:
        redirect_url = f"{redirect_url}?{parsed.query}"
    return redirect_url
