require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');

const StellarListener = require('./services/StellarListener');
const logger = require('./utils/logger');
const db = require('./database/connection');

// Import routes
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/analytics', analyticsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Vesting-Vault Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      analytics: '/api/analytics',
      documentation: 'https://github.com/lifewithbigdamz/backend'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  
  res.status(error.status || 500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Initialize Stellar listener
let stellarListener;

async function initializeServices() {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    logger.info('Database connection established');

    // Initialize and start Stellar listener
    stellarListener = new StellarListener();
    await stellarListener.start();
    logger.info('Stellar listener started successfully');

    // Schedule cleanup tasks
    scheduleCleanupTasks();

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

function scheduleCleanupTasks() {
  // Clean up old exchange rates daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting cleanup of old exchange rates');
      const retentionDays = parseInt(process.env.CONVERSION_EVENTS_RETENTION_DAYS) || 365;
      const deletedCount = await require('./models/ExchangeRate').deleteOlderThan(retentionDays);
      logger.info(`Cleaned up ${deletedCount} old exchange rate records`);
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  });

  // Backup conversion events weekly (placeholder for backup logic)
  cron.schedule('0 3 * * 0', async () => {
    try {
      logger.info('Starting weekly backup of conversion events');
      // Implement backup logic here
      logger.info('Weekly backup completed');
    } catch (error) {
      logger.error('Error during backup:', error);
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  if (stellarListener) {
    await stellarListener.stop();
  }
  
  await db.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  if (stellarListener) {
    await stellarListener.stop();
  }
  
  await db.destroy();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

module.exports = app;
