import unittest

from friendly_sites import FRIENDLY_SITES


class FriendlySitesTestCase(unittest.TestCase):
    def test_sites_have_url_and_description(self):
        self.assertGreaterEqual(len(FRIENDLY_SITES), 3)
        for site in FRIENDLY_SITES:
            self.assertTrue(site.name.strip())
            self.assertTrue(site.url.startswith("https://"))
            self.assertTrue(site.description.strip())
            self.assertTrue(site.icon_url.startswith(("https://", "/static/")))


if __name__ == "__main__":
    unittest.main()
