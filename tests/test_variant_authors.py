import unittest
from pathlib import Path

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from variant_authors import VARIANT_AUTHORS, public_variant_authors

from server import make_app

test_logger.init_test_logger()


class VariantAuthorsRegistryTestCase(unittest.TestCase):
    def test_public_authors_have_complete_attribution(self):
        public = public_variant_authors()

        self.assertGreaterEqual(len(public), 10)
        self.assertTrue(all(author.publishable for author in public))
        self.assertEqual(len({author.name for author in VARIANT_AUTHORS}), len(VARIANT_AUTHORS))

        root = Path(__file__).resolve().parents[1]
        for author in public:
            self.assertTrue((root / "static" / author.portrait).is_file())
            for variant in author.variants:
                self.assertTrue((root / "static" / "docs" / f"{variant}.md").is_file())

    def test_representative_images_and_hidden_records(self):
        authors = {author.name: author for author in VARIANT_AUTHORS}
        public_names = {author.name for author in public_variant_authors()}

        self.assertIn("V. R. Parton", authors)
        self.assertIn("alice", authors["V. R. Parton"].variants)
        self.assertIn("racingkings", authors["V. R. Parton"].variants)
        self.assertIn("V. R. Parton", public_names)
        self.assertIn("Jean-Louis Cazaux", public_names)
        self.assertIn("Tamiya Katsuya", public_names)
        self.assertIn("Toyota Genryu", public_names)
        self.assertIn("Peter Michaelsen", public_names)
        self.assertIn("Dr Tim Paulden", public_names)
        self.assertIn("S. D. Streetman", public_names)
        self.assertIn("Jens Bæk Nielsen", public_names)
        self.assertIn("Torben Osted", public_names)
        self.assertIn("David Bronstein", public_names)
        self.assertTrue(authors["V. R. Parton"].representative_artwork)
        self.assertTrue(authors["Jean-Louis Cazaux"].representative_artwork)
        self.assertTrue(authors["Tamiya Katsuya"].representative_artwork)
        self.assertTrue(authors["Toyota Genryu"].representative_artwork)
        self.assertTrue(authors["Peter Michaelsen"].representative_artwork)
        self.assertTrue(authors["Dr Tim Paulden"].representative_artwork)
        self.assertTrue(authors["S. D. Streetman"].representative_artwork)
        self.assertTrue(authors["Jens Bæk Nielsen"].representative_artwork)
        self.assertTrue(authors["Torben Osted"].representative_artwork)
        self.assertFalse(authors["David Bronstein"].representative_artwork)
        self.assertIn("Couch Tomato", authors)
        self.assertIn("yokai", authors["Couch Tomato"].variants)
        self.assertNotIn("Couch Tomato", public_names)


class VariantAuthorsPageTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_authors_page_lists_publishable_authors_and_variant_links(self):
        response = await self.client.request("GET", "/authors")

        self.assertEqual(response.status, 200)
        text = await response.text()
        self.assertIn("Chess variant authors", text)
        self.assertIn("José Raúl Capablanca", text)
        self.assertIn("Madoka Kitao", text)
        self.assertIn('/variants/capablanca"', text)
        self.assertIn('/variants/dobutsu"', text)
        self.assertIn("V. R. Parton", text)
        self.assertIn("Jean-Louis Cazaux", text)
        self.assertIn("Tamiya Katsuya", text)
        self.assertIn("Toyota Genryu", text)
        self.assertIn("Peter Michaelsen", text)
        self.assertIn("Dr Tim Paulden", text)
        self.assertIn("S. D. Streetman", text)
        self.assertIn("Jens Bæk Nielsen", text)
        self.assertIn("Torben Osted", text)
        self.assertIn("David Bronstein", text)
        self.assertIn('/variants/alice"', text)
        self.assertIn('/variants/racingkings"', text)
        self.assertIn('/variants/shako"', text)
        self.assertIn('/variants/kyotoshogi"', text)
        self.assertIn('/variants/torishogi"', text)
        self.assertIn('/variants/cannonshogi"', text)
        self.assertIn('/variants/duck"', text)
        self.assertIn('/variants/spartan"', text)
        self.assertIn('/variants/fogofwar"', text)
        self.assertIn('/variants/placement"', text)
        self.assertIn('data-view="authors"', text)
