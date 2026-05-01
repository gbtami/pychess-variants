import sys
import base64
from pathlib import Path


STATIC_DIR = Path("static")
PIECE_DIR = STATIC_DIR / "piece"
PIECE_CSS_DIR = STATIC_DIR / "piece-css"


def main(css_path):
    css_path = Path(css_path)
    if css_path.is_dir():
        for path in css_path.rglob("*.css"):
            print(path)
            image_to_css(path)
    else:
        image_to_css(css_path)


def image_to_css(css_path):
    css_path = Path(css_path)
    piece_css_path = generated_css_path(css_path, PIECE_CSS_DIR)
    relative_path = css_path.relative_to(PIECE_DIR)
    root_scope = len(relative_path.parts) == 1
    class_name = piece_style_class_name(relative_path)
    family = None if root_scope else relative_path.parent.name

    piece_css_path.parent.mkdir(parents=True, exist_ok=True)

    with open(css_path, "r") as f1, open(piece_css_path, "w") as f2:
        line = f1.readline()
        while line:
            if line.lstrip().startswith("background-image"):
                start_idx = line.find("url('") + 5
                end_idx = line.rfind("')")
                image_path = line[start_idx:end_idx].replace("../..", "static")
                print(image_path)
                if not Path(image_path).exists():
                    print("! Missing file", image_path)
                    image_path = "static/images/pieces/invisible.svg"

                image64 = encode_image(image_path)
                url64 = css_url(image64, image_path)
                line = "  background-image: %s\n" % url64

            f2.write(scoped_css_line(line, class_name, family=family, root_scope=root_scope))
            line = f1.readline()


def generated_css_path(css_path: Path, output_dir: Path) -> Path:
    return output_dir / css_path.relative_to(PIECE_DIR)


def piece_style_class_name(relative_path: Path) -> str:
    if len(relative_path.parts) == 1:
        return "piece-style-%s" % relative_path.stem
    return "piece-style-%s-%s" % (relative_path.parent.name, relative_path.stem)


def scoped_css_line(
    line: str, class_name: str, family: str | None = None, root_scope: bool = False
) -> str:
    if "{" not in line:
        return line

    selector, body = line.split("{", 1)
    if not selector.strip() or selector.lstrip().startswith("@"):
        return line

    scope = ".%s" % class_name
    if root_scope:
        scope = "%s%s" % (scope, scope)

    selectors = []
    for item in selector.split(","):
        stripped = item.strip()
        family_prefix = ".%s " % family
        if family is not None and stripped.startswith(family_prefix):
            stripped = stripped[len(family_prefix) :]
        if not stripped:
            continue
        if stripped.startswith("."):
            selectors.append("%s%s" % (scope, stripped))
        else:
            selectors.append("%s %s" % (scope, stripped))
    if selectors:
        return "%s {%s" % (", ".join(selectors), body)
    else:
        return line


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
