# Identity Reconciliation Service - Initial Setup

## Project Structure

```
bitespeed-identity-reconciliation/
├── src/
│   ├── controllers/          # API controllers
│   ├── services/            # Business logic
│   ├── models/              # Data models and types
│   ├── utils/               # Helper functions
│   ├── middleware/          # Custom middleware
│   └── app.ts              # Main application entry
├── prisma/
│   └── schema.prisma       # Database schema
├── tests/                  # Test files
├── package.json           # Project dependencies
├── tsconfig.json          # TypeScript configuration
├── .gitignore            # Git ignore rules
└── README.md             # Project documentation
```

## Setup Instructions

1. Run `npm install` to install dependencies
2. Set up environment variables in `.env` file
3. Run database migrations with `npm run db:migrate`
4. Start development server with `npm run dev`

## Next Steps

- Set up Express server with basic middleware
- Configure database connection
- Implement core business logic
