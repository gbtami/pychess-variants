from __future__ import annotations
from typing import TYPE_CHECKING, Iterable, NamedTuple, Sequence, TypeVar
import calendar as cal
import datetime as dt
import zoneinfo
import logging

from const import (
    ARENA,
    CATEGORIES,
    SCHEDULE_MAX_DAYS,
    DAILY,
    WEEKLY,
    MONTHLY,
    YEARLY,
    SHIELD,
)

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

from tournament.tournaments import new_tournament
from typing_defs import ScheduledTournamentCreateData
from variants import get_server_variant, GRANDS

log = logging.getLogger(__name__)


class Plan(NamedTuple):
    freq: str
    date: dt.datetime
    hour: int
    variant: str
    is960: bool
    base: int
    inc: int
    byo: int
    duration: int


ScheduledEntry = tuple[str, str, bool, dt.datetime, int]
VariantType = TypeVar("VariantType")

SHIELDS: list[str] = [
    "3check960",
    "antichess960",
    "atomic960",
    "crazyhouse960",
    "horde960",
    "kingofthehill960",
    "racingkings960",
    "makruk",
]
SEATURDAY: list[str] = ["makruk", "makpong", "sittuyin", "cambodian", "asean"]

MONTHLY_VARIANTS: tuple[str, ...] = (
    "dobutsu",
    "capahouse",
    "chak",
    "shogun",
    "orda",
    "gorogoroplus",
    "shouse",
    "capablanca960",
    "hoppelpoppel",
    "grand",
    "seirawan",
    "empire",
    "kyotoshogi",
    "placement",
    "ordamirror",
    "minixiangqi",
    "synochess",
    "grandhouse",
    "shako",
    "torishogi",
    "seirawan960",
    "chennis",
    "capablanca",
    "xiangqi",
    "shinobiplus",
    "spartan",
    "kingofthehill960",
    "3check960",
    "mansindam",
    "manchu",
)

NEW_MONTHLY_VARIANTS: tuple[str, ...] = (
    "ataxx",
    "cannonshogi",
    "dragon",
    "khans",
    "alice",
    "fogofwar",
    "antichess960",
    "horde960",
    "racingkings960",
    "shatranj",
)

# Old MONTHLY tournaments, needed to create translated tourney names
PAUSED_MONTHLY_VARIANTS: tuple[str, ...] = ("shinobi", "duck", "capahouse960", "janggi")

# Old WEEKLY tournaments, paused atm., but needed to create translated tourney names
WEEKLY_VARIANTS: tuple[str, ...] = (
    "crazyhouse960",
    "atomic960",
    "duck",
    "xiangqi",
    "janggi",
)

# Monthly Variant Tournaments need different TC
TC_MONTHLY_VARIANTS: dict[str, tuple[int, int, int]] = {v: (3, 2, 0) for v in MONTHLY_VARIANTS}

TC_MONTHLY_VARIANTS["alice"] = (5, 3, 0)
TC_MONTHLY_VARIANTS["fogofwar"] = (5, 3, 0)
TC_MONTHLY_VARIANTS["ataxx"] = (3, 0, 0)

TC_MONTHLY_VARIANTS["antichess960"] = (3, 2, 0)
TC_MONTHLY_VARIANTS["horde960"] = (3, 2, 0)
TC_MONTHLY_VARIANTS["racingkings960"] = (3, 2, 0)

for v in CATEGORIES["fairy"]:
    TC_MONTHLY_VARIANTS[v] = (3, 3, 0)
TC_MONTHLY_VARIANTS["shogun"] = (3, 10, 1)

for v in CATEGORIES["army"]:
    TC_MONTHLY_VARIANTS[v] = (3, 4, 0)
TC_MONTHLY_VARIANTS["chak"] = (5, 3, 0)

for v in GRANDS:  # anything with ten ranks, Grand, Xiangqi, etc
    TC_MONTHLY_VARIANTS[v] = (5, 3, 0)
TC_MONTHLY_VARIANTS["janggi"] = (5, 15, 1)

for v in CATEGORIES["shogi"]:
    TC_MONTHLY_VARIANTS[v] = (2, 15, 1)
TC_MONTHLY_VARIANTS["cannonshogi"] = (5, 15, 1)


def go_month(orig_date: dt.datetime, month: int = 1) -> dt.datetime:
    new_year = orig_date.year
    new_month = orig_date.month + month

    if new_month > 12:
        new_year += 1
        new_month -= 12

    last_day_of_month = cal.monthrange(new_year, new_month)[1]
    new_day = min(orig_date.day, last_day_of_month)

    return orig_date.replace(year=new_year, month=new_month, day=new_day)


class Scheduler:
    def __init__(self, now: dt.datetime | None = None) -> None:
        if now is None:
            self.now = dt.datetime.now(dt.timezone.utc)
        else:
            self.now = now
        # set time info to 0:0:0
        self.now = dt.datetime.combine(self.now, dt.time.min, tzinfo=dt.timezone.utc)

    def next_weekday(self, date: dt.datetime, weekday: int) -> dt.datetime:
        days_ahead = weekday - date.weekday()
        if days_ahead < 0:  # Target day already happened this week
            days_ahead += 7
        return date + dt.timedelta(days=days_ahead)

    def first_monthly(self, weekday: int) -> dt.datetime:
        return self.next_weekday(
            dt.datetime(self.now.year, self.now.month, 1, tzinfo=dt.timezone.utc),
            weekday,
        )

    def second_monthly(self, weekday: int) -> dt.datetime:
        return self.first_monthly(weekday) + dt.timedelta(days=7)

    def third_monthly(self, weekday: int) -> dt.datetime:
        return self.first_monthly(weekday) + dt.timedelta(days=14)

    def fourth_monthly(self, weekday: int) -> dt.datetime:
        return self.first_monthly(weekday) + dt.timedelta(days=21)

    def next_day_of_week(self, weekday: int) -> dt.datetime:
        return self.now + dt.timedelta(days=(weekday + 7 - self.now.weekday()) % 7)

    def get_next_variant(self, period: int, variants: Sequence[VariantType]) -> VariantType:
        return variants[period % len(variants)]

    def schedule_plan(self) -> list[Plan]:
        """Create planned tournament plan list for one full month"""
        SEA = self.get_next_variant(self.now.month, ("sittuyin", "cambodian"))
        plans: list[Plan] = []
        number_of_days = cal.monthrange(self.now.year, self.now.month)[1]

        for i, v in enumerate(NEW_MONTHLY_VARIANTS):
            if i + 1 > number_of_days:
                break
            is_960 = v.endswith("960")
            base, inc, byo = TC_MONTHLY_VARIANTS[v]
            hour = 14
            try:
                date = dt.datetime(self.now.year, self.now.month, i + 1, tzinfo=dt.timezone.utc)
                if date.weekday() == cal.SUNDAY:
                    # Shields on each SUNDAY starts at 12 and 3 hours long, so put this early...
                    hour = 10
            except ValueError:
                log.error("schedule_plan() ValueError")
                break
            plans.append(Plan(MONTHLY, date, hour, v.rstrip("960"), is_960, base, inc, byo, 90))

        for i, v in enumerate(MONTHLY_VARIANTS):
            if i + 1 > number_of_days:
                break
            is_960 = v.endswith("960")
            base, inc, byo = TC_MONTHLY_VARIANTS[v]
            hour = 16
            try:
                date = dt.datetime(self.now.year, self.now.month, i + 1, tzinfo=dt.timezone.utc)
            except ValueError:
                log.error("schedule_plan() ValueError")
                break
            plans.append(Plan(MONTHLY, date, hour, v.rstrip("960"), is_960, base, inc, byo, 90))

        plans += [
            Plan(SHIELD, self.first_monthly(cal.SUNDAY), 12, "kingofthehill", True, 3, 2, 0, 180),
            Plan(SHIELD, self.second_monthly(cal.SUNDAY), 12, "crazyhouse", True, 3, 2, 0, 180),
            Plan(SHIELD, self.fourth_monthly(cal.SUNDAY), 12, "3check", True, 3, 2, 0, 180),
            Plan(
                SHIELD,
                self.fourth_monthly(cal.TUESDAY),
                18,
                "racingkings",
                True,
                3,
                2,
                0,
                180,
            ),
            Plan(SHIELD, self.second_monthly(cal.SATURDAY), 12, "makruk", False, 5, 3, 0, 180),
            Plan(SHIELD, self.third_monthly(cal.SATURDAY), 18, "antichess", True, 3, 2, 0, 180),
            Plan(SHIELD, self.fourth_monthly(cal.SATURDAY), 18, "horde", True, 3, 2, 0, 180),
            Plan(SHIELD, self.third_monthly(cal.SUNDAY), 12, "atomic", True, 3, 2, 0, 180),
            Plan(MONTHLY, self.first_monthly(cal.SATURDAY), 12, "asean", False, 3, 2, 0, 90),
            # The second Saturday is Makruk Shield
            Plan(MONTHLY, self.third_monthly(cal.SATURDAY), 12, SEA, False, 3, 2, 0, 90),
            Plan(MONTHLY, self.fourth_monthly(cal.SATURDAY), 12, "makpong", False, 3, 2, 0, 90),
            Plan(WEEKLY, self.next_day_of_week(cal.THURSDAY), 12, "makruk", False, 3, 2, 0, 90),
            Plan(WEEKLY, self.next_day_of_week(cal.SUNDAY), 18, "duck", False, 3, 5, 0, 90),
            Plan(WEEKLY, self.next_day_of_week(cal.FRIDAY), 12, "xiangqi", False, 5, 3, 0, 90),
            Plan(WEEKLY, self.next_day_of_week(cal.WEDNESDAY), 12, "janggi", False, 5, 15, 1, 90),
        ]

        return plans


def new_scheduled_tournaments(
    already_scheduled: Iterable[ScheduledEntry],
    now: dt.datetime | None = None,
) -> list[ScheduledTournamentCreateData]:
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

    new_tournaments_data: list[ScheduledTournamentCreateData] = []

    budapest = zoneinfo.ZoneInfo("Europe/Budapest")
    from_now = dt.datetime(2024, 10, 28, tzinfo=dt.timezone.utc)

    for plan in plans:
        starts_at = dt.datetime(
            plan.date.year,
            plan.date.month,
            plan.date.day,
            hour=plan.hour,
            tzinfo=dt.timezone.utc,
        )

        # When it starts outside of daylight saving time (DST), shift it one hour later
        dst_offset = budapest.dst(starts_at.astimezone(budapest))
        if plan.date >= from_now and dst_offset.seconds == 0:  # type: ignore[union-attr]
            starts_at = starts_at + dt.timedelta(hours=1)

        if (
            starts_at >= now
            and starts_at <= to_date
            and (plan.freq, plan.variant, plan.is960, starts_at, plan.duration)
            not in already_scheduled
        ):
            server_variant = get_server_variant(plan.variant, plan.is960)
            variant_name = server_variant.display_name.title()

            if plan.freq == SHIELD:
                name = "%s Shield Arena" % variant_name
            elif plan.freq == YEARLY:
                name = "Yearly %s Arena" % variant_name
            elif plan.freq == MONTHLY:
                if plan.variant in CATEGORIES["makruk"]:
                    name = "SEAturday %s Arena" % variant_name
                else:
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
                    "createdBy": "PyChess",
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


async def create_scheduled_tournaments(
    app_state: PychessGlobalAppState,
    new_tournaments_data: Iterable[ScheduledTournamentCreateData],
) -> None:
    for data in new_tournaments_data:
        await new_tournament(app_state, data)
