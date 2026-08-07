import unittest

from friendly_sites import FRIENDLY_SITES, public_friendly_sites


class FriendlySitesTestCase(unittest.TestCase):
    def test_sites_are_alphabetically_sorted(self):
        names = [site.name for site in public_friendly_sites()]
        self.assertEqual(names, sorted(names, key=str.casefold))

    def test_sites_have_url_and_description(self):
        self.assertGreaterEqual(len(FRIENDLY_SITES), 3)
        for site in FRIENDLY_SITES:
            self.assertTrue(site.name.strip())
            self.assertTrue(site.url.startswith("https://"))
            self.assertTrue(site.description.strip())


if __name__ == "__main__":
    unittest.main()
