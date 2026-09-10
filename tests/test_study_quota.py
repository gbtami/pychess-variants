from __future__ import annotations

import asyncio
import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from mongomock_motor import AsyncMongoMockClient
from study.quota import (
    StudyQuotaExceeded,
    claim_study_analysis_slot,
    claim_study_creation_slot,
    release_study_analysis_slot,
    release_study_creation_slot,
)


class StudyQuotaTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db)
        await self.db.user.insert_one({"_id": "owner"})
        self.now = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)

    async def test_creation_budget_is_weighted_and_releasable(self) -> None:
        with patch("study.quota.STUDY_CREATION_CREDITS_PER_24H", 3):
            first = await claim_study_creation_slot(self.app_state, "owner", now=self.now)
            clone = await claim_study_creation_slot(self.app_state, "owner", cost=2, now=self.now)
            with self.assertRaises(StudyQuotaExceeded) as exc_info:
                await claim_study_creation_slot(self.app_state, "owner", now=self.now)
            self.assertEqual(exc_info.exception.code, "creation_limit")

            await release_study_creation_slot(self.app_state, "owner", first)
            replacement = await claim_study_creation_slot(self.app_state, "owner", now=self.now)
            self.assertNotEqual(replacement, clone)

        account = await self.db.user.find_one({"_id": "owner"})
        assert account is not None
        history = account["studyCreationHistory"]
        self.assertEqual(sum(entry["cost"] for entry in history), 3)

    async def test_creation_budget_uses_rolling_24_hour_window(self) -> None:
        await self.db.user.update_one(
            {"_id": "owner"},
            {
                "$set": {
                    "studyCreationHistory": [
                        {
                            "at": self.now - timedelta(hours=25),
                            "id": "expired",
                            "cost": 3,
                        }
                    ]
                }
            },
        )
        with patch("study.quota.STUDY_CREATION_CREDITS_PER_24H", 1):
            await claim_study_creation_slot(self.app_state, "owner", now=self.now)

        account = await self.db.user.find_one({"_id": "owner"})
        assert account is not None
        self.assertEqual(len(account["studyCreationHistory"]), 1)
        self.assertNotEqual(account["studyCreationHistory"][0]["id"], "expired")

    async def test_analysis_enforces_daily_and_weekly_budgets(self) -> None:
        with (
            patch("study.quota.STUDY_ANALYSIS_MAX_PER_DAY", 1),
            patch("study.quota.STUDY_ANALYSIS_MAX_PER_WEEK", 2),
        ):
            first = await claim_study_analysis_slot(self.app_state, "owner", now=self.now)
            with self.assertRaises(StudyQuotaExceeded) as daily:
                await claim_study_analysis_slot(self.app_state, "owner", now=self.now)
            self.assertEqual(daily.exception.code, "daily_limit")

            await release_study_analysis_slot(self.app_state, "owner", first)
            await self.db.user.update_one(
                {"_id": "owner"},
                {
                    "$set": {
                        "studyAnalysisHistory": [
                            {
                                "at": self.now - timedelta(days=2),
                                "id": "week1",
                                "cost": 1,
                            },
                            {
                                "at": self.now - timedelta(days=3),
                                "id": "week2",
                                "cost": 1,
                            },
                        ]
                    }
                },
            )
            with self.assertRaises(StudyQuotaExceeded) as weekly:
                await claim_study_analysis_slot(self.app_state, "owner", now=self.now)
            self.assertEqual(weekly.exception.code, "weekly_limit")

    async def test_concurrent_quota_claims_cannot_overbook(self) -> None:
        async def claim() -> str:
            return await claim_study_creation_slot(self.app_state, "owner", now=self.now)

        with patch("study.quota.STUDY_CREATION_CREDITS_PER_24H", 1):
            results = await asyncio.gather(claim(), claim(), return_exceptions=True)

        successes = [value for value in results if isinstance(value, str)]
        failures = [value for value in results if isinstance(value, StudyQuotaExceeded)]
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0].code, "creation_limit")


if __name__ == "__main__":
    unittest.main()
