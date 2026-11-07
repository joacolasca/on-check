// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockARGt} from "../src/MockARGt.sol";
import {ChequeToken} from "../src/ChequeToken.sol";
import {ChequeFund} from "../src/ChequeFund.sol";

/// Base común de los tests del fondo: despliega todo, da los roles y trae los helpers.
/// El reloj arranca un lunes a las 10:00 de Buenos Aires (así los rescates tienen una fecha conocida).
abstract contract FondoBase is Test {
    MockARGt token;
    ChequeToken nft;
    ChequeFund fund;

    address admin = makeAddr("admin");
    address originador = makeAddr("originador");
    address oraculo = makeAddr("oraculo");
    address gestor = makeAddr("gestor");
    address inv1 = makeAddr("inversor1");
    address inv2 = makeAddr("inversor2");
    address pyme = makeAddr("pyme");
    address extrano = makeAddr("extrano");

    bytes32 constant LIB_A = keccak256("librador-A");
    bytes32 constant LIB_B = keccak256("librador-B");
    bytes32 constant LIB_C = keccak256("librador-C");
    bytes32 constant LIB_D = keccak256("librador-D");

    /// Lunes 18-1-2027 a las 00:00 de Buenos Aires (03:00 UTC).
    uint256 constant LUNES = 1_800_241_200;
    /// Patrimonio de la demo v2: Inversor 1 $70 M + Inversor 2 $30 M. Topes: 10 M por librador, 25 M por industria, 15 M de liquidez.
    uint256 constant POOL = 100_000_000 ether;

    function setUp() public virtual {
        vm.warp(LUNES + 10 hours);
        token = new MockARGt();
        nft = new ChequeToken(admin);
        fund = new ChequeFund(token, admin, nft);
        vm.startPrank(admin);
        nft.setFondo(address(fund));
        fund.grantRole(fund.ORIGINADOR_ROLE(), originador);
        fund.grantRole(fund.ORACULO_ROLE(), oraculo);
        fund.grantRole(fund.GESTOR_ROLE(), gestor);
        fund.setKyc(inv1, true);
        fund.setKyc(inv2, true);
        vm.stopPrank();
        // el oráculo tiene ARGt y deja un permiso grande para poder pagar nominales
        token.mint(oraculo, 1_000_000_000 ether);
        vm.prank(oraculo);
        token.approve(address(fund), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers

    function _depositar(address inv, uint256 monto) internal returns (uint256 cuotapartes) {
        token.mint(inv, monto);
        vm.startPrank(inv);
        token.approve(address(fund), monto);
        cuotapartes = fund.deposit(monto, inv);
        vm.stopPrank();
    }

    /// Suscribe exactamente `cuotapartes` (en wei, enteras) con `mint`, pagando lo que dice `previewMint`. Devuelve el monto pagado.
    function _suscribir(address inv, uint256 cuotapartes) internal returns (uint256 monto) {
        monto = fund.previewMint(cuotapartes);
        token.mint(inv, monto);
        vm.startPrank(inv);
        token.approve(address(fund), monto);
        fund.mint(cuotapartes, inv);
        vm.stopPrank();
    }

    /// Cada librador de prueba tiene su propia industria, para que la regla del 25 % no interfiera con los tests de librador.
    function _industriaDe(bytes32 librador) internal pure returns (uint8) {
        if (librador == LIB_A) return 1;
        if (librador == LIB_B) return 2;
        if (librador == LIB_C) return 3;
        return 4;
    }

    function _datosInd(bytes32 librador, uint256 nominal, uint256 precio, uint8 industria) internal view returns (ChequeFund.Cheque memory) {
        return ChequeFund.Cheque({
            libradorHash: librador,
            pyme: pyme,
            nominal: nominal,
            precioCompra: precio,
            vencimiento: uint64(block.timestamp + 60 days),
            puntaje: 95,
            tasaBps: 2606,
            cotizacionHash: keccak256("cotizacion"),
            tipo: 0,
            industria: industria,
            tipoGarantia: 0,
            coberturaBps: 0,
            garantiaHash: bytes32(0),
            estado: ChequeFund.Estado.None
        });
    }

    function _datos(bytes32 librador, uint256 nominal, uint256 precio) internal view returns (ChequeFund.Cheque memory) {
        return _datosInd(librador, nominal, precio, _industriaDe(librador));
    }

    function _registrar(bytes32 id, bytes32 librador, uint256 nominal, uint256 precio) internal {
        vm.prank(originador);
        fund.registrarCheque(id, _datos(librador, nominal, precio));
    }

    function _registrarInd(bytes32 id, bytes32 librador, uint256 nominal, uint256 precio, uint8 industria) internal {
        vm.prank(originador);
        fund.registrarCheque(id, _datosInd(librador, nominal, precio, industria));
    }

    function _fondear(bytes32 id) internal {
        vm.prank(originador);
        fund.fondearCheque(id);
    }

    function _registrarYFondear(bytes32 id, bytes32 librador, uint256 nominal, uint256 precio) internal {
        _registrar(id, librador, nominal, precio);
        _fondear(id);
    }

    function _pagar(bytes32 id) internal {
        vm.prank(oraculo);
        fund.marcarPagado(id);
    }

    function _rechazar(bytes32 id) internal {
        vm.prank(oraculo);
        fund.marcarRechazado(id);
    }

    function _estado(bytes32 id) internal view returns (ChequeFund.Estado) {
        return fund.cheques(id).estado;
    }

    /// El admin afloja las tres reglas del fondo (para probar errores que con los valores por defecto no se alcanzan).
    function _aflojarReglas() internal {
        vm.startPrank(admin);
        fund.setMaxConcentracionBps(10_000);
        fund.setMaxIndustriaBps(10_000);
        fund.setLiquidezMinBps(0);
        vm.stopPrank();
    }
}
