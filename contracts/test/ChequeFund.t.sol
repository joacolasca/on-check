// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ChequeFund} from "../src/ChequeFund.sol";
import {FondoBase} from "./FondoBase.t.sol";

/// Tests del ciclo de vida del cheque, la concentración por librador, KYC, roles y validaciones (los de v1, adaptados a v2).
contract ChequeFundTest is FondoBase {
    event ChequeRegistrado(bytes32 indexed id, bytes32 indexed libradorHash, ChequeFund.Cheque datos);
    event ChequeFondeado(bytes32 indexed id, uint256 precioCompra);
    event ChequePagado(bytes32 indexed id, uint256 nominal);
    event ChequeRechazado(bytes32 indexed id, uint256 perdida);
    event KycActualizado(address indexed cuenta, bool ok);

    // ------------------------------------------------------------------ ciclo feliz

    function test_cicloFeliz_registrar_fondear_pagar_suba_la_cuotaparte() public {
        uint256 cuotas = _depositar(inv1, POOL);
        assertEq(fund.totalAssets(), POOL);
        uint256 valorAntes = fund.previewRedeem(cuotas);

        bytes32 id = keccak256("cheque-1");
        _registrar(id, LIB_A, 10_000_000 ether, 9_500_000 ether);
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Pending));
        assertEq(fund.totalAssets(), POOL, "registrar no mueve plata");

        _fondear(id);
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Funded));
        assertEq(token.balanceOf(pyme), 9_500_000 ether, "la pyme cobra el adelanto");
        assertEq(token.balanceOf(address(fund)), POOL - 9_500_000 ether, "baja la liquidez");
        assertEq(fund.totalAssets(), POOL, "el cheque comprado se valua a lo pagado: totalAssets no cambia");
        assertEq(fund.exposicion(LIB_A), 9_500_000 ether);
        assertEq(fund.exposicionIndustria(1), 9_500_000 ether);

        _pagar(id);
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Paid));
        assertEq(fund.totalAssets(), POOL + 500_000 ether, "el fondo gana el descuento");
        assertEq(fund.exposicion(LIB_A), 0);
        assertEq(fund.exposicionIndustria(1), 0);
        assertGt(fund.previewRedeem(cuotas), valorAntes, "sube el valor de la cuotaparte");
    }

    function test_rechazo_la_perdida_baja_totalAssets_y_la_cuotaparte() public {
        uint256 cuotas = _depositar(inv1, POOL);
        uint256 valorAntes = fund.previewRedeem(cuotas);
        bytes32 id = keccak256("cheque-malo");
        _registrarYFondear(id, LIB_A, 7_200_000 ether, 7_000_000 ether);

        _rechazar(id);

        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Rejected));
        assertEq(fund.totalAssets(), POOL - 7_000_000 ether, "la perdida es el precio pagado");
        assertEq(fund.exposicion(LIB_A), 0);
        assertEq(fund.exposicionIndustria(1), 0);
        assertLt(fund.previewRedeem(cuotas), valorAntes, "baja el valor de la cuotaparte");
    }

    function test_losEventosCorrectosEnCadaTransicion() public {
        _depositar(inv1, POOL);
        bytes32 id = keccak256("cheque-eventos");
        ChequeFund.Cheque memory d = _datos(LIB_A, 10_000_000 ether, 9_500_000 ether);
        ChequeFund.Cheque memory esperado = d;
        esperado.estado = ChequeFund.Estado.Pending; // lo que queda guardado (y se emite) es Pending

        vm.expectEmit(true, true, false, true, address(fund));
        emit ChequeRegistrado(id, LIB_A, esperado);
        vm.prank(originador);
        fund.registrarCheque(id, d);

        vm.expectEmit(true, false, false, true, address(fund));
        emit ChequeFondeado(id, 9_500_000 ether);
        _fondear(id);

        vm.expectEmit(true, false, false, true, address(fund));
        emit ChequePagado(id, 10_000_000 ether);
        _pagar(id);

        bytes32 id2 = keccak256("cheque-eventos-2");
        _registrarYFondear(id2, LIB_B, 4_000_000 ether, 3_900_000 ether);
        vm.expectEmit(true, false, false, true, address(fund));
        emit ChequeRechazado(id2, 3_900_000 ether);
        _rechazar(id2);

        vm.expectEmit(true, false, false, true, address(fund));
        emit KycActualizado(extrano, true);
        vm.prank(admin);
        fund.setKyc(extrano, true);
    }

    // ------------------------------------------------------------------ concentración por librador (la regla dura, D10)

    function test_losTopesPorDefectoSonLosDeLaSpec() public view {
        assertEq(fund.maxConcentracionBps(), 1000);
        assertEq(fund.maxIndustriaBps(), 2500);
        assertEq(fund.liquidezMinBps(), 1500);
        assertEq(fund.comisionAnualBps(), 300);
    }

    function test_laConcentracionPorEncimaDelMaximoRevierte() public {
        _depositar(inv1, POOL); // tope: 10 % = 10.000.000
        _registrarYFondear(keccak256("a1"), LIB_A, 10_000_000 ether, 9_500_000 ether); // 9,5 %

        bytes32 id = keccak256("a2");
        _registrar(id, LIB_A, 3_100_000 ether, 3_000_000 ether); // 12,5 M > 10 M
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, LIB_A, 12_500_000 ether, 10_000_000 ether));
        _fondear(id);
        // sigue Pending: el contrato rechazó la compra pero el registro queda
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Pending));
        assertEq(fund.exposicion(LIB_A), 9_500_000 ether);
    }

    /// El caso de la demo: con $100 M, un cheque de $9 M pasa y uno adicional de $4 M al mismo emisor lo rechaza el contrato.
    function test_casoDemo_9MPasaYOtros4MAlMismoEmisorSeRechazan() public {
        _depositar(inv1, 70_000_000 ether);
        _depositar(inv2, 30_000_000 ether);
        _registrarYFondear(keccak256("ml-1"), LIB_A, 9_400_000 ether, 9_000_000 ether);
        bytes32 id = keccak256("ml-2");
        _registrar(id, LIB_A, 4_200_000 ether, 4_000_000 ether);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ConcentracionExcedida.selector, LIB_A, 13_000_000 ether, 10_000_000 ether));
        _fondear(id);
    }

    function test_enElLimiteExactoDel10PorCientoSePermite() public {
        _depositar(inv1, POOL);
        _registrarYFondear(keccak256("a1"), LIB_A, 10_000_000 ether, 9_500_000 ether);
        // 9.5 M + 0.5 M = 10 M = exactamente el 10 % de 100 M
        _registrarYFondear(keccak256("a2"), LIB_A, 600_000 ether, 500_000 ether);
        assertEq(fund.exposicion(LIB_A), 10_000_000 ether);
        // un wei más ya no
        bytes32 id = keccak256("a3");
        _registrar(id, LIB_A, 2 ether, 1 ether);
        vm.expectRevert();
        _fondear(id);
    }

    function test_otroLibradorNoComparteElTope() public {
        _depositar(inv1, POOL);
        _registrarYFondear(keccak256("a1"), LIB_A, 10_000_000 ether, 9_500_000 ether);
        _registrarYFondear(keccak256("b1"), LIB_B, 10_000_000 ether, 9_500_000 ether);
        assertEq(fund.exposicion(LIB_B), 9_500_000 ether);
    }

    function test_alCerrarseUnChequeLaExposicionBajaYSePuedeVolverAComprar() public {
        _depositar(inv1, POOL);
        bytes32 a1 = keccak256("a1");
        _registrarYFondear(a1, LIB_A, 10_000_000 ether, 9_500_000 ether);
        bytes32 a2 = keccak256("a2");
        _registrar(a2, LIB_A, 4_000_000 ether, 3_900_000 ether); // 13,4 M > 10 M
        vm.expectRevert();
        _fondear(a2);

        _pagar(a1); // el fondo cobró: exposicion de A vuelve a 0
        _fondear(a2); // ahora sí entra
        assertEq(fund.exposicion(LIB_A), 3_900_000 ether);
    }

    function test_elAdminPuedeCambiarElTope() public {
        _depositar(inv1, POOL);
        _registrarYFondear(keccak256("a1"), LIB_A, 10_000_000 ether, 9_500_000 ether);
        bytes32 id = keccak256("a2");
        _registrar(id, LIB_A, 4_000_000 ether, 3_900_000 ether);
        vm.expectRevert();
        _fondear(id);

        vm.prank(admin);
        fund.setMaxConcentracionBps(2000); // 20 % = 20 M
        _fondear(id);
        assertEq(fund.exposicion(LIB_A), 13_400_000 ether);
    }

    function test_setMaxConcentracionRechazaMasDel100PorCiento() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, "el tope no puede superar 10000 bps"));
        fund.setMaxConcentracionBps(10_001);
        vm.prank(admin);
        fund.setMaxConcentracionBps(10_000);
        assertEq(fund.maxConcentracionBps(), 10_000);
    }

    function test_conElFondoVacioNingunChequeSeFondea() public {
        bytes32 id = keccak256("sin-fondos");
        _registrar(id, LIB_A, 2_000_000 ether, 1_900_000 ether);
        vm.expectRevert(); // totalAssets = 0 → cualquier compra supera el tope
        _fondear(id);
    }

    // ------------------------------------------------------------------ liquidez

    function test_sinLiquidezSuficienteRevierte() public {
        _depositar(inv1, POOL);
        _aflojarReglas(); // con las reglas por defecto la reserva del 15 % corta antes
        _registrarYFondear(keccak256("a"), LIB_A, 50_000_000 ether, 50_000_000 ether);
        _registrarYFondear(keccak256("b"), LIB_B, 40_000_000 ether, 40_000_000 ether);
        assertEq(token.balanceOf(address(fund)), 10_000_000 ether);

        bytes32 id = keccak256("c");
        _registrar(id, LIB_C, 16_000_000 ether, 15_000_000 ether);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinLiquidez.selector, 10_000_000 ether, 15_000_000 ether));
        _fondear(id);
    }

    function test_elRetiroEstandarDeERC4626EstaDeshabilitado() public {
        uint256 cuotas = _depositar(inv1, 1_000_000 ether);
        assertEq(fund.maxWithdraw(inv1), 0);
        assertEq(fund.maxRedeem(inv1), 0);

        vm.startPrank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxWithdraw.selector, inv1, 1 ether, 0));
        fund.withdraw(1 ether, inv1, inv1);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxRedeem.selector, inv1, cuotas, 0));
        fund.redeem(cuotas, inv1, inv1);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ KYC

    function test_soloConKycSePuedeDepositar() public {
        token.mint(extrano, 1_000 ether);
        vm.startPrank(extrano);
        token.approve(address(fund), 1_000 ether);
        // sin KYC maxDeposit es 0: ERC-4626 lo corta con su error estándar
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxDeposit.selector, extrano, 1_000 ether, 0));
        fund.deposit(1_000 ether, extrano);
        vm.stopPrank();
        assertEq(fund.maxDeposit(extrano), 0);
        assertEq(fund.maxMint(extrano), 0);
    }

    function test_unSinKycNoPuedeDepositarNiSiquieraHaciaUnaCuentaConKyc() public {
        token.mint(extrano, 1_000 ether);
        vm.startPrank(extrano);
        token.approve(address(fund), 1_000 ether);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, extrano)); // el que manda la plata también necesita KYC
        fund.deposit(1_000 ether, inv1);
        vm.stopPrank();
    }

    function test_noSePuedeDepositarParaUnReceptorSinKyc() public {
        token.mint(inv1, 1_000 ether);
        vm.startPrank(inv1);
        token.approve(address(fund), 1_000 ether);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxDeposit.selector, extrano, 1_000 ether, 0));
        fund.deposit(1_000 ether, extrano);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxMint.selector, extrano, 1_000 ether, 0));
        fund.mint(1_000 ether, extrano);
        vm.stopPrank();
    }

    function test_siSeRevocaElKycNoSePuedeSolicitarRescate() public {
        _depositar(inv1, 1_000_000 ether);
        vm.prank(admin);
        fund.setKyc(inv1, false);
        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, inv1));
        fund.solicitarRescate(1 ether);
    }

    function test_lasCuotapartesSoloSeTransfierenEntreDireccionesConKyc() public {
        uint256 cuotas = _depositar(inv1, 1_000_000 ether);
        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.SinKyc.selector, extrano));
        fund.transfer(extrano, 0.5 ether);

        vm.prank(inv1);
        fund.transfer(inv2, cuotas / 2); // entre dos con KYC sí
        assertEq(fund.balanceOf(inv2), cuotas / 2);
    }

    // ------------------------------------------------------------------ roles

    function test_soloElOriginadorRegistraYFondea() public {
        bytes32 id = keccak256("x");
        ChequeFund.Cheque memory d = _datos(LIB_A, 10 ether, 9 ether);
        bytes memory sinRol = abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, extrano, fund.ORIGINADOR_ROLE());

        vm.prank(extrano);
        vm.expectRevert(sinRol);
        fund.registrarCheque(id, d);

        _registrar(id, LIB_A, 10 ether, 9 ether);
        vm.prank(extrano);
        vm.expectRevert(sinRol);
        fund.fondearCheque(id);

        // el oráculo, el gestor y el admin tampoco son originadores
        vm.prank(oraculo);
        vm.expectRevert();
        fund.registrarCheque(keccak256("y"), d);
        vm.prank(gestor);
        vm.expectRevert();
        fund.registrarCheque(keccak256("y"), d);
        vm.prank(admin);
        vm.expectRevert();
        fund.fondearCheque(id);
    }

    function test_soloElOraculoPagaYRechaza() public {
        _depositar(inv1, POOL);
        bytes32 id = keccak256("x");
        _registrarYFondear(id, LIB_A, 10_000_000 ether, 9_500_000 ether);
        bytes memory sinRol = abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, extrano, fund.ORACULO_ROLE());

        vm.prank(extrano);
        vm.expectRevert(sinRol);
        fund.marcarPagado(id);
        vm.prank(extrano);
        vm.expectRevert(sinRol);
        fund.marcarRechazado(id);
        vm.prank(originador); // el originador no puede liquidar
        vm.expectRevert();
        fund.marcarPagado(id);
        vm.prank(gestor); // el gestor tampoco: su rol es otro
        vm.expectRevert();
        fund.marcarRechazado(id);
    }

    function test_soloElAdminCambiaKycTopesYParametros() public {
        bytes memory sinRol = abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, extrano, fund.DEFAULT_ADMIN_ROLE());
        vm.startPrank(extrano);
        vm.expectRevert(sinRol);
        fund.setKyc(extrano, true);
        vm.expectRevert(sinRol);
        fund.setMaxConcentracionBps(9000);
        vm.expectRevert(sinRol);
        fund.setMaxIndustriaBps(9000);
        vm.expectRevert(sinRol);
        fund.setLiquidezMinBps(0);
        vm.expectRevert(sinRol);
        fund.setComisionAnualBps(0);
        vm.expectRevert(sinRol);
        fund.setFeeReceptor(extrano);
        vm.expectRevert(sinRol);
        fund.setModoDemo(true);
        vm.stopPrank();
        vm.prank(originador);
        vm.expectRevert();
        fund.setKyc(originador, true);
    }

    // ------------------------------------------------------------------ transiciones inválidas

    function test_noSePuedePagarOChequeoPendienteNiRechazarlo() public {
        _depositar(inv1, POOL);
        bytes32 id = keccak256("pend");
        _registrar(id, LIB_A, 10_000_000 ether, 9_500_000 ether);
        vm.startPrank(oraculo);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, id, ChequeFund.Estado.Pending, ChequeFund.Estado.Funded));
        fund.marcarPagado(id);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, id, ChequeFund.Estado.Pending, ChequeFund.Estado.Funded));
        fund.marcarRechazado(id);
        vm.stopPrank();
    }

    function test_noSePuedeFondearDosVecesNiRegistrarElMismoIdDeNuevo() public {
        _depositar(inv1, POOL);
        bytes32 id = keccak256("dup");
        _registrarYFondear(id, LIB_A, 10_000_000 ether, 9_500_000 ether);

        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, id, ChequeFund.Estado.Funded, ChequeFund.Estado.Pending));
        fund.fondearCheque(id);

        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ChequeYaRegistrado.selector, id));
        fund.registrarCheque(id, _datos(LIB_A, 10 ether, 9 ether));
    }

    function test_unChequeCerradoNoVuelveAMoverse() public {
        _depositar(inv1, POOL);
        bytes32 pagado = keccak256("pagado");
        bytes32 malo = keccak256("malo");
        _registrarYFondear(pagado, LIB_A, 10_000_000 ether, 9_500_000 ether);
        _registrarYFondear(malo, LIB_B, 4_000_000 ether, 3_900_000 ether);
        vm.startPrank(oraculo);
        fund.marcarPagado(pagado);
        fund.marcarRechazado(malo);

        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, pagado, ChequeFund.Estado.Paid, ChequeFund.Estado.Funded));
        fund.marcarPagado(pagado);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, pagado, ChequeFund.Estado.Paid, ChequeFund.Estado.Funded));
        fund.marcarRechazado(pagado);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.EstadoInvalido.selector, malo, ChequeFund.Estado.Rejected, ChequeFund.Estado.Funded));
        fund.marcarPagado(malo);
        vm.stopPrank();
    }

    function test_unChequeInexistenteRevierte() public {
        bytes32 id = keccak256("fantasma");
        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ChequeInexistente.selector, id));
        fund.fondearCheque(id);
        vm.prank(oraculo);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.ChequeInexistente.selector, id));
        fund.marcarPagado(id);
    }

    function test_siElOraculoNoPuedePagarElChequeSigueFondeado() public {
        _depositar(inv1, POOL);
        bytes32 id = keccak256("sin-plata");
        _registrarYFondear(id, LIB_A, 10_000_000 ether, 9_500_000 ether);
        vm.prank(oraculo);
        token.approve(address(fund), 0); // sin permiso
        vm.prank(oraculo);
        vm.expectRevert();
        fund.marcarPagado(id);
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Funded), "el revert deja todo como estaba");
        assertEq(fund.exposicion(LIB_A), 9_500_000 ether);
        assertEq(nft.ownerOf(uint256(id)), address(fund), "y el token no se quemo");
    }

    // ------------------------------------------------------------------ validación de datos

    function test_registrarValidaLosDatos() public {
        bytes32 id = keccak256("datos");
        ChequeFund.Cheque memory d = _datos(LIB_A, 10 ether, 9 ether);

        d.libradorHash = bytes32(0);
        _esperarDatosInvalidos(id, d, "libradorHash vacio");

        d = _datos(LIB_A, 10 ether, 9 ether);
        d.pyme = address(0);
        _esperarDatosInvalidos(id, d, "pyme invalida");

        d = _datos(LIB_A, 0, 0);
        _esperarDatosInvalidos(id, d, "monto en cero");

        d = _datos(LIB_A, 10 ether, 11 ether);
        _esperarDatosInvalidos(id, d, "el precio supera al nominal");

        d = _datos(LIB_A, 10 ether, 9 ether);
        d.vencimiento = uint64(block.timestamp);
        _esperarDatosInvalidos(id, d, "vencimiento en el pasado");

        d = _datos(LIB_A, 10 ether, 9 ether);
        d.puntaje = 101;
        _esperarDatosInvalidos(id, d, "puntaje fuera de rango");
    }

    function test_registrarValidaTipoIndustriaYGarantia() public {
        bytes32 id = keccak256("datos-v2");
        ChequeFund.Cheque memory d = _datos(LIB_A, 10 ether, 9 ether);

        d.tipo = 2;
        _esperarDatosInvalidos(id, d, "tipo invalido (0 cheque, 1 pagare)");

        d = _datos(LIB_A, 10 ether, 9 ether);
        d.industria = 13;
        _esperarDatosInvalidos(id, d, "industria invalida");

        d = _datos(LIB_A, 10 ether, 9 ether);
        d.tipoGarantia = 10;
        _esperarDatosInvalidos(id, d, "tipo de garantia invalido");

        // los extremos válidos pasan: pagaré, industria 12, garantía 9
        d = _datos(LIB_A, 10 ether, 9 ether);
        d.tipo = 1;
        d.industria = 12;
        d.tipoGarantia = 9;
        vm.prank(originador);
        fund.registrarCheque(id, d);
    }

    function _esperarDatosInvalidos(bytes32 id, ChequeFund.Cheque memory d, string memory motivo) internal {
        vm.prank(originador);
        vm.expectRevert(abi.encodeWithSelector(ChequeFund.DatosInvalidos.selector, motivo));
        fund.registrarCheque(id, d);
    }

    function test_elEstadoQueVieneEnLosDatosSeIgnora() public {
        bytes32 id = keccak256("estado-falso");
        ChequeFund.Cheque memory d = _datos(LIB_A, 10 ether, 9 ether);
        d.estado = ChequeFund.Estado.Paid; // intento de colarlo ya pagado
        vm.prank(originador);
        fund.registrarCheque(id, d);
        assertEq(uint8(fund.cheques(id).estado), uint8(ChequeFund.Estado.Pending));
    }

    function test_losDatosDelChequeQuedanGuardadosTalCualSeRegistraron() public {
        bytes32 id = keccak256("datos-ok");
        ChequeFund.Cheque memory d = _datos(LIB_B, 4_500_000 ether, 4_437_000 ether);
        d.tipo = 1;
        d.industria = 7;
        d.tipoGarantia = 3;
        d.coberturaBps = 8500;
        d.garantiaHash = keccak256("garantia");
        vm.prank(originador);
        fund.registrarCheque(id, d);
        ChequeFund.Cheque memory g = fund.cheques(id);
        assertEq(g.libradorHash, LIB_B);
        assertEq(g.pyme, pyme);
        assertEq(g.nominal, d.nominal);
        assertEq(g.precioCompra, d.precioCompra);
        assertEq(g.vencimiento, d.vencimiento);
        assertEq(g.puntaje, d.puntaje);
        assertEq(g.tasaBps, d.tasaBps);
        assertEq(g.cotizacionHash, d.cotizacionHash);
        assertEq(g.tipo, 1);
        assertEq(g.industria, 7);
        assertEq(g.tipoGarantia, 3);
        assertEq(g.coberturaBps, 8500);
        assertEq(g.garantiaHash, keccak256("garantia"));
        assertEq(uint8(g.estado), uint8(ChequeFund.Estado.Pending));
    }

    // ------------------------------------------------------------------ valores y propiedades

    function test_totalAssetsEsSaldoMasLoFondeado() public {
        _depositar(inv1, POOL);
        _registrarYFondear(keccak256("a"), LIB_A, 10_000_000 ether, 9_500_000 ether);
        _registrarYFondear(keccak256("b"), LIB_B, 4_000_000 ether, 3_900_000 ether);
        assertEq(fund.totalAssets(), token.balanceOf(address(fund)) + 9_500_000 ether + 3_900_000 ether);
        assertEq(fund.totalAssets(), POOL);
    }

    function test_dosInversoresComparteElResultadoEnProporcion() public {
        uint256 c1 = _depositar(inv1, 70_000_000 ether);
        uint256 c2 = _depositar(inv2, 30_000_000 ether);
        bytes32 id = keccak256("a");
        _registrarYFondear(id, LIB_A, 10_000_000 ether, 9_500_000 ether);
        _pagar(id); // el fondo gana 500.000 sobre 100 M

        uint256 v1 = fund.previewRedeem(c1);
        uint256 v2 = fund.previewRedeem(c2);
        assertApproxEqAbs(v1, 70_000_000 ether + 350_000 ether, 1 ether);
        assertApproxEqAbs(v2, 30_000_000 ether + 150_000 ether, 1 ether);
        assertApproxEqAbs(v1 + v2, POOL + 500_000 ether, 2);
    }

    function testFuzz_pagarSiempreSubeElValorDeLaCuotaparte(uint96 precioSeed, uint96 descuentoSeed) public {
        uint256 precio = bound(uint256(precioSeed), 1 ether, 10_000_000 ether); // hasta el tope del 10 %
        uint256 descuento = bound(uint256(descuentoSeed), 1, precio);
        uint256 cuotas = _depositar(inv1, POOL);
        uint256 antes = fund.previewRedeem(cuotas);
        bytes32 id = keccak256("fuzz");
        _registrarYFondear(id, LIB_A, precio + descuento, precio);
        assertEq(fund.totalAssets(), POOL, "comprar no cambia el valor");
        _pagar(id);
        assertEq(fund.totalAssets(), POOL + descuento);
        assertGe(fund.previewRedeem(cuotas), antes);
    }

    function testFuzz_rechazarSiempreBajaElValorEnElPrecio(uint96 precioSeed) public {
        uint256 precio = bound(uint256(precioSeed), 1 ether, 10_000_000 ether);
        _depositar(inv1, POOL);
        bytes32 id = keccak256("fuzz2");
        _registrarYFondear(id, LIB_A, precio + 1 ether, precio);
        _rechazar(id);
        assertEq(fund.totalAssets(), POOL - precio);
        assertEq(fund.exposicion(LIB_A), 0);
    }

    function test_elFondoNuncaQuedaConExposicionNegativaNiTotalFondeadoDesfasado() public {
        _depositar(inv1, POOL);
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        _registrarYFondear(a, LIB_A, 6_000_000 ether, 5_000_000 ether);
        _registrarYFondear(b, LIB_A, 5_500_000 ether, 5_000_000 ether); // 10 M en total: justo el tope
        _pagar(a);
        _rechazar(b);
        assertEq(fund.exposicion(LIB_A), 0);
        assertEq(fund.exposicionIndustria(1), 0);
        assertEq(fund.totalAssets(), token.balanceOf(address(fund)), "sin cheques comprados, totalAssets es solo el saldo");
    }
}
