#!/bin/bash
set -e

PID_FILE="/tmp/broadspace.pid"
LOG_DIR="logs"

# Helper: log with timestamp to both stdout and startup.log
log_ts() {
    local ts="[$(date '+%Y-%m-%d %H:%M:%S')]"
    mkdir -p "$LOG_DIR" 2>/dev/null
    echo "$ts $*" | tee -a "$LOG_DIR/startup.log"
}

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
    log_ts "Stopping BroadSpace services..."
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
    pkill -f "next-server" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "bin/collector" 2>/dev/null || true
    # Stop Docker services
    docker compose down 2>/dev/null || true
    echo "Stopped."
}

start_services() {
    cd /home/jinru/workon/broad_space
    load_env

    mkdir -p "$LOG_DIR"
    log_ts "=== BroadSpace Startup ==="

    # 1. Start Docker services
    log_ts "[1/5] Starting Docker services..."
    docker compose up -d 2>&1 | while IFS= read -r line; do log_ts "$line"; done
    log_ts "Waiting for services..."
    sleep 5

    # 2. Wait for services to be healthy
    log_ts "[2/5] Verifying services..."
    for i in $(seq 1 30); do
        STATUS=$(docker compose ps --format "{{.Status}}" 2>/dev/null | head -1)
        if [[ "$STATUS" == *"Up"* ]] || [[ "$STATUS" == *"healthy"* ]]; then
            log_ts "Services ready"
            break
        fi
        log_ts "Waiting for services... ($i/30)"
        sleep 2
    done

    # 3. Build collector
    log_ts "[3/5] Building Go collector..."
    (cd collector && go build -o bin/collector ./cmd/collector 2>&1 | while IFS= read -r line; do log_ts "$line"; done)

    # 4. Start application services in background
    log_ts "[4/5] Starting application services..."
    rm -f "$PID_FILE"

    # Collector
    ./collector/bin/collector >> "$LOG_DIR/collector.log" 2>&1 &
    echo $! >> "$PID_FILE"

    # Processor worker
    (cd processor && source .venv/bin/activate && PYTHONPATH=src python -m processor.worker >> "../$LOG_DIR/processor.log" 2>&1) &
    echo $! >> "$PID_FILE"

    # 5. Start Next.js web app
    log_ts "[5/5] Starting Next.js web app..."
    (cd /home/jinru/workon/broad_space/web && npm run dev 2>&1 | while IFS= read -r line; do echo "[$(date '+%Y-%m-%d %H:%M:%S')] $line"; done >> "../$LOG_DIR/web.log") &
    echo $! >> "$PID_FILE"

    log_ts ""
    log_ts "=== BroadSpace is running ==="
    log_ts "Docker Services:"
    docker compose ps 2>&1 | while IFS= read -r line; do log_ts "$line"; done
    log_ts ""

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
    echo "  - web.log          (web feed server)"
    echo "  - startup.log      (Orchestration)"
}

find_pids_by_pattern() {
    # Returns lines of "PID|command" for matching processes, sorted by PID
    ps aux 2>/dev/null | grep -E "$1" | grep -v grep | awk '{printf "%s|%s\n", $2, $11}' | sort -n
}

show_service_status() {
    local name="$1" main_pattern="$2" all_pattern="$3"
    [ -z "$all_pattern" ] && all_pattern="$main_pattern"

    local main_pid main_cmd
    main_pid=$(ps aux 2>/dev/null | grep -E "$main_pattern" | grep -v grep | awk '{print $2}' | head -1)
    main_cmd=$(ps aux 2>/dev/null | grep -E "$main_pattern" | grep -v grep | awk '{print $11}' | head -1)

    if [ -z "$main_pid" ]; then
        printf "| %-8s | %-28s | %-14s |\n" "-" "$name" "not found"
        return
    fi

    printf "| %-8s | %-28s | %-14s |\n" "$main_pid" "$name" "running"

    # Show other related processes as children
    local children
    children=$(ps aux 2>/dev/null | grep -E "$all_pattern" | grep -v grep | awk '{printf "%s|%s\n", $2, $11}' | grep -v "^${main_pid}|" | sort -n)
    if [ -n "$children" ]; then
        while IFS='|' read -r pid cmd; do
            printf "| %-8s | %-28s | %-14s |\n" "$pid" "  +-- $(basename "$cmd")" "child"
        done <<< "$children"
    fi
}

get_status() {
    echo "=== BroadSpace Services Status ==="
    echo ""

    echo "Application Processes:"
    echo "+----------+------------------------------+------------------+"
    printf "| %-8s | %-28s | %-14s |\n" "PID" "Service" "Status"
    echo "+----------+------------------------------+------------------+"

    show_service_status "collector" "collector/bin/collector"
    show_service_status "processor (worker)" "python.*processor\.worker|python.*processor/worker"
    show_service_status "web (next.js)" "next-server" "next-server|next dev|next start"
    echo "+----------+------------------------------+------------------+"

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

build_all() {
    cd /home/jinru/workon/broad_space
    load_env

    mkdir -p "$LOG_DIR"
    log_ts "=== BroadSpace Build ==="

    # 1. Build Go collector
    log_ts "[1/4] Building Go collector..."
    (cd collector && go build -o bin/collector ./cmd/collector 2>&1 | while IFS= read -r line; do log_ts "$line"; done)
    log_ts "  -> collector/bin/collector"

    # 2. Build api Docker image
    log_ts "[2/4] Building api Docker image..."
    docker compose build api 2>&1 | while IFS= read -r line; do log_ts "$line"; done
    log_ts "  -> broadspace-api image"

    # 3. Build delivery Docker image
    log_ts "[3/4] Building delivery Docker image..."
    docker compose build delivery 2>&1 | while IFS= read -r line; do log_ts "$line"; done
    log_ts "  -> broadspace-delivery image"

    # 4. Build Next.js production bundle
    log_ts "[4/4] Building Next.js web app..."
    (cd web && npm run build 2>&1 | while IFS= read -r line; do log_ts "$line"; done)
    log_ts "  -> web/.next"

    log_ts ""
    log_ts "=== Build complete ==="
}

build_component() {
    cd /home/jinru/workon/broad_space
    load_env
    mkdir -p "$LOG_DIR"

    case "${2:-}" in
        collector)
            log_ts "Building Go collector..."
            (cd collector && go build -o bin/collector ./cmd/collector 2>&1 | while IFS= read -r line; do log_ts "$line"; done)
            log_ts "Done -> collector/bin/collector"
            ;;
        api)
            log_ts "Building api Docker image..."
            docker compose build api 2>&1 | while IFS= read -r line; do log_ts "$line"; done
            log_ts "Done -> broadspace-api image"
            ;;
        delivery)
            log_ts "Building delivery Docker image..."
            docker compose build delivery 2>&1 | while IFS= read -r line; do log_ts "$line"; done
            log_ts "Done -> broadspace-delivery image"
            ;;
        web)
            log_ts "Building Next.js web app..."
            (cd web && npm run build 2>&1 | while IFS= read -r line; do log_ts "$line"; done)
            log_ts "Done -> web/.next"
            ;;
        *)
            echo "Usage: $0 build <component>"
            echo ""
            echo "Components:"
            echo "  collector   - Go collector binary"
            echo "  api         - API Docker image"
            echo "  delivery    - Delivery Docker image"
            echo "  web         - Next.js production build"
            echo ""
            echo "Or run '$0 build' to build all components."
            exit 1
            ;;
    esac
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
    build)
        if [ -n "${2:-}" ]; then
            build_component "$@"
        else
            build_all
        fi
        ;;
    test)
        run_test
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|build|test}"
        echo ""
        echo "Commands:"
        echo "  start               - Start all services"
        echo "  stop                - Stop all services"
        echo "  restart             - Restart all services"
        echo "  status              - Show service status"
        echo "  build               - Build all components (collector, api, delivery, web)"
        echo "  build <component>   - Build a specific component (collector|api|delivery|web)"
        echo "  test                - Run integration tests"
        exit 1
        ;;
esac
