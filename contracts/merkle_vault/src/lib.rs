//! Merkle Tree-Based Vesting Airdrops (Issue #51)
//!
//! Single vault: admin commits one Merkle root; users claim streaming tokens
//! by providing a Merkle proof. No per-user vaults on-chain.

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    MerkleRoot,
    TotalAmount,
    StartTime,
    Duration,
    Cliff,
    ClaimedAmount(u32),
}

#[contract]
pub struct MerkleVault;

#[contractimpl]
impl MerkleVault {
    /// One-time init: set admin and token. Call before initialize_merkle_vault.
    pub fn init(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already_initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Initialize the Merkle vesting vault with a single root.
    /// Admin must have transferred total_amount to this contract beforehand.
    pub fn initialize_merkle_vault(
        env: Env,
        root_hash: BytesN<32>,
        total_amount: i128,
        duration: u64,
        cliff: u64,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin_not_set");
        admin.require_auth();

        let inst = env.storage().instance();
        if inst.has(&DataKey::MerkleRoot) {
            panic!("merkle_vault_already_initialized");
        }
        if total_amount <= 0 {
            panic!("total_amount_must_be_positive");
        }
        if duration == 0 {
            panic!("duration_must_be_nonzero");
        }
        if cliff > duration {
            panic!("cliff_cannot_exceed_duration");
        }

        let now = env.ledger().timestamp();
        inst.set(&DataKey::MerkleRoot, &root_hash);
        inst.set(&DataKey::TotalAmount, &total_amount);
        inst.set(&DataKey::Duration, &duration);
        inst.set(&DataKey::Cliff, &cliff);
        inst.set(&DataKey::StartTime, &now);
    }

    /// Claim vested tokens by providing a Merkle proof. Proof is verified
    /// against the stored root before any vesting calculation.
    pub fn claim_merkle(env: Env, proof: Vec<BytesN<32>>, index: u32, amount: i128) {
        let claimant = env.invoker();
        if amount <= 0 {
            panic!("amount_must_be_positive");
        }

        let inst = env.storage().instance();
        let root: BytesN<32> = inst
            .get(&DataKey::MerkleRoot)
            .expect("merkle_vault_not_initialized");
        let start_time: u64 = inst.get(&DataKey::StartTime).expect("start_time_missing");
        let duration: u64 = inst.get(&DataKey::Duration).expect("duration_missing");
        let cliff: u64 = inst.get(&DataKey::Cliff).expect("cliff_missing");
        let token: Address = inst.get(&DataKey::Token).expect("token_not_set");

        let leaf = build_leaf(&env, index, &claimant, amount);

        if !verify_merkle_proof(&env, &root, &leaf, &proof, index) {
            panic!("invalid_merkle_proof");
        }

        let now = env.ledger().timestamp();
        let vested = compute_vested(amount, now, start_time, duration, cliff);

        let key = DataKey::ClaimedAmount(index);
        let already_claimed: i128 = inst.get(&key).unwrap_or(0);

        if vested <= already_claimed {
            panic!("nothing_to_claim");
        }

        let claimable = vested - already_claimed;
        inst.set(&key, &vested);

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(
            &env.current_contract_address(),
            &claimant,
            &claimable,
        );
    }

    /// Read-only: get merkle root (for frontends/indexers).
    pub fn get_merkle_root(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::MerkleRoot)
            .expect("merkle_vault_not_initialized")
    }

    /// Read-only: get amount already claimed for an index.
    pub fn get_claimed(env: Env, index: u32) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::ClaimedAmount(index))
            .unwrap_or(0)
    }
}

fn build_leaf(env: &Env, index: u32, beneficiary: &Address, amount: i128) -> BytesN<32> {
    let payload = (index, beneficiary.clone(), amount);
    let bytes: Bytes = env.serialize(&payload);
    env.crypto().sha256(&bytes)
}

fn verify_merkle_proof(
    env: &Env,
    root: &BytesN<32>,
    leaf: &BytesN<32>,
    proof: &Vec<BytesN<32>>,
    index: u32,
) -> bool {
    let mut computed = leaf.clone();
    let mut idx = index;

    for p in proof.iter() {
        let payload = if idx % 2 == 0 {
            (computed.clone(), p.clone())
        } else {
            (p.clone(), computed.clone())
        };
        let bytes: Bytes = env.serialize(&payload);
        computed = env.crypto().sha256(&bytes);
        idx /= 2;
    }

    &computed == root
}

fn compute_vested(
    amount: i128,
    now: u64,
    start_time: u64,
    duration: u64,
    cliff: u64,
) -> i128 {
    let cliff_time = start_time.saturating_add(cliff);
    let end_time = start_time.saturating_add(duration);

    if now < cliff_time {
        return 0;
    }
    if now >= end_time {
        return amount;
    }

    let effective_start = cliff_time;
    let effective_duration = duration.saturating_sub(cliff);
    if effective_duration == 0 {
        return amount;
    }

    let elapsed = now.saturating_sub(effective_start) as i128;
    let eff_dur_i128 = effective_duration as i128;
    amount * elapsed / eff_dur_i128
}

#[cfg(test)]
mod test;
