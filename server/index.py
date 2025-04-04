from __future__ import annotations

import asyncio
import json
import os.path
from datetime import datetime

import aiohttp_session
from aiohttp import web
import minify_html

from const import (
    ANON_PREFIX,
    DARK_FEN,
    DASH,
    LANGUAGES,
    NONE_USER,
    TROPHIES,
    VARIANT_GROUPS,
    RATED,
    IMPORTED,
    T_CREATED,
    TRANSLATED_PAIRING_SYSTEM_NAMES,
)
from fairy import FairyBoard, BLACK, WHITE
from glicko2.glicko2 import PROVISIONAL_PHI
from robots import ROBOTS_TXT
from settings import (
    ADMINS,
    TOURNAMENT_DIRECTORS,
    URI,
    STATIC_ROOT,
    BR_EXTENSION,
    SOURCE_VERSION,
    DEV,
)
from misc import time_control_str
from blogs import BLOG_TAGS
from videos import VIDEO_TAGS, VIDEO_TARGETS
from user import User
from utils import corr_games, get_blogs, load_game, join_seek, tv_game, tv_game_user
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import (
    get_winners,
    get_latest_tournaments,
    load_tournament,
    create_or_update_tournament,
    get_tournament_name,
)
from puzzle import (
    get_puzzle,
    next_puzzle,
    get_daily_puzzle,
    default_puzzle_perf,
)
from custom_trophy_owners import CUSTOM_TROPHY_OWNERS
from logger import log
from variants import ALL_VARIANTS, VARIANTS, VARIANT_ICONS, RATED_VARIANTS, NOT_RATED_VARIANTS


async def index(request):
    """Create home html."""
    app_state = get_app_state(request.app)

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    session["last_visit"] = datetime.now().isoformat()
    if session_user is not None:
        log.info("+++ Existing user %s connected.", session_user)
        doc = None
        try:
            doc = await app_state.db.user.find_one({"_id": session_user})
        except Exception:
            log.error(
                "index() app_state.db.user.find_one Exception. Failed to get user %s from mongodb!",
                session_user,
            )
        if doc is not None:
            if not doc.get("enabled", True):
                log.info("Closed account %s tried to connect.", session_user)
                session.invalidate()
                return web.HTTPFound("/")

        if session_user in app_state.users:
            user = app_state.users[session_user]
        else:
            if session_user.startswith(ANON_PREFIX):
                session.invalidate()
                return web.HTTPFound(request.rel_url)

            user = await app_state.users.get(session_user)

            if not user.enabled:
                session.invalidate()
                return web.HTTPFound("/")
    else:
        if app_state.disable_new_anons:
            session.invalidate()
            await asyncio.sleep(3)
            return web.HTTPFound("/login")

        user = User(app_state, anon=not app_state.anon_as_test_users)
        log.info("+++ New anon user %s connected.", user.username)
        app_state.users[user.username] = user
        session["user_name"] = user.username
        await asyncio.sleep(3)

    lang = session.get("lang") if user.lang is None else user.lang
    if lang is None:
        lang = detect_locale(request)

    get_template = app_state.jinja[lang].get_template

    lang_translation = app_state.gettext[lang]
    lang_translation.install()

    def variant_display_name(variant):
        return lang_translation.gettext(ALL_VARIANTS[variant].translated_name)

    def pairing_system_name(system):
        return lang_translation.gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system])

    def video_tag(tag):
        return lang_translation.gettext(VIDEO_TAGS.get(tag, tag))

    def blog_tag(tag):
        return lang_translation.gettext(BLOG_TAGS.get(tag, tag))

    def video_target(target):
        return lang_translation.gettext(VIDEO_TARGETS[target])

    view = "lobby"
    gameId = request.match_info.get("gameId")
    ply = request.rel_url.query.get("ply")

    tournamentId = request.match_info.get("tournamentId")
    if request.path == "/about":
        view = "about"
    elif request.path == "/faq":
        view = "faq"
    elif request.path == "/stats":
        if user.anon:
            return web.HTTPFound("/")
        view = "stats"
    elif request.path.startswith("/blogs"):
        blogId = request.match_info.get("blogId")
        view = "blogs" if blogId is None else "blog"
    elif request.path.startswith("/variants"):
        view = "variants"
    elif request.path.startswith("/video"):
        videoId = request.match_info.get("videoId")
        view = "videos" if videoId is None else "video"
    elif request.path.startswith("/memory"):
        view = "memory"
    elif request.path.startswith("/players"):
        if user.anon:
            return web.HTTPFound("/")
        view = "players"
    elif request.path == "/allplayers":
        if user.anon:
            return web.HTTPFound("/")
        view = "allplayers"
    elif request.path.startswith("/games"):
        view = "games"
    elif request.path == "/patron":
        view = "patron"
    elif request.path == "/patron/thanks":
        view = "thanks"
    elif request.path == "/features":
        view = "features"
    elif request.path == "/level8win":
        if user.anon:
            return web.HTTPFound("/")
        view = "level8win"
    elif request.path == "/tv":
        view = "tv"
        gameId = await tv_game(app_state)
    elif request.path.startswith("/editor"):
        view = "editor"
    elif request.path.startswith("/analysis") or request.path.startswith("/corr"):
        view = "analysis"
    elif request.path.startswith("/embed"):
        view = "embed"
    elif request.path == "/paste":
        view = "paste"
    elif request.path.startswith("/tournaments"):
        if user.anon:
            return web.HTTPFound("/")
        if request.path.startswith("/tournaments/shields"):
            view = "shields"
        elif request.path.startswith("/tournaments/winners"):
            view = "winners"
        else:
            view = "tournaments"
            if user.username in TOURNAMENT_DIRECTORS:
                if request.path.endswith("/new"):
                    view = "arena-new"
                elif request.path.endswith("/edit"):
                    view = "arena-new"
                    tournament = await load_tournament(app_state, tournamentId)
                    if tournament is None or tournament.status != T_CREATED:
                        view = "tournaments"
                elif request.path.endswith("/arena"):
                    data = await request.post()
                    await create_or_update_tournament(app_state, user.username, data)
    elif request.path.startswith("/tournament"):
        view = "tournament"
        tournament = await load_tournament(app_state, tournamentId)

        if tournament is None:
            return web.HTTPFound("/")

        if user.username in TOURNAMENT_DIRECTORS and tournament.status == T_CREATED:
            if request.path.endswith("/edit"):
                data = await request.post()
                await create_or_update_tournament(
                    app_state, user.username, data, tournament=tournament
                )

            elif request.path.endswith("/cancel"):
                await tournament.abort()
                return web.HTTPFound("/tournaments")

        if request.path.endswith("/pause") and user in tournament.players:
            await tournament.pause(user)
    elif request.path.startswith("/calendar"):
        view = "calendar"
    elif request.path.startswith("/puzzle"):
        view = "puzzle"

    profileId = request.match_info.get("profileId")
    if profileId is not None:
        profileId_user = await app_state.users.get(profileId)
        if profileId_user.username == NONE_USER:
            await asyncio.sleep(3)
            return web.HTTPFound("/")

    variant = request.match_info.get("variant")
    if (variant is not None) and ((variant not in VARIANTS) and variant != "terminology"):
        log.debug("Invalid variant %s in request", variant)
        raise web.HTTPNotFound()

    fen = request.rel_url.query.get("fen")
    rated = None

    if (fen is not None) and "//" in fen:
        log.debug("Invalid FEN %s in request", fen)
        raise web.HTTPNotFound()

    if profileId is not None:
        if user.anon and DASH in profileId:
            await asyncio.sleep(3)
            raise web.HTTPOk()
        view = "profile"
        if request.path[-3:] == "/tv":
            view = "tv"
            # TODO: tv for variants
            gameId = await tv_game_user(app_state.db, app_state.users, profileId)
        elif request.path[-7:] == "/import":
            rated = IMPORTED
        elif request.path[-6:] == "/rated":
            rated = RATED
        elif request.path[-8:] == "/playing":
            rated = -2
        elif request.path[-3:] == "/me":
            rated = -1
        elif "/challenge" in request.path:
            view = "lobby"
            if user.anon and profileId != "Fairy-Stockfish":
                return web.HTTPFound("/")

    # Play menu (Create a game)
    if request.rel_url.query.get("any") is not None:
        profileId = "any#"

    # Do we have gameId in request url?
    if (gameId is not None) and gameId != "variants":
        if view not in ("tv", "analysis", "embed"):
            view = "round"
        if (gameId not in app_state.games) and (gameId in app_state.invites):
            seek_id = app_state.invites[gameId].id
            seek = app_state.seeks[seek_id]
            if request.path.startswith("/invite/accept/"):
                player = request.match_info.get("player")
                seek_status = await join_seek(app_state, user, seek, gameId, join_as=player)

                if seek_status["type"] == "seek_joined":
                    view = "invite"
                    inviter = "wait"
                elif seek_status["type"] == "seek_occupied":
                    view = "invite"
                    inviter = "occupied"
                elif seek_status["type"] == "seek_yourself":
                    view = "invite"
                    inviter = "yourself"
                elif seek_status["type"] == "new_game":
                    try:
                        # Put response data to sse subscribers queue
                        channels = app_state.invite_channels
                        for queue in channels:
                            await queue.put(json.dumps({"gameId": gameId}))
                        # return games[game_id]
                    except ConnectionResetError:
                        log.error("/invite/accept/ ConnectionResetError for user %s", session_user)

            else:
                view = "invite"
                inviter = seek.creator.username if user.username != seek.creator.username else ""

        if view != "invite":
            game = await load_game(app_state, gameId)
            if game is None:
                raise web.HTTPNotFound()

            if (ply is not None) and (view != "embed"):
                view = "analysis"

            if not game.is_player(user):
                game.spectators.add(user)

    if view in ("profile", "level8win"):
        if (profileId in app_state.users) and not app_state.users[profileId].enabled:
            template = get_template("closed.html")
        else:
            template = get_template("profile.html")
    elif view == "players":
        if variant is None:
            template = get_template("players.html")
        else:
            template = get_template("players50.html")
    elif view == "shields":
        template = get_template("shields.html")
    elif view == "winners":
        template = get_template("winners.html")
    elif view == "allplayers":
        template = get_template("allplayers.html")
    elif view == "tournaments":
        template = get_template("tournaments.html")
    elif view == "arena-new":
        template = get_template("arena-new.html")
    elif view == "blogs":
        template = get_template("blogs.html")
    elif view == "blog":
        template = get_template("blog.html")
    elif view == "variants":
        template = get_template("variants.html")
    elif view == "games":
        template = get_template("games.html")
    elif view == "memory":
        template = get_template("memory.html")
    elif view == "videos":
        template = get_template("videos.html")
    elif view == "video":
        template = get_template("video.html")
    elif view == "patron":
        template = get_template("patron.html")
    elif view == "features":
        template = get_template("features.html")
    elif view == "faq":
        template = get_template("FAQ.html")
    elif view in ("analysis", "puzzle"):
        template = get_template("analysis.html")
    elif view == "embed":
        template = get_template("embed.html")
    else:
        template = get_template("index.html")

    if view == "lobby":
        page_title = "PyChess • Free Online Chess Variants"
    else:
        page_title = "%s • PyChess" % view.capitalize()

    render = {
        "js": "/static/pychess-variants.js%s%s" % (BR_EXTENSION, SOURCE_VERSION),
        "dev": DEV,
        "app_name": "PyChess",
        "languages": LANGUAGES,
        "lang": lang,
        "theme": user.theme,
        "title": page_title,
        "view": view,
        "asseturl": STATIC_ROOT,
        "view_css": ("round" if view == "tv" else view) + ".css",
        "home": URI,
        "anon": user.anon,
        "username": user.username,
        "profile": profileId if profileId is not None else "",
        "variant": variant if variant is not None else "",
        "fen": fen.replace(".", "+").replace("_", " ") if fen is not None else "",
        "variants": VARIANTS,
        "variant_display_name": variant_display_name,
        "tournamentdirector": user.username in TOURNAMENT_DIRECTORS,
    }

    if view == "lobby":
        puzzle = await get_daily_puzzle(request)
        render["puzzle"] = json.dumps(puzzle, default=datetime.isoformat)

        c_games = corr_games(user.correspondence_games)
        render["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

        blogs = await get_blogs(request, limit=3)
        render["blogs"] = json.dumps(blogs)

    elif view in ("profile", "level8win"):
        if view == "level8win":
            profileId = "Fairy-Stockfish"
            render["trophies"] = []
        else:
            render["can_block"] = profileId not in user.blocked
            render["can_challenge"] = user.username not in profileId_user.blocked

            _id = "%s|%s" % (profileId, profileId_user.title)
            render["trophies"] = [
                (v, "top10")
                for v in app_state.highscore
                if _id in app_state.highscore[v].keys()[:10]
            ]
            for i, (v, kind) in enumerate(render["trophies"]):
                if app_state.highscore[v].peekitem(0)[0] == _id:
                    render["trophies"][i] = (v, "top1")
            render["trophies"] = sorted(render["trophies"], key=lambda x: x[1])

            if not app_state.users[profileId].bot:
                shield_owners = app_state.shield_owners
                render["trophies"] += [
                    (v, "shield") for v in shield_owners if shield_owners[v] == profileId
                ]

            if profileId in CUSTOM_TROPHY_OWNERS:
                trophies = CUSTOM_TROPHY_OWNERS[profileId]
                for v, kind in trophies:
                    if v in VARIANTS:
                        render["trophies"].append((v, kind))

        render["title"] = "Profile • " + profileId
        render["icons"] = VARIANT_ICONS
        render["cup"] = TROPHIES

        if variant is not None:
            render["variant"] = variant

        if profileId not in app_state.users or app_state.users[profileId].perfs is None:
            render["ratings"] = {}
        else:
            render["ratings"] = {
                k: (
                    "%s%s"
                    % (
                        int(round(v["gl"]["r"], 0)),
                        "?" if v["gl"]["d"] > PROVISIONAL_PHI else "",
                    ),
                    v["nb"],
                )
                for (k, v) in sorted(
                    app_state.users[profileId].perfs.items(),
                    key=lambda x: x[1]["nb"],
                    reverse=True,
                )
            }
            for v in NOT_RATED_VARIANTS:
                render["ratings"][v] = ("1500?", 0)

        render["profile_title"] = (
            app_state.users[profileId].title if profileId in app_state.users else ""
        )
        render["rated"] = rated

    elif view == "players":
        online_users = [
            u
            for u in app_state.users.values()
            if u.username == user.username or (u.online and not u.anon)
        ]
        anon_online = sum((1 for u in app_state.users.values() if u.anon and u.online))

        render["icons"] = VARIANT_ICONS
        render["users"] = app_state.users
        render["online_users"] = online_users
        render["anon_online"] = anon_online
        render["admin"] = user.username in ADMINS
        if variant is None:
            render["highscore"] = {
                variant: dict(app_state.highscore[variant].items()[:10])
                for variant in app_state.highscore
                if variant in VARIANTS
            }
        else:
            hs = app_state.highscore[variant]
            render["highscore"] = hs
            view = "players50"

    elif view in ("shields", "winners"):
        wi = await get_winners(app_state, shield=(view == "shields"), variant=variant)
        render["view_css"] = "players.css"
        render["users"] = app_state.users
        render["icons"] = VARIANT_ICONS
        render["winners"] = wi

    elif view == "allplayers":
        allusers = [u for u in app_state.users.values() if not u.anon]
        render["allusers"] = allusers

    elif view == "tournaments":
        render["icons"] = VARIANT_ICONS
        render["pairing_system_name"] = pairing_system_name
        render["time_control_str"] = time_control_str
        render["tables"] = await get_latest_tournaments(app_state, lang)
        render["td"] = user.username in TOURNAMENT_DIRECTORS

    elif view == "puzzle":
        if request.path.endswith("/daily"):
            puzzle = await get_daily_puzzle(request)
        else:
            puzzleId = request.match_info.get("puzzleId")

            if puzzleId in VARIANTS:
                user.puzzle_variant = puzzleId
                puzzleId = None
            elif variant in VARIANTS:
                user.puzzle_variant = variant
            else:
                user.puzzle_variant = None

            if puzzleId is None:
                puzzle = await next_puzzle(request, user)
            else:
                puzzle = await get_puzzle(request, puzzleId)
                if puzzle is None:
                    raise web.HTTPNotFound()

        color = puzzle["fen"].split()[1]
        chess960 = False
        dafault_perf = default_puzzle_perf(puzzle["eval"])
        puzzle_rating = int(round(puzzle.get("perf", dafault_perf)["gl"]["r"], 0))
        variant = puzzle["variant"]
        if color == "w":
            wrating = int(round(user.get_puzzle_rating(variant, chess960).mu, 0))
            brating = puzzle_rating
        else:
            brating = int(round(user.get_puzzle_rating(variant, chess960).mu, 0))
            wrating = puzzle_rating

        render["view_css"] = "analysis.css"
        render["variant"] = variant
        render["fen"] = puzzle["fen"]
        render["wrating"] = wrating
        render["brating"] = brating
        render["puzzle"] = json.dumps(puzzle, default=datetime.isoformat)

    if (gameId is not None) and gameId != "variants":
        if view == "invite":
            render["gameid"] = gameId
            render["variant"] = seek.variant
            render["chess960"] = seek.chess960
            render["rated"] = seek.rated
            render["corr"] = seek.day > 0
            render["base"] = seek.base
            render["inc"] = seek.inc
            render["byo"] = seek.byoyomi_period
            render["inviter"] = inviter
            render["seekempty"] = seek.player1 is None and seek.player2 is None
        else:
            render["gameid"] = gameId
            render["variant"] = game.variant
            render["wplayer"] = game.wplayer.username
            render["wtitle"] = game.wplayer.title
            render["wrating"] = game.wrating
            render["wrdiff"] = game.wrdiff
            render["chess960"] = game.chess960
            render["rated"] = game.rated
            render["corr"] = game.corr
            render["level"] = game.level
            render["bplayer"] = game.bplayer.username
            render["btitle"] = game.bplayer.title
            render["brating"] = game.brating
            render["brdiff"] = game.brdiff
            render["fen"] = DARK_FEN if game.variant == "fogofwar" else game.fen
            render["base"] = game.base
            render["inc"] = game.inc
            render["byo"] = game.byoyomi_period
            render["result"] = game.result
            render["status"] = game.status
            render["date"] = game.date.isoformat()
            render["title"] = game.browser_title
            # todo: I think sent ply value shouldn't be minus 1.
            #       But also it gets overwritten anyway right after that so why send all this stuff at all here.
            #       just init client on 1st ws board msg received right after ws connection is established
            render["ply"] = ply if ply is not None else game.ply - 1
            render["initialFen"] = game.initial_fen
            render["ct"] = json.dumps(game.crosstable)

            user_color = WHITE if user == game.wplayer else BLACK if user == game.bplayer else None
            render["board"] = json.dumps(game.get_board(full=True, persp_color=user_color))

            if game.tournamentId is not None:
                tournament_name = await get_tournament_name(request, game.tournamentId)
                render["tournamentid"] = game.tournamentId
                render["tournamentname"] = tournament_name
                render["wberserk"] = game.wberserk
                render["bberserk"] = game.bberserk
            if game.server_variant.two_boards:
                render["wplayerB"] = game.wplayerB.username
                render["wtitleB"] = game.wplayerB.title
                render["wratingB"] = game.wrating_b
                render["bplayerB"] = game.bplayerB.username
                render["btitleB"] = game.bplayerB.title
                render["bratingB"] = game.brating_b
            if game.corr and user.username in (game.wplayer.username, game.bplayer.username):
                c_games = corr_games(user.correspondence_games)
                render["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

    if tournamentId is not None:
        tournament_name = await get_tournament_name(request, tournamentId)
        render["tournamentid"] = tournamentId
        render["tournamentname"] = tournament_name
        render["description"] = tournament.description
        render["variant"] = tournament.variant
        render["chess960"] = tournament.chess960
        render["rated"] = tournament.rated
        render["base"] = tournament.base
        render["inc"] = tournament.inc
        render["byo"] = tournament.byoyomi_period
        render["fen"] = tournament.fen
        render["before_start"] = tournament.before_start
        render["minutes"] = tournament.minutes
        render["date"] = tournament.starts_at
        render["rounds"] = tournament.rounds
        render["frequency"] = tournament.frequency
        render["status"] = tournament.status
        render["title"] = tournament.browser_title

    # variant None indicates terminology.md
    if lang in ("es", "hu", "it", "pt", "fr", "zh_CN", "zh_TW"):
        locale = ".%s" % lang
    else:
        locale = ""

    if view == "level8win":
        render["level"] = 8
        render["profile"] = "Fairy-Stockfish"

    elif view == "variants":
        render["icons"] = VARIANT_ICONS
        render["groups"] = VARIANT_GROUPS

        if variant == "terminology":
            item = "docs/terminology%s.html" % locale
        else:
            item = "docs/" + ("terminology" if variant is None else variant) + "%s.html" % locale

        if not os.path.exists(os.path.abspath(os.path.join("templates", item))):
            if variant == "terminology":
                item = "docs/terminology.html"
            else:
                item = "docs/" + ("terminology" if variant is None else variant) + ".html"
        render["variant"] = item

    elif view == "games":
        render["icons"] = VARIANT_ICONS
        render["groups"] = VARIANT_GROUPS

    elif view == "videos":
        tag = request.rel_url.query.get("tags")
        videos = []
        if tag is None:
            cursor = app_state.db.video.find()
        else:
            cursor = app_state.db.video.find({"tags": tag})

        async for doc in cursor:
            videos.append(doc)
        render["videos"] = videos
        render["tags"] = VIDEO_TAGS
        render["video_tag"] = video_tag
        render["video_target"] = video_target

    elif view == "video":
        render["view_css"] = "videos.css"
        render["videoId"] = videoId
        render["tags"] = VIDEO_TAGS

    elif view == "blogs":
        tag = request.rel_url.query.get("tags")
        blogs = await get_blogs(request, tag=tag, limit=0)

        render["blogs"] = blogs
        render["tags"] = BLOG_TAGS
        render["blog_tag"] = blog_tag

    elif view == "blog":
        blog_item = blogId.replace("_", " ")
        item = "blogs/%s%s.html" % (blog_item, locale)
        if not os.path.exists(os.path.abspath(os.path.join("templates", item))):
            item = "blogs/%s.html" % blog_item
        render["blog_item"] = item
        render["view_css"] = "blogs.css"
        render["tags"] = BLOG_TAGS

    elif view == "faq":
        render["faq"] = "docs/faq%s.html" % locale

    elif view == "editor" or (view == "analysis" and gameId is None):
        if fen is None:
            fen = FairyBoard.start_fen(variant)
        else:
            fen = fen.replace(".", "+").replace("_", " ")
        render["variant"] = variant
        render["fen"] = fen

    elif view == "arena-new":
        render["edit"] = tournamentId is not None
        render["admin"] = user.username in ADMINS
        render["variants"] = RATED_VARIANTS
        if tournamentId is None:
            render["rated"] = True

    try:
        text = await template.render_async(render)
    except Exception:
        log.exception("ERROR: template.render_async() failed.")
        return web.HTTPFound("/")

    response = web.Response(
        text=minify_html.minify(text),
        content_type="text/html",
    )
    return response


async def robots(request):
    return web.Response(text=ROBOTS_TXT, content_type="text/plain")


async def select_lang(request):
    app_state = get_app_state(request.app)
    data = await request.post()
    lang = data.get("lang")

    if lang is not None:
        referer = request.headers.get("REFERER")
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        if session_user in app_state.users:
            user = app_state.users[session_user]
            user.lang = lang
            if app_state.db is not None:
                await app_state.db.user.find_one_and_update(
                    {"_id": user.username}, {"$set": {"lang": lang}}
                )
        session["lang"] = lang
        return web.HTTPFound(referer)
    else:
        raise web.HTTPNotFound()


def parse_accept_language(accept_language):
    languages = accept_language.split(",")
    locale_q_pairs = []

    for language in languages:
        parts = language.split(";")
        if parts[0] == language:
            # no q => q = 1
            locale_q_pairs.append((language.strip(), "1"))
        else:
            locale_q_pairs.append((parts[0].strip(), parts[1].split("=")[1]))

    return locale_q_pairs


def detect_locale(request):
    default_locale = "en"
    accept_language = request.headers.get("Accept-Language")

    if accept_language is not None:
        locale_q_pairs = parse_accept_language(accept_language)

        for pair in locale_q_pairs:
            for locale in LANGUAGES:
                # pair[0] is locale, pair[1] is q value
                if pair[0].replace("-", "_").lower().startswith(locale.lower()):
                    return locale

    return default_locale
