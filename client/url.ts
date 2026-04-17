// Utility function to validate and sanitize URLs
export function sanitizeURL(url: string | null): string {
    try {
        const parsedURL = new URL(url ?? "", window.location.origin);
        if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") {
            throw new Error("Invalid protocol");
        }
        return parsedURL.href.replace(/\/$/, '');
    } catch {
        console.warn("Invalid URL detected, using default safe value.");
        return window.location.origin; // Default safe value
    }
}
