import json
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from catalogued_variants import (
    CataloguedVariantValidation,
    _build_doc,
    update_catalogued_variant,
    upload_catalogued_variant,
)
from fsf_variant_info_fixture import make_fsf_variant_info

INI = "[appearanceaccess:chess]"
PAYLOAD = (
    INI,
    "Appearance access",
    "",
    "",
    False,
    "standard",
    "standard8x8",
    "private",
)
VALIDATION_INFO = make_fsf_variant_info(name="appearanceaccess")
VALIDATION = CataloguedVariantValidation(
    name="appearanceaccess",
    start_fen="8/8/8/8/8/8/8/K6k w - - 0 1",
    width=8,
    height=8,
    pieces=["k"],
    king_roles=["k"],
    pocket_roles=[],
    capture_to_hand=False,
    promotion_type="regular",
    promotion_roles=[],
    promotion_order=[],
    show_promoted=False,
    rules_gate=False,
    rules_pass=False,
    legal_moves_need_history=False,
    n_fold_is_draw=False,
    show_check_counters=False,
    base_variant="chess",
    fsf_variant_info=VALIDATION_INFO,
)


class AppearanceCollection:
    def __init__(self) -> None:
        self.inserted = None

    async def insert_one(self, doc):
        self.inserted = doc


class AppearanceDatabase:
    def __init__(self, collection) -> None:
        self.collection = collection

    def __getitem__(self, _name):
        return self.collection


class CataloguedVariantAppearanceAccessTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_non_admin_upload_keeps_appearance_overrides(self):
        collection = AppearanceCollection()
        app_state = SimpleNamespace(
            db=AppearanceDatabase(collection),
            catalogued_variants={},
        )
        request = SimpleNamespace(app=object())

        with (
            patch("catalogued_variants.get_app_state", return_value=app_state),
            patch(
                "catalogued_variants._current_human_username",
                new=AsyncMock(return_value="alice"),
            ),
            patch(
                "catalogued_variants._read_upload_payload",
                new=AsyncMock(return_value=PAYLOAD),
            ),
            patch(
                "catalogued_variants._ensure_catalogued_variant_quota",
                new=AsyncMock(),
            ),
            patch(
                "catalogued_variants.ensure_catalogued_variant_name_available",
                new=AsyncMock(),
            ),
            patch(
                "catalogued_variants.check_catalogued_ini_without_mutating_server",
                new=AsyncMock(),
            ),
            patch("catalogued_variants.validate_catalogued_ini", return_value=VALIDATION),
            patch("catalogued_variants.register_catalogued_variant_doc"),
            patch("catalogued_variants._is_admin_username", return_value=False) as is_admin,
        ):
            response = await upload_catalogued_variant(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(collection.inserted["author"], "alice")
        self.assertEqual(collection.inserted["pieceFamilyOverride"], "standard")
        self.assertEqual(collection.inserted["boardFamilyOverride"], "standard8x8")
        is_admin.assert_not_called()

    async def test_non_admin_update_can_change_appearance_overrides(self):
        existing = _build_doc(
            name=VALIDATION.name,
            base_variant=VALIDATION.base_variant,
            display_name="Appearance access",
            description="",
            piece_names="",
            username="alice",
            ini=INI,
            start_fen=VALIDATION.start_fen,
            width=VALIDATION.width,
            height=VALIDATION.height,
            pieces=VALIDATION.pieces,
            king_roles=VALIDATION.king_roles,
            pocket_roles=VALIDATION.pocket_roles,
            capture_to_hand=VALIDATION.capture_to_hand,
            promotion_type=VALIDATION.promotion_type,
            promotion_roles=VALIDATION.promotion_roles,
            promotion_order=VALIDATION.promotion_order,
            show_promoted=VALIDATION.show_promoted,
            rules_gate=VALIDATION.rules_gate,
            rules_pass=VALIDATION.rules_pass,
            legal_moves_need_history=VALIDATION.legal_moves_need_history,
            n_fold_is_draw=VALIDATION.n_fold_is_draw,
            show_check_counters=VALIDATION.show_check_counters,
            fsf_variant_info=VALIDATION.fsf_variant_info,
            created_at=datetime.now(UTC),
        )
        collection = AppearanceCollection()
        app_state = SimpleNamespace(
            db=AppearanceDatabase(collection),
            catalogued_variants={VALIDATION.name: existing},
        )
        request = SimpleNamespace(app=object())

        async def return_updated(*_args, **kwargs):
            return kwargs["doc"]

        with (
            patch(
                "catalogued_variants._load_owned_doc",
                new=AsyncMock(return_value=(app_state, "alice", VALIDATION.name, existing)),
            ),
            patch(
                "catalogued_variants._read_upload_payload",
                new=AsyncMock(return_value=PAYLOAD),
            ),
            patch(
                "catalogued_variants._update_catalogued_variant_document",
                new=AsyncMock(side_effect=return_updated),
            ),
            patch("catalogued_variants.register_catalogued_variant_doc"),
            patch("catalogued_variants._game_count", new=AsyncMock(return_value=0)),
            patch("catalogued_variants._is_admin_username", return_value=False) as is_admin,
        ):
            response = await update_catalogued_variant(request)

        payload = json.loads(response.text)
        self.assertEqual(payload["variant"]["pieceFamilyOverride"], "standard")
        self.assertEqual(payload["variant"]["boardFamilyOverride"], "standard8x8")
        is_admin.assert_not_called()
