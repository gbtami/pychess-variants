import { CrossTable, MsgBoard } from './messages';

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue };
export type JSONArray = JSONValue[];

export type PyChessModel = {
    username: string;
    home: string;
    anon: string;
    profileid: string;
    title: string;
    variant: string;
    chess960: string;
    rated: string;
    corr: string;
    level: number;
    gameId: string;
    tournamentId: string;
    tournamentname: string;
    inviter: string;
    ply: number;
    ct: CrossTable | string;
    board: MsgBoard | string;
    wplayer: string;
    wtitle: string;
    wrating: string; // string, because can contain "?" suffix for provisional rating
    wrdiff: number;
    wberserk: string;
    bplayer: string;
    btitle: string;
    brating: string; // string, because can contain "?" suffix for provisional rating
    brdiff: number;
    bberserk: string;
    fen: string;
    base: number;
    inc: number;
    byo: number;
    result: string;
    status: number;
    date: string;
    tv: boolean;
    embed: boolean;
    seekEmpty: boolean;
    tournamentDirector: boolean;
    assetURL: string;
    puzzle: string;

    wplayerB: string;
    wtitleB: string;
    wratingB: string; // string, because can contain "?" suffix for provisional rating
    wrdiffB: number;
    bplayerB: string;
    btitleB: string;
    bratingB: string; // string, because can contain "?" suffix for provisional rating
    brdiffB: number;

    blogs: string;
    corrGames: string;
};
