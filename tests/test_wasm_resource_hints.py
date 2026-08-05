import unittest
from html.parser import HTMLParser

from aiohttp.test_utils import AioHTTPTestCase
from jinja2 import Environment, FileSystemLoader, select_autoescape
from mongomock_motor import AsyncMongoMockClient

from server import make_app


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "link":
            self.links.append(dict(attrs))


class WasmResourceHintsTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        environment = Environment(
            loader=FileSystemLoader("templates"),
            autoescape=select_autoescape(["html"]),
        )
        environment.globals["static"] = lambda path: "/static-root/%s" % path
        cls.template = environment.get_template("base.html")

    def wasm_hints(self, view, variant="chess"):
        rendered = self.template.render(
            title="Test",
            view=view,
            variant=variant,
            view_css="test.css",
            prefetch_ffish=view == "lobby",
        )
        parser = LinkParser()
        parser.feed(rendered)
        return [link for link in parser.links if link.get("href", "").endswith(".wasm")]

    def test_lobby_prefetches_standard_engine(self):
        self.assertEqual(
            self.wasm_hints("lobby"),
            [
                {
                    "rel": "prefetch",
                    "href": "/static-root/ffish.wasm",
                    "as": "fetch",
                    "type": "application/wasm",
                    "crossorigin": "anonymous",
                }
            ],
        )

    def test_standard_engine_views_preload_without_prefetch(self):
        for view in ("round", "analysis"):
            with self.subTest(view=view):
                self.assertEqual(
                    self.wasm_hints(view),
                    [
                        {
                            "rel": "preload",
                            "href": "/static-root/ffish.wasm",
                            "as": "fetch",
                            "type": "application/wasm",
                            "crossorigin": "anonymous",
                        }
                    ],
                )

    def test_alice_engine_views_preload_only_alice_engine(self):
        for view in ("round", "analysis"):
            with self.subTest(view=view):
                self.assertEqual(
                    self.wasm_hints(view, variant="alice"),
                    [
                        {
                            "rel": "preload",
                            "href": "/static-root/ffish-alice.wasm",
                            "as": "fetch",
                            "type": "application/wasm",
                            "crossorigin": "anonymous",
                        }
                    ],
                )

    def test_unrelated_view_has_no_wasm_resource_hint(self):
        self.assertEqual(self.wasm_hints("profile"), [])


class LobbyWasmResourceHintsRequestTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_lobby_routes_prefetch_expected_engine(self):
        routes = (
            ("/", "ffish.wasm"),
            ("/seek/alice", "ffish-alice.wasm"),
            ("/?variant=alice", "ffish-alice.wasm"),
            ("/@/Fairy-Stockfish/challenge", "ffish.wasm"),
        )
        for path, engine in routes:
            with self.subTest(path=path):
                response = await self.client.get(path)
                self.assertEqual(response.status, 200)
                parser = LinkParser()
                parser.feed(await response.text())
                hints = [link for link in parser.links if link.get("rel") == "prefetch"]
                self.assertEqual(len(hints), 1)
                self.assertIn(engine, hints[0]["href"])
