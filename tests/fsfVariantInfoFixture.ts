import { FsfVariantInfo, FsfVariantPieceInfo } from '../client/variants';

type ColorValue<T> = { white: T; black: T };

type FsfVariantInfoOverrides = Partial<
    Omit<
        FsfVariantInfo,
        | 'board'
        | 'movement'
        | 'promotion'
        | 'capture'
        | 'castling'
        | 'drops'
        | 'gating'
        | 'gameEnd'
        | 'extinction'
        | 'flag'
        | 'connect'
        | 'enclosing'
        | 'protocol'
    >
> & {
    board?: Partial<FsfVariantInfo['board']>;
    movement?: Partial<FsfVariantInfo['movement']>;
    promotion?: Partial<FsfVariantInfo['promotion']>;
    capture?: Partial<FsfVariantInfo['capture']>;
    castling?: Partial<FsfVariantInfo['castling']>;
    drops?: Partial<FsfVariantInfo['drops']>;
    gating?: Partial<FsfVariantInfo['gating']>;
    gameEnd?: Partial<FsfVariantInfo['gameEnd']>;
    extinction?: Partial<FsfVariantInfo['extinction']>;
    flag?: Partial<FsfVariantInfo['flag']>;
    connect?: Partial<FsfVariantInfo['connect']>;
    enclosing?: Partial<FsfVariantInfo['enclosing']>;
    protocol?: Partial<NonNullable<FsfVariantInfo['protocol']>>;
};

export function fsfPiece(
    type: string,
    white: string,
    options: {
        black?: string;
        synonym?: ColorValue<string> | null;
        customBetza?: string | null;
        midgame?: number;
        endgame?: number;
    } = {},
): FsfVariantPieceInfo {
    return {
        type,
        fen: { white, black: options.black ?? white.toLowerCase() },
        synonym: options.synonym ?? null,
        customBetza: options.customBetza ?? null,
        value: { midgame: options.midgame ?? 0, endgame: options.endgame ?? 0 },
    };
}

export function makeFsfVariantInfo(overrides: FsfVariantInfoOverrides = {}): FsfVariantInfo {
    const emptyRegions: ColorValue<readonly string[]> = { white: [], black: [] };
    const emptyTypes: ColorValue<readonly string[]> = { white: [], black: [] };
    const base: FsfVariantInfo = {
        schemaVersion: 1,
        name: 'testvariant',
        template: 'chess',
        board: {
            width: 8,
            height: 8,
            startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
            chess960: false,
            twoBoards: false,
            diagonalLines: [],
        },
        pieces: [fsfPiece('king', 'K')],
        pieceTypes: ['king'],
        royalPieceTypes: ['king'],
        movement: {
            mobilityRegions: {},
            doubleStep: false,
            doubleStepRegions: emptyRegions,
            tripleStepRegions: emptyRegions,
            enPassantRegions: emptyRegions,
            enPassantTypes: emptyTypes,
            pass: { white: false, black: false },
            passOnStalemate: { white: false, black: false },
            mustCapture: false,
            immobilityIllegal: false,
            cambodianMoves: false,
            makpongRule: false,
            flyingGeneral: false,
            soldierPromotionRank: 1,
        },
        promotion: {
            regions: emptyRegions,
            mainPawnTypes: { white: 'none', black: 'none' },
            pawnTypes: emptyTypes,
            pieceTypes: emptyTypes,
            promotedPieceTypes: {},
            limits: {},
            sittuyin: false,
            onCapture: false,
            mandatoryPawn: false,
            mandatoryPiece: false,
            demotion: false,
            shogiStyle: false,
        },
        capture: {
            blast: false,
            blastImmuneTypes: [],
            mutuallyImmuneTypes: [],
            petrifyTypes: [],
            petrifyBlastPieces: false,
        },
        castling: {
            enabled: false,
            droppedPiece: false,
            kingSideFile: 0,
            queenSideFile: 0,
            rank: 0,
            kingFile: 0,
            rookKingSideFile: 0,
            rookQueenSideFile: 0,
            kingPieces: { white: 'king', black: 'king' },
            rookPieces: emptyTypes,
            opposite: false,
            wins: {
                white: { kingSide: false, queenSide: false },
                black: { kingSide: false, queenSide: false },
            },
        },
        drops: {
            enabled: false,
            capturesToHand: false,
            mustDrop: false,
            mustDropType: 'none',
            dropLoop: false,
            firstRankPawnDrops: false,
            promotionZonePawnDrops: false,
            regions: emptyRegions,
            enclosingRule: 'none',
            enclosingStart: [],
            sittuyinRook: false,
            oppositeColoredBishop: false,
            promoted: false,
            noDoubledType: 'none',
            noDoubledCount: 0,
            free: false,
        },
        gating: {
            enabled: false,
            seirawan: false,
            wallingRule: 'none',
            wallingRegions: emptyRegions,
            wallOrMove: false,
        },
        gameEnd: {
            checking: true,
            dropChecks: true,
            kingType: 'king',
            nMoveRule: 0,
            nMoveRuleTypes: emptyTypes,
            nFoldRule: 0,
            nFoldValue: 'draw',
            nFoldValueAbsolute: false,
            perpetualCheckIllegal: false,
            moveRepetitionIllegal: false,
            chasingRule: 'none',
            stalemateValue: 'draw',
            stalematePieceCount: false,
            checkmateValue: 'loss',
            shogiPawnDropMateIllegal: false,
            shatarMateRule: false,
            bikjangRule: false,
            dupleCheck: false,
            checkCounting: false,
            materialCounting: 'none',
            adjudicateFullBoard: false,
            countingRule: 'none',
        },
        extinction: {
            value: 'none',
            claim: false,
            pseudoRoyal: false,
            pieceTypes: [],
            pieceCount: 0,
            opponentPieceCount: 0,
        },
        flag: {
            pieces: { white: 'none', black: 'none' },
            regions: emptyRegions,
            pieceCount: 0,
            blockedWin: false,
            move: false,
            safe: false,
        },
        connect: {
            n: 0,
            pieceTypes: [],
            horizontal: false,
            vertical: false,
            diagonal: false,
            region1: emptyRegions,
            region2: emptyRegions,
            nxn: 0,
            collinearN: 0,
            value: 'none',
        },
        enclosing: { flipRule: 'none' },
        protocol: { pieceToCharTable: '-', pocketSize: 0 },
    };

    return {
        ...base,
        ...overrides,
        board: { ...base.board, ...overrides.board },
        movement: { ...base.movement, ...overrides.movement },
        promotion: { ...base.promotion, ...overrides.promotion },
        capture: { ...base.capture, ...overrides.capture },
        castling: { ...base.castling, ...overrides.castling },
        drops: { ...base.drops, ...overrides.drops },
        gating: { ...base.gating, ...overrides.gating },
        gameEnd: { ...base.gameEnd, ...overrides.gameEnd },
        extinction: { ...base.extinction, ...overrides.extinction },
        flag: { ...base.flag, ...overrides.flag },
        connect: { ...base.connect, ...overrides.connect },
        enclosing: { ...base.enclosing, ...overrides.enclosing },
        protocol: { ...base.protocol!, ...overrides.protocol },
    };
}
