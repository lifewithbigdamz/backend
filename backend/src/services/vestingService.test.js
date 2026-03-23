const { sequelize } = require('../database/connection');
const { Vault } = require('../models');
const vestingService = require('./vestingService');

jest.setTimeout(60000);

describe('VestingService - createVault with token_type', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });



  beforeEach(async () => {
    await Vault.destroy({ where: {}, force: true });
  });

  describe('Token Type Support', () => {
    test('should create vault with default static token type', async () => {
      const result = await vestingService.createVault(
        '0xadmin1111111111111111111111111111111111',
        '0xvault1111111111111111111111111111111111',
        '0xowner1111111111111111111111111111111111',
        '0xtoken1111111111111111111111111111111111',
        '1000',
        new Date('2024-01-01'),
        new Date('2025-01-01'),
        null
        // tokenType not specified - should default to 'static'
      );

      expect(result.success).toBe(true);
      expect(result.vault.token_type).toBe('static');

      // Verify in database
      const vault = await Vault.findOne({ where: { address: result.vault.address } });
      expect(vault.token_type).toBe('static');
    });

    test('should create vault with explicit static token type', async () => {
      const result = await vestingService.createVault(
        '0xadmin2222222222222222222222222222222222',
        '0xvault2222222222222222222222222222222222',
        '0xowner2222222222222222222222222222222222',
        '0xtoken2222222222222222222222222222222222',
        '2000',
        new Date('2024-01-01'),
        new Date('2025-01-01'),
        null,
        'static'
      );

      expect(result.success).toBe(true);
      expect(result.vault.token_type).toBe('static');

      // Verify in database
      const vault = await Vault.findOne({ where: { address: result.vault.address } });
      expect(vault.token_type).toBe('static');
    });

    test('should create vault with dynamic token type', async () => {
      const result = await vestingService.createVault(
        '0xadmin3333333333333333333333333333333333',
        '0xvault3333333333333333333333333333333333',
        '0xowner3333333333333333333333333333333333',
        '0xtoken3333333333333333333333333333333333',
        '3000',
        new Date('2024-01-01'),
        new Date('2025-01-01'),
        null,
        'dynamic'
      );

      expect(result.success).toBe(true);
      expect(result.vault.token_type).toBe('dynamic');

      // Verify in database
      const vault = await Vault.findOne({ where: { address: result.vault.address } });
      expect(vault.token_type).toBe('dynamic');
    });

    test('should reject invalid token type', async () => {
      await expect(
        vestingService.createVault(
          '0xadmin4444444444444444444444444444444444',
          '0xvault4444444444444444444444444444444444',
          '0xowner4444444444444444444444444444444444',
          '0xtoken4444444444444444444444444444444444',
          '4000',
          new Date('2024-01-01'),
          new Date('2025-01-01'),
          null,
          'invalid'
        )
      ).rejects.toThrow('Invalid token type: invalid');
    });

    test('should create vault with object parameter and default token type', async () => {
      const vault = await vestingService.createVault({
        address: '0xvault5555555555555555555555555555555555',
        owner_address: '0xowner5555555555555555555555555555555555',
        token_address: '0xtoken5555555555555555555555555555555555',
        initial_amount: '5000'
        // token_type not specified - should default to 'static'
      });

      expect(vault.token_type).toBe('static');

      // Verify in database
      const dbVault = await Vault.findOne({ where: { address: vault.address } });
      expect(dbVault.token_type).toBe('static');
    });

    test('should create vault with object parameter and dynamic token type', async () => {
      const vault = await vestingService.createVault({
        address: '0xvault6666666666666666666666666666666666',
        owner_address: '0xowner6666666666666666666666666666666666',
        token_address: '0xtoken6666666666666666666666666666666666',
        initial_amount: '6000',
        token_type: 'dynamic'
      });

      expect(vault.token_type).toBe('dynamic');

      // Verify in database
      const dbVault = await Vault.findOne({ where: { address: vault.address } });
      expect(dbVault.token_type).toBe('dynamic');
    });

    test('should reject invalid token type with object parameter', async () => {
      await expect(
        vestingService.createVault({
          address: '0xvault7777777777777777777777777777777777',
          owner_address: '0xowner7777777777777777777777777777777777',
          token_address: '0xtoken7777777777777777777777777777777777',
          initial_amount: '7000',
          token_type: 'invalid'
        })
      ).rejects.toThrow('Invalid token type: invalid');
    });
  });
});
