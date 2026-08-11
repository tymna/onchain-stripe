// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @notice Per-environment deploy config, keyed by `block.chainid`.
/// @dev "Different chains" here = deploy *environments* (local / testnet / mainnet), NOT product
///      multi-chain. The app is Base-only; this just picks the right USDC + params per target.
contract HelperConfig is Script {
    error HelperConfig__UnsupportedChain(uint256 chainId);

    /// @dev usdc/feeRate/merchantFee are the real per-network values. owner/feeRecipient use the
    ///      convention `address(0) => the deployer`; set a treasury/multisig here for production.
    struct NetworkConfig {
        address usdc;
        address feeRecipient;
        address owner;
        uint256 feeRate;
        uint256 merchantFee;
    }

    // ---- CHAIN IDS ---- //
    uint256 constant BASE_MAINNET_CHAIN_ID = 8453;
    uint256 constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 constant ETH_SEPOLIA_CHAIN_ID = 11155111; // easier faucet; not the prod chain
    uint256 constant LOCAL_CHAIN_ID = 31337;

    // ---- NATIVE USDC (Circle-issued, not bridged USDbC) ---- //
    address constant BASE_MAINNET_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant ETH_SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    // ---- DEFAULT PROTOCOL PARAMS ---- //
    uint256 constant DEFAULT_FEE_RATE = 250; // 2.5% (cap is 10% = 1000 bps)
    uint256 constant DEFAULT_MERCHANT_FEE = 10e6; // 10 USDC to register

    /// @dev Cache so the mock USDC is deployed at most once per run (used by local + Base Sepolia).
    NetworkConfig private s_mockConfig;

    function getConfig() external returns (NetworkConfig memory) {
        return getConfigByChainId(block.chainid);
    }

    function getConfigByChainId(uint256 chainId) public returns (NetworkConfig memory) {
        if (chainId == BASE_MAINNET_CHAIN_ID) return _baseMainnetConfig();
        if (chainId == BASE_SEPOLIA_CHAIN_ID) return _baseSepoliaConfig();
        if (chainId == ETH_SEPOLIA_CHAIN_ID) return _ethSepoliaConfig();
        if (chainId == LOCAL_CHAIN_ID) return _getOrCreateMockConfig();
        revert HelperConfig__UnsupportedChain(chainId);
    }

    // ---- LIVE NETWORKS ---- //
    function _baseMainnetConfig() internal pure returns (NetworkConfig memory) {
        return NetworkConfig({
            usdc: BASE_MAINNET_USDC,
            feeRecipient: address(0), // => deployer
            owner: address(0), // => deployer
            feeRate: DEFAULT_FEE_RATE,
            merchantFee: DEFAULT_MERCHANT_FEE
        });
    }

    /// @dev Circle USDC lives at BASE_SEPOLIA_USDC, but the faucet is dry — deploy our own
    ///      open-mint MockUSDC so we can mint test funds and exercise subscribe/renew on-chain.
    ///      Swap back to BASE_SEPOLIA_USDC once a faucet is reachable.
    function _baseSepoliaConfig() internal returns (NetworkConfig memory) {
        return _getOrCreateMockConfig();
    }

    function _ethSepoliaConfig() internal pure returns (NetworkConfig memory) {
        return NetworkConfig({
            usdc: ETH_SEPOLIA_USDC,
            feeRecipient: address(0), // => deployer
            owner: address(0), // => deployer
            feeRate: DEFAULT_FEE_RATE,
            merchantFee: DEFAULT_MERCHANT_FEE
        });
    }

    // ---- MOCK USDC (local anvil + Base Sepolia while the faucet is dry) ---- //
    /// @dev No real USDC on a fresh anvil (and no Base Sepolia faucet right now), so deploy a
    ///      MockUSDC and point at it. (Against a forked anvil, prefer the real address instead.)
    function _getOrCreateMockConfig() internal returns (NetworkConfig memory) {
        if (s_mockConfig.usdc != address(0)) return s_mockConfig;

        vm.startBroadcast();
        MockUSDC mockUsdc = new MockUSDC();
        vm.stopBroadcast();

        s_mockConfig = NetworkConfig({
            usdc: address(mockUsdc),
            feeRecipient: address(0), // => deployer
            owner: address(0), // => deployer
            feeRate: DEFAULT_FEE_RATE,
            merchantFee: DEFAULT_MERCHANT_FEE
        });
        return s_mockConfig;
    }
}
