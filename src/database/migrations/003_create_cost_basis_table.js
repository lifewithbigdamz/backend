exports.up = function(knex) {
  return knex.schema.createTable('cost_basis', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('beneficiary_id').notNullable();
    table.string('stellar_account').notNullable();
    table.string('asset_code').notNullable();
    table.string('asset_issuer').notNullable();
    
    // Cost basis calculation
    table.decimal('total_acquired', 20, 7).notNullable();
    table.decimal('total_cost_usd', 20, 7).notNullable();
    table.decimal('average_cost_basis', 20, 7).notNullable();
    
    // Holdings tracking
    table.decimal('current_holdings', 20, 7).notNullable();
    table.decimal('realized_gains', 20, 7).defaultTo(0);
    table.decimal('realized_losses', 20, 7).defaultTo(0);
    
    // Timestamps
    table.timestamp('last_updated').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('beneficiary_id');
    table.index('stellar_account');
    table.index(['asset_code', 'asset_issuer']);
    table.index('last_updated');
    
    // Unique constraint per beneficiary and asset
    table.unique(['beneficiary_id', 'asset_code', 'asset_issuer'], 'unique_cost_basis_record');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('cost_basis');
};
