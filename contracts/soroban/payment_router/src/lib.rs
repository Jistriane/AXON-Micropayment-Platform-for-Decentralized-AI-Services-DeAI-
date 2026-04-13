#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    FeeBps,
}

#[derive(Clone)]
#[contracttype]
pub struct Settlement {
    pub consumer: Address,
    pub provider: Address,
    pub gross_amount: i128,
    pub platform_fee: i128,
    pub provider_amount: i128,
    pub payment_ref: String,
}

#[contract]
pub struct PaymentRouterContract;

#[contractimpl]
impl PaymentRouterContract {
    pub fn init(env: Env, admin: Address, fee_bps: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        if fee_bps > 10_000 {
            panic!("invalid fee bps");
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    pub fn set_fee_bps(env: Env, new_fee_bps: u32) {
        if new_fee_bps > 10_000 {
            panic!("invalid fee bps");
        }

        let admin = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Admin)
            .unwrap_or_else(|| panic!("not initialized"));

        admin.require_auth();
        env.storage().instance().set(&DataKey::FeeBps, &new_fee_bps);
    }

    pub fn quote_split(env: Env, gross_amount: i128) -> (i128, i128) {
        if gross_amount <= 0 {
            panic!("invalid amount");
        }

        let fee_bps = env
            .storage()
            .instance()
            .get::<DataKey, u32>(&DataKey::FeeBps)
            .unwrap_or(0_u32);

        let platform_fee = gross_amount * fee_bps as i128 / 10_000;
        let provider_amount = gross_amount - platform_fee;

        (platform_fee, provider_amount)
    }

    pub fn settle(
        env: Env,
        consumer: Address,
        provider: Address,
        gross_amount: i128,
        payment_ref: String,
    ) -> Settlement {
        consumer.require_auth();

        let (platform_fee, provider_amount) = Self::quote_split(env, gross_amount);

        Settlement {
            consumer,
            provider,
            gross_amount,
            platform_fee,
            provider_amount,
            payment_ref,
        }
    }
}

