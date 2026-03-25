// Test setup file
require('dotenv').config();

// Mock database for testing
const { pool } = require('../models/database');

// Disable database connections during testing unless explicitly needed
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
