const express = require('express');
const cors = require('cors');
require('dotenv').config();

const legalAgreementsRouter = require('./routes/legalAgreements');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support large legal documents
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    project: 'Vesting Vault - Multi-Language Legal Hash Storage', 
    status: 'Tracking Locked Tokens with International Legal Support',
    contract: 'CD5QF6KBAURVUNZR2EVBJISWSEYGDGEEYVH2XYJJADKT7KFOXTTIXLHU',
    version: '1.0.0',
    features: [
      'Multi-language legal document hash storage',
      'SHA-256 hash verification',
      'Primary language tracking for digital signing',
      'Audit trail for legal compliance',
      'International legal dispute resolution support'
    ]
  });
});

// API Routes
app.use('/api/legal', legalAgreementsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
  console.log(`🚀 Vesting API running on port ${port}`);
  console.log(`📝 Multi-Language Legal Hash Storage enabled`);
  console.log(`🔗 Health check: http://localhost:${port}`);
  console.log(`📚 API docs: http://localhost:${port}/api/legal`);
});
