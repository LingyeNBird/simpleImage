ARG BUILDPLATFORM
ARG TARGETPLATFORM
ARG TARGETARCH

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-build

WORKDIR /app/web

COPY web/package.json web/bun.lock ./
RUN npm install

COPY VERSION /app/VERSION
COPY web ./
RUN NEXT_PUBLIC_APP_VERSION="$(cat /app/VERSION)" npm run build


FROM --platform=$TARGETPLATFORM python:3.13-slim AS app

ARG TARGETPLATFORM
ARG TARGETARCH

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY --from=web-build /usr/local/ /usr/local/

COPY main.py ./
COPY config.json ./
COPY docker_entrypoint.py ./
COPY VERSION ./
COPY services ./services
COPY --from=web-build /app/web ./web
COPY --from=web-build /app/web/out ./web_dist

EXPOSE 80
EXPOSE 8000

CMD ["python", "docker_entrypoint.py"]
