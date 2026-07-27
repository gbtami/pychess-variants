#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass

import pyffish as sf

DEFAULT_ENGINE = os.environ.get("FAIRY_STOCKFISH_PATH", "stockfish")
_CURRENT_PYFFISH_VARIANT_PATH: str | None = None


@dataclass
class ProbeResult:
    ok: bool
    fen: str | None
    error: str | None = None


class UciEngine:
    def __init__(self, engine_path: str, variant: str, variant_path: str, chess960: bool) -> None:
        self.engine_path = engine_path
        self.variant = variant
        self.variant_path = variant_path
        self.chess960 = chess960
        self.engine_dir = os.path.dirname(engine_path)

    def get_fen(self, start_fen: str, moves: list[str]) -> ProbeResult:
        try:
            process = subprocess.Popen(
                [self.engine_path],
                cwd=self.engine_dir,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            return ProbeResult(False, None, "failed to start engine: %s" % exc)

        try:
            position_cmd = "position fen %s" % start_fen
            if moves:
                position_cmd += " moves %s" % " ".join(moves)
            commands = [
                "uci",
                "setoption name VariantPath value %s" % self.variant_path,
                "setoption name UCI_Chess960 value %s" % str(self.chess960).lower(),
                "setoption name UCI_Variant value %s" % self.variant,
                "isready",
                position_cmd,
                "d",
                "quit",
            ]
            assert process.stdin is not None
            process.stdin.write("\n".join(commands) + "\n")
            process.stdin.flush()
            stdout, _ = process.communicate(timeout=5)
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            try:
                process.kill()
            except OSError:
                pass
            process.communicate()
            return ProbeResult(False, None, str(exc))

        for line in stdout.splitlines():
            if line.startswith("Fen: "):
                return ProbeResult(True, line[5:].strip())

        return ProbeResult(False, None, "engine did not produce a FEN")


def parse_uci_line(uci_line: str) -> tuple[str, list[str]]:
    marker = " moves "
    if marker not in uci_line:
        raise ValueError("expected a UCI line containing ' moves '")
    prefix, moves = uci_line.split(marker, 1)
    if not prefix.startswith("position fen "):
        raise ValueError("expected a UCI line starting with 'position fen '")
    return prefix[len("position fen ") :].strip(), [move for move in moves.split() if move]


def pyffish_fen(
    variant: str, variant_path: str, start_fen: str, moves: list[str], chess960: bool
) -> ProbeResult:
    try:
        global _CURRENT_PYFFISH_VARIANT_PATH
        if _CURRENT_PYFFISH_VARIANT_PATH != variant_path:
            sf.set_option("VariantPath", variant_path)
            _CURRENT_PYFFISH_VARIANT_PATH = variant_path
        return ProbeResult(True, sf.get_fen(variant, start_fen, moves, chess960))
    except (RuntimeError, TypeError, ValueError) as exc:
        return ProbeResult(False, None, "%s: %s" % (type(exc).__name__, exc))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Compare pyffish replay against a UCI engine on every move prefix."
    )
    parser.add_argument(
        "--engine",
        default=DEFAULT_ENGINE,
        help=(
            "Fairy-Stockfish executable (defaults to FAIRY_STOCKFISH_PATH or 'stockfish' on PATH)"
        ),
    )
    parser.add_argument("--variant", default="borderlands")
    parser.add_argument("--chess960", action="store_true")
    parser.add_argument("--engine-variant-path")
    parser.add_argument("--pyffish-variant-path")
    parser.add_argument("--uci-line", required=True)
    args = parser.parse_args(argv)

    start_fen, moves = parse_uci_line(args.uci_line)
    engine_dir = os.path.dirname(os.path.abspath(args.engine))
    engine_variant_path = args.engine_variant_path or os.path.join(engine_dir, "variants.ini")
    pyffish_variant_path = args.pyffish_variant_path or engine_variant_path

    engine = UciEngine(args.engine, args.variant, engine_variant_path, args.chess960)

    print("engine:", args.engine, flush=True)
    print("engine_variant_path:", engine_variant_path, flush=True)
    print("pyffish_variant_path:", pyffish_variant_path, flush=True)
    print("start_fen:", start_fen, flush=True)
    print("plies:", len(moves), flush=True)

    for ply in range(len(moves) + 1):
        prefix = moves[:ply]
        py_result = pyffish_fen(
            args.variant, pyffish_variant_path, start_fen, prefix, args.chess960
        )
        engine_result = engine.get_fen(start_fen, prefix)

        if py_result.ok and engine_result.ok and py_result.fen == engine_result.fen:
            print("OK ply=%d" % ply, flush=True)
            continue

        print("MISMATCH ply=%d" % ply, flush=True)
        if ply > 0:
            print("move:", moves[ply - 1], flush=True)
        print("prefix:", " ".join(prefix), flush=True)
        print("pyffish_ok:", py_result.ok, flush=True)
        print("pyffish_fen:", py_result.fen, flush=True)
        print("pyffish_error:", py_result.error, flush=True)
        print("engine_ok:", engine_result.ok, flush=True)
        print("engine_fen:", engine_result.fen, flush=True)
        print("engine_error:", engine_result.error, flush=True)
        return 1

    print("No divergence found.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
