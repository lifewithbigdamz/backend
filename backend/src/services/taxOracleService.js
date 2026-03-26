const TaxJurisdiction = require('../models/taxJurisdiction');

class TaxOracleService {
  /**
   * Fetches the applicable tax rate for a jurisdiction and income level.
   * Integrates with external providers or falls back to internal rules.
   */
  async getEffectiveTaxRate(jurisdictionCode, incomeUsd, holdingPeriodDays = 0) {
    const jurisdiction = await TaxJurisdiction.getByCode(jurisdictionCode);
    if (!jurisdiction) throw new Error(`Jurisdiction ${jurisdictionCode} not supported.`);

    // Logic for 3rd Party Oracle Integration (TaxBit/CoinTracker) would go here
    // For now, we use the high-precision internal engine
    const rate = jurisdiction.getTaxRate(incomeUsd, holdingPeriodDays);
    
    return {
      rate: parseFloat(rate),
      source: 'INTERNAL_FALLBACK',
      jurisdictionName: jurisdiction.jurisdiction_name
    };
  }

  /**
   * Checks if a specific event is taxable in the given jurisdiction.
   */
  async isTaxableEvent(jurisdictionCode, eventType) {
    const jurisdiction = await TaxJurisdiction.getByCode(jurisdictionCode);
    return jurisdiction ? jurisdiction.isTaxEvent(eventType) : true;
  }
}

module.exports = new TaxOracleService();