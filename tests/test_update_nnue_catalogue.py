from __future__ import annotations

import unittest

from scripts.update_nnue_catalogue import build_catalogue


class UpdateNnueCatalogueTestCase(unittest.TestCase):
    def test_generates_network_fingerprint_and_alias_tables(self) -> None:
        manifest = {
            "schema": 1,
            "networks": [
                {
                    "id": "sample",
                    "file": "sample-0123456789ab.nnue",
                    "bytes": 123,
                    "sha256": "0123456789ab" + "0" * 52,
                }
            ],
        }
        identities = {
            "schema": 1,
            "fingerprintAlgorithm": "fsf-ini-v1",
            "networks": [
                {
                    "id": "sample",
                    "kind": "custom",
                    "fingerprint": "a" * 64,
                }
            ],
            "aliases": {"sample-alias": "sample"},
        }

        generated = build_catalogue(manifest, identities)

        self.assertIn('sample: { file: "sample-0123456789ab.nnue", bytes: 123 }', generated)
        self.assertIn('sample: "' + "a" * 64 + '"', generated)
        self.assertIn('"sample-alias": "sample"', generated)

    def test_rejects_manifest_identity_mismatch(self) -> None:
        manifest = {
            "schema": 1,
            "networks": [
                {
                    "id": "sample",
                    "file": "sample-0123456789ab.nnue",
                    "bytes": 123,
                    "sha256": "0123456789ab" + "0" * 52,
                }
            ],
        }
        identities = {
            "schema": 1,
            "fingerprintAlgorithm": "fsf-ini-v1",
            "networks": [],
            "aliases": {},
        }

        with self.assertRaisesRegex(ValueError, "manifest/identity ids differ"):
            build_catalogue(manifest, identities)


if __name__ == "__main__":
    unittest.main()
