const StellarSdk = require('stellar-sdk');
const axios = require('axios');
const ConversionEvent = require('../models/ConversionEvent');
const ExchangeRate = require('../models/ExchangeRate');
const CostBasis = require('../models/CostBasis');
const logger = require('../utils/logger');

class StellarListener {
  constructor() {
    this.server = new StellarSdk.Server(
      process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org'
    );
    this.isRunning = false;
    this.lastCursor = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Stellar listener is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Stellar DEX path payment listener');

    try {
      await this.initializeCursor();
      this.listenForTransactions();
    } catch (error) {
      logger.error('Failed to start Stellar listener:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    logger.info('Stellar listener stopped');
  }

  async initializeCursor() {
    // In a real implementation, you would store and retrieve the last cursor from your database
    // For now, we'll start from 'now' to get new transactions
    this.lastCursor = 'now';
  }

  async listenForTransactions() {
    const callBuilder = this.server.transactions()
      .cursor(this.lastCursor)
      .limit(200)
      .order('asc');

    try {
      const stream = callBuilder.stream({
        onmessage: async (transaction) => {
          await this.processTransaction(transaction);
          this.lastCursor = transaction.paging_token;
        },
        onerror: (error) => {
          logger.error('Stream error:', error);
          // Implement retry logic here
          setTimeout(() => this.listenForTransactions(), 5000);
        }
      });

      logger.info('Successfully connected to Stellar stream');
    } catch (error) {
      logger.error('Failed to create Stellar stream:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async processTransaction(transaction) {
    try {
      // Check if this is a path payment operation
      const pathPayments = this.extractPathPayments(transaction);
      
      if (pathPayments.length === 0) {
        return; // Not a path payment transaction
      }

      for (const pathPayment of pathPayments) {
        await this.processPathPayment(transaction, pathPayment);
      }
    } catch (error) {
      logger.error(`Error processing transaction ${transaction.hash}:`, error);
    }
  }

  extractPathPayments(transaction) {
    const pathPayments = [];
    
    if (!transaction.operations) {
      return pathPayments;
    }

    for (const operation of transaction.operations) {
      if (operation.type === 'path_payment_strict_send' || 
          operation.type === 'path_payment_strict_receive') {
        pathPayments.push(operation);
      }
    }

    return pathPayments;
  }

  async processPathPayment(transaction, pathPayment) {
    try {
      // Extract beneficiary information from memo or account mapping
      const beneficiaryInfo = await this.identifyBeneficiary(
        transaction.source_account,
        transaction.memo,
        pathPayment
      );

      if (!beneficiaryInfo) {
        logger.warn(`Could not identify beneficiary for transaction ${transaction.hash}`);
        return;
      }

      // Get or calculate exchange rate
      const exchangeRate = await this.getExchangeRate(
        pathPayment.source_asset,
        pathPayment.destination_asset,
        transaction.created_at
      );

      if (!exchangeRate) {
        logger.warn(`Could not get exchange rate for transaction ${transaction.hash}`);
        return;
      }

      // Create conversion event record
      const conversionEvent = await ConversionEvent.create({
        beneficiaryId: beneficiaryInfo.id,
        transactionHash: transaction.hash,
        stellarAccount: transaction.source_account,
        sourceAssetCode: pathPayment.source_asset.code,
        sourceAssetIssuer: pathPayment.source_asset.issuer,
        sourceAmount: pathPayment.source_amount,
        destinationAssetCode: pathPayment.destination_asset.code,
        destinationAssetIssuer: pathPayment.destination_asset.issuer,
        destinationAmount: pathPayment.destination_amount,
        exchangeRate: exchangeRate.rate,
        exchangeRateTimestamp: exchangeRate.timestamp,
        exchangeRateSource: exchangeRate.source,
        pathPaymentDetails: {
          type: pathPayment.type,
          path: pathPayment.path,
          source_min: pathPayment.source_min || null,
          destination_min: pathPayment.destination_min || null
        },
        memo: transaction.memo ? transaction.memo.value : null,
        memoType: transaction.memo ? transaction.memo.type : null
      });

      // Update cost basis
      await this.updateCostBasis(conversionEvent, beneficiaryInfo);

      logger.info(`Processed conversion event for transaction ${transaction.hash}`);
      
    } catch (error) {
      logger.error(`Error processing path payment for transaction ${transaction.hash}:`, error);
    }
  }

  async identifyBeneficiary(stellarAccount, memo, pathPayment) {
    // This is a placeholder implementation
    // In a real system, you would have a mapping between Stellar accounts and beneficiaries
    // This could be stored in your database or derived from the memo
    
    // For now, we'll use the stellar account as a simple identifier
    // In production, you would query your beneficiaries table
    return {
      id: stellarAccount, // This should be the actual beneficiary UUID
      stellarAccount: stellarAccount
    };
  }

  async getExchangeRate(sourceAsset, destinationAsset, timestamp) {
    // First, try to get from our database
    const existingRate = await ExchangeRate.getRate(sourceAsset, destinationAsset, timestamp);
    
    if (existingRate) {
      return existingRate;
    }

    // If not found, fetch from Stellar DEX or external API
    const fetchedRate = await this.fetchExchangeRate(sourceAsset, destinationAsset, timestamp);
    
    if (fetchedRate) {
      // Store the fetched rate for future use
      await ExchangeRate.create(fetchedRate);
      return fetchedRate;
    }

    return null;
  }

  async fetchExchangeRate(sourceAsset, destinationAsset, timestamp) {
    try {
      // Method 1: Try to get from Stellar DEX orderbook
      const dexRate = await this.getDEXRate(sourceAsset, destinationAsset);
      if (dexRate) {
        return {
          baseAssetCode: sourceAsset.code,
          baseAssetIssuer: sourceAsset.issuer,
          quoteAssetCode: destinationAsset.code,
          quoteAssetIssuer: destinationAsset.issuer,
          rate: dexRate,
          timestamp: timestamp || new Date(),
          source: 'stellar_dex',
          metadata: {
            fetched_at: new Date()
          }
        };
      }

      // Method 2: Try external price feeds (CoinGecko, CoinMarketCap, etc.)
      const externalRate = await this.getExternalRate(sourceAsset, destinationAsset);
      if (externalRate) {
        return externalRate;
      }

      return null;
    } catch (error) {
      logger.error('Error fetching exchange rate:', error);
      return null;
    }
  }

  async getDEXRate(sourceAsset, destinationAsset) {
    try {
      if (this.isNativeAsset(sourceAsset) && this.isUSDC(destinationAsset)) {
        // XLM to USDC
        const orderbook = await this.server.orderbook(
          destinationAsset, // selling (USDC)
          sourceAsset       // buying (XLM)
        ).call();

        if (orderbook.bids && orderbook.bids.length > 0) {
          return parseFloat(orderbook.bids[0].price);
        }
      } else if (this.isUSDC(sourceAsset) && this.isNativeAsset(destinationAsset)) {
        // USDC to XLM
        const orderbook = await this.server.orderbook(
          destinationAsset, // selling (XLM)
          sourceAsset       // buying (USDC)
        ).call();

        if (orderbook.asks && orderbook.asks.length > 0) {
          return parseFloat(orderbook.asks[0].price);
        }
      }

      return null;
    } catch (error) {
      logger.error('Error getting DEX rate:', error);
      return null;
    }
  }

  async getExternalRate(sourceAsset, destinationAsset) {
    // This would integrate with external price APIs
    // For now, return null as a placeholder
    return null;
  }

  isNativeAsset(asset) {
    return asset.type === 'native';
  }

  isUSDC(asset) {
    return asset.code === 'USDC' && 
           asset.issuer === 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3I4OFRU7KTRPG5J2L2K';
  }

  async updateCostBasis(conversionEvent, beneficiaryInfo) {
    try {
      // For the destination asset (e.g., USDC), we're acquiring it
      const destinationCostBasis = await CostBasis.findByBeneficiaryAndAsset(
        conversionEvent.beneficiaryId,
        conversionEvent.destinationAsset.code,
        conversionEvent.destinationAsset.issuer
      );

      if (destinationCostBasis) {
        // Update existing cost basis
        const newTotalAcquired = new Decimal(destinationCostBasis.totalAcquired)
          .plus(conversionEvent.destinationAmount);
        const newTotalCost = new Decimal(destinationCostBasis.totalCostUsd)
          .plus(conversionEvent.sourceAmount); // Assuming source amount is in USD terms
        const newAverageCost = newTotalCost.div(newTotalAcquired);

        await CostBasis.upsert({
          beneficiaryId: conversionEvent.beneficiaryId,
          stellarAccount: conversionEvent.stellarAccount,
          assetCode: conversionEvent.destinationAsset.code,
          assetIssuer: conversionEvent.destinationAsset.issuer,
          totalAcquired: newTotalAcquired.toString(),
          totalCostUsd: newTotalCost.toString(),
          averageCostBasis: newAverageCost.toString(),
          currentHoldings: newTotalAcquired.toString(),
          realizedGains: destinationCostBasis.realizedGains,
          realizedLosses: destinationCostBasis.realizedLosses
        });
      } else {
        // Create new cost basis record
        await CostBasis.upsert({
          beneficiaryId: conversionEvent.beneficiaryId,
          stellarAccount: conversionEvent.stellarAccount,
          assetCode: conversionEvent.destinationAsset.code,
          assetIssuer: conversionEvent.destinationAsset.issuer,
          totalAcquired: conversionEvent.destinationAmount.toString(),
          totalCostUsd: conversionEvent.sourceAmount.toString(),
          averageCostBasis: (conversionEvent.sourceAmount / conversionEvent.destinationAmount).toString(),
          currentHoldings: conversionEvent.destinationAmount.toString()
        });
      }

      // For the source asset, we're disposing of it
      const sourceCostBasis = await CostBasis.findByBeneficiaryAndAsset(
        conversionEvent.beneficiaryId,
        conversionEvent.sourceAsset.code,
        conversionEvent.sourceAsset.issuer
      );

      if (sourceCostBasis) {
        await CostBasis.updateHoldings(
          conversionEvent.beneficiaryId,
          conversionEvent.sourceAsset.code,
          conversionEvent.sourceAsset.issuer,
          new Decimal(conversionEvent.sourceAmount).negated(),
          true // This is a sale/disposition
        );
      }

    } catch (error) {
      logger.error('Error updating cost basis:', error);
    }
  }
}

module.exports = StellarListener;
