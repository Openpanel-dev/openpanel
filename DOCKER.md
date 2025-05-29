# OpenPanel Docker Setup

This document provides comprehensive instructions for running the entire OpenPanel workspace using Docker containers.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose V2
- Make (optional, for convenient commands)
- 4GB+ RAM available for containers
- 10GB+ disk space

## Architecture Overview

The dockerized OpenPanel consists of these services:

### Infrastructure Services
- **op-db**: PostgreSQL 15 database
- **op-kv**: Redis 7 for caching and queues
- **op-ch**: ClickHouse 24.x for analytics data
- **op-geo**: GeoIP service for location data

### Application Services
- **op-api**: Fastify-based event API (port 3001)
- **op-dashboard**: Next.js dashboard (port 3000) 
- **op-worker**: Background job processor
- **op-public**: Public website (port 3002)
- **op-docs**: Documentation site (port 3003)

### Optional Services
- **op-proxy**: Caddy reverse proxy (production)
- **op-bullboard**: Queue monitoring dashboard (port 9999)

## Quick Start

### 1. Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd openpanel

# Setup environment
make setup

# Edit the .env file with your configuration
nano .env
```

### 2. Build and Start

```bash
# Build all images
make build

# Start all services
make up

# Run database migrations
make migrate
```

### 3. Access Applications

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **Public Site**: http://localhost:3002
- **Documentation**: http://localhost:3003

## Configuration

### Environment Variables

Copy `env.docker.template` to `.env` and configure:

#### Required Settings
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@op-db:5432/openpanel

# Redis
REDIS_URL=redis://op-kv:6379

# ClickHouse  
CLICKHOUSE_URL=http://op-ch:8123

# Auth (IMPORTANT: Change these!)
NEXTAUTH_SECRET=your-super-secret-nextauth-secret-min-32-chars
JWT_SECRET=your-jwt-secret-change-this
```

#### Optional Settings
```bash
# Email
RESEND_API_KEY=your-resend-key
EMAIL_FROM=noreply@yourdomain.com

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Analytics
POSTHOG_KEY=your-posthog-key
```

## Docker Compose Files

### `docker-compose.full.yml`
Complete production-ready setup with all services.

### `docker-compose.dev.yml` 
Development setup with volume mounts for live reloading.

### `docker-compose.yml`
Infrastructure services only (existing file).

## Available Commands

### Using Make (Recommended)

```bash
# Show all available commands
make help

# Setup and build
make setup          # Initial environment setup
make build          # Build all Docker images
make build-nocache  # Build without cache

# Service management
make up             # Start all services
make up-infra       # Start infrastructure only
make up-production  # Start with production profile
make down           # Stop all services
make down-volumes   # Stop and remove volumes

# Development
make up-dev         # Start development environment
make logs           # View all logs
make logs-api       # View API logs only
make shell-api      # Shell into API container
make shell-db       # PostgreSQL shell

# Database operations
make migrate        # Run migrations
make codegen        # Generate code
make seed           # Seed database
make backup-db      # Backup database

# Monitoring
make health         # Check service health
make stats          # Show resource usage

# Cleanup
make clean          # Clean Docker resources
make clean-all      # Clean everything including volumes
```

### Using Docker Compose Directly

```bash
# Start all services
docker-compose -f docker-compose.full.yml up -d

# View logs
docker-compose -f docker-compose.full.yml logs -f

# Stop services
docker-compose -f docker-compose.full.yml down

# Start specific services
docker-compose -f docker-compose.full.yml up -d op-db op-kv op-ch

# Execute commands in containers
docker-compose -f docker-compose.full.yml exec op-api pnpm run migrate:deploy
docker-compose -f docker-compose.full.yml exec op-db psql -U postgres -d openpanel
```

## Development Workflow

### For Frontend Development
```bash
# Start infrastructure only
make up-infra

# Run dashboard locally
cd apps/dashboard
pnpm dev
```

### For Backend Development
```bash
# Start infrastructure + worker
make up-infra
docker-compose -f docker-compose.full.yml up -d op-worker

# Run API locally  
cd apps/api
pnpm dev
```

### For Full Stack Development
```bash
# Use development compose with volume mounts
make up-dev
```

## Production Deployment

### 1. Security Configuration

**Critical**: Update these in your `.env`:
```bash
NEXTAUTH_SECRET=<generate-32-char-secret>
JWT_SECRET=<generate-secret>
SESSION_SECRET=<generate-secret>
```

### 2. Production Setup

```bash
# Full production deployment
make production-deploy
```

### 3. SSL/Domain Setup

Configure Caddy for SSL:
```bash
# Create Caddyfile
mkdir -p caddy
cat > caddy/Caddyfile << EOF
yourdomain.com {
    reverse_proxy op-dashboard:3000
}

api.yourdomain.com {
    reverse_proxy op-api:3000
}
EOF

# Start with production profile
make up-production
```

## Monitoring and Maintenance

### Health Checks
```bash
# Quick health check
make health

# Detailed health check
make health-detailed

# Resource monitoring
make stats
```

### Log Management
```bash
# View all logs
make logs

# View specific service logs
make logs-api
make logs-dashboard
make logs-worker

# Follow logs in real-time
docker-compose -f docker-compose.full.yml logs -f --tail=100
```

### Database Operations
```bash
# Backup database
make backup-db

# Restore from backup
make restore-db BACKUP=backups/openpanel_20240101_120000.sql

# Database shell access
make shell-db
```

### Performance Monitoring
```bash
# Container resource usage
make stats

# Queue monitoring (start with monitoring profile)
make up-monitoring
# Access at http://localhost:9999
```

## Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check service status
make health

# Check individual service logs
make logs-api
make logs-db

# Restart specific service
docker-compose -f docker-compose.full.yml restart op-api
```

#### Database Connection Issues
```bash
# Check database health
docker-compose -f docker-compose.full.yml exec op-db pg_isready -U postgres

# Reset database
make migrate-reset

# Check database logs
make logs-db
```

#### Memory/Resource Issues
```bash
# Check resource usage
make stats

# Reduce worker replicas in docker-compose.full.yml
# deploy:
#   replicas: 1  # Reduce from 2

# Clean up resources
make clean
```

#### Port Conflicts
Edit `docker-compose.full.yml` to change port mappings:
```yaml
services:
  op-dashboard:
    ports:
      - "3010:3000"  # Change from 3000:3000
```

### Reset Everything
```bash
# Nuclear option - clean everything
make clean-all

# Rebuild from scratch
make setup build up migrate
```

## Customization

### Adding Custom Services

Add to `docker-compose.full.yml`:
```yaml
services:
  my-service:
    build: ./path/to/dockerfile
    depends_on:
      - op-db
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@op-db:5432/openpanel
    networks:
      - openpanel-network
```

### Environment-Specific Overrides

Create `docker-compose.override.yml`:
```yaml
version: '3.8'
services:
  op-dashboard:
    environment:
      - CUSTOM_ENV_VAR=value
```

## Best Practices

### Development
- Use `make up-dev` for development with volume mounts
- Use `make up-infra` when developing individual services
- Regularly run `make clean` to free disk space
- Use `make health` to verify service status

### Production
- Always change default secrets in `.env`
- Use `make production-deploy` for full setup
- Set up proper domain/SSL with Caddy
- Monitor resource usage with `make stats`
- Regular database backups with `make backup-db`
- Use specific image versions in production

### Security
- Never commit `.env` files
- Use strong, unique secrets for all auth variables
- Regularly update base images
- Limit exposed ports in production
- Use proper SSL certificates

## Support

For issues related to:
- **Docker setup**: Check this document and troubleshooting section
- **OpenPanel features**: Check the main README.md and documentation
- **Bugs/Features**: Create an issue on the repository

## Contributing

When contributing Docker-related changes:
1. Test with both development and production setups
2. Update this documentation
3. Add appropriate Make targets
4. Test resource usage and cleanup 