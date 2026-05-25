#!/bin/bash
set -e

PID_FILE="/tmp/broadspace.pid"

load_env() {
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    fi
    export DB_USER=${DB_USER:-broadspace}
    export DB_PASSWORD=${DB_PASSWORD:-change_me_in_production}
    export DB_NAME=${DB_NAME:-broadspace}
    export DB_HOST=${DB_HOST:-localhost}
    export REDIS_URL=${REDIS_URL:-redis://localhost:6379/0}
    export LLM_BASE_URL=${LLM_BASE_URL:-http://localhost:1234/v1}
    export LLM_MODEL=${LLM_MODEL:-}
    export LLM_API_KEY=${LLM_API_KEY:-sk-null}
}

get_pids() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE"
    else
        echo ""
    fi
}

stop_services() {
    echo "Stopping BroadSpace services..."
    # Kill application processes
    for pid in $(get_pids); do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    rm -f "$PID_FILE"
    # Stop Docker services
    docker compose down 2>/dev/null || true
    echo "Stopped."
}

start_services() {
    load_env

    echo "=== BroadSpace Startup ==="

    # 1. Start Docker services
    echo "[1/4] Starting Docker services..."
    docker compose up -d
    echo "Waiting for services..."
    sleep 5

    # 2. Verify services
    echo "[2/4] Verifying services..."
    for i in {1..10}; do
        if docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
            echo "PostgreSQL ready"
            break
        fi
        echo "Waiting for PostgreSQL... ($i/10)"
        sleep 2
    done

    # 3. Build collector
    echo "[3/4] Building Go collector..."
    cd collector && go build -o bin/collector ./cmd/collector && cd ..

    # 4. Start services in background
    echo "[4/4] Starting application services..."
    rm -f "$PID_FILE"

    # Collector
    ./collector/bin/collector &
    echo $! >> "$PID_FILE"

    # Processor worker
    (cd processor && source .venv/bin/activate && PYTHONPATH=src python -m processor.worker) &
    echo $! >> "$PID_FILE"

    # API server
    (cd api && source ../processor/.venv/bin/activate && PYTHONPATH=../processor/src uvicorn main:app --host 0.0.0.0 --port 8000) &
    echo $! >> "$PID_FILE"

    echo ""
    echo "=== BroadSpace is running ==="
    echo "API:        http://localhost:8000"
    echo "Miniflux:   http://localhost:8080 (admin:admin123)"
    echo "PIDs:       $(tr '\n' ' ' < "$PID_FILE")"
}

run_test() {
    load_env
    echo "=== Running Integration Test ==="
    export PYTHONPATH=processor/src
    PYTHONPATH=processor/src \
    DB_USER="$DB_USER" \
    DB_PASSWORD="$DB_PASSWORD" \
    DB_NAME="$DB_NAME" \
    DB_HOST="$DB_HOST" \
    REDIS_URL="$REDIS_URL" \
    python -m pytest tests/integration/test_pipeline.py -v
}

case "${1:-start}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 2
        start_services
        ;;
    test)
        run_test
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|test}"
        exit 1
        ;;
esac