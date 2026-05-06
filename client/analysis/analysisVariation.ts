export function sliceVariationForBranch<T>(variation: T[], ply: number, plyVari: number): T[] {
    return variation.slice(0, Math.max(0, ply - plyVari));
}
