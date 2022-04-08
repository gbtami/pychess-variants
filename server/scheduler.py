import calendar
from collections import namedtuple
import datetime as dt

from const import (
    ARENA,
    DAILY,
    WEEKLY,
    MONTHLY,
    SHIELD,
    variant_display_name,
    SCHEDULE_MAX_DAYS,
)

from tournaments import new_tournament

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY = range(7)
Plan = namedtuple("Plan", "freq, date, hour, variant, is960, base, inc, byo, duration")

SHIELDS = ["antichess", "losers", "anti_antichess"]

MONTHLY_VARIANTS = (
    "antichess",
    "losers",
    "anti_antichess",
    "antiatomic",
    "antihouse",
    "antipawns",
    "antiplacement",
    "coffeehouse",
    "coffeehill",
    "coffee_3check",
    "coffeerace",
    "atomic_giveaway_hill",
)

# Monthly Variant Tournaments need different TC
TC_MONTHLY_VARIANTS = {v: (3, 2, 0) for v in MONTHLY_VARIANTS}


def go_month(orig_date, month=1):
    new_year = orig_date.year
    new_month = orig_date.month + month

    if new_month > 12:
        new_year += 1
        new_month -= 12

    last_day_of_month = calendar.monthrange(new_year, new_month)[1]
    new_day = min(orig_date.day, last_day_of_month)

    return orig_date.replace(year=new_year, month=new_month, day=new_day)


class Scheduler:
    def __init__(self, now=None):
        if now is None:
            self.now = dt.datetime.now(dt.timezone.utc)
        else:
            self.now = now
        # set time info to 0:0:0
        self.now = dt.datetime.combine(self.now, dt.time.min, tzinfo=dt.timezone.utc)

    def next_weekday(self, date, weekday):
        days_ahead = weekday - date.weekday()
        if days_ahead < 0:  # Target day already happened this week
            days_ahead += 7
        return date + dt.timedelta(days=days_ahead)

    def first_monthly(self, weekday):
        return self.next_weekday(
            dt.datetime(self.now.year, self.now.month, 1, tzinfo=dt.timezone.utc),
            weekday,
        )

    def second_monthly(self, weekday):
        return self.first_monthly(weekday) + dt.timedelta(days=7)

    def third_monthly(self, weekday):
        return self.first_monthly(weekday) + dt.timedelta(days=14)

    def fourth_monthly(self, weekday):
        return self.first_monthly(weekday) + dt.timedelta(days=21)

    def next_day_of_week(self, weekday):
        return self.now + dt.timedelta(days=(weekday + 7 - self.now.weekday()) % 7)

    def get_next_variant(self, period, variants):
        return variants[period % len(variants)]

    def schedule_plan(self):
        """Create planned tournament plan list for one full month"""
        plans = []
        for i, v in enumerate(MONTHLY_VARIANTS):
            is_960 = v.endswith("960")
            base, inc, byo = TC_MONTHLY_VARIANTS[v]
            date = dt.datetime(self.now.year, self.now.month, i + 1, tzinfo=dt.timezone.utc)
            plans.append(Plan(MONTHLY, date, 16, v.rstrip("960"), is_960, base, inc, byo, 90))

        plans += [
            # Shields
            Plan(SHIELD, self.first_monthly(SUNDAY), 18, "antichess", False, 3, 2, 0, 180),
            Plan(SHIELD, self.second_monthly(SUNDAY), 18, "losers", False, 3, 2, 0, 180),
            Plan(SHIELD, self.third_monthly(SUNDAY), 18, "antichess", True, 3, 2, 0, 180),
            Plan(SHIELD, self.fourth_monthly(SUNDAY), 18, "anti_antichess", False, 3, 2, 0, 180),
            # Monthly Tournaments
            # Mondays of the month
            Plan(MONTHLY, self.first_monthly(MONDAY), 18, "atomic_giveaway_hill", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.second_monthly(MONDAY), 18, "coffee_3check", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.third_monthly(MONDAY), 18, "coffeehill", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.fourth_monthly(MONDAY), 18, "coffeehouse", True, 3, 2, 0, 180),
            # Tuesdays of the month
            Plan(MONTHLY, self.first_monthly(TUESDAY), 18, "antihouse", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.second_monthly(TUESDAY), 18, "antiatomic", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.third_monthly(TUESDAY), 18, "atomic_giveaway_hill", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.fourth_monthly(TUESDAY), 18, "anti_antichess", True, 3, 2, 0, 180),
            # Wednesdays of the month
            Plan(MONTHLY, self.first_monthly(WEDNESDAY), 18, "coffeerace", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.second_monthly(WEDNESDAY), 18, "antiplacement", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.third_monthly(WEDNESDAY), 18, "coffee_3check", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.fourth_monthly(WEDNESDAY), 18, "coffeehill", False, 3, 2, 0, 180),
            # Thursdays of the month
            Plan(MONTHLY, self.first_monthly(THURSDAY), 18, "antichess", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.second_monthly(THURSDAY), 18, "losers", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.third_monthly(THURSDAY), 18, "antichess", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.fourth_monthly(THURSDAY), 18, "anti_antichess", False, 3, 2, 0, 180),
            # Sundays of the month before Shields (extra tournament on sunday because everyone is free)
            Plan(MONTHLY, self.first_monthly(SUNDAY), 14, "antiatomic", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.second_monthly(SUNDAY), 14, "losers", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.third_monthly(SUNDAY), 14, "antihouse", False, 3, 2, 0, 180),
            Plan(MONTHLY, self.fourth_monthly(SUNDAY), 14, "antipawns", False, 3, 2, 0, 180),
            # Weekly Tournaments
            Plan(WEEKLY, self.next_day_of_week(SATURDAY), 18, "antichess", False, 3, 2, 0, 180),
            Plan(WEEKLY, self.next_day_of_week(FRIDAY), 18, "antichess", True, 3, 2, 0, 180),
        ]

        return plans


def new_scheduled_tournaments(already_scheduled, now=None):
    """Create list for scheduled tournament data for one week from now on compared to what we already have"""

    # Cut off the latest element (_id) from all tournament data first
    # to let test if new plan data is already in already_scheduled or not.
    already_scheduled = [t[:5] for t in already_scheduled]

    if now is None:
        now = dt.datetime.now(dt.timezone.utc)
        # set time info to 0:0:0
        now = dt.datetime.combine(now, dt.time.min, tzinfo=dt.timezone.utc)

    to_date = dt.datetime.combine(now, dt.time.max, tzinfo=dt.timezone.utc) + dt.timedelta(
        days=SCHEDULE_MAX_DAYS
    )

    # 2 full month list of scheduled tournaments
    plans = Scheduler(now).schedule_plan() + Scheduler(go_month(now)).schedule_plan()

    new_tournaments_data = []

    for plan in plans:
        starts_at = dt.datetime(
            plan.date.year,
            plan.date.month,
            plan.date.day,
            hour=plan.hour,
            tzinfo=dt.timezone.utc,
        )

        if (
            starts_at >= now
            and starts_at <= to_date
            and (plan.freq, plan.variant, plan.is960, starts_at, plan.duration)
            not in already_scheduled
        ):

            variant_name = variant_display_name(
                plan.variant + ("960" if plan.is960 else "")
            ).title()
            if plan.freq == SHIELD:
                name = "%s Shield Arena" % variant_name
            elif plan.freq == MONTHLY:
                name = "Monthly %s Arena" % variant_name
            elif plan.freq == WEEKLY:
                name = "Weekly %s Arena" % variant_name
            elif plan.freq == DAILY:
                name = "Daily %s Arena" % variant_name
            else:
                name = "%s Arena" % variant_name

            new_tournaments_data.append(
                {
                    "name": name,
                    "createdBy": "Liantichess",
                    "frequency": plan.freq,
                    "variant": plan.variant,
                    "chess960": plan.is960,
                    "base": plan.base,
                    "inc": plan.inc,
                    "bp": plan.byo,
                    "system": ARENA,
                    "startDate": starts_at,
                    "minutes": plan.duration,
                }
            )

    return new_tournaments_data


async def create_scheduled_tournaments(app, new_tournaments_data):
    for data in new_tournaments_data:
        await new_tournament(app, data)