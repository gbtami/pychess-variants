import type {
    ParsedStudyPgnDocument,
    ParsedStudyPgnGame,
    ParsedStudyPgnMove,
    StudyPgnParser,
    StudyPgnParserCapabilities,
} from './studyPgnImport';

export interface StudyPgnParserLimits {
    maxInputChars: number;
    maxGames: number;
    maxNodesPerGame: number;
    maxVariationDepth: number;
}

export const DEFAULT_STUDY_PGN_PARSER_LIMITS: Readonly<StudyPgnParserLimits> = Object.freeze({
    maxInputChars: 8_000_000,
    maxGames: 64,
    maxNodesPerGame: 3_000,
    maxVariationDepth: 64,
});

const COMPLETE_CAPABILITIES: StudyPgnParserCapabilities = {
    recursiveVariations: true,
    comments: true,
    nags: true,
    multipleGames: true,
};

const PUNCTUATION_NAGS: Readonly<Record<string, number>> = Object.freeze({
    '!': 1,
    '?': 2,
    '!!': 3,
    '??': 4,
    '!?': 5,
    '?!': 6,
});

const STANDALONE_NAGS: Readonly<Record<string, number>> = Object.freeze({
    ...PUNCTUATION_NAGS,
    '=': 10,
    '∞': 13,
    '+=': 14,
    '=+': 15,
    '±': 16,
    '∓': 17,
    '+-': 18,
    '+−': 18,
    '+/−': 18,
    '+/-': 18,
    '-+': 19,
    '−+': 19,
    '−/+': 19,
    '-/+': 19,
});

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '1/2', '½-½', '*']);

export class StudyPgnParseError extends Error {
    readonly line: number;
    readonly column: number;

    constructor(message: string, line: number, column: number) {
        super(`PGN parse error at line ${line}, column ${column}: ${message}`);
        this.name = 'StudyPgnParseError';
        this.line = line;
        this.column = column;
    }
}

type PositionOwner = ParsedStudyPgnGame | ParsedStudyPgnMove;

interface SequenceResult {
    result?: string;
    sawMove: boolean;
    terminalOwner: PositionOwner;
}

function addComment(owner: PositionOwner, comment: string): void {
    const cleaned = comment.trim();
    if (!cleaned) return;
    owner.comments ??= [];
    owner.comments.push(cleaned);
}

function addNag(move: ParsedStudyPgnMove, nag: number): void {
    if (!nag) return;
    move.nags ??= [];
    if (!move.nags.includes(nag)) move.nags.push(nag);
}

function cleanupMove(move: ParsedStudyPgnMove): void {
    if (!move.comments?.length) delete move.comments;
    if (!move.nags?.length) delete move.nags;
    if (!move.children?.length) delete move.children;
    else move.children.forEach(cleanupMove);
}

function normalizedResult(token: string): string | undefined {
    if (!RESULT_TOKENS.has(token)) return undefined;
    return token === '½-½' || token === '1/2' ? '1/2-1/2' : token;
}

class ParserState {
    private index = 0;
    private line = 1;
    private column = 1;
    private currentGameNodes = 0;

    constructor(
        private readonly source: string,
        private readonly limits: StudyPgnParserLimits,
    ) {}

    parseDocument(): ParsedStudyPgnDocument {
        if (this.source.length > this.limits.maxInputChars) {
            throw new StudyPgnParseError(
                `PGN text is too large (maximum ${this.limits.maxInputChars.toLocaleString()} characters).`,
                1,
                1,
            );
        }

        this.skipInterTokenSpace();
        const games: ParsedStudyPgnGame[] = [];
        while (!this.eof()) {
            if (games.length >= this.limits.maxGames) {
                this.fail(`PGN contains more than ${this.limits.maxGames} games.`);
            }
            const before = this.index;
            games.push(this.parseGame());
            if (this.index === before) this.fail('Parser made no progress.');
            this.skipInterTokenSpace();
        }

        return { capabilities: { ...COMPLETE_CAPABILITIES }, games };
    }

    private parseGame(): ParsedStudyPgnGame {
        this.currentGameNodes = 0;
        const tags: Record<string, string> = {};
        this.skipInterTokenSpace();
        while (this.peek() === '[') {
            const [name, value] = this.parseTagPair();
            tags[name] = value;
            this.skipInterTokenSpace();
        }

        const game: ParsedStudyPgnGame = { tags, children: [] };
        const sequence = this.parseSequence(game.children, game, false, 0);
        if (sequence.result) this.parseTrailingComments(sequence.terminalOwner);
        const tagResult = tags.Result ? normalizedResult(tags.Result) : undefined;
        if (tagResult) tags.Result = tagResult;
        else if (!tags.Result && sequence.result) tags.Result = sequence.result;
        game.children.forEach(cleanupMove);
        if (!game.comments?.length) delete game.comments;
        return game;
    }

    private parseSequence(
        children: ParsedStudyPgnMove[],
        startOwner: PositionOwner,
        variation: boolean,
        depth: number,
    ): SequenceResult {
        if (depth > this.limits.maxVariationDepth) {
            this.fail(`PGN variation nesting exceeds ${this.limits.maxVariationDepth}.`);
        }

        let currentOwner = startOwner;
        let currentChildren = children;
        let lastMove: ParsedStudyPgnMove | undefined;
        let lastMoveSiblings: ParsedStudyPgnMove[] | undefined;
        let lastMoveParent: PositionOwner | undefined;
        let sawMove = false;
        const leadingVariationComments: string[] = [];

        while (true) {
            this.skipInterTokenSpace();
            if (this.eof()) {
                if (variation) this.fail('Unclosed variation; expected ")".');
                return { sawMove, terminalOwner: currentOwner };
            }

            const ch = this.peek();
            if (ch === ')') {
                if (!variation) this.fail('Unexpected ")" without a matching variation.');
                this.advance();
                if (!sawMove) {
                    for (const comment of leadingVariationComments) addComment(startOwner, comment);
                }
                return { sawMove, terminalOwner: currentOwner };
            }
            if (ch === '(') {
                if (!lastMove || !lastMoveSiblings || !lastMoveParent) {
                    this.fail('Variation has no preceding move to vary.');
                }
                this.advance();
                this.parseSequence(lastMoveSiblings, lastMoveParent, true, depth + 1);
                continue;
            }
            if (ch === '{') {
                const comment = this.parseBraceComment();
                if (variation && !sawMove) leadingVariationComments.push(comment);
                else addComment(currentOwner, comment);
                continue;
            }
            if (ch === ';') {
                const comment = this.parseLineComment();
                if (variation && !sawMove) leadingVariationComments.push(comment);
                else addComment(currentOwner, comment);
                continue;
            }
            if (ch === '$') {
                if (!lastMove) this.fail('Numeric annotation glyph has no preceding move.');
                addNag(lastMove, this.parseNumericNag());
                continue;
            }
            if (ch === '[') {
                if (variation) this.fail('Tag pair encountered inside a variation.');
                return { sawMove, terminalOwner: currentOwner };
            }
            if (ch === '}') this.fail('Unexpected "}" outside a brace comment.');

            const rawToken = this.parseAtom();
            if (!rawToken) this.fail('Unexpected PGN token.');
            const token = this.stripMoveNumber(rawToken);
            if (!token) continue;

            const result = normalizedResult(token);
            if (result) {
                if (variation) this.fail('Game result encountered inside a variation.');
                return { result, sawMove, terminalOwner: currentOwner };
            }

            const standaloneNag = STANDALONE_NAGS[token];
            if (standaloneNag !== undefined) {
                if (!lastMove) this.fail(`Annotation glyph ${token} has no preceding move.`);
                addNag(lastMove, standaloneNag);
                continue;
            }

            const { san, nag } = this.splitMoveNag(token);
            if (!san) continue;
            this.currentGameNodes += 1;
            if (this.currentGameNodes > this.limits.maxNodesPerGame) {
                this.fail(`PGN game contains more than ${this.limits.maxNodesPerGame} moves/variation nodes.`);
            }

            const node: ParsedStudyPgnMove = { san };
            if (nag !== undefined) addNag(node, nag);
            if (variation && !sawMove) {
                for (const comment of leadingVariationComments) addComment(node, comment);
                leadingVariationComments.length = 0;
            }

            const parent = currentOwner;
            const siblings = currentChildren;
            siblings.push(node);
            lastMove = node;
            lastMoveSiblings = siblings;
            lastMoveParent = parent;
            currentOwner = node;
            node.children = [];
            currentChildren = node.children;
            sawMove = true;
        }
    }

    private parseTrailingComments(owner: PositionOwner): void {
        while (true) {
            this.skipInterTokenSpace();
            if (this.peek() === '{') addComment(owner, this.parseBraceComment());
            else if (this.peek() === ';') addComment(owner, this.parseLineComment());
            else return;
        }
    }

    private parseTagPair(): [string, string] {
        this.expect('[');
        this.skipWhitespace();
        const name = this.readWhile(ch => /[A-Za-z0-9_]/.test(ch));
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) this.fail('Invalid PGN tag name.');
        this.skipWhitespace();
        this.expect('"', `Expected quoted value for [${name}] tag.`);

        let value = '';
        let closed = false;
        while (!this.eof()) {
            const ch = this.peek();
            if (ch === '"') {
                this.advance();
                closed = true;
                break;
            }
            if (ch === '\\') {
                this.advance();
                if (this.eof()) this.fail(`Unclosed [${name}] tag value.`);
                const escaped = this.peek();
                value += escaped === '"' || escaped === '\\' ? escaped : `\\${escaped}`;
                this.advance();
                continue;
            }
            value += ch;
            this.advance();
        }
        if (!closed) this.fail(`Unclosed [${name}] tag value.`);

        this.skipWhitespace();
        this.expect(']', `Expected "]" after [${name}] tag value.`);
        return [name, value];
    }

    private parseBraceComment(): string {
        this.expect('{');
        let value = '';
        while (!this.eof()) {
            const ch = this.peek();
            if (ch === '}') {
                this.advance();
                return value;
            }
            if (ch === '\\') {
                const next = this.peek(1);
                if (next === '}' || next === '\\') {
                    value += next;
                    this.advance();
                    this.advance();
                    continue;
                }
            }
            value += ch;
            this.advance();
        }
        this.fail('Unclosed brace comment; expected "}".');
    }

    private parseLineComment(): string {
        this.expect(';');
        let value = '';
        while (!this.eof() && this.peek() !== '\n' && this.peek() !== '\r') {
            value += this.peek();
            this.advance();
        }
        return value;
    }

    private parseNumericNag(): number {
        this.expect('$');
        const digits = this.readWhile(ch => /\d/.test(ch));
        if (!digits) this.fail('Numeric annotation glyph is missing its number.');
        const nag = Number(digits);
        if (!Number.isSafeInteger(nag) || nag < 0 || nag > 255) {
            this.fail(`Invalid numeric annotation glyph: $${digits}.`);
        }
        return nag;
    }

    private parseAtom(): string {
        return this.readWhile(ch => !/\s/.test(ch) && !'(){};$['.includes(ch));
    }

    private stripMoveNumber(token: string): string {
        let value = token;
        while (true) {
            if (/^\d+$/.test(value) || value === '...' || value === '..' || value === '.') return '';
            const match = /^\d+\.(?:\.\.)?/.exec(value);
            if (!match) return value;
            value = value.slice(match[0].length);
            if (!value) return '';
        }
    }

    private splitMoveNag(token: string): { san: string; nag?: number } {
        for (const suffix of ['!!', '??', '!?', '?!', '!', '?']) {
            if (token.length > suffix.length && token.endsWith(suffix)) {
                return { san: token.slice(0, -suffix.length), nag: PUNCTUATION_NAGS[suffix] };
            }
        }
        return { san: token };
    }

    private skipInterTokenSpace(): void {
        while (true) {
            this.skipWhitespace();
            if (this.column !== 1 || this.peek() !== '%') return;
            while (!this.eof() && this.peek() !== '\n' && this.peek() !== '\r') this.advance();
        }
    }

    private skipWhitespace(): void {
        while (!this.eof()) {
            if (this.index === 0 && this.peek() === '\ufeff') {
                this.index += 1;
                continue;
            }
            if (!/\s/.test(this.peek())) return;
            this.advance();
        }
    }

    private readWhile(predicate: (ch: string) => boolean): string {
        let value = '';
        while (!this.eof() && predicate(this.peek())) {
            value += this.peek();
            this.advance();
        }
        return value;
    }

    private expect(expected: string, message?: string): void {
        if (this.peek() !== expected) this.fail(message ?? `Expected "${expected}".`);
        this.advance();
    }

    private peek(offset = 0): string {
        return this.source[this.index + offset] ?? '';
    }

    private eof(): boolean {
        return this.index >= this.source.length;
    }

    private advance(): void {
        const ch = this.source[this.index];
        this.index += 1;
        if (ch === '\n') {
            this.line += 1;
            this.column = 1;
        } else if (ch === '\r') {
            if (this.peek() !== '\n') {
                this.line += 1;
                this.column = 1;
            }
        } else {
            this.column += 1;
        }
    }

    private fail(message: string): never {
        throw new StudyPgnParseError(message, this.line, this.column);
    }
}

export function parseStudyPgn(pgn: string, limits: Partial<StudyPgnParserLimits> = {}): ParsedStudyPgnDocument {
    const resolvedLimits = { ...DEFAULT_STUDY_PGN_PARSER_LIMITS, ...limits };
    return new ParserState(pgn, resolvedLimits).parseDocument();
}

export const studyPgnParser: StudyPgnParser = {
    parse: parseStudyPgn,
};
