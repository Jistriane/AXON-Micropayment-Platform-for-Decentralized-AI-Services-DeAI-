# Prisma Setup & Database Migration

## Overview

The AXON Gateway uses **Prisma ORM** for data persistence. This provides:
- Type-safe database queries
- Automatic migrations
- Multi-database support (SQLite, PostgreSQL, MySQL, etc.)
- Built-in relationship management

## Development Setup (SQLite)

SQLite is configured by default for local development. No additional setup required beyond `npm install`.

Database file location: `services/gateway/dev.db`

## Production Setup (PostgreSQL)

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib

# Windows
# Download from https://www.postgresql.org/download/windows/
```

### 2. Create Database and User

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE axon_gateway;
CREATE USER axon_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE axon_gateway TO axon_user;

# Exit
\q
```

### 3. Configure Environment

Update `services/gateway/.env`:

```env
DATABASE_URL="postgresql://axon_user:secure_password@localhost:5432/axon_gateway?schema=public"
```

### 4. Run Migrations

```bash
cd services/gateway
npm run db:migrate
# or with specific name
npx prisma migrate dev --name add_payment_fields
```

## Database Schema

### AiModel

Stores registered AI models:
- `id`: UUID primary key
- `providerAddress`: Stellar wallet address
- `name`: Model name
- `description`: Long description
- `endpoint`: API endpoint
- `priceMicrounit`: Price in microunits
- `active`: Boolean flag
- `createdAt`, `updatedAt`: Timestamps

### PaymentRecord

Stores payment history:
- `id`: UUID primary key
- `modelId`: Foreign key to AiModel
- `callerAddress`: User's Stellar address
- `amountMicrounit`: Payment amount
- `platformFeeMicrounit`: Platform 5% fee
- `providerAmountMicrounit`: Provider's 95% share
- `txHash`: Unique Stellar transaction hash
- `paymentRef`: Unique payment reference
- `success`: Payment success flag
- `error`: Optional error message
- `txStatus`: Consolidated transaction status (`submitted|confirmed|failed|local`)
- `txStatusUpdatedAt`: Last tx status update timestamp
- `createdAt`: Payment creation timestamp
- `updatedAt`: Payment update timestamp

### Current persistence behavior (2026-04-12)

- Gateway persists every payment authorization result.
- Tx status may be updated asynchronously via `GET /payments/tx/:txHash` lookup.
- Terminal on-chain states (`confirmed`/`failed`) are written back to DB.
- Frontend history is hydrated from backend, so tx state survives page refresh.

## Commands

```bash
# Generate Prisma Client (run automatically on npm install)
npm run postinstall

# Create migration from schema changes
npm run db:migrate

# View and edit data
npm run db:studio

# Reset database (development only)
npx prisma db push --force-reset

# Seed database with initial data
npx prisma db seed
```

## Migration from JSON to PostgreSQL

To migrate from existing JSON files:

### 1. Export Data

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('.axon/gateway-data.json', 'utf8'));
console.log(JSON.stringify(data, null, 2));
" > backup.json
```

### 2. Set Up PostgreSQL (see steps above)

### 3. Update DATABASE_URL in .env

```env
DATABASE_URL="postgresql://axon_user:secure_password@localhost:5432/axon_gateway"
```

### 4. Run Migrations

```bash
npm run db:migrate
```

### 5. Import Data (Python script example)

```python
import json
import psycopg2

# Connect to database
conn = psycopg2.connect(
    host="localhost",
    database="axon_gateway",
    user="axon_user",
    password="secure_password"
)

# Load JSON data
with open('backup.json', 'r') as f:
    data = json.load(f)

cur = conn.cursor()

# Insert models
for model in data['models']:
    cur.execute("""
        INSERT INTO "AiModel" (id, "providerAddress", name, description, endpoint, "priceMicrounit", active, "createdAt", "updatedAt")
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (model['id'], model['providerAddress'], model['name'], model['description'], 
          model['endpoint'], model['priceMicrounit'], model['active'], 
          model['createdAt'], model['createdAt']))

# Insert payments
for payment in data['payments']:
    cur.execute("""
        INSERT INTO "PaymentRecord" (id, "modelId", "callerAddress", "amountMicrounit", "platformFeeMicrounit", "providerAmountMicrounit", "txHash", "paymentRef", success, "createdAt")
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (payment.get('id', uuid.uuid4().hex), payment['modelId'], payment['callerAddress'],
          payment['amountMicrounit'], payment['platformFeeMicrounit'], payment['providerAmountMicrounit'],
          payment['txHash'], payment.get('paymentRef', ''), True, payment.get('createdAt')))

conn.commit()
cur.close()
conn.close()
```

## Troubleshooting

### "Database already exists"
```bash
# Drop and recreate
npx prisma migrate reset
```

### Connection timeout
```bash
# Verify PostgreSQL is running
pg_isready -h localhost -p 5432

# Check connection string format
# postgresql://user:password@host:port/database?schema=public
```

### Type errors
```bash
# Regenerate Prisma Client
npx prisma generate

# Clear cache
rm -rf node_modules/.prisma
npm install
```

## Next Steps

- Add querying optimization with indexes
- Implement connection pooling (PgBouncer) for production
- Set up automated backups
- Configure replication for high availability
