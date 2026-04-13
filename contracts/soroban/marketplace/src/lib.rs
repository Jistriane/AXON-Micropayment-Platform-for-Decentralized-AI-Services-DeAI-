#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    NextModelId,
    Model(u64),
}

#[derive(Clone)]
#[contracttype]
pub struct AiModel {
    pub id: u64,
    pub provider: Address,
    pub name: String,
    pub endpoint: String,
    pub price_microunit: i128,
    pub active: bool,
}

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextModelId, &1_u64);
    }

    pub fn register_model(
        env: Env,
        provider: Address,
        name: String,
        endpoint: String,
        price_microunit: i128,
    ) -> u64 {
        if price_microunit <= 0 {
            panic!("invalid price");
        }

        provider.require_auth();

        let mut next_id = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::NextModelId)
            .unwrap_or(1_u64);

        let model = AiModel {
            id: next_id,
            provider: provider.clone(),
            name,
            endpoint,
            price_microunit,
            active: true,
        };

        env.storage().persistent().set(&DataKey::Model(next_id), &model);

        next_id += 1;
        env.storage().instance().set(&DataKey::NextModelId, &next_id);

        next_id - 1
    }

    pub fn set_model_active(env: Env, model_id: u64, active: bool) {
        let mut model = env
            .storage()
            .persistent()
            .get::<DataKey, AiModel>(&DataKey::Model(model_id))
            .unwrap_or_else(|| panic!("model not found"));

        model.provider.require_auth();
        model.active = active;

        env.storage().persistent().set(&DataKey::Model(model_id), &model);
    }

    pub fn get_model(env: Env, model_id: u64) -> AiModel {
        env.storage()
            .persistent()
            .get::<DataKey, AiModel>(&DataKey::Model(model_id))
            .unwrap_or_else(|| panic!("model not found"))
    }

    pub fn total_models(env: Env) -> u64 {
        let next_id = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::NextModelId)
            .unwrap_or(1_u64);

        next_id - 1
    }
}

