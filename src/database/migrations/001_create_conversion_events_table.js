exports.up = function(knex) {
  return knex.schema.createTable('conversion_events', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('beneficiary_id').notNullable();
    table.string('transaction_hash').notNullable().unique();
    table.string('stellar_account').notNullable();
    
    // Source asset information (vesting asset)
    table.string('source_asset_code').notNullable();
    table.string('source_asset_issuer').notNullable();
    table.decimal('source_amount', 20, 7).notNullable();
    
    // Destination asset information (payout asset, typically USDC)
    table.string('destination_asset_code').notNullable();
    table.string('destination_asset_issuer').notNullable();
    table.decimal('destination_amount', 20, 7).notNullable();
    
    // Exchange rate information
    table.decimal('exchange_rate', 20, 10).notNullable();
    table.timestamp('exchange_rate_timestamp').notNullable();
    table.string('exchange_rate_source').notNullable();
    
    // Path payment details
    table.json('path_payment_details');
    table.string('memo');
    table.string('memo_type');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('beneficiary_id');
    table.index('stellar_account');
    table.index('transaction_hash');
    table.index('exchange_rate_timestamp');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('conversion_events');
};
