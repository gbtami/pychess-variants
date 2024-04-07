import os
import sys
import base64


def main(css_path):
    if os.path.isdir(css_path):
        for root, dirs, files in os.walk(css_path):
            print("===", root, dirs, files)
            root_css_dir = root.replace("piece", "piece-css")
            if not os.path.exists(root_css_dir):
                os.makedirs(root_css_dir)

            for dir_name in dirs:
                print("---", dir_name)
                piece_css_dir = os.path.join(root.replace("piece", "piece-css"), dir_name)
                print(piece_css_dir)
                if not os.path.exists(piece_css_dir):
                    os.makedirs(piece_css_dir)

            for name in files:
                print(os.path.join(root, name))
                image_to_css(os.path.join(root, name))
    else:
        image_to_css(css_path)


def image_to_css(css_path):
    piece_css_path = css_path.replace("piece", "piece-css")

    with open(css_path, "r") as f1, open(piece_css_path, "w") as f2:
        line = f1.readline()
        while line:
            if line.lstrip().startswith("background-image"):
                start_idx = line.find("url('") + 5
                end_idx = line.rfind("')")
                image_path = line[start_idx: end_idx].replace("../..", "static")

                image64 = encode_image(image_path)
                url64 = css_url(image64, image_path)
                f2.write("  background-image: %s" % url64)
                f2.write("\n")
            else:
                f2.write(line)

            line = f1.readline()


def css_url(base64string, image_path):
    mime = "svg+xml" if image_path.endswith(".svg") else "png"
    return "url('data:image/%s;base64,%s')" % (mime, base64string)


def encode_image(image_path):
    try:
        with open(image_path, "rb") as f:
            data = f.read()
    except OSError:
        sys.exit(1)
    return base64.b64encode(data).decode()


if __name__ == "__main__":
    main(sys.argv[1])
