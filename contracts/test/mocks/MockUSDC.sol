// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "solady/tokens/ERC20.sol";

/// @notice Test-only stand-in for USDC on Base: 6 decimals, open mint.
/// @dev Not for deployment — anyone can mint. Solady ERC20 leaves name/symbol abstract.
contract MockUSDC is ERC20 {
    function name() public pure override returns (string memory) {
        return "USD Coin";
    }

    function symbol() public pure override returns (string memory) {
        return "USDC";
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
