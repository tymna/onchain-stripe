// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {stdError} from "forge-std/StdError.sol";

import {BaseTest} from "./1_Base.t.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";
import {ISubscriptionManager} from "../src/ISubscriptionManager.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice User suite — subscribe / renew / cancel.
/// @dev The contract is a payment router: every token paid in leaves the same tx, so almost every
///      test ends by asserting `balanceOf(sm) == 0`. The stateful proof of that lives in
///      `UserInvariantTest` at the bottom of this file.
contract UserTest is BaseTest {
    uint256 internal constant BPS = 10_000; // mirror SubscriptionManager.BPS for the split math
    uint256 internal constant START = 1_700_000_000; // fixed epoch so warps read as real time, not `1`

    function setUp() public override {
        super.setUp();
        vm.warp(START);
    }

    // ---- LOCAL HELPERS ---- //

    /// @dev Off-chain mirror of the contract's `keccak256(abi.encode(subscriber, planId))` subId.
    function _subId(address subscriber, uint256 planId) internal pure returns (bytes32) {
        return keccak256(abi.encode(subscriber, planId));
    }

    /// @dev The split the contract performs: merchant gets the floor, the fee absorbs the remainder.
    function _split(uint256 amount, uint256 feeRate) internal pure returns (uint256 merchantAmount, uint256 fee) {
        merchantAmount = amount * (BPS - feeRate) / BPS;
        fee = amount - merchantAmount;
    }

    /// @dev Register `merchant` and create the default plan; returns its id.
    function _setupPlan() internal returns (uint256 planId) {
        _registerMerchant(merchant);
        planId = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);
    }

    /// @dev Fund `user` the exact cost, then subscribe; returns the (deterministic) subId.
    function _subscribe(address user, uint256 planId, uint256 periods) internal returns (bytes32 subId) {
        _fund(user, sm.getPlan(planId).price * periods);
        vm.prank(user);
        sm.subscribe(planId, periods);
        subId = _subId(user, planId);
    }

    // ---- subscribe: happy path ---- //
    function test_subscribe_storesSubAndEmits() public {
        uint256 planId = _setupPlan();
        uint256 periods = 3;
        uint256 amount = PLAN_PRICE * periods;
        uint256 expectedExpiry = START + periods * PLAN_INTERVAL;
        bytes32 subId = _subId(alice, planId);

        _fund(alice, amount);

        vm.expectEmit(address(sm)); // pin the emitter: USDC Transfer logs share this tx
        emit ISubscriptionManager.Subscribed(alice, subId, planId, amount, expectedExpiry);

        vm.prank(alice);
        sm.subscribe(planId, periods);

        SubscriptionManager.Subscription memory sub = sm.getSubscription(subId);
        assertEq(sub.subscriber, alice, "subscriber");
        assertEq(sub.planId, planId, "planId");
        assertEq(sub.expiryTimestamp, expectedExpiry, "expiry = now + periods*interval");
        assertFalse(sub.canceled, "active");
    }

    function test_subscribe_splitsFundsAndHoldsNothing() public {
        uint256 planId = _setupPlan();
        uint256 periods = 2;
        uint256 amount = PLAN_PRICE * periods;
        (uint256 merchantAmount, uint256 fee) = _split(amount, FEE_RATE);

        _fund(alice, amount);
        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient); // already holds the merchant reg fee

        vm.prank(alice);
        sm.subscribe(planId, periods);

        assertEq(usdc.balanceOf(merchant), merchantAmount, "merchant gets amount - fee");
        assertEq(usdc.balanceOf(feeRecipient) - feeRecipientBefore, fee, "feeRecipient gets fee");
        assertEq(usdc.balanceOf(alice), 0, "payer fully debited");
        assertEq(usdc.balanceOf(address(sm)), 0, "router holds nothing");
    }

    /// @dev Rounding favors the protocol: 1 unit at a positive fee → merchant 0, fee 1. Never any dust left over.
    function test_subscribe_dustRounding_feeAbsorbsRemainder() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, 1, PLAN_INTERVAL); // price = 1 micro-USDC

        _fund(alice, 1);
        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        vm.prank(alice);
        sm.subscribe(planId, 1);

        assertEq(usdc.balanceOf(merchant), 0, "merchant rounds to zero");
        assertEq(usdc.balanceOf(feeRecipient) - feeRecipientBefore, 1, "fee absorbs the unit");
        assertEq(usdc.balanceOf(address(sm)), 0, "router holds nothing");
    }

    function test_subscribe_multipleUsers_distinctActiveSubs() public {
        uint256 planId = _setupPlan();
        bytes32 aliceSub = _subscribe(alice, planId, 1);
        bytes32 bobSub = _subscribe(bob, planId, 1);

        assertTrue(aliceSub != bobSub, "distinct subscribers => distinct subIds");
        assertEq(sm.getSubscription(aliceSub).subscriber, alice, "alice's slot");
        assertEq(sm.getSubscription(bobSub).subscriber, bob, "bob's slot");
    }

    /// @dev Bounded to the real-money range: an unbounded fuzzer would just hit the overflow corner.
    ///      Pins the split, conservation, expiry, and the zero-balance guarantee in one shot.
    function testFuzz_subscribe_splitsAccountsAndExpiry(uint256 price, uint256 periods, uint256 feeRate) public {
        price = bound(price, 1, 1e12); // up to ~$1M priced in 6-decimal USDC
        periods = bound(periods, 1, 1000);
        feeRate = bound(feeRate, 0, sm.getMaxFeeBps());

        vm.prank(owner);
        sm.setFeeRate(feeRate);

        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, price, PLAN_INTERVAL);

        uint256 amount = price * periods;
        (uint256 merchantAmount, uint256 fee) = _split(amount, feeRate);

        _fund(alice, amount);
        uint256 merchantBefore = usdc.balanceOf(merchant);
        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        vm.prank(alice);
        sm.subscribe(planId, periods);

        bytes32 subId = _subId(alice, planId);
        SubscriptionManager.Subscription memory sub = sm.getSubscription(subId);

        assertEq(usdc.balanceOf(merchant) - merchantBefore, merchantAmount, "merchant leg");
        assertEq(usdc.balanceOf(feeRecipient) - feeRecipientBefore, fee, "fee leg");
        assertEq(merchantAmount + fee, amount, "conservation: nothing created or destroyed");
        assertEq(usdc.balanceOf(alice), 0, "payer fully debited");
        assertEq(usdc.balanceOf(address(sm)), 0, "router holds nothing");
        assertEq(sub.expiryTimestamp, START + periods * PLAN_INTERVAL, "expiry");
        assertFalse(sub.canceled, "active");
    }

    // ---- subscribe: reverts ---- //
    function test_subscribe_RevertWhen_ZeroPeriods() public {
        uint256 planId = _setupPlan();
        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.ZeroPeriods.selector);
        sm.subscribe(planId, 0);
    }

    function test_subscribe_RevertWhen_PlanNotFound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.PlanNotFound.selector, 999));
        sm.subscribe(999, 1);
    }

    function test_subscribe_RevertWhen_PlanInactive() public {
        uint256 planId = _setupPlan();
        vm.prank(merchant);
        sm.setPlanActive(planId, false);

        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.PlanInactive.selector);
        sm.subscribe(planId, 1);
    }

    function test_subscribe_RevertWhen_AlreadyExists() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        // subscribe is create-once: the slot exists, so a second subscribe reverts — extending is
        // renew's job. Checked before any transfer, so no extra funding is needed.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.SubscriptionExists.selector, subId));
        sm.subscribe(planId, 1);
    }

    /// @dev Funded enough for the fee leg but not the merchant leg → the second transfer reverts the
    ///      whole tx. Proves the two transfers are atomic: a short payer can't half-pay.
    function test_subscribe_RevertWhen_InsufficientBalance() public {
        uint256 planId = _setupPlan();
        uint256 amount = PLAN_PRICE;

        usdc.mint(alice, amount - 1);
        vm.prank(alice);
        usdc.approve(address(sm), type(uint256).max);

        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        vm.prank(alice);
        vm.expectRevert(SafeTransferLib.TransferFromFailed.selector);
        sm.subscribe(planId, 1);

        assertEq(usdc.balanceOf(feeRecipient), feeRecipientBefore, "fee leg rolled back");
        assertEq(usdc.balanceOf(alice), amount - 1, "payer untouched");
    }

    function test_subscribe_RevertWhen_NoAllowance() public {
        uint256 planId = _setupPlan();
        _mint(alice, PLAN_PRICE); // funded, never approved

        vm.prank(alice);
        vm.expectRevert(SafeTransferLib.TransferFromFailed.selector);
        sm.subscribe(planId, 1);
    }

    /// @dev `price * periods` overflows uint256. 0.8.x checked math reverts (Panic 0x11) — it does
    ///      not wrap, so absurd input fails cleanly instead of corrupting the amount.
    function test_subscribe_RevertWhen_AmountOverflows() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, type(uint256).max, PLAN_INTERVAL);

        vm.prank(alice);
        vm.expectRevert(stdError.arithmeticError);
        sm.subscribe(planId, 2);
    }

    /// @dev The amount itself fits, but `amount * (BPS - feeRate)` inside _charge overflows — the
    ///      most overflow-prone multiplication, since it scales an already-large amount by up to BPS.
    function test_subscribe_RevertWhen_ChargeOverflows() public {
        _registerMerchant(merchant);
        uint256 planId = _createPlan(merchant, type(uint256).max / 2, PLAN_INTERVAL);

        vm.prank(alice);
        vm.expectRevert(stdError.arithmeticError);
        sm.subscribe(planId, 1);
    }

    // ---- subscribe: rejects an existing slot ---- //

    /// @dev Existence — not active-ness — gates subscribe now: even a fully lapsed slot rejects a second
    ///      subscribe. Bringing a lapsed sub back is renew's job (see test_renew_extendsFromNow_whenLate).
    function test_subscribe_RevertWhen_ExistsAfterLapse() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        vm.warp(expiry + 1); // lapsed, but the slot still exists
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.SubscriptionExists.selector, subId));
        sm.subscribe(planId, 1);
    }

    /// @dev A cancelled slot still exists, so subscribe rejects it too — reviving it is renew's job
    ///      (see test_renew_reactivatesCancelledSub).
    function test_subscribe_RevertWhen_ExistsAfterCancel() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        vm.prank(alice);
        sm.cancel(subId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.SubscriptionExists.selector, subId));
        sm.subscribe(planId, 1);
    }

    function test_subId_deterministicAcrossRenew() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        // cancel, then renew (the way back) — the slot's key is unchanged.
        vm.prank(alice);
        sm.cancel(subId);
        _fund(alice, PLAN_PRICE);
        vm.prank(alice);
        sm.renew(subId, 1);

        assertEq(subId, _subId(alice, planId), "subId = keccak(subscriber, planId), stable");
        assertFalse(sm.getSubscription(subId).canceled, "renew brought the same slot back");
    }

    // ---- renew: timing ---- //

    /// @dev Early renew stacks on the unused tail: max(oldExpiry, now) = oldExpiry.
    function test_renew_extendsFromExpiry_whenEarly() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        vm.warp(START + PLAN_INTERVAL / 2); // before expiry
        _fund(alice, PLAN_PRICE);
        vm.prank(alice);
        sm.renew(subId, 1);

        assertEq(sm.getSubscription(subId).expiryTimestamp, expiry + PLAN_INTERVAL, "extends from old expiry");
    }

    /// @dev Late renew must not back-date: max(oldExpiry, now) = now, so no past/partial period is granted.
    function test_renew_extendsFromNow_whenLate() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        uint256 lateTime = expiry + 10 days;
        vm.warp(lateTime); // lapsed
        _fund(alice, PLAN_PRICE);
        vm.prank(alice);
        sm.renew(subId, 1);

        assertEq(sm.getSubscription(subId).expiryTimestamp, lateTime + PLAN_INTERVAL, "extends from now");
    }

    /// @dev Confirmed intended: renew() runs _writeSubscription, which clears `canceled`. A renew is a
    ///      fresh payment, so resurrecting a cancelled-but-unexpired sub is by design, not a bug.
    function test_renew_reactivatesCancelledSub() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        vm.prank(alice);
        sm.cancel(subId);
        assertTrue(sm.getSubscription(subId).canceled, "cancelled");

        _fund(alice, PLAN_PRICE);
        vm.prank(alice);
        sm.renew(subId, 1); // still before expiry

        SubscriptionManager.Subscription memory sub = sm.getSubscription(subId);
        assertFalse(sub.canceled, "renew reactivates");
        assertEq(sub.expiryTimestamp, expiry + PLAN_INTERVAL, "extends from old expiry");
    }

    function test_renew_splitsFundsAndEmits() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        uint256 periods = 2;
        uint256 amount = PLAN_PRICE * periods;
        (uint256 merchantAmount, uint256 fee) = _split(amount, FEE_RATE);
        uint256 newExpiry = expiry + periods * PLAN_INTERVAL; // early renew, still at START

        _fund(alice, amount);
        uint256 merchantBefore = usdc.balanceOf(merchant);
        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.Renewed(alice, subId, planId, amount, newExpiry);

        vm.prank(alice);
        sm.renew(subId, periods);

        assertEq(usdc.balanceOf(merchant) - merchantBefore, merchantAmount, "merchant leg");
        assertEq(usdc.balanceOf(feeRecipient) - feeRecipientBefore, fee, "fee leg");
        assertEq(usdc.balanceOf(address(sm)), 0, "router holds nothing");
    }

    /// @dev Fuzz both branches at once: newExpiry == max(oldExpiry, now) + extension, and is never a past period.
    function testFuzz_renew_neverGrantsPastPeriod(uint256 firstPeriods, uint256 renewPeriods, uint256 warpBy) public {
        firstPeriods = bound(firstPeriods, 1, 100);
        renewPeriods = bound(renewPeriods, 1, 100);

        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, firstPeriods);
        uint256 oldExpiry = sm.getSubscription(subId).expiryTimestamp;

        warpBy = bound(warpBy, 0, 3 * 365 days); // land anywhere before or after expiry
        vm.warp(START + warpBy);

        _fund(alice, PLAN_PRICE * renewPeriods);
        vm.prank(alice);
        sm.renew(subId, renewPeriods);

        uint256 base = oldExpiry > block.timestamp ? oldExpiry : block.timestamp;
        uint256 newExpiry = sm.getSubscription(subId).expiryTimestamp;
        assertEq(newExpiry, base + renewPeriods * PLAN_INTERVAL, "max(oldExpiry, now) + extension");
        assertGe(newExpiry, block.timestamp + PLAN_INTERVAL, "never a past/partial period");
    }

    // ---- renew: reverts ---- //
    function test_renew_RevertWhen_ZeroPeriods() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.ZeroPeriods.selector);
        sm.renew(subId, 0);
    }

    function test_renew_RevertWhen_NotSubOwner() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        _fund(bob, PLAN_PRICE);
        vm.prank(bob);
        vm.expectRevert(ISubscriptionManager.NotSubscriptionOwner.selector);
        sm.renew(subId, 1);
    }

    function test_renew_RevertWhen_NonexistentSub() public {
        bytes32 ghost = _subId(alice, 1);
        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.NotSubscriptionOwner.selector); // empty slot has subscriber == 0
        sm.renew(ghost, 1);
    }

    /// @dev Symmetric with subscribe: renew also does two transfers and they are atomic — funded for
    ///      the fee leg but not the merchant leg, the whole renew reverts and the old term is untouched.
    function test_renew_RevertWhen_InsufficientBalance() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        usdc.mint(alice, PLAN_PRICE - 1); // alice was fully debited by the first subscribe
        vm.prank(alice);
        usdc.approve(address(sm), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(SafeTransferLib.TransferFromFailed.selector);
        sm.renew(subId, 1);

        assertEq(sm.getSubscription(subId).expiryTimestamp, expiry, "term untouched after a failed renew");
    }

    /// @dev Disable blocks renew; the existing term is honored (untouched) until it lapses on its own.
    function test_renew_RevertWhen_PlanInactive() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        vm.prank(merchant);
        sm.setPlanActive(planId, false);

        _fund(alice, PLAN_PRICE);
        vm.prank(alice);
        vm.expectRevert(ISubscriptionManager.PlanInactive.selector);
        sm.renew(subId, 1);

        assertEq(sm.getSubscription(subId).expiryTimestamp, expiry, "existing term untouched");
    }

    // ---- cancel ---- //
    function test_cancel_setsCanceledAndEmits() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        vm.expectEmit(address(sm));
        emit ISubscriptionManager.Cancelled(alice, subId, planId);

        vm.prank(alice);
        sm.cancel(subId);

        assertTrue(sm.getSubscription(subId).canceled, "cancel flag set");
    }

    /// @dev `_requireActiveSubAndOwner` uses `<`, so at exactly t == expiry the sub still counts as
    ///      active and is cancellable — the deliberate one-tick disagreement with subscribe's `>`.
    function test_cancel_atExpiry_succeeds() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        vm.warp(expiry);
        vm.prank(alice);
        sm.cancel(subId);

        assertTrue(sm.getSubscription(subId).canceled, "cancel allowed at t == expiry");
    }

    function test_cancel_RevertWhen_OneSecondAfterExpiry() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);
        uint256 expiry = sm.getSubscription(subId).expiryTimestamp;

        vm.warp(expiry + 1); // lapsed → nothing to cancel
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.SubscriptionNotActive.selector, subId));
        sm.cancel(subId);
    }

    function test_cancel_RevertWhen_NotSubOwner() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        vm.prank(bob);
        vm.expectRevert(ISubscriptionManager.NotSubscriptionOwner.selector);
        sm.cancel(subId);
    }

    function test_cancel_RevertWhen_AlreadyCancelled() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        vm.prank(alice);
        sm.cancel(subId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.SubscriptionNotActive.selector, subId));
        sm.cancel(subId);
    }

    /// @dev An empty slot has expiry 0 < now, so it fails the active check before the owner check.
    function test_cancel_RevertWhen_NonexistentSub() public {
        bytes32 ghost = _subId(alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ISubscriptionManager.SubscriptionNotActive.selector, ghost));
        sm.cancel(ghost);
    }

    /// @dev cancel() never reads plan.active, so a sub on a disabled plan is still cancellable.
    function test_cancel_onDisabledPlan_stillWorks() public {
        uint256 planId = _setupPlan();
        bytes32 subId = _subscribe(alice, planId, 1);

        vm.prank(merchant);
        sm.setPlanActive(planId, false);

        vm.prank(alice);
        sm.cancel(subId);

        assertTrue(sm.getSubscription(subId).canceled, "cancellable even on a disabled plan");
    }
}

/// @notice Drives random subscribe/renew/cancel across a fixed set of users + plans for the invariant run.
/// @dev Mints + approves the exact cost per action, then try/catches so invalid actions (inactive plan,
///      already-active sub, wrong owner) don't abort the run — we only care that the manager never
///      ends a call holding USDC.
contract SubscriptionHandler is Test {
    SubscriptionManager internal sm;
    MockUSDC internal usdc;
    address[] internal users;
    uint256[] internal planIds;

    constructor(SubscriptionManager _sm, MockUSDC _usdc, address[] memory _users, uint256[] memory _planIds) {
        sm = _sm;
        usdc = _usdc;
        users = _users;
        planIds = _planIds;
    }

    function _user(uint256 seed) internal view returns (address) {
        return users[seed % users.length];
    }

    function _plan(uint256 seed) internal view returns (uint256) {
        return planIds[seed % planIds.length];
    }

    function _fundFor(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(sm), type(uint256).max);
    }

    function subscribe(uint256 userSeed, uint256 planSeed, uint256 periods) external {
        address user = _user(userSeed);
        uint256 planId = _plan(planSeed);
        periods = bound(periods, 1, 12);
        _fundFor(user, sm.getPlan(planId).price * periods);
        vm.prank(user);
        try sm.subscribe(planId, periods) {} catch {}
    }

    function renew(uint256 userSeed, uint256 planSeed, uint256 periods) external {
        address user = _user(userSeed);
        uint256 planId = _plan(planSeed);
        periods = bound(periods, 1, 12);
        _fundFor(user, sm.getPlan(planId).price * periods);
        vm.prank(user);
        try sm.renew(keccak256(abi.encode(user, planId)), periods) {} catch {}
    }

    function cancel(uint256 userSeed, uint256 planSeed) external {
        address user = _user(userSeed);
        uint256 planId = _plan(planSeed);
        vm.prank(user);
        try sm.cancel(keccak256(abi.encode(user, planId))) {} catch {}
    }
}

/// @notice Stateful proof of the headline guarantee: the manager is a router, not a vault.
contract UserInvariantTest is BaseTest {
    SubscriptionHandler internal handler;

    function setUp() public override {
        super.setUp();

        _registerMerchant(merchant);
        uint256 p1 = _createPlan(merchant, PLAN_PRICE, PLAN_INTERVAL);
        uint256 p2 = _createPlan(merchant, 1, 7 days); // dust-priced plan exercises the rounding path

        address[] memory actors = new address[](2);
        actors[0] = alice;
        actors[1] = bob;
        uint256[] memory plans = new uint256[](2);
        plans[0] = p1;
        plans[1] = p2;

        handler = new SubscriptionHandler(sm, usdc, actors, plans);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = SubscriptionHandler.subscribe.selector;
        selectors[1] = SubscriptionHandler.renew.selector;
        selectors[2] = SubscriptionHandler.cancel.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_managerHoldsNoValue() public view {
        assertEq(usdc.balanceOf(address(sm)), 0, "manager must never retain USDC");
    }
}
