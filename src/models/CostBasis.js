const db = require('../database/connection');
const Decimal = require('decimal.js');

class CostBasis {
  static async upsert(costBasisData) {
    const existing = await db('cost_basis')
      .where('beneficiary_id', costBasisData.beneficiaryId)
      .where('asset_code', costBasisData.assetCode)
      .where('asset_issuer', costBasisData.assetIssuer)
      .first();

    if (existing) {
      const [updated] = await db('cost_basis')
        .where('id', existing.id)
        .update({
          total_acquired: costBasisData.totalAcquired,
          total_cost_usd: costBasisData.totalCostUsd,
          average_cost_basis: costBasisData.averageCostBasis,
          current_holdings: costBasisData.currentHoldings,
          realized_gains: costBasisData.realizedGains || 0,
          realized_losses: costBasisData.realizedLosses || 0,
          last_updated: new Date()
        })
        .returning('*');

      return this.formatCostBasis(updated);
    } else {
      const [created] = await db('cost_basis')
        .insert({
          beneficiary_id: costBasisData.beneficiaryId,
          stellar_account: costBasisData.stellarAccount,
          asset_code: costBasisData.assetCode,
          asset_issuer: costBasisData.assetIssuer,
          total_acquired: costBasisData.totalAcquired,
          total_cost_usd: costBasisData.totalCostUsd,
          average_cost_basis: costBasisData.averageCostBasis,
          current_holdings: costBasisData.currentHoldings,
          realized_gains: costBasisData.realizedGains || 0,
          realized_losses: costBasisData.realizedLosses || 0
        })
        .returning('*');

      return this.formatCostBasis(created);
    }
  }

  static async findByBeneficiary(beneficiaryId) {
    const records = await db('cost_basis')
      .where('beneficiary_id', beneficiaryId)
      .orderBy('asset_code');

    return records.map(record => this.formatCostBasis(record));
  }

  static async findByBeneficiaryAndAsset(beneficiaryId, assetCode, assetIssuer) {
    const record = await db('cost_basis')
      .where('beneficiary_id', beneficiaryId)
      .where('asset_code', assetCode)
      .where('asset_issuer', assetIssuer)
      .first();

    return record ? this.formatCostBasis(record) : null;
  }

  static async updateHoldings(beneficiaryId, assetCode, assetIssuer, amountChange, isSale = false) {
    const existing = await this.findByBeneficiaryAndAsset(beneficiaryId, assetCode, assetIssuer);
    
    if (!existing) {
      throw new Error('Cost basis record not found for this beneficiary and asset');
    }

    const newHoldings = new Decimal(existing.currentHoldings).plus(amountChange);
    
    if (newHoldings.lt(0)) {
      throw new Error('Insufficient holdings for this transaction');
    }

    if (isSale) {
      const proceedsPerUnit = amountChange.div(amountChange);
      const costBasisOfSold = new Decimal(existing.averageCostBasis).times(amountChange.abs());
      const proceeds = new Decimal(proceedsPerUnit).times(amountChange.abs());
      const gainLoss = proceeds.minus(costBasisOfSold);

      const realizedGains = gainLoss.gt(0) 
        ? new Decimal(existing.realizedGains).plus(gainLoss)
        : existing.realizedGains;
      
      const realizedLosses = gainLoss.lt(0)
        ? new Decimal(existing.realizedLosses).plus(gainLoss.abs())
        : existing.realizedLosses;

      const [updated] = await db('cost_basis')
        .where('id', existing.id)
        .update({
          current_holdings: newHoldings.toString(),
          realized_gains: realizedGains.toString(),
          realized_losses: realizedLosses.toString(),
          last_updated: new Date()
        })
        .returning('*');

      return this.formatCostBasis(updated);
    } else {
      const [updated] = await db('cost_basis')
        .where('id', existing.id)
        .update({
          current_holdings: newHoldings.toString(),
          last_updated: new Date()
        })
        .returning('*');

      return this.formatCostBasis(updated);
    }
  }

  static async calculateCapitalGains(beneficiaryId, assetCode, assetIssuer) {
    const costBasis = await this.findByBeneficiaryAndAsset(beneficiaryId, assetCode, assetIssuer);
    
    if (!costBasis) {
      return {
        totalRealizedGains: 0,
        totalRealizedLosses: 0,
        netGains: 0,
        unrealizedGains: 0,
        totalValue: 0
      };
    }

    return {
      totalRealizedGains: parseFloat(costBasis.realizedGains),
      totalRealizedLosses: parseFloat(costBasis.realizedLosses),
      netGains: parseFloat(costBasis.realizedGains) - parseFloat(costBasis.realizedLosses),
      unrealizedGains: 0, // This would require current market price
      totalValue: parseFloat(costBasis.currentHoldings) * parseFloat(costBasis.averageCostBasis)
    };
  }

  static formatCostBasis(record) {
    return {
      id: record.id,
      beneficiaryId: record.beneficiary_id,
      stellarAccount: record.stellar_account,
      asset: {
        code: record.asset_code,
        issuer: record.asset_issuer
      },
      totalAcquired: parseFloat(record.total_acquired),
      totalCostUsd: parseFloat(record.total_cost_usd),
      averageCostBasis: parseFloat(record.average_cost_basis),
      currentHoldings: parseFloat(record.current_holdings),
      realizedGains: parseFloat(record.realized_gains),
      realizedLosses: parseFloat(record.realized_losses),
      lastUpdated: record.last_updated,
      createdAt: record.created_at
    };
  }
}

module.exports = CostBasis;
