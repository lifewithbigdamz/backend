# Vesting-Vault Backend

A comprehensive backend system for Vesting-Vault with Multi-Currency Path Payment Analytics. This system tracks Stellar DEX path payments, maintains accurate cost basis calculations, and provides detailed capital gains reporting for tax purposes.

## Features

- **Stellar DEX Integration**: Real-time listening for path payment operations
- **Conversion Event Tracking**: Comprehensive logging of token conversions with exchange rates
- **Cost Basis Calculation**: Accurate tracking of acquisition costs for capital gains
- **Capital Gains Reporting**: Tax year reporting with short-term and long-term gains classification
- **Exchange Rate Analytics**: Historical exchange rate data and statistics
- **Portfolio Overview**: Complete portfolio valuation and performance metrics
- **RESTful API**: Comprehensive API for frontend integration

## Architecture

### Core Components

- **StellarListener**: Real-time monitoring of Stellar blockchain for path payments
- **AnalyticsService**: Business logic for data analysis and reporting
- **Database Models**: PostgreSQL-based data persistence with Knex.js
- **API Routes**: Express.js REST endpoints for all analytics features

### Database Schema

- **conversion_events**: Records of all token conversions with exchange rates
- **exchange_rates**: Historical exchange rate data for accurate cost basis
- **cost_basis**: Per-beneficiary cost basis tracking for capital gains

## Installation

### Prerequisites

- Node.js 16+ 
- PostgreSQL 12+
- Redis (optional, for caching)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/lifewithbigdamz/backend.git
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database setup**
   ```bash
   # Create database
   createdb vesting_vault
   
   # Run migrations
   npm run migrate
   ```

5. **Start the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
Currently, the API does not implement authentication. In production, you should add appropriate authentication middleware.

### Endpoints

#### Conversion Events

**Get Beneficiary Conversion History**
```
GET /analytics/beneficiaries/:beneficiaryId/conversions
```

Query Parameters:
- `startDate` (optional): Filter by start date (ISO 8601)
- `endDate` (optional): Filter by end date (ISO 8601)
- `assetCode` (optional): Filter by asset code
- `limit` (optional, default: 100): Pagination limit
- `offset` (optional, default: 0): Pagination offset

**Get Beneficiary Statistics**
```
GET /analytics/beneficiaries/:beneficiaryId/stats
```

Query Parameters:
- `assetCode` (optional): Filter by specific asset

#### Capital Gains

**Get Capital Gains Report**
```
GET /analytics/beneficiaries/:beneficiaryId/capital-gains/:taxYear
```

Returns comprehensive capital gains report for the specified tax year including:
- Short-term and long-term gains/losses
- Conversion details with holding periods
- Cost basis summary

#### Portfolio Analytics

**Get Portfolio Overview**
```
GET /analytics/beneficiaries/:beneficiaryId/portfolio
```

Returns complete portfolio snapshot including:
- Total value and cost basis
- Realized and unrealized gains/losses
- Asset-by-asset breakdown

#### Exchange Rates

**Get Exchange Rate History**
```
GET /analytics/exchange-rates/:baseAsset/:quoteAsset
```

Query Parameters:
- `startTime` (required): Start of time range (ISO 8601)
- `endTime` (required): End of time range (ISO 8601)

Asset format: `CODE:ISSUER` (issuer optional for native assets)

**Get Latest Exchange Rates**
```
GET /analytics/exchange-rates/latest
```

Returns current exchange rates for all tracked pairs.

#### Health Check

**Service Health**
```
GET /health
```

Returns service status and database connectivity.

## Data Models

### Conversion Event

```json
{
  "id": "uuid",
  "beneficiaryId": "uuid",
  "transactionHash": "stellar_transaction_hash",
  "stellarAccount": "GD...",
  "sourceAsset": {
    "code": "XLM",
    "issuer": null
  },
  "destinationAsset": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K"
  },
  "sourceAmount": 100.0,
  "destinationAmount": 95.0,
  "exchangeRate": 0.95,
  "exchangeRateTimestamp": "2023-01-01T00:00:00Z",
  "exchangeRateSource": "stellar_dex",
  "pathPaymentDetails": {
    "type": "path_payment_strict_send",
    "path": [...]
  },
  "memo": "optional_memo",
  "memoType": "text",
  "createdAt": "2023-01-01T00:00:00Z"
}
```

### Cost Basis

```json
{
  "id": "uuid",
  "beneficiaryId": "uuid",
  "stellarAccount": "GD...",
  "asset": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K"
  },
  "totalAcquired": 1000.0,
  "totalCostUsd": 950.0,
  "averageCostBasis": 0.95,
  "currentHoldings": 800.0,
  "realizedGains": 50.0,
  "realizedLosses": 10.0,
  "lastUpdated": "2023-01-01T00:00:00Z"
}
```

## Stellar Integration

### Supported Operations

- **path_payment_strict_send**: Send exact amount of source asset
- **path_payment_strict_receive**: Receive exact amount of destination asset

### Exchange Rate Sources

1. **Stellar DEX**: Real-time orderbook prices
2. **External APIs**: CoinGecko, CoinMarketCap (planned)
3. **Historical Data**: Cached rates for accurate cost basis

### Asset Support

- **Native Asset**: XLM (Stellar Lumens)
- **USDC**: USD Coin on Stellar
- **Custom Assets**: Any Stellar asset with proper issuer

## Capital Gains Calculation

### Methodology

1. **FIFO (First-In, First-Out)**: Default accounting method
2. **Holding Period**: Calculated from acquisition to disposition
3. **Classification**: 
   - Short-term: Held ≤ 365 days
   - Long-term: Held > 365 days

### Reporting Features

- **Tax Year Reports**: Annual capital gains summaries
- **Detailed Transactions**: Individual conversion details
- **Cost Basis Tracking**: Per-asset acquisition costs
- **Realized/Unrealized Gains**: Complete profit/loss picture

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Structure

- **Unit Tests**: Model and service layer testing
- **Integration Tests**: API endpoint testing
- **Mock Services**: Stellar SDK and external API mocking

## Deployment

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/vesting_vault
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vesting_vault
DB_USER=username
DB_PASSWORD=password

# Stellar
STELLAR_NETWORK=public
STELLAR_HORIZON_URL=https://horizon.stellar.org

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Analytics
CONVERSION_EVENTS_RETENTION_DAYS=365
EXCHANGE_RATE_CACHE_TTL=300000
```

### Docker Deployment

```bash
# Build image
docker build -t vesting-vault-backend .

# Run container
docker run -d \
  --name vesting-vault-backend \
  -p 3000:3000 \
  --env-file .env \
  vesting-vault-backend
```

## Monitoring

### Logging

- **Winston**: Structured logging with multiple transports
- **Log Levels**: error, warn, info, debug
- **Log Rotation: Daily rotation with size limits

### Health Checks

- **Database Connectivity**: Continuous connection testing
- **Stellar Stream**: Stream health monitoring
- **API Endpoints**: Response time tracking

## Performance

### Optimization

- **Database Indexing**: Optimized queries for large datasets
- **Connection Pooling**: Efficient database connections
- **Caching**: Exchange rate caching with TTL
- **Pagination**: Large dataset handling

### Scaling

- **Horizontal Scaling**: Multiple instance support
- **Load Balancing**: Application-level load balancing
- **Database Scaling**: Read replicas for analytics queries

## Security

### Best Practices

- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries
- **Rate Limiting**: API endpoint protection
- **HTTPS**: TLS encryption in production

### Recommendations

- **Authentication**: JWT or OAuth2 implementation
- **Authorization**: Role-based access control
- **Audit Logging**: Comprehensive audit trail
- **Secrets Management**: Environment variable encryption

## Contributing

### Development Workflow

1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Run test suite
5. Submit pull request

### Code Standards

- **ESLint**: JavaScript linting
- **Prettier**: Code formatting
- **Conventional Commits**: Standardized commit messages

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues
- **Documentation**: README and API docs
- **Community**: Discord/Slack (if available)

## Roadmap

### Upcoming Features

- [ ] Real-time WebSocket updates
- [ ] Advanced tax optimization strategies
- [ ] Multi-wallet support
- [ ] Automated tax form generation
- [ ] Portfolio rebalancing suggestions

### Integration Plans

- [ ] Major tax software integration
- [ ] DeFi protocol support
- [ ] Cross-chain analytics
- [ ] Mobile API optimization
