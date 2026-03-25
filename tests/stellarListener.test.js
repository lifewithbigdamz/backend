const StellarPathPaymentListener = require('../services/stellarPathPaymentListener');
const { Pool } = require('pg');

// Mock Stellar SDK
jest.mock('stellar-sdk', () => ({
    Server: jest.fn().mockImplementation(() => ({
        transactions: jest.fn().mockReturnThis(),
        forAccount: jest.fn().mockReturnThis(),
        cursor: jest.fn().mockReturnThis(),
        stream: jest.fn().mockReturnValue({
            onmessage: jest.fn(),
            onerror: jest.fn()
        })
    })),
    Networks: {
        PUBLIC: 'PUBLIC',
        TESTNET: 'TESTNET'
    },
    Asset: jest.fn().mockImplementation((code, issuer) => ({
        code,
        issuer
    }))
}));

// Mock pg Pool
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockResolvedValue({ rows: [] }),
        end: jest.fn().mockResolvedValue()
    }))
}));

describe('StellarPathPaymentListener', () => {
    let listener;
    let mockDb;

    beforeEach(() => {
        mockDb = new Pool();
        listener = new StellarPathPaymentListener({
            stellarHorizonUrl: 'https://horizon-testnet.stellar.org',
            network: 'testnet',
            database: mockDb,
            vestingVaultAddress: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            maxRetries: 3,
            retryDelay: 1000
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize successfully', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await expect(listener.initialize()).resolves.toBe(true);
            expect(mockDb.connect).toHaveBeenCalled();
        });

        it('should handle initialization errors', async () => {
            mockDb.connect.mockRejectedValue(new Error('Database connection failed'));

            await expect(listener.initialize()).rejects.toThrow('Database connection failed');
        });
    });

    describe('extractPathPayments', () => {
        it('should extract path payments from transaction', () => {
            const mockTransaction = {
                hash: 'test_hash',
                ledger: 123456,
                created_at: '2023-01-01T00:00:00Z',
                operations: [
                    {
                        type: 'payment',
                        id: '1'
                    },
                    {
                        type: 'path_payment',
                        id: '2',
                        source_asset: { code: 'XLM', issuer: null },
                        destination_asset: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV' },
                        source_amount: '100',
                        destination_amount: '12.5'
                    }
                ]
            };

            const pathPayments = listener.extractPathPayments(mockTransaction);

            expect(pathPayments).toHaveLength(1);
            expect(pathPayments[0].type).toBe('path_payment');
            expect(pathPayments[0].transaction_hash).toBe('test_hash');
        });

        it('should return empty array for transactions without path payments', () => {
            const mockTransaction = {
                operations: [
                    { type: 'payment' },
                    { type: 'create_account' }
                ]
            };

            const pathPayments = listener.extractPathPayments(mockTransaction);

            expect(pathPayments).toHaveLength(0);
        });

        it('should handle transactions without operations', () => {
            const mockTransaction = {};

            const pathPayments = listener.extractPathPayments(mockTransaction);

            expect(pathPayments).toHaveLength(0);
        });
    });

    describe('isVestingToUSDCConversion', () => {
        it('should identify valid vesting to USDC conversion', () => {
            const pathPayment = {
                destination_asset: {
                    code: 'USDC',
                    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV'
                },
                source_asset: {
                    code: 'XLM',
                    issuer: null
                }
            };

            expect(listener.isVestingToUSDCConversion(pathPayment)).toBe(true);
        });

        it('should reject USDC to USDC conversion', () => {
            const pathPayment = {
                destination_asset: {
                    code: 'USDC',
                    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV'
                },
                source_asset: {
                    code: 'USDC',
                    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV'
                }
            };

            expect(listener.isVestingToUSDCConversion(pathPayment)).toBe(false);
        });

        it('should reject non-USDC destination', () => {
            const pathPayment = {
                destination_asset: {
                    code: 'ETH',
                    issuer: null
                },
                source_asset: {
                    code: 'XLM',
                    issuer: null
                }
            };

            expect(listener.isVestingToUSDCConversion(pathPayment)).toBe(false);
        });
    });

    describe('calculateExchangeRate', () => {
        it('should calculate correct exchange rate', () => {
            const pathPayment = {
                source_amount: '100',
                destination_amount: '12.5'
            };

            const rate = listener.calculateExchangeRate(pathPayment);
            expect(rate).toBe(0.125);
        });

        it('should handle zero source amount', () => {
            const pathPayment = {
                source_amount: '0',
                destination_amount: '12.5'
            };

            expect(() => listener.calculateExchangeRate(pathPayment)).toThrow('Source amount cannot be zero');
        });
    });

    describe('getUserInfo', () => {
        it('should return existing user info', async () => {
            const mockUser = { id: 1, address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' };
            mockDb.query.mockResolvedValue({ rows: [mockUser] });

            const result = await listener.getUserInfo('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');

            expect(result).toEqual(mockUser);
            expect(mockDb.query).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE address = $1',
                ['GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ']
            );
        });

        it('should create new user if not exists', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [] }) // User not found
                .mockResolvedValueOnce({ rows: [] }); // Insert successful

            const result = await listener.getUserInfo('GNEWUSER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');

            expect(result.address).toBe('GNEWUSER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
            expect(mockDb.query).toHaveBeenCalledTimes(2);
        });

        it('should handle database errors', async () => {
            mockDb.query.mockRejectedValue(new Error('Database error'));

            await expect(listener.getUserInfo('GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')).rejects.toThrow('Database error');
        });
    });

    describe('recordConversionEvent', () => {
        it('should record conversion event successfully', async () => {
            const eventData = {
                user_address: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                vault_id: 1,
                claim_transaction_hash: 'CLAIM123',
                path_payment_hash: 'PATH123',
                source_asset_code: 'XLM',
                source_asset_issuer: null,
                source_amount: 100,
                dest_asset_code: 'USDC',
                dest_asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV',
                dest_amount: 12.5,
                exchange_rate: 0.125,
                exchange_rate_timestamp: new Date(),
                path_assets: '[]',
                path_issuers: '[]',
                stellar_ledger: 123456,
                stellar_transaction_time: '2023-01-01T00:00:00Z'
            };

            mockDb.query.mockResolvedValue({ rows: [{ id: 1 }] });

            const result = await listener.recordConversionEvent(eventData);

            expect(result).toBe(1);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO conversion_events'),
                expect.arrayContaining([
                    eventData.user_address,
                    eventData.vault_id,
                    eventData.claim_transaction_hash,
                    eventData.path_payment_hash,
                    eventData.source_asset_code,
                    eventData.source_asset_issuer,
                    eventData.source_amount,
                    eventData.dest_asset_code,
                    eventData.dest_asset_issuer,
                    eventData.dest_amount,
                    eventData.exchange_rate,
                    eventData.exchange_rate_timestamp,
                    eventData.path_assets,
                    eventData.path_issuers,
                    eventData.stellar_ledger,
                    eventData.stellar_transaction_time
                ])
            );
        });

        it('should handle recording errors', async () => {
            mockDb.query.mockRejectedValue(new Error('Insert failed'));

            await expect(listener.recordConversionEvent({})).rejects.toThrow('Insert failed');
        });
    });

    describe('updateCursor', () => {
        it('should update cursor successfully', async () => {
            mockDb.query.mockResolvedValue({});

            await listener.updateCursor('CURSOR123');

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO stellar_cursor'),
                ['path_payment_listener', 'CURSOR123']
            );
        });

        it('should handle cursor update errors gracefully', async () => {
            mockDb.query.mockRejectedValue(new Error('Cursor update failed'));

            // Should not throw error, just log it
            await expect(listener.updateCursor('CURSOR123')).resolves.toBeUndefined();
        });
    });

    describe('error handling', () => {
        it('should retry on stream errors', async () => {
            const mockStream = {
                onmessage: jest.fn(),
                onerror: jest.fn()
            };

            // Mock the server to return a stream that errors
            listener.server.transactions.mockReturnValue({
                forAccount: jest.fn().mockReturnValue({
                    cursor: jest.fn().mockReturnValue({
                        stream: jest.fn().mockImplementation((callbacks) => {
                            setTimeout(() => callbacks.onerror(new Error('Stream error')), 100);
                            return mockStream;
                        })
                    })
                })
            });

            // Start listening
            const startSpy = jest.spyOn(listener, 'startListening');
            
            // Mock setTimeout to avoid delays in tests
            jest.useFakeTimers();

            await listener.startListening();

            // Fast-forward time to trigger retry
            jest.advanceTimersByTime(1000);

            expect(startSpy).toHaveBeenCalled();

            jest.useRealTimers();
        });

        it('should stop after max retries', async () => {
            listener.retryCount = listener.maxRetries - 1;

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await listener.handleError(new Error('Persistent error'));

            expect(listener.isListening).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith('❌ Max retries reached. Stopping listener.');

            consoleSpy.mockRestore();
        });
    });
});
