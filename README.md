# Vesting Vault Backend - Multi-Language Legal Hash Storage

Token vesting is a legal commitment that often involves international team members who may require contracts in their native language. This backend provides robust support for storing SHA-256 hashes of "Token Purchase Agreements" in multiple languages while tracking which specific language version was primary during digital signing.

## 🌍 Features

- **Multi-Language Legal Document Storage**: Store legal agreements in English, Spanish, Mandarin, French, German, Japanese, and Korean
- **SHA-256 Hash Verification**: Cryptographic integrity verification for all legal documents
- **Primary Language Tracking**: Track which language version was used during digital signing
- **Audit Trail**: Complete audit log for legal compliance and dispute resolution
- **International Legal Support**: Bridge the gap between "Code" and "International Law"

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- PostgreSQL 12+
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Vesting-Vault/backend.git
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database configuration
   ```

4. **Run database migration**
   ```bash
   npm run migrate
   ```

5. **Start the server**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/legal
```

### Endpoints

#### Languages
- `GET /languages` - Get all supported languages

#### Agreements
- `POST /agreements` - Create new token purchase agreement
- `GET /agreements/:id/hashes` - Get all language hashes for an agreement
- `GET /agreements/:id/primary-hash` - Get primary language hash
- `GET /agreements/:id/legal-details` - Get comprehensive legal details for dispute resolution
- `POST /agreements/:id/hashes` - Add/update legal hash for specific language
- `POST /agreements/:id/primary-language` - Set primary language (digital signing)
- `POST /agreements/:id/verify` - Verify hash integrity
- `GET /agreements/:id/audit` - Get audit trail

#### Investors
- `GET /investors/:walletAddress/agreements` - Get investor's agreements

### Example Usage

#### 1. Create Agreement
```bash
curl -X POST http://localhost:3000/api/legal/agreements \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "email": "investor@example.com",
    "name": "John Doe"
  }'
```

#### 2. Add Legal Hash
```bash
curl -X POST http://localhost:3000/api/legal/agreements/{agreementId}/hashes \
  -H "Content-Type: application/json" \
  -d '{
    "languageCode": "en",
    "content": "Token Purchase Agreement content in English...",
    "isPrimary": false
  }'
```

#### 3. Set Primary Language (Digital Signing)
```bash
curl -X POST http://localhost:3000/api/legal/agreements/{agreementId}/primary-language \
  -H "Content-Type: application/json" \
  -d '{
    "languageCode": "en",
    "signerWallet": "0x1234567890123456789012345678901234567890",
    "digitalSignature": "0xabcdef..."
  }'
```

#### 4. Verify Document Integrity
```bash
curl -X POST http://localhost:3000/api/legal/agreements/{agreementId}/verify \
  -H "Content-Type: application/json" \
  -d '{
    "languageCode": "en",
    "content": "Token Purchase Agreement content to verify..."
  }'
```

## 🗄️ Database Schema

### Core Tables

- **investors**: Store investor information and wallet addresses
- **languages**: Supported languages for legal documents
- **token_purchase_agreements**: Main agreement records
- **legal_agreement_hashes**: SHA-256 hashes for each language version
- **legal_agreement_audit_log**: Complete audit trail for compliance

### Key Features

- **Single Primary Language Constraint**: Database trigger ensures only one primary language per agreement
- **Cryptographic Hash Storage**: SHA-256 hashes ensure document integrity
- **Comprehensive Audit Trail**: Track all changes for legal compliance
- **Multi-Language Support**: 7 default languages with easy extensibility

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run with coverage:

```bash
npm test -- --coverage
```

## 🔒 Security Considerations

- **Hash Verification**: SHA-256 ensures document integrity
- **Digital Signatures**: Cryptographic proof of signing
- **Audit Trail**: Immutable record of all changes
- **Wallet Address Validation**: Proper Ethereum address format validation

## ⚖️ Legal Compliance

This system is designed to support international legal requirements:

- **Language Preference**: Investors can sign in their native language
- **Primary Language Tracking**: Clear record of which version was signed
- **Audit Trail**: Complete history for legal disputes
- **Hash Verification**: Cryptographic proof of document integrity

## 🌐 Supported Languages

- English (en)
- Spanish (es)  
- Mandarin (zh)
- French (fr)
- German (de)
- Japanese (ja)
- Korean (ko)

Additional languages can be easily added to the `languages` table.

## 📝 Development

### Project Structure

```
backend/
├── database/
│   ├── schema.sql          # Database schema
│   └── migrate.js          # Migration script
├── models/
│   ├── database.js         # Database connection
│   ├── LegalAgreement.js   # Legal agreement model
│   └── Investor.js         # Investor model
├── routes/
│   └── legalAgreements.js  # API routes
├── tests/
│   ├── legalAgreements.test.js
│   └── setup.js
├── index.js                # Main application
└── package.json
```

### Adding New Languages

1. Insert into the `languages` table:
```sql
INSERT INTO languages (code, name) VALUES ('pt', 'Portuguese');
```

2. The API will automatically support the new language.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Contract Address

```
CD5QF6KBAURVUNZR2EVBJISWSEYGDGEEYVH2XYJJADKT7KFOXTTIXLHU
```

## 📞 Support

For technical support or legal questions regarding the multi-language implementation, please open an issue in the repository.
