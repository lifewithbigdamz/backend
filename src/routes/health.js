const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.get('/', async (req, res) => {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'vesting-vault-backend',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'vesting-vault-backend',
      error: error.message
    });
  }
});

module.exports = router;
