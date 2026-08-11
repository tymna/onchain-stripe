// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {SubscriptionManager} from "../src/SubscriptionManager.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Shared deploy + funding harness for the Protocol / Merchant / User suites.
/// @dev `abstract` so forge never runs this as a suite on its own; child suites inherit it.
abstract contract BaseTest is Test {
    // ---- SYSTEM UNDER TEST ---- //
    SubscriptionManager internal sm;
    MockUSDC internal usdc;

    // ---- ACTORS ---- //
    address internal owner = makeAddr("owner");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal merchant = makeAddr("merchant");
    address internal merchant2 = makeAddr("merchant2"); // cross-merchant auth (NotPlanOwner)
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob"); // second user for sub-ownership auth

    // ---- DEFAULT DEPLOY CONFIG ---- //
    uint256 internal constant FEE_RATE = 250; // 2.5% protocol fee (bps)
    uint256 internal constant MERCHANT_FEE = 10e6; // 10 USDC to register as merchant

    // ---- DEFAULT PLAN CONFIG ---- //
    uint256 internal constant PLAN_PRICE = 10e6; // 10 USDC per interval
    uint256 internal constant PLAN_INTERVAL = 30 days;

    function setUp() public virtual {
        usdc = new MockUSDC();
        sm = new SubscriptionManager(owner, address(usdc), feeRecipient, FEE_RATE, MERCHANT_FEE);
    }

    // ---- HELPERS ---- //

    /// @dev Mint USDC to `account` and pre-approve the manager to pull it — the happy path.
    function _fund(address account, uint256 amount) internal {
        usdc.mint(account, amount);
        vm.prank(account);
        usdc.approve(address(sm), type(uint256).max);
    }

    /// @dev Mint only, no approval — for exercising the missing/insufficient-allowance revert.
    function _mint(address account, uint256 amount) internal {
        usdc.mint(account, amount);
    }

    /// @dev Fund `account` the current merchant fee, approve, and register it as a merchant.
    function _registerMerchant(address account) internal {
        _fund(account, sm.getMerchantFee());
        vm.prank(account);
        sm.registerMerchant();
    }

    /// @dev Create a plan as an already-registered `account`; returns the freshly assigned planId.
    function _createPlan(address account, uint256 price, uint256 interval) internal returns (uint256 planId) {
        vm.prank(account);
        sm.createPlan("plan", price, interval);
        planId = sm.getCurrentPlanId();
    }
}
