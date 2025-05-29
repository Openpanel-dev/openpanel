#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.full.yml"
TIMEOUT=60
RETRY_DELAY=5

echo -e "${BLUE}🐳 OpenPanel Docker Setup Validator${NC}"
echo "=================================================="

# Function to log messages
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service health
wait_for_service() {
    local service=$1
    local max_attempts=$((TIMEOUT / RETRY_DELAY))
    local attempt=1

    log_info "Waiting for $service to be healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f $COMPOSE_FILE ps $service | grep -q "healthy\|Up"; then
            log_success "$service is healthy"
            return 0
        fi
        
        echo -n "."
        sleep $RETRY_DELAY
        attempt=$((attempt + 1))
    done
    
    log_error "$service failed to become healthy within ${TIMEOUT}s"
    return 1
}

# Function to check HTTP endpoint
check_http() {
    local url=$1
    local service_name=$2
    local expected_status=${3:-200}
    
    log_info "Checking $service_name at $url"
    
    if command_exists curl; then
        if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" | grep -q "$expected_status"; then
            log_success "$service_name is responding correctly"
            return 0
        else
            log_error "$service_name is not responding correctly"
            return 1
        fi
    else
        log_warning "curl not available, skipping HTTP check for $service_name"
        return 0
    fi
}

# Main validation function
main() {
    local exit_code=0

    echo
    log_info "Step 1: Checking prerequisites"
    
    # Check Docker
    if command_exists docker; then
        local docker_version=$(docker --version)
        log_success "Docker found: $docker_version"
    else
        log_error "Docker is not installed or not in PATH"
        exit_code=1
    fi
    
    # Check Docker Compose
    if docker compose version >/dev/null 2>&1; then
        local compose_version=$(docker compose version)
        log_success "Docker Compose found: $compose_version"
    elif docker-compose --version >/dev/null 2>&1; then
        local compose_version=$(docker-compose --version)
        log_success "Docker Compose found: $compose_version"
    else
        log_error "Docker Compose is not installed or not in PATH"
        exit_code=1
    fi
    
    # Check if Docker daemon is running
    if docker info >/dev/null 2>&1; then
        log_success "Docker daemon is running"
    else
        log_error "Docker daemon is not running"
        exit_code=1
    fi

    # Early exit if prerequisites fail
    if [ $exit_code -ne 0 ]; then
        log_error "Prerequisites check failed. Please install missing components."
        exit $exit_code
    fi

    echo
    log_info "Step 2: Checking configuration files"
    
    # Check docker-compose file
    if [ -f "$COMPOSE_FILE" ]; then
        log_success "Docker Compose file found: $COMPOSE_FILE"
    else
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit_code=1
    fi
    
    # Check environment file
    if [ -f ".env" ]; then
        log_success "Environment file found: .env"
    elif [ -f "env.docker.template" ]; then
        log_warning "No .env file found, but template exists. Run 'make setup' first."
        exit_code=1
    else
        log_error "No environment configuration found"
        exit_code=1
    fi

    # Early exit if config files missing
    if [ $exit_code -ne 0 ]; then
        log_error "Configuration check failed."
        exit $exit_code
    fi

    echo
    log_info "Step 3: Validating Docker Compose configuration"
    
    if docker-compose -f $COMPOSE_FILE config >/dev/null 2>&1; then
        log_success "Docker Compose configuration is valid"
    else
        log_error "Docker Compose configuration is invalid"
        docker-compose -f $COMPOSE_FILE config
        exit_code=1
        return $exit_code
    fi

    echo
    log_info "Step 4: Checking if services are running"
    
    # Check if any services are running
    local running_services=$(docker-compose -f $COMPOSE_FILE ps --services --filter "status=running" 2>/dev/null || echo "")
    
    if [ -z "$running_services" ]; then
        log_warning "No services are currently running"
        log_info "To start services, run: make up"
        return 0
    fi

    log_success "Found running services: $(echo $running_services | tr '\n' ' ')"

    echo
    log_info "Step 5: Checking service health"
    
    # Check infrastructure services
    for service in op-db op-kv op-ch; do
        if echo "$running_services" | grep -q "$service"; then
            if ! wait_for_service "$service"; then
                exit_code=1
            fi
        else
            log_warning "$service is not running"
        fi
    done

    echo
    log_info "Step 6: Checking application endpoints"
    
    # Check application services HTTP endpoints
    declare -A endpoints=(
        ["Dashboard"]="http://localhost:3000"
        ["API"]="http://localhost:3001/health"
        ["Public"]="http://localhost:3002"
        ["Docs"]="http://localhost:3003"
    )

    for service_name in "${!endpoints[@]}"; do
        local url="${endpoints[$service_name]}"
        if ! check_http "$url" "$service_name"; then
            exit_code=1
        fi
    done

    echo
    log_info "Step 7: Checking database connectivity"
    
    if echo "$running_services" | grep -q "op-db"; then
        if docker-compose -f $COMPOSE_FILE exec -T op-db pg_isready -U postgres >/dev/null 2>&1; then
            log_success "PostgreSQL is accepting connections"
        else
            log_error "PostgreSQL is not accepting connections"
            exit_code=1
        fi
    else
        log_warning "PostgreSQL service is not running"
    fi

    echo
    log_info "Step 8: Checking Redis connectivity"
    
    if echo "$running_services" | grep -q "op-kv"; then
        if docker-compose -f $COMPOSE_FILE exec -T op-kv redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log_success "Redis is responding"
        else
            log_error "Redis is not responding"
            exit_code=1
        fi
    else
        log_warning "Redis service is not running"
    fi

    echo
    log_info "Step 9: Checking ClickHouse connectivity"
    
    if echo "$running_services" | grep -q "op-ch"; then
        if docker-compose -f $COMPOSE_FILE exec -T op-ch clickhouse-client --query "SELECT 1" >/dev/null 2>&1; then
            log_success "ClickHouse is responding"
        else
            log_error "ClickHouse is not responding"
            exit_code=1
        fi
    else
        log_warning "ClickHouse service is not running"
    fi

    echo
    log_info "Step 10: Resource usage check"
    
    # Check available disk space
    local available_space=$(df . | awk 'NR==2 {print $4}')
    local available_gb=$((available_space / 1024 / 1024))
    
    if [ $available_gb -lt 5 ]; then
        log_warning "Low disk space: ${available_gb}GB available (recommend 10GB+)"
    else
        log_success "Sufficient disk space: ${available_gb}GB available"
    fi

    # Check available memory
    if command_exists free; then
        local available_mem=$(free -m | awk 'NR==2{print $7}')
        if [ $available_mem -lt 2048 ]; then
            log_warning "Low available memory: ${available_mem}MB (recommend 4GB+)"
        else
            log_success "Sufficient memory: ${available_mem}MB available"
        fi
    fi

    echo
    echo "=================================================="
    
    if [ $exit_code -eq 0 ]; then
        log_success "🎉 All checks passed! OpenPanel Docker setup is working correctly."
        echo
        echo "Next steps:"
        echo "• Dashboard: http://localhost:3000"
        echo "• API: http://localhost:3001"
        echo "• Public: http://localhost:3002"
        echo "• Docs: http://localhost:3003"
        echo
        echo "Useful commands:"
        echo "• make logs           - View all logs"
        echo "• make health         - Check service health"
        echo "• make shell-api      - Access API container"
        echo "• make help           - Show all available commands"
    else
        log_error "❌ Some checks failed. Please review the errors above."
        echo
        echo "Troubleshooting:"
        echo "• Check service logs: make logs"
        echo "• Restart services: make down && make up"
        echo "• View detailed health: make health-detailed"
        echo "• See Docker documentation: DOCKER.md"
    fi

    return $exit_code
}

# Run main function
main "$@" 