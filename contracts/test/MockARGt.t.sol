// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockARGt} from "../src/MockARGt.sol";

contract MockARGtTest is Test {
    MockARGt token;

    function setUp() public {
        token = new MockARGt();
    }

    function test_metadata() public view {
        assertEq(token.name(), "ARGt (testnet mock)");
        assertEq(token.symbol(), "mARGt");
        assertEq(token.decimals(), 18);
    }

    function test_mintAbierto() public {
        address alguien = address(0xBEEF);
        vm.prank(alguien);
        token.mint(alguien, 1e18);
        assertEq(token.balanceOf(alguien), 1e18);
    }
}
