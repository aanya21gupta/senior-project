#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found at $ENV_FILE"
  exit 1
fi

NGROK_URL=$(grep '^NGROK_URL=' "$ENV_FILE" | sed 's/^NGROK_URL=//' | tr -d '"' | tr -d "'")

if [ -z "$NGROK_URL" ]; then
  echo "Error: NGROK_URL is not set in $ENV_FILE"
  echo "Add a line like: NGROK_URL=https://your-id.ngrok-free.app"
  exit 1
fi

echo "Building Docker image..."
docker build -t clinical-app "$PROJECT_ROOT"

docker rm -f clinical-app 2>/dev/null || true

echo "Starting container..."
docker run -d \
  --name clinical-app \
  -p 8000:8000 \
  -e NGROK_URL="$NGROK_URL" \
  clinical-app

echo "App running at http://localhost:8000"
