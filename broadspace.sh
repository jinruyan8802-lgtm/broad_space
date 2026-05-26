#!/bin/bash
set -e

PID_FILE="/tmp/broadspace.pid"
LOG_DIR="logs"

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
    mkdir -p "$LOG_DIR"
    echo "Stopping BroadSpace services..." | tee -a "$LOG_DIR/startup.log"
    # Kill application processes by PID
    for pid in $(get_pids); do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    rm -f "$PID_FILE"
    # Kill any remaining child processes by name (subshell PIDs may not propagate)
    pkill -f "processor.worker" 2>/dev/null || true
    pkill -f "feed-server.js" 2>/dev/null || true
    pkill -f "bin/collector" 2>/dev/null || true
    # Stop Docker services
    docker compose down 2>/dev/null || true
    echo "Stopped."
}

start_services() {
    cd /home/jinru/workon/broad_space
    load_env

    mkdir -p "$LOG_DIR"
    echo "=== BroadSpace Startup ===" | tee -a "$LOG_DIR/startup.log"

    # 1. Start Docker services
    echo "[1/5] Starting Docker services..." | tee -a "$LOG_DIR/startup.log"
    docker compose up -d 2>&1 | tee -a "$LOG_DIR/startup.log"
    echo "Waiting for services..." | tee -a "$LOG_DIR/startup.log"
    sleep 5

    # 2. Wait for services to be healthy
    echo "[2/5] Verifying services..." | tee -a "$LOG_DIR/startup.log"
    for i in $(seq 1 30); do
        STATUS=$(docker compose ps --format "{{.Status}}" 2>/dev/null | head -1)
        if [[ "$STATUS" == *"Up"* ]] || [[ "$STATUS" == *"healthy"* ]]; then
            echo "Services ready" | tee -a "$LOG_DIR/startup.log"
            break
        fi
        echo "Waiting for services... ($i/30)" | tee -a "$LOG_DIR/startup.log"
        sleep 2
    done

    # 3. Build collector
    echo "[3/5] Building Go collector..." | tee -a "$LOG_DIR/startup.log"
    cd collector && go build -o bin/collector ./cmd/collector 2>&1 | tee -a "../$LOG_DIR/startup.log" && cd ..

    # 4. Start application services in background
    echo "[4/5] Starting application services..." | tee -a "$LOG_DIR/startup.log"
    rm -f "$PID_FILE"

    # Collector
    ./collector/bin/collector >> "$LOG_DIR/collector.log" 2>&1 &
    echo $! >> "$PID_FILE"

    # Processor worker
    (cd processor && source .venv/bin/activate && PYTHONPATH=src python -m processor.worker >> "../$LOG_DIR/processor.log" 2>&1) &
    echo $! >> "$PID_FILE"

    # 5. Start web feed server (standalone Node.js HTTP server)
    echo "[5/5] Starting web feed server..." | tee -a "$LOG_DIR/startup.log"
    (cd /home/jinru/workon/broad_space/web && node feed-server.js >> "../$LOG_DIR/web.log" 2>&1) &
    echo $! >> "$PID_FILE"

    echo "" | tee -a "$LOG_DIR/startup.log"
    echo "=== BroadSpace is running ===" | tee -a "$LOG_DIR/startup.log"
    echo "Docker Services:" | tee -a "$LOG_DIR/startup.log"
    docker compose ps 2>&1 | tee -a "$LOG_DIR/startup.log"
    echo "" | tee -a "$LOG_DIR/startup.log"
    echo "Application Services:"
    echo "  Collector:  ./collector/bin/collector (PID $(sed -n '1p' "$PID_FILE" 2>/dev/null || echo "?"))"
    echo "  Processor:  Python worker (PID $(sed -n '2p' "$PID_FILE" 2>/dev/null || echo "?"))"
    echo "  Web:        Next.js dev (PID $(sed -n '3p' "$PID_FILE" 2>/dev/null || echo "?"))"
    echo ""
    echo "Web URLs:"
    echo "  Web App:    http://localhost:3000"
    echo "  API:        http://localhost:8000"
    echo "  Miniflux:   http://localhost:8080 (admin:admin123)"
    echo "  Neo4j:      http://localhost:7474 (neo4j/broadspace)"
    echo "  Prometheus: http://localhost:9090"
    echo "  Grafana:    http://localhost:3001 (admin:admin)"
    echo ""
    echo "Logs:       ./$LOG_DIR/"
    echo "  - collector.log    (Go collector)"
    echo "  - processor.log    (Python processor)"
    echo "  - web.log          (Next.js)"
    echo "  - startup.log      (Orchestration)"
}

get_status() {
    echo "=== BroadSpace Services Status ==="
    echo ""

    if [ -f "$PID_FILE" ]; then
        echo "Application Processes:"
        echo "+------+------------------------------+------------------+"
        printf "| %-4s | %-28s | %-14s |\n" "PID" "Service" "Status"
        echo "+------+------------------------------+------------------+"

        local idx=1
        while IFS= read -r pid; do
            local name=""
            case $idx in
                1) name="collector" ;;
                2) name="processor" ;;
                3) name="web" ;;
            esac

            if kill -0 "$pid" 2>/dev/null; then
                printf "| %-4s | %-28s | %-14s |\n" "$pid" "$name" "running"
            else
                printf "| %-4s | %-28s | %-14s |\n" "$pid" "$name" "stopped"
            fi
            idx=$((idx + 1))
        done < "$PID_FILE"
        echo "+------+------------------------------+------------------+"
    else
        echo "No PID file found (services not running?)"
    fi

    echo ""
    echo "Docker Services:"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No Docker services running"

    echo ""
    echo "Web Endpoints:"
    echo "  Web App:    $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || echo "down")"
    echo "  API Health: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health 2>/dev/null || echo "down")"
    echo "  API Metrics:$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/metrics 2>/dev/null || echo "down")"
}

run_test() {
    load_env
    echo "=== Running Integration Test ==="
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
    status)
        get_status
        ;;
    test)
        run_test
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|test}"
        exit 1
        ;;
esac