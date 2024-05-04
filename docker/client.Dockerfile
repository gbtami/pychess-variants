FROM node:20

COPY package.json /app/
COPY cp2static.sh esbuild.mjs tsconfig.json /app/
COPY client /app/client/

WORKDIR /app

RUN yarn install --ignore-scripts
RUN yarn dev
