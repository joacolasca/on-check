// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {ChequeFund} from "../src/ChequeFund.sol";
import {FondoBase} from "./FondoBase.t.sol";

/// Reglas nuevas de la v2: industria, liquidez mínima, precio inicial, comisión devengada y rescates en cola.
contract ChequeFundV2Test is FondoBase {
    event ComisionDevengada(uint256 shares, uint64 hasta);
    event RescateSolicitado(uint256 indexed id, address indexed duenio, uint256 shares, uint64 liquidableDesde);
    event RescateLiquidado(uint256 indexed id, address indexed duenio, uint256 shares, uint256 assets);
    event RescateCancelado(uint256 indexed id);

    // =========================================================== industria (máx. 25 %)

    function test_industriaExcedidaRevierte() public {
        _depositar(inv1, POOL); // tope de industria: 25 M
        _registrarInd(keccak256("i1"), LIB_A, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i1"));
        _registrarInd(keccak256("i2"), LIB_B, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i2"));

        bytes32 id = keccak256("i3");
        _registrarInd(id, LIB_C, 10_000_000 ether, 9_500_000 ether, 5); // 28,5 M > 25 M (cada librador está bajo su 10 %)
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.IndustriaExcedida.selector, 5, 28_500_000 ether, 25_000_000 ether));
        _fondear(id);
        assertEq(uint8(_estado(id)), uint8(ChequeFund.Estado.Pending));
        assertEq(fund.exposicionIndustria(5), 19_000_000 ether);
    }

    function test_enElLimiteExactoDel25PorCientoDeLaIndustriaSePermite() public {
        _depositar(inv1, POOL);
        _registrarInd(keccak256("i1"), LIB_A, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i1"));
        _registrarInd(keccak256("i2"), LIB_B, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i2"));
        _registrarInd(keccak256("i3"), LIB_C, 6_500_000 ether, 6_000_000 ether, 5); // 25 M justos
        _fondear(keccak256("i3"));
        assertEq(fund.exposicionIndustria(5), 25_000_000 ether);

        bytes32 id = keccak256("i4");
        _registrarInd(id, LIB_D, 2 ether, 1 ether, 5); // un wei más ya no
        vm.expectRevert();
        _fondear(id);
    }

    function test_otraIndustriaNoComparteElTope() public {
        _depositar(inv1, POOL);
        _registrarInd(keccak256("i1"), LIB_A, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i1"));
        _registrarInd(keccak256("i2"), LIB_B, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i2"));
        _registrarInd(keccak256("i3"), LIB_C, 10_000_000 ether, 9_500_000 ether, 6);
        _fondear(keccak256("i3"));
        assertEq(fund.exposicionIndustria(6), 9_500_000 ether);
    }

    function test_alPagarORechazarBajaLaExposicionDeLaIndustria() public {
        _depositar(inv1, POOL);
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        _registrarInd(a, LIB_A, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(a);
        _registrarInd(b, LIB_B, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(b);
        bytes32 c = keccak256("c");
        _registrarInd(c, LIB_C, 10_000_000 ether, 9_500_000 ether, 5);
        vm.expectRevert();
        _fondear(c);

        _pagar(a);
        assertEq(fund.exposicionIndustria(5), 9_500_000 ether);
        _fondear(c); // ahora sí entra
        assertEq(fund.exposicionIndustria(5), 19_000_000 ether);
        _rechazar(b);
        assertEq(fund.exposicionIndustria(5), 9_500_000 ether);
    }

    function test_elAdminPuedeCambiarElTopeDeIndustria() public {
        _depositar(inv1, POOL);
        _registrarInd(keccak256("i1"), LIB_A, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i1"));
        _registrarInd(keccak256("i2"), LIB_B, 10_000_000 ether, 9_500_000 ether, 5);
        _fondear(keccak256("i2"));
        bytes32 id = keccak256("i3");
        _registrarInd(id, LIB_C, 10_000_000 ether, 9_500_000 ether, 5);
        vm.expectRevert();
        _fondear(id);

        vm.prank(admin);
        fund.setMaxIndustriaBps(3000); // 30 % = 30 M
        _fondear(id);
        assertEq(fund.exposicionIndustria(5), 28_500_000 ether);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, "el tope no puede superar 10000 bps"));
        fund.setMaxIndustriaBps(10_001);
    }

    // =========================================================== liquidez mínima (15 %)

    /// Ocho compras de 9,5 M (en cinco industrias distintas para no chocar con el 25 %) dejan 24 M de liquidez.
    function _ocho() internal {
        _depositar(inv1, POOL);
        for (uint256 i; i < 8; i++) {
            bytes32 id = keccak256(abi.encode("lote", i));
            _registrarInd(id, keccak256(abi.encode("lib", i)), 10_000_000 ether, 9_500_000 ether, uint8(i / 2));
            _fondear(id);
        }
        assertEq(token.balanceOf(address(fund)), 24_000_000 ether);
    }

    function test_laLiquidezMinimaDel15PorCientoRevierte() public {
        _ocho();
        bytes32 id = keccak256("novena");
        _registrarInd(id, keccak256("lib-9"), 10_000_000 ether, 9_500_000 ether, 4);
        // 24 M - 9,5 M = 14,5 M < 15 M (el 15 % de 100 M)
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.LiquidezMinimaInsuficiente.selector, 14_500_000 ether, 15_000_000 ether));
        _fondear(id);
        assertEq(uint8(_estado(id)), uint8(ChequeFund.Estado.Pending));
    }

    function test_enElLimiteExactoDeLiquidezSePermite() public {
        _ocho();
        bytes32 id = keccak256("novena-justa");
        _registrarInd(id, keccak256("lib-9"), 9_500_000 ether, 9_000_000 ether, 4);
        _fondear(id); // quedan exactamente 15 M = 15 %
        assertEq(token.balanceOf(address(fund)), 15_000_000 ether);

        bytes32 otro = keccak256("decima");
        _registrarInd(otro, keccak256("lib-10"), 2 ether, 1 ether, 6);
        vm.expectRevert();
        _fondear(otro); // ni un wei más
    }

    function test_alCobrarseUnChequeVuelveLaLiquidezYSePuedeComprar() public {
        _ocho();
        bytes32 id = keccak256("novena");
        _registrarInd(id, keccak256("lib-9"), 10_000_000 ether, 9_500_000 ether, 4);
        vm.expectRevert();
        _fondear(id);
        _pagar(keccak256(abi.encode("lote", uint256(0)))); // entran 10 M
        _fondear(id);
        assertEq(uint8(_estado(id)), uint8(ChequeFund.Estado.Funded));
    }

    function test_elAdminPuedeCambiarLaLiquidezMinima() public {
        _ocho();
        bytes32 id = keccak256("novena");
        _registrarInd(id, keccak256("lib-9"), 10_000_000 ether, 9_500_000 ether, 4);
        vm.prank(admin);
        fund.setLiquidezMinBps(1000); // 10 %
        _fondear(id);
        assertEq(token.balanceOf(address(fund)), 14_500_000 ether);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, "la liquidez minima no puede superar 10000 bps"));
        fund.setLiquidezMinBps(10_001);
    }

    // =========================================================== precio inicial $1.000

    function test_elPrecioInicialDeLaCuotaparteEs1000Pesos() public {
        assertEq(fund.decimals(), 18);
        assertEq(fund.PRECIO_INICIAL(), 1000);
        assertEq(fund.convertToAssets(1 ether), 1000 ether, "$1.000 por cuotaparte con el fondo vacio");
        assertEq(fund.previewDeposit(1_000_000 ether), 1000 ether);

        uint256 cuotas = _depositar(inv1, 1_000_000 ether);
        assertEq(cuotas, 1000 ether, "1.000.000 pesos = 1.000 cuotapartes");
        assertEq(fund.balanceOf(inv1), 1000 ether);
        assertEq(fund.convertToAssets(1 ether), 1000 ether);
    }

    function test_elDepositoPosteriorUsaElValorActual() public {
        uint256 c1 = _depositar(inv1, POOL);
        bytes32 id = keccak256("a");
        _registrarYFondear(id, LIB_A, 10_000_000 ether, 9_000_000 ether);
        _pagar(id); // +1 M sobre 100 M: la cuotaparte vale $1.010
        assertEq(fund.convertToAssets(1 ether), 1010 ether);

        uint256 c2 = _depositar(inv2, 10_100_000 ether);
        assertEq(c2, 10_000 ether, "10.100.000 / 1.010 = 10.000 cuotapartes");
        assertEq(c1, 100_000 ether);
    }

    function test_unDepositoMenorAUnaCuotapartePorWeiRevierte() public {
        token.mint(inv1, 999);
        vm.startPrank(inv1);
        token.approve(address(fund), 999);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.MinimoCuotapartes.selector, 0, 1000 ether));
        fund.deposit(999, inv1);
        vm.stopPrank();
    }

    // =========================================================== lote de negociacion: minimo 1.000 cuotapartes, de a 1

    function _mintComo(address inv, uint256 cuotapartes) internal {
        uint256 monto = fund.previewMint(cuotapartes);
        token.mint(inv, monto);
        vm.startPrank(inv);
        token.approve(address(fund), monto);
        fund.mint(cuotapartes, inv);
        vm.stopPrank();
    }

    function _mintRevierte(address inv, uint256 cuotapartes, bytes memory error) internal {
        uint256 monto = fund.previewMint(cuotapartes);
        token.mint(inv, monto);
        vm.startPrank(inv);
        token.approve(address(fund), monto);
        vm.expectRevert(error);
        fund.mint(cuotapartes, inv);
        vm.stopPrank();
    }

    function test_elMinimoDeSuscripcionSonMilCuotapartes() public view {
        assertEq(fund.MIN_CUOTAPARTES(), 1000 ether);
        assertEq(fund.previewMint(1000 ether), 1_000_000 ether, "1.000 cuotapartes = $1.000.000 al valor inicial");
    }

    function test_suscribirExactamenteElMinimoPasa() public {
        _mintComo(inv1, 1000 ether);
        assertEq(fund.balanceOf(inv1), 1000 ether);
    }

    function test_suscribirMilYUnaCuotapartesPasa() public {
        _mintComo(inv1, 1001 ether);
        assertEq(fund.balanceOf(inv1), 1001 ether);
    }

    function test_suscribir999CuotapartesRevierte() public {
        _mintRevierte(inv1, 999 ether, abi.encodeWithSelector(ChequeFund.MinimoCuotapartes.selector, 999 ether, 1000 ether));
    }

    function test_suscribirUnaFraccionRevierte() public {
        _mintRevierte(inv1, 1000.5 ether, abi.encodeWithSelector(ChequeFund.CuotapartesEnteras.selector, 1000.5 ether));
    }

    function test_unDepositoDeArgtQueNoDaCuotapartesEnterasRevierte() public {
        uint256 monto = 1_000_500 ether; // 1.000,5 cuotapartes al valor inicial
        token.mint(inv1, monto);
        vm.startPrank(inv1);
        token.approve(address(fund), monto);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.CuotapartesEnteras.selector, 1000.5 ether));
        fund.deposit(monto, inv1);
        vm.stopPrank();
    }

    function test_unDepositoDeArgtMultiploDelPrecioPasa() public {
        assertEq(_depositar(inv1, 1_234_000 ether), 1234 ether);
    }

    function test_laReglaAplicaConElPrecioYaMovido() public {
        _suscribir(inv1, 5000 ether);
        vm.warp(block.timestamp + 100 days);
        _mintRevierte(inv2, 999 ether, abi.encodeWithSelector(ChequeFund.MinimoCuotapartes.selector, 999 ether, 1000 ether));
        _mintComo(inv2, 1000 ether);
        assertEq(fund.balanceOf(inv2), 1000 ether);
    }

    function test_laComisionDevengadaEmiteFraccionesYNoEsSuscripcion() public {
        _suscribir(inv1, 100_000 ether);
        vm.warp(block.timestamp + 30 days);
        uint256 pendiente = fund.comisionPendiente();
        assertGt(pendiente, 0);
        assertTrue(pendiente % 1 ether != 0 && pendiente < 1000 ether, "fraccionaria y menor al minimo");
        _suscribir(inv2, 1000 ether); // devenga antes de suscribir
        assertGt(fund.balanceOf(admin), 0, "el receptor recibe la fraccion sin pasar por la regla");
        assertLt(fund.balanceOf(admin), 1000 ether);
    }

    function test_losRescatesChicosSiguenPermitidos() public {
        _suscribir(inv1, 5000 ether);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1); // 1 wei de cuotaparte
        assertEq(fund.rescates(id).shares, 1);
        vm.prank(inv1);
        id = fund.solicitarRescate(0.25 ether); // fraccion
        assertEq(fund.rescates(id).shares, 0.25 ether);
        vm.prank(inv1);
        fund.cancelarRescate(id);
    }

    // =========================================================== comisión del 3 % anual

    function test_laComisionSeDevengaEnCuotapartesAlReceptor() public {
        uint256 cuotas = _depositar(inv1, POOL);
        assertEq(fund.feeReceptor(), admin);
        assertEq(fund.comisionPendiente(), 0);

        vm.warp(block.timestamp + 365 days);
        // f = 3 % → se emiten supply * 0,03 / 0,97
        uint256 esperada = cuotas * 300 / 9700;
        assertApproxEqAbs(fund.comisionPendiente(), esperada, 1);
        assertEq(fund.balanceOf(admin), 0, "todavia no se emitio");

        vm.recordLogs();
        _suscribir(inv2, 1_000 ether); // cualquier operación devenga
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool emitido;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == ComisionDevengada.selector) {
                (uint256 shares, uint64 hasta) = abi.decode(logs[i].data, (uint256, uint64));
                assertApproxEqAbs(shares, esperada, 1);
                assertEq(hasta, block.timestamp);
                emitido = true;
            }
        }
        assertTrue(emitido, "se emitio ComisionDevengada");
        assertApproxEqAbs(fund.balanceOf(admin), esperada, 1);
        assertEq(fund.comisionPendiente(), 0);
        assertEq(fund.ultimoDevengo(), block.timestamp);
        // el receptor queda con el 3 % del fondo (antes del depósito chico de inv2)
        assertApproxEqRel(fund.balanceOf(admin) * 1e18 / (cuotas + fund.balanceOf(admin)), 0.03e18, 1e12);
    }

    function test_laComisionBajaElValorDeLaCuotaparteDeLosInversores() public {
        _depositar(inv1, POOL);
        assertEq(fund.convertToAssets(1 ether), 1000 ether);
        vm.warp(block.timestamp + 365 days);
        _suscribir(inv2, 1_000 ether); // devenga
        // un año con el patrimonio quieto: la cuotaparte vale 3 % menos
        assertApproxEqRel(fund.convertToAssets(1 ether), 970 ether, 1e12);
    }

    function test_laComisionEsProporcionalAlTiempo() public {
        uint256 cuotas = _depositar(inv1, POOL);
        vm.warp(block.timestamp + 73 days); // 1/5 de año: 0,6 %
        uint256 esperada = cuotas * 60 / 9940;
        assertApproxEqRel(fund.comisionPendiente(), esperada, 1e12);
    }

    function test_sinCuotapartesNoSeDevengaComision() public {
        vm.warp(block.timestamp + 365 days);
        assertEq(fund.comisionPendiente(), 0);
        _depositar(inv1, 1_000_000 ether);
        assertEq(fund.balanceOf(admin), 0, "no hay comision sobre un fondo vacio");
        assertEq(fund.balanceOf(inv1), 1000 ether);
    }

    function test_fondearPagarYRechazarTambienDevengan() public {
        _depositar(inv1, POOL);
        vm.warp(block.timestamp + 30 days);
        bytes32 a = keccak256("a");
        _registrar(a, LIB_A, 10_000_000 ether, 9_500_000 ether);
        _fondear(a);
        uint256 trasFondear = fund.balanceOf(admin);
        assertGt(trasFondear, 0);

        vm.warp(block.timestamp + 30 days);
        _pagar(a);
        uint256 trasPagar = fund.balanceOf(admin);
        assertGt(trasPagar, trasFondear);

        bytes32 b = keccak256("b");
        _registrarYFondear(b, LIB_B, 10_000_000 ether, 9_500_000 ether);
        vm.warp(block.timestamp + 30 days);
        _rechazar(b);
        assertGt(fund.balanceOf(admin), trasPagar);
        assertEq(fund.ultimoDevengo(), block.timestamp);
    }

    function test_elReceptorPuedeRescatarSuComision() public {
        _depositar(inv1, POOL);
        vm.warp(block.timestamp + 365 days);
        _suscribir(inv2, 1_000 ether);
        uint256 comision = fund.balanceOf(admin);
        vm.prank(admin);
        uint256 id = fund.solicitarRescate(comision); // el admin tiene KYC desde el constructor
        assertEq(fund.rescates(id).shares, comision);
    }

    function test_setComisionAnualBps() public {
        _depositar(inv1, POOL);
        vm.warp(block.timestamp + 365 days);
        vm.prank(admin);
        fund.setComisionAnualBps(0); // antes devenga lo acumulado al 3 %
        assertGt(fund.balanceOf(admin), 0);
        uint256 conTresPorCiento = fund.balanceOf(admin);

        vm.warp(block.timestamp + 365 days); // con 0 % no se devenga más
        assertEq(fund.comisionPendiente(), 0);
        vm.prank(admin);
        fund.setComisionAnualBps(1000);
        assertEq(fund.balanceOf(admin), conTresPorCiento);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, "la comision no puede superar 1000 bps"));
        fund.setComisionAnualBps(1001);
    }

    function test_setFeeReceptorDevengaAlAnteriorYDaKycAlNuevo() public {
        _depositar(inv1, POOL);
        vm.warp(block.timestamp + 365 days);
        address nuevo = makeAddr("nuevoReceptor");
        vm.prank(admin);
        fund.setFeeReceptor(nuevo);
        assertGt(fund.balanceOf(admin), 0, "lo acumulado fue para el receptor anterior");
        assertEq(fund.balanceOf(nuevo), 0);
        assertTrue(fund.kyc(nuevo));

        vm.warp(block.timestamp + 365 days);
        _suscribir(inv2, 1_000 ether);
        assertGt(fund.balanceOf(nuevo), 0);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, "receptor invalido"));
        fund.setFeeReceptor(address(0));
    }

    // =========================================================== rescates: fecha de liquidación

    /// 00:00 de Buenos Aires del día `n` contado desde el lunes de referencia.
    function _dia(uint256 n) internal pure returns (uint64) {
        return uint64(LUNES + n * 1 days);
    }

    function test_liquidableDesde_diaHabilAntesDeLas15() public view {
        // lunes 10:00 → martes 00:00
        assertEq(fund.liquidableDesde(uint64(LUNES + 10 hours)), _dia(1));
        // lunes 00:00 y 14:59:59 → martes 00:00
        assertEq(fund.liquidableDesde(uint64(LUNES)), _dia(1));
        assertEq(fund.liquidableDesde(uint64(LUNES + 15 hours - 1)), _dia(1));
    }

    function test_liquidableDesde_despuesDeLas15CuentaDesdeElSiguienteDiaHabil() public view {
        // lunes 15:00 en punto y 23:59 → miércoles 00:00
        assertEq(fund.liquidableDesde(uint64(LUNES + 15 hours)), _dia(2));
        assertEq(fund.liquidableDesde(uint64(LUNES + 24 hours - 1)), _dia(2));
    }

    function test_liquidableDesde_viernesYFinDeSemana() public view {
        uint256 viernes = LUNES + 4 days;
        assertEq(fund.liquidableDesde(uint64(viernes + 10 hours)), _dia(7), "viernes antes de las 15: lunes 00:00");
        assertEq(fund.liquidableDesde(uint64(viernes + 16 hours)), _dia(8), "viernes despues de las 15: martes 00:00");
        assertEq(fund.liquidableDesde(uint64(LUNES + 5 days + 10 hours)), _dia(8), "sabado: martes 00:00");
        assertEq(fund.liquidableDesde(uint64(LUNES + 6 days + 10 hours)), _dia(8), "domingo: martes 00:00");
        assertEq(fund.liquidableDesde(uint64(LUNES + 7 days - 1)), _dia(8), "domingo 23:59 de BA: martes 00:00");
        assertEq(fund.liquidableDesde(uint64(LUNES + 7 days)), _dia(8), "lunes 00:00 de BA antes de las 15: martes 00:00");
        assertEq(fund.liquidableDesde(uint64(LUNES + 3 days + 15 hours)), _dia(7), "jueves 15:00: se cuenta desde el viernes, vence el lunes");
    }

    /// Buenos Aires es UTC-3: lunes 22:00 BA ya es martes 01:00 UTC. Tiene que contar como lunes después de las 15.
    function test_liquidableDesde_usaLaHoraDeBuenosAiresNoLaUtc() public view {
        uint256 lunes22BA = LUNES + 22 hours; // = martes 01:00 UTC
        assertEq(fund.liquidableDesde(uint64(lunes22BA)), _dia(2));
        // domingo 22:00 BA = lunes 01:00 UTC: sigue siendo domingo
        uint256 domingo22BA = LUNES + 6 days + 22 hours;
        assertEq(fund.liquidableDesde(uint64(domingo22BA)), _dia(8));
        // la fecha que se devuelve es medianoche de BA = 03:00 UTC
        assertEq(fund.liquidableDesde(uint64(LUNES + 10 hours)) % 1 days, 3 hours);
    }

    // =========================================================== rescates: flujo

    function test_solicitarRescate_dejaLasCuotapartesEnCustodia() public {
        uint256 cuotas = _depositar(inv1, 10_000_000 ether); // 10.000 cuotapartes
        uint64 desde = uint64(_dia(1));

        vm.expectEmit(true, true, false, true, address(fund));
        emit RescateSolicitado(0, inv1, 4_000 ether, desde);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(4_000 ether);

        assertEq(id, 0);
        assertEq(fund.cantidadRescates(), 1);
        assertEq(fund.balanceOf(inv1), cuotas - 4_000 ether);
        assertEq(fund.balanceOf(address(fund)), 4_000 ether, "en custodia del fondo");
        assertEq(fund.totalSupply(), cuotas, "siguen existiendo hasta liquidar");
        ChequeFund.Rescate memory r = fund.rescates(id);
        assertEq(r.duenio, inv1);
        assertEq(r.shares, 4_000 ether);
        assertEq(r.assets, 0);
        assertEq(r.solicitadoEn, block.timestamp);
        assertEq(r.liquidableDesde, desde);
        assertEq(uint8(r.estado), uint8(ChequeFund.EstadoRescate.Pendiente));
    }

    function test_solicitarRescate_validaDuenioYMonto() public {
        _depositar(inv1, 1_000_000 ether); // 1.000 cuotapartes
        vm.prank(extrano);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, extrano));
        fund.solicitarRescate(1 ether);

        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, "cuotapartes en cero"));
        fund.solicitarRescate(0);

        vm.prank(inv1);
        vm.expectRevert(); // ERC20InsufficientBalance
        fund.solicitarRescate(1_001 ether);
        assertEq(fund.cantidadRescates(), 0, "el revert no deja un rescate a medias");
    }

    function test_liquidar_antesDelPlazoRevierteYDespuesPaga() public {
        _depositar(inv1, 10_000_000 ether);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(4_000 ether); // lunes 10:00 → vence martes 00:00 BA
        uint64 desde = fund.rescates(id).liquidableDesde;

        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateNoVencido.selector, id, desde));
        fund.liquidarRescate(id);

        vm.warp(desde - 1);
        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateNoVencido.selector, id, desde));
        fund.liquidarRescate(id);

        vm.warp(desde); // martes 00:00 en punto
        // sin cheques ni comisión de por medio... la comisión corre: se devenga antes de pagar
        vm.expectEmit(true, true, false, false, address(fund));
        emit RescateLiquidado(id, inv1, 4_000 ether, 0);
        vm.prank(gestor);
        fund.liquidarRescate(id);

        ChequeFund.Rescate memory r = fund.rescates(id);
        assertEq(uint8(r.estado), uint8(ChequeFund.EstadoRescate.Liquidado));
        assertGt(r.assets, 3_900_000 ether, "cuotaparte ~ $1.000 menos 1 dia de comision");
        assertLt(r.assets, 4_000_000 ether);
        assertEq(token.balanceOf(inv1), r.assets);
        assertEq(fund.balanceOf(address(fund)), 0, "las cuotapartes se quemaron");
    }

    function test_rescateDespuesDeLas15_cuentaDesdeElSiguienteDiaHabil() public {
        _depositar(inv1, 10_000_000 ether);
        vm.warp(LUNES + 16 hours); // lunes 16:00 BA
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1_000 ether);
        assertEq(fund.rescates(id).liquidableDesde, _dia(2), "miercoles 00:00");

        vm.warp(_dia(2) - 1 hours); // martes 23:00: todavía no
        vm.prank(gestor);
        vm.expectRevert();
        fund.liquidarRescate(id);
        vm.warp(_dia(2));
        vm.prank(gestor);
        fund.liquidarRescate(id);
    }

    function test_rescateEnFinDeSemana_cuentaDesdeElLunes() public {
        _depositar(inv1, 10_000_000 ether);
        vm.warp(LUNES + 5 days + 11 hours); // sábado 11:00 BA
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1_000 ether);
        assertEq(fund.rescates(id).liquidableDesde, _dia(8), "martes 00:00");

        vm.warp(_dia(7) + 12 hours); // lunes al mediodía: todavía no
        vm.prank(gestor);
        vm.expectRevert();
        fund.liquidarRescate(id);
        vm.warp(_dia(8));
        vm.prank(gestor);
        fund.liquidarRescate(id);
    }

    function test_modoDemo_permiteLiquidarSinEsperar() public {
        _depositar(inv1, 10_000_000 ether);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1_000 ether);
        vm.prank(gestor);
        vm.expectRevert();
        fund.liquidarRescate(id);

        assertFalse(fund.modoDemo());
        vm.prank(admin);
        fund.setModoDemo(true);
        assertTrue(fund.modoDemo());
        vm.prank(gestor);
        fund.liquidarRescate(id); // sin warp
        assertEq(token.balanceOf(inv1), 1_000_000 ether, "1.000 cuotapartes a $1.000, sin comision porque no paso el tiempo");

        // apagado, vuelve la espera
        vm.prank(admin);
        fund.setModoDemo(false);
        vm.prank(inv1);
        uint256 id2 = fund.solicitarRescate(1_000 ether);
        vm.prank(gestor);
        vm.expectRevert();
        fund.liquidarRescate(id2);
    }

    function test_liquidar_sinLiquidezRevierteYConLiquidezFunciona() public {
        _depositar(inv1, POOL);
        _aflojarReglas();
        vm.prank(admin);
        fund.setModoDemo(true);
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        _registrarYFondear(a, LIB_A, 50_000_000 ether, 50_000_000 ether);
        _registrarYFondear(b, LIB_B, 45_000_000 ether, 45_000_000 ether);
        // liquidez 5 M; el inversor pide todo (100.000 cuotapartes = 100 M)
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(100_000 ether);

        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinLiquidez.selector, 5_000_000 ether, 100_000_000 ether));
        fund.liquidarRescate(id);
        assertEq(uint8(fund.rescates(id).estado), uint8(ChequeFund.EstadoRescate.Pendiente), "sigue pendiente");

        _pagar(a);
        _pagar(b); // entran los nominales: 95 M + 5 M de liquidez
        vm.prank(gestor);
        fund.liquidarRescate(id);
        assertEq(token.balanceOf(inv1), 100_000_000 ether);
        assertEq(fund.totalSupply(), 0);
    }

    function test_liquidar_pagaAlValorDelMomentoNoAlDeLaSolicitud() public {
        _depositar(inv1, POOL);
        vm.prank(admin);
        fund.setModoDemo(true);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(10_000 ether); // 10 M al precio de hoy

        bytes32 a = keccak256("a");
        _registrarYFondear(a, LIB_A, 10_000_000 ether, 9_000_000 ether);
        _pagar(a); // el fondo gana 1 M: la cuotaparte pasa a $1.010

        vm.prank(gestor);
        fund.liquidarRescate(id);
        assertEq(token.balanceOf(inv1), 10_100_000 ether, "cobra al valor de cuando se liquida");
    }

    function test_cancelarRescate_devuelveLasCuotapartesAlDuenio() public {
        uint256 cuotas = _depositar(inv1, 10_000_000 ether);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(4_000 ether);

        vm.prank(inv2); // otro con KYC no puede cancelar
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SoloElDuenio.selector, inv2));
        fund.cancelarRescate(id);

        vm.expectEmit(true, false, false, false, address(fund));
        emit RescateCancelado(id);
        vm.prank(inv1);
        fund.cancelarRescate(id);

        assertEq(fund.balanceOf(inv1), cuotas);
        assertEq(fund.balanceOf(address(fund)), 0);
        assertEq(uint8(fund.rescates(id).estado), uint8(ChequeFund.EstadoRescate.Cancelado));

        // ya no se puede cancelar ni liquidar
        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateNoPendiente.selector, id, ChequeFund.EstadoRescate.Cancelado));
        fund.cancelarRescate(id);
        vm.prank(admin);
        fund.setModoDemo(true);
        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateNoPendiente.selector, id, ChequeFund.EstadoRescate.Cancelado));
        fund.liquidarRescate(id);
    }

    function test_unRescateLiquidadoNoSePuedeCancelarNiLiquidarOtraVez() public {
        _depositar(inv1, 10_000_000 ether);
        vm.prank(admin);
        fund.setModoDemo(true);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1_000 ether);
        vm.prank(gestor);
        fund.liquidarRescate(id);

        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateNoPendiente.selector, id, ChequeFund.EstadoRescate.Liquidado));
        fund.cancelarRescate(id);
        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateNoPendiente.selector, id, ChequeFund.EstadoRescate.Liquidado));
        fund.liquidarRescate(id);
    }

    function test_soloElGestorLiquida() public {
        _depositar(inv1, 10_000_000 ether);
        vm.prank(admin);
        fund.setModoDemo(true);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1_000 ether);

        address[4] memory otros = [extrano, inv1, oraculo, admin];
        for (uint256 i; i < otros.length; i++) {
            vm.prank(otros[i]);
            vm.expectRevert();
            fund.liquidarRescate(id);
        }
        vm.prank(gestor);
        fund.liquidarRescate(id);
    }

    function test_liquidar_conKycRevocadoRevierte() public {
        _depositar(inv1, 10_000_000 ether);
        vm.prank(admin);
        fund.setModoDemo(true);
        vm.prank(inv1);
        uint256 id = fund.solicitarRescate(1_000 ether);
        vm.prank(admin);
        fund.setKyc(inv1, false);
        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, inv1));
        fund.liquidarRescate(id);
    }

    function test_rescateInexistente() public {
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateInexistente.selector, 7));
        fund.rescates(7);
        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateInexistente.selector, 7));
        fund.cancelarRescate(7);
        vm.prank(gestor);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.RescateInexistente.selector, 7));
        fund.liquidarRescate(7);
    }

    function test_nadiePuedeMandarleCuotapartesAlFondoPorFuera() public {
        _depositar(inv1, 1_000_000 ether);
        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, address(fund)));
        fund.transfer(address(fund), 1 ether); // solo entran por solicitarRescate
    }

    function test_variosRescatesQuedanEnLaCola() public {
        _depositar(inv1, 10_000_000 ether);
        _depositar(inv2, 5_000_000 ether);
        vm.prank(inv1);
        uint256 a = fund.solicitarRescate(1_000 ether);
        vm.prank(inv2);
        uint256 b = fund.solicitarRescate(500 ether);
        vm.prank(inv1);
        uint256 c = fund.solicitarRescate(2_000 ether);
        assertEq(a, 0);
        assertEq(b, 1);
        assertEq(c, 2);
        assertEq(fund.cantidadRescates(), 3);
        assertEq(fund.rescates(b).duenio, inv2);
        assertEq(fund.balanceOf(address(fund)), 3_500 ether);
    }
}
