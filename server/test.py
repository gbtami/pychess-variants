# -*- coding: utf-8 -*-

import asyncio
import unittest
from datetime import datetime

from utils import User
from glicko2.glicko2 import Glicko2, WIN, LOSS


class TestRatings(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.get_event_loop()
        self.gl2 = Glicko2(tau=0.5)

    def test_new_rating(self):
        new_rating = self.gl2.create_rating()

        user = User()
        result = user.get_rating("chess")
        self.assertEqual(result.mu, new_rating.mu)

    def test_rating(self):
        u1 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1500, "d": 200, "v": 0.06}}})
        r1 = u1.get_rating("chess")

        self.assertEqual(r1.mu, 1500)
        self.assertEqual(r1.phi, 200)
        self.assertEqual(r1.sigma, 0.06)

        u2 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1400, "d": 30, "v": 0.06}}})
        r2 = u2.get_rating("chess")
        self.assertEqual(r2.mu, 1400)

        u3 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1550, "d": 100, "v": 0.06}}})
        r3 = u3.get_rating("chess")
        self.assertEqual(r3.mu, 1550)

        u4 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1700, "d": 300, "v": 0.06}}})
        r4 = u4.get_rating("chess")
        self.assertEqual(r4.mu, 1700)

        async def coro():
            rating = await self.gl2.rate(r1, [(WIN, r2), (LOSS, r3), (LOSS, r4)])
            return rating

        new_rating = self.loop.run_until_complete(coro())

        self.assertEqual(round(new_rating.mu, 3), 1464.051)
        self.assertEqual(round(new_rating.phi, 3), 151.515)
        self.assertEqual(round(new_rating.sigma, 6), 0.059996)

        async def coro(user, rating):
            await user.set_rating("chess", rating)

        self.loop.run_until_complete(coro(u1, new_rating))
        r1 = u1.get_rating("chess")

        self.assertEqual(round(r1.mu, 3), 1464.051)
        self.assertEqual(round(r1.phi, 3), 151.515)
        self.assertEqual(round(r1.sigma, 6), 0.059996)


if __name__ == '__main__':
    unittest.main(verbosity=2)
