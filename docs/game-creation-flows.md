# PyChess game creation flows

This document describes how **live playable games** are created in the current PyChess codebase, which client/server files participate, which HTTP routes are rendered, and which WebSocket, SSE, or HTTP messages move the browser from game setup to the round board.

It replaces the earlier compact table with diagrams covering:

- open lobby seeks;
- direct human challenges;
- built-in AI games;
- external BOT challenges;
- friend invitation links;
- tournament-director hosted games;
- automatic pairing;
- rematches;
- tournament and simul pairings;
- the shared `Seek -> Game -> round` pipeline.

> Scope: live games created by the uploaded source snapshot. PGN import also creates a database game document, but it creates a finished/imported record rather than a live matchmaking game and is therefore listed separately near the end.

## 1. Terminology and transport legend

| Term | Meaning in this document |
|---|---|
| **Lobby websocket** | `/wsl`, handled by `server/wsl.py`; used by `client/lobby.ts`. |
| **Round websocket** | `/wsr/{gameId}`, handled by `server/wsr.py`; used by `client/roundCtrl.ts`. |
| **Tournament websocket** | `/wst`, used for tournament updates and new-game redirects. |
| **Simul websocket** | `/wss`, used for simul updates and new-game redirects. |
| **Challenge SSE** | `/challenge/subscribe`, handled by `server/header_challenges.py`. |
| **Invite SSE** | `/api/invites/{gameId}` and `/api/bot-challenges/{gameId}`, both handled by `subscribe_invites()` in `server/game_api.py`. |
| **Seek** | A pending game specification and one or two partially assigned seats, represented by `Seek` in `server/seek.py`. |
| **Reserved game ID** | An eight-character game ID allocated before the game exists. Friend invites, hosted games, and BOT challenges use it as the public waiting-page ID and later as the actual game ID. |

```mermaid
flowchart LR
    Browser["Browser UI"]

    subgraph Realtime["Realtime transports"]
        WSL["WebSocket /wsl"]
        WSR["WebSocket /wsr/{gameId}"]
        WST["WebSocket /wst"]
        WSS["WebSocket /wss"]
        ChallengeSSE["SSE /challenge/subscribe"]
        InviteSSE["SSE /api/invites/{gameId}<br/>or /api/bot-challenges/{gameId}"]
    end

    subgraph HTTP["HTTP navigation/actions"]
        LobbyPage["GET /, /seek/{variant},<br/>/@/{profile}/challenge"]
        ChallengePage["GET /challenge/{seekId}"]
        InvitePage["GET /invite/{gameId}"]
        BotPage["GET /bot-challenge/{gameId}"]
        RoundPage["GET /{gameId}"]
        ChallengeActions["POST /api/challenge/seek/{seekId}/{action}"]
        InviteAccept["POST /invite/accept/{gameId}"]
        BotActions["POST /api/challenge/{gameId}/{accept|decline}"]
    end

    Browser --> LobbyPage
    Browser <--> WSL
    Browser --> ChallengePage
    Browser <--> ChallengeSSE
    Browser --> ChallengeActions
    Browser --> InvitePage
    Browser <--> InviteSSE
    Browser --> InviteAccept
    Browser --> BotPage
    Browser --> BotActions
    Browser --> RoundPage
    Browser <--> WSR
    Browser <--> WST
    Browser <--> WSS
```

## 2. High-level game creation architecture

Most interactive creation methods converge on `join_seek()` and `new_game()` in `server/utils.py`. Tournament and simul pairings are the main exceptions: they construct `Game` directly.

```mermaid
flowchart TD
    subgraph BrowserEntrypoints["Browser entry points"]
        LobbyUI["client/lobby.ts"]
        DirectUI["client/directChallenge.ts<br/>client/challengeView.ts"]
        InviteUI["client/invite.ts"]
        BotUI["client/botChallenge.ts"]
        RoundUI["client/roundCtrl.ts"]
        TourUI["client/tournament.ts<br/>client/tournamentRR.ts"]
        SimulUI["client/simul/simul.ts"]
    end

    subgraph ServerCoordination["Server coordination"]
        WSLHandlers["server/wsl.py"]
        ChallengeHandlers["server/header_challenges.py"]
        InviteHandler["server/views/invite.py"]
        BotAPI["server/bot_api.py"]
        RoundHandlers["server/wsr.py"]
        AutoPair["server/auto_pair.py"]
        Tournament["server/tournament/tournament.py"]
        Simul["server/simul/simul.py"]
    end

    subgraph SharedCore["Shared seek/game core"]
        SeekCore["server/seek.py<br/>Seek + create_seek()"]
        JoinCore["server/utils.py<br/>join_seek()"]
        NewGameCore["server/utils.py<br/>new_game()"]
        GameObject["server/game.py<br/>Game"]
        RuntimeGames["app_state.games"]
        Database["MongoDB game collection"]
    end

    LobbyUI --> WSLHandlers
    DirectUI --> ChallengeHandlers
    InviteUI --> InviteHandler
    BotUI --> BotAPI
    RoundUI --> RoundHandlers
    WSLHandlers --> AutoPair

    WSLHandlers --> SeekCore
    ChallengeHandlers --> JoinCore
    InviteHandler --> JoinCore
    BotAPI --> NewGameCore
    RoundHandlers --> JoinCore
    AutoPair --> JoinCore

    SeekCore --> JoinCore
    JoinCore --> NewGameCore
    NewGameCore --> GameObject
    GameObject --> RuntimeGames
    NewGameCore --> Database

    TourUI --> Tournament
    SimulUI --> Simul
    Tournament --> GameObject
    Simul --> GameObject
```

## 3. Creation-method overview

```mermaid
flowchart LR
    Start(["User or scheduler requests a game"])

    Start --> OpenSeek["Open lobby seek"]
    Start --> Direct["Direct human challenge"]
    Start --> AI["Built-in AI"]
    Start --> Bot["External BOT challenge"]
    Start --> Friend["Friend invite link"]
    Start --> Host["Host game for two others"]
    Start --> Auto["Auto pairing"]
    Start --> Rematch["Rematch"]
    Start --> Tour["Tournament pairing"]
    Start --> Simul["Simul start"]

    OpenSeek --> SeekPipeline["Seek + join_seek()"]
    Direct --> SeekPipeline
    AI --> SeekPipeline
    Friend --> SeekPipeline
    Host --> SeekPipeline
    Auto --> SeekPipeline
    Rematch --> SeekPipeline

    Bot --> ReservedGamePipeline["Reserved Seek + new_game(gameId)"]
    ReservedGamePipeline --> Game["Game"]
    SeekPipeline --> Game

    Tour --> DirectGame["Direct Game(...) construction"]
    Simul --> DirectGame
    DirectGame --> Game

    Game --> NewGameSignal["new_game / redirect signal"]
    NewGameSignal --> Round["GET /{gameId}<br/>then WS /wsr/{gameId}"]
```

### Entry-point and completion matrix

| Creation method | Initial browser route/UI | Creation request | Waiting/state channel | Operation that actually completes the game | Redirect signal |
|---|---|---|---|---|---|
| Open lobby seek | `/`, `/seek/{variant}`, `client/lobby.ts` | WS `create_seek` | WS `get_seeks` | WS `accept_seek` -> `join_seek()` | WS `new_game` to both players |
| Direct human challenge | `/@/{profileId}/challenge`, lobby dialog | WS `create_seek` with `target=<username>` | Challenge SSE + `/challenges` | HTTP POST `.../{seekId}/accept` or lobby WS `accept_seek` | HTTP `new_game`, challenge SSE `gameId`, or lobby WS `new_game`, depending on acceptance path/connectivity |
| Built-in AI | Lobby dialog / `?ai`, `client/lobby.ts` | WS `create_ai_challenge` | None; immediate | Server creates a temporary `Seek`, then bot immediately `join_seek()` | WS `new_game` |
| External BOT | `/@/{bot}/challenge`, lobby dialog | WS `create_bot_challenge` | Bot event stream + browser invite SSE | BOT POST `/api/challenge/{gameId}/accept` -> `new_game(..., gameId)` | Browser invite SSE `{accept:true}`; BOT receives game-start event |
| Friend invite | Lobby “Play with a friend” | WS `create_invite` | Invite page + invite SSE | Visitor POST `/invite/accept/{gameId}` -> `join_seek(..., gameId)` | Invite SSE causes both pages to reload `/invite/{gameId}`, which now renders round view |
| Host game | Tournament-director “Host a game for others” | WS `create_host` | Invite page + invite SSE | First visitor fills one seat; second visitor triggers `new_game(..., gameId)` | Invite SSE reloads all waiting pages |
| Auto pairing | Lobby auto-pair controls | WS `create_auto_pairing` | In-memory pairing pools | `auto_pair()` builds/reuses a `Seek`, then `join_seek()` | WS `new_game` to both lobby socket sets |
| Rematch | Existing round page | Round WS `rematch` | Existing game/round messaging | Second offer, or immediate BOT rematch, creates a `Seek` and calls `join_seek()` | Round WS `new_game` / `view_rematch` |
| Tournament | Tournament scheduler | Internal method call | Tournament websocket `/wst` | `Tournament.create_games()` constructs `Game` directly | Tournament WS `new_game` |
| Simul | Host starts simul | Simul WS action/internal call | Simul websocket `/wss` | `Simul.create_games()` constructs one `Game` per opponent | Simul WS `new_game` |

## 4. Shared runtime state

The same `Seek` object is indexed in different runtime dictionaries depending on the creation method.

```mermaid
flowchart TB
    User["User"]
    Seek["Seek object<br/>server/seek.py"]
    Game["Game object<br/>server/game.py"]

    UserSeeks["user.seeks<br/>key: seekId"]
    GlobalSeeks["app_state.seeks<br/>key: seekId"]
    Invites["app_state.invites<br/>key: reserved gameId"]
    Games["app_state.games<br/>key: gameId"]

    LobbySockets["user.lobby_sockets"]
    ChallengeChannels["user.challenge_channels<br/>SSE queues"]
    InviteChannels["app_state.invite_channels[gameId]<br/>SSE queues"]
    BotQueues["BOT event_queue + game_queues"]

    User --> UserSeeks
    UserSeeks --> Seek
    GlobalSeeks --> Seek
    Invites --> Seek
    Seek -->|"two seats assigned"| Game
    Games --> Game

    User --> LobbySockets
    User --> ChallengeChannels
    Invites --> InviteChannels
    Seek -->|"BOT challenge"| BotQueues
```

Rules of thumb:

- Every normal pending seek is stored in `app_state.seeks` and in the creator's `user.seeks`.
- Friend invites, host games, and external BOT challenges additionally reserve a `gameId` and store `app_state.invites[gameId] = seek`.
- `new_game()` removes the reserved invite entry when called with that `gameId`.
- A successfully created live game is stored in `app_state.games[gameId]` and normally inserted into MongoDB by `insert_game_to_db()`.
- Direct challenges retain their `Seek` long enough to expose the terminal `accepted` state; ordinary seeks are removed when the game is created.

## 5. Open lobby seek

### Files involved

- HTTP page: `server/views/lobby.py`
- Client controller: `client/lobby.ts`
- Lobby websocket route: `/wsl` in `server/routes.py`
- Lobby websocket handlers: `server/wsl.py`
- Seek model/creation/filtering: `server/seek.py`
- Per-user seek broadcasting: `server/lobby.py`
- Game construction: `server/utils.py`

```mermaid
sequenceDiagram
    autonumber
    actor A as Player A browser
    participant AC as client/lobby.ts (A)
    participant WSL as server/wsl.py
    participant Seek as server/seek.py
    participant Lobby as server/lobby.py
    participant BC as client/lobby.ts (B)
    actor B as Player B browser
    participant Utils as server/utils.py
    participant DB as MongoDB

    A->>AC: Open lobby and submit “Create a game”
    AC->>WSL: WS create_seek
    WSL->>Seek: create_seek(..., target="")
    Seek-->>WSL: Seek stored in app_state.seeks + creator.seeks
    WSL->>Lobby: lobby_broadcast_seeks()
    Lobby-->>AC: WS get_seeks (creator-specific filtered list)
    Lobby-->>BC: WS get_seeks (viewer-specific filtered list)

    B->>BC: Click Player A's seek
    BC->>WSL: WS accept_seek {seekID}
    WSL->>Utils: join_seek(Player B, seek)
    Utils->>Utils: Assign second seat
    Utils->>Utils: new_game(app_state, seek)
    Utils->>DB: insert_game_to_db(game)
    Utils-->>WSL: new_game {gameId, wplayer, bplayer}
    WSL-->>BC: WS new_game
    WSL-->>AC: WS new_game
    WSL->>Lobby: lobby_broadcast_seeks()
    Lobby-->>AC: WS get_seeks without accepted seek
    Lobby-->>BC: WS get_seeks without accepted seek
    AC->>A: window.location.assign('/' + gameId)
    BC->>B: window.location.assign('/' + gameId)
```

### Important branch: two-board seeks

`handle_accept_seek()` checks `get_server_variant(...).two_boards`. Two-board variants branch into `server/bug/utils_bug.py` rather than the ordinary `join_seek()` path. Targeted friend invites and direct challenges are rejected for two-board variants because those flows model only one or two seats.

## 6. Direct human challenge

A direct challenge begins in the lobby dialog but, after creation, uses a dedicated challenge page and a shared site-wide challenge panel. This is a **hybrid WebSocket + HTTP + SSE flow**.

### Files involved

- Entry route: `/@/{profileId}/challenge` -> `server/views/lobby.py`
- Creation UI: `client/lobby.ts`
- Creation handler: `server/wsl.py::handle_create_seek()`
- Challenge waiting page: `server/views/direct_challenge.py`, `client/directChallenge.ts`
- Global challenge panel: `client/challengeView.ts`
- Challenge REST/SSE: `server/header_challenges.py`
- Routes: `server/routes.py`

```mermaid
sequenceDiagram
    autonumber
    actor C as Challenger browser
    participant CL as client/lobby.ts
    participant WSL as server/wsl.py
    participant Seek as server/seek.py
    participant Challenge as server/header_challenges.py
    participant CP as client/directChallenge.ts
    actor O as Opponent browser
    participant OP as client/challengeView.ts or directChallenge.ts
    participant Utils as server/utils.py

    C->>CL: GET /@/{opponent}/challenge and submit dialog
    CL->>WSL: WS create_seek with target={opponent}
    WSL->>Seek: create_seek(...)
    Note over Seek: target is a username, so Seek.is_direct_challenge is true
    Seek-->>WSL: direct-challenge Seek
    WSL->>Challenge: broadcast_challenge_state(challenger, opponent)
    WSL-->>CL: WS direct_challenge_created {seekId}
    CL->>C: Redirect /challenge/{seekId}

    C->>CP: Render dedicated challenge page
    CP->>Challenge: GET /challenges
    CP->>Challenge: EventSource /challenge/subscribe
    O->>OP: Site-wide challenge panel or /challenge/{seekId}
    OP->>Challenge: GET /challenges
    OP->>Challenge: EventSource /challenge/subscribe
    Challenge-->>CP: SSE challenge envelope
    Challenge-->>OP: SSE challenge envelope

    O->>OP: Accept
    OP->>Challenge: POST /api/challenge/seek/{seekId}/accept
    Challenge->>Utils: join_seek(opponent, seek)
    Utils->>Utils: new_game(...)
    Utils-->>Challenge: new_game {gameId}
    Challenge-->>OP: HTTP JSON new_game
    Challenge-->>CP: SSE envelope, optionally with gameId
    OP->>O: Redirect /{gameId}
    CP->>C: Redirect /{gameId} when envelope carries gameId
```

### Direct-challenge status lifecycle

```mermaid
stateDiagram-v2
    [*] --> created: create_seek(target=username)
    created --> offline: challenger disconnects and grace period expires
    offline --> created: challenger reconnects
    created --> accepted: opponent accepts
    offline --> accepted: opponent accepts
    created --> declined: opponent declines
    offline --> declined: opponent declines
    created --> canceled: challenger cancels or replaces challenge
    offline --> canceled: challenger cancels
    created --> expired: time limit reached
    offline --> expired: time limit reached
    accepted --> [*]
    declined --> [*]
    canceled --> [*]
    expired --> [*]
```

### Redirect delivery detail

There are two acceptance paths:

1. **HTTP challenge action** from `client/challengeView.ts` or `client/directChallenge.ts`: the acceptor receives the `new_game` object directly as the POST response. The challenger is updated through challenge SSE; `gameId` is attached to the challenger envelope when there is no active lobby websocket.
2. **Lobby seek click** from `client/lobby.ts`: `accept_seek` is sent on `/wsl`, and `server/wsl.py` sends `new_game` through lobby websockets and also broadcasts the challenge state.

## 7. Built-in AI game

The built-in AI path does not publish a waiting seek. The server creates a temporary `Seek`, immediately joins the chosen engine, and returns `new_game` on the same lobby websocket.

### Files involved

- Client: `client/lobby.ts::createAIChallengeMsg()`
- Handler: `server/wsl.py::handle_create_ai_challenge()`
- Seat assignment/game construction: `server/utils.py`
- BOT start notification: `send_bot_game_start_unless_streaming()`

```mermaid
sequenceDiagram
    autonumber
    actor P as Player browser
    participant L as client/lobby.ts
    participant WSL as server/wsl.py
    participant Users as app_state.users
    participant Utils as server/utils.py
    participant Engine as Fairy-Stockfish or Random-Mover

    P->>L: Submit “Play with AI”
    L->>WSL: WS create_ai_challenge
    WSL->>Users: Resolve requested engine
    alt Unsupported AI variant, random mover requested, or engine offline
        WSL->>Users: Select Random-Mover
    else Engine available
        WSL->>Users: Use requested engine
    end
    WSL->>WSL: Construct temporary Seek with player1=human
    WSL->>Utils: join_seek(engine, seek)
    Utils->>Utils: Assign engine seat and call new_game()
    Utils-->>WSL: new_game {gameId}
    WSL-->>L: WS new_game
    WSL->>Engine: Queue/send BOT game-start event
    L->>P: Redirect /{gameId}
```

## 8. External BOT challenge

This flow is different from built-in AI:

- the browser creates a reserved challenge;
- the BOT receives a challenge event through the BOT API stream;
- the BOT explicitly accepts or declines through HTTP;
- the human waits on `/bot-challenge/{gameId}` and receives the decision through SSE.

### Files involved

- Creation client: `client/lobby.ts`
- Creation handler: `server/wsl.py::handle_create_bot_challenge()`
- BOT event serialization: `server/seek.py::challenge()`
- Human waiting page: `server/views/bot_challenge.py`, `client/botChallenge.ts`
- BOT accept/decline: `server/bot_api.py`
- SSE queues: `server/game_api.py::subscribe_invites()`

```mermaid
sequenceDiagram
    autonumber
    actor H as Human browser
    participant L as client/lobby.ts
    participant WSL as server/wsl.py
    participant Seek as server/seek.py
    participant BotStream as BOT event stream
    actor B as External BOT
    participant BotAPI as server/bot_api.py
    participant Page as client/botChallenge.ts
    participant SSE as server/game_api.py invite SSE
    participant Utils as server/utils.py

    H->>L: Submit challenge to BOT profile
    L->>WSL: WS create_bot_challenge
    WSL->>Seek: create_seek(target="BOT_challenge", engine=BOT)
    Note over Seek: Reserve gameId; player1=human; player2=BOT;<br/>store app_state.invites[gameId]=seek
    WSL->>BotStream: Queue challenge event
    WSL-->>L: WS bot_challenge_created {gameId}
    L->>H: Redirect /bot-challenge/{gameId}
    H->>Page: Render waiting page
    Page->>SSE: EventSource /api/bot-challenges/{gameId}

    alt BOT accepts
        B->>BotAPI: POST /api/challenge/{gameId}/accept
        BotAPI->>Utils: new_game(app_state, seek, gameId)
        Utils-->>BotAPI: new_game
        BotAPI-->>SSE: {gameId, accept:true}
        BotAPI-->>B: HTTP {ok:true} + BOT game-start stream event
        SSE-->>Page: accepted event
        Page->>H: Redirect /{gameId}
    else BOT declines
        B->>BotAPI: POST /api/challenge/{gameId}/decline
        BotAPI->>Seek: Set decline reason/status
        BotAPI-->>SSE: {gameId, accept:false, declineReason}
        SSE-->>Page: declined event
        Page->>H: Render decline reason
    end
```

## 9. Friend invite link

A normal friend invite reserves the final game ID before the second player arrives. The creator already occupies one seat.

### Files involved

- Creation: `client/lobby.ts`, `server/wsl.py::handle_create_invite()`
- Reserved seek: `server/seek.py::create_seek()`
- Waiting/acceptance HTTP view: `server/views/invite.py`
- Waiting client/SSE: `client/invite.ts`, `server/game_api.py::subscribe_invites()`

```mermaid
sequenceDiagram
    autonumber
    actor C as Creator browser
    participant L as client/lobby.ts
    participant WSL as server/wsl.py
    participant Seek as server/seek.py
    participant InvitePage as server/views/invite.py
    participant InviteClient as client/invite.ts
    participant SSE as server/game_api.py
    actor F as Friend browser
    participant Utils as server/utils.py

    C->>L: Submit “Play with a friend”
    L->>WSL: WS create_invite
    WSL->>Seek: create_seek(target="Invite-friend")
    Note over Seek: Reserve gameId; player1=creator;<br/>app_state.invites[gameId]=seek
    WSL-->>L: WS invite_created {gameId}
    L->>C: Redirect /invite/{gameId}
    C->>InvitePage: GET /invite/{gameId}
    InvitePage-->>InviteClient: Render creator waiting view + share URL
    InviteClient->>SSE: EventSource /api/invites/{gameId}

    C-->>F: Share /invite/{gameId}
    F->>InvitePage: GET /invite/{gameId}
    InvitePage-->>F: Render JOIN THE GAME
    F->>InvitePage: POST /invite/accept/{gameId}
    InvitePage->>Utils: join_seek(friend, seek, gameId)
    Utils->>Utils: Second seat filled; new_game(..., gameId)
    Utils-->>InvitePage: new_game
    InvitePage-->>SSE: Queue {gameId, accept:true}
    SSE-->>InviteClient: Event for creator
    SSE-->>F: Event for friend page, if still subscribed
    InviteClient->>C: Reload /invite/{gameId}
    InvitePage-->>F: POST response renders view="round"
    Note over InvitePage: gameId now exists in app_state.games,<br/>so invite() loads the game and supplies round context
```

## 10. Tournament-director hosted game

A hosted game uses the same invite page and reserved-ID machinery, but the creator deliberately occupies **no seat**. The first two visitors become the players.

```mermaid
sequenceDiagram
    autonumber
    actor D as Tournament director
    participant L as client/lobby.ts
    participant WSL as server/wsl.py
    participant Seek as server/seek.py
    participant P1 as First visitor
    participant P2 as Second visitor
    participant Invite as server/views/invite.py
    participant Utils as server/utils.py
    participant SSE as Invite SSE

    D->>L: Submit “Host a game for others”
    L->>WSL: WS create_host
    WSL->>Seek: create_seek(..., empty=true)
    Note over Seek: player1=None; player2=None;<br/>reserved gameId in app_state.invites
    WSL-->>L: WS host_created {gameId}
    L->>D: Redirect /invite/{gameId}
    Note over D: Page shows separate player1/player2 invite URLs

    P1->>Invite: POST /invite/accept/{gameId}/player1
    Invite->>Utils: join_seek(P1, join_as="player1")
    Utils-->>Invite: seek_joined
    Invite-->>P1: Waiting for other player

    P2->>Invite: POST /invite/accept/{gameId}/player2
    Invite->>Utils: join_seek(P2, join_as="player2")
    Utils->>Utils: Both seats filled; new_game(..., gameId)
    Utils-->>Invite: new_game
    Invite-->>SSE: {gameId, accept:true}
    SSE-->>D: Reload waiting page
    SSE-->>P1: Reload waiting page
    Note over D,P2: All viewers now reach /invite/{gameId},<br/>which renders the round for the created game
```

## 11. Automatic pairing

Auto pairing can match:

- two compatible users already in auto-pairing pools; or
- one auto-pairing user with an existing compatible normal rated seek.

### Files involved

- Client messages: `client/lobby.ts`
- Message dispatch: `server/wsl.py`
- Pool matching and game creation: `server/auto_pair.py`
- Shared completion: `server/utils.py::join_seek()`

```mermaid
flowchart TD
    Request["WS create_auto_pairing"] --> Add["add_to_auto_pairings()"]
    Add --> Iterate["Iterate allowed variant/time-control combinations"]
    Iterate --> ExistingUser{"Compatible auto-pairing user?"}
    ExistingUser -- Yes --> BuildSeek["Build temporary rated Seek"]
    ExistingUser -- No --> ExistingSeek{"Compatible normal rated seek?"}
    ExistingSeek -- Yes --> ReuseSeek["Reuse matching seek"]
    ExistingSeek -- No --> Wait["Remain in auto-pairing pools"]
    BuildSeek --> AutoPair["auto_pair()"]
    ReuseSeek --> AutoPair
    AutoPair --> RemovePools["Remove both users from auto-pairing pools"]
    RemovePools --> Join["join_seek()"]
    Join --> NewGame["new_game"]
    NewGame --> Notify["WS new_game to both users' lobby sockets"]
```

```mermaid
sequenceDiagram
    autonumber
    actor A as Player A
    actor B as Player B
    participant WSL as server/wsl.py
    participant AP as server/auto_pair.py
    participant Utils as server/utils.py

    A->>WSL: WS create_auto_pairing
    WSL->>AP: add_to_auto_pairings(A, preferences)
    AP-->>WSL: No match yet
    B->>WSL: WS create_auto_pairing
    WSL->>AP: add_to_auto_pairings(B, preferences)
    AP->>AP: find_matching_user() or find_matching_seek()
    AP->>AP: Build/reuse Seek and remove users from pools
    AP->>Utils: join_seek(B, seek)
    Utils-->>AP: new_game {gameId}
    AP-->>A: WS new_game
    AP-->>B: WS new_game
```

## 12. Rematch

Rematches start from an existing round and therefore use `/wsr/{gameId}`, not `/wsl`.

### Files involved

- Client action/receive switch: `client/roundCtrl.ts`
- Round websocket handler: `server/wsr.py::handle_rematch()`
- Shared game creation: `server/utils.py::join_seek()`
- Two-board special case: `server/bug/wsr_bug.py`

```mermaid
sequenceDiagram
    autonumber
    actor A as Player A round page
    actor B as Player B round page
    participant WSR as server/wsr.py
    participant Utils as server/utils.py
    participant Bot as BOT opponent

    alt Human vs human
        A->>WSR: Round WS rematch {gameId, handicap}
        WSR-->>A: rematch_offer
        WSR-->>B: rematch_offer
        B->>WSR: Round WS rematch
        WSR->>WSR: Construct rematch Seek with previous settings
        WSR->>Utils: join_seek(opponent, seek)
        Utils-->>WSR: new_game {gameId}
        WSR-->>A: new_game / view_rematch
        WSR-->>B: new_game / view_rematch
    else Human vs BOT
        A->>WSR: Round WS rematch
        WSR->>WSR: Resolve BOT or Random-Mover fallback
        WSR->>WSR: Construct rematch Seek
        WSR->>Utils: join_seek(BOT, seek)
        Utils-->>WSR: new_game {gameId}
        WSR-->>A: new_game / view_rematch
        WSR->>Bot: Queue BOT game-start event
    end
```

## 13. Tournament and simul creation

These paths deliberately bypass `Seek`, `join_seek()`, and `new_game()`. Their schedulers already know both players and construct `Game` objects directly.

```mermaid
flowchart LR
    subgraph TournamentFlow["Tournament"]
        Pairing["create_pairing_async()"] --> TournamentCreate["Tournament.create_games()"]
        TournamentCreate --> TournamentGame["Game(..., tournamentId=...) "]
        TournamentGame --> TournamentCache["app_state.games[gameId]"]
        TournamentGame --> TournamentDB["insert_game_to_db()"]
        TournamentGame --> TournamentPublish["publish_pairings(): new_game over /wst"]
    end

    subgraph SimulFlow["Simul"]
        SimulStart["Simul.start()"] --> SimulCreate["Simul.create_games()"]
        SimulCreate --> PerOpponent["One Game(...) per opponent<br/>with simulId and initial clocks"]
        PerOpponent --> SimulCache["app_state.games[gameId]"]
        PerOpponent --> SimulDB["insert_game_to_db()"]
        PerOpponent --> SimulPublish["broadcast new_game over /wss"]
    end
```

```mermaid
sequenceDiagram
    autonumber
    participant Scheduler as Tournament scheduler
    participant T as server/tournament/tournament.py
    participant S as server/simul/simul.py
    participant Game as server/game.py
    participant DB as MongoDB
    participant Clients as Tournament/Simul clients

    par Tournament pairing
        Scheduler->>T: create_new_pairings(waiting_players)
        T->>T: create_pairing_async()
        loop Each paired player pair
            T->>Game: Game(..., tournamentId)
            T->>DB: insert_game_to_db()
        end
        T-->>Clients: /wst new_game for each participant
    and Simul start
        Scheduler->>S: start()
        loop Each opponent
            S->>Game: Game(..., simulId, initial_clocks)
            S->>DB: insert_game_to_db()
            S-->>Clients: /wss new_game
        end
    end
```

## 14. The common `join_seek()` / `new_game()` algorithm

This is the central flow used by ordinary lobby games, direct challenges, friend/host invites, auto pairing, AI games, and rematches.

```mermaid
flowchart TD
    JoinStart(["join_seek(app_state, user, seek, game_id?, join_as?)"])
    JoinStart --> TargetedTwoBoard{"Targeted two-board seek?"}
    TargetedTwoBoard -- Yes --> ErrorTwo["error: unsupported targeted two-board flow"]
    TargetedTwoBoard -- No --> Blocked{"Players blocked?"}
    Blocked -- Yes --> ErrorBlocked["error: cannot accept"]
    Blocked -- No --> VariantAccess{"Catalogued variant accessible?"}
    VariantAccess -- No --> ErrorAccess["error: variant unavailable"]
    VariantAccess -- Yes --> Restricted{"Anonymous restriction?"}
    Restricted -- Yes --> ErrorRestricted["error"]
    Restricted -- No --> Expired{"Seek expired?"}
    Expired -- Yes --> CleanupExpired["Remove invite/seek and return error"]
    Expired -- No --> Yourself{"User already occupies a seat?"}
    Yourself -- Yes --> SeekYourself["seek_yourself"]
    Yourself -- No --> Assign["Assign player1/player2 according to join_as"]
    Assign --> Occupied{"Requested seat occupied?"}
    Occupied -- Yes --> SeekOccupied["seek_occupied"]
    Occupied -- No --> Full{"Both seats filled?"}
    Full -- No --> SeekJoined["seek_joined"]
    Full -- Yes --> NewStart(["new_game(app_state, seek, game_id?)"])

    NewStart --> FEN{"Custom FEN?"}
    FEN -- Yes --> Validate["sanitize_fen() + legal-move check"]
    Validate --> Valid{"Valid and playable?"}
    Valid -- No --> RemoveBad["Remove seek and return error"]
    Valid -- Yes --> Colors
    FEN -- No --> Colors["Resolve random/fixed color and wplayer/bplayer"]
    Colors --> Reserved{"Reserved game_id supplied?"}
    Reserved -- Yes --> Consume["Remove app_state.invites[game_id]"]
    Reserved -- No --> Allocate["Allocate new gameId"]
    Consume --> Rating
    Allocate --> Rating["Force casual for catalogued variants/bots;<br/>otherwise apply rated eligibility"]
    Rating --> Construct["Game(..., create=True)"]
    Construct --> Cache["app_state.games[gameId] = game"]
    Cache --> Direct{"Direct challenge?"}
    Direct -- Yes --> Accepted["Set challenge status=accepted"]
    Direct -- No --> RemoveSeek["remove_seek()"]
    Accepted --> Persist
    RemoveSeek --> Persist["insert_game_to_db() when persistence is enabled"]
    Persist --> Corr{"Correspondence?"}
    Corr -- Yes --> CorrLists["Append to both users' correspondence_games"]
    Corr -- No --> Crosstable
    CorrLists --> Crosstable["Load crosstable if applicable"]
    Crosstable --> Response(["new_game {gameId, wplayer, bplayer}"])
```

## 15. Handoff from `new_game` to the round board

Game creation and game play use different connections. After receiving a game ID, the browser navigates to the HTTP round page and then opens a game-specific round websocket.

### Files involved

- Route declaration: `server/routes.py`
- HTTP dispatcher: `server/views/game.py`
- Round context: `server/views/round_view.py`
- Client view dispatch: `client/main.ts`
- Round UI: `client/round.ts`, `client/roundCtrl.ts`
- Round websocket: `server/wsr.py`

```mermaid
sequenceDiagram
    autonumber
    actor B as Browser
    participant Signal as Creating transport<br/>(WS, SSE, or HTTP)
    participant Routes as server/routes.py
    participant GameView as server/views/game.py
    participant RoundView as server/views/round_view.py
    participant Template as templates/index.html
    participant Main as client/main.ts
    participant Round as client/round.ts + roundCtrl.ts
    participant WSR as server/wsr.py

    Signal-->>B: gameId / new_game
    B->>Routes: GET /{gameId}
    Routes->>GameView: game(request)
    GameView->>RoundView: round_view(request)
    RoundView->>RoundView: load_game(app_state, gameId)
    RoundView->>Template: Context with view="round" and game data
    Template-->>B: HTML data attributes + JS bundle
    B->>Main: Initialize model and dispatch data-view="round"
    Main->>Round: roundView(model)
    Round->>WSR: WebSocket /wsr/{gameId}
    WSR-->>Round: board/game state and subsequent round messages
```

## 16. Route map

All route registrations live in `server/routes.py`.

```mermaid
flowchart TB
    Routes["server/routes.py"]

    Routes --> LobbyRoutes["Lobby/setup views<br/>GET /<br/>GET /seek/{variant}<br/>GET /@/{profileId}/challenge<br/>GET /@/{profileId}/play/{variant}"]
    Routes --> WaitingRoutes["Waiting views<br/>GET /challenge/{seekId}<br/>GET /invite/{gameId}<br/>GET /bot-challenge/{gameId}"]
    Routes --> GameRoute["Game view<br/>GET /{gameId}"]

    Routes --> WebSockets["WebSockets<br/>/wsl lobby<br/>/wsr/{gameId} round<br/>/wst tournament<br/>/wss simul"]

    Routes --> ChallengeHTTP["Direct challenge HTTP/SSE<br/>GET /challenges<br/>GET /challenge/subscribe<br/>POST /api/challenge/seek/{seekId}/{accept|decline|cancel}"]

    Routes --> InviteHTTP["Invite HTTP/SSE<br/>POST /invite/accept/{gameId}[/{player}]<br/>POST /invite/cancel/{gameId}<br/>GET /api/invites/{gameId}"]

    Routes --> BotHTTP["BOT challenge HTTP/SSE<br/>POST /api/challenge/{gameId}/{accept|decline}<br/>POST /bot-challenge/cancel/{gameId}<br/>GET /api/bot-challenges/{gameId}"]
```

## 17. WebSocket and SSE message map

```mermaid
flowchart LR
    subgraph LobbyInbound["Browser -> /wsl"]
        I1["create_seek"]
        I2["accept_seek"]
        I3["delete_seek"]
        I4["create_ai_challenge"]
        I5["create_bot_challenge"]
        I6["create_invite"]
        I7["create_host"]
        I8["create_auto_pairing"]
        I9["cancel_auto_pairing"]
    end

    subgraph LobbyOutbound["/wsl -> Browser"]
        O1["get_seeks"]
        O2["new_game"]
        O3["direct_challenge_created"]
        O4["bot_challenge_created"]
        O5["invite_created"]
        O6["host_created"]
        O7["auto_pairing_on/off"]
        O8["error / game_in_progress"]
    end

    subgraph ChallengeSSEMessages["Challenge SSE envelopes"]
        C1["challenges: serialized challenge list"]
        C2["optional gameId for redirect"]
    end

    subgraph InviteSSEMessages["Invite/BOT SSE"]
        S1["{gameId, accept:true}"]
        S2["{gameId, accept:false, declineReason}"]
    end

    subgraph RoundMessages["Round WS /wsr/{gameId}"]
        R1["rematch"]
        R2["rematch_offer"]
        R3["new_game"]
        R4["view_rematch"]
    end
```

## 18. File responsibility map

```mermaid
flowchart TB
    subgraph Client["Client"]
        CLobby["client/lobby.ts<br/>setup dialog, /wsl messages, redirects"]
        CChallenge["client/challengeView.ts<br/>global challenge panel"]
        CDirect["client/directChallenge.ts<br/>dedicated challenge page"]
        CInvite["client/invite.ts<br/>invite/host page + SSE"]
        CBot["client/botChallenge.ts<br/>BOT waiting page + SSE"]
        CRound["client/roundCtrl.ts<br/>round socket + rematches"]
        CMain["client/main.ts<br/>data-view dispatch"]
    end

    subgraph HTTPViews["HTTP views"]
        VLobby["server/views/lobby.py"]
        VDirect["server/views/direct_challenge.py"]
        VInvite["server/views/invite.py"]
        VBot["server/views/bot_challenge.py"]
        VGame["server/views/game.py"]
        VRound["server/views/round_view.py"]
    end

    subgraph Coordination["Realtime/API coordination"]
        SWsl["server/wsl.py<br/>lobby WS dispatch/handlers"]
        SLobby["server/lobby.py<br/>filtered lobby broadcasts"]
        SChallenge["server/header_challenges.py<br/>challenge REST + SSE"]
        SGameAPI["server/game_api.py<br/>invite SSE + cancel"]
        SBotAPI["server/bot_api.py<br/>BOT accept/decline"]
        SWsr["server/wsr.py<br/>round WS + rematches"]
        SAuto["server/auto_pair.py"]
    end

    subgraph Domain["Domain/core"]
        SSeek["server/seek.py<br/>Seek, create_seek, serialization"]
        SUtils["server/utils.py<br/>join_seek, new_game, persistence"]
        SGame["server/game.py<br/>Game runtime model"]
        STypes["server/ws_types.py<br/>message TypedDicts"]
        SRoutes["server/routes.py<br/>route registrations"]
    end

    CLobby --> VLobby
    CLobby --> SWsl
    CChallenge --> SChallenge
    CDirect --> VDirect
    CDirect --> SChallenge
    CInvite --> VInvite
    CInvite --> SGameAPI
    CBot --> VBot
    CBot --> SGameAPI
    CRound --> SWsr
    CMain --> CLobby
    CMain --> CDirect
    CMain --> CInvite
    CMain --> CBot
    CMain --> CRound

    SWsl --> SSeek
    SWsl --> SUtils
    SWsl --> SLobby
    SChallenge --> SUtils
    VInvite --> SUtils
    SBotAPI --> SUtils
    SWsr --> SUtils
    SAuto --> SUtils
    SUtils --> SGame
    SRoutes --> HTTPViews
    SRoutes --> Coordination
    STypes --> SWsl
```

### Practical “where should I look?” table

| Question | Primary file(s) |
|---|---|
| Which setup mode sends which message? | `client/lobby.ts`, especially the `createMode` switch and `create*Msg()` methods |
| Where are `/wsl` messages dispatched? | `server/wsl.py::process_message()` |
| How is a pending seek represented and stored? | `server/seek.py::Seek`, `create_seek()` |
| Why can one user see a seek while another cannot? | `server/seek.py::get_seeks()` and `User.compatible_with_seek()` |
| How are viewer-specific seek lists broadcast? | `server/lobby.py::lobby_broadcast_seeks()` |
| Where are seats assigned? | `server/utils.py::join_seek()` |
| Where is the actual `Game` built? | Usually `server/utils.py::new_game()`; directly in tournament/simul code for those modes |
| Where is the game inserted into MongoDB? | `server/utils.py::insert_game_to_db()` |
| How do direct challenge notifications work? | `server/header_challenges.py`, `client/challengeView.ts` |
| How do invite pages learn that a game started? | `server/game_api.py::subscribe_invites()`, `client/invite.ts` |
| How does an external BOT accept? | `server/bot_api.py::challenge_accept()` |
| How does a new game become a round page? | `server/views/game.py`, `server/views/round_view.py`, `client/main.ts`, `client/roundCtrl.ts` |
| How are rematches created? | `server/wsr.py::handle_rematch()` |
| Where do two-board games diverge? | `server/wsl.py`, `server/bug/utils_bug.py`, `server/bug/wsr_bug.py` |

## 19. Creation result/state summary

```mermaid
stateDiagram-v2
    [*] --> PendingSpecification
    PendingSpecification --> WaitingForOpponent: open seek / direct / invite / BOT / auto-pair
    PendingSpecification --> CreatingImmediately: built-in AI / matched auto-pair / rematch
    PendingSpecification --> CreatingDirectly: tournament / simul

    WaitingForOpponent --> OneSeatFilled: host game first visitor
    OneSeatFilled --> CreatingImmediately: host game second visitor
    WaitingForOpponent --> CreatingImmediately: seek accepted / direct accepted / invite accepted / BOT accepted
    WaitingForOpponent --> TerminalWithoutGame: canceled / declined / expired

    CreatingImmediately --> GameInMemory: Game constructed
    CreatingDirectly --> GameInMemory: Game constructed
    GameInMemory --> Persisted: insert_game_to_db when enabled
    GameInMemory --> RedirectSignaled: new_game / SSE / HTTP redirect
    Persisted --> RedirectSignaled
    RedirectSignaled --> RoundPage: GET /{gameId}
    RoundPage --> RoundConnected: WS /wsr/{gameId}
    RoundConnected --> [*]
    TerminalWithoutGame --> [*]
```

## 20. Non-live game record creation: PGN import

`server/utils.py::import_game()` also constructs a temporary `Game` and inserts a document into MongoDB. It differs from the flows above:

- the record is marked `IMPORTED`;
- `Game(..., create=False)` is used;
- it is not placed into `app_state.games` as a live game;
- no `new_game` realtime message is broadcast;
- the temporary stopwatch is canceled after validation/import.

It should be documented as **game-record import**, not as live matchmaking/game creation.

## 21. Compact end-to-end summary

```mermaid
flowchart LR
    Setup["Setup UI or scheduler"]
    Spec["Seek or direct pairing specification"]
    Seats["Resolve both players/seats"]
    Construct["Construct Game"]
    Store["Cache + optional MongoDB insert"]
    Signal["Deliver gameId"]
    Page["GET /{gameId}"]
    Socket["WS /wsr/{gameId}"]

    Setup --> Spec --> Seats --> Construct --> Store --> Signal --> Page --> Socket

    Note1["Lobby/direct/invite/AI/auto/rematch<br/>normally use Seek + join_seek + new_game"] -.-> Spec
    Note2["Tournament/simul<br/>construct Game directly"] -.-> Construct
    Note3["Friend/host/BOT challenges<br/>reserve gameId before Game exists"] -.-> Spec
```
