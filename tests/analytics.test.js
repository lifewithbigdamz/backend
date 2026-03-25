const request = require('supertest');
const app = require('../index');
const { Pool } = require('pg');

// Test database configuration
const testDb = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: process.env.TEST_DB_PORT || 5432,
    database: process.env.TEST_DB_NAME || 'vesting_vault_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'password'
});

describe('Path Payment Analytics API', () => {
    let testUserAddress;
    let testConversionEventId;

    beforeAll(async () => {
        // Set up test database
        await setupTestDatabase();
        
        // Create test user
        testUserAddress = 'GTESTUSER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        await testDb.query('INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING', [testUserAddress]);
    });

    afterAll(async () => {
        // Clean up test database
        await cleanupTestDatabase();
        await testDb.end();
    });

    beforeEach(async () => {
        // Clean up test data before each test
        await testDb.query('DELETE FROM cost_basis WHERE user_address = $1', [testUserAddress]);
        await testDb.query('DELETE FROM conversion_events WHERE user_address = $1', [testUserAddress]);
    });

    describe('GET /health', () => {
        it('should return health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
            expect(response.body.services).toHaveProperty('api');
            expect(response.body.services).toHaveProperty('stellar_listener');
        });
    });

    describe('GET /api/analytics/cost-basis/:userAddress', () => {
        it('should return cost basis summary for user', async () => {
            // Create test conversion event
            testConversionEventId = await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/cost-basis/${testUserAddress}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.message).toBe('Cost basis summary retrieved successfully');
        });

        it('should filter by tax year when provided', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/cost-basis/${testUserAddress}?taxYear=2023`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        it('should handle invalid user address gracefully', async () => {
            const response = await request(app)
                .get('/api/analytics/cost-basis/INVALID_ADDRESS')
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('GET /api/analytics/conversion-events/:userAddress', () => {
        it('should return conversion events for user', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/conversion-events/${testUserAddress}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.events).toBeInstanceOf(Array);
            expect(response.body.data.pagination).toBeDefined();
        });

        it('should paginate results correctly', async () => {
            // Create multiple test events
            for (let i = 0; i < 5; i++) {
                await createTestConversionEvent();
            }

            const response = await request(app)
                .get(`/api/analytics/conversion-events/${testUserAddress}?page=1&limit=2`)
                .expect(200);

            expect(response.body.data.events.length).toBeLessThanOrEqual(2);
            expect(response.body.data.pagination.page).toBe(1);
            expect(response.body.data.pagination.limit).toBe(2);
        });

        it('should filter by date range when provided', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/conversion-events/${testUserAddress}?startDate=2023-01-01&endDate=2023-12-31`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.events).toBeInstanceOf(Array);
        });
    });

    describe('POST /api/analytics/calculate-cost-basis', () => {
        it('should calculate cost basis for conversion event', async () => {
            testConversionEventId = await createTestConversionEvent();

            const response = await request(app)
                .post('/api/analytics/calculate-cost-basis')
                .send({
                    conversionEventId: testConversionEventId,
                    userAddress: testUserAddress
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('user_address', testUserAddress);
            expect(response.body.data).toHaveProperty('conversion_event_id', testConversionEventId);
            expect(response.body.data).toHaveProperty('acquisition_price');
            expect(response.body.data).toHaveProperty('disposal_price');
            expect(response.body.data).toHaveProperty('capital_gain_loss');
            expect(response.body.data).toHaveProperty('tax_year');
        });

        it('should return error for missing required fields', async () => {
            const response = await request(app)
                .post('/api/analytics/calculate-cost-basis')
                .send({
                    conversionEventId: testConversionEventId
                    // Missing userAddress
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should handle invalid conversion event ID', async () => {
            const response = await request(app)
                .post('/api/analytics/calculate-cost-basis')
                .send({
                    conversionEventId: 99999,
                    userAddress: testUserAddress
                })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('GET /api/analytics/tax-report/:userAddress/:taxYear', () => {
        it('should generate comprehensive tax report', async () => {
            testConversionEventId = await createTestConversionEvent();
            await request(app)
                .post('/api/analytics/calculate-cost-basis')
                .send({
                    conversionEventId: testConversionEventId,
                    userAddress: testUserAddress
                });

            const response = await request(app)
                .get(`/api/analytics/tax-report/${testUserAddress}/2023`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('tax_year', 2023);
            expect(response.body.data).toHaveProperty('user_address', testUserAddress);
            expect(response.body.data).toHaveProperty('summary');
            expect(response.body.data).toHaveProperty('short_term_gains');
            expect(response.body.data).toHaveProperty('long_term_gains');
            expect(response.body.data).toHaveProperty('all_events');
        });
    });

    describe('GET /api/analytics/portfolio/:userAddress', () => {
        it('should return portfolio analytics', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/portfolio/${testUserAddress}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('user_address', testUserAddress);
            expect(response.body.data).toHaveProperty('realized_gains_losses');
            expect(response.body.data).toHaveProperty('total_conversions');
            expect(response.body.data).toHaveProperty('conversion_events');
        });

        it('should include unrealized gains when requested', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/portfolio/${testUserAddress}?includeUnrealized=true`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('unrealized_gains_losses');
        });
    });

    describe('GET /api/analytics/dashboard/:userAddress', () => {
        it('should return dashboard summary', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/dashboard/${testUserAddress}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('user_address', testUserAddress);
            expect(response.body.data).toHaveProperty('metrics');
            expect(response.body.data).toHaveProperty('recent_activity');
            expect(response.body.data).toHaveProperty('yearly_summary');
        });

        it('should filter by period when specified', async () => {
            await createTestConversionEvent();

            const response = await request(app)
                .get(`/api/analytics/dashboard/${testUserAddress}?period=month`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.period).toBe('month');
        });
    });

    // Helper function to create test conversion event
    async function createTestConversionEvent() {
        const result = await testDb.query(`
            INSERT INTO conversion_events (
                user_address, vault_id, claim_transaction_hash, path_payment_hash,
                source_asset_code, source_asset_issuer, source_amount,
                dest_asset_code, dest_asset_issuer, dest_amount,
                exchange_rate, exchange_rate_timestamp,
                stellar_ledger, stellar_transaction_time
            ) VALUES (
                $1, 1, 'CLAIM_HASH_123', 'PATH_HASH_456',
                'XLM', null, 100.0,
                'USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV', 12.5,
                0.125, NOW(),
                123456, NOW()
            )
            RETURNING id
        `, [testUserAddress]);

        return result.rows[0].id;
    }

    // Helper function to set up test database
    async function setupTestDatabase() {
        try {
            // Create test database if it doesn't exist
            await testDb.query('CREATE DATABASE IF NOT EXISTS vesting_vault_test');
            
            // Use test database
            await testDb.query('USE vesting_vault_test');
            
            // Create tables
            const schema = require('fs').readFileSync('./schema.sql', 'utf8');
            await testDb.query(schema);
            
        } catch (error) {
            console.error('Test database setup error:', error);
        }
    }

    // Helper function to clean up test database
    async function cleanupTestDatabase() {
        try {
            await testDb.query('DROP TABLE IF EXISTS cost_basis');
            await testDb.query('DROP TABLE IF EXISTS conversion_events');
            await testDb.query('DROP TABLE IF EXISTS exchange_rate_history');
            await testDb.query('DROP TABLE IF EXISTS transactions');
            await testDb.query('DROP TABLE IF EXISTS vaults');
            await testDb.query('DROP TABLE IF EXISTS users');
            await testDb.query('DROP TABLE IF EXISTS heartbeat_log');
        } catch (error) {
            console.error('Test database cleanup error:', error);
        }
    }
});
