import sys
import base64


def main(css_path):
    with open(css_path, "r") as f:
        line = f.readline()
        while line:
            if line.lstrip().startswith("background-image"):
                start_idx = line.find("url('") + 5
                end_idx = line.rfind("')")
                image_path = line[start_idx: end_idx].replace("../..", "static")

                image64 = encode_image(image_path)
                url64 = css_url(image64, image_path)
                sys.stdout.write("  background-image: %s" % url64)
                sys.stdout.write("\n")
            else:
                sys.stdout.write(line)

            line = f.readline()


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
