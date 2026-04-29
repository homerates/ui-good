// lib/shareImages.ts
// Canonical share image registry — use getShareImageForType() everywhere metadata is built

const SHARE_IMAGES = {
    default:         "/assets/share/og/homerates-brand-default-og-1200x630-v1.png",
    "home-purchase": "/assets/share/og/homerates-module-home-purchase-og-1200x630-v1.png",
    refinance:       "/assets/share/og/homerates-share-refinance-og-1200x630-v1.png",
} as const;

export type ShareImageType = keyof typeof SHARE_IMAGES;

export function getShareImageForType(type: ShareImageType = "default"): string {
    return SHARE_IMAGES[type] ?? SHARE_IMAGES.default;
}

// Infers type from free-text (question / title / route)
export function detectShareType(text: string): ShareImageType {
    const t = text.toLowerCase();
    if (/refin/.test(t)) return "refinance";
    if (/purchas|buy |buying|\bfha\b|\bva loan\b|conventional|home purchase/.test(t)) return "home-purchase";
    return "default";
}
