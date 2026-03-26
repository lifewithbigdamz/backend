# API Documentation for Verinode Vesting Vault System

## Overview
The Verinode Vesting Vault API provides a comprehensive interface for managing vesting schedules, claims, and administrative operations. This system supports both REST and GraphQL APIs for maximum flexibility.

## Swagger Documentation

### Accessing the Documentation
The API documentation is available through Swagger UI at:
- **Local Development**: http://localhost:3000/api-docs
- **Production**: [Replace with production URL]

### API Endpoints

#### 1. General Endpoints
- `GET /` - Health check endpoint
- `GET /health` - Detailed health status

#### 2. Claims Endpoints
- `POST /api/claims` - Process a new claim
- `POST /api/claims/batch` - Process multiple claims in batch
- `GET /api/claims/{userAddress}/realized-gains` - Get realized gains for a user

#### 3. Administrative Endpoints
- `POST /api/admin/revoke` - Revoke admin access
- `POST /api/admin/create` - Create new admin
- `POST /api/admin/transfer` - Transfer vault ownership
- `GET /api/admin/audit-logs` - Get audit logs

#### 4. Portfolio Endpoints
- `GET /api/user/{address}/portfolio` - Get user portfolio

#### 5. Account Consolidation Endpoints (Issue #134 #77)
- `GET /api/user/{address}/consolidated` - Get consolidated vesting view for beneficiary
- `POST /api/admin/consolidate-accounts` - Merge beneficiary addresses

**Account Consolidation Details:**

##### Get Consolidated View
```http
GET /api/user/{address}/consolidated?organizationId={orgId}&tokenAddress={tokenAddr}&vaultAddresses={array}&asOfDate={date}
```

**Query Parameters:**
- `organizationId` (optional): Filter by specific organization ID
- `tokenAddress` (optional): Filter by specific token address  
- `vaultAddresses` (optional): JSON array of vault addresses to include
- `asOfDate` (optional): Calculate as of specific ISO date (default: now)

**Response:**
```json
{
  "success": true,
  "data": {
    "beneficiary_address": "0x...",
    "as_of_date": "2024-01-01T00:00:00.000Z",
    "total_vaults": 3,
    "total_allocated": "1500.00",
    "total_withdrawn": "300.00", 
    "total_withdrawable": "200.00",
    "total_vested": "500.00",
    "weighted_average_cliff_date": "2024-06-01T00:00:00.000Z",
    "weighted_average_end_date": "2025-06-01T00:00:00.000Z",
    "average_vesting_duration_seconds": 31536000,
    "vaults": [
      {
        "vault_address": "0x...",
        "vault_name": "Team Vesting",
        "token_address": "0x...",
        "allocated": "500.00",
        "withdrawn": "100.00",
        "withdrawable": "50.00",
        "vested": "150.00",
        "cliff_date": "2024-06-01T00:00:00.000Z",
        "end_date": "2025-06-01T00:00:00.000Z",
        "vesting_duration_seconds": 31536000,
        "sub_schedules_count": 2,
        "tag": "Team"
      }
    ],
    "consolidation_summary": {
      "original_vesting_tracks": 8,
      "consolidated_tracks": 3,
      "consolidation_efficiency": 63
    }
  }
}
```

##### Merge Beneficiary Addresses
```http
POST /api/admin/consolidate-accounts
```

**Body:**
```json
{
  "primaryAddress": "0x...",
  "addressesToMerge": ["0x...", "0x..."],
  "adminAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "primary_address": "0x...",
    "merged_addresses": ["0x...", "0x..."],
    "vaults_updated": 5,
    "total_allocation_transferred": "1000.00",
    "total_withdrawal_transferred": "250.00"
  }
}
```

#### 6. GraphQL Endpoint
- `GET/POST /graphql` - GraphQL Playground and API endpoint

### Authentication

The API supports two authentication methods:

1. **Bearer Token Authentication**:
   ```
   Authorization: Bearer <token>
   ```
   Valid tokens:
   - `admin-token` - Grants admin privileges
   - `user-token` - Grants user privileges

2. **X-User-Address Header**:
   ```
   x-user-address: <wallet_address>
   ```

### Security Schemes
- `BearerAuth`: HTTP Bearer authentication with JWT format
- `XUserAddress`: API key in header for wallet address identification

### Models

#### Vault
- `id`: Auto-generated unique identifier
- `address`: Smart contract address of the vault
- `name`: Human-readable name for the vault
- `tokenAddress`: Address of the token being vested
- `ownerAddress`: Address of the vault owner
- `totalAmount`: Total amount of tokens in the vault
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

#### Beneficiary
- `id`: Auto-generated unique identifier
- `vaultId`: ID of the associated vault
- `address`: Address of the beneficiary
- `totalAllocated`: Total tokens allocated to the beneficiary
- `totalWithdrawn`: Total tokens withdrawn by the beneficiary
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

#### SubSchedule
- `id`: Auto-generated unique identifier
- `vaultId`: ID of the associated vault
- `topUpAmount`: Amount added during the top-up
- `cliffDuration`: Duration of the cliff period in seconds
- `vestingDuration`: Duration of the vesting period in seconds
- `startTimestamp`: Start timestamp of the schedule
- `endTimestamp`: End timestamp of the schedule
- `transactionHash`: Hash of the top-up transaction
- `blockNumber`: Block number of the top-up transaction
- `amountWithdrawn`: Amount already withdrawn from this schedule
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

#### Claim
- `id`: Auto-generated unique identifier
- `userAddress`: Address of the user claiming tokens
- `tokenAddress`: Address of the claimed token
- `amountClaimed`: Amount of tokens claimed
- `claimTimestamp`: Timestamp of the claim
- `transactionHash`: Hash of the claim transaction
- `blockNumber`: Block number of the claim transaction
- `priceAtClaimUsd`: Price of the token at the time of claim in USD
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

## Getting Started

1. Start the server:
   ```bash
   cd backend
   npm run dev
   ```

2. Access the Swagger documentation at http://localhost:3000/api-docs

3. Use the interactive documentation to test API endpoints

## GraphQL Schema

The GraphQL schema provides comprehensive access to all features of the vesting vault system. The schema includes:
- Queries for retrieving vaults, beneficiaries, sub-schedules, and claims
- Mutations for creating and updating vaults, processing claims, and administrative operations
- Subscriptions for real-time updates on vault changes