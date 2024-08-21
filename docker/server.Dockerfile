FROM node:20 AS frontend

WORKDIR /app

COPY package.json /app/
COPY cp2static.sh md2html.sh esbuild.mjs tsconfig.json yarn.lock /app/

RUN yarn install --ignore-scripts

COPY client /app/client/
COPY static /app/static/

RUN yarn dev

COPY templates /app/templates/
RUN yarn md


FROM python:3.12

COPY requirements.txt /app/

WORKDIR /app

RUN pip install -r requirements.txt

COPY lang /app/lang/
COPY server /app/server/
COPY --from=frontend /app/static /app/static/
COPY --from=frontend /app/templates /app/templates/
COPY variants.ini /app/

EXPOSE 8080

CMD ["python", "server/server.py", "-v"]
