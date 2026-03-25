# Vesting Vault Backend with Multi-Currency Path Payment Analytics

This backend service provides comprehensive analytics for the Vesting Vault platform, including real-time tracking of Stellar DEX path payments, cost basis calculations, and capital gains reporting for tax purposes.

## Features

### 🌟 Core Features
- **Real-time Stellar DEX Path Payment Monitoring**: Listens for and processes path payments in real-time
- **Conversion Event Tracking**: Records every claim-and-swap transaction with precise exchange rates
- **Cost Basis Calculation**: Automatically calculates cost basis for tax reporting
- **Capital Gains Reporting**: Generates comprehensive tax reports with short-term and long-term gains
- **Exchange Rate History**: Maintains historical exchange rate data for accurate reporting

### 🔧 Technical Features
- **Multi-Asset Support**: Handles various Stellar assets and multi-hop paths
- **Real-time Processing**: Stream-based processing of Stellar transactions
- **Fault Tolerance**: Retry mechanisms and error handling
- **RESTful API**: Comprehensive API endpoints for analytics
- **Database Integration**: PostgreSQL/MySQL support with optimized schemas

## Architecture

```
├── services/
│   ├── stellarPathPaymentListener.js  # Stellar DEX monitoring service
│   └── costBasisCalculator.js         # Cost basis and tax calculations
├── routes/
│   └── analytics.js                   # API endpoints for analytics
├── schema.sql                         # Database schema
├── index.js                           # Main application entry point
└── .env.example                       # Environment configuration template
```

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/lifewithbigdamz/backend.git
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   # PostgreSQL (recommended)
   createdb vesting_vault
   psql -d vesting_vault -f schema.sql
   
   # MySQL (alternative)
   mysql -u root -p -e "CREATE DATABASE vesting_vault;"
   mysql -u root -p vesting_vault < schema.sql
   ```

5. **Start the application**
   ```bash
   npm start
   
   # For development with auto-reload
   npm run dev
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | vesting_vault |
| `DB_USER` | Database username | postgres |
| `DB_PASSWORD` | Database password | password |
| `STELLAR_HORIZON_URL` | Stellar Horizon API URL | https://horizon-testnet.stellar.org |
| `STELLAR_NETWORK` | Stellar network (testnet/mainnet) | testnet |
| `VESTING_VAULT_ADDRESS` | Vesting vault Stellar address | Required |
| `USDC_ASSET_CODE` | USDC asset code | USDC |
| `USDC_ASSET_ISSUER` | USDC asset issuer | Stellar testnet issuer |
| `MAX_RETRIES` | Maximum retry attempts for Stellar listener | 5 |
| `RETRY_DELAY` | Retry delay in milliseconds | 5000 |

### Stellar Network Setup

For **production**, update the Stellar configuration:
```env
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK=mainnet
USDC_ASSET_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV
```

## API Endpoints

### Cost Basis & Analytics

#### Get Cost Basis Summary
```http
GET /api/analytics/cost-basis/:userAddress?taxYear=2023
```

#### Get Conversion Events
```http
GET /api/analytics/conversion-events/:userAddress?startDate=2023-01-01&endDate=2023-12-31&page=1&limit=50
```

#### Calculate Cost Basis
```http
POST /api/analytics/calculate-cost-basis
Content-Type: application/json

{
  "conversionEventId": 123,
  "userAddress": "GABC..."
}
```

#### Generate Tax Report
```http
GET /api/analytics/tax-report/:userAddress/:taxYear
```

#### Get Portfolio Analytics
```http
GET /api/analytics/portfolio/:userAddress?includeUnrealized=true
```

#### Get Dashboard Summary
```http
GET /api/analytics/dashboard/:userAddress?period=year
```

### System Endpoints

#### Health Check
```http
GET /health
```

#### Root Information
```http
GET /
```

## Database Schema

### Core Tables

#### `conversion_events`
Tracks every claim-and-swap transaction with exchange rates and path details.

#### `cost_basis`
Stores calculated cost basis and capital gains for tax reporting.

#### `exchange_rate_history`
Maintains historical exchange rate data for accurate calculations.

#### `users` & `vaults`
Core vesting vault data structures.

## How It Works

### 1. Path Payment Detection
The Stellar listener monitors the vesting vault account for path payment transactions:
- Filters for conversions from vesting assets to USDC
- Extracts source/destination assets and amounts
- Calculates exact exchange rates at transaction time

### 2. Conversion Event Recording
For each detected conversion:
- Links to the original claim transaction
- Records complete path information (for multi-hop trades)
- Stores precise exchange rate and timestamp
- Updates exchange rate history

### 3. Cost Basis Calculation
Automatically calculates:
- **Acquisition Price**: Original cost basis when tokens were vested
- **Disposal Price**: Exchange rate at time of conversion
- **Capital Gains/Losses**: Difference between disposal and acquisition
- **Holding Period**: Days between acquisition and disposal

### 4. Tax Reporting
Generates comprehensive reports including:
- Short-term gains (≤365 days holding period)
- Long-term gains (>365 days holding period)
- Yearly summaries and detailed transaction logs

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Monitoring & Logging

The application provides comprehensive logging:
- Stellar transaction processing
- Cost basis calculations
- API request/response logging
- Error tracking and retry mechanisms

## Security Considerations

- **API Authentication**: Implement JWT-based authentication for production
- **Admin Functions**: Protected admin endpoints with secure keys
- **Database Security**: Use connection pooling and parameterized queries
- **Rate Limiting**: Implement rate limiting for API endpoints
- **Environment Variables**: Keep sensitive data in environment files

## Performance Optimization

- **Database Indexing**: Optimized indexes for frequent queries
- **Connection Pooling**: Database connection management
- **Caching**: Exchange rate caching for performance
- **Pagination**: Efficient data retrieval for large datasets

## Troubleshooting

### Common Issues

1. **Stellar Listener Fails to Start**
   - Check Stellar network configuration
   - Verify vesting vault address
   - Ensure Horizon API is accessible

2. **Database Connection Errors**
   - Verify database credentials
   - Check database server status
   - Ensure schema is properly installed

3. **Missing Cost Basis Data**
   - Run the recalculate-all endpoint
   - Check conversion events are being recorded
   - Verify acquisition price data sources

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Review the troubleshooting section
- Check the API documentation

---

**Note**: This implementation is designed for the Vesting Vault platform's specific needs around multi-currency path payment analytics and tax reporting. It can be extended to support additional features and asset types as needed.
