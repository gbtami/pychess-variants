# -*- coding: utf-8 -*-
"""
    glicko2
    ~~~~~~~

    The Glicko2 rating system.

    :copyright: (c) 2012 by Heungsub Lee
    :Modified by Bajusz Tamás
    :license: BSD, see LICENSE for more details.
"""
import math
from calendar import timegm
from datetime import datetime


#: The actual score for win
WIN = 1.
#: The actual score for draw
DRAW = 0.5
#: The actual score for loss
LOSS = 0.

# http://www.glicko.net/glicko/glicko2.pdf
MU = 1500
PHI = 350
SIGMA = 0.06
TAU = 0.75  # system constant which constrains the change in volatility over time
EPSILON = 0.000001
#: A constant which is used to standardize the logistic function to
#: `1/(1+exp(-x))` from `1/(1+10^(-r/400))`
Q = math.log(10) / 400

MIN_MU = 600
MIN_PHI = 30
MAX_SIGMA = 0.1
PROVISIONAL_PHI = 110


class Rating:

    def __init__(self, mu=MU, phi=PHI, sigma=SIGMA, ltime=None):
        self.mu = mu
        self.phi = phi
        self.sigma = sigma
        self.ltime = ltime

    def __repr__(self):
        return '(mu=%.3f, phi=%.3f, sigma=%.3f, ltime=%s)' % (self.mu, self.phi, self.sigma, self.ltime)


def pre_rating_RD(phi, sigma, ltime):
    """ Calculates the player's rating deviation for the beginning of a rating period. """

    # First calculate number of rating periods passed since the last rd update
    # 4.665 days is the length of a “baseline” rating period used by Lichess,
    # which is essentially arbitrary but calibrated so a typical player’s RD goes from 60 to 110 in a year.

    t = (timegm(datetime.utcnow().timetuple()) - timegm(ltime.timetuple())) / (60.0 * 60 * 24) / 4.665
    # print("pre_rating_RD(", timegm(datetime.utcnow().timetuple()), timegm(ltime.timetuple()), t)
    t = max(1, t)
    ret = math.sqrt(math.pow(phi, 2) + t * math.pow(sigma, 2))
    return min(ret, 350.0 / 173.7178)


class Glicko2:

    def __init__(self, mu=MU, phi=PHI, sigma=SIGMA, tau=TAU, epsilon=EPSILON):
        self.mu = mu
        self.phi = phi
        self.sigma = sigma
        self.tau = tau
        self.epsilon = epsilon

    def create_rating(self, mu=None, phi=None, sigma=None, ltime=None):
        if mu is None:
            mu = self.mu
        if phi is None:
            phi = self.phi
        if sigma is None:
            sigma = self.sigma
        if ltime is None:
            ltime = datetime.utcnow()
        return Rating(mu, phi, sigma, ltime)

    def scale_down(self, rating, ratio=173.7178):
        mu = (rating.mu - self.mu) / ratio
        phi = rating.phi / ratio
        return self.create_rating(mu, phi, rating.sigma, rating.ltime)

    def scale_up(self, rating, ratio=173.7178):
        mu = rating.mu * ratio + self.mu
        phi = rating.phi * ratio
        return self.create_rating(max(mu, MIN_MU), max(phi, MIN_PHI), min(rating.sigma, MAX_SIGMA), rating.ltime)

    def reduce_impact(self, rating):
        """The original form is `g(RD)`. This function reduces the impact of
        games as a function of an opponent's RD.
        """
        return 1 / math.sqrt(1 + (3 * rating.phi ** 2) / (math.pi ** 2))

    def expect_score(self, rating, other_rating, impact):
        return 1. / (1 + math.exp(-impact * (rating.mu - other_rating.mu)))

    def determine_sigma(self, rating, difference, variance):
        """Determines new sigma."""
        phi = rating.phi
        difference_squared = difference ** 2
        # 1. Let a = ln(s^2), and define f(x)
        alpha = math.log(rating.sigma ** 2)

        def f(x):
            """This function is twice the conditional log-posterior density of
            phi, and is the optimality criterion.
            """
            tmp = phi ** 2 + variance + math.exp(x)
            a = math.exp(x) * (difference_squared - tmp) / (2 * tmp ** 2)
            b = (x - alpha) / (self.tau ** 2)
            return a - b
        # 2. Set the initial values of the iterative algorithm.
        a = alpha
        if difference_squared > phi ** 2 + variance:
            b = math.log(difference_squared - phi ** 2 - variance)
        else:
            k = 1
            while f(alpha - k * math.sqrt(self.tau ** 2)) < 0:
                k += 1
            b = alpha - k * math.sqrt(self.tau ** 2)
        # 3. Let fA = f(A) and f(B) = f(B)
        f_a, f_b = f(a), f(b)
        # 4. While |B-A| > e, carry out the following steps.
        # (a) Let C = A + (A - B)fA / (fB-fA), and let fC = f(C).
        # (b) If fCfB < 0, then set A <- B and fA <- fB; otherwise, just set
        #     fA <- fA/2.
        # (c) Set B <- C and fB <- fC.
        # (d) Stop if |B-A| <= e. Repeat the above three steps otherwise.
        while abs(b - a) > self.epsilon:
            c = a + (a - b) * f_a / (f_b - f_a)
            f_c = f(c)
            if f_c * f_b < 0:
                a, f_a = b, f_b
            else:
                f_a /= 2
            b, f_b = c, f_c
        # 5. Once |B-A| <= e, set s' <- e^(A/2)
        return math.exp(1) ** (a / 2)

    def rate(self, rating, series):
        # print("rate()", rating, series)
        # Step 2. For each player, convert the rating and RD's onto the
        #         Glicko-2 scale.
        rating = self.scale_down(rating)
        # Step 3. Compute the quantity v. This is the estimated variance of the
        #         team's/player's rating based only on game outcomes.
        # Step 4. Compute the quantity difference, the estimated improvement in
        #         rating by comparing the pre-period rating to the performance
        #         rating based only on game outcomes.
        d_square_inv = 0
        variance_inv = 0
        difference = 0

        if not series:
            # If the team didn't play in the series, do only Step 6
            # phi_star = math.sqrt(rating.phi ** 2 + rating.sigma ** 2)
            phi_star = pre_rating_RD(rating.phi, rating.sigma, rating.ltime)
            return self.scale_up(self.create_rating(rating.mu, phi_star, rating.sigma, rating.ltime))

        for actual_score, other_rating in series:
            other_rating = self.scale_down(other_rating)
            impact = self.reduce_impact(other_rating)
            expected_score = self.expect_score(rating, other_rating, impact)
            variance_inv += impact ** 2 * expected_score * (1 - expected_score)
            difference += impact * (actual_score - expected_score)
            d_square_inv += (
                expected_score * (1 - expected_score) *
                (Q ** 2) * (impact ** 2))

        difference /= variance_inv
        variance = 1. / variance_inv
        denom = rating.phi ** -2 + d_square_inv
        phi = math.sqrt(1 / denom)
        # Step 5. Determine the new value, Sigma', ot the sigma. This
        #         computation requires iteration.
        sigma = self.determine_sigma(rating, difference, variance)
        # Step 6. Update the rating deviation to the new pre-rating period
        #         value, Phi*.
        # phi_star = math.sqrt(phi ** 2 + sigma ** 2)
        phi_star = pre_rating_RD(phi, sigma, rating.ltime)
        # Step 7. Update the rating and RD to the new values, Mu' and Phi'.
        phi = 1 / math.sqrt(1 / phi_star ** 2 + 1 / variance)
        mu = rating.mu + phi ** 2 * (difference / variance)
        # Step 8. Convert ratings and RD's back to original scale.
        return self.scale_up(self.create_rating(mu, phi, sigma, rating.ltime))

    def rate_1vs1(self, rating1, rating2, drawn=False):
        return (self.rate(rating1, [(DRAW if drawn else WIN, rating2)]),
                self.rate(rating2, [(DRAW if drawn else LOSS, rating1)]))

    def quality_1vs1(self, rating1, rating2):
        expected_score1 = self.expect_score(rating1, rating2, self.reduce_impact(rating1))
        expected_score2 = self.expect_score(rating2, rating1, self.reduce_impact(rating2))
        expected_score = (expected_score1 + expected_score2) / 2
        return 2 * (0.5 - abs(0.5 - expected_score))


gl2 = Glicko2()
rating = gl2.create_rating()
DEFAULT_PERF = {"gl": {"r": rating.mu, "d": rating.phi, "v": rating.sigma}, "la": datetime.utcnow(), "nb": 0}
