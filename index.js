require('dotenv').config();
const express = require('express');
const cors = require('cors');
const StellarPathPaymentListener = require('./services/stellarPathPaymentListener');

// Import routes
const analyticsRoutes = require('./routes/analytics');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            api: 'running',
            stellar_listener: stellarListener ? (stellarListener.isListening ? 'running' : 'stopped') : 'not_initialized'
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Vesting Vault Backend API with Multi-Currency Path Payment Analytics',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            analytics: '/api/analytics/*',
            documentation: 'https://github.com/lifewithbigdamz/backend'
        }
    });
});

// Initialize Stellar Path Payment Listener
let stellarListener = null;

async function initializeStellarListener() {
    try {
        stellarListener = new StellarPathPaymentListener({
            stellarHorizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
            network: process.env.STELLAR_NETWORK || 'testnet',
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'vesting_vault',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'password'
            },
            vestingVaultAddress: process.env.VESTING_VAULT_ADDRESS,
            maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
            retryDelay: parseInt(process.env.RETRY_DELAY) || 5000,
            usdcAssetCode: process.env.USDC_ASSET_CODE || 'USDC',
            usdcAssetIssuer: process.env.USDC_ASSET_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K3K6PV'
        });

        await stellarListener.initialize();
        
        // Start listening in the background
        stellarListener.startListening().catch(error => {
            console.error('❌ Failed to start Stellar listener:', error);
        });

        console.log('✅ Stellar Path Payment Listener initialized');
        
    } catch (error) {
        console.error('❌ Failed to initialize Stellar listener:', error);
        // Don't exit the app, just continue without the listener
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    
    if (stellarListener) {
        await stellarListener.stop();
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    
    if (stellarListener) {
        await stellarListener.stop();
    }
    
    process.exit(0);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'The requested endpoint does not exist'
    });
});

// Start server
async function startServer() {
    try {
        // Initialize Stellar listener first
        await initializeStellarListener();
        
        // Start the Express server
        app.listen(port, () => {
            console.log(`🚀 Vesting Vault Backend API running on port ${port}`);
            console.log(`📊 Analytics endpoints available at http://localhost:${port}/api/analytics`);
            console.log(`💚 Health check available at http://localhost:${port}/health`);
            
            if (stellarListener) {
                console.log(`⭐ Stellar Path Payment Listener: ${stellarListener.isListening ? 'Running' : 'Stopped'}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the application
startServer();

module.exports = app;
