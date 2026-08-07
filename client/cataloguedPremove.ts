import { createBetzaPremove, type BetzaPremove } from '@pychess/betza';
import { premove } from 'chessgroundx/premove';
import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

interface CataloguedPremoveMetadata {
    readonly name: string;
    readonly source?: 'user' | 'fairy-stockfish-builtin';
    readonly ini?: string;
    readonly baseVariant?: string;
}

interface CataloguedPremoveDefinition {
    readonly baseVariant?: string;
    readonly movements: ReadonlyMap<string, BetzaPremove>;
    readonly promotedPieceTypes: ReadonlyMap<string, string>;
    readonly kingRoleLetter?: string;
}

interface ParsedIniOption {
    readonly key: string;
    readonly value: string;
}

const cataloguedPremoveDefinitions = new Map<string, CataloguedPremoveDefinition>();

function iniOptions(ini: string): ParsedIniOption[] {
    const options: ParsedIniOption[] = [];
    for (const line of ini.split(/\r?\n/)) {
        const stripped = line.trim();
        if (!stripped || stripped.startsWith('#') || stripped.startsWith(';') || !stripped.includes('=')) continue;

        const [left, ...right] = stripped.split('=');
        const key = left.trim();
        const value = right
            .join('=')
            .split('#', 1)[0]
            .split(';', 1)[0]
            .trim();
        if (key) options.push({ key, value });
    }
    return options;
}

function normalRoleLetter(value: string): string | undefined {
    const match = /^\+?([a-z])$/i.exec(value.trim());
    return match?.[1].toLowerCase();
}

function promotedPieceTypes(options: readonly ParsedIniOption[]): Map<string, string> {
    const result = new Map<string, string>();
    const value = options.find(option => option.key.toLowerCase() === 'promotedpiecetype')?.value;
    if (!value) return result;

    for (const token of value.split(/\s+/)) {
        const match = /^([a-z]):([a-z-])$/i.exec(token);
        if (!match) continue;
        result.set(match[1].toLowerCase(), match[2].toLowerCase());
    }
    return result;
}

function parsePremoveDefinition(meta: CataloguedPremoveMetadata): CataloguedPremoveDefinition {
    const options = iniOptions(meta.ini ?? '');
    const movements = new Map<string, BetzaPremove>();
    let kingRoleLetter: string | undefined;

    for (const { key, value } of options) {
        const normalizedKey = key.toLowerCase();
        if (!(normalizedKey === 'king' || /^custompiece\d+$/i.test(key)) || value === '-') continue;

        const explicit = /^([a-z]):(.*)$/i.exec(value);
        if (!explicit) continue;
        const roleLetter = explicit[1].toLowerCase();
        movements.set(roleLetter, createBetzaPremove(explicit[2].trim()));
        if (normalizedKey === 'king') kingRoleLetter = roleLetter;
    }

    return {
        baseVariant: meta.baseVariant,
        movements,
        promotedPieceTypes: promotedPieceTypes(options),
        kingRoleLetter,
    };
}

export function registerCataloguedPremove(meta: CataloguedPremoveMetadata): void {
    // Site variants and catalogued Fairy-Stockfish built-ins continue to use
    // chessgroundx's established hard-coded premoves. The generic Betza path is
    // intentionally limited to user-defined variants.
    if (!meta.name || meta.source === 'fairy-stockfish-builtin') {
        cataloguedPremoveDefinitions.delete(meta.name);
        return;
    }
    cataloguedPremoveDefinitions.set(meta.name, parsePremoveDefinition(meta));
}

export function unregisterCataloguedPremove(name: string | undefined | null): void {
    if (name) cataloguedPremoveDefinitions.delete(name);
}

function destinationsForMovement(
    movement: BetzaPremove,
    boardState: cg.BoardState,
    key: cg.Key,
    dimensions: cg.BoardDimensions,
): cg.Key[] {
    const piece = boardState.pieces.get(key);
    if (!piece) return [];

    return movement({
        origin: util.key2pos(key),
        color: piece.color,
        board: dimensions,
    }).map(position => util.pos2key([position[0], position[1]]));
}

function fallbackAsRole(
    fallback: cg.Premove,
    boardState: cg.BoardState,
    key: cg.Key,
    canCastle: boolean,
    roleLetter: string,
): cg.Key[] {
    const piece = boardState.pieces.get(key);
    if (!piece || !normalRoleLetter(roleLetter)) return [];

    const pieces = new Map(boardState.pieces);
    pieces.set(key, { ...piece, role: util.roleOf(roleLetter as cg.Letter) });
    return fallback({ ...boardState, pieces }, key, canCastle);
}

function mergeDestinations(primary: readonly cg.Key[], extra: readonly cg.Key[]): cg.Key[] {
    if (!extra.length) return [...primary];
    return [...new Set([...primary, ...extra])];
}

function specialFallbackDestinations(
    fallback: cg.Premove,
    boardState: cg.BoardState,
    key: cg.Key,
    canCastle: boolean,
    roleLetter?: string,
): cg.Key[] {
    if (!canCastle) return [];

    const withSpecial = roleLetter
        ? fallbackAsRole(fallback, boardState, key, true, roleLetter)
        : fallback(boardState, key, true);
    const withoutSpecial = new Set(
        roleLetter
            ? fallbackAsRole(fallback, boardState, key, false, roleLetter)
            : fallback(boardState, key, false),
    );
    return withSpecial.filter(destination => !withoutSpecial.has(destination));
}

export function premoveForVariant(
    variantName: string,
    chess960: boolean,
    dimensions: cg.BoardDimensions,
): cg.Premove {
    const definition = cataloguedPremoveDefinitions.get(variantName);
    if (!definition) return premove(variantName, chess960, dimensions);

    const fallback = premove(definition.baseVariant ?? variantName, chess960, dimensions);
    return (boardState, key, canCastle) => {
        const piece = boardState.pieces.get(key);
        if (!piece) return [];

        const letter = util.letterOf(piece.role).toLowerCase();
        if (letter.startsWith('+')) {
            const source = letter.slice(1);
            const target = definition.promotedPieceTypes.get(source);
            if (target && target !== '-') {
                const promotedMovement = definition.movements.get(target);
                if (promotedMovement) {
                    return mergeDestinations(
                        destinationsForMovement(promotedMovement, boardState, key, dimensions),
                        specialFallbackDestinations(fallback, boardState, key, canCastle, target),
                    );
                }
                return fallbackAsRole(fallback, boardState, key, canCastle, target);
            }
        }

        const movement = definition.movements.get(letter);
        if (movement) {
            return mergeDestinations(
                destinationsForMovement(movement, boardState, key, dimensions),
                specialFallbackDestinations(
                    fallback,
                    boardState,
                    key,
                    canCastle,
                    letter === definition.kingRoleLetter ? 'k' : undefined,
                ),
            );
        }
        return fallback(boardState, key, canCastle);
    };
}
