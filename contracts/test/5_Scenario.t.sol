// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {BaseTest} from "./1_Base.t.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";
import {ISubscriptionManager} from "../src/ISubscriptionManager.sol";

/// @notice Integration suite — one multi-actor lifecycle exercising every function in sequence.
/// @dev The per-function suites prove each call in isolation; this proves they compose without state
///      drift. Two headline assertions thread through: the derived active-count (the dashboard's
///      "active subscribers" = !canceled && expiry > now) and "router holds nothing".
contract ScenarioTest is BaseTest {
    uint256 constant START = 1_700_000_000;

    // three plans across two merchants
    uint256 constant PRICE_A = 10e6;
    uint256 constant INT_A = 30 days; // monthly
    uint256 constant PRICE_B = 100e6;
    uint256 constant INT_B = 365 days; // yearly
    uint256 constant PRICE_C = 5e6;
    uint256 constant INT_C = 7 days; // weekly (other merchant)

    address carol = makeAddr("carol");

    uint256 private _totalPaid; // sum of every successful subscribe/renew, for the conservation check

    function setUp() public override {
        super.setUp();
        vm.warp(START);
    }

    // ---- HELPERS ---- //
    function _subId(address s, uint256 planId) internal pure returns (bytes32) {
        return keccak256(abi.encode(s, planId));
    }

    /// @dev Off-chain "is this sub active" rule — never stored on-chain, always derived.
    function _isActive(bytes32 id) internal view returns (bool) {
        SubscriptionManager.Subscription memory s = sm.getSubscription(id);
        return !s.canceled && s.expiryTimestamp > block.timestamp;
    }

    function _activeCount(bytes32[] memory ids) internal view returns (uint256 n) {
        for (uint256 i; i < ids.length; ++i) {
            if (_isActive(ids[i])) ++n;
        }
    }

    function _sub(address u, uint256 planId, uint256 periods) internal returns (bytes32 id) {
        uint256 amount = sm.getPlan(planId).price * periods;
        _fund(u, amount);
        vm.prank(u);
        sm.subscribe(planId, periods);
        _totalPaid += amount;
        id = _subId(u, planId);
    }

    function _renew(address u, bytes32 id, uint256 periods) internal {
        uint256 amount = sm.getPlan(sm.getSubscription(id).planId).price * periods;
        _fund(u, amount);
        vm.prank(u);
        sm.renew(id, periods);
        _totalPaid += amount;
    }

    function _assertRouterEmpty() internal view {
        assertEq(usdc.balanceOf(address(sm)), 0, "router holds nothing");
    }

    // ---- THE LIFECYCLE ---- //
    function test_scenario_fullLifecycle() public {
        // --- onboarding: two merchants pay to register --- //
        _registerMerchant(merchant);
        _registerMerchant(merchant2);
        assertEq(usdc.balanceOf(feeRecipient), 2 * MERCHANT_FEE, "two registration fees collected");
        _assertRouterEmpty();

        uint256 planA = _createPlan(merchant, PRICE_A, INT_A);
        uint256 planB = _createPlan(merchant, PRICE_B, INT_B);
        uint256 planC = _createPlan(merchant2, PRICE_C, INT_C);
        assertEq(sm.getPlan(planC).merchant, merchant2, "cross-merchant isolation: planC is merchant2's");

        // --- sign-ups --- //
        bytes32 aliceA = _sub(alice, planA, 1); // expires START + 30d
        bytes32 bobA = _sub(bob, planA, 3); //   expires START + 90d
        bytes32 bobC = _sub(bob, planC, 2); //   expires START + 14d
        bytes32 carolB = _sub(carol, planB, 1); // expires START + 365d

        bytes32[] memory all = new bytes32[](4);
        all[0] = aliceA;
        all[1] = bobA;
        all[2] = bobC;
        all[3] = carolB;

        assertEq(_activeCount(all), 4, "4 active after sign-ups");
        _assertRouterEmpty();

        // --- alice renews early: stacks on the unused tail --- //
        uint256 aliceExpiry0 = sm.getSubscription(aliceA).expiryTimestamp; // START + 30d
        _renew(alice, aliceA, 1);
        assertEq(sm.getSubscription(aliceA).expiryTimestamp, aliceExpiry0 + INT_A, "early renew: +1 interval");

        // --- time passes: the weekly lapses silently, the rest hold --- //
        vm.warp(START + 20 days); // bobC (14d) lapsed; aliceA(60d), bobA(90d), carolB(365d) still active
        assertFalse(_isActive(bobC), "weekly lapsed (no event fired)");
        assertEq(_activeCount(all), 3, "3 active after a silent lapse");

        // --- bob's weekly lapsed; he brings it back with renew (subscribe now rejects the existing slot) --- //
        _renew(bob, bobC, 2);
        assertTrue(_isActive(bobC), "weekly active again");
        assertEq(
            sm.getSubscription(bobC).expiryTimestamp,
            (START + 20 days) + 2 * INT_C,
            "renew dates from now after a lapse"
        );
        assertEq(_activeCount(all), 4, "back to 4");

        // --- alice cancels, then renew resurrects the cancelled-but-unexpired sub --- //
        vm.prank(alice);
        sm.cancel(aliceA);
        assertFalse(_isActive(aliceA), "cancelled => inactive");
        assertEq(_activeCount(all), 3, "3 after cancel");

        _renew(alice, aliceA, 1);
        assertTrue(_isActive(aliceA), "renew reactivates");
        assertEq(_activeCount(all), 4, "4 after reactivation");

        // --- merchant disables planA: existing subs honored, new subscribe + renew blocked --- //
        vm.prank(merchant);
        sm.setPlanActive(planA, false);
        assertTrue(_isActive(bobA), "existing sub honored to expiry on a disabled plan");

        _fund(alice, PRICE_A);
        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.PlanInactive.selector);
        sm.renew(aliceA, 1);

        address newUser = makeAddr("newUser");
        _fund(newUser, PRICE_A);
        vm.prank(newUser);
        vm.expectRevert(ISubscriptionManager.PlanInactive.selector);
        sm.subscribe(planA, 1);

        // failed calls moved no money
        assertEq(usdc.balanceOf(alice), PRICE_A, "blocked renew left alice's funds untouched");
        assertEq(usdc.balanceOf(newUser), PRICE_A, "blocked subscribe left newUser's funds untouched");

        // --- final reconciliation: nothing stuck, every paid token routed --- //
        _assertRouterEmpty();
        assertEq(
            usdc.balanceOf(merchant) + usdc.balanceOf(merchant2) + usdc.balanceOf(feeRecipient),
            _totalPaid + 2 * MERCHANT_FEE,
            "conservation: merchants + fees == everything paid in"
        );
    }
}
