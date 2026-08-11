// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";

import {BaseTest} from "./1_Base.t.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";
import {ISubscriptionManager} from "../src/ISubscriptionManager.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice Merchant suite — registerMerchant, createPlan, updatePlan, setPlanActive.
/// @dev No reentrancy tests: USDC/mock have no transfer callback and the plan functions
///      make no external call, so there is no reentrancy surface to exercise.
contract MerchantTest is BaseTest {
    // ---- registerMerchant ---- //
    function test_registerMerchant_setsFlagMovesFeeAndEmits() public {
        uint256 fee = sm.getMerchantFee();
        _fund(merchant, fee); // mint exactly the fee + approve

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.MerchantAdded(merchant, fee);

        vm.prank(merchant);
        sm.registerMerchant();

        assertTrue(sm.isMerchant(merchant), "isMerchant");
        assertEq(usdc.balanceOf(merchant), 0, "merchant paid the fee");
        assertEq(usdc.balanceOf(feeRecipient), fee, "feeRecipient received the fee");
    }

    function test_registerMerchant_RevertWhen_AlreadyMerchant() public {
        uint256 fee = sm.getMerchantFee();
        _registerMerchant(merchant); // first registration (funds + pays the fee)

        _fund(merchant, fee); // top up so a second attempt *could* pay if the guard were missing

        vm.prank(merchant);
        vm.expectRevert(ISubscriptionManager.AlreadyMerchant.selector);
        sm.registerMerchant();

        assertEq(usdc.balanceOf(feeRecipient), fee, "feeRecipient charged exactly once");
    }

    /// @dev A1: the fee pull fails → must revert AND not leave the caller a merchant (CEI rollback).
    function test_registerMerchant_failedPay_leavesNotMerchant() public {
        _mint(bob, sm.getMerchantFee()); // funded but never approved → the pull fails

        vm.prank(bob);
        vm.expectRevert(SafeTransferLib.TransferFromFailed.selector);
        sm.registerMerchant();

        assertFalse(sm.isMerchant(bob), "not a merchant after a failed pay");
    }

    function test_registerMerchant_withZeroFee_needsNoFunds() public {
        vm.prank(owner);
        sm.setMerchantFee(0);

        // bob has no USDC and no approval — a 0-value pull still succeeds
        vm.prank(bob);
        sm.registerMerchant();

        assertTrue(sm.isMerchant(bob), "registered for free");
        assertEq(usdc.balanceOf(feeRecipient), 0, "no fee moved");
    }

    // ---- createPlan ---- //
    function test_createPlan_storesPlanAndEmits() public {
        _registerMerchant(merchant);

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.PlanCreated(merchant, 1, "Pro", PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(merchant);
        sm.createPlan("Pro", PLAN_PRICE, PLAN_INTERVAL);

        SubscriptionManager.Plan memory plan = sm.getPlan(1);
        assertEq(plan.merchant, merchant, "merchant");
        assertEq(plan.price, PLAN_PRICE, "price");
        assertEq(plan.interval, PLAN_INTERVAL, "interval");
        assertTrue(plan.active, "active");
        assertEq(sm.getCurrentPlanId(), 1, "currentPlanId");
    }

    /// @dev Ids are a single global counter — interleaved merchants never collide, each owns its own.
    function test_createPlan_assignsSequentialIdsAcrossMerchants() public {
        _registerMerchant(merchant);
        _registerMerchant(merchant2);

        uint256 id1 = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);
        uint256 id2 = _createPlan(merchant2, PLAN_PRICE, PLAN_INTERVAL);
        uint256 id3 = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(sm.getPlan(id2).merchant, merchant2, "id2 belongs to merchant2");
        assertEq(sm.getCurrentPlanId(), 3);
    }

    function test_createPlan_RevertWhen_NotMerchant() public {
        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.NotMerchant.selector);
        sm.createPlan("X", PLAN_PRICE, PLAN_INTERVAL);
    }

    function test_createPlan_RevertWhen_ZeroPrice() public {
        _registerMerchant(merchant);
        vm.prank(merchant);
        vm.expectRevert(ISubscriptionManager.ZeroPrice.selector);
        sm.createPlan("X", 0, PLAN_INTERVAL);
    }

    function test_createPlan_RevertWhen_ZeroInterval() public {
        _registerMerchant(merchant);
        vm.prank(merchant);
        vm.expectRevert(ISubscriptionManager.ZeroInterval.selector);
        sm.createPlan("X", PLAN_PRICE, 0);
    }

    function testFuzz_createPlan_roundTrip(uint256 price, uint256 interval) public {
        price = bound(price, 1, type(uint256).max);
        interval = bound(interval, 1, type(uint256).max);
        _registerMerchant(merchant);

        vm.prank(merchant);
        sm.createPlan("F", price, interval);

        SubscriptionManager.Plan memory plan = sm.getPlan(1);
        assertEq(plan.price, price, "price round-trips");
        assertEq(plan.interval, interval, "interval round-trips");
        assertTrue(plan.active, "active");
    }

    // ---- updatePlan ---- //
    function test_updatePlan_changesPriceIntervalKeepsRest() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        uint256 newPrice = 25e6;
        uint256 newInterval = 7 days;

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.PlanUpdated(merchant, planId, newPrice, newInterval);

        vm.prank(merchant);
        sm.updatePlan(planId, newPrice, newInterval);

        SubscriptionManager.Plan memory plan = sm.getPlan(planId);
        assertEq(plan.price, newPrice, "price");
        assertEq(plan.interval, newInterval, "interval");
        assertEq(plan.merchant, merchant, "merchant unchanged"); // A5: no ownership hijack
        assertTrue(plan.active, "active unchanged");
    }

    /// @dev A4: updatePlan must not silently re-enable a disabled plan (only setPlanActive can).
    function test_updatePlan_cannotReenableDisabledPlan() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(merchant);
        sm.setPlanActive(planId, false);

        vm.prank(merchant);
        sm.updatePlan(planId, 99e6, 1 days);

        assertFalse(sm.getPlan(planId).active, "update must not re-enable");
    }

    function test_updatePlan_RevertWhen_NotMerchant() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(alice); // not a merchant at all → fails the onlyMerchant gate first
        vm.expectRevert(ISubscriptionManager.NotMerchant.selector);
        sm.updatePlan(planId, PLAN_PRICE, PLAN_INTERVAL);
    }

    /// @dev A3: a legit, registered competitor cannot edit a plan it does not own.
    function test_updatePlan_RevertWhen_NotPlanOwner() public {
        _registerMerchant(merchant);
        _registerMerchant(merchant2);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(merchant2);
        vm.expectRevert(ISubscriptionManager.NotPlanOwner.selector);
        sm.updatePlan(planId, PLAN_PRICE, PLAN_INTERVAL);
    }

    function test_updatePlan_RevertWhen_PlanNotFound() public {
        _registerMerchant(merchant);
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.PlanNotFound.selector, 999));
        sm.updatePlan(999, PLAN_PRICE, PLAN_INTERVAL);
    }

    /// @dev A6: probing the zero/default slot resolves to an empty plan, not id 1.
    function test_updatePlan_RevertWhen_PlanIdZero() public {
        _registerMerchant(merchant);
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.PlanNotFound.selector, 0));
        sm.updatePlan(0, PLAN_PRICE, PLAN_INTERVAL);
    }

    function test_updatePlan_RevertWhen_ZeroPrice() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);
        vm.prank(merchant);
        vm.expectRevert(ISubscriptionManager.ZeroPrice.selector);
        sm.updatePlan(planId, 0, PLAN_INTERVAL);
    }

    function test_updatePlan_RevertWhen_ZeroInterval() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);
        vm.prank(merchant);
        vm.expectRevert(ISubscriptionManager.ZeroInterval.selector);
        sm.updatePlan(planId, PLAN_PRICE, 0);
    }

    // ---- setPlanActive ---- //
    function test_setPlanActive_disablesAndEmits() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.PlanStatusChanged(merchant, planId, false);

        vm.prank(merchant);
        sm.setPlanActive(planId, false);

        assertFalse(sm.getPlan(planId).active);
    }

    function test_setPlanActive_reEnablesAndEmits() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(merchant);
        sm.setPlanActive(planId, false);

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.PlanStatusChanged(merchant, planId, true);

        vm.prank(merchant);
        sm.setPlanActive(planId, true);

        assertTrue(sm.getPlan(planId).active);
    }

    /// @dev Setting the status it already has is a no-op: early return, no event for the indexer.
    function test_setPlanActive_noOpWhenUnchanged_emitsNothing() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.recordLogs();
        vm.prank(merchant);
        sm.setPlanActive(planId, true); // already active

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0, "no-op must emit nothing");
        assertTrue(sm.getPlan(planId).active, "still active");
    }

    function test_setPlanActive_RevertWhen_NotMerchant() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.NotMerchant.selector);
        sm.setPlanActive(planId, false);
    }

    /// @dev A3: griefing — a competitor cannot disable someone else's plan.
    function test_setPlanActive_RevertWhen_CompetitorTriesToDisable() public {
        _registerMerchant(merchant);
        _registerMerchant(merchant2);
        uint256 planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);

        vm.prank(merchant2);
        vm.expectRevert(ISubscriptionManager.NotPlanOwner.selector);
        sm.setPlanActive(planId, false);

        assertTrue(sm.getPlan(planId).active, "plan stays active");
    }

    function test_setPlanActive_RevertWhen_PlanNotFound() public {
        _registerMerchant(merchant);
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.PlanNotFound.selector, 999));
        sm.setPlanActive(999, false);
    }
}
