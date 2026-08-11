-include .env

.PHONY: help build test fmt abi anvil \
        simulate-local deploy-local \
        deploy-base-sepolia deploy-eth-sepolia deploy-base mint approve

# Deployer = a cast keystore account. BOTH --account and --sender are required:
# --account alone leaves msg.sender = forge's default sender, so `owner` deploys wrong.
ACCOUNT ?= dev
# Standard anvil dev key (public, test-only) for local broadcasts.
ANVIL_KEY ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

DEPLOY := forge script script/Deploy.s.sol:Deploy

help:
	@echo "build | test | fmt | abi | anvil"
	@echo "deploy-local | deploy-base-sepolia | deploy-eth-sepolia | deploy-base"
	@echo "mint | approve   (Base Sepolia; uses MOCK_USDC + MANAGER from .env)"

build:    ; forge build
test:     ; forge test
fmt:      ; forge fmt
abi:      ; forge inspect SubscriptionManager abi --json > abi/SubscriptionManager.json
anvil:    ; anvil

# ---- DEPLOY ---- #
# Dry-run against local anvil (no broadcast) — sanity-check the script.
simulate-local:
	$(DEPLOY) --rpc-url http://localhost:8545

deploy-local:
	$(DEPLOY) --rpc-url http://localhost:8545 --private-key $(ANVIL_KEY) --broadcast

# Base Sepolia: HelperConfig deploys a MockUSDC here (real faucet is dry). After deploy,
# set MANAGER + MOCK_USDC in .env, then `make mint` → `make approve` → register/subscribe.
deploy-base-sepolia:
	$(DEPLOY) --rpc-url $(BASE_SEPOLIA_RPC_URL) --account $(ACCOUNT) --sender $(SENDER) \
		--broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvv

deploy-eth-sepolia:
	$(DEPLOY) --rpc-url $(ETH_SEPOLIA_RPC_URL) --account $(ACCOUNT) --sender $(SENDER) \
		--broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvv

deploy-base:
	$(DEPLOY) --rpc-url $(BASE_MAINNET_RPC_URL) --account $(ACCOUNT) --sender $(SENDER) \
		--broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvv

# ---- INTERACT (Base Sepolia) ---- #
# Addresses default from .env (MOCK_USDC, MANAGER); amounts are 6-decimal (1000 USDC = 1000000000).
# Override any on the CLI, e.g. `make mint AMOUNT=5000000 TO=0x..`.
USDC     ?= $(MOCK_USDC)
TO       ?= $(SENDER)
SPENDER  ?= $(MANAGER)
AMOUNT   ?= 1000000000
MAX_UINT := 115792089237316195423570985008687907853269984665640564039457584007913129639935

# Mint test USDC to yourself from the open-mint MockUSDC.
mint:
	cast send $(USDC) "mint(address,uint256)" $(TO) $(AMOUNT) \
		--rpc-url $(BASE_SEPOLIA_RPC_URL) --account $(ACCOUNT)

# Approve the manager (SPENDER) to pull your USDC — max allowance, set-and-forget.
approve:
	cast send $(USDC) "approve(address,uint256)" $(SPENDER) $(MAX_UINT) \
		--rpc-url $(BASE_SEPOLIA_RPC_URL) --account $(ACCOUNT)
