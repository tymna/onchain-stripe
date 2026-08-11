// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {BaseTest} from "./1_Base.t.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";
import {ISubscriptionManager} from "../src/ISubscriptionManager.sol";
import {Ownable} from "solady/auth/Ownable.sol";

/// @notice Protocol suite — constructor, initial state, and the three onlyOwner setters.
/// @dev Self-contained: no merchant/plan/sub setup needed. Every setter call is vm.prank(owner).
contract ProtocolTest is BaseTest {
    // ---- INITIAL STATE ---- //
    function test_initialState_gettersReturnDeployConfig() public view {
        assertEq(sm.owner(), owner, "owner");
        assertEq(sm.getUsdc(), address(usdc), "usdc");
        assertEq(sm.getFeeRecipient(), feeRecipient, "feeRecipient");
        assertEq(sm.getFeeRate(), FEE_RATE, "feeRate");
        assertEq(sm.getMerchantFee(), MERCHANT_FEE, "merchantFee");
        assertEq(sm.getCurrentPlanId(), 0, "currentPlanId");
        assertEq(sm.getBps(), 10_000, "bps");
        assertEq(sm.getMaxFeeBps(), 1_000, "maxFeeBps");
        assertFalse(sm.isMerchant(alice), "isMerchant defaults false");
    }

    // ---- setFeeRate ---- //
    function test_setFeeRate_updatesRateAndEmits() public {
        uint256 newRate = 500;

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.FeeRateSet(newRate);

        vm.prank(owner);
        sm.setFeeRate(newRate);

        assertEq(sm.getFeeRate(), newRate);
    }

    function test_setFeeRate_atMaxBoundary() public {
        uint256 max = sm.getMaxFeeBps();

        vm.prank(owner);
        sm.setFeeRate(max);

        assertEq(sm.getFeeRate(), max);
    }

    function test_setFeeRate_RevertWhen_AboveMax() public {
        uint256 max = sm.getMaxFeeBps();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.FeeTooHigh.selector, max + 1, max));
        sm.setFeeRate(max + 1);
    }

    function test_setFeeRate_RevertWhen_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(Ownable.Unauthorized.selector);
        sm.setFeeRate(100);
    }

    // ---- setMerchantFee ---- //
    function test_setMerchantFee_updatesAndEmits() public {
        uint256 newFee = 25e6;

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.MerchantFeeSet(newFee);

        vm.prank(owner);
        sm.setMerchantFee(newFee);

        assertEq(sm.getMerchantFee(), newFee);
    }

    function test_setMerchantFee_toZero() public {
        // no bound on merchantFee — free registration is a valid config
        vm.prank(owner);
        sm.setMerchantFee(0);

        assertEq(sm.getMerchantFee(), 0);
    }

    function test_setMerchantFee_RevertWhen_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(Ownable.Unauthorized.selector);
        sm.setMerchantFee(1);
    }

    // ---- setFeeRecipient ---- //
    function test_setFeeRecipient_updatesAndEmits() public {
        address newRecipient = makeAddr("newRecipient");

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.FeeRecipientSet(newRecipient);

        vm.prank(owner);
        sm.setFeeRecipient(newRecipient);

        assertEq(sm.getFeeRecipient(), newRecipient);
    }

    function test_setFeeRecipient_RevertWhen_Zero() public {
        vm.prank(owner);
        vm.expectRevert(ISubscriptionManager.ZeroAddress.selector);
        sm.setFeeRecipient(address(0));
    }

    function test_setFeeRecipient_RevertWhen_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(Ownable.Unauthorized.selector);
        sm.setFeeRecipient(makeAddr("x"));
    }

    // ---- CONSTRUCTOR (deploy fresh instances) ---- //
    function test_constructor_RevertWhen_OwnerZero() public {
        vm.expectRevert(ISubscriptionManager.ZeroAddress.selector);
        new SubscriptionManager(address(0), address(usdc), feeRecipient, FEE_RATE, MERCHANT_FEE);
    }

    function test_constructor_RevertWhen_UsdcZero() public {
        vm.expectRevert(ISubscriptionManager.ZeroAddress.selector);
        new SubscriptionManager(owner, address(0), feeRecipient, FEE_RATE, MERCHANT_FEE);
    }

    function test_constructor_RevertWhen_FeeRecipientZero() public {
        vm.expectRevert(ISubscriptionManager.ZeroAddress.selector);
        new SubscriptionManager(owner, address(usdc), address(0), FEE_RATE, MERCHANT_FEE);
    }

    function test_constructor_RevertWhen_FeeAboveMax() public {
        uint256 max = sm.getMaxFeeBps();

        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.FeeTooHigh.selector, max + 1, max));
        new SubscriptionManager(owner, address(usdc), feeRecipient, max + 1, MERCHANT_FEE);
    }

    function test_constructor_atMaxFeeBoundary() public {
        uint256 max = sm.getMaxFeeBps();

        SubscriptionManager m = new SubscriptionManager(owner, address(usdc), feeRecipient, max, MERCHANT_FEE);

        assertEq(m.getFeeRate(), max);
    }
}
