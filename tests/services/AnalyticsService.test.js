const AnalyticsService = require('../../../src/services/AnalyticsService');
const ConversionEvent = require('../../../src/models/ConversionEvent');
const CostBasis = require('../../../src/models/CostBasis');
const ExchangeRate = require('../../../src/models/ExchangeRate');

jest.mock('../../../src/models/ConversionEvent');
jest.mock('../../../src/models/CostBasis');
jest.mock('../../../src/models/ExchangeRate');

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBeneficiaryConversionHistory', () => {
    it('should return conversion history with stats', async () => {
      const mockEvents = [
        {
          id: '1',
          beneficiaryId: 'beneficiary-123',
          sourceAmount: 100,
          destinationAmount: 95,
          sourceAsset: { code: 'XLM', issuer: null },
          destinationAsset: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' },
          createdAt: '2023-01-01T00:00:00Z'
        }
      ];

      const mockStats = {
        totalConversions: 1,
        totalSourceAmount: 100,
        totalDestinationAmount: 95,
        averageExchangeRate: 0.95
      };

      ConversionEvent.findByBeneficiary.mockResolvedValue(mockEvents);
      AnalyticsService.getBeneficiaryConversionStats = jest.fn().mockResolvedValue(mockStats);

      const result = await AnalyticsService.getBeneficiaryConversionHistory('beneficiary-123');

      expect(ConversionEvent.findByBeneficiary).toHaveBeenCalledWith('beneficiary-123', {
        startDate: undefined,
        endDate: undefined,
        assetCode: undefined,
        limit: 100,
        offset: 0
      });

      expect(result).toEqual({
        events: mockEvents,
        stats: mockStats,
        pagination: {
          limit: 100,
          offset: 0,
          total: 1
        }
      });
    });

    it('should handle options correctly', async () => {
      const options = {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        assetCode: 'XLM',
        limit: 50,
        offset: 10
      };

      ConversionEvent.findByBeneficiary.mockResolvedValue([]);
      AnalyticsService.getBeneficiaryConversionStats = jest.fn().mockResolvedValue({});

      await AnalyticsService.getBeneficiaryConversionHistory('beneficiary-123', options);

      expect(ConversionEvent.findByBeneficiary).toHaveBeenCalledWith('beneficiary-123', {
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        assetCode: 'XLM',
        limit: 50,
        offset: 10
      });
    });
  });

  describe('getCapitalGainsReport', () => {
    it('should generate capital gains report for tax year', async () => {
      const mockConversions = [
        {
          id: '1',
          beneficiaryId: 'beneficiary-123',
          sourceAmount: 100,
          destinationAmount: 95,
          sourceAsset: { code: 'XLM', issuer: null },
          destinationAsset: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' },
          createdAt: '2023-06-01T00:00:00Z'
        }
      ];

      const mockCostBasis = {
        averageCostBasis: 0.9
      };

      ConversionEvent.findByBeneficiary.mockResolvedValue(mockConversions);
      CostBasis.findByBeneficiary.mockResolvedValue([mockCostBasis]);
      CostBasis.findByBeneficiaryAndAsset.mockResolvedValue(mockCostBasis);
      CostBasis.calculateCapitalGains.mockResolvedValue({
        totalRealizedGains: 5,
        totalRealizedLosses: 0,
        netGains: 5
      });

      const result = await AnalyticsService.getCapitalGainsReport('beneficiary-123', 2023);

      expect(ConversionEvent.findByBeneficiary).toHaveBeenCalledWith('beneficiary-123', {
        startDate: new Date('2023, 0, 1'),
        endDate: new Date('2023, 11, 31, 23, 59, 59')
      });

      expect(result).toHaveProperty('taxYear', 2023);
      expect(result).toHaveProperty('beneficiaryId', 'beneficiary-123');
      expect(result).toHaveProperty('conversions');
      expect(result).toHaveProperty('realizedGains');
      expect(result).toHaveProperty('costBasisSummary');
    });
  });

  describe('calculateGainLoss', () => {
    it('should calculate gain correctly', () => {
      const conversion = {
        sourceAmount: 100,
        destinationAmount: 110
      };

      const costBasis = {
        averageCostBasis: 0.9
      };

      const result = AnalyticsService.calculateGainLoss(conversion, costBasis);

      expect(result.amount).toBe(20); // 110 - (100 * 0.9)
      expect(result.type).toBe('gain');
    });

    it('should calculate loss correctly', () => {
      const conversion = {
        sourceAmount: 100,
        destinationAmount: 80
      };

      const costBasis = {
        averageCostBasis: 0.9
      };

      const result = AnalyticsService.calculateGainLoss(conversion, costBasis);

      expect(result.amount).toBe(-10); // 80 - (100 * 0.9)
      expect(result.type).toBe('loss');
    });

    it('should handle missing cost basis', () => {
      const conversion = {
        sourceAmount: 100,
        destinationAmount: 110
      };

      const result = AnalyticsService.calculateGainLoss(conversion, null);

      expect(result.amount).toBe(0);
      expect(result.type).toBe('neutral');
    });
  });

  describe('getPortfolioOverview', () => {
    it('should generate portfolio overview', async () => {
      const mockCostBasisRecords = [
        {
          asset: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' },
          currentHoldings: 1000,
          averageCostBasis: 1.0,
          totalCostUsd: 1000,
          realizedGains: 50,
          realizedLosses: 10
        }
      ];

      CostBasis.findByBeneficiary.mockResolvedValue(mockCostBasisRecords);
      AnalyticsService.getBeneficiaryConversionStats = jest.fn().mockResolvedValue({});

      const result = await AnalyticsService.getPortfolioOverview('beneficiary-123');

      expect(result).toHaveProperty('beneficiaryId', 'beneficiary-123');
      expect(result).toHaveProperty('totalValue', 1000);
      expect(result).toHaveProperty('totalCost', 1000);
      expect(result).toHaveProperty('totalUnrealizedGains', 0);
      expect(result).toHaveProperty('totalRealizedGains', 50);
      expect(result).toHaveProperty('totalRealizedLosses', 10);
      expect(result).toHaveProperty('netRealizedGains', 40);
      expect(result).toHaveProperty('assetBreakdown');
    });
  });

  describe('calculateRateStatistics', () => {
    it('should calculate rate statistics correctly', () => {
      const rates = [
        { rate: 1.0 },
        { rate: 1.1 },
        { rate: 0.9 },
        { rate: 1.2 },
        { rate: 0.8 }
      ];

      const stats = AnalyticsService.calculateRateStatistics(rates);

      expect(stats.count).toBe(5);
      expect(stats.min).toBe(0.8);
      expect(stats.max).toBe(1.2);
      expect(stats.average).toBe(1.0);
      expect(stats.volatility).toBeGreaterThan(0);
    });

    it('should handle empty rates array', () => {
      const stats = AnalyticsService.calculateRateStatistics([]);

      expect(stats.count).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.volatility).toBe(0);
    });
  });
});
