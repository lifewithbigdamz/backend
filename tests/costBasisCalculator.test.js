const CostBasisCalculator = require('../services/costBasisCalculator');
const { Pool } = require('pg');

// Mock pg Pool
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({
        query: jest.fn()
    }))
}));

// Mock moment
jest.mock('moment', () => {
    const mockMoment = jest.fn(() => ({
        year: jest.fn().mockReturnValue(2023),
        diff: jest.fn().mockReturnValue(365)
    }));
    mockMoment.diff = jest.fn().mockReturnValue(365);
    return mockMoment;
});

describe('CostBasisCalculator', () => {
    let calculator;
    let mockDb;

    beforeEach(() => {
        mockDb = new Pool();
        calculator = new CostBasisCalculator({
            database: mockDb
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('calculateCostBasis', () => {
        it('should calculate cost basis successfully', async () => {
            const mockConversionEvent = {
                id: 1,
                user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                source_asset_code: 'XLM',
                source_asset_issuer: null,
                source_amount: '100',
                exchange_rate: 0.125,
                exchange_rate_timestamp: '2023-01-01T00:00:00Z'
            };

            const mockAcquisitionPrice = 0.1;
            const mockCostBasisId = 1;

            mockDb.query
                .mockResolvedValueOnce({ rows: [mockConversionEvent] }) // getConversionEvent
                .mockResolvedValueOnce({ rows: [{ avg_acquisition_rate: 0.8, first_acquisition_date: '2022-01-01' }] }) // getAcquisitionPrice
                .mockResolvedValueOnce({ rows: [{ exchange_rate: 0.1 }] }) // getHistoricalUSDPrice
                .mockResolvedValueOnce({ rows: [{ acquisition_date: '2022-01-01' }] }) // calculateHoldingPeriod
                .mockResolvedValueOnce({ rows: [{ id: mockCostBasisId }] }); // saveCostBasis

            const result = await calculator.calculateCostBasis('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1);

            expect(result).toMatchObject({
                user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                conversion_event_id: 1,
                acquisition_price: expect.any(Number),
                disposal_price: 0.125,
                quantity: 100,
                cost_basis_amount: expect.any(Number),
                proceeds_amount: 12.5,
                capital_gain_loss: expect.any(Number),
                tax_year: 2023,
                holding_period_days: expect.any(Number)
            });
        });

        it('should throw error for non-existent conversion event', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await expect(calculator.calculateCostBasis('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 999))
                .rejects.toThrow('Conversion event not found');
        });
    });

    describe('getConversionEvent', () => {
        it('should return conversion event', async () => {
            const mockEvent = { id: 1, user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' };
            mockDb.query.mockResolvedValue({ rows: [mockEvent] });

            const result = await calculator.getConversionEvent(1);

            expect(result).toEqual(mockEvent);
            expect(mockDb.query).toHaveBeenCalledWith(
                'SELECT * FROM conversion_events WHERE id = $1',
                [1]
            );
        });

        it('should return null for non-existent event', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const result = await calculator.getConversionEvent(999);

            expect(result).toBeNull();
        });
    });

    describe('getAcquisitionPrice', () => {
        it('should get acquisition price from vault data', async () => {
            mockDb.query
                .mockResolvedValueOnce({
                    rows: [{
                        avg_acquisition_rate: 0.8,
                        first_acquisition_date: '2022-01-01'
                    }]
                })
                .mockResolvedValueOnce({ rows: [{ exchange_rate: 0.1 }] }); // getHistoricalUSDPrice

            const result = await calculator.getAcquisitionPrice('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'XLM', null);

            expect(result).toBe(0.08); // 0.8 * 0.1
        });

        it('should fallback to exchange rate history', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [] }) // No vault data
                .mockResolvedValueOnce({ rows: [{ exchange_rate: 0.1 }] }); // Exchange rate history

            const result = await calculator.getAcquisitionPrice('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'XLM', null);

            expect(result).toBe(0.1);
        });

        it('should fallback to current price', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [] }) // No vault data
                .mockResolvedValueOnce({ rows: [] }); // No exchange rate history

            // Mock getCurrentUSDPrice
            const getCurrentPriceSpy = jest.spyOn(calculator, 'getCurrentUSDPrice').mockResolvedValue(0.12);

            const result = await calculator.getAcquisitionPrice('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'XLM', null);

            expect(result).toBe(0.12);
            expect(getCurrentPriceSpy).toHaveBeenCalledWith('XLM');

            getCurrentPriceSpy.mockRestore();
        });

        it('should return 0 on complete failure', async () => {
            mockDb.query.mockRejectedValue(new Error('Database error'));

            const result = await calculator.getAcquisitionPrice('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'XLM', null);

            expect(result).toBe(0);
        });
    });

    describe('getCurrentUSDPrice', () => {
        it('should get price from database first', async () => {
            mockDb.query.mockResolvedValue({ rows: [{ exchange_rate: 0.12 }] });

            const result = await calculator.getCurrentUSDPrice('XLM');

            expect(result).toBe(0.12);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT exchange_rate FROM exchange_rate_history'),
                ['XLM']
            );
        });

        it('should use fallback prices for known assets', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const result = await calculator.getCurrentUSDPrice('XLM');

            expect(result).toBe(0.12); // Fallback price for XLM
        });

        it('should return 1.0 for unknown assets', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const result = await calculator.getCurrentUSDPrice('UNKNOWN');

            expect(result).toBe(1.0);
        });
    });

    describe('calculateHoldingPeriod', () => {
        it('should calculate holding period correctly', async () => {
            mockDb.query.mockResolvedValue({
                rows: [{ acquisition_date: '2022-01-01T00:00:00Z' }]
            });

            const result = await calculator.calculateHoldingPeriod(
                'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                'XLM',
                '2023-01-01T00:00:00Z'
            );

            expect(result).toBe(365);
        });

        it('should return 0 if no acquisition date found', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const result = await calculator.calculateHoldingPeriod(
                'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                'XLM',
                '2023-01-01T00:00:00Z'
            );

            expect(result).toBe(0);
        });
    });

    describe('saveCostBasis', () => {
        it('should save cost basis data', async () => {
            const costBasisData = {
                user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                conversion_event_id: 1,
                acquisition_price: 0.08,
                disposal_price: 0.125,
                quantity: 100,
                cost_basis_amount: 8,
                proceeds_amount: 12.5,
                capital_gain_loss: 4.5,
                tax_year: 2023,
                holding_period_days: 365
            };

            mockDb.query.mockResolvedValue({ rows: [{ id: 1 }] });

            const result = await calculator.saveCostBasis(costBasisData);

            expect(result).toBe(1);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO cost_basis'),
                expect.arrayContaining([
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
                ])
            );
        });

        it('should handle save errors', async () => {
            mockDb.query.mockRejectedValue(new Error('Save failed'));

            await expect(calculator.saveCostBasis({})).rejects.toThrow('Save failed');
        });
    });

    describe('getUserCostBasisSummary', () => {
        it('should get user cost basis summary', async () => {
            const mockSummary = [{
                total_conversions: 5,
                total_quantity_converted: 500,
                total_cost_basis: 40,
                total_proceeds: 60,
                total_capital_gain_loss: 20,
                avg_gain_loss_per_conversion: 4,
                tax_year: 2023
            }];

            mockDb.query.mockResolvedValue({ rows: mockSummary });

            const result = await calculator.getUserCostBasisSummary('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');

            expect(result).toEqual(mockSummary);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*) as total_conversions'),
                ['GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ']
            );
        });

        it('should filter by tax year when provided', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await calculator.getUserCostBasisSummary('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 2023);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('AND tax_year = $2'),
                ['GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 2023]
            );
        });
    });

    describe('getConversionEventsForUser', () => {
        it('should get conversion events for user', async () => {
            const mockEvents = [{
                id: 1,
                user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                source_amount: 100,
                dest_amount: 12.5
            }];

            mockDb.query.mockResolvedValue({ rows: mockEvents });

            const result = await calculator.getConversionEventsForUser('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');

            expect(result).toEqual(mockEvents);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT ce.*, cb.capital_gain_loss'),
                ['GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ']
            );
        });

        it('should filter by date range when provided', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await calculator.getConversionEventsForUser(
                'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                '2023-01-01',
                '2023-12-31'
            );

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('AND ce.exchange_rate_timestamp >= $2'),
                expect.arrayContaining([
                    'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                    '2023-01-01',
                    '2023-12-31'
                ])
            );
        });
    });

    describe('calculateTaxReport', () => {
        it('should generate comprehensive tax report', async () => {
            const mockSummary = [{
                total_conversions: 5,
                total_capital_gain_loss: 20
            }];

            const mockEvents = [
                { id: 1, capital_gain_loss: 10, holding_period_days: 300 },
                { id: 2, capital_gain_loss: 10, holding_period_days: 400 }
            ];

            mockDb.query
                .mockResolvedValueOnce({ rows: mockSummary }) // getUserCostBasisSummary
                .mockResolvedValueOnce({ rows: mockEvents }); // getConversionEventsForUser

            const result = await calculator.calculateTaxReport('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 2023);

            expect(result).toMatchObject({
                tax_year: 2023,
                user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                summary: mockSummary[0],
                short_term_gains: {
                    count: 1,
                    total_gain_loss: 10,
                    events: expect.arrayContaining([expect.objectContaining({ holding_period_days: 300 })])
                },
                long_term_gains: {
                    count: 1,
                    total_gain_loss: 10,
                    events: expect.arrayContaining([expect.objectContaining({ holding_period_days: 400 })])
                },
                all_events: mockEvents
            });
        });
    });
});
