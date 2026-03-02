#!/usr/bin/env python3
"""
Stress test py4swiss Dutch pairing for process-memory growth.

This is aimed at detecting *sustained* RSS growth when pairings are generated
many times. It cannot mathematically prove the absence of leaks, but it gives
an actionable guardrail for regressions and release checks.

Example:
    python scripts/py4swiss_memory_stress.py \
        --players 64 \
        --rounds-per-tournament 9 \
        --warmup-tournaments 100 \
        --measure-tournaments 3000 \
        --max-growth-mb 20
"""

from __future__ import annotations

import argparse
import gc
import os
import statistics
import sys
from dataclasses import dataclass, field
from typing import Any

from py4swiss.engines import DutchEngine
from py4swiss.engines.common import PairingError
from py4swiss.trf import ParsedTrf
from py4swiss.trf.codes import PlayerCode
from py4swiss.trf.results import (
    ColorToken,
    ResultToken,
    RoundResult,
    ScoringPointSystem,
    ScoringPointSystemCode,
)
from py4swiss.trf.sections import PlayerSection, XSection
from py4swiss.trf.sections.x_section import XSectionConfiguration

try:
    from tqdm import tqdm
except Exception:  # pragma: no cover - optional dependency
    tqdm = None


@dataclass(slots=True)
class PlayerState:
    rating: int
    points_times_ten: int = 0
    results: list[Any] = field(default_factory=list)


def rss_bytes() -> int:
    """Return current RSS in bytes for Linux procfs environments."""

    with open("/proc/self/status", encoding="utf-8") as status_file:
        for line in status_file:
            if line.startswith("VmRSS:"):
                # VmRSS is reported in kB.
                return int(line.split()[1]) * 1024
    raise RuntimeError("VmRSS not found in /proc/self/status")


def mib(value_bytes: int | float) -> float:
    return float(value_bytes) / (1024 * 1024)


def build_scoring_system() -> Any:
    scoring = ScoringPointSystem()
    scoring.apply_code(ScoringPointSystemCode.WIN, 20)
    scoring.apply_code(ScoringPointSystemCode.DRAW, 10)
    scoring.apply_code(ScoringPointSystemCode.LOSS, 0)
    scoring.apply_code(ScoringPointSystemCode.ZERO_POINT_BYE, 0)
    scoring.apply_code(ScoringPointSystemCode.HALF_POINT_BYE, 10)
    scoring.apply_code(ScoringPointSystemCode.FULL_POINT_BYE, 20)
    scoring.apply_code(ScoringPointSystemCode.PAIRING_ALLOCATED_BYE, 20)
    return scoring


def initialize_players(player_count: int, tournament_index: int) -> dict[int, PlayerState]:
    # Stable deterministic spread to avoid pathological ties every round.
    rating_offset = tournament_index % 75
    return {
        pid: PlayerState(rating=1500 + rating_offset + ((pid * 17) % 350) - 175)
        for pid in range(1, player_count + 1)
    }


def build_trf(players: dict[int, PlayerState], rounds_per_tournament: int) -> Any:
    player_sections = [
        PlayerSection(
            code=PlayerCode.PLAYER,
            starting_number=pid,
            name=f"P{pid}",
            fide_rating=state.rating,
            points_times_ten=state.points_times_ten,
            rank=pid,
            results=list(state.results),
        )
        for pid, state in players.items()
    ]
    x_section = XSection(
        number_of_rounds=rounds_per_tournament,
        zeroed_ids=set(),
        scoring_point_system=build_scoring_system(),
        configuration=XSectionConfiguration(first_round_color=True, by_rank=False),
    )
    trf = ParsedTrf(player_sections=player_sections, x_section=x_section)
    trf.validate_contents()
    return trf


def apply_round_results(
    players: dict[int, PlayerState],
    pairings: list[Any],
    tournament_index: int,
    round_index: int,
) -> None:
    for pairing in pairings:
        white_id = pairing.white
        black_id = pairing.black

        if black_id == 0:
            players[white_id].results.append(
                RoundResult(
                    id=0,
                    color=ColorToken.BYE_OR_NOT_PAIRED,
                    result=ResultToken.PAIRING_ALLOCATED_BYE,
                )
            )
            players[white_id].points_times_ten += 20
            continue

        selector = (tournament_index + round_index + white_id * 3 + black_id * 5) % 6
        if selector in (0, 1):
            white_result = ResultToken.DRAW
            black_result = ResultToken.DRAW
            white_points = 10
            black_points = 10
        elif selector in (2, 3):
            white_result = ResultToken.WIN
            black_result = ResultToken.LOSS
            white_points = 20
            black_points = 0
        else:
            white_result = ResultToken.LOSS
            black_result = ResultToken.WIN
            white_points = 0
            black_points = 20

        players[white_id].results.append(
            RoundResult(id=black_id, color=ColorToken.WHITE, result=white_result)
        )
        players[black_id].results.append(
            RoundResult(id=white_id, color=ColorToken.BLACK, result=black_result)
        )
        players[white_id].points_times_ten += white_points
        players[black_id].points_times_ten += black_points


def run_tournament(player_count: int, rounds_per_tournament: int, tournament_index: int) -> None:
    players = initialize_players(player_count, tournament_index)

    for round_index in range(rounds_per_tournament):
        trf = build_trf(players, rounds_per_tournament)
        try:
            pairings = DutchEngine.generate_pairings(trf)
        except PairingError as exc:
            raise RuntimeError(
                f"py4swiss could not generate pairings at tournament={tournament_index}, "
                f"round={round_index + 1}: {exc}"
            ) from exc
        apply_round_results(players, pairings, tournament_index, round_index)


def regression_slope(samples: list[tuple[int, int]]) -> float:
    """
    Estimate RSS slope in bytes per sample index via simple least squares.
    """
    n = len(samples)
    if n < 2:
        return 0.0

    xs = [float(sample_index) for sample_index, _ in samples]
    ys = [float(rss_value) for _, rss_value in samples]
    x_mean = statistics.mean(xs)
    y_mean = statistics.mean(ys)

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator == 0:
        return 0.0
    return numerator / denominator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stress py4swiss pairing generation and check for sustained RSS growth."
    )
    parser.add_argument("--players", type=int, default=64, help="Players per tournament.")
    parser.add_argument(
        "--rounds-per-tournament",
        type=int,
        default=9,
        help="Rounds in each synthetic Swiss tournament.",
    )
    parser.add_argument(
        "--warmup-tournaments",
        type=int,
        default=100,
        help="Warmup tournaments excluded from growth calculation.",
    )
    parser.add_argument(
        "--measure-tournaments",
        type=int,
        default=3000,
        help="Measured tournaments for RSS growth assessment.",
    )
    parser.add_argument(
        "--sample-every",
        type=int,
        default=25,
        help="Record an RSS sample every N measured tournaments.",
    )
    parser.add_argument(
        "--gc-every",
        type=int,
        default=10,
        help="Run gc.collect() every N tournaments.",
    )
    parser.add_argument(
        "--max-growth-mb",
        type=float,
        default=20.0,
        help="Fail if smoothed RSS growth exceeds this many MiB.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print periodic RSS samples while running.",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable the live progress bar.",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if args.players < 4:
        raise ValueError("--players must be >= 4")
    if args.rounds_per_tournament < 1:
        raise ValueError("--rounds-per-tournament must be >= 1")
    if args.warmup_tournaments < 0:
        raise ValueError("--warmup-tournaments must be >= 0")
    if args.measure_tournaments < 1:
        raise ValueError("--measure-tournaments must be >= 1")
    if args.sample_every < 1:
        raise ValueError("--sample-every must be >= 1")
    if args.gc_every < 1:
        raise ValueError("--gc-every must be >= 1")
    if args.max_growth_mb < 0:
        raise ValueError("--max-growth-mb must be >= 0")


def main() -> int:
    args = parse_args()
    try:
        validate_args(args)
    except ValueError as exc:
        print(f"Invalid arguments: {exc}", file=sys.stderr)
        return 2

    total_tournaments = args.warmup_tournaments + args.measure_tournaments
    total_pairing_calls = total_tournaments * args.rounds_per_tournament
    print(
        "Running py4swiss stress test: "
        f"{total_tournaments} tournaments, "
        f"{args.rounds_per_tournament} rounds/tournament, "
        f"{total_pairing_calls} total pairing calls."
    )

    rss_start = rss_bytes()
    samples: list[tuple[int, int]] = []

    show_progress = not args.no_progress
    if show_progress and tqdm is None:
        print("tqdm is not installed; running without progress bar.")
        show_progress = False

    progress = (
        tqdm(total=total_tournaments, desc="Tournaments", unit="tournament", dynamic_ncols=True)
        if show_progress and tqdm is not None
        else None
    )

    for tournament_index in range(total_tournaments):
        run_tournament(args.players, args.rounds_per_tournament, tournament_index)

        if (tournament_index + 1) % args.gc_every == 0:
            gc.collect()

        measured_index = tournament_index - args.warmup_tournaments + 1
        should_sample = (
            tournament_index >= args.warmup_tournaments
            and (
                measured_index % args.sample_every == 0
                or measured_index == args.measure_tournaments
            )
        )
        if should_sample:
            gc.collect()
            current_rss = rss_bytes()
            samples.append((measured_index, current_rss))
            if args.verbose:
                print(
                    f"sample #{measured_index:6d}: "
                    f"RSS={mib(current_rss):8.2f} MiB"
                )
            if progress is not None:
                phase = "warmup" if tournament_index < args.warmup_tournaments else "measure"
                progress.set_postfix_str(
                    f"phase={phase} rss={mib(current_rss):.2f}MiB samples={len(samples)}"
                )
        if progress is not None:
            progress.update(1)

    if progress is not None:
        progress.close()

    gc.collect()
    rss_end = rss_bytes()

    # Smooth using a small head/tail window to reduce noise.
    window = min(5, len(samples))
    head_avg = statistics.mean(rss for _, rss in samples[:window]) if samples else float(rss_end)
    tail_avg = statistics.mean(rss for _, rss in samples[-window:]) if samples else float(rss_end)
    growth_bytes = int(tail_avg - head_avg)
    growth_mib = mib(growth_bytes)
    slope_bytes_per_sample = regression_slope(samples)
    slope_mib_per_sample = mib(slope_bytes_per_sample)
    bytes_per_pairing = growth_bytes / max(1, args.measure_tournaments * args.rounds_per_tournament)

    print()
    print("py4swiss memory stress summary")
    print(f"  PID:                           {os.getpid()}")
    print(f"  RSS at start:                  {mib(rss_start):.2f} MiB")
    print(f"  RSS at end:                    {mib(rss_end):.2f} MiB")
    print(f"  Smoothed head RSS avg:         {mib(head_avg):.2f} MiB")
    print(f"  Smoothed tail RSS avg:         {mib(tail_avg):.2f} MiB")
    print(f"  Smoothed growth:               {growth_mib:.2f} MiB")
    print(f"  Growth per pairing call:       {bytes_per_pairing:.2f} bytes")
    print(f"  RSS slope per sample window:   {slope_mib_per_sample:.6f} MiB/sample")

    threshold_bytes = args.max_growth_mb * 1024 * 1024
    if growth_bytes > threshold_bytes:
        print()
        print(
            "FAIL: RSS growth exceeded threshold "
            f"({growth_mib:.2f} MiB > {args.max_growth_mb:.2f} MiB).",
            file=sys.stderr,
        )
        return 1

    print()
    print(
        "PASS: no sustained RSS growth above threshold "
        f"({growth_mib:.2f} MiB <= {args.max_growth_mb:.2f} MiB)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
