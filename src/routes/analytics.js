const express = require('express');
const router = express.Router();
const AnalyticsService = require('../services/AnalyticsService');
const ConversionEvent = require('../models/ConversionEvent');
const ExchangeRate = require('../models/ExchangeRate');
const logger = require('../utils/logger');

// Get beneficiary conversion history
router.get('/beneficiaries/:beneficiaryId/conversions', async (req, res) => {
  try {
    const { beneficiaryId } = req.params;
    const {
      startDate,
      endDate,
      assetCode,
      limit = 100,
      offset = 0
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      assetCode,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const result = await AnalyticsService.getBeneficiaryConversionHistory(beneficiaryId, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting conversion history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversion history',
      message: error.message
    });
  }
});

// Get beneficiary conversion statistics
router.get('/beneficiaries/:beneficiaryId/stats', async (req, res) => {
  try {
    const { beneficiaryId } = req.params;
    const { assetCode } = req.query;

    const stats = await AnalyticsService.getBeneficiaryConversionStats(beneficiaryId, assetCode);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting conversion stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversion statistics',
      message: error.message
    });
  }
});

// Get capital gains report for tax year
router.get('/beneficiaries/:beneficiaryId/capital-gains/:taxYear', async (req, res) => {
  try {
    const { beneficiaryId, taxYear } = req.params;
    
    if (!taxYear || isNaN(taxYear)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tax year',
        message: 'Tax year must be a valid year (e.g., 2023)'
      });
    }

    const report = await AnalyticsService.getCapitalGainsReport(beneficiaryId, parseInt(taxYear));
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error generating capital gains report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate capital gains report',
      message: error.message
    });
  }
});

// Get portfolio overview
router.get('/beneficiaries/:beneficiaryId/portfolio', async (req, res) => {
  try {
    const { beneficiaryId } = req.params;
    
    const overview = await AnalyticsService.getPortfolioOverview(beneficiaryId);
    
    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    logger.error('Error getting portfolio overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve portfolio overview',
      message: error.message
    });
  }
});

// Get exchange rate history
router.get('/exchange-rates/:baseAsset/:quoteAsset', async (req, res) => {
  try {
    const { baseAsset, quoteAsset } = req.params;
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing time range',
        message: 'Both startTime and endTime are required'
      });
    }

    const baseAssetObj = {
      code: baseAsset.split(':')[0],
      issuer: baseAsset.split(':')[1] || null
    };

    const quoteAssetObj = {
      code: quoteAsset.split(':')[0],
      issuer: quoteAsset.split(':')[1] || null
    };

    const rateHistory = await AnalyticsService.getExchangeRateHistory(
      baseAssetObj,
      quoteAssetObj,
      new Date(startTime),
      new Date(endTime)
    );
    
    res.json({
      success: true,
      data: rateHistory
    });
  } catch (error) {
    logger.error('Error getting exchange rate history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve exchange rate history',
      message: error.message
    });
  }
});

// Get latest exchange rates
router.get('/exchange-rates/latest', async (req, res) => {
  try {
    const rates = await ExchangeRate.getLatestRates();
    
    res.json({
      success: true,
      data: rates
    });
  } catch (error) {
    logger.error('Error getting latest exchange rates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve latest exchange rates',
      message: error.message
    });
  }
});

// Get specific conversion event
router.get('/conversions/:transactionHash', async (req, res) => {
  try {
    const { transactionHash } = req.params;
    
    const conversion = await ConversionEvent.findByTransactionHash(transactionHash);
    
    if (!conversion) {
      return res.status(404).json({
        success: false,
        error: 'Conversion event not found',
        message: `No conversion event found for transaction hash: ${transactionHash}`
      });
    }
    
    res.json({
      success: true,
      data: conversion
    });
  } catch (error) {
    logger.error('Error getting conversion event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversion event',
      message: error.message
    });
  }
});

// Get conversions by Stellar account
router.get('/accounts/:stellarAccount/conversions', async (req, res) => {
  try {
    const { stellarAccount } = req.params;
    const {
      startDate,
      endDate,
      limit = 50
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: parseInt(limit)
    };

    const conversions = await ConversionEvent.findByStellarAccount(stellarAccount, options);
    
    res.json({
      success: true,
      data: conversions
    });
  } catch (error) {
    logger.error('Error getting account conversions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve account conversions',
      message: error.message
    });
  }
});

module.exports = router;
