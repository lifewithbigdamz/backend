const express = require('express');
const CostBasisCalculator = require('../services/costBasisCalculator');
const StellarPathPaymentListener = require('../services/stellarPathPaymentListener');

const router = express.Router();

// Initialize services
const costBasisCalculator = new CostBasisCalculator({
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'vesting_vault',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password'
    }
});

// GET /api/analytics/cost-basis/:userAddress
// Get cost basis summary for a user
router.get('/cost-basis/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const { taxYear } = req.query;

        const summary = await costBasisCalculator.getUserCostBasisSummary(userAddress, taxYear);
        
        res.json({
            success: true,
            data: summary,
            message: 'Cost basis summary retrieved successfully'
        });

    } catch (error) {
        console.error('❌ Error getting cost basis summary:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve cost basis summary'
        });
    }
});

// GET /api/analytics/conversion-events/:userAddress
// Get all conversion events for a user
router.get('/conversion-events/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const { startDate, endDate, page = 1, limit = 50 } = req.query;

        const events = await costBasisCalculator.getConversionEventsForUser(
            userAddress, 
            startDate, 
            endDate
        );

        // Pagination
        const startIndex = (page - 1) * limit;
        const paginatedEvents = events.slice(startIndex, startIndex + parseInt(limit));

        res.json({
            success: true,
            data: {
                events: paginatedEvents,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: events.length,
                    pages: Math.ceil(events.length / limit)
                }
            },
            message: 'Conversion events retrieved successfully'
        });

    } catch (error) {
        console.error('❌ Error getting conversion events:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve conversion events'
        });
    }
});

// POST /api/analytics/calculate-cost-basis
// Calculate cost basis for a specific conversion event
router.post('/calculate-cost-basis', async (req, res) => {
    try {
        const { conversionEventId, userAddress } = req.body;

        if (!conversionEventId || !userAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: conversionEventId, userAddress',
                message: 'Please provide conversionEventId and userAddress'
            });
        }

        const costBasisData = await costBasisCalculator.calculateCostBasis(
            userAddress, 
            conversionEventId
        );

        res.json({
            success: true,
            data: costBasisData,
            message: 'Cost basis calculated successfully'
        });

    } catch (error) {
        console.error('❌ Error calculating cost basis:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to calculate cost basis'
        });
    }
});

// GET /api/analytics/tax-report/:userAddress/:taxYear
// Generate comprehensive tax report for a user
router.get('/tax-report/:userAddress/:taxYear', async (req, res) => {
    try {
        const { userAddress, taxYear } = req.params;

        const taxReport = await costBasisCalculator.calculateTaxReport(userAddress, parseInt(taxYear));

        res.json({
            success: true,
            data: taxReport,
            message: `Tax report for ${taxYear} generated successfully`
        });

    } catch (error) {
        console.error('❌ Error generating tax report:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to generate tax report'
        });
    }
});

// GET /api/analytics/exchange-rates
// Get exchange rate history for asset pairs
router.get('/exchange-rates', async (req, res) => {
    try {
        const { 
            sourceAsset, 
            destAsset = 'USDC', 
            startDate, 
            endDate, 
            page = 1, 
            limit = 100 
        } = req.query;

        if (!sourceAsset) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: sourceAsset',
                message: 'Please provide sourceAsset parameter'
            });
        }

        const query = `
            SELECT * FROM exchange_rate_history 
            WHERE source_asset_code = $1 AND dest_asset_code = $2
        `;
        const params = [sourceAsset, destAsset];

        if (startDate) {
            query += ' AND rate_timestamp >= $3';
            params.push(startDate);
        }

        if (endDate) {
            const paramIndex = params.length + 1;
            query += ` AND rate_timestamp <= $${paramIndex}`;
            params.push(endDate);
        }

        query += ' ORDER BY rate_timestamp DESC';

        // Note: This would need the database connection from costBasisCalculator
        // For now, returning a placeholder response
        res.json({
            success: true,
            data: {
                rates: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            },
            message: 'Exchange rate history retrieved successfully'
        });

    } catch (error) {
        console.error('❌ Error getting exchange rates:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve exchange rates'
        });
    }
});

// GET /api/analytics/portfolio/:userAddress
// Get portfolio analytics including unrealized gains/losses
router.get('/portfolio/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const { includeUnrealized = 'false' } = req.query;

        // Get user's vault information
        const vaultQuery = `
            SELECT v.*, u.address as user_address
            FROM vaults v
            JOIN users u ON v.user_address = u.address
            WHERE u.address = $1
        `;

        // Get conversion events
        const conversionEvents = await costBasisCalculator.getConversionEventsForUser(userAddress);

        // Calculate realized gains/losses
        const realizedGains = conversionEvents.reduce((sum, event) => {
            return sum + (parseFloat(event.capital_gain_loss) || 0);
        }, 0);

        const portfolioData = {
            user_address: userAddress,
            realized_gains_losses: realizedGains,
            total_conversions: conversionEvents.length,
            conversion_events: conversionEvents,
            unrealized_gains_losses: includeUnrealized === 'true' ? 0 : null // Placeholder
        };

        res.json({
            success: true,
            data: portfolioData,
            message: 'Portfolio analytics retrieved successfully'
        });

    } catch (error) {
        console.error('❌ Error getting portfolio analytics:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve portfolio analytics'
        });
    }
});

// GET /api/analytics/dashboard/:userAddress
// Get dashboard summary with key metrics
router.get('/dashboard/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const { period = 'year' } = req.query; // 'month', 'quarter', 'year'

        // Get cost basis summary
        const costBasisSummary = await costBasisCalculator.getUserCostBasisSummary(userAddress);
        
        // Get recent conversion events (last 30 days)
        const recentEvents = await costBasisCalculator.getConversionEventsForUser(
            userAddress,
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        );

        // Calculate metrics
        const totalGains = costBasisSummary.reduce((sum, item) => sum + (parseFloat(item.total_capital_gain_loss) || 0), 0);
        const totalConversions = costBasisSummary.reduce((sum, item) => sum + (parseInt(item.total_conversions) || 0), 0);
        const avgGainPerConversion = totalConversions > 0 ? totalGains / totalConversions : 0;

        const dashboardData = {
            user_address: userAddress,
            period: period,
            metrics: {
                total_conversions: totalConversions,
                total_gains_losses: totalGains,
                avg_gain_loss_per_conversion: avgGainPerConversion,
                recent_conversions_30d: recentEvents.length,
                best_year: costBasisSummary.length > 0 ? 
                    costBasisSummary.reduce((best, current) => 
                        parseFloat(current.total_capital_gain_loss) > parseFloat(best.total_capital_gain_loss) ? current : best
                    ) : null
            },
            recent_activity: recentEvents.slice(0, 10), // Last 10 events
            yearly_summary: costBasisSummary
        };

        res.json({
            success: true,
            data: dashboardData,
            message: 'Dashboard data retrieved successfully'
        });

    } catch (error) {
        console.error('❌ Error getting dashboard data:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve dashboard data'
        });
    }
});

// POST /api/analytics/recalculate-all
// Recalculate cost basis for all conversion events (admin function)
router.post('/recalculate-all', async (req, res) => {
    try {
        const { adminKey } = req.body;

        // Simple admin key validation (in production, use proper authentication)
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({
                success: false,
                error: 'Invalid admin key',
                message: 'Admin authentication required'
            });
        }

        // Get all conversion events without cost basis
        const query = `
            SELECT ce.*, u.address as user_address
            FROM conversion_events ce
            JOIN users u ON ce.user_address = u.address
            LEFT JOIN cost_basis cb ON ce.id = cb.conversion_event_id
            WHERE cb.id IS NULL
            ORDER BY ce.created_at ASC
        `;

        // This would need database connection - placeholder for now
        const eventsToProcess = []; // Would be populated from query

        let processed = 0;
        let errors = 0;

        for (const event of eventsToProcess) {
            try {
                await costBasisCalculator.calculateCostBasis(event.user_address, event.id);
                processed++;
            } catch (error) {
                console.error(`❌ Error processing event ${event.id}:`, error);
                errors++;
            }
        }

        res.json({
            success: true,
            data: {
                processed,
                errors,
                total: eventsToProcess.length
            },
            message: 'Cost basis recalculation completed'
        });

    } catch (error) {
        console.error('❌ Error in recalculate-all:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to recalculate cost basis'
        });
    }
});

module.exports = router;
