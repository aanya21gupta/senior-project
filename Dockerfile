# Stage 1: build Next.js static export
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: run FastAPI proxy + static files
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY backend/pyproject.toml .
RUN uv pip install --system --no-cache .
COPY backend/main.py .
COPY --from=frontend-builder /frontend/out ./static
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
