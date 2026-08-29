export const OFFICIAL_NNUE_ARCHIVE_REPOSITORY = 'https://github.com/gbtami/Fairy-Stockfish-NNUE';
export const OFFICIAL_NNUE_ARCHIVE_RELEASE_TAG = 'networks';
export const OFFICIAL_NNUE_ARCHIVE_BASE_URL =
    `${OFFICIAL_NNUE_ARCHIVE_REPOSITORY}/releases/download/${OFFICIAL_NNUE_ARCHIVE_RELEASE_TAG}`;

// This catalogue is intentionally bundled with the client instead of fetched at
// runtime. The GitHub release remains the canonical archive, while Step 3 uses
// a separate CORS-capable delivery host for browser downloads.
export const OFFICIAL_NNUE_NETWORKS = {
    '3check': { file: '3check-cb5f517c228b.nnue', bytes: 47721376 },
    antichess: { file: 'antichess-dd3cbe53cd4e.nnue', bytes: 953248 },
    asean: { file: 'asean-47ebb2f6be7b.nnue', bytes: 47721371 },
    ataxx: { file: 'ataxx-e631fe1b1b6d.nnue', bytes: 245728 },
    atomic: { file: 'atomic-2cf13ff256cc.nnue', bytes: 47721371 },
    cannonshogi: { file: 'cannonshogi-b9b7fc49f641.nnue', bytes: 261112576 },
    capablanca: { file: 'capablanca-bb644ef32758.nnue', bytes: 101518240 },
    capahouse: { file: 'capahouse-727f2d6c8654.nnue', bytes: 125172640 },
    chak: { file: 'chak-068cc47e57f2.nnue', bytes: 1852955 },
    chennis: { file: 'chennis-a800b7f12a4e.nnue', bytes: 22466080 },
    crazyhouse: { file: 'crazyhouse-8ebf84784ad2.nnue', bytes: 58534811 },
    dobutsu: { file: 'dobutsu-9b0989c28462.nnue', bytes: 2119072 },
    dragon: { file: 'dragon-38de1d1ced8a.nnue', bytes: 69348256 },
    duck: { file: 'duck-ba21f91f5d81.nnue', bytes: 47721376 },
    empire: { file: 'empire-751feb44316d.nnue', bytes: 90975131 },
    gorogoroplus: { file: 'gorogoroplus-7bc64726c1c1.nnue', bytes: 23902235 },
    grand: { file: 'grand-9e13c7b0ed97.nnue', bytes: 158542235 },
    grandhouse: { file: 'grandhouse-dd70cad78bc1.nnue', bytes: 188110235 },
    hoppelpoppel: { file: 'hoppelpoppel-b4f82c3d6e25.nnue', bytes: 47721371 },
    horde: { file: 'horde-28173ddccabe.nnue', bytes: 953243 },
    janggi: { file: 'janggi-9991472750de.nnue', bytes: 11261920 },
    khans: { file: 'khans-466a7f4a78f8.nnue', bytes: 90975136 },
    kingofthehill: { file: 'kingofthehill-978b86d0e6a4.nnue', bytes: 47721371 },
    kyotoshogi: { file: 'kyotoshogi-bd1003a29d89.nnue', bytes: 17434240 },
    makpong: { file: 'makpong-eae03bc9dbf8.nnue', bytes: 47721371 },
    makruk: { file: 'makruk-a8c621e24a8c.nnue', bytes: 47721376 },
    manchu: { file: 'manchu-5a3a9e80c0eb.nnue', bytes: 12972640 },
    mansindam: { file: 'mansindam-dc396c59a74b.nnue', bytes: 244176448 },
    minishogi: { file: 'minishogi-a8c76af35580.nnue', bytes: 13738240 },
    minixiangqi: { file: 'minixiangqi-12c45d5da817.nnue', bytes: 4333499 },
    nn: { file: 'nn-46832cfbead3.nnue', bytes: 47721371 },
    orda: { file: 'orda-ac0af819f3a3.nnue', bytes: 82324379 },
    ordamirror: { file: 'ordamirror-b432a42e3738.nnue', bytes: 82324379 },
    racingkings: { file: 'racingkings-636b95f085e3.nnue', bytes: 47721376 },
    seirawan: { file: 'seirawan-432c65fe71fc.nnue', bytes: 80161691 },
    shako: { file: 'shako-132828f9a311.nnue', bytes: 158542240 },
    shatranj: { file: 'shatranj-2859a2411c29.nnue', bytes: 47721376 },
    shinobi: { file: 'shinobi-5136c71b83bf.nnue', bytes: 123415451 },
    shinobiplus: { file: 'shinobiplus-3f956bad5d14.nnue', bytes: 134228896 },
    shogi: { file: 'shogi-878ca61334a7.nnue', bytes: 159495803 },
    shogun: { file: 'shogun-52c778c11e79.nnue', bytes: 112602011 },
    shouse: { file: 'shouse-a9ca0fc73863.nnue', bytes: 80161691 },
    sittuyin: { file: 'sittuyin-04ade227fe43.nnue', bytes: 47721371 },
    spartan: { file: 'spartan-9dc484a393db.nnue', bytes: 1629088 },
    synochess: { file: 'synochess-33c625f8ad3e.nnue', bytes: 112602016 },
    torishogi: { file: 'torishogi-436578ceef5b.nnue', bytes: 54835643 },
    xiangfu: { file: 'xiangfu-7afc0398f659.nnue', bytes: 1814944 },
    xiangqi: { file: 'xiangqi-c07e94a5c7cb.nnue', bytes: 11261932 },
} as const;

export type NnueNetworkId = keyof typeof OFFICIAL_NNUE_NETWORKS;

export interface OfficialNnueNetwork {
    readonly id: NnueNetworkId;
    readonly file: string;
    readonly bytes: number;
    readonly archiveUrl: string;
}

// Compatibility aliases are taken from Fairy-Stockfish's official NNUE
// catalogue. embassyhouse/gothhouse are PyChess' house counterparts of
// the capablanca -> embassy castling compatibility path.
const NNUE_ENGINE_VARIANT_ALIASES: Readonly<Partial<Record<string, NnueNetworkId>>> = {
    '5check': '3check',
    cambodian: 'makruk',
    caparandom: 'capablanca',
    chess: 'nn',
    chessgi: 'crazyhouse',
    embassy: 'capablanca',
    embassyhouse: 'capahouse',
    fischerandom: 'nn',
    giveaway: 'antichess',
    gothic: 'capablanca',
    gothhouse: 'capahouse',
    janggicasual: 'janggi',
    janggimodern: 'janggi',
    janggitraditional: 'janggi',
    loop: 'crazyhouse',
    nocheckatomic: 'atomic',
    normal: 'nn',
    placement: 'nn',
    suicide: 'antichess',
};

export function nnueNetworkIdForEngineVariant(engineVariant: string): NnueNetworkId | undefined {
    if (Object.prototype.hasOwnProperty.call(OFFICIAL_NNUE_NETWORKS, engineVariant)) {
        return engineVariant as NnueNetworkId;
    }
    return NNUE_ENGINE_VARIANT_ALIASES[engineVariant];
}

export function officialNnueNetwork(engineVariant: string): OfficialNnueNetwork | undefined {
    const id = nnueNetworkIdForEngineVariant(engineVariant);
    if (!id) return undefined;

    const network = OFFICIAL_NNUE_NETWORKS[id];
    return {
        id,
        file: network.file,
        bytes: network.bytes,
        archiveUrl: `${OFFICIAL_NNUE_ARCHIVE_BASE_URL}/${network.file}`,
    };
}
