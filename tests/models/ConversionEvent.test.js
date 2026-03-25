const ConversionEvent = require('../../../src/models/ConversionEvent');
const db = require('../../../src/database/connection');

jest.mock('../../../src/database/connection');

describe('ConversionEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a conversion event', async () => {
      const eventData = {
        beneficiaryId: 'beneficiary-123',
        transactionHash: 'tx-hash-123',
        stellarAccount: 'GD123...',
        sourceAssetCode: 'XLM',
        sourceAssetIssuer: null,
        sourceAmount: 100,
        destinationAssetCode: 'USDC',
        destinationAssetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K',
        destinationAmount: 95,
        exchangeRate: 0.95,
        exchangeRateTimestamp: '2023-01-01T00:00:00Z',
        exchangeRateSource: 'stellar_dex',
        pathPaymentDetails: { type: 'path_payment_strict_send' },
        memo: 'test-memo',
        memoType: 'text'
      };

      const mockDbResponse = {
        id: 'event-123',
        beneficiary_id: eventData.beneficiaryId,
        transaction_hash: eventData.transactionHash,
        stellar_account: eventData.stellarAccount,
        source_asset_code: eventData.sourceAssetCode,
        source_asset_issuer: eventData.sourceAssetIssuer,
        source_amount: eventData.sourceAmount,
        destination_asset_code: eventData.destinationAssetCode,
        destination_asset_issuer: eventData.destinationAssetIssuer,
        destination_amount: eventData.destinationAmount,
        exchange_rate: eventData.exchangeRate,
        exchange_rate_timestamp: eventData.exchangeRateTimestamp,
        exchange_rate_source: eventData.exchangeRateSource,
        path_payment_details: JSON.stringify(eventData.pathPaymentDetails),
        memo: eventData.memo,
        memo_type: eventData.memoType,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      db.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockDbResponse])
      });

      const result = await ConversionEvent.create(eventData);

      expect(result).toEqual({
        id: 'event-123',
        beneficiaryId: eventData.beneficiaryId,
        transactionHash: eventData.transactionHash,
        stellarAccount: eventData.stellarAccount,
        sourceAsset: {
          code: eventData.sourceAssetCode,
          issuer: eventData.sourceAssetIssuer
        },
        destinationAsset: {
          code: eventData.destinationAssetCode,
          issuer: eventData.destinationAssetIssuer
        },
        sourceAmount: eventData.sourceAmount,
        destinationAmount: eventData.destinationAmount,
        exchangeRate: eventData.exchangeRate,
        exchangeRateTimestamp: eventData.exchangeRateTimestamp,
        exchangeRateSource: eventData.exchangeRateSource,
        pathPaymentDetails: eventData.pathPaymentDetails,
        memo: eventData.memo,
        memoType: eventData.memoType,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z'
      });
    });
  });

  describe('findByBeneficiary', () => {
    it('should find events by beneficiary', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          beneficiary_id: 'beneficiary-123',
          transaction_hash: 'tx-1',
          stellar_account: 'GD123...',
          source_asset_code: 'XLM',
          source_asset_issuer: null,
          source_amount: '100',
          destination_asset_code: 'USDC',
          destination_asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K',
          destination_amount: '95',
          exchange_rate: '0.95',
          exchange_rate_timestamp: '2023-01-01T00:00:00Z',
          exchange_rate_source: 'stellar_dex',
          path_payment_details: '{}',
          memo: null,
          memo_type: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockEvents)
      };

      db.mockReturnValue(mockQueryBuilder);

      const result = await ConversionEvent.findByBeneficiary('beneficiary-123', {
        limit: 10,
        offset: 0
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('beneficiary_id', 'beneficiary-123');
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result).toHaveLength(1);
      expect(result[0].beneficiaryId).toBe('beneficiary-123');
      expect(result[0].sourceAmount).toBe(100);
    });

    it('should apply filters when provided', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([])
      };

      db.mockReturnValue(mockQueryBuilder);

      const options = {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        assetCode: 'XLM',
        limit: 50,
        offset: 10
      };

      await ConversionEvent.findByBeneficiary('beneficiary-123', options);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('beneficiary_id', 'beneficiary-123');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('created_at', '>=', new Date('2023-01-01'));
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('created_at', '<=', new Date('2023-12-31'));
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('source_asset_code', 'XLM');
    });
  });

  describe('findByTransactionHash', () => {
    it('should find event by transaction hash', async () => {
      const mockEvent = {
        id: 'event-123',
        beneficiary_id: 'beneficiary-123',
        transaction_hash: 'tx-hash-123',
        stellar_account: 'GD123...',
        source_asset_code: 'XLM',
        source_asset_issuer: null,
        source_amount: '100',
        destination_asset_code: 'USDC',
        destination_asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K',
        destination_amount: '95',
        exchange_rate: '0.95',
        exchange_rate_timestamp: '2023-01-01T00:00:00Z',
        exchange_rate_source: 'stellar_dex',
        path_payment_details: '{}',
        memo: null,
        memo_type: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEvent)
      };

      db.mockReturnValue(mockQueryBuilder);

      const result = await ConversionEvent.findByTransactionHash('tx-hash-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('transaction_hash', 'tx-hash-123');
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result.beneficiaryId).toBe('beneficiary-123');
      expect(result.transactionHash).toBe('tx-hash-123');
    });

    it('should return null when event not found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };

      db.mockReturnValue(mockQueryBuilder);

      const result = await ConversionEvent.findByTransactionHash('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getConversionStats', () => {
    it('should get conversion statistics', async () => {
      const mockStats = {
        total_conversions: 5,
        total_source_amount: '500',
        total_destination_amount: '475',
        average_exchange_rate: '0.95',
        first_conversion: '2023-01-01T00:00:00Z',
        last_conversion: '2023-12-31T23:59:59Z'
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockStats)
      };

      db.mockReturnValue(mockQueryBuilder);

      const result = await ConversionEvent.getConversionStats('beneficiary-123', 'XLM');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('beneficiary_id', 'beneficiary-123');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('source_asset_code', 'XLM');
      expect(result.totalConversions).toBe(5);
      expect(result.totalSourceAmount).toBe(500);
      expect(result.totalDestinationAmount).toBe(475);
      expect(result.averageExchangeRate).toBe(0.95);
    });
  });

  describe('formatEvent', () => {
    it('should format event correctly', () => {
      const event = {
        id: 'event-123',
        beneficiary_id: 'beneficiary-123',
        transaction_hash: 'tx-hash-123',
        stellar_account: 'GD123...',
        source_asset_code: 'XLM',
        source_asset_issuer: null,
        source_amount: '100',
        destination_asset_code: 'USDC',
        destination_asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K',
        destination_amount: '95',
        exchange_rate: '0.95',
        exchange_rate_timestamp: '2023-01-01T00:00:00Z',
        exchange_rate_source: 'stellar_dex',
        path_payment_details: '{"type":"path_payment_strict_send"}',
        memo: 'test-memo',
        memo_type: 'text',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      const result = ConversionEvent.formatEvent(event);

      expect(result.id).toBe('event-123');
      expect(result.beneficiaryId).toBe('beneficiary-123');
      expect(result.sourceAsset).toEqual({ code: 'XLM', issuer: null });
      expect(result.destinationAsset).toEqual({ 
        code: 'USDC', 
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' 
      });
      expect(result.sourceAmount).toBe(100);
      expect(result.destinationAmount).toBe(95);
      expect(result.pathPaymentDetails).toEqual({ type: 'path_payment_strict_send' });
    });
  });
});
