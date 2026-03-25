const db = require('../database/connection');

class ExchangeRate {
  static async create(rateData) {
    const [rate] = await db('exchange_rates')
      .insert({
        base_asset_code: rateData.baseAssetCode,
        base_asset_issuer: rateData.baseAssetIssuer,
        quote_asset_code: rateData.quoteAssetCode,
        quote_asset_issuer: rateData.quoteAssetIssuer,
        rate: rateData.rate,
        timestamp: rateData.timestamp,
        source: rateData.source,
        metadata: JSON.stringify(rateData.metadata || {})
      })
      .onConflict('unique_exchange_rate_record')
      .ignore()
      .returning('*');

    return rate ? this.formatRate(rate) : null;
  }

  static async getRate(baseAsset, quoteAsset, timestamp) {
    const query = db('exchange_rates')
      .where('base_asset_code', baseAsset.code)
      .where('base_asset_issuer', baseAsset.issuer)
      .where('quote_asset_code', quoteAsset.code)
      .where('quote_asset_issuer', quoteAsset.issuer);

    if (timestamp) {
      query.where('timestamp', '<=', timestamp)
           .orderBy('timestamp', 'desc')
           .limit(1);
    } else {
      query.orderBy('timestamp', 'desc')
           .limit(1);
    }

    const rate = await query.first();
    return rate ? this.formatRate(rate) : null;
  }

  static async getHistoricalRates(baseAsset, quoteAsset, startTime, endTime) {
    const rates = await db('exchange_rates')
      .where('base_asset_code', baseAsset.code)
      .where('base_asset_issuer', baseAsset.issuer)
      .where('quote_asset_code', quoteAsset.code)
      .where('quote_asset_issuer', quoteAsset.issuer)
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .orderBy('timestamp', 'asc');

    return rates.map(rate => this.formatRate(rate));
  }

  static async getLatestRates() {
    const rates = await db('exchange_rates')
      .select(
        'base_asset_code',
        'base_asset_issuer',
        'quote_asset_code',
        'quote_asset_issuer',
        'rate',
        'timestamp',
        'source'
      )
      .whereIn('id', function() {
        this.select(db.raw('MAX(id)'))
          .from('exchange_rates')
          .groupBy([
            'base_asset_code',
            'base_asset_issuer',
            'quote_asset_code',
            'quote_asset_issuer'
          ]);
      })
      .orderBy('base_asset_code');

    return rates.map(rate => this.formatRate(rate));
  }

  static async deleteOlderThan(daysOld) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return await db('exchange_rates')
      .where('created_at', '<', cutoffDate)
      .del();
  }

  static formatRate(rate) {
    return {
      id: rate.id,
      baseAsset: {
        code: rate.base_asset_code,
        issuer: rate.base_asset_issuer
      },
      quoteAsset: {
        code: rate.quote_asset_code,
        issuer: rate.quote_asset_issuer
      },
      rate: parseFloat(rate.rate),
      timestamp: rate.timestamp,
      source: rate.source,
      metadata: rate.metadata ? JSON.parse(rate.metadata) : null,
      createdAt: rate.created_at
    };
  }
}

module.exports = ExchangeRate;
