import unittest

from aiohttp import web

import test_logger
from catalogued_variants import (
    _canonical_piece_set_filename,
    _catalogued_board_svg_css,
    _catalogued_disguised_piece_css,
    _sanitize_catalogued_board_svg,
    _sanitize_catalogued_piece_svg,
)

test_logger.init_test_logger()


class CataloguedVariantPieceSvgSanitizerTestCase(unittest.TestCase):
    def test_canonical_filename_accepts_percent_encoded_plus(self) -> None:
        self.assertEqual("w+O.svg", _canonical_piece_set_filename("w%2BO.svg"))
        self.assertEqual("b+O.svg", _canonical_piece_set_filename("b%2bO.svg"))

    def test_accepts_leading_xml_declaration(self) -> None:
        svg = b"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45">
  <path d="M 1 1 L 10 10" fill="#000"/>
</svg>
"""

        sanitized = _sanitize_catalogued_piece_svg(svg, "wP.svg")

        self.assertNotIn("<?xml", sanitized)
        self.assertIn("<svg", sanitized)
        self.assertIn('xmlns="http://www.w3.org/2000/svg"', sanitized)

    def test_strips_comments_metadata_and_unsafe_attrs_but_keeps_safe_style(self) -> None:
        svg = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <!-- editor note -->
  <metadata><foo /></metadata>
  <g inkscape:label="Layer 1" style="display:inline">
    <path class="piece" id="p1" style="fill:#000;stroke:#fff;stroke-width:2;display:inline" d="M 0 0 L 10 10" />
  </g>
</svg>
"""

        sanitized = _sanitize_catalogued_piece_svg(svg, "wP.svg")

        self.assertNotIn("<!--", sanitized)
        self.assertNotIn("metadata", sanitized)
        self.assertNotIn("class=", sanitized)
        self.assertNotIn("id=", sanitized)
        self.assertNotIn("display:inline", sanitized)
        self.assertIn('fill="#000"', sanitized)
        self.assertIn('stroke="#fff"', sanitized)
        self.assertIn('stroke-width="2"', sanitized)
        self.assertIn('d="M 0 0 L 10 10"', sanitized)

    def test_strips_legacy_external_svg_doctype(self) -> None:
        svg = b"""<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
 "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45">
  <path d="M 1 1 L 10 10" fill="#000"/>
</svg>
"""

        sanitized = _sanitize_catalogued_piece_svg(svg, "wP.svg")

        self.assertNotIn("<!DOCTYPE", sanitized)
        self.assertIn("<svg", sanitized)
        self.assertIn('d="M 1 1 L 10 10"', sanitized)

    def test_rejects_doctype_with_internal_subset(self) -> None:
        svg = b"""<!DOCTYPE svg [<!ENTITY bad SYSTEM "file:///etc/passwd">]>
<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45">&bad;</svg>
"""

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _sanitize_catalogued_piece_svg(svg, "wP.svg")

        self.assertIn("unsupported doctypes", exc.exception.text)

    def test_rejects_non_xml_processing_instruction(self) -> None:
        svg = b"""<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="evil.css"?>
<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45"></svg>
"""

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _sanitize_catalogued_piece_svg(svg, "wP.svg")

        self.assertIn("processing instructions", exc.exception.text)

    def test_catalogued_disguised_css_contains_board_and_preview_selectors(self) -> None:
        css = _catalogued_disguised_piece_css("wildebeest")

        self.assertIn(".piece-style-catalogued-wildebeest-disguised piece.white", css)
        self.assertIn(".piece-style-catalogued-wildebeest-disguised piece.black", css)
        self.assertIn(
            "label.piece.catalogued-disguised-preview.piece-style-catalogued-wildebeest-disguised.white",
            css,
        )


class CataloguedVariantBoardSvgTestCase(unittest.TestCase):
    def test_accepts_board_svg_matching_variant_aspect_ratio(self) -> None:
        svg = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">
  <rect x="0" y="0" width="1000" height="800" fill="#f0d9b5"/>
  <rect x="0" y="0" width="100" height="800" fill="#cc0000" opacity="0.25"/>
</svg>"""

        sanitized = _sanitize_catalogued_board_svg(svg, "board.svg", 10, 8)

        self.assertIn('viewBox="0 0 1000 800"', sanitized)
        self.assertIn('fill="#cc0000"', sanitized)

    def test_accepts_board_svg_with_internal_pattern_fill(self) -> None:
        svg = b"""<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
  <pattern id="a" height="100" patternUnits="userSpaceOnUse" width="100">
    <path d="m0 0h100v100h-100z" fill="#efd783" stroke="#000" stroke-width="2"/>
  </pattern>
  <path d="m0 0h800v800h-800z" fill="url(#a)"/>
</svg>"""

        sanitized = _sanitize_catalogued_board_svg(svg, "makruk.svg", 8, 8)

        self.assertIn("<pattern", sanitized)
        self.assertIn('id="a"', sanitized)
        self.assertIn('fill="url(#a)"', sanitized)

    def test_rejects_board_svg_without_view_box(self) -> None:
        svg = b"""<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800">
  <rect x="0" y="0" width="1000" height="800" fill="#f0d9b5"/>
</svg>"""

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _sanitize_catalogued_board_svg(svg, "board.svg", 10, 8)

        self.assertIn("viewBox", exc.exception.text)

    def test_rejects_board_svg_with_wrong_aspect_ratio(self) -> None:
        svg = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
  <rect x="0" y="0" width="1000" height="1000" fill="#f0d9b5"/>
</svg>"""

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _sanitize_catalogued_board_svg(svg, "board.svg", 10, 8)

        self.assertIn("aspect ratio", exc.exception.text)

    def test_board_css_overrides_board_and_preview_backgrounds(self) -> None:
        css = _catalogued_board_svg_css(
            "regionchess",
            {"svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" />'},
        )

        self.assertIn('[data-board-variant="regionchess"] cg-board', css)
        self.assertIn('[data-board-variant="regionchess"].catalogued-board-preview-surface', css)
        self.assertIn(
            'label.board.catalogued-custom-board-preview[data-board-variant="regionchess"]',
            css,
        )
        self.assertIn('background-image: url("data:image/svg+xml;base64,', css)
        self.assertIn("!important", css)
