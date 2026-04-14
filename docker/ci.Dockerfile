FROM node:22 AS node


FROM python:3.13

COPY --from=node /usr/local/bin/ /usr/local/bin/
COPY --from=node /usr/local/include/ /usr/local/include/
COPY --from=node /usr/local/lib/ /usr/local/lib/
COPY --from=node /usr/local/share/ /usr/local/share/
COPY --from=node /opt/ /opt/

WORKDIR /workspace

COPY README.md /workspace/
COPY package.json yarn.lock /workspace/
COPY pyproject.toml /workspace/

RUN yarn install --ignore-scripts
RUN pip install .[dev]

CMD ["sleep", "infinity"]
