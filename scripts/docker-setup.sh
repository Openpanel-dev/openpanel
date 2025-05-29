#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${PURPLE}🚀 OpenPanel Docker Setup Wizard${NC}"
echo "============================================"
echo

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

# Function to prompt for user input
prompt_user() {
    local prompt_text="$1"
    local default_value="$2"
    local variable_name="$3"
    
    if [ -n "$default_value" ]; then
        read -p "$(echo -e "${BLUE}$prompt_text${NC} [$default_value]: ")" user_input
        eval "$variable_name=\"\${user_input:-$default_value}\""
    else
        read -p "$(echo -e "${BLUE}$prompt_text${NC}: ")" user_input
        eval "$variable_name=\"$user_input\""
    fi
}

# Function to generate a random secret
generate_secret() {
    local length=${1:-32}
    if command_exists openssl; then
        openssl rand -hex $length
    elif command_exists python3; then
        python3 -c "import secrets; print(secrets.token_hex($length))"
    else
        # Fallback to /dev/urandom
        tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c $length
    fi
}

# Main setup function
main() {
    cd "$PROJECT_DIR"
    
    echo -e "${BLUE}This wizard will help you set up OpenPanel with Docker.${NC}"
    echo
    
    # Step 1: Check prerequisites
    log_info "Step 1: Checking prerequisites..."
    
    local prerequisites_ok=true
    
    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        prerequisites_ok=false
    else
        log_success "Docker is installed"
    fi
    
    if ! docker compose version >/dev/null 2>&1 && ! docker-compose --version >/dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "Visit: https://docs.docker.com/compose/install/"
        prerequisites_ok=false
    else
        log_success "Docker Compose is installed"
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker first."
        prerequisites_ok=false
    else
        log_success "Docker daemon is running"
    fi
    
    if [ "$prerequisites_ok" = false ]; then
        log_error "Please resolve the above issues and run this script again."
        exit 1
    fi
    
    echo
    
    # Step 2: Environment configuration
    log_info "Step 2: Setting up environment configuration..."
    
    local setup_mode
    echo "Choose setup mode:"
    echo "1) Quick setup (recommended) - Use defaults with generated secrets"
    echo "2) Custom setup - Configure all settings manually"
    echo "3) Development setup - Use development defaults"
    echo
    prompt_user "Enter your choice (1-3)" "1" setup_mode
    
    case $setup_mode in
        1)
            log_info "Using quick setup with generated secrets..."
            setup_quick_mode
            ;;
        2)
            log_info "Starting custom configuration..."
            setup_custom_mode
            ;;
        3)
            log_info "Setting up development environment..."
            setup_dev_mode
            ;;
        *)
            log_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
    
    echo
    
    # Step 3: Build and start services
    log_info "Step 3: Building and starting services..."
    
    local start_services
    prompt_user "Do you want to start all services now? (y/n)" "y" start_services
    
    if [[ $start_services =~ ^[Yy]$ ]]; then
        log_info "Building Docker images (this may take several minutes)..."
        if make build; then
            log_success "Docker images built successfully"
        else
            log_error "Failed to build Docker images"
            exit 1
        fi
        
        echo
        log_info "Starting services..."
        if make up; then
            log_success "Services started successfully"
        else
            log_error "Failed to start services"
            exit 1
        fi
        
        echo
        log_info "Waiting for services to be ready..."
        sleep 10
        
        log_info "Running database migrations..."
        if make migrate; then
            log_success "Database migrations completed"
        else
            log_warning "Database migrations failed. You may need to run 'make migrate' manually."
        fi
        
        echo
        log_info "Validating setup..."
        if ./scripts/validate-docker-setup.sh; then
            log_success "Setup validation passed!"
        else
            log_warning "Setup validation had some issues. Check the output above."
        fi
    else
        log_info "Services not started. You can start them later with 'make up'"
    fi
    
    echo
    echo "============================================"
    log_success "🎉 OpenPanel Docker setup completed!"
    echo
    echo "Next steps:"
    if [[ $start_services =~ ^[Yy]$ ]]; then
        echo "• Dashboard: http://localhost:3000"
        echo "• API: http://localhost:3001"
        echo "• Public: http://localhost:3002"
        echo "• Docs: http://localhost:3003"
        echo
        echo "Useful commands:"
        echo "• make logs           - View service logs"
        echo "• make health         - Check service health"
        echo "• make validate       - Validate setup"
        echo "• make help           - Show all commands"
    else
        echo "• Run 'make up' to start services"
        echo "• Run 'make migrate' after starting services"
        echo "• Run 'make validate' to check setup"
    fi
    echo
    echo "Documentation:"
    echo "• DOCKER.md - Comprehensive Docker guide"
    echo "• README.md - Project overview"
    echo "• make help - Available commands"
}

# Quick setup mode
setup_quick_mode() {
    log_info "Generating secure secrets..."
    
    local nextauth_secret=$(generate_secret 32)
    local jwt_secret=$(generate_secret 32)
    local session_secret=$(generate_secret 32)
    
    cat > .env << EOF
# OpenPanel Docker Environment (Quick Setup)
# Generated on $(date)

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@op-db:5432/openpanel
DATABASE_URL_DIRECT=postgresql://postgres:postgres@op-db:5432/openpanel

# Redis Configuration
REDIS_URL=redis://op-kv:6379

# ClickHouse Configuration
CLICKHOUSE_URL=http://op-ch:8123

# GeoIP Service
GEOIP_URL=http://op-geo:8080

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000

# Production Settings
NODE_ENV=production
SKIP_ENV_VALIDATION=1
NEXT_TELEMETRY_DISABLED=1

# Auto-generated secrets (KEEP THESE SECURE!)
NEXTAUTH_SECRET=$nextauth_secret
NEXTAUTH_URL=http://localhost:3000
JWT_SECRET=$jwt_secret
SESSION_SECRET=$session_secret

# Worker Configuration
WORKER_CONCURRENCY=2
BULLMQ_REDIS_HOST=op-kv
BULLMQ_REDIS_PORT=6379

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
EOF
    
    log_success "Environment file created with generated secrets"
    log_warning "IMPORTANT: Keep your .env file secure and never commit it to version control!"
}

# Custom setup mode
setup_custom_mode() {
    log_info "Creating custom environment configuration..."
    
    local domain_name
    local api_url
    local dashboard_url
    local email_from
    local enable_ssl
    
    # Basic configuration
    prompt_user "Domain name (leave empty for localhost)" "localhost" domain_name
    
    if [ "$domain_name" = "localhost" ]; then
        api_url="http://localhost:3001"
        dashboard_url="http://localhost:3000"
        enable_ssl="n"
    else
        prompt_user "API URL" "https://api.$domain_name" api_url
        prompt_user "Dashboard URL" "https://$domain_name" dashboard_url
        prompt_user "Enable SSL/HTTPS? (y/n)" "y" enable_ssl
    fi
    
    prompt_user "Email from address" "noreply@$domain_name" email_from
    
    # Generate secrets
    local nextauth_secret=$(generate_secret 32)
    local jwt_secret=$(generate_secret 32)
    local session_secret=$(generate_secret 32)
    
    # Optional services
    local setup_oauth
    prompt_user "Setup OAuth providers? (y/n)" "n" setup_oauth
    
    # Create environment file
    cat > .env << EOF
# OpenPanel Docker Environment (Custom Setup)
# Generated on $(date)

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@op-db:5432/openpanel
DATABASE_URL_DIRECT=postgresql://postgres:postgres@op-db:5432/openpanel

# Redis Configuration
REDIS_URL=redis://op-kv:6379

# ClickHouse Configuration
CLICKHOUSE_URL=http://op-ch:8123

# GeoIP Service
GEOIP_URL=http://op-geo:8080

# API Configuration
NEXT_PUBLIC_API_URL=$api_url
NEXT_PUBLIC_DASHBOARD_URL=$dashboard_url

# Production Settings
NODE_ENV=production
SKIP_ENV_VALIDATION=1
NEXT_TELEMETRY_DISABLED=1

# Auth Configuration
NEXTAUTH_SECRET=$nextauth_secret
NEXTAUTH_URL=$dashboard_url
JWT_SECRET=$jwt_secret
SESSION_SECRET=$session_secret

# Email Configuration
EMAIL_FROM=$email_from

# Worker Configuration
WORKER_CONCURRENCY=2
BULLMQ_REDIS_HOST=op-kv
BULLMQ_REDIS_PORT=6379

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
EOF
    
    if [[ $setup_oauth =~ ^[Yy]$ ]]; then
        cat >> .env << EOF

# OAuth Configuration (fill in your credentials)
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-client-secret
# GITHUB_CLIENT_ID=your-github-client-id
# GITHUB_CLIENT_SECRET=your-github-client-secret
EOF
        log_warning "OAuth provider credentials need to be configured manually in .env"
    fi
    
    log_success "Custom environment file created"
    log_info "You can edit .env to add more configuration options"
}

# Development setup mode
setup_dev_mode() {
    log_info "Setting up development environment..."
    
    cp env.development .env
    
    # Generate secure secrets even for development
    local nextauth_secret=$(generate_secret 32)
    local jwt_secret=$(generate_secret 32)
    local session_secret=$(generate_secret 32)
    
    # Update secrets in development file
    sed -i.bak "s/your-nextauth-secret-here-change-this-in-production/$nextauth_secret/" .env
    echo "JWT_SECRET=$jwt_secret" >> .env
    echo "SESSION_SECRET=$session_secret" >> .env
    
    rm -f .env.bak
    
    log_success "Development environment file created"
    log_info "This setup is optimized for local development"
}

# Run main function
main "$@" 