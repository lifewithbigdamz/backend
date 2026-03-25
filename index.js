require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const auditRoutes = require('./routes/audit');
const authRoutes = require('./routes/auth');
const auditMiddleware = require('./middleware/auditMiddleware');
const authMiddleware = require('./middleware/authMiddleware');

app.use('/api/auth', authRoutes);
app.use('/api/audit', authMiddleware.authenticateToken, authMiddleware.validateUserClaims, authMiddleware.requireEndpointAccess(), auditRoutes);

app.post('/api/vesting/cliff-date', 
    authMiddleware.authenticateToken,
    authMiddleware.validateUserClaims,
    authMiddleware.requireEndpointAccess(),
    auditMiddleware.auditCliffDateChanges(),
    (req, res) => {
        res.json({ 
            success: true, 
            message: 'Cliff date updated successfully',
            data: req.body
        });
    }
);

app.post('/api/vesting/beneficiary', 
    authMiddleware.authenticateToken,
    authMiddleware.validateUserClaims,
    authMiddleware.requireEndpointAccess(),
    auditMiddleware.auditBeneficiaryChanges(),
    (req, res) => {
        res.json({ 
            success: true, 
            message: 'Beneficiary updated successfully',
            data: req.body
        });
    }
);

app.post('/api/admin/action', 
    authMiddleware.authenticateToken,
    authMiddleware.validateUserClaims,
    authMiddleware.requireEndpointAccess(),
    auditMiddleware.auditAdminActions(),
    (req, res) => {
        res.json({ 
            success: true, 
            message: 'Admin action completed successfully',
            data: req.body
        });
    }
);

app.get('/', (req, res) => {
    res.json({ 
        project: 'Vesting Vault', 
        status: 'Tracking Locked Tokens with Audit Trail', 
        contract: 'CD5QF6KBAURVUNZR2EVBJISWSEYGDGEEYVH2XYJJADKT7KFOXTTIXLHU',
        features: [
            'Tamper-proof audit logging',
            'Cryptographic chain integrity',
            'Stellar ledger anchoring',
            'Event sourcing architecture',
            'Role-Based Access Control (RBAC)',
            'JWT authentication',
            'Granular permissions'
        ],
        endpoints: {
            auth: '/api/auth',
            'auth-token': '/api/auth/token/generate',
            'auth-verify': '/api/auth/token/verify',
            'auth-roles': '/api/auth/roles',
            'auth-permissions': '/api/auth/permissions/:role',
            'auth-test': '/api/auth/test-access',
            audit: '/api/audit',
            verification: '/api/audit/verify',
            history: '/api/audit/history',
            anchoring: '/api/audit/anchor',
            'stellar-account': '/api/audit/stellar/account',
            'chain-integrity': '/api/audit/chain-integrity',
            'daily-hashes': '/api/audit/daily-hashes'
        },
        rbac: {
            'super_admin': 'Full system control',
            'finance_manager': 'Withdrawal/Revenue operations',
            'hr_manager': 'Onboarding/Metadata management',
            'read_only_auditor': 'Read-only audit access'
        }
    });
});

app.listen(port, () => {
    console.log(`Vesting API running on port ${port}`);
    console.log(`Audit trail system initialized`);
    console.log(`Daily anchoring scheduled for 2:00 AM UTC`);
});
