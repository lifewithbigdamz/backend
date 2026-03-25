const ConversionEvent = require('../models/ConversionEvent');
const CostBasis = require('../models/CostBasis');
const ExchangeRate = require('../models/ExchangeRate');
const Decimal = require('decimal.js');

class AnalyticsService {
  static async getBeneficiaryConversionHistory(beneficiaryId, options = {}) {
    const {
      startDate,
      endDate,
      assetCode,
      limit = 100,
      offset = 0
    } = options;

    const events = await ConversionEvent.findByBeneficiary(beneficiaryId, {
      startDate,
      endDate,
      assetCode,
      limit,
      offset
    });

    const stats = await this.getBeneficiaryConversionStats(beneficiaryId, assetCode);

    return {
      events,
      stats,
      pagination: {
        limit,
        offset,
        total: events.length
      }
    };
  }

  static async getBeneficiaryConversionStats(beneficiaryId, assetCode = null) {
    if (assetCode) {
      const stats = await ConversionEvent.getConversionStats(beneficiaryId, assetCode);
      return this.formatAssetStats(stats, assetCode);
    } else {
      // Get stats for all assets
      const events = await ConversionEvent.findByBeneficiary(beneficiaryId);
      const assetStats = {};
      
      for (const event of events) {
        const code = event.sourceAsset.code;
        if (!assetStats[code]) {
          assetStats[code] = {
            totalConversions: 0,
            totalSourceAmount: new Decimal(0),
            totalDestinationAmount: new Decimal(0),
            averageExchangeRate: new Decimal(0),
            firstConversion: event.createdAt,
            lastConversion: event.createdAt
          };
        }

        const stats = assetStats[code];
        stats.totalConversions++;
        stats.totalSourceAmount = stats.totalSourceAmount.plus(event.sourceAmount);
        stats.totalDestinationAmount = stats.totalDestinationAmount.plus(event.destinationAmount);
        stats.averageExchangeRate = stats.totalDestinationAmount.div(stats.totalSourceAmount);
        
        if (new Date(event.createdAt) < new Date(stats.firstConversion)) {
          stats.firstConversion = event.createdAt;
        }
        if (new Date(event.createdAt) > new Date(stats.lastConversion)) {
          stats.lastConversion = event.createdAt;
        }
      }

      // Convert to plain numbers
      const formattedStats = {};
      for (const [code, stats] of Object.entries(assetStats)) {
        formattedStats[code] = this.formatAssetStats({
          total_conversions: stats.totalConversions,
          total_source_amount: stats.totalSourceAmount.toString(),
          total_destination_amount: stats.totalDestinationAmount.toString(),
          average_exchange_rate: stats.averageExchangeRate.toString(),
          first_conversion: stats.firstConversion,
          last_conversion: stats.lastConversion
        }, code);
      }

      return formattedStats;
    }
  }

  static formatAssetStats(stats, assetCode) {
    return {
      assetCode,
      totalConversions: parseInt(stats.total_conversions) || 0,
      totalSourceAmount: parseFloat(stats.total_source_amount) || 0,
      totalDestinationAmount: parseFloat(stats.total_destination_amount) || 0,
      averageExchangeRate: parseFloat(stats.average_exchange_rate) || 0,
      firstConversion: stats.first_conversion,
      lastConversion: stats.last_conversion
    };
  }

  static async getCapitalGainsReport(beneficiaryId, taxYear) {
    const startDate = new Date(taxYear, 0, 1); // January 1st
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59); // December 31st

    // Get all conversion events for the tax year
    const conversions = await ConversionEvent.findByBeneficiary(beneficiaryId, {
      startDate,
      endDate
    });

    // Get current cost basis records
    const costBasisRecords = await CostBasis.findByBeneficiary(beneficiaryId);

    const report = {
      taxYear,
      beneficiaryId,
      period: {
        startDate,
        endDate
      },
      conversions: [],
      realizedGains: {
        shortTerm: 0,
        longTerm: 0,
        total: 0
      },
      unrealizedGains: {
        shortTerm: 0,
        longTerm: 0,
        total: 0
      },
      costBasisSummary: {}
    };

    // Process each conversion
    for (const conversion of conversions) {
      const holdingPeriod = this.calculateHoldingPeriod(conversion);
      const isLongTerm = holdingPeriod > 365; // More than 1 year

      const costBasis = await CostBasis.findByBeneficiaryAndAsset(
        beneficiaryId,
        conversion.sourceAsset.code,
        conversion.sourceAsset.issuer
      );

      const gainLoss = this.calculateGainLoss(conversion, costBasis);

      const conversionData = {
        ...conversion,
        holdingPeriod,
        holdingPeriodType: isLongTerm ? 'long_term' : 'short_term',
        gainLoss: gainLoss.amount,
        gainLossType: gainLoss.type,
        costBasisPerUnit: costBasis ? costBasis.averageCostBasis : 0
      };

      report.conversions.push(conversionData);

      // Add to realized gains/losses
      if (gainLoss.type === 'gain') {
        if (isLongTerm) {
          report.realizedGains.longTerm += gainLoss.amount;
        } else {
          report.realizedGains.shortTerm += gainLoss.amount;
        }
      } else {
        if (isLongTerm) {
          report.realizedGains.longTerm += gainLoss.amount; // negative number for loss
        } else {
          report.realizedGains.shortTerm += gainLoss.amount; // negative number for loss
        }
      }
    }

    report.realizedGains.total = report.realizedGains.shortTerm + report.realizedGains.longTerm;

    // Add cost basis summary
    for (const record of costBasisRecords) {
      const capitalGains = await CostBasis.calculateCapitalGains(
        beneficiaryId,
        record.asset.code,
        record.asset.issuer
      );

      report.costBasisSummary[record.asset.code] = {
        ...record,
        capitalGains
      };
    }

    return report;
  }

  static calculateHoldingPeriod(conversion) {
    // This is a simplified calculation
    // In a real implementation, you would track the acquisition date of each specific lot
    const acquisitionDate = new Date(conversion.createdAt);
    const dispositionDate = new Date(conversion.createdAt); // For path payments, acquisition and disposition happen in the same transaction
    return Math.floor((dispositionDate - acquisitionDate) / (1000 * 60 * 60 * 24));
  }

  static calculateGainLoss(conversion, costBasis) {
    if (!costBasis) {
      return { amount: 0, type: 'neutral' };
    }

    const proceeds = conversion.destinationAmount;
    const cost = new Decimal(conversion.sourceAmount)
      .times(costBasis.averageCostBasis)
      .toNumber();

    const gainLoss = proceeds - cost;

    return {
      amount: gainLoss,
      type: gainLoss >= 0 ? 'gain' : 'loss'
    };
  }

  static async getExchangeRateHistory(baseAsset, quoteAsset, startTime, endTime) {
    const rates = await ExchangeRate.getHistoricalRates(baseAsset, quoteAsset, startTime, endTime);
    
    return {
      baseAsset,
      quoteAsset,
      period: {
        startTime,
        endTime
      },
      rates,
      statistics: this.calculateRateStatistics(rates)
    };
  }

  static calculateRateStatistics(rates) {
    if (rates.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        average: 0,
        volatility: 0
      };
    }

    const rateValues = rates.map(rate => rate.rate);
    const min = Math.min(...rateValues);
    const max = Math.max(...rateValues);
    const average = rateValues.reduce((sum, rate) => sum + rate, 0) / rateValues.length;
    
    // Calculate volatility (standard deviation)
    const squaredDiffs = rateValues.map(rate => Math.pow(rate - average, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / rateValues.length;
    const volatility = Math.sqrt(variance);

    return {
      count: rates.length,
      min,
      max,
      average,
      volatility
    };
  }

  static async getPortfolioOverview(beneficiaryId) {
    const costBasisRecords = await CostBasis.findByBeneficiary(beneficiaryId);
    const conversionStats = await this.getBeneficiaryConversionStats(beneficiaryId);

    let totalValue = 0;
    let totalCost = 0;
    let totalRealizedGains = 0;
    let totalRealizedLosses = 0;

    const assetBreakdown = {};

    for (const record of costBasisRecords) {
      const currentValue = new Decimal(record.currentHoldings)
        .times(record.averageCostBasis)
        .toNumber();

      totalValue += currentValue;
      totalCost += parseFloat(record.totalCostUsd);
      totalRealizedGains += parseFloat(record.realizedGains);
      totalRealizedLosses += parseFloat(record.realizedLosses);

      assetBreakdown[record.asset.code] = {
        ...record,
        currentValue,
        unrealizedGains: currentValue - parseFloat(record.totalCostUsd)
      };
    }

    return {
      beneficiaryId,
      totalValue,
      totalCost,
      totalUnrealizedGains: totalValue - totalCost,
      totalRealizedGains,
      totalRealizedLosses,
      netRealizedGains: totalRealizedGains - totalRealizedLosses,
      assetBreakdown,
      conversionStats
    };
  }
}

module.exports = AnalyticsService;
