""" Generates EPD positions from JSON games file saved from pychess.org """

import argparse
import os
import sys
import json

import pyffish as sf


def generate_fens(json_file, stream, variant, count):
    if variant not in sf.variants():
        raise Exception("Unsupported variant: {}".format(variant))

    with open(json_file, "r") as f:
        games = json.load(f)
        cnt = 0
        for game in games:
            if game["variant"] != variant:
                continue

            moves = game["moves"]
            _id = game["id"]
            is960 = game["is960"] == 1
            if game["fen"]:
                start_fen = game["fen"]
            else:
                start_fen = sf.start_fen(variant)

            for i in range(len(moves)):
                fen = sf.get_fen(variant, start_fen, moves[:i], is960)
                stream.write("{};variant {};site https://www.pychess.org/{}{}".format(fen, variant, _id, os.linesep))

            cnt += 1
            if cnt >= count:
                break


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input-file", help="json file containing pychess games")
    parser.add_argument(
        "-v", "--variant", default="chess", help="variant to generate positions for"
    )
    parser.add_argument(
        "-p", "--variant-path", default="", help="custom variants definition file path"
    )
    parser.add_argument("-c", "--count", type=int, default=1000, help="number of games")

    args = parser.parse_args()
    sf.set_option("VariantPath", args.variant_path)
    generate_fens(args.input_file, sys.stdout, args.variant, args.count)
