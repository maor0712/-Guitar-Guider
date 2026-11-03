# --- Build the web app ---
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Python server (serves the API and the built web app) ---
FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv==0.13.7
# yt-dlp needs a JavaScript runtime to download from YouTube.
COPY --from=web /usr/local/bin/node /usr/local/bin/node

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev

# Bake the Demucs model into the image so the first song doesn't wait for a download.
RUN uv run --no-sync python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY --from=web /app/frontend/dist /app/frontend/dist

ENV GG_HOST=0.0.0.0 GG_DATA_DIR=/data
CMD ["uv", "run", "--no-sync", "guitar-guider-backend"]
