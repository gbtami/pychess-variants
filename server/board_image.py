from aiohttp import web, ClientSession


async def board_image_svg(request):
    fen = request.rel_url.query.get("fen")
    css = request.rel_url.query.get("css")
    width = request.rel_url.query.get("width")
    height = request.rel_url.query.get("height")
    arrows = request.rel_url.query.get("arrows", "")
    if arrows:
        arrows = "&arrows=%s" % arrows

    async with ClientSession() as session:
        service_url = "https://pychess-boardimage.onrender.com"
        url = "%s/board.svg?css=%s&width=%s&height=%s&fen=%s%s" % (
            service_url, css, width, height, fen, arrows
        )
        async with session.get(url) as response:
            svg = await response.text()

    return web.Response(text=svg, content_type="image/svg+xml")
