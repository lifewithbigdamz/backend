const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');
const BigNumber = require('bignumber.js');

const TaxCalculation = sequelize.define('TaxCalculation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_address: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true,
  },
  vault_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  jurisdiction_code: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  tax_year: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  event_type: {
    type: DataTypes.ENUM('VESTING', 'CLAIM', 'SELL'),
    allowNull: false,
  },
  token_amount: {
    type: DataTypes.DECIMAL(36, 18),
    allowNull: false,
  },
  token_price_usd: {
    type: DataTypes.DECIMAL(18, 8),
    allowNull: false,
  },
  taxable_value_usd: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
  },
  tax_rate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
  },
  estimated_tax_usd: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
  },
  withholding_amount_token: {
    type: DataTypes.DECIMAL(36, 18),
    allowNull: true,
    comment: 'Amount of tokens needed to cover tax (Sell-to-Cover)'
  },
  oracle_source: {
    type: DataTypes.STRING,
    defaultValue: 'INTERNAL',
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PROCESSED', 'FAILED'),
    defaultValue: 'PENDING',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  tableName: 'tax_calculations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_address', 'tax_year'] },
    { fields: ['vault_id'] }
  ]
});

// Static helper for test suite and service integration
TaxCalculation.createTaxCalculation = async function(data) {
  return await this.create({
    vault_id: data.vaultId,
    user_address: data.userAddress,
    jurisdiction_code: data.taxJurisdiction || 'US',
    tax_year: data.taxYear,
    event_type: data.taxEventType || 'VESTING',
    token_amount: data.vestedAmount || data.claimedAmount || 0,
    token_price_usd: data.tokenPriceUsd || 0,
    taxable_value_usd: data.fairMarketValueUsd || 0,
    tax_rate: data.taxRatePercent || 0,
    estimated_tax_usd: new BigNumber(data.fairMarketValueUsd || 0).times(data.taxRatePercent || 0).div(100).toString(),
    status: data.userConfirmed ? 'PROCESSED' : 'PENDING',
    created_at: data.taxEventDate || new Date()
  });
};

module.exports = TaxCalculation;