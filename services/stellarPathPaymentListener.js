const { Server, Networks, Transaction, Asset } = require('stellar-sdk');
const { Pool } = require('pg');
const moment = require('moment');

class StellarPathPaymentListener {
    constructor(config) {
        this.server = new Server(config.stellarHorizonUrl || 'https://horizon-testnet.stellar.org');
        this.network = config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
        this.db = new Pool(config.database);
        
        // USDC asset configuration (can be customized)
        this.usdcAsset = new Asset(
            config.usdcAssetCode || 'USDC',
            config.usdcAssetIssuer || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV'
        );
        
        this.isListening = false;
        this.lastCursor = null;
        this.retryCount = 0;
        this.maxRetries = config.maxRetries || 5;
        this.retryDelay = config.retryDelay || 5000;
    }

    async initialize() {
        try {
            await this.db.connect();
            console.log('✅ Database connected successfully');
            
            // Get the last processed cursor from database
            const result = await this.db.query(
                'SELECT last_cursor FROM stellar_cursor WHERE service = $1 ORDER BY id DESC LIMIT 1',
                ['path_payment_listener']
            );
            
            if (result.rows.length > 0) {
                this.lastCursor = result.rows[0].last_cursor;
                console.log(`📍 Resuming from cursor: ${this.lastCursor}`);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Stellar listener:', error);
            throw error;
        }
    }

    async startListening() {
        if (this.isListening) {
            console.log('⚠️ Listener is already running');
            return;
        }

        this.isListening = true;
        console.log('🚀 Starting Stellar Path Payment Listener...');
        
        try {
            await this.listenForPathPayments();
        } catch (error) {
            console.error('❌ Error in listener:', error);
            await this.handleError(error);
        }
    }

    async listenForPathPayments() {
        const callBuilder = this.server.transactions()
            .forAccount(this.vestingVaultAddress)
            .cursor(this.lastCursor || 'now');

        if (this.lastCursor) {
            callBuilder.cursor(this.lastCursor);
        }

        const stream = callBuilder.stream({
            onmessage: async (transaction) => {
                await this.processTransaction(transaction);
            },
            onerror: async (error) => {
                console.error('❌ Stream error:', error);
                await this.handleError(error);
            }
        });

        console.log('✅ Listening for Stellar transactions...');
        return stream;
    }

    async processTransaction(transaction) {
        try {
            // Check if this transaction contains path payments
            const pathPayments = this.extractPathPayments(transaction);
            
            if (pathPayments.length === 0) {
                await this.updateCursor(transaction.paging_token);
                return;
            }

            console.log(`🔍 Found ${pathPayments.length} path payment(s) in transaction ${transaction.hash}`);

            for (const pathPayment of pathPayments) {
                await this.processPathPayment(transaction, pathPayment);
            }

            // Update cursor after successful processing
            await this.updateCursor(transaction.paging_token);
            this.retryCount = 0; // Reset retry count on success

        } catch (error) {
            console.error(`❌ Error processing transaction ${transaction.hash}:`, error);
            throw error;
        }
    }

    extractPathPayments(transaction) {
        const pathPayments = [];
        
        if (!transaction.operations) {
            return pathPayments;
        }

        for (const operation of transaction.operations) {
            if (operation.type === 'path_payment') {
                pathPayments.push({
                    ...operation,
                    transaction_hash: transaction.hash,
                    ledger: transaction.ledger,
                    created_at: transaction.created_at
                });
            }
        }

        return pathPayments;
    }

    async processPathPayment(transaction, pathPayment) {
        try {
            // Check if this is a conversion from vesting asset to USDC
            if (!this.isVestingToUSDCConversion(pathPayment)) {
                console.log(`⏭️ Skipping non-vesting conversion in transaction ${transaction.hash}`);
                return;
            }

            // Find the associated claim transaction
            const claimTransaction = await this.findAssociatedClaimTransaction(pathPayment);
            
            if (!claimTransaction) {
                console.log(`⚠️ No associated claim transaction found for path payment ${pathPayment.id}`);
                return;
            }

            // Get user and vault information
            const userInfo = await this.getUserInfo(pathPayment.source_account);
            const vaultInfo = await this.getVaultInfo(userInfo.address, claimTransaction.hash);

            if (!vaultInfo) {
                console.log(`⚠️ No vault found for user ${userInfo.address}`);
                return;
            }

            // Calculate exchange rate
            const exchangeRate = this.calculateExchangeRate(pathPayment);

            // Record the conversion event
            await this.recordConversionEvent({
                user_address: userInfo.address,
                vault_id: vaultInfo.id,
                claim_transaction_hash: claimTransaction.hash,
                path_payment_hash: transaction.hash,
                source_asset_code: pathPayment.source_asset.code,
                source_asset_issuer: pathPayment.source_asset.issuer,
                source_amount: pathPayment.source_amount,
                dest_asset_code: pathPayment.destination_asset.code,
                dest_asset_issuer: pathPayment.destination_asset.issuer,
                dest_amount: pathPayment.destination_amount,
                exchange_rate: exchangeRate,
                exchange_rate_timestamp: new Date(transaction.created_at),
                path_assets: JSON.stringify(pathPayment.path?.map(asset => asset.code) || []),
                path_issuers: JSON.stringify(pathPayment.path?.map(asset => asset.issuer) || []),
                stellar_ledger: transaction.ledger,
                stellar_transaction_time: transaction.created_at
            });

            // Record exchange rate history
            await this.recordExchangeRateHistory({
                source_asset_code: pathPayment.source_asset.code,
                source_asset_issuer: pathPayment.source_asset.issuer,
                dest_asset_code: pathPayment.destination_asset.code,
                dest_asset_issuer: pathPayment.destination_asset.issuer,
                exchange_rate: exchangeRate,
                rate_timestamp: new Date(transaction.created_at),
                stellar_ledger: transaction.ledger,
                rate_source: 'path_payment'
            });

            console.log(`✅ Recorded conversion event: ${pathPayment.source_amount} ${pathPayment.source_asset.code} → ${pathPayment.destination_amount} ${pathPayment.destination_asset.code} (Rate: ${exchangeRate})`);

        } catch (error) {
            console.error(`❌ Error processing path payment ${pathPayment.id}:`, error);
            throw error;
        }
    }

    isVestingToUSDCConversion(pathPayment) {
        // Check if destination is USDC
        const isDestUSDC = pathPayment.destination_asset.code === this.usdcAsset.code &&
                          pathPayment.destination_asset.issuer === this.usdcAsset.issuer;

        // Check if source is not USDC (i.e., it's a vesting asset)
        const isSourceNotUSDC = pathPayment.source_asset.code !== this.usdcAsset.code ||
                               pathPayment.source_asset.issuer !== this.usdcAsset.issuer;

        return isDestUSDC && isSourceNotUSDC;
    }

    calculateExchangeRate(pathPayment) {
        // Exchange rate = destination_amount / source_amount
        const sourceAmount = parseFloat(pathPayment.source_amount);
        const destAmount = parseFloat(pathPayment.destination_amount);
        
        if (sourceAmount === 0) {
            throw new Error('Source amount cannot be zero for exchange rate calculation');
        }

        return destAmount / sourceAmount;
    }

    async findAssociatedClaimTransaction(pathPayment) {
        try {
            // Look for recent claim transactions from the same user
            const result = await this.db.query(`
                SELECT * FROM transactions 
                WHERE transaction_type = 'claim' 
                AND user_address = $1 
                AND created_at >= NOW() - INTERVAL '10 minutes'
                ORDER BY created_at DESC 
                LIMIT 1
            `, [pathPayment.source_account]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Error finding associated claim transaction:', error);
            return null;
        }
    }

    async getUserInfo(stellarAddress) {
        try {
            const result = await this.db.query(
                'SELECT * FROM users WHERE address = $1',
                [stellarAddress]
            );

            if (result.rows.length === 0) {
                // Create user if not exists
                await this.db.query(
                    'INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING',
                    [stellarAddress]
                );
                
                return { address: stellarAddress };
            }

            return result.rows[0];
        } catch (error) {
            console.error('❌ Error getting user info:', error);
            throw error;
        }
    }

    async getVaultInfo(userAddress, claimHash) {
        try {
            const result = await this.db.query(`
                SELECT v.* FROM vaults v
                JOIN transactions t ON v.id = t.vault_id
                WHERE v.user_address = $1 AND t.transaction_hash = $2
                LIMIT 1
            `, [userAddress, claimHash]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Error getting vault info:', error);
            return null;
        }
    }

    async recordConversionEvent(eventData) {
        try {
            const query = `
                INSERT INTO conversion_events (
                    user_address, vault_id, claim_transaction_hash, path_payment_hash,
                    source_asset_code, source_asset_issuer, source_amount,
                    dest_asset_code, dest_asset_issuer, dest_amount,
                    exchange_rate, exchange_rate_timestamp, path_assets, path_issuers,
                    stellar_ledger, stellar_transaction_time
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                )
                RETURNING id
            `;

            const values = [
                eventData.user_address, eventData.vault_id, eventData.claim_transaction_hash,
                eventData.path_payment_hash, eventData.source_asset_code, eventData.source_asset_issuer,
                eventData.source_amount, eventData.dest_asset_code, eventData.dest_asset_issuer,
                eventData.dest_amount, eventData.exchange_rate, eventData.exchange_rate_timestamp,
                eventData.path_assets, eventData.path_issuers, eventData.stellar_ledger,
                eventData.stellar_transaction_time
            ];

            const result = await this.db.query(query, values);
            return result.rows[0].id;
        } catch (error) {
            console.error('❌ Error recording conversion event:', error);
            throw error;
        }
    }

    async recordExchangeRateHistory(rateData) {
        try {
            const query = `
                INSERT INTO exchange_rate_history (
                    source_asset_code, source_asset_issuer, dest_asset_code, dest_asset_issuer,
                    exchange_rate, rate_timestamp, stellar_ledger, rate_source
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING
            `;

            const values = [
                rateData.source_asset_code, rateData.source_asset_issuer,
                rateData.dest_asset_code, rateData.dest_asset_issuer,
                rateData.exchange_rate, rateData.rate_timestamp,
                rateData.stellar_ledger, rateData.rate_source
            ];

            await this.db.query(query, values);
        } catch (error) {
            console.error('❌ Error recording exchange rate history:', error);
            throw error;
        }
    }

    async updateCursor(cursor) {
        try {
            this.lastCursor = cursor;
            
            await this.db.query(`
                INSERT INTO stellar_cursor (service, last_cursor, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (service) 
                DO UPDATE SET last_cursor = $2, updated_at = NOW()
            `, ['path_payment_listener', cursor]);

        } catch (error) {
            console.error('❌ Error updating cursor:', error);
        }
    }

    async handleError(error) {
        this.retryCount++;
        
        if (this.retryCount >= this.maxRetries) {
            console.error('❌ Max retries reached. Stopping listener.');
            this.isListening = false;
            return;
        }

        console.log(`⚠️ Retry ${this.retryCount}/${this.maxRetries} in ${this.retryDelay}ms...`);
        
        setTimeout(async () => {
            try {
                await this.startListening();
            } catch (retryError) {
                console.error('❌ Retry failed:', retryError);
                await this.handleError(retryError);
            }
        }, this.retryDelay);
    }

    async stop() {
        this.isListening = false;
        console.log('🛑 Stellar Path Payment Listener stopped');
        
        if (this.db) {
            await this.db.end();
        }
    }
}

module.exports = StellarPathPaymentListener;
