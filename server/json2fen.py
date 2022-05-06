import argparse
import os
import sys
import json

import pyffish as sf


def generate_fens(json_file, variant):
    if variant not in sf.variants():
        raise Exception("Unsupported variant: {}".format(variant))

    start_fen = sf.start_fen(variant)

    fens = set()
    with open(json_file, "r") as f:
        games = json.load(f)
        for game in games:
            if game["variant"] != variant:
                continue

            move_stack = []
            _id = game["id"]
            for move in game["moves"]:
                move_stack.append(move)
                fen = sf.get_fen(variant, start_fen, move_stack)
                if fen not in fens:
                    fens.add(fen)
                    yield fen, _id


def write_fens(json_file, stream, variant, count):
    generator = generate_fens(json_file, variant)
    for _ in range(count):
        fen, _id = next(generator)
        stream.write("{};variant {}".format(fen, variant) + (";id {}".format(_id)) + os.linesep)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input-file", help="json file containing pychess games")
    parser.add_argument(
        "-v", "--variant", default="chess", help="variant to generate positions for"
    )
    parser.add_argument(
        "-p", "--variant-path", default="", help="custom variants definition file path"
    )
    parser.add_argument("-c", "--count", type=int, default=1000, help="number of positions")

    args = parser.parse_args()
    sf.set_option("VariantPath", args.variant_path)
    write_fens(args.input_file, sys.stdout, args.variant, args.count)
