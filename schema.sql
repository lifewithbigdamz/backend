-- Enhanced Vesting Vault Database Schema with Multi-Currency Path Payment Analytics
-- Compatible with PostgreSQL (primary) and MySQL (secondary)

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vaults table
CREATE TABLE IF NOT EXISTS vaults (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    type ENUM('advisor', 'investor') CHECK (type IN ('advisor', 'investor')),
    total_locked DECIMAL(20, 8) DEFAULT 0,
    total_claimable DECIMAL(20, 8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_address) REFERENCES users(address)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    vault_id INTEGER NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    transaction_type ENUM('lock', 'claim') CHECK (transaction_type IN ('lock', 'claim')),
    transaction_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vault_id) REFERENCES vaults(id)
);

-- NEW: Conversion Events table for tracking path payments
CREATE TABLE IF NOT EXISTS conversion_events (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    vault_id INTEGER NOT NULL,
    claim_transaction_hash VARCHAR(66) NOT NULL,
    path_payment_hash VARCHAR(66) NOT NULL,
    
    -- Source asset information (vesting asset)
    source_asset_code VARCHAR(12) NOT NULL,
    source_asset_issuer VARCHAR(56),
    source_amount DECIMAL(20, 8) NOT NULL,
    
    -- Destination asset information (payout asset, typically USDC)
    dest_asset_code VARCHAR(12) NOT NULL,
    dest_asset_issuer VARCHAR(56),
    dest_amount DECIMAL(20, 8) NOT NULL,
    
    -- Exchange rate information
    exchange_rate DECIMAL(20, 8) NOT NULL, -- dest_amount / source_amount
    exchange_rate_timestamp TIMESTAMP NOT NULL,
    
    -- Path details (for multi-hop paths)
    path_assets JSON, -- Array of asset codes in the path
    path_issuers JSON, -- Corresponding array of issuers
    
    -- Stellar transaction details
    stellar_ledger BIGINT,
    stellar_transaction_time TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_address) REFERENCES users(address),
    FOREIGN KEY (vault_id) REFERENCES vaults(id)
);

-- NEW: Cost Basis table for tax reporting
CREATE TABLE IF NOT EXISTS cost_basis (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    conversion_event_id INTEGER NOT NULL,
    
    -- Cost basis calculation
    acquisition_price DECIMAL(20, 8) NOT NULL, -- Price in USD when acquired
    disposal_price DECIMAL(20, 8) NOT NULL, -- Price in USD when disposed
    quantity DECIMAL(20, 8) NOT NULL,
    
    -- Capital gains calculation
    cost_basis_amount DECIMAL(20, 8) NOT NULL, -- acquisition_price * quantity
    proceeds_amount DECIMAL(20, 8) NOT NULL, -- disposal_price * quantity
    capital_gain_loss DECIMAL(20, 8) NOT NULL, -- proceeds_amount - cost_basis_amount
    
    -- Tax reporting
    tax_year INTEGER NOT NULL,
    holding_period_days INTEGER, -- Days between acquisition and disposal
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_address) REFERENCES users(address),
    FOREIGN KEY (conversion_event_id) REFERENCES conversion_events(id)
);

-- NEW: Exchange Rate History table for historical data
CREATE TABLE IF NOT EXISTS exchange_rate_history (
    id SERIAL PRIMARY KEY,
    source_asset_code VARCHAR(12) NOT NULL,
    source_asset_issuer VARCHAR(56),
    dest_asset_code VARCHAR(12) NOT NULL,
    dest_asset_issuer VARCHAR(56),
    
    exchange_rate DECIMAL(20, 8) NOT NULL,
    rate_timestamp TIMESTAMP NOT NULL,
    stellar_ledger BIGINT,
    
    -- Source of the rate (direct trade, path payment, oracle, etc.)
    rate_source VARCHAR(20) NOT NULL, -- 'path_payment', 'direct_trade', 'oracle'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Heartbeat table for monitoring
CREATE TABLE IF NOT EXISTS heartbeat_log (
    id SERIAL PRIMARY KEY,
    db_instance VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_time INTEGER,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vaults_user_address ON vaults(user_address);
CREATE INDEX IF NOT EXISTS idx_transactions_vault_id ON transactions(vault_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_checked_at ON heartbeat_log(checked_at);

-- NEW: Indexes for conversion events
CREATE INDEX IF NOT EXISTS idx_conversion_events_user_address ON conversion_events(user_address);
CREATE INDEX IF NOT EXISTS idx_conversion_events_vault_id ON conversion_events(vault_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_claim_hash ON conversion_events(claim_transaction_hash);
CREATE INDEX IF NOT EXISTS idx_conversion_events_path_hash ON conversion_events(path_payment_hash);
CREATE INDEX IF NOT EXISTS idx_conversion_events_timestamp ON conversion_events(exchange_rate_timestamp);

-- NEW: Indexes for cost basis
CREATE INDEX IF NOT EXISTS idx_cost_basis_user_address ON cost_basis(user_address);
CREATE INDEX IF NOT EXISTS idx_cost_basis_conversion_event ON cost_basis(conversion_event_id);
CREATE INDEX IF NOT EXISTS idx_cost_basis_tax_year ON cost_basis(tax_year);

-- NEW: Indexes for exchange rate history
CREATE INDEX IF NOT EXISTS idx_exchange_rate_assets ON exchange_rate_history(source_asset_code, dest_asset_code);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_timestamp ON exchange_rate_history(rate_timestamp);

-- Sample data for testing
INSERT INTO users (address) VALUES 
    ('0x1234567890abcdef1234567890abcdef12345678'),
    ('0xabcdef1234567890abcdef1234567890abcdef12')
ON CONFLICT (address) DO NOTHING;

INSERT INTO vaults (user_address, type, total_locked, total_claimable) VALUES 
    ('0x1234567890abcdef1234567890abcdef12345678', 'advisor', 80.0, 15.0),
    ('0x1234567890abcdef1234567890abcdef12345678', 'investor', 20.0, 5.0),
    ('0xabcdef1234567890abcdef1234567890abcdef12', 'advisor', 120.0, 25.0)
ON CONFLICT DO NOTHING;
