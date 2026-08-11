// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "solady/auth/Ownable.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {ISubscriptionManager} from "./ISubscriptionManager.sol";

// a payment router + bookkeeper, not a vault

// protocol invariants:
// - money flows directly beetween user, mechant and feeRecepient
// - onlyMerchant, onlyOwner, onlySubOwner
// - usdc

contract SubscriptionManager is ISubscriptionManager, Ownable {
    using SafeTransferLib for address;

    // flow: user pays -> merchant receives -> protocol takes fees
    struct Plan {
        address merchant;
        uint256 price;
        uint256 interval; // min sub time
        bool active;
    }

    struct Subscription {
        address subscriber;
        uint256 planId;
        uint256 expiryTimestamp;
        bool canceled;
    }

    mapping(uint256 => Plan) private s_planIds;
    mapping(bytes32 => Subscription) private s_subIds;
    mapping(address => bool) private s_isMerchant;

    address private s_feeRecipient;
    address private immutable i_usdc;

    uint256 private s_currentPlanId;
    uint256 private s_merchantFee;
    uint256 private s_feeRate;

    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_FEE_BPS = 1_000; // 10 % is max fee

    modifier onlyMerchant() {
        if (!s_isMerchant[msg.sender]) revert NotMerchant();
        _;
    }

    constructor(address owner, address usdc, address feeRecipient, uint256 feeRate, uint256 merchantFee) {
        if (owner == address(0) || usdc == address(0) || feeRecipient == address(0)) revert ZeroAddress();
        if (feeRate > MAX_FEE_BPS) revert FeeTooHigh(feeRate, MAX_FEE_BPS);

        _initializeOwner(owner);

        i_usdc = usdc;
        s_feeRecipient = feeRecipient;
        s_feeRate = feeRate;
        s_merchantFee = merchantFee;
    }

    // ---- MERCHANT ---- //
    function registerMerchant() external {
        if (s_isMerchant[msg.sender]) revert AlreadyMerchant();

        uint256 merchantFee = s_merchantFee;

        s_isMerchant[msg.sender] = true;
        i_usdc.safeTransferFrom(msg.sender, s_feeRecipient, merchantFee);

        emit MerchantAdded(msg.sender, merchantFee);
    }

    function createPlan(string calldata name, uint256 price, uint256 interval) external onlyMerchant {
        _requireValidPlanParams(price, interval);

        uint256 planId = ++s_currentPlanId;
        s_planIds[planId] = Plan({merchant: msg.sender, price: price, interval: interval, active: true});

        emit PlanCreated(msg.sender, planId, name, price, interval);
    }

    function updatePlan(uint256 planId, uint256 price, uint256 interval) external onlyMerchant {
        _requireValidPlanParams(price, interval);
        Plan storage plan = _requirePlanOwner(planId);

        plan.price = price;
        plan.interval = interval;

        emit PlanUpdated(msg.sender, planId, price, interval);
    }

    function setPlanActive(uint256 planId, bool active) external onlyMerchant {
        Plan storage plan = _requirePlanOwner(planId);

        if (plan.active == active) return;
        plan.active = active;

        emit PlanStatusChanged(msg.sender, planId, active); // msg.sender == plan.merchant (checked above)
    }

    // ---- USER ---- //
    function subscribe(uint256 planId, uint256 periods) external {
        if (periods == 0) revert ZeroPeriods();
        Plan storage plan = _requireActivePlan(planId);

        bytes32 subId; // hash of msg.sender, planId
        assembly ("memory-safe") {
            mstore(0x00, caller())
            mstore(0x20, planId)
            subId := keccak256(0x00, 0x40)
        }

        Subscription storage sub = _requireSubDoesntExist(subId);

        uint256 expiryTimestamp = block.timestamp + (periods * plan.interval);
        uint256 amount = plan.price * periods;

        _writeSubscription(sub, planId, expiryTimestamp);
        _charge(msg.sender, plan.merchant, amount);

        emit Subscribed(msg.sender, subId, planId, amount, expiryTimestamp);
    }

    function cancel(bytes32 subId) external {
        Subscription storage sub = _requireActiveSubAndOwner(subId);

        sub.canceled = true;

        emit Cancelled(msg.sender, subId, sub.planId);
    }

    function renew(bytes32 subId, uint256 periods) external {
        if (periods == 0) revert ZeroPeriods();

        Subscription storage sub = _requireSubOwner(subId);
        Plan storage plan = _requireActivePlan(sub.planId); // renew needs an active plan; planId read from the sub

        uint256 base;
        if (sub.expiryTimestamp > block.timestamp) {
            base = sub.expiryTimestamp;
        } else {
            base = block.timestamp;
        }
        uint256 newExpiry = base + (periods * plan.interval);
        uint256 amount = periods * plan.price;

        _writeSubscription(sub, sub.planId, newExpiry);
        _charge(msg.sender, plan.merchant, amount);

        emit Renewed(msg.sender, subId, sub.planId, amount, newExpiry);
    }

    function _charge(address payer, address merchant, uint256 amount) internal {
        uint256 merchantAmount = amount * (BPS - s_feeRate) / BPS;
        uint256 fee = amount - merchantAmount;

        i_usdc.safeTransferFrom(payer, s_feeRecipient, fee);
        i_usdc.safeTransferFrom(payer, merchant, merchantAmount);
    }

    function _requirePlanOwner(uint256 planId) internal view returns (Plan storage plan) {
        plan = s_planIds[planId];

        if (plan.merchant == address(0)) revert PlanNotFound(planId);
        if (plan.merchant != msg.sender) revert NotPlanOwner();
    }

    function _requireActivePlan(uint256 planId) internal view returns (Plan storage plan) {
        plan = s_planIds[planId];

        if (plan.merchant == address(0)) revert PlanNotFound(planId);
        if (!plan.active) revert PlanInactive();
    }

    function _requireValidPlanParams(uint256 price, uint256 interval) internal pure {
        if (price == 0) revert ZeroPrice();
        if (interval == 0) revert ZeroInterval();
    }

    function _writeSubscription(Subscription storage sub, uint256 planId, uint256 newExpiry) internal {
        sub.subscriber = msg.sender;
        sub.planId = planId;
        sub.expiryTimestamp = newExpiry;
        sub.canceled = false;
    }

    function _requireSubDoesntExist(bytes32 subId) internal view returns (Subscription storage sub) {
        sub = s_subIds[subId];
        if (sub.subscriber != address(0)) revert SubscriptionExists(subId);
    }

    function _requireActiveSubAndOwner(bytes32 subId) internal view returns (Subscription storage sub) {
        sub = s_subIds[subId];
        if (sub.canceled || sub.expiryTimestamp < block.timestamp) revert SubscriptionNotActive(subId);
        if (sub.subscriber != msg.sender) revert NotSubscriptionOwner(); // auth + covers non-existent sub
    }

    function _requireSubOwner(bytes32 subId) internal view returns (Subscription storage sub) {
        sub = s_subIds[subId];
        if (sub.subscriber != msg.sender) revert NotSubscriptionOwner(); // auth + covers non-existent sub
    }

    // ---- PROTOCOL ---- //
    function setFeeRate(uint256 feeBps) external onlyOwner {
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh(feeBps, MAX_FEE_BPS);
        s_feeRate = feeBps;

        emit FeeRateSet(feeBps);
    }

    function setMerchantFee(uint256 fee) external onlyOwner {
        s_merchantFee = fee;

        emit MerchantFeeSet(fee);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();

        s_feeRecipient = recipient;

        emit FeeRecipientSet(recipient);
    }

    // ---- GETTERS ---- //
    function getPlan(uint256 planId) external view returns (Plan memory) {
        return s_planIds[planId];
    }

    function getSubscription(bytes32 subId) external view returns (Subscription memory) {
        return s_subIds[subId];
    }

    function isMerchant(address account) external view returns (bool) {
        return s_isMerchant[account];
    }

    function getFeeRecipient() external view returns (address) {
        return s_feeRecipient;
    }

    function getCurrentPlanId() external view returns (uint256) {
        return s_currentPlanId;
    }

    function getMerchantFee() external view returns (uint256) {
        return s_merchantFee;
    }

    function getFeeRate() external view returns (uint256) {
        return s_feeRate;
    }

    function getUsdc() external view returns (address) {
        return i_usdc;
    }

    function getBps() external pure returns (uint256) {
        return BPS;
    }

    function getMaxFeeBps() external pure returns (uint256) {
        return MAX_FEE_BPS;
    }
}
