FROM node:22 AS frontend

WORKDIR /app

COPY package.json /app/
COPY cp2static.sh md2html.sh md2html.js esbuild.mjs tsconfig.json yarn.lock /app/

COPY static /app/static/

RUN yarn install

COPY client /app/client/

RUN yarn dev

COPY templates /app/templates/
RUN yarn md


FROM python:3.12

COPY pyproject.toml /app/

WORKDIR /app

RUN pip install --default-timeout=100 .

COPY lang /app/lang/
COPY server /app/server/
COPY --from=frontend /app/static /app/static/
COPY --from=frontend /app/templates /app/templates/
COPY variants.ini /app/

EXPOSE 8080

CMD ["python", "server/server.py", "-v"]
