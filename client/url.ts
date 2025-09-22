// Utility function to validate and sanitize URLs
export function sanitizeURL(url: string | null): string {
    try {
        const parsedURL = new URL(url ?? "", window.location.origin);
        return parsedURL.href.replace(/\/$/, '');
    } catch {
        console.warn("Invalid URL detected, using default safe value.");
        return window.location.origin; // Default safe value
    }
}
