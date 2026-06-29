# -*- coding: utf-8 -*-
"""
glicko2
~~~~~~~

The Glicko2 rating system.

:copyright: (c) 2012 by Heungsub Lee
:Modified by Bajusz Tamás
:license: BSD, see LICENSE for more details.
"""

from collections.abc import Iterable, Mapping
from typing import Any, cast
import math
from datetime import datetime, timezone

from typing_defs import PerfEntry, PerfMap


#: The actual score for win
WIN = 1.0
#: The actual score for draw
DRAW = 0.5
#: The actual score for loss
LOSS = 0.0

# http://www.glicko.net/glicko/glicko2.pdf
MU = 1500
PHI = 350
SIGMA = 0.06
TAU = 0.75  # system constant which constrains the change in volatility over time
EPSILON = 0.000001

MIN_MU = 600
MIN_PHI = 30
MAX_SIGMA = 0.1
PROVISIONAL_PHI = 110

_RATIO: float = 173.7178
_MAX_PHI_SCALED: float = 350.0 / _RATIO
_3_OVER_PI_SQ: float = 3.0 / math.pi ** 2
_SECONDS_PER_PERIOD: float = 60.0 * 60 * 24 * 4.665  # 4.665 days = Lichess baseline period


class Rating:
    __slots__ = "mu", "phi", "sigma", "ltime"

    def __init__(self, mu=MU, phi=PHI, sigma=SIGMA, ltime=None):
        self.mu = mu
        self.phi = phi
        self.sigma = sigma
        self.ltime = ltime

    @property
    def rating_prov(self) -> tuple[int, str]:
        return (int(round(self.mu, 0)), "?" if self.phi > PROVISIONAL_PHI else "")

    def __repr__(self):
        return "(mu=%.3f, phi=%.3f, sigma=%.3f, ltime=%s)" % (
            self.mu,
            self.phi,
            self.sigma,
            self.ltime,
        )


def pre_rating_RD(phi: float, sigma: float, ltime: datetime) -> float:
    """Calculates the player's rating deviation for the beginning of a rating period."""

    # First calculate number of rating periods passed since the last rd update
    # 4.665 days is the length of a "baseline" rating period used by Lichess,
    # which is essentially arbitrary but calibrated so a typical player's RD
    # goes from 60 to 110 in a year.
    now_ts = datetime.now(timezone.utc).timestamp()
    ltime_ts = ltime.timestamp() if ltime.tzinfo is not None else ltime.replace(tzinfo=timezone.utc).timestamp()

    t = (now_ts - ltime_ts) / _SECONDS_PER_PERIOD
    t = max(1, t)
    ret = math.sqrt(phi ** 2 + t * sigma ** 2)
    return min(ret, _MAX_PHI_SCALED)


class Glicko2:
    __slots__ = "mu", "phi", "sigma", "tau", "epsilon"

    def __init__(self, mu=MU, phi=PHI, sigma=SIGMA, tau=TAU, epsilon=EPSILON):
        self.mu = mu
        self.phi = phi
        self.sigma = sigma
        self.tau = tau
        self.epsilon = epsilon

    def create_rating(self, mu=None, phi=None, sigma=None, ltime=None) -> Rating:
        if mu is None:
            mu = self.mu
        if phi is None:
            phi = self.phi
        if sigma is None:
            sigma = self.sigma
        if ltime is None:
            ltime = datetime.now(timezone.utc)
        return Rating(mu, phi, sigma, ltime)

    def scale_down(self, rating: Rating, ratio: float = _RATIO) -> Rating:
        mu = (rating.mu - self.mu) / ratio
        phi = rating.phi / ratio
        return Rating(mu, phi, rating.sigma, rating.ltime)

    def scale_up(self, rating: Rating, ratio: float = _RATIO) -> Rating:
        mu = rating.mu * ratio + self.mu
        phi = rating.phi * ratio
        return Rating(
            max(mu, MIN_MU),
            max(phi, MIN_PHI),
            min(rating.sigma, MAX_SIGMA),
            rating.ltime,
        )

    @staticmethod
    def reduce_impact(rating: Rating) -> float:
        """The original form is `g(RD)`. This function reduces the impact of
        games as a function of an opponent's RD.
        """
        return 1.0 / math.sqrt(1 + _3_OVER_PI_SQ * rating.phi ** 2)

    @staticmethod
    def expect_score(rating: Rating, other_rating: Rating, impact: float) -> float:
        return 1.0 / (1 + math.exp(-impact * (rating.mu - other_rating.mu)))

    @staticmethod
    def _f(x: float, difference_sq: float, phi_sq: float, variance: float,
           alpha: float, tau_sq: float) -> float:
        """This function is twice the conditional log-posterior density of phi,
        and is the optimality criterion.
        """
        ex = math.exp(x)
        tmp = phi_sq + variance + ex
        a = ex * (difference_sq - tmp) / (2.0 * tmp ** 2)
        b = (x - alpha) / tau_sq
        return a - b

    def determine_sigma(self, rating: Rating, difference: float, variance: float) -> float:
        """Determines new sigma."""
        phi = rating.phi
        phi_sq = phi ** 2
        difference_sq = difference ** 2
        tau_sq = self.tau ** 2
        # 1. Let a = ln(s^2), and define f(x)
        alpha = math.log(rating.sigma ** 2)

        # 2. Set the initial values of the iterative algorithm.
        a = alpha
        if difference_sq > phi_sq + variance:
            b = math.log(difference_sq - phi_sq - variance)
        else:
            k = 1
            while self._f(alpha - k * self.tau, difference_sq, phi_sq, variance, alpha, tau_sq) < 0:
                k += 1
            b = alpha - k * self.tau
        # 3. Let fA = f(A) and f(B) = f(B)
        f_a = self._f(a, difference_sq, phi_sq, variance, alpha, tau_sq)
        f_b = self._f(b, difference_sq, phi_sq, variance, alpha, tau_sq)
        # 4. While |B-A| > e, carry out the following steps.
        # (a) Let C = A + (A - B)fA / (fB-fA), and let fC = f(C).
        # (b) If fCfB < 0, then set A <- B and fA <- fB; otherwise, just set
        #     fA <- fA/2.
        # (c) Set B <- C and fB <- fC.
        # (d) Stop if |B-A| <= e. Repeat the above three steps otherwise.
        while abs(b - a) > self.epsilon:
            c = a + (a - b) * f_a / (f_b - f_a)
            f_c = self._f(c, difference_sq, phi_sq, variance, alpha, tau_sq)
            if f_c * f_b < 0:
                a, f_a = b, f_b
            else:
                f_a /= 2
            b, f_b = c, f_c
        # 5. Once |B-A| <= e, set s' <- e^(A/2)
        return math.exp(a / 2)

    def rate(self, rating: Rating, series) -> Rating:
        # Step 2. For each player, convert the rating and RD's onto the
        #         Glicko-2 scale.
        rating = self.scale_down(rating)
        # Step 3. Compute the quantity v. This is the estimated variance of the
        #         team's/player's rating based only on game outcomes.
        # Step 4. Compute the quantity difference, the estimated improvement in
        #         rating by comparing the pre-period rating to the performance
        #         rating based only on game outcomes.
        variance_inv = 0.0
        difference = 0.0

        if not series:
            # If the team didn't play in the series, do only Step 6
            phi_star = pre_rating_RD(rating.phi, rating.sigma, rating.ltime)
            return self.scale_up(Rating(rating.mu, phi_star, rating.sigma, rating.ltime))

        # reduce_impact and expect_score are inlined to avoid per-opponent method dispatch.
        # opponent scale_down is inlined to avoid a temporary Rating allocation per loop iteration.
        my_mu = rating.mu
        for actual_score, other_rating in series:
            opp_phi = other_rating.phi / _RATIO
            opp_mu = (other_rating.mu - self.mu) / _RATIO
            impact = 1.0 / math.sqrt(1.0 + _3_OVER_PI_SQ * opp_phi ** 2)
            expected_score = 1.0 / (1.0 + math.exp(-impact * (my_mu - opp_mu)))
            variance_inv += impact ** 2 * expected_score * (1.0 - expected_score)
            difference += impact * (actual_score - expected_score)

        difference /= variance_inv
        variance = 1.0 / variance_inv

        # Step 5. Determine the new value, Sigma', ot the sigma. This
        #         computation requires iteration.
        sigma = self.determine_sigma(rating, difference, variance)

        # Step 6. Update the rating deviation to the new pre-rating period
        #         value, Phi*.
        phi_star = pre_rating_RD(rating.phi, sigma, rating.ltime)

        # Step 7. Update the rating and RD to the new values, Mu' and Phi'.
        phi = 1.0 / math.sqrt(1.0 / phi_star ** 2 + 1.0 / variance)
        mu = rating.mu + phi ** 2 * (difference / variance)

        # Step 8. Convert ratings and RD's back to original scale.
        return self.scale_up(Rating(mu, phi, sigma, rating.ltime))

    def rate_1vs1(
    self, rating1: Rating, rating2: Rating, drawn: bool = False
) -> tuple[Rating, Rating]:

        return (
            self.rate(rating1, [(DRAW if drawn else WIN, rating2)]),
            self.rate(rating2, [(DRAW if drawn else LOSS, rating1)]),
        )

    def quality_1vs1(self, rating1: Rating, rating2: Rating) -> float:
        expected_score1 = self.expect_score(rating1, rating2, self.reduce_impact(rating1))
        expected_score2 = self.expect_score(rating2, rating1, self.reduce_impact(rating2))
        expected_score = (expected_score1 + expected_score2) / 2
        return 2 * (0.5 - abs(0.5 - expected_score))


gl2 = Glicko2()


def _perf_timestamp(raw: Any) -> datetime:
    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=timezone.utc)
        return raw.astimezone(timezone.utc)
    return datetime.now(timezone.utc)


def new_default_perf(ltime: datetime | None = None) -> PerfEntry:
    timestamp = _perf_timestamp(ltime)
    return {
        "gl": {"r": float(MU), "d": float(PHI), "v": float(SIGMA)},
        "la": timestamp,
        "nb": 0,
    }


def perf_entry_with_defaults(perf: Mapping[str, object] | None) -> PerfEntry:
    if perf is None:
        return new_default_perf()

    raw_gl = perf.get("gl")
    gl = raw_gl if isinstance(raw_gl, Mapping) else {}
    raw_nb = perf.get("nb", 0)
    if isinstance(raw_nb, bool):
        nb = int(raw_nb)
    elif isinstance(raw_nb, (int, float, str, bytes)):
        try:
            nb = int(cast(int | float | str | bytes, raw_nb))
        except ValueError:
            nb = 0
    else:
        nb = 0

    return {
        "gl": {
            "r": float(gl.get("r", MU)),
            "d": float(gl.get("d", PHI)),
            "v": float(gl.get("v", SIGMA)),
        },
        "la": _perf_timestamp(perf.get("la")),
        "nb": nb,
    }


def new_default_perf_map(variants: Iterable[str]) -> PerfMap:
    return {variant: new_default_perf() for variant in variants}


def perf_map_with_defaults(
    variants: Iterable[str], perfs: Mapping[str, Mapping[str, object]] | PerfMap | None = None
) -> PerfMap:
    if perfs is None:
        return new_default_perf_map(variants)
    return {variant: perf_entry_with_defaults(perfs.get(variant)) for variant in variants}
