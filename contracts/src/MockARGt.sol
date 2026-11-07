// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ARGt simulado para Base Sepolia. `mint` abierto: es un faucet de testnet.
contract MockARGt is ERC20 {
    constructor() ERC20("ARGt (testnet mock)", "mARGt") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
