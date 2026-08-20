import datetime as dt
import unittest

import test_logger
from const import SCHEDULE_MAX_DAYS
from tournament.scheduler import MONTHLY_VARIANTS, new_scheduled_tournaments

test_logger.init_test_logger()

ONE_TEST_ONLY = False


def create_scheduled_data(year, month, day, already_scheduled=None):
    if already_scheduled is None:
        already_scheduled = []
    start = dt.datetime(year, month, day, tzinfo=dt.UTC)
    data = new_scheduled_tournaments(already_scheduled, start)
    return [
        (e["frequency"], e["variant"], e["chess960"], e["startDate"], e["minutes"]) for e in data
    ]


class TournamentSchedulerTestCase(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.now(dt.UTC)
        # set time info to 0:0:0
        self.now = dt.datetime.combine(self.now, dt.time.min, tzinfo=dt.UTC)
        self.ymd = self.now.year, self.now.month, self.now.day

    def go_day(self, day):
        d = self.now + dt.timedelta(days=day)
        return (d.year, d.month, d.day)

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
        y, m, d = self.ymd
        prev_data = create_scheduled_data(y, m, d)

        already_scheduled = prev_data
        for i in range(365):
            y, m, d = self.go_day(i + 1)
            next_data = create_scheduled_data(y, m, d, already_scheduled=already_scheduled)
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
