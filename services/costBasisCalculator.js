const { Pool } = require('pg');
const moment = require('moment');

class CostBasisCalculator {
    constructor(config) {
        this.db = new Pool(config.database);
        this.usdPriceOracle = config.usdPriceOracle || 'coingecko'; // Default to CoinGecko
    }

    async calculateCostBasis(userAddress, conversionEventId) {
        try {
            // Get the conversion event
            const conversionEvent = await this.getConversionEvent(conversionEventId);
            
            if (!conversionEvent) {
                throw new Error('Conversion event not found');
            }

            // Get acquisition price (price when tokens were originally acquired)
            const acquisitionPrice = await this.getAcquisitionPrice(
                conversionEvent.user_address,
                conversionEvent.source_asset_code,
                conversionEvent.source_asset_issuer
            );

            // Get disposal price (exchange rate at time of conversion)
            const disposalPrice = conversionEvent.exchange_rate;

            // Calculate cost basis and capital gains
            const costBasisAmount = acquisitionPrice * parseFloat(conversionEvent.source_amount);
            const proceedsAmount = disposalPrice * parseFloat(conversionEvent.source_amount);
            const capitalGainLoss = proceedsAmount - costBasisAmount;

            // Calculate holding period
            const holdingPeriodDays = await this.calculateHoldingPeriod(
                conversionEvent.user_address,
                conversionEvent.source_asset_code,
                conversionEvent.exchange_rate_timestamp
            );

            // Determine tax year
            const taxYear = moment(conversionEvent.exchange_rate_timestamp).year();

            const costBasisData = {
                user_address: conversionEvent.user_address,
                conversion_event_id: conversionEventId,
                acquisition_price: acquisitionPrice,
                disposal_price: disposalPrice,
                quantity: parseFloat(conversionEvent.source_amount),
                cost_basis_amount: costBasisAmount,
                proceeds_amount: proceedsAmount,
                capital_gain_loss: capitalGainLoss,
                tax_year: taxYear,
                holding_period_days: holdingPeriodDays
            };

            // Save to database
            await this.saveCostBasis(costBasisData);

            return costBasisData;

        } catch (error) {
            console.error('❌ Error calculating cost basis:', error);
            throw error;
        }
    }

    async getConversionEvent(conversionEventId) {
        try {
            const result = await this.db.query(
                'SELECT * FROM conversion_events WHERE id = $1',
                [conversionEventId]
            );

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ Error getting conversion event:', error);
            throw error;
        }
    }

    async getAcquisitionPrice(userAddress, assetCode, assetIssuer) {
        try {
            // First, try to get the original acquisition price from vault transactions
            const result = await this.db.query(`
                SELECT 
                    v.total_locked / NULLIF(v.total_claimable, 0) as avg_acquisition_rate,
                    MIN(t.created_at) as first_acquisition_date
                FROM vaults v
                JOIN transactions t ON v.id = t.vault_id
                WHERE v.user_address = $1 
                AND t.transaction_type = 'lock'
                GROUP BY v.id, v.total_locked, v.total_claimable
                LIMIT 1
            `, [userAddress]);

            if (result.rows.length > 0 && result.rows[0].avg_acquisition_rate) {
                // This gives us the rate in terms of vesting asset per claimable asset
                // We need to convert this to USD price
                const acquisitionDate = result.rows[0].first_acquisition_date;
                const usdPrice = await this.getHistoricalUSDPrice(assetCode, acquisitionDate);
                
                return usdPrice * result.rows[0].avg_acquisition_rate;
            }

            // Fallback: use historical price data
            const fallbackResult = await this.db.query(`
                SELECT exchange_rate 
                FROM exchange_rate_history 
                WHERE source_asset_code = $1 
                AND dest_asset_code = 'USDC'
                AND rate_timestamp <= NOW()
                ORDER BY rate_timestamp DESC 
                LIMIT 1
            `, [assetCode]);

            if (fallbackResult.rows.length > 0) {
                return parseFloat(fallbackResult.rows[0].exchange_rate);
            }

            // Final fallback: use current market price
            return await this.getCurrentUSDPrice(assetCode);

        } catch (error) {
            console.error('❌ Error getting acquisition price:', error);
            // Return 0 as fallback to prevent complete failure
            return 0;
        }
    }

    async getHistoricalUSDPrice(assetCode, date) {
        try {
            // Check if we have historical data in our database
            const result = await this.db.query(`
                SELECT exchange_rate 
                FROM exchange_rate_history 
                WHERE source_asset_code = $1 
                AND dest_asset_code = 'USDC'
                AND rate_timestamp <= $2
                ORDER BY rate_timestamp DESC 
                LIMIT 1
            `, [assetCode, date]);

            if (result.rows.length > 0) {
                return parseFloat(result.rows[0].exchange_rate);
            }

            // If not in database, fetch from external API
            return await this.fetchHistoricalPriceFromAPI(assetCode, date);

        } catch (error) {
            console.error('❌ Error getting historical USD price:', error);
            return await this.getCurrentUSDPrice(assetCode);
        }
    }

    async getCurrentUSDPrice(assetCode) {
        try {
            // For now, return a placeholder. In production, this would call CoinGecko or similar
            console.log(`🔍 Getting current USD price for ${assetCode}`);
            
            // Check database first
            const result = await this.db.query(`
                SELECT exchange_rate 
                FROM exchange_rate_history 
                WHERE source_asset_code = $1 
                AND dest_asset_code = 'USDC'
                ORDER BY rate_timestamp DESC 
                LIMIT 1
            `, [assetCode]);

            if (result.rows.length > 0) {
                return parseFloat(result.rows[0].exchange_rate);
            }

            // Fallback price (should be replaced with actual API call)
            const fallbackPrices = {
                'XLM': 0.12,
                'USD': 1.0,
                'BTC': 45000,
                'ETH': 3000
            };

            return fallbackPrices[assetCode] || 1.0;

        } catch (error) {
            console.error('❌ Error getting current USD price:', error);
            return 1.0;
        }
    }

    async fetchHistoricalPriceFromAPI(assetCode, date) {
        try {
            // This would integrate with CoinGecko, CoinMarketCap, or similar
            // For now, return the current price as a placeholder
            console.log(`📡 Fetching historical price for ${assetCode} on ${date}`);
            return await this.getCurrentUSDPrice(assetCode);

        } catch (error) {
            console.error('❌ Error fetching historical price from API:', error);
            return await this.getCurrentUSDPrice(assetCode);
        }
    }

    async calculateHoldingPeriod(userAddress, assetCode, disposalDate) {
        try {
            // Find the earliest acquisition date for this asset
            const result = await this.db.query(`
                SELECT MIN(t.created_at) as acquisition_date
                FROM transactions t
                JOIN vaults v ON t.vault_id = v.id
                WHERE v.user_address = $1 
                AND t.transaction_type = 'lock'
                AND t.created_at <= $2
            `, [userAddress, disposalDate]);

            if (result.rows.length > 0 && result.rows[0].acquisition_date) {
                const acquisitionDate = moment(result.rows[0].acquisition_date);
                const disposalMoment = moment(disposalDate);
                
                return disposalMoment.diff(acquisitionDate, 'days');
            }

            return 0;

        } catch (error) {
            console.error('❌ Error calculating holding period:', error);
            return 0;
        }
    }

    async saveCostBasis(costBasisData) {
        try {
            const query = `
                INSERT INTO cost_basis (
                    user_address, conversion_event_id, acquisition_price, disposal_price,
                    quantity, cost_basis_amount, proceeds_amount, capital_gain_loss,
                    tax_year, holding_period_days
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                )
                ON CONFLICT (conversion_event_id) 
                DO UPDATE SET
                    acquisition_price = $3,
                    disposal_price = $4,
                    quantity = $5,
                    cost_basis_amount = $6,
                    proceeds_amount = $7,
                    capital_gain_loss = $8,
                    tax_year = $9,
                    holding_period_days = $10,
                    updated_at = NOW()
                RETURNING id
            `;

            const values = [
                costBasisData.user_address,
                costBasisData.conversion_event_id,
                costBasisData.acquisition_price,
                costBasisData.disposal_price,
                costBasisData.quantity,
                costBasisData.cost_basis_amount,
                costBasisData.proceeds_amount,
                costBasisData.capital_gain_loss,
                costBasisData.tax_year,
                costBasisData.holding_period_days
            ];

            const result = await this.db.query(query, values);
            return result.rows[0].id;

        } catch (error) {
            console.error('❌ Error saving cost basis:', error);
            throw error;
        }
    }

    async getUserCostBasisSummary(userAddress, taxYear = null) {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_conversions,
                    SUM(quantity) as total_quantity_converted,
                    SUM(cost_basis_amount) as total_cost_basis,
                    SUM(proceeds_amount) as total_proceeds,
                    SUM(capital_gain_loss) as total_capital_gain_loss,
                    AVG(capital_gain_loss) as avg_gain_loss_per_conversion,
                    tax_year
                FROM cost_basis 
                WHERE user_address = $1
            `;

            const params = [userAddress];

            if (taxYear) {
                query += ' AND tax_year = $2';
                params.push(taxYear);
            }

            query += ' GROUP BY tax_year ORDER BY tax_year DESC';

            const result = await this.db.query(query, params);
            return result.rows;

        } catch (error) {
            console.error('❌ Error getting user cost basis summary:', error);
            throw error;
        }
    }

    async getConversionEventsForUser(userAddress, startDate = null, endDate = null) {
        try {
            let query = `
                SELECT ce.*, cb.capital_gain_loss, cb.holding_period_days
                FROM conversion_events ce
                LEFT JOIN cost_basis cb ON ce.id = cb.conversion_event_id
                WHERE ce.user_address = $1
            `;

            const params = [userAddress];

            if (startDate) {
                query += ' AND ce.exchange_rate_timestamp >= $2';
                params.push(startDate);
            }

            if (endDate) {
                const paramIndex = params.length + 1;
                query += ` AND ce.exchange_rate_timestamp <= $${paramIndex}`;
                params.push(endDate);
            }

            query += ' ORDER BY ce.exchange_rate_timestamp DESC';

            const result = await this.db.query(query, params);
            return result.rows;

        } catch (error) {
            console.error('❌ Error getting conversion events for user:', error);
            throw error;
        }
    }

    async calculateTaxReport(userAddress, taxYear) {
        try {
            const summary = await this.getUserCostBasisSummary(userAddress, taxYear);
            const events = await this.getConversionEventsForUser(
                userAddress, 
                `${taxYear}-01-01`, 
                `${taxYear}-12-31`
            );

            // Categorize gains/losses by holding period
            const shortTermGains = events.filter(e => e.holding_period_days <= 365);
            const longTermGains = events.filter(e => e.holding_period_days > 365);

            const taxReport = {
                tax_year: taxYear,
                user_address: userAddress,
                summary: summary[0] || {},
                short_term_gains: {
                    count: shortTermGains.length,
                    total_gain_loss: shortTermGains.reduce((sum, e) => sum + (parseFloat(e.capital_gain_loss) || 0), 0),
                    events: shortTermGains
                },
                long_term_gains: {
                    count: longTermGains.length,
                    total_gain_loss: longTermGains.reduce((sum, e) => sum + (parseFloat(e.capital_gain_loss) || 0), 0),
                    events: longTermGains
                },
                all_events: events
            };

            return taxReport;

        } catch (error) {
            console.error('❌ Error calculating tax report:', error);
            throw error;
        }
    }
}

module.exports = CostBasisCalculator;
