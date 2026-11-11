# ---- 1. Build the React dashboard ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python API that also serves the built dashboard ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/frontend/dist DATABASE_PATH=/data/careroute.db
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY eval/ eval/
COPY --from=web /web/dist frontend/dist
# Publish the reliability report inside the image so /api/eval works out of the box.
RUN python eval/run_eval.py --engine rules > /dev/null && mkdir -p /data
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
