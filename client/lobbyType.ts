export interface Stream {
    site: string;
    title: string;
    username: string;
    streamer: string;
}

export interface Spotlight {
    variant: string;
    chess960: boolean;
    nbPlayers: number;
    name: string;
    startsAt: string;
    tid: string;
}

export interface MsgInviteCreated {
	gameId: string;
}

export interface MsgHostCreated {
	gameId: string;
}

export interface MsgGetSeeks {
	seeks: Seek[]
}

export interface MsgNewGame {
	gameId: string;
}

export interface MsgGameInProgress {
	gameId: string;
}

export interface MsgUserConnected {
	username: string;
}

export interface MsgPing {
	timestamp: string;//TODO: not sure string or number or other - can't find anywhere where this is actually read and not just copied to "pong", where again not read anywhere in python or ts
}

export interface MsgError {
	message: string;
}

export interface MsgShutdown {
	message: string;
}

export interface MsgGameCounter {
	cnt: number;
}
export interface MsgUserCounter {
    cnt: number;
}
export interface MsgStreams {
	items: Stream[];
}

export interface MsgSpotlights {
	items: Spotlight[];
}

export interface Seek {
    user: string;
    variant: string;
    color: string;
    fen: string;
    base: number;
    inc: number;
    byoyomi: number;
    chess960: boolean;
    rated: boolean;
    alternateStart: string;

    bot: boolean;
    rating: number;

    seekID: string;

    target: string;
    title: string;
}

export type CreateMode = 'createGame' | 'playFriend' | 'playAI' | 'createHost';
