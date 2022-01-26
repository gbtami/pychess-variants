# -*- coding: utf-8 -*-

import unittest
import datetime as dt

from const import SHIELD
from scheduler import new_scheduled_tournaments, MONTHLY_VARIANTS, SHIELDS, Scheduler

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY = range(7)

# Shield week starts at second MONDAY of month
SHIELD_ZH_2021 = (SHIELD, "crazyhouse", True, dt.datetime(2021, 12, 13, 18, tzinfo=dt.timezone.utc))
SHIELD_ATOMIC_2021 = (SHIELD, "atomic", True, dt.datetime(2021, 12, 19, 16, tzinfo=dt.timezone.utc))

SHIELD_ZH_2022 = (SHIELD, "crazyhouse", True, dt.datetime(2022, 1, 10, 18, tzinfo=dt.timezone.utc))
SHIELD_ATOMIC_2022 = (SHIELD, "atomic", True, dt.datetime(2022, 1, 16, 16, tzinfo=dt.timezone.utc))

ONE_TEST_ONLY = False


def create_scheduled_data(year, month, day, already_scheduled=[]):
    start = dt.datetime(year, month, day, tzinfo=dt.timezone.utc)
    data = new_scheduled_tournaments(already_scheduled, start)
    return [(e["frequency"], e["variant"], e["chess960"], e["startDate"]) for e in data]


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
    def test_no_shield_in_next_week(self):
        data = create_scheduled_data(2021, 12, 1)

        self.assertNotIn(SHIELD_ZH_2021, data)
        self.assertNotIn(SHIELD_ATOMIC_2021, data)

        data = create_scheduled_data(2022, 1, 1)

        self.assertNotIn(SHIELD_ZH_2022, data)
        self.assertNotIn(SHIELD_ATOMIC_2022, data)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_zh_in_next_week(self):
        data = create_scheduled_data(2021, 12, 6)

        self.assertIn(SHIELD_ZH_2021, data)
        self.assertNotIn(SHIELD_ATOMIC_2021, data)

        data = create_scheduled_data(2022, 1, 3)

        self.assertIn(SHIELD_ZH_2022, data)
        self.assertNotIn(SHIELD_ATOMIC_2022, data)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_zh_and_atomic_in_next_week(self):
        data = create_scheduled_data(2021, 12, 12)

        self.assertIn(SHIELD_ZH_2021, data)
        self.assertIn(SHIELD_ATOMIC_2021, data)

        data = create_scheduled_data(2022, 1, 9)

        self.assertIn(SHIELD_ZH_2022, data)
        self.assertIn(SHIELD_ATOMIC_2022, data)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_zh_is_over(self):
        data = create_scheduled_data(2021, 12, 14)

        self.assertNotIn(SHIELD_ZH_2021, data)
        self.assertIn(SHIELD_ATOMIC_2021, data)

        data = create_scheduled_data(2022, 1, 11)

        self.assertNotIn(SHIELD_ZH_2022, data)
        self.assertIn(SHIELD_ATOMIC_2022, data)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_zh_and_atomic_are_over(self):
        data = create_scheduled_data(2021, 12, 20)

        self.assertNotIn(SHIELD_ZH_2021, data)
        self.assertNotIn(SHIELD_ATOMIC_2021, data)

        data = create_scheduled_data(2022, 1, 17)

        self.assertNotIn(SHIELD_ZH_2022, data)
        self.assertNotIn(SHIELD_ATOMIC_2022, data)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_shedule_plan(self):
        plans = Scheduler().shedule_plan()

        self.assertEqual(len(plans), len(MONTHLY_VARIANTS) + len(SHIELDS) + 3 + 2)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_run_twice_same_day(self):
        for i in range(365):
            y, m, d = self.go_day(i)
            prev_data = create_scheduled_data(y, m, d)
            next_data = create_scheduled_data(y, m, d, already_scheduled=prev_data)

            self.assertEqual(next_data, [])

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    def test_run_next_day(self):
        print("--------------")
        y, m, d = self.ymd
        prev_data = create_scheduled_data(y, m, d)
        print("---", y, m, d, "---")
        for data in prev_data:
            print("%s %s %s%s" % (data[3].strftime("%Y.%m.%d %H"), data[0], data[1], "960" if data[2] else ""))

        already_scheduled = prev_data
        for i in range(10):
            y, m, d = self.go_day(i + 1)
            next_data = create_scheduled_data(y, m, d, already_scheduled=already_scheduled)
            print("---", y, m, d, "---")

            for data in next_data:
                print("%s %s %s%s" % (data[3].strftime("%Y.%m.%d %H"), data[0], data[1], "960" if data[2] else ""))

            if d + 7 < len(MONTHLY_VARIANTS):
                self.assertTrue(len(next_data) > 0)

            for data in prev_data:
                self.assertNotIn(data, next_data)

            for data in next_data:
                self.assertNotIn(data, prev_data)

            already_scheduled += next_data


if __name__ == '__main__':
    unittest.main(verbosity=2)
