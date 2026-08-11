import { encodeAbiParameters, keccak256 } from 'viem';
import type { Address } from 'viem';

export const subscriptionManagerAbi = [
    {
        type: 'constructor',
        inputs: [
            {
                name: 'owner',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'usdc',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'feeRecipient',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'feeRate',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'merchantFee',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'cancel',
        inputs: [
            {
                name: 'subId',
                type: 'bytes32',
                internalType: 'bytes32',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'cancelOwnershipHandover',
        inputs: [],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'completeOwnershipHandover',
        inputs: [
            {
                name: 'pendingOwner',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'createPlan',
        inputs: [
            {
                name: 'name',
                type: 'string',
                internalType: 'string',
            },
            {
                name: 'price',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'interval',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'getBps',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'pure',
    },
    {
        type: 'function',
        name: 'getCurrentPlanId',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getFeeRate',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getFeeRecipient',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getMaxFeeBps',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'pure',
    },
    {
        type: 'function',
        name: 'getMerchantFee',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getPlan',
        inputs: [
            {
                name: 'planId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'tuple',
                internalType: 'struct SubscriptionManager.Plan',
                components: [
                    {
                        name: 'merchant',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'price',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'interval',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'active',
                        type: 'bool',
                        internalType: 'bool',
                    },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getSubscription',
        inputs: [
            {
                name: 'subId',
                type: 'bytes32',
                internalType: 'bytes32',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'tuple',
                internalType: 'struct SubscriptionManager.Subscription',
                components: [
                    {
                        name: 'subscriber',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'planId',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'expiryTimestamp',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'canceled',
                        type: 'bool',
                        internalType: 'bool',
                    },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getUsdc',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'isMerchant',
        inputs: [
            {
                name: 'account',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'owner',
        inputs: [],
        outputs: [
            {
                name: 'result',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'ownershipHandoverExpiresAt',
        inputs: [
            {
                name: 'pendingOwner',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: 'result',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'registerMerchant',
        inputs: [],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'renew',
        inputs: [
            {
                name: 'subId',
                type: 'bytes32',
                internalType: 'bytes32',
            },
            {
                name: 'periods',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'renounceOwnership',
        inputs: [],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'requestOwnershipHandover',
        inputs: [],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'setFeeRate',
        inputs: [
            {
                name: 'feeBps',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setFeeRecipient',
        inputs: [
            {
                name: 'recipient',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setMerchantFee',
        inputs: [
            {
                name: 'fee',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setPlanActive',
        inputs: [
            {
                name: 'planId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'active',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'subscribe',
        inputs: [
            {
                name: 'planId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'periods',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'transferOwnership',
        inputs: [
            {
                name: 'newOwner',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'updatePlan',
        inputs: [
            {
                name: 'planId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'price',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'interval',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'event',
        name: 'Cancelled',
        inputs: [
            {
                name: 'subscriber',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'subId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'planId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'FeeRateSet',
        inputs: [
            {
                name: 'newFeeRate',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'FeeRecipientSet',
        inputs: [
            {
                name: 'newRecipient',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'MerchantAdded',
        inputs: [
            {
                name: 'merchant',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'merchantFee',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'MerchantFeeSet',
        inputs: [
            {
                name: 'newMerchantFee',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'OwnershipHandoverCanceled',
        inputs: [
            {
                name: 'pendingOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'OwnershipHandoverRequested',
        inputs: [
            {
                name: 'pendingOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'OwnershipTransferred',
        inputs: [
            {
                name: 'oldOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'newOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'PlanCreated',
        inputs: [
            {
                name: 'merchant',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'planId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'name',
                type: 'string',
                indexed: false,
                internalType: 'string',
            },
            {
                name: 'price',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'interval',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'PlanStatusChanged',
        inputs: [
            {
                name: 'merchant',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'planId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'active',
                type: 'bool',
                indexed: false,
                internalType: 'bool',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'PlanUpdated',
        inputs: [
            {
                name: 'merchant',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'planId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'price',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'interval',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'Renewed',
        inputs: [
            {
                name: 'subscriber',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'subId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'planId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'amount',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'expiresAt',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'Subscribed',
        inputs: [
            {
                name: 'subscriber',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'subId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'planId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'amount',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'expiresAt',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'error',
        name: 'AlreadyInitialized',
        inputs: [],
    },
    {
        type: 'error',
        name: 'AlreadyMerchant',
        inputs: [],
    },
    {
        type: 'error',
        name: 'FeeTooHigh',
        inputs: [
            {
                name: 'provided',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'max',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
    },
    {
        type: 'error',
        name: 'NewOwnerIsZeroAddress',
        inputs: [],
    },
    {
        type: 'error',
        name: 'NoHandoverRequest',
        inputs: [],
    },
    {
        type: 'error',
        name: 'NotMerchant',
        inputs: [],
    },
    {
        type: 'error',
        name: 'NotPlanOwner',
        inputs: [],
    },
    {
        type: 'error',
        name: 'NotSubscriptionOwner',
        inputs: [],
    },
    {
        type: 'error',
        name: 'PlanInactive',
        inputs: [],
    },
    {
        type: 'error',
        name: 'PlanNotFound',
        inputs: [
            {
                name: 'planId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
    },
    {
        type: 'error',
        name: 'SubscriptionExists',
        inputs: [
            {
                name: 'subId',
                type: 'bytes32',
                internalType: 'bytes32',
            },
        ],
    },
    {
        type: 'error',
        name: 'SubscriptionNotActive',
        inputs: [
            {
                name: 'subId',
                type: 'bytes32',
                internalType: 'bytes32',
            },
        ],
    },
    {
        type: 'error',
        name: 'Unauthorized',
        inputs: [],
    },
    {
        type: 'error',
        name: 'ZeroAddress',
        inputs: [],
    },
    {
        type: 'error',
        name: 'ZeroInterval',
        inputs: [],
    },
    {
        type: 'error',
        name: 'ZeroPeriods',
        inputs: [],
    },
    {
        type: 'error',
        name: 'ZeroPrice',
        inputs: [],
    },
] as const;

// SubscriptionManager on Base Sepolia (chainId 84532) — 2026-07-06 redeploy:
// subscribe is create-once (SubscriptionExists), renew un-cancels. See
// contracts/deployments.md for the full address history.
export const subscriptionManager = {
    address: '0xc91a4d1B95Ea603f01125b9590baF130613a3665',
    abi: subscriptionManagerAbi,
} as const;

// MockUSDC on Base Sepolia (redeployed with the manager — old token's balances
// don't carry over) — needed for approve() before subscribe / renew / registerMerchant.
export const usdcAddress = '0x93b34C315d4F0F91F0d3702474fa3AB211f0640C' as const;

// subId is deterministic — keccak256(abi.encode(subscriber, planId)), exactly
// what subscribe() computes on-chain — so anyone can find a wallet's slot for a
// plan without an index. One active subscription per (wallet, plan) by construction.
export function deriveSubId(subscriber: Address, planId: bigint): `0x${string}` {
    return keccak256(
        encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [subscriber, planId]),
    );
}
