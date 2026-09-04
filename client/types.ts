import { FairyStockfish } from 'ffish-es6';
import { CrossTable, MsgBoard } from './messages';

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue };
export type JSONArray = JSONValue[];

export type BugBoardName = 'a' | 'b';
export type BoardName = '' | BugBoardName;

export interface SimulPlayer {
    name: string;
    rating: number;
    title: string;
}

export interface SimulGame {
    gameId: string;
    wplayer: string;
    bplayer: string;
    variant: string;
    fen: string;
    rated: boolean;
    base: number;
    inc: number;
    byo: number;
    status: number;
    result: string;
}

export type StudyChapterPreview = {
    id: string;
    name: string;
    order: number;
};

export type StudyPageModel = {
    id: string;
    name: string;
    chapter: {
        id: string;
        name: string;
        revision: number;
        orientation: 'white' | 'black';
        tree: import('./study/studyTree').StudyTreeDto;
    };
    chapters: StudyChapterPreview[];
};

export type PyChessModel = {
    ffish: FairyStockfish;
    username: string;
    admin: boolean;
    home: string;
    anon: string;
    profileid: string;
    profileRestricted: boolean;
    title: string;
    variant: string;
    chess960: string;
    rated: string;
    corr: string;
    level: number;
    gameId: string;
    gameCategory: string;
    tournamentId: string;
    tournamentname: string;
    simulname: string;
    tournamentcreator: string;
    tournamentmanager: boolean;
    tournamentteamid: string;
    tournamentteamname: string;
    inviter: string;
    botChallengeStatus: string;
    botChallengeDeclineReason: string;
    botChallengeOpponent: string;
    botSupportedVariants: string[] | null;
    challengeId: string;
    ply: number;
    ct: CrossTable | string;
    board: MsgBoard | string;
    wplayer: string;
    wtitle: string;
    wpatron: boolean;
    wrating: string; // string, because can contain "?" suffix for provisional rating
    wrdiff: number;
    wberserk: string;
    bplayer: string;
    btitle: string;
    bpatron: boolean;
    brating: string; // string, because can contain "?" suffix for provisional rating
    brdiff: number;
    bberserk: string;
    fen: string;
    posnum: number;
    initialFen: string;
    base: number;
    inc: number;
    byo: number;
    result: string;
    status: number;
    tsystem: number;
    rounds: number;
    date: string;
    tv: boolean;
    embed: boolean;
    seekEmpty: boolean;
    tournamentDirector: boolean;
    assetURL: string;
    nnueDownloadRoot: string;
    puzzle: string;
    study: StudyPageModel | null;

    wplayerB: string;
    wtitleB: string;
    wpatronB: boolean;
    wratingB: string; // string, because can contain "?" suffix for provisional rating
    bplayerB: string;
    btitleB: string;
    bpatronB: boolean;
    bratingB: string; // string, because can contain "?" suffix for provisional rating

    blogs: string;
    timeline: string;
    corrGames: string;
    simulGames: string;
    simulHost: boolean;
    oauthUsernameSelection: {
        oauth_id: string;
        oauth_provider: string;
        oauth_username: string;
    } | null;
    pushVapidKey: string;
    pushEnabled: boolean;

    // Simul-specific properties
    simulId?: string;
    players?: SimulPlayer[];
    pendingPlayers?: SimulPlayer[];
    createdBy?: string;
    name?: string;
};
