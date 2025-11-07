# -*- coding: utf-8 -*-

import unittest
import datetime as dt

from const import SCHEDULE_MAX_DAYS
from tournament.scheduler import new_scheduled_tournaments, MONTHLY_VARIANTS, SHIELDS, Scheduler


ONE_TEST_ONLY = False


def create_scheduled_data(year, month, day, already_scheduled=None):
    if already_scheduled is None:
        already_scheduled = []
    start = dt.datetime(year, month, day, tzinfo=dt.timezone.utc)
    data = new_scheduled_tournaments(already_scheduled, start)
    return [
        (e["frequency"], e["variant"], e["chess960"], e["startDate"], e["minutes"]) for e in data
    ]


class TournamentSchedulerTestCase(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.now(dt.timezone.utc)
        # set time info to 0:0:0
        self.now = dt.datetime.combine(self.now, dt.time.min, tzinfo=dt.timezone.utc)
        self.ymd = self.now.year, self.now.month, self.now.day

    def go_day(self, day):
        d = self.now + dt.timedelta(days=day)
        return (d.year, d.month, d.day)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_shedule_plan(self):
        plans = Scheduler().schedule_plan()

        self.assertTrue(len(plans) > len(MONTHLY_VARIANTS) + len(SHIELDS))

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_run_twice_same_day(self):
        for i in range(365):
            y, m, d = self.go_day(i)
            prev_data = create_scheduled_data(y, m, d)
            next_data = create_scheduled_data(y, m, d, already_scheduled=prev_data)

            self.assertEqual(next_data, [])

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_run_next_day(self):
        """Every day is a new day with completely different tournaments."""
        print("--------------")
        y, m, d = self.ymd
        prev_data = create_scheduled_data(y, m, d)
        print("---", y, m, d, "---")
        for data in prev_data:
            print(
                "%s %s %s%s"
                % (
                    data[3].strftime("%Y.%m.%d %H"),
                    data[0],
                    data[1],
                    "960" if data[2] else "",
                )
            )

        already_scheduled = prev_data
        for i in range(365):
            y, m, d = self.go_day(i + 1)
            next_data = create_scheduled_data(y, m, d, already_scheduled=already_scheduled)
            print("---", y, m, d, "---")

            for data in next_data:
                print(
                    "%s %s %s%s"
                    % (
                        data[3].strftime("%Y.%m.%d %H"),
                        data[0],
                        data[1],
                        "960" if data[2] else "",
                    )
                )

            # We have 26 items in MONTHLY_VARIANTS. We create new tournaments SCHEDULE_MAX_DAYS ahead, so
            # at the end of all month there wil be days without new MONTHLY_VARIANTS tourney.
            # But before that we always have to have at least one!
            if d + SCHEDULE_MAX_DAYS < len(MONTHLY_VARIANTS):
                self.assertTrue(len(next_data) > 0)

            # prev_data and next data should be disjunct
            for data in prev_data:
                self.assertNotIn(data, next_data)

            for data in next_data:
                self.assertNotIn(data, prev_data)

            already_scheduled += next_data


if __name__ == "__main__":
    unittest.main(verbosity=2)
