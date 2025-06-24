# Identity Reconciliation Service

A simple and efficient identity reconciliation service that links customer contacts across multiple purchases using email addresses and phone numbers. Built with Node.js, TypeScript, and PostgreSQL.

## 🌐 Live Demo

**Production Endpoint:** `https://your-app-name.onrender.com`

### Try the API

```bash
# Health check
curl https://your-app-name.onrender.com/health

# Identify endpoint
curl -X POST https://your-app-name.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "phoneNumber": "1234567890"}'
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18 or later
- **PostgreSQL** 15 or later

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd identity-reconciliation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL
   ```

4. **Set up database**
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Verify the service is running**
   ```bash
   curl http://localhost:3000/health
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
- Phone number accepts string format

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

Returns service health status.

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-04-20T10:30:00.000Z",
  "service": "identity-reconciliation"
}
```

## 🏗️ Architecture

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
```

### How It Works

1. **Contact Creation**: When a new contact is submitted, the service creates a primary contact record.

2. **Contact Linking**: When a contact with existing email or phone number is submitted, the service:
   - Finds the primary contact (oldest one)
   - Creates a secondary contact linked to the primary
   - Returns consolidated information

3. **Contact Merging**: When two separate contact groups are linked by new information, the service merges them with the oldest contact as primary.

## 🧪 Testing

Run the test suite:

```bash
npm test
```

## 🚀 Deployment

### Render.com (Recommended)

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables (DATABASE_URL)

### Other Platforms

The service can be deployed to any platform that supports Node.js applications.

## 📝 License

MIT License 