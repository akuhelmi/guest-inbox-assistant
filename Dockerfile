# One image: FastAPI serves the API and the built React app on port 8000.

# --- Stage 1: build the frontend ---
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python runtime ---
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/static \
    DATABASE_URL=sqlite:////app/data/guest_inbox.db
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt uvicorn==0.54.0
COPY backend/app ./app
COPY --from=web /web/dist ./static
RUN useradd --create-home appuser && mkdir -p /app/data && chown appuser /app/data
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
