// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";

/// @notice Deploys SubscriptionManager to whatever network the script is pointed at.
/// @dev Picks USDC + params from HelperConfig by chainid. `owner`/`feeRecipient` default to the
///      deployer (the --sender / --account running the script). Run with an explicit sender:
///        local:   forge script script/Deploy.s.sol
///        sepolia: forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --account <name> --broadcast --verify
contract Deploy is Script {
    function run() external returns (SubscriptionManager sm, HelperConfig helperConfig) {
        helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        // address(0) in config => use the deployer
        address owner = cfg.owner == address(0) ? msg.sender : cfg.owner;
        address feeRecipient = cfg.feeRecipient == address(0) ? msg.sender : cfg.feeRecipient;

        vm.startBroadcast();
        sm = new SubscriptionManager(owner, cfg.usdc, feeRecipient, cfg.feeRate, cfg.merchantFee);
        vm.stopBroadcast();

        console2.log("SubscriptionManager :", address(sm));
        console2.log("owner               :", owner);
        console2.log("usdc                :", cfg.usdc);
        console2.log("feeRecipient        :", feeRecipient);
        console2.log("feeRate (bps)       :", cfg.feeRate);
        console2.log("merchantFee         :", cfg.merchantFee);
    }
}
