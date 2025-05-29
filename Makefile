# OpenPanel Docker Management
.PHONY: help build up down logs clean rebuild migrate codegen health validate wizard

# Default target
help: ## Show this help message
	@echo "OpenPanel Docker Management Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make wizard   - Run interactive setup wizard"
	@echo "  2. make setup    - Manual setup"
	@echo "  3. make build    - Build all images"
	@echo "  4. make up       - Start all services"
	@echo "  5. make migrate  - Run database migrations"
	@echo "  6. make validate - Validate setup"
	@echo ""

# Interactive setup wizard
wizard: ## Run interactive Docker setup wizard
	@echo "Starting OpenPanel Docker setup wizard..."
	@./scripts/docker-setup.sh

# Environment setup
setup: ## Setup environment for Docker deployment
	@echo "Setting up OpenPanel Docker environment..."
	@if [ ! -f .env ]; then \
		echo "Creating .env file from template..."; \
		cp env.docker.template .env; \
		echo "⚠️  Please edit .env file and update the secrets!"; \
	else \
		echo ".env file already exists"; \
	fi
	@echo "✅ Setup complete!"

# Validation
validate: ## Validate Docker setup and service health
	@echo "Running Docker setup validation..."
	@./scripts/validate-docker-setup.sh

# Build commands
build: ## Build all Docker images
	@echo "Building all Docker images..."
	docker-compose -f docker-compose.full.yml build --parallel

build-nocache: ## Build all Docker images without cache
	@echo "Building all Docker images without cache..."
	docker-compose -f docker-compose.full.yml build --no-cache --parallel

# Service management
up: ## Start all services
	@echo "Starting all services..."
	docker-compose -f docker-compose.full.yml up -d

up-dev: ## Start services with development docker-compose
	@echo "Starting development services..."
	docker-compose -f docker-compose.dev.yml up -d

up-infra: ## Start only infrastructure services (db, redis, clickhouse)
	@echo "Starting infrastructure services..."
	docker-compose -f docker-compose.full.yml up -d op-db op-kv op-ch op-geo

up-production: ## Start all services with production profile
	@echo "Starting all services with production profile..."
	docker-compose -f docker-compose.full.yml --profile production up -d

up-monitoring: ## Start services with monitoring profile
	@echo "Starting services with monitoring..."
	docker-compose -f docker-compose.full.yml --profile monitoring up -d

down: ## Stop all services
	@echo "Stopping all services..."
	docker-compose -f docker-compose.full.yml down

down-volumes: ## Stop all services and remove volumes
	@echo "Stopping all services and removing volumes..."
	docker-compose -f docker-compose.full.yml down -v

# Logs and monitoring
logs: ## Show logs from all services
	docker-compose -f docker-compose.full.yml logs -f

logs-api: ## Show API logs
	docker-compose -f docker-compose.full.yml logs -f op-api

logs-dashboard: ## Show dashboard logs
	docker-compose -f docker-compose.full.yml logs -f op-dashboard

logs-worker: ## Show worker logs
	docker-compose -f docker-compose.full.yml logs -f op-worker

logs-db: ## Show database logs
	docker-compose -f docker-compose.full.yml logs -f op-db

# Database operations
migrate: ## Run database migrations
	@echo "Running database migrations..."
	docker-compose -f docker-compose.full.yml exec op-api pnpm run migrate:deploy

migrate-reset: ## Reset database
	@echo "Resetting database..."
	docker-compose -f docker-compose.full.yml exec op-api pnpm run migrate:reset

codegen: ## Run code generation
	@echo "Running code generation..."
	docker-compose -f docker-compose.full.yml exec op-api pnpm run codegen

seed: ## Seed database with sample data
	@echo "Seeding database..."
	docker-compose -f docker-compose.full.yml exec op-api pnpm run seed

# Development helpers
shell-api: ## Open shell in API container
	docker-compose -f docker-compose.full.yml exec op-api sh

shell-dashboard: ## Open shell in dashboard container
	docker-compose -f docker-compose.full.yml exec op-dashboard sh

shell-db: ## Open PostgreSQL shell
	docker-compose -f docker-compose.full.yml exec op-db psql -U postgres -d openpanel

shell-redis: ## Open Redis CLI
	docker-compose -f docker-compose.full.yml exec op-kv redis-cli

shell-clickhouse: ## Open ClickHouse client
	docker-compose -f docker-compose.full.yml exec op-ch clickhouse-client

# Health checks
health: ## Check health of all services
	@echo "Checking service health..."
	@docker-compose -f docker-compose.full.yml ps

health-detailed: ## Detailed health check
	@echo "Detailed health check..."
	@echo "\n=== Service Status ==="
	@docker-compose -f docker-compose.full.yml ps
	@echo "\n=== Database Connection ==="
	@docker-compose -f docker-compose.full.yml exec -T op-db pg_isready -U postgres || echo "❌ Database not ready"
	@echo "\n=== Redis Connection ==="
	@docker-compose -f docker-compose.full.yml exec -T op-kv redis-cli ping || echo "❌ Redis not ready"
	@echo "\n=== ClickHouse Connection ==="
	@docker-compose -f docker-compose.full.yml exec -T op-ch clickhouse-client --query "SELECT 1" || echo "❌ ClickHouse not ready"

# Cleanup commands
clean: ## Clean up Docker resources
	@echo "Cleaning up Docker resources..."
	docker-compose -f docker-compose.full.yml down
	docker system prune -f

clean-all: ## Clean up all Docker resources including volumes
	@echo "Cleaning up all Docker resources..."
	docker-compose -f docker-compose.full.yml down -v
	docker system prune -a -f --volumes

# Update and rebuild
rebuild: down build up ## Rebuild and restart all services

rebuild-service: ## Rebuild specific service (use SERVICE=service-name)
	@if [ -z "$(SERVICE)" ]; then \
		echo "Usage: make rebuild-service SERVICE=service-name"; \
		echo "Available services: op-api, op-dashboard, op-worker, op-public, op-docs"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.full.yml build $(SERVICE)
	docker-compose -f docker-compose.full.yml up -d $(SERVICE)

# Backup and restore
backup-db: ## Backup database
	@echo "Backing up database..."
	@mkdir -p backups
	docker-compose -f docker-compose.full.yml exec -T op-db pg_dump -U postgres openpanel > backups/openpanel_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Database backup saved to backups/"

restore-db: ## Restore database (use BACKUP=filename)
	@if [ -z "$(BACKUP)" ]; then \
		echo "Usage: make restore-db BACKUP=filename"; \
		exit 1; \
	fi
	@echo "Restoring database from $(BACKUP)..."
	docker-compose -f docker-compose.full.yml exec -T op-db psql -U postgres -d openpanel < $(BACKUP)

# Performance monitoring
stats: ## Show container resource usage
	docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# Quick development setup
dev-setup: setup build up-infra ## Quick development setup (infra only)
	@echo "Waiting for services to be ready..."
	@sleep 10
	@make migrate
	@echo "✅ Development environment ready!"
	@echo "📊 Dashboard: http://localhost:3000"
	@echo "🔌 API: http://localhost:3001"
	@echo "📖 Docs: http://localhost:3003"
	@echo "🔍 Queue Monitor: http://localhost:9999 (use 'make up-monitoring' to enable)"

# Production deployment
production-deploy: setup build up-production migrate ## Full production deployment
	@echo "✅ Production deployment complete!"
	@echo "📊 Dashboard: http://localhost:3000"
	@echo "🔌 API: http://localhost:3001"
	@echo "🌐 Public: http://localhost:3002"
	@echo "📖 Docs: http://localhost:3003" 