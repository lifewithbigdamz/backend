const db = require('../database/connection');

class ConversionEvent {
  static async create(eventData) {
    const [event] = await db('conversion_events')
      .insert({
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
        path_payment_details: JSON.stringify(eventData.pathPaymentDetails || {}),
        memo: eventData.memo,
        memo_type: eventData.memoType
      })
      .returning('*');

    return this.formatEvent(event);
  }

  static async findByBeneficiary(beneficiaryId, options = {}) {
    const query = db('conversion_events')
      .where('beneficiary_id', beneficiaryId);

    if (options.startDate) {
      query.where('created_at', '>=', options.startDate);
    }

    if (options.endDate) {
      query.where('created_at', '<=', options.endDate);
    }

    if (options.assetCode) {
      query.where('source_asset_code', options.assetCode);
    }

    if (options.limit) {
      query.limit(options.limit);
    }

    if (options.offset) {
      query.offset(options.offset);
    }

    query.orderBy('created_at', 'desc');

    const events = await query;
    return events.map(event => this.formatEvent(event));
  }

  static async findByTransactionHash(transactionHash) {
    const event = await db('conversion_events')
      .where('transaction_hash', transactionHash)
      .first();

    return event ? this.formatEvent(event) : null;
  }

  static async findByStellarAccount(stellarAccount, options = {}) {
    const query = db('conversion_events')
      .where('stellar_account', stellarAccount);

    if (options.startDate) {
      query.where('created_at', '>=', options.startDate);
    }

    if (options.endDate) {
      query.where('created_at', '<=', options.endDate);
    }

    query.orderBy('created_at', 'desc');

    if (options.limit) {
      query.limit(options.limit);
    }

    const events = await query;
    return events.map(event => this.formatEvent(event));
  }

  static async getConversionStats(beneficiaryId, assetCode) {
    const stats = await db('conversion_events')
      .where('beneficiary_id', beneficiaryId)
      .where('source_asset_code', assetCode)
      .select(
        db.raw('COUNT(*) as total_conversions'),
        db.raw('SUM(source_amount) as total_source_amount'),
        db.raw('SUM(destination_amount) as total_destination_amount'),
        db.raw('AVG(exchange_rate) as average_exchange_rate'),
        db.raw('MIN(created_at) as first_conversion'),
        db.raw('MAX(created_at) as last_conversion')
      )
      .first();

    return stats;
  }

  static formatEvent(event) {
    return {
      id: event.id,
      beneficiaryId: event.beneficiary_id,
      transactionHash: event.transaction_hash,
      stellarAccount: event.stellar_account,
      sourceAsset: {
        code: event.source_asset_code,
        issuer: event.source_asset_issuer
      },
      destinationAsset: {
        code: event.destination_asset_code,
        issuer: event.destination_asset_issuer
      },
      sourceAmount: parseFloat(event.source_amount),
      destinationAmount: parseFloat(event.destination_amount),
      exchangeRate: parseFloat(event.exchange_rate),
      exchangeRateTimestamp: event.exchange_rate_timestamp,
      exchangeRateSource: event.exchange_rate_source,
      pathPaymentDetails: event.path_payment_details ? JSON.parse(event.path_payment_details) : null,
      memo: event.memo,
      memoType: event.memo_type,
      createdAt: event.created_at,
      updatedAt: event.updated_at
    };
  }
}

module.exports = ConversionEvent;
