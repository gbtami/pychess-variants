# -*- coding: utf-8 -*-

import re

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from server import make_app

test_logger.init_test_logger()


class OpenApiSpecTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    async def _openapi_payload(self) -> dict:
        response = await self.client.get("/openapi.json")
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertIsInstance(payload, dict)
        self.assertIn("paths", payload)
        return payload

    async def test_openapi_json_loads_and_contains_user_games_paths(self):
        payload = await self._openapi_payload()

        paths = payload["paths"]
        self.assertIn("/api/games", paths)
        self.assertIn("/api/games/{variant}", paths)
        self.assertIn("/api/games/user/{profileId}", paths)
        self.assertIn("/api/games/user/{profileId}/pgn", paths)

        get_games = paths["/api/games"]["get"]
        get_games_by_variant = paths["/api/games/{variant}"]["get"]
        get_user_games = paths["/api/games/user/{profileId}"]["get"]
        export_user_pgn = paths["/api/games/user/{profileId}/pgn"]["get"]
        self.assertEqual("getOngoingGames", get_games["operationId"])
        self.assertEqual("getOngoingGamesByVariant", get_games_by_variant["operationId"])
        self.assertEqual("getUserGamesJson", get_user_games["operationId"])
        self.assertEqual("exportUserGamesPgn", export_user_pgn["operationId"])

        self.assertEqual(
            ["variant"], [param["name"] for param in get_games_by_variant["parameters"]]
        )
        self.assertEqual("path", get_games_by_variant["parameters"][0]["in"])
        self.assertTrue(get_games_by_variant["parameters"][0]["required"])

        self.assertEqual(
            ["profileId", "p", "max", "filter", "variant", "x"],
            [param["name"] for param in get_user_games["parameters"]],
        )
        self.assertEqual(
            ["profileId", "max", "filter", "variant", "x"],
            [param["name"] for param in export_user_pgn["parameters"]],
        )

        self.assertEqual("path", get_user_games["parameters"][0]["in"])
        self.assertTrue(get_user_games["parameters"][0]["required"])
        self.assertEqual("query", get_user_games["parameters"][1]["in"])
        self.assertFalse(get_user_games["parameters"][1]["required"])

        self.assertEqual("path", export_user_pgn["parameters"][0]["in"])
        self.assertTrue(export_user_pgn["parameters"][0]["required"])
        for param in export_user_pgn["parameters"][1:]:
            self.assertEqual("query", param["in"])
            self.assertFalse(param["required"])

    async def test_openapi_generic_sanity_for_all_documented_operations(self):
        payload = await self._openapi_payload()
        paths = payload["paths"]

        operation_ids: set[str] = set()
        allowed_methods = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}

        for path, path_item in paths.items():
            self.assertIsInstance(path, str)
            self.assertTrue(path.startswith("/"))
            self.assertIsInstance(path_item, dict)

            path_parameters = path_item.get("parameters", [])
            path_placeholders = set(re.findall(r"{([^}]+)}", path))

            for method, operation in path_item.items():
                if method not in allowed_methods:
                    continue

                self.assertIsInstance(operation, dict)
                self.assertIn("operationId", operation)
                self.assertIsInstance(operation["operationId"], str)
                self.assertNotEqual("", operation["operationId"].strip())
                self.assertNotIn(operation["operationId"], operation_ids)
                operation_ids.add(operation["operationId"])

                self.assertIn("responses", operation)
                self.assertIsInstance(operation["responses"], dict)
                self.assertGreater(len(operation["responses"]), 0)

                operation_parameters = operation.get("parameters", [])
                all_parameters = [*path_parameters, *operation_parameters]

                seen_param_keys: set[tuple[str, str]] = set()
                for param in all_parameters:
                    self.assertIsInstance(param, dict)
                    self.assertIn("name", param)
                    self.assertIn("in", param)
                    self.assertIsInstance(param["name"], str)
                    self.assertIsInstance(param["in"], str)

                    param_key = (param["name"], param["in"])
                    self.assertNotIn(param_key, seen_param_keys)
                    seen_param_keys.add(param_key)

                    if param["in"] == "path":
                        self.assertTrue(param.get("required", False))
                        self.assertIn(param["name"], path_placeholders)

                documented_path_params = {
                    param["name"] for param in all_parameters if param.get("in") == "path"
                }
                self.assertTrue(path_placeholders.issubset(documented_path_params))
