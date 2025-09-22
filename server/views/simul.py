from __future__ import annotations

from starlette.requests import Request
from starlette.responses import PlainTextResponse

from pychess_global_app_state import app_state, templates

async def simuls(request: Request):
    """Renders the list of simuls."""
    return templates.TemplateResponse(
        request,
        "simuls.html",
        {
            "request": request,
            "user": request.scope["user"],
            "view": "simuls",
        },
    )

async def simul_new(request: Request):
    """Renders the new simul form."""
    if request.method == "POST":
        # Handle form submission
        return PlainTextResponse("Simul created (not really)", status_code=200)
    else:
        return templates.TemplateResponse(
            request,
            "simul_new.html",
            {
                "request": request,
                "user": request.scope["user"],
                "view": "simul_new",
            },
        )

async def simul(request: Request):
    """Renders a single simul."""
    simulId = request.path_params["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return PlainTextResponse("Simul not found", status_code=404)

    return templates.TemplateResponse(
        request,
        "simul.html",
        {
            "request": request,
            "user": request.scope["user"],
            "view": "simul",
            "simul": simul,
        },
    )

async def start_simul(request: Request):
    """Starts a simul."""
    simulId = request.path_params["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return PlainTextResponse("Simul not found", status_code=404)

    if request.scope["user"].username != simul.created_by:
        return PlainTextResponse("Only the host can start the simul", status_code=403)

    await simul.start_simul()
    return PlainTextResponse("Simul started", status_code=200)
