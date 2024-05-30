from aiohttp import web, ClientSession

from settings import URI


async def board_image_svg(request):
    fen = request.rel_url.query.get("fen")
    css = request.rel_url.query.get("css")
    width = request.rel_url.query.get("width")
    height = request.rel_url.query.get("height")
    arrows = request.rel_url.query.get("arrows", "")
    if arrows:
        arrows = "&arrows=%s" % arrows

    async with ClientSession() as session:
        # TODO: use board image service URL
        uri = URI.replace("8080", "8000")
        async with session.get(
            "%s/board.svg?css=%s&width=%s&height=%s&fen=%s%s"
            % (uri, css, width, height, fen, arrows)
        ) as response:
            svg = await response.text()

    return web.Response(text=svg, content_type="image/svg+xml")
