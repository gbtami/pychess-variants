# Docker workflows

This folder contains the Docker images used for local pychess development.

## Services

- `server`: runs the pychess server on `http://localhost:8080`
- `mongodb`: database used by the server
- `mongo-express`: optional MongoDB browser on `http://localhost:8081`
- `ci`: optional contributor container for linting, type-checking, and tests

## First start

Build and start the application stack:

```bash
docker compose up --build
```

Open `http://localhost:8080` in your browser.

Stop the stack with:

```bash
docker compose down
```

## Modify assets or code and try changes in the browser

The current Docker app workflow is rebuild-based. Changes on the host are not live-reloaded into
the running `server` container.

Typical loop:

1. Start the stack:

   ```bash
   docker compose up --build
   ```

2. Edit files in the repo, for example:
   - `static/images/pieces/...` for piece sets
   - `static/...` for other static assets
   - `client/...` for TypeScript
   - `templates/...` for templates
   - `server/...` for backend code

3. Rebuild and restart the server container:

   ```bash
   docker compose build server
   docker compose up -d server
   ```

4. Refresh the browser. If the old asset is cached, do a hard refresh.

Watch server logs with:

```bash
docker compose logs -f server
```

## Run checks inside Docker

Build the contributor image once:

```bash
docker compose build ci
```

Run one-off checks:

```bash
docker compose run --rm ci ruff format .
docker compose run --rm ci ruff check .
docker compose run --rm ci pyright
docker compose run --rm ci yarn test
docker compose run --rm ci env PYTHONPATH=server python -m unittest discover -s tests
```

## Open an interactive shell for contributor work

Start MongoDB and the `ci` container:

```bash
docker compose --profile ci up -d mongodb ci
```

Open a shell:

```bash
docker compose exec ci bash
```

Then run commands inside the container, for example:

```bash
ruff format .
ruff check .
pyright
yarn test
env PYTHONPATH=server python -m unittest discover -s tests
```

## MongoDB host access

MongoDB is not exposed to the host by default. The server container connects to it over the
internal compose network, so no host port is needed for normal pychess development.

If you want to connect from the host machine with tools like `mongosh` or MongoDB Compass,
uncomment the `mongodb` port mapping in `docker-compose.yaml`.

## Notes

- MongoDB is pinned to `4.4.x` because MongoDB `5.0+` requires AVX, and we want the Docker setup
  to keep working on older CPUs.
- The `ci` service uses a named Docker volume for `node_modules`, so contributors do not need a
  local Node install just to run checks in Docker.
