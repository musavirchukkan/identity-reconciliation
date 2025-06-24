#!/bin/bash

# Docker setup script for Bitespeed Identity Reconciliation Service
set -e

echo "🐳 Setting up Bitespeed Identity Reconciliation Service with Docker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p nginx/ssl
mkdir -p monitoring
mkdir -p scripts

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# Application Configuration
NODE_ENV=development
APP_PORT=3000

# Database Configuration
DB_PASSWORD=password
DB_PORT=5432

# Redis Configuration
REDIS_PORT=6379

# Nginx Configuration
NGINX_PORT=80
NGINX_SSL_PORT=443

# Monitoring Configuration
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_PASSWORD=admin

# Logging
LOG_LEVEL=debug
EOF
    echo "✅ Created .env file with default values"
    echo "⚠️  Please update the .env file with your specific configuration"
fi

# Create SSL directory and self-signed certificates for development
if [ ! -f nginx/ssl/cert.pem ]; then
    echo "🔐 Generating self-signed SSL certificates for development..."
    openssl req -x509 -newkey rsa:4096 -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    echo "✅ SSL certificates generated"
fi

# Create database initialization script
cat > scripts/init-db.sql << 'EOF'
-- Database initialization script
-- This script runs when the PostgreSQL container starts for the first time

-- Create additional databases if needed
-- CREATE DATABASE bitespeed_identity_test;

-- Create indexes for better performance
-- These will be created by Prisma migrations, but included here for reference

-- Example: Create extension for UUID generation
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set default timezone
SET timezone = 'UTC';

-- Log the initialization
SELECT 'Database initialized successfully' AS status;
EOF

# Create monitoring configuration
cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'bitespeed-app'
    static_configs:
      - targets: ['app-prod:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
    scrape_interval: 30s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 30s
EOF

# Function to display usage
show_usage() {
    echo ""
    echo "🚀 Setup complete! Available commands:"
    echo ""
    echo "Development:"
    echo "  docker-compose --profile development up -d    # Start development environment"
    echo "  docker-compose --profile development down     # Stop development environment"
    echo ""
    echo "Production:"
    echo "  docker-compose --profile production up -d     # Start production environment"
    echo "  docker-compose --profile production down      # Stop production environment"
    echo ""
    echo "Monitoring (optional):"
    echo "  docker-compose --profile monitoring up -d     # Start monitoring stack"
    echo ""
    echo "Full stack:"
    echo "  docker-compose --profile development --profile monitoring up -d"
    echo ""
    echo "Useful commands:"
    echo "  docker-compose logs -f app-dev               # View development logs"
    echo "  docker-compose logs -f app-prod              # View production logs"
    echo "  docker-compose exec postgres psql -U postgres -d bitespeed_identity"
    echo "  docker-compose exec app-dev npm run test     # Run tests"
    echo ""
    echo "Access points:"
    echo "  Application: http://localhost:3000"
    echo "  Database: localhost:5432"
    echo "  Redis: localhost:6379"
    echo "  Grafana: http://localhost:3001 (admin/admin)"
    echo "  Prometheus: http://localhost:9090"
}

# Parse command line arguments
case "${1:-setup}" in
    "dev" | "development")
        echo "🔧 Starting development environment..."
        docker-compose --profile development up -d
        echo "✅ Development environment started"
        ;;
    "prod" | "production")
        echo "🚀 Starting production environment..."
        docker-compose --profile production up -d
        echo "✅ Production environment started"
        ;;
    "stop")
        echo "🛑 Stopping all services..."
        docker-compose --profile development --profile production --profile monitoring down
        echo "✅ All services stopped"
        ;;
    "clean")
        echo "🧹 Cleaning up Docker resources..."
        docker-compose --profile development --profile production --profile monitoring down -v
        docker system prune -f
        echo "✅ Cleanup complete"
        ;;
    "logs")
        echo "📋 Showing logs..."
        docker-compose logs -f
        ;;
    "setup" | *)
        show_usage
        ;;
esac

echo ""
echo "✅ Setup complete! The Bitespeed Identity Reconciliation Service is ready."
echo "📚 Check the README.md for more detailed instructions."