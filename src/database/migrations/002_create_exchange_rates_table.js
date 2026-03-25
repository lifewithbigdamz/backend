exports.up = function(knex) {
  return knex.schema.createTable('exchange_rates', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('base_asset_code').notNullable();
    table.string('base_asset_issuer').notNullable();
    table.string('quote_asset_code').notNullable();
    table.string('quote_asset_issuer').notNullable();
    table.decimal('rate', 20, 10).notNullable();
    table.timestamp('timestamp').notNullable();
    table.string('source').notNullable();
    table.json('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes for efficient queries
    table.index(['base_asset_code', 'base_asset_issuer']);
    table.index(['quote_asset_code', 'quote_asset_issuer']);
    table.index('timestamp');
    table.index('source');
    
    // Unique constraint to prevent duplicates
    table.unique([
      'base_asset_code', 
      'base_asset_issuer', 
      'quote_asset_code', 
      'quote_asset_issuer', 
      'timestamp', 
      'source'
    ], 'unique_exchange_rate_record');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('exchange_rates');
};
