const request = require('supertest');
const app = require('../../../src/index');
const AnalyticsService = require('../../../src/services/AnalyticsService');

jest.mock('../../../src/services/AnalyticsService');

describe('Analytics Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/beneficiaries/:beneficiaryId/conversions', () => {
    it('should return conversion history', async () => {
      const mockData = {
        events: [
          {
            id: '1',
            beneficiaryId: 'beneficiary-123',
            sourceAmount: 100,
            destinationAmount: 95
          }
        ],
        stats: {
          totalConversions: 1,
          totalSourceAmount: 100,
          totalDestinationAmount: 95
        },
        pagination: {
          limit: 100,
          offset: 0,
          total: 1
        }
      };

      AnalyticsService.getBeneficiaryConversionHistory.mockResolvedValue(mockData);

      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/conversions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockData);
      expect(AnalyticsService.getBeneficiaryConversionHistory).toHaveBeenCalledWith('beneficiary-123', {
        startDate: undefined,
        endDate: undefined,
        assetCode: undefined,
        limit: 100,
        offset: 0
      });
    });

    it('should handle query parameters', async () => {
      const mockData = { events: [], stats: {}, pagination: { limit: 50, offset: 10, total: 0 } };
      AnalyticsService.getBeneficiaryConversionHistory.mockResolvedValue(mockData);

      await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/conversions?startDate=2023-01-01&endDate=2023-12-31&assetCode=XLM&limit=50&offset=10')
        .expect(200);

      expect(AnalyticsService.getBeneficiaryConversionHistory).toHaveBeenCalledWith('beneficiary-123', {
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        assetCode: 'XLM',
        limit: 50,
        offset: 10
      });
    });

    it('should handle service errors', async () => {
      AnalyticsService.getBeneficiaryConversionHistory.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/conversions')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve conversion history');
    });
  });

  describe('GET /api/analytics/beneficiaries/:beneficiaryId/stats', () => {
    it('should return conversion statistics', async () => {
      const mockStats = {
        XLM: {
          totalConversions: 5,
          totalSourceAmount: 500,
          totalDestinationAmount: 475,
          averageExchangeRate: 0.95
        }
      };

      AnalyticsService.getBeneficiaryConversionStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
      expect(AnalyticsService.getBeneficiaryConversionStats).toHaveBeenCalledWith('beneficiary-123', undefined);
    });

    it('should handle asset code parameter', async () => {
      const mockStats = {
        assetCode: 'XLM',
        totalConversions: 5,
        totalSourceAmount: 500,
        totalDestinationAmount: 475,
        averageExchangeRate: 0.95
      };

      AnalyticsService.getBeneficiaryConversionStats.mockResolvedValue(mockStats);

      await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/stats?assetCode=XLM')
        .expect(200);

      expect(AnalyticsService.getBeneficiaryConversionStats).toHaveBeenCalledWith('beneficiary-123', 'XLM');
    });
  });

  describe('GET /api/analytics/beneficiaries/:beneficiaryId/capital-gains/:taxYear', () => {
    it('should return capital gains report', async () => {
      const mockReport = {
        taxYear: 2023,
        beneficiaryId: 'beneficiary-123',
        period: {
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-12-31')
        },
        conversions: [],
        realizedGains: {
          shortTerm: 100,
          longTerm: 200,
          total: 300
        },
        unrealizedGains: {
          shortTerm: 0,
          longTerm: 0,
          total: 0
        },
        costBasisSummary: {}
      };

      AnalyticsService.getCapitalGainsReport.mockResolvedValue(mockReport);

      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/capital-gains/2023')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockReport);
      expect(AnalyticsService.getCapitalGainsReport).toHaveBeenCalledWith('beneficiary-123', 2023);
    });

    it('should validate tax year parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/capital-gains/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid tax year');
    });

    it('should handle non-numeric tax year', async () => {
      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/capital-gains/abc')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid tax year');
    });
  });

  describe('GET /api/analytics/beneficiaries/:beneficiaryId/portfolio', () => {
    it('should return portfolio overview', async () => {
      const mockOverview = {
        beneficiaryId: 'beneficiary-123',
        totalValue: 1000,
        totalCost: 950,
        totalUnrealizedGains: 50,
        totalRealizedGains: 100,
        totalRealizedLosses: 20,
        netRealizedGains: 80,
        assetBreakdown: {},
        conversionStats: {}
      };

      AnalyticsService.getPortfolioOverview.mockResolvedValue(mockOverview);

      const response = await request(app)
        .get('/api/analytics/beneficiaries/beneficiary-123/portfolio')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockOverview);
      expect(AnalyticsService.getPortfolioOverview).toHaveBeenCalledWith('beneficiary-123');
    });
  });

  describe('GET /api/analytics/exchange-rates/:baseAsset/:quoteAsset', () => {
    it('should return exchange rate history', async () => {
      const mockRateHistory = {
        baseAsset: { code: 'XLM', issuer: null },
        quoteAsset: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' },
        period: {
          startTime: new Date('2023-01-01'),
          endTime: new Date('2023-12-31')
        },
        rates: [],
        statistics: {
          count: 0,
          min: 0,
          max: 0,
          average: 0,
          volatility: 0
        }
      };

      AnalyticsService.getExchangeRateHistory.mockResolvedValue(mockRateHistory);

      const response = await request(app)
        .get('/api/analytics/exchange-rates/XLM/USDC?startTime=2023-01-01T00:00:00Z&endTime=2023-12-31T23:59:59Z')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockRateHistory);
    });

    it('should require time range parameters', async () => {
      const response = await request(app)
        .get('/api/analytics/exchange-rates/XLM/USDC')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing time range');
    });

    it('should handle asset with issuer', async () => {
      const mockRateHistory = { rates: [], statistics: {} };
      AnalyticsService.getExchangeRateHistory.mockResolvedValue(mockRateHistory);

      await request(app)
        .get('/api/analytics/exchange-rates/XLM:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K/USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K?startTime=2023-01-01T00:00:00Z&endTime=2023-12-31T23:59:59Z')
        .expect(200);

      expect(AnalyticsService.getExchangeRateHistory).toHaveBeenCalledWith(
        { code: 'XLM', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' },
        { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K' },
        new Date('2023-01-01T00:00:00Z'),
        new Date('2023-12-31T23:59:59Z')
      );
    });
  });

  describe('GET /api/analytics/conversions/:transactionHash', () => {
    it('should return specific conversion event', async () => {
      const mockConversion = {
        id: '1',
        transactionHash: 'tx-hash-123',
        beneficiaryId: 'beneficiary-123',
        sourceAmount: 100,
        destinationAmount: 95
      };

      // Mock the ConversionEvent model directly
      const ConversionEvent = require('../../../src/models/ConversionEvent');
      ConversionEvent.findByTransactionHash = jest.fn().mockResolvedValue(mockConversion);

      const response = await request(app)
        .get('/api/analytics/conversions/tx-hash-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockConversion);
    });

    it('should return 404 for non-existent conversion', async () => {
      const ConversionEvent = require('../../../src/models/ConversionEvent');
      ConversionEvent.findByTransactionHash = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .get('/api/analytics/conversions/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Conversion event not found');
    });
  });
});
