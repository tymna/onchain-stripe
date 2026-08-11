// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ISubscriptionManager {
    // ---- ERRORS ---- //
    error FeeTooHigh(uint256 provided, uint256 max);

    error AlreadyMerchant();
    error NotMerchant();

    error ZeroPrice();
    error ZeroInterval();
    error ZeroAddress();
    error ZeroPeriods();

    error PlanNotFound(uint256 planId);
    error NotPlanOwner();
    error PlanInactive();

    error SubscriptionExists(bytes32 subId);
    error SubscriptionNotActive(bytes32 subId);
    error NotSubscriptionOwner();

    // ---- EVENTS ---- //
    // convention: index addresses + IDs (filter/join keys), never values or strings (strings hash → unreadable)

    // protocol config (onlyOwner)
    event FeeRateSet(uint256 newFeeRate);
    event MerchantFeeSet(uint256 newMerchantFee);
    event FeeRecipientSet(address indexed newRecipient);

    // merchant + plan lifecycle
    event MerchantAdded(address indexed merchant, uint256 merchantFee);
    event PlanCreated(address indexed merchant, uint256 indexed planId, string name, uint256 price, uint256 interval);
    event PlanUpdated(address indexed merchant, uint256 indexed planId, uint256 price, uint256 interval);
    event PlanStatusChanged(address indexed merchant, uint256 indexed planId, bool active);

    // subscription lifecycle
    event Subscribed(
        address indexed subscriber, bytes32 indexed subId, uint256 indexed planId, uint256 amount, uint256 expiresAt
    );
    event Renewed(
        address indexed subscriber, bytes32 indexed subId, uint256 indexed planId, uint256 amount, uint256 expiresAt
    );
    event Cancelled(address indexed subscriber, bytes32 indexed subId, uint256 indexed planId);

    // ---- FUNCTIONS ---- //
    // merchant
    function registerMerchant() external;
    function createPlan(string calldata name, uint256 price, uint256 interval) external;
    function updatePlan(uint256 planId, uint256 price, uint256 interval) external;
    function setPlanActive(uint256 planId, bool active) external;

    // user
    function subscribe(uint256 planId, uint256 periods) external;
    function renew(bytes32 subId, uint256 periods) external;
    function cancel(bytes32 subId) external;

    // protocol (only owner)
    function setFeeRate(uint256 feeBps) external;
    function setMerchantFee(uint256 fee) external;
    function setFeeRecipient(address recipient) external;
}
