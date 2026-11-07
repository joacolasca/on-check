// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Test.sol";
import {ChequeFund} from "../src/ChequeFund.sol";
import {FondoBase} from "./FondoBase.t.sol";

/// Casos borde de ChequeFund (issue #32), puestos al día para la v2. Documenta y fija el comportamiento del contrato.
contract ChequeFundBordeTest is FondoBase {
    address atacante = makeAddr("atacante");
    address victima = makeAddr("victima");

    // pool_demo v2: inversor1 70.000.000 + inversor2 30.000.000
    uint256 constant POOL_INV1 = 70_000_000 ether;
    uint256 constant POOL_INV2 = 30_000_000 ether;

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        fund.setKyc(atacante, true);
        fund.setKyc(victima, true);
        vm.stopPrank();
    }

    function _poolDemo() internal {
        _depositar(inv1, POOL_INV1);
        _depositar(inv2, POOL_INV2);
    }

    // ------------------------------------------------- 1. ataque de inflación (donación para encarecer la cuotaparte)

    /// El atacante suscribe el mínimo (1.000 cuotapartes), dona `donacion` directo al fondo y la víctima suscribe `cuotapartes` enteras
    /// con `mint`. Devuelve cuánto pagó la víctima y cuánto vale cada posición al final (el rescate es en cola, no se rescata acá).
    function _ataque(uint256 donacion, uint256 cuotapartes) internal returns (uint256 pagoVictima, uint256 valorVictima, uint256 valorAtacante) {
        _suscribir(atacante, 1000 ether);
        token.mint(atacante, donacion);
        vm.prank(atacante);
        token.transfer(address(fund), donacion);

        pagoVictima = _suscribir(victima, cuotapartes);
        valorVictima = fund.convertToAssets(fund.balanceOf(victima));
        valorAtacante = fund.convertToAssets(fund.balanceOf(atacante));
    }

    /// La siembra mínima de 1.000 cuotapartes ($1.000.000) cierra el ataque clásico: el atacante ya no puede entrar con 1 wei de cuotaparte.
    function test_inflacion_laSiembraDeUnWeiYaNoEsPosible() public {
        token.mint(atacante, 1000);
        vm.startPrank(atacante);
        token.approve(address(fund), 1000);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.MinimoCuotapartes.selector, 1, 1000 ether));
        fund.deposit(1000, atacante);
        vm.stopPrank();
    }

    /// Un depósito en ARGt de la víctima que no da cuotapartes enteras se corta (no hay redondeo a su costo).
    function test_inflacion_unDepositoQueDaFraccionesRevierte() public {
        _suscribir(atacante, 1000 ether);
        token.mint(atacante, 1_000_000 ether);
        vm.prank(atacante);
        token.transfer(address(fund), 1_000_000 ether);

        token.mint(victima, 1_000_000 ether);
        vm.startPrank(victima);
        token.approve(address(fund), 1_000_000 ether);
        vm.expectRevert(); // MinimoCuotapartes o CuotapartesEnteras según el precio
        fund.deposit(1_000_000 ether, victima);
        vm.stopPrank();
    }

    /// Con el pool de la demo (100 M) y suscripción por `mint`, la víctima paga el valor justo y el atacante pierde su donación.
    function test_inflacion_conPoolDemo_elAtaqueNoConviene() public {
        _poolDemo();
        uint256 donacion = 1_000_000 ether;
        (uint256 pago, uint256 valorV, uint256 valorA) = _ataque(donacion, 1000 ether);
        console.log("con pool_demo 100M, donacion = 1.000.000, victima suscribe 1.000 cuotapartes");
        console.log("  pago victima:", pago);
        console.log("  valor victima:", valorV);
        console.log("  valor atacante:", valorA);
        assertGe(valorV + 100_000, pago, "la victima conserva lo que pago (menos redondeo)");
        assertLt(valorA, 1_000_000 ether + donacion, "el atacante pierde plata");
    }

    /// Fuzz con pool sembrado: el atacante nunca gana y la víctima no pierde más que el redondeo.
    function testFuzz_inflacion_conPoolDemo_elAtacantePierde(uint256 donacion, uint256 enteras) public {
        _poolDemo();
        donacion = bound(donacion, 1, 1e9 ether);
        enteras = bound(enteras, 1000, 1_000_000);
        (uint256 pago, uint256 valorV, uint256 valorA) = _ataque(donacion, enteras * 1 ether);
        assertLe(valorA, 1_000_000 ether + donacion, "el atacante no gana");
        assertLe(pago - valorV, 1e5, "la victima pierde a lo sumo el redondeo");
    }

    // ------------------------------------------------------------ 2. donación directa de ARGt

    function test_donacionDirecta_subeTotalAssetsYValorCuotaparte_sinRomperReglas() public {
        uint256 cuotas = _depositar(inv1, POOL);
        bytes32 a = keccak256("a");
        _registrarYFondear(a, LIB_A, 10_000_000 ether, 9_000_000 ether);

        uint256 assetsAntes = fund.totalAssets();
        uint256 valorAntes = fund.previewRedeem(cuotas);
        uint256 liquidezAntes = token.balanceOf(address(fund));

        token.mint(extrano, 3_000_000 ether);
        vm.prank(extrano);
        token.transfer(address(fund), 3_000_000 ether);

        assertEq(fund.totalAssets(), assetsAntes + 3_000_000 ether, "sube totalAssets");
        assertGt(fund.previewRedeem(cuotas), valorAntes, "sube el valor de la cuotaparte");
        assertEq(token.balanceOf(address(fund)), liquidezAntes + 3_000_000 ether, "sube la liquidez");
        assertEq(fund.exposicion(LIB_A), 9_000_000 ether, "la exposicion no cambia");
        assertEq(fund.totalSupply(), cuotas, "no se emiten cuotapartes");

        // la concentración sigue aplicando, sobre el totalAssets nuevo: tope = 10 % de 103 M = 10,3 M
        bytes32 a2 = keccak256("a2");
        _registrar(a2, LIB_A, 1_500_000 ether, 1_300_000 ether); // 9M + 1,3M = 10,3M: justo en el tope
        _fondear(a2);
        bytes32 a3 = keccak256("a3");
        _registrar(a3, LIB_A, 100 ether, 90 ether);
        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, LIB_A, 10_300_000 ether + 90 ether, 10_300_000 ether));
        fund.fondearCheque(a3);
    }

    // -------------------------------------------------------------- 3. revocar KYC con cuotapartes

    function test_revocarKyc_conCuotapartes_noPuedeSolicitarRescateNiTransferir() public {
        uint256 cuotas = _depositar(inv1, 1_000_000 ether);

        vm.prank(admin);
        fund.setKyc(inv1, false);

        assertEq(fund.balanceOf(inv1), cuotas, "conserva las cuotapartes");

        vm.startPrank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, inv1));
        fund.solicitarRescate(cuotas);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, inv1));
        fund.transfer(inv2, cuotas);
        vm.stopPrank();

        // un tercero con KYC y allowance tampoco puede sacarlas
        vm.prank(inv1);
        fund.approve(inv2, cuotas);
        vm.prank(inv2);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, inv1));
        fund.transferFrom(inv1, inv2, cuotas);

        // y nadie puede transferirle cuotapartes
        _suscribir(inv2, 1_000 ether);
        vm.prank(inv2);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, inv1));
        fund.transfer(inv1, 1);

        // reponer el KYC lo devuelve a la normalidad
        vm.prank(admin);
        fund.setKyc(inv1, true);
        vm.prank(inv1);
        fund.solicitarRescate(cuotas);
        assertEq(fund.cantidadRescates(), 1);
    }

    // ------------------------------------------------ 4. bajar maxConcentracionBps con cheques Funded

    function test_bajarTopeConcentracion_losFondeadosNoSeAfectan() public {
        _depositar(inv1, POOL);
        bytes32 a1 = keccak256("a1");
        bytes32 b1 = keccak256("b1");
        _registrarYFondear(a1, LIB_A, 9_500_000 ether, 9_000_000 ether); // 9 %
        _registrarYFondear(b1, LIB_B, 5_500_000 ether, 5_000_000 ether);

        vm.prank(admin);
        fund.setMaxConcentracionBps(500); // 5 % de 100M = 5M

        assertEq(fund.exposicion(LIB_A), 9_000_000 ether, "la exposicion existente no se toca");
        assertEq(uint8(_estado(a1)), uint8(ChequeFund.Estado.Funded));
        assertEq(fund.totalAssets(), POOL);

        // un fondeo nuevo del mismo librador revierte (aunque sea chico: ya está por encima del tope)
        bytes32 a2 = keccak256("a2");
        _registrar(a2, LIB_A, 1_100_000 ether, 1_000_000 ether);
        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, LIB_A, 10_000_000 ether, 5_000_000 ether));
        fund.fondearCheque(a2);
        assertEq(uint8(_estado(a2)), uint8(ChequeFund.Estado.Pending));

        // pagar y rechazar siguen funcionando
        _pagar(a1);
        _rechazar(b1);
        assertEq(uint8(_estado(a1)), uint8(ChequeFund.Estado.Paid));
        assertEq(uint8(_estado(b1)), uint8(ChequeFund.Estado.Rejected));
        assertEq(fund.exposicion(LIB_A), 0);
        assertEq(fund.exposicion(LIB_B), 0);

        // con la exposición en cero, un cheque dentro del nuevo tope se puede fondear
        _fondear(a2);
        assertEq(uint8(_estado(a2)), uint8(ChequeFund.Estado.Funded));
    }

    // ------------------------------------------------------------------- 5. pool vacío y SinLiquidez

    function test_poolVacio_fondearRevierteConConcentracionExcedida() public {
        bytes32 id = keccak256("vacio");
        _registrar(id, LIB_A, 1_000 ether, 900 ether);
        assertEq(fund.totalAssets(), 0);
        // tope = 10 % de 0 = 0 → la concentración se evalúa antes que la liquidez
        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, LIB_A, 900 ether, 0));
        fund.fondearCheque(id);
        assertEq(uint8(_estado(id)), uint8(ChequeFund.Estado.Pending));
    }

    function test_sinLiquidez_conConcentracionOk() public {
        _depositar(inv1, POOL);
        vm.startPrank(admin);
        fund.setMaxConcentracionBps(4000);
        fund.setMaxIndustriaBps(10_000);
        fund.setLiquidezMinBps(0);
        vm.stopPrank();
        _registrarYFondear(keccak256("a"), LIB_A, 41_000_000 ether, 40_000_000 ether);
        _registrarYFondear(keccak256("b"), LIB_B, 41_000_000 ether, 40_000_000 ether);
        _registrarYFondear(keccak256("c"), LIB_C, 16_000_000 ether, 15_000_000 ether);
        assertEq(token.balanceOf(address(fund)), 5_000_000 ether);

        bytes32 d = keccak256("d");
        _registrar(d, LIB_D, 7_000_000 ether, 6_000_000 ether); // 6M <= 40M: la concentración está bien
        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinLiquidez.selector, 5_000_000 ether, 6_000_000 ether));
        fund.fondearCheque(d);
        assertEq(uint8(_estado(d)), uint8(ChequeFund.Estado.Pending));
    }

    // --------------------------------------------------------------- 6. invariantes de contabilidad

    function _sumaFondeado(bytes32[] memory ids) internal view returns (uint256 suma) {
        for (uint256 i; i < ids.length; i++) {
            ChequeFund.Cheque memory c = fund.cheques(ids[i]);
            if (c.estado == ChequeFund.Estado.Funded) suma += c.precioCompra;
        }
    }

    function _chequearInvariantes(bytes32[] memory ids) internal view {
        uint256 balance = token.balanceOf(address(fund));
        uint256 fondeado = _sumaFondeado(ids);
        uint256 porLibrador = fund.exposicion(LIB_A) + fund.exposicion(LIB_B) + fund.exposicion(LIB_C);
        uint256 porIndustria = fund.exposicionIndustria(1) + fund.exposicionIndustria(2) + fund.exposicionIndustria(3);
        assertEq(fund.totalAssets(), balance + fondeado, "totalAssets == balance + suma Funded");
        assertEq(fund.totalAssets() - balance, porLibrador, "suma exposicion == _totalFondeado");
        assertEq(fondeado, porLibrador);
        assertEq(fondeado, porIndustria, "suma exposicion por industria == suma Funded");
    }

    function test_invariantes_secuenciaMixta() public {
        _depositar(inv1, POOL);
        bytes32[] memory ids = new bytes32[](6);
        for (uint256 i; i < 6; i++) {
            ids[i] = keccak256(abi.encode("cheque", i));
        }
        _registrar(ids[0], LIB_A, 5_500_000 ether, 5_000_000 ether);
        _registrar(ids[1], LIB_A, 3_300_000 ether, 3_000_000 ether);
        _registrar(ids[2], LIB_B, 4_400_000 ether, 4_000_000 ether);
        _registrar(ids[3], LIB_C, 2_200_000 ether, 2_000_000 ether);
        _registrar(ids[4], LIB_B, 6_600_000 ether, 6_000_000 ether);
        _registrar(ids[5], LIB_C, 1_100_000 ether, 1_000_000 ether);
        _chequearInvariantes(ids); // todo Pending

        _fondear(ids[0]);
        _chequearInvariantes(ids);
        _fondear(ids[1]);
        _fondear(ids[2]);
        _chequearInvariantes(ids);
        _pagar(ids[0]); // el nominal entra: la cuotaparte sube
        _chequearInvariantes(ids);
        _fondear(ids[3]);
        _rechazar(ids[2]); // pérdida del precio
        _chequearInvariantes(ids);
        _fondear(ids[4]);
        _fondear(ids[5]);
        _chequearInvariantes(ids);
        _pagar(ids[1]);
        _rechazar(ids[3]);
        _pagar(ids[4]);
        _chequearInvariantes(ids);
        _pagar(ids[5]);

        // todo cerrado: la exposición vuelve a cero y totalAssets es solo balance
        _chequearInvariantes(ids);
        assertEq(fund.exposicion(LIB_A), 0);
        assertEq(fund.exposicion(LIB_B), 0);
        assertEq(fund.exposicion(LIB_C), 0);
        assertEq(fund.totalAssets(), token.balanceOf(address(fund)));
        // ganancia neta: pagados (5,5+3,3+6,6+1,1 = 16,5M nominal vs 15M precio) menos rechazados (4M + 2M)
        assertEq(fund.totalAssets(), POOL + 1_500_000 ether - 6_000_000 ether);
    }

    // ------------------------------------------------- 7. Pending que choca con el tope no se cancela

    /// El contrato no tiene cancelación: un cheque que choca con el tope queda Pending hasta que haya espacio
    /// (se paga/rechaza otro del mismo librador o entra más capital). Nadie lo puede pasar a otro estado a mano.
    function test_chequePendingQueChocaConElTope_quedaPending() public {
        _depositar(inv1, POOL);
        bytes32 a1 = keccak256("a1");
        bytes32 a2 = keccak256("a2");
        _registrarYFondear(a1, LIB_A, 10_500_000 ether, 10_000_000 ether); // justo el tope
        _registrar(a2, LIB_A, 1_100_000 ether, 1_000_000 ether);

        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, LIB_A, 11_000_000 ether, 10_000_000 ether));
        fund.fondearCheque(a2);
        assertEq(uint8(_estado(a2)), uint8(ChequeFund.Estado.Pending), "sigue Pending");

        // tampoco se puede pagar ni rechazar un Pending (EstadoInvalido): no hay salida salvo fondearlo
        vm.prank(oraculo);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, a2, ChequeFund.Estado.Pending, ChequeFund.Estado.Funded));
        fund.marcarRechazado(a2);
        assertEq(uint8(_estado(a2)), uint8(ChequeFund.Estado.Pending));

        // entra capital: sube el tope y el mismo cheque ahora se puede fondear
        _depositar(inv2, 10_000_000 ether); // tope 11M
        _fondear(a2);
        assertEq(uint8(_estado(a2)), uint8(ChequeFund.Estado.Funded));
    }
}
