// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title ChequeToken: un NFT por cada cheque o pagaré ("Activo del Fondo")
/// @notice `tokenId = uint256(chequeId)`. Solo el fondo puede emitirlo, moverlo o quemarlo: los usuarios no pueden
/// transferirlo (ni aprobando a un tercero). Ciclo: nace en la pyme al registrar, pasa al fondo al comprarlo y se quema al cobrarse.
contract ChequeToken is ERC721 {
    /// @dev Lo mínimo que muestra `tokenURI`; se guarda al emitir para que el token no dependa del fondo.
    struct Datos {
        uint8 tipo; // 0 cheque, 1 pagaré
        uint256 nominal;
        uint64 vencimiento;
    }

    address public immutable admin;
    /// @notice Único contrato autorizado a mover tokens. Se fija una sola vez con `setFondo`.
    address public fondo;
    mapping(uint256 => Datos) private _datos;

    error SoloElFondo(address quien);
    error SoloElAdmin(address quien);
    error FondoYaDefinido();
    error FondoInvalido();

    constructor(address admin_) ERC721("Activo del Fondo", "ACT") {
        admin = admin_;
    }

    /// @notice El admin conecta el fondo después de desplegarlo. Solo se puede una vez.
    function setFondo(address fondo_) external {
        if (msg.sender != admin) revert SoloElAdmin(msg.sender);
        if (fondo != address(0)) revert FondoYaDefinido();
        if (fondo_ == address(0)) revert FondoInvalido();
        fondo = fondo_;
    }

    function emitir(address a, uint256 tokenId, uint8 tipo, uint256 nominal, uint64 vencimiento) external {
        _datos[tokenId] = Datos(tipo, nominal, vencimiento);
        _mint(a, tokenId); // _update exige que quien llama sea el fondo
    }

    function mover(uint256 tokenId, address a) external {
        _update(a, tokenId, address(0));
    }

    function quemar(uint256 tokenId) external {
        _burn(tokenId);
    }

    /// @dev Punto único por donde pasa todo movimiento (mint, transfer y burn): si no lo hace el fondo, revierte.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (msg.sender != fondo) revert SoloElFondo(msg.sender);
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Datos memory d = _datos[tokenId];
        bytes memory json = abi.encodePacked(
            '{"name":"Activo del Fondo","tipo":"',
            d.tipo == 0 ? "cheque" : "pagare",
            '","nominal":"',
            Strings.toString(d.nominal),
            '","vencimiento":',
            Strings.toString(d.vencimiento),
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
