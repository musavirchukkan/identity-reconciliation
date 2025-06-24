# Bitespeed Identity Reconciliation Service

A robust, production-ready identity reconciliation service that links customer contacts across multiple purchases using email addresses and phone numbers. Built with Node.js, TypeScript, PostgreSQL, and Docker.

## 🌟 Features

- **Smart Contact Linking**: Automatically links contacts based on shared email addresses or phone numbers
- **Primary/Secondary Hierarchy**: Maintains a clear hierarchy with the oldest contact as primary
- **Complex Scenario Handling**: Merges separate contact groups when new information creates links
- **Enhanced Security**: Comprehensive security measures including input validation, rate limiting, and API key authentication
- **Production Ready**: Docker containerization, monitoring, logging, and error handling
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions
- **Comprehensive Testing**: Unit and integration tests with high coverage

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18 or later
- **Docker** and **Docker Compose**
- **PostgreSQL** 15 or later (if running locally)

### Development Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd bitespeed-identity-reconciliation
   ```

2. **Run the setup script**

   ```bash
   chmod +x scripts/docker-setup.sh
   ./scripts/docker-setup.sh dev
   ```

3. **Or manually with Docker Compose**

   ```bash
   cp .env.example .env
   docker-compose --profile development up -d
   ```

4. **Verify the service is running**
   ```bash
   curl http://localhost:3000/health
   ```

### Production Deployment

1. **Prepare environment**

   ```bash
   cp .env.production.example .env
   # Edit .env with your production values
   ```

2. **Deploy with Docker**
   ```bash
   ./scripts/docker-setup.sh prod
   ```

## 📚 API Documentation

### Main Endpoint: POST /identify

Identifies and links customer contacts based on email and/or phone number.

#### Request Format

```json
{
  "email": "customer@example.com",
  "phoneNumber": "1234567890"
}
```

**Request Rules:**

- At least one of `email` or `phoneNumber` must be provided
- Email must be a valid email format
- Phone number accepts various formats (will be normalized)

#### Response Format

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

#### Example Scenarios

**Scenario 1: New Customer**

```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'
```

**Response:**

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

**Scenario 2: Existing Customer with New Information**

```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

**Response:**

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

### Health Check: GET /health

Returns service health status and system information.

```bash
curl http://localhost:3000/health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2023-04-20T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "database": "connected",
  "responseTime": "5ms",
  "version": "1.0.0"
}
```

## 🏗️ Architecture

### System Design

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │───▶│   Application   │───▶│   PostgreSQL    │
│     (Nginx)     │    │   (Node.js)     │    │   Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │      Redis      │
                       │   (Caching)     │
                       └─────────────────┘
```

### Database Schema

```sql
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    phone_number TEXT,
    email TEXT,
    linked_id INTEGER REFERENCES contacts(id),
    link_precedence "LinkPrecedence" NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    deleted_at TIMESTAMP(3)
);

CREATE TYPE "LinkPrecedence" AS ENUM ('primary', 'secondary');
```

### Business Logic Flow

1. **Input Validation**: Validate and sanitize email/phone input
2. **Exact Match Check**: Look for contacts with exact email/phone combination
3. **Partial Match Analysis**: Find contacts sharing either email or phone
4. **Linking Strategy**:
   - **No matches**: Create new primary contact
   - **Partial match**: Create secondary contact linked to existing primary
   - **Multiple groups**: Merge groups, oldest primary remains primary
5. **Response Assembly**: Collect all linked contacts and format response

## 🛠️ Development

### Project Structure

```
src/
├── controllers/          # API controllers
├── services/            # Business logic services
├── models/              # Data models and repositories
├── middleware/          # Express middleware
├── utils/               # Utility functions
├── config/              # Configuration management
└── types/               # TypeScript type definitions

tests/
├── unit/                # Unit tests
├── integration/         # Integration tests
└── setup.ts            # Test configuration

docker/
├── Dockerfile           # Multi-stage Docker build
├── docker-compose.yml   # Development and production setups
└── nginx/              # Nginx configuration
```

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server

# Testing
npm run test            # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage

# Database
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Run database migrations
npm run db:push         # Push schema changes
npm run db:reset        # Reset database

# Docker
npm run docker:dev      # Start development environment
npm run docker:prod     # Start production environment
npm run docker:stop     # Stop all containers
```

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test files
npm run test -- --testPathPattern=validation
npm run test -- --testPathPattern=integration

# Run with coverage
npm run test:coverage
```

## 🔧 Configuration

### Environment Variables

| Variable                     | Description                  | Default       | Required |
| ---------------------------- | ---------------------------- | ------------- | -------- |
| `NODE_ENV`                   | Environment mode             | `development` | No       |
| `PORT`                       | Server port                  | `3000`        | No       |
| `DATABASE_URL`               | PostgreSQL connection string | -             | Yes      |
| `REDIS_URL`                  | Redis connection string      | -             | No       |
| `API_KEY`                    | API authentication key       | -             | No\*     |
| `LOG_LEVEL`                  | Logging level                | `INFO`        | No       |
| `RATE_LIMIT_MAX_REQUESTS`    | Rate limit per window        | `100`         | No       |
| `MAX_CONTACTS_PER_OPERATION` | Performance limit            | `1000`        | No       |

\*Required in production for security

### Security Configuration

```bash
# Production security settings
API_KEY="your-secure-api-key-min-32-chars"
JWT_SECRET="your-jwt-secret-min-32-chars"
CORS_ORIGINS="https://yourdomain.com"
ENABLE_ENHANCED_VALIDATION=true
```

## 🚦 API Rate Limiting

- **General API**: 100 requests per minute per IP
- **Identify Endpoint**: 10 requests per minute per IP
- **Burst Allowance**: 20 requests for general, 10 for identify

Rate limit headers included in responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Window reset time

## 🔒 Security Features

- **Input Validation**: Comprehensive validation with Zod schemas
- **XSS Protection**: Input sanitization and security headers
- **API Key Authentication**: Optional API key protection
- **Rate Limiting**: IP-based rate limiting with burst protection
- **Security Headers**: Comprehensive security headers via Helmet
- **Request Validation**: Content-Type and header validation
- **Timing Attack Protection**: Consistent response times
- **Audit Logging**: Security event logging

## 📊 Monitoring

### Health Monitoring

- **Health Endpoint**: `/health` for service status
- **Database Connectivity**: Connection health checks
- **Memory Usage**: Automatic memory monitoring
- **Performance Metrics**: Response time tracking

### Logging

- **Structured Logging**: JSON-formatted logs with context
- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Request Logging**: HTTP request/response logging
- **Security Logging**: Security event audit trail

### Production Monitoring

- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **Docker Health Checks**: Container health monitoring
- **Log Aggregation**: Centralized logging

## 🐳 Docker Deployment

### Development

```bash
docker-compose --profile development up -d
```

Services included:

- Application (development mode)
- PostgreSQL database
- Redis cache

### Production

```bash
docker-compose --profile production up -d
```

Services included:

- Application (production build)
- PostgreSQL database
- Redis cache
- Nginx load balancer
- Prometheus monitoring
- Grafana dashboard

### Scaling

```bash
# Scale application instances
docker-compose --profile production up -d --scale app-prod=3
```

## 🧪 Testing Strategy

### Test Coverage

- **Unit Tests**: Service logic, utilities, validation
- **Integration Tests**: API endpoints, database interactions
- **Edge Cases**: Error handling, boundary conditions
- **Security Tests**: Input validation, rate limiting

### Test Data

Use the provided test scenarios in the task description:

```javascript
// Test data examples
const testCases = [
  {
    description: "New customer",
    input: { email: "lorraine@hillvalley.edu", phoneNumber: "123456" },
    expectedPrimary: true,
  },
  {
    description: "Existing customer with new email",
    input: { email: "mcfly@hillvalley.edu", phoneNumber: "123456" },
    expectedSecondary: true,
  },
];
```

## 🚀 Performance

### Optimization Features

- **Database Indexing**: Optimized indexes on email, phone, linkedId
- **Connection Pooling**: Efficient database connection management
- **Caching**: Redis caching for frequently accessed data
- **Request Validation**: Early validation to prevent unnecessary processing

### Performance
