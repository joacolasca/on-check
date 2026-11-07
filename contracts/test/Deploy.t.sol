// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockARGt} from "../src/MockARGt.sol";
import {ChequeToken} from "../src/ChequeToken.sol";
import {ChequeFund} from "../src/ChequeFund.sol";
import {DeployBase} from "../script/DeployBase.sol";

/// Verifica la lógica del despliegue de la demo (la misma que usa script/Deploy.s.sol dentro del broadcast).
contract DeployTest is Test, DeployBase {
    address deployer = makeAddr("deployer");
    address pyme = makeAddr("pyme");
    Cuentas c;

    function setUp() public {
        vm.warp(1_800_241_200 + 10 hours);
        c = Cuentas(makeAddr("originador"), makeAddr("oraculo"), makeAddr("inversor1"), makeAddr("inversor2"), pyme);
    }

    function _desplegarDemo() internal returns (MockARGt argt, ChequeToken token, ChequeFund fund) {
        vm.startPrank(deployer);
        (argt, token, fund) = _desplegar(deployer, c);
        vm.stopPrank();
    }

    function test_dejaLaDemoLista() public {
        (MockARGt argt, ChequeToken token, ChequeFund fund) = _desplegarDemo();

        assertEq(fund.asset(), address(argt));
        assertEq(address(fund.chequeToken()), address(token));
        assertEq(token.fondo(), address(fund), "setFondo hecho");
        assertTrue(fund.hasRole(fund.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(fund.hasRole(fund.ORIGINADOR_ROLE(), c.originador));
        assertTrue(fund.hasRole(fund.ORACULO_ROLE(), c.oraculo));
        assertTrue(fund.hasRole(fund.GESTOR_ROLE(), c.oraculo), "en la demo el oraculo tambien es gestor");
        assertFalse(fund.hasRole(fund.ORIGINADOR_ROLE(), c.oraculo));
        assertFalse(fund.hasRole(fund.GESTOR_ROLE(), c.originador));
        assertTrue(fund.kyc(c.inversor1));
        assertTrue(fund.kyc(c.inversor2));
        assertTrue(fund.kyc(pyme));
        assertEq(fund.feeReceptor(), deployer);
        assertTrue(fund.kyc(deployer), "el receptor de la comision tiene KYC");
        assertEq(argt.balanceOf(c.oraculo), MINT_ORACULO);
        assertEq(argt.balanceOf(c.inversor1), MINT_INVERSOR);
        assertEq(fund.maxConcentracionBps(), 1000);
        assertEq(fund.maxIndustriaBps(), 2500);
        assertEq(fund.liquidezMinBps(), 1500);
        assertEq(fund.comisionAnualBps(), 300);
    }

    function _depositar(MockARGt argt, ChequeFund fund, address inversor, uint256 monto) private {
        vm.startPrank(inversor);
        argt.approve(address(fund), monto);
        fund.deposit(monto, inversor);
        vm.stopPrank();
    }

    function _cheque(bytes32 librador, uint256 nominal, uint256 precio, uint8 industria) private view returns (ChequeFund.Cheque memory) {
        return ChequeFund.Cheque(
            librador, pyme, nominal, precio, uint64(block.timestamp + 60 days), 95, 2606, keccak256("cot"), 0, industria, 0, 0, bytes32(0), ChequeFund.Estado.None
        );
    }

    /// El pool de demo (70 M + 30 M = 100 M) lo carga `pnpm demo:preparar` vía la API, no el script: este test lo reproduce
    /// y comprueba el caso de la demo: un cheque de 9 M pasa y 4 M más al mismo emisor lo rechaza el contrato.
    function test_conElPoolDemoUnChequeDe9MPasaYOtros4MSeRechazan() public {
        (MockARGt argt, , ChequeFund fund) = _desplegarDemo();
        _depositar(argt, fund, c.inversor1, 70_000_000 ether);
        _depositar(argt, fund, c.inversor2, 30_000_000 ether);
        assertEq(fund.totalAssets(), 100_000_000 ether);
        assertEq(fund.convertToAssets(1 ether), 1000 ether, "la cuotaparte arranca en $1.000");

        bytes32 id = keccak256("primero");
        vm.startPrank(c.originador);
        fund.registrarCheque(id, _cheque(keccak256("lib"), 9_400_000 ether, 9_000_000 ether, 5));
        fund.fondearCheque(id);
        bytes32 id2 = keccak256("segundo");
        fund.registrarCheque(id2, _cheque(keccak256("lib"), 4_200_000 ether, 4_000_000 ether, 5));
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, keccak256("lib"), 13_000_000 ether, 10_000_000 ether));
        fund.fondearCheque(id2);
        vm.stopPrank();
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Funded));
    }

    function test_conLaDemoDesplegadaSeCompletaUnCiclo() public {
        (MockARGt argt, ChequeToken token, ChequeFund fund) = _desplegarDemo();
        vm.prank(c.oraculo);
        argt.approve(address(fund), type(uint256).max);
        _depositar(argt, fund, c.inversor1, 70_000_000 ether);
        _depositar(argt, fund, c.inversor2, 30_000_000 ether);

        bytes32 id = keccak256("demo");
        vm.startPrank(c.originador);
        fund.registrarCheque(id, _cheque(keccak256("lib"), 10_000_000 ether, 9_571_616 ether, 5));
        assertEq(token.ownerOf(uint256(id)), pyme);
        fund.fondearCheque(id);
        assertEq(token.ownerOf(uint256(id)), address(fund));
        vm.stopPrank();
        vm.prank(c.oraculo);
        fund.marcarPagado(id);

        assertEq(argt.balanceOf(pyme), 9_571_616 ether);
        assertEq(fund.totalAssets(), 100_000_000 ether + (10_000_000 ether - 9_571_616 ether));
        vm.expectRevert();
        token.ownerOf(uint256(id)); // se quemo
    }

    /// El gestor de la demo (la wallet del oráculo) puede liquidar un rescate de punta a punta con modoDemo.
    function test_conLaDemoDesplegadaElGestorLiquidaUnRescate() public {
        (MockARGt argt, , ChequeFund fund) = _desplegarDemo();
        _depositar(argt, fund, c.inversor1, 70_000_000 ether);
        vm.prank(deployer);
        fund.setModoDemo(true);

        vm.prank(c.inversor1);
        uint256 id = fund.solicitarRescate(10_000 ether);
        vm.prank(c.oraculo);
        fund.liquidarRescate(id);
        assertEq(argt.balanceOf(c.inversor1), MINT_INVERSOR - 70_000_000 ether + 10_000_000 ether);
    }
}
