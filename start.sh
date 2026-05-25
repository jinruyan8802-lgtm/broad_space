#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Defaults
export DB_USER=${DB_USER:-broadspace}
export DB_PASSWORD=${DB_PASSWORD:-change_me_in_production}
export DB_NAME=${DB_NAME:-broadspace}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379/0}
export LLM_BASE_URL=${LLM_BASE_URL:-http://localhost:1234/v1}
export LLM_MODEL=${LLM_MODEL:-}
export LLM_API_KEY=${LLM_API_KEY:-sk-null}

echo "=== BroadSpace Startup ==="

# 1. Start Docker services
echo "[1/5] Starting Docker services..."
docker compose up -d
echo "Waiting for services..."
sleep 5

# 2. Verify services
echo "[2/5] Verifying services..."
for i in {1..10}; do
    if docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1 && \
       redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
        echo "All services healthy"
        break
    fi
    echo "Waiting for services... ($i/10)"
    sleep 2
done

# 3. Build collector
echo "[3/5] Building Go collector..."
cd collector && go build -o bin/collector ./cmd/collector && cd ..

# 4. Run end-to-end test
echo "[4/5] Running integration test..."
export PYTHONPATH=processor/src
cd processor && source .venv/bin/activate && cd ..
cd api && source ../processor/.venv/bin/activate && cd ..

PYTHONPATH=processor/src \
DB_USER="$DB_USER" \
DB_PASSWORD="$DB_PASSWORD" \
DB_NAME="$DB_NAME" \
REDIS_URL="$REDIS_URL" \
python -m pytest tests/integration/test_pipeline.py -v

echo "[5/5] Starting services in background..."
# Start collector (background)
./collector/bin/collector &
COLLECTOR_PID=$!

# Start processor worker (background)
cd processor && source .venv/bin/activate && PYTHONPATH=src python -m processor.worker &
PROCESSOR_PID=$!
cd ..

# Start API server (background)
cd api && source ../processor/.venv/bin/activate && PYTHONPATH=../processor/src uvicorn main:app --host 0.0.0.0 --port 8000 &
API_PID=$!
cd ..

echo ""
echo "=== BroadSpace is running ==="
echo "API:        http://localhost:8000"
echo "Miniflux:   http://localhost:8080 (admin:admin123)"
echo "Collector:  PID $COLLECTOR_PID"
echo "Processor:  PID $PROCESSOR_PID"
echo "API Server: PID $API_PID"
echo ""
echo "To stop: kill $COLLECTOR_PID $PROCESSOR_PID $API_PID"
echo "To test API: curl http://localhost:8000/health"