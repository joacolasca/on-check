// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ChequeToken} from "../src/ChequeToken.sol";
import {ChequeFund} from "../src/ChequeFund.sol";
import {FondoBase} from "./FondoBase.t.sol";

/// Tokenización: un NFT por cheque. Solo el fondo lo mueve; los usuarios no pueden transferirlo.
contract ChequeTokenTest is FondoBase {
    bytes32 constant ID = keccak256("cheque-nft");

    function _id() internal pure returns (uint256) {
        return uint256(ID);
    }

    function test_elTokenTieneNombreYSimbolo() public view {
        assertEq(nft.name(), "Activo del Fondo");
        assertEq(nft.symbol(), "ACT");
        assertEq(nft.fondo(), address(fund));
        assertEq(nft.admin(), admin);
    }

    // ------------------------------------------------------------------ ciclo del token

    function test_registrarMintaElTokenALaPyme() public {
        _registrar(ID, LIB_A, 10 ether, 9 ether);
        assertEq(nft.ownerOf(_id()), pyme);
        assertEq(nft.balanceOf(pyme), 1);
    }

    function test_fondearTransfiereElTokenAlFondo() public {
        _depositar(inv1, POOL);
        _registrar(ID, LIB_A, 10_000_000 ether, 9_500_000 ether);
        _fondear(ID);
        assertEq(nft.ownerOf(_id()), address(fund));
        assertEq(nft.balanceOf(pyme), 0);
    }

    function test_pagarQuemaElToken() public {
        _depositar(inv1, POOL);
        _registrarYFondear(ID, LIB_A, 10_000_000 ether, 9_500_000 ether);
        _pagar(ID);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, _id()));
        nft.ownerOf(_id());
        assertEq(nft.balanceOf(address(fund)), 0);
    }

    function test_rechazarDejaElTokenEnElFondo() public {
        _depositar(inv1, POOL);
        _registrarYFondear(ID, LIB_A, 10_000_000 ether, 9_500_000 ether);
        _rechazar(ID);
        assertEq(nft.ownerOf(_id()), address(fund));
    }

    function test_unChequeSinFondearSeQuedaEnLaPyme() public {
        _registrar(ID, LIB_A, 10 ether, 9 ether);
        vm.expectRevert(); // con el fondo vacío no se puede fondear
        _fondear(ID);
        assertEq(nft.ownerOf(_id()), pyme);
    }

    // ------------------------------------------------------------------ quién puede moverlo

    function test_laPymeNoPuedeTransferirSuToken() public {
        _registrar(ID, LIB_A, 10 ether, 9 ether);
        vm.startPrank(pyme);
        vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, pyme));
        nft.transferFrom(pyme, extrano, _id());
        vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, pyme));
        nft.safeTransferFrom(pyme, extrano, _id());
        vm.stopPrank();
        assertEq(nft.ownerOf(_id()), pyme);
    }

    function test_unTerceroAprobadoTampocoPuedeMoverlo() public {
        _registrar(ID, LIB_A, 10 ether, 9 ether);
        vm.startPrank(pyme);
        nft.approve(extrano, _id());
        nft.setApprovalForAll(inv1, true);
        vm.stopPrank();

        vm.prank(extrano);
        vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, extrano));
        nft.transferFrom(pyme, extrano, _id());
        vm.prank(inv1);
        vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, inv1));
        nft.transferFrom(pyme, inv1, _id());
        assertEq(nft.ownerOf(_id()), pyme);
    }

    function test_nadieMasQueElFondoPuedeEmitirMoverNiQuemar() public {
        _registrar(ID, LIB_A, 10 ether, 9 ether);
        address[4] memory quienes = [extrano, admin, originador, pyme];
        for (uint256 i; i < quienes.length; i++) {
            vm.startPrank(quienes[i]);
            vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, quienes[i]));
            nft.emitir(quienes[i], 123, 0, 1 ether, uint64(block.timestamp + 1 days));
            vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, quienes[i]));
            nft.mover(_id(), quienes[i]);
            vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, quienes[i]));
            nft.quemar(_id());
            vm.stopPrank();
        }
        assertEq(nft.ownerOf(_id()), pyme);
    }

    function test_elTokenQueTieneElFondoNoSeSaleDelFondo() public {
        _depositar(inv1, POOL);
        _registrarYFondear(ID, LIB_A, 10_000_000 ether, 9_500_000 ether);
        vm.prank(extrano);
        vm.expectRevert();
        nft.transferFrom(address(fund), extrano, _id());
        assertEq(nft.ownerOf(_id()), address(fund));
    }

    // ------------------------------------------------------------------ setFondo

    function test_setFondoSoloElAdminYUnaSolaVez() public {
        ChequeToken otro = new ChequeToken(admin);
        assertEq(otro.fondo(), address(0));

        vm.prank(extrano);
        vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElAdmin.selector, extrano));
        otro.setFondo(address(fund));

        vm.prank(admin);
        vm.expectRevert(ChequeToken.FondoInvalido.selector);
        otro.setFondo(address(0));

        vm.prank(admin);
        otro.setFondo(address(fund));
        assertEq(otro.fondo(), address(fund));

        vm.prank(admin);
        vm.expectRevert(ChequeToken.FondoYaDefinido.selector);
        otro.setFondo(extrano);
    }

    function test_antesDeSetFondoNadieMueveTokens() public {
        ChequeToken otro = new ChequeToken(admin);
        vm.expectRevert(abi.encodeWithSelector(ChequeToken.SoloElFondo.selector, address(this)));
        otro.emitir(pyme, 1, 0, 1 ether, uint64(block.timestamp + 1 days));
    }

    // ------------------------------------------------------------------ tokenURI

    function test_tokenURIDevuelveUnJsonDataConTipoNominalYVencimiento() public {
        ChequeFund.Cheque memory d = _datos(LIB_A, 12_345 ether, 12_000 ether);
        d.tipo = 1; // pagaré
        vm.prank(originador);
        fund.registrarCheque(ID, d);

        string memory esperado = string.concat(
            "data:application/json;base64,",
            Base64.encode(
                abi.encodePacked(
                    '{"name":"Activo del Fondo","tipo":"pagare","nominal":"12345000000000000000000","vencimiento":',
                    vm.toString(uint256(d.vencimiento)),
                    "}"
                )
            )
        );
        assertEq(nft.tokenURI(_id()), esperado);
    }

    function test_tokenURIdeUnChequeInexistenteRevierte() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(5)));
        nft.tokenURI(5);
    }
}
