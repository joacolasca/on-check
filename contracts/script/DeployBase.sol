// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockARGt} from "../src/MockARGt.sol";
import {ChequeToken} from "../src/ChequeToken.sol";
import {ChequeFund} from "../src/ChequeFund.sol";

/// @notice Lógica del despliegue (MockARGt, ChequeToken y ChequeFund) de la demo, separada del script para poder testearla (el script la ejecuta dentro de un broadcast).
abstract contract DeployBase {
    uint256 internal constant MINT_ORACULO = 1_000_000_000 ether; // el oráculo paga los nominales al "adelantar tiempo"
    uint256 internal constant MINT_INVERSOR = 100_000_000 ether;

    struct Cuentas {
        address originador;
        address oraculo;
        address inversor1;
        address inversor2;
        address pyme;
    }

    /// @dev Se llama con msg.sender = quien será admin del fondo.
    function _desplegar(address admin, Cuentas memory c) internal returns (MockARGt argt, ChequeToken token, ChequeFund fund) {
        argt = new MockARGt();
        token = new ChequeToken(admin);
        fund = new ChequeFund(argt, admin, token);
        token.setFondo(address(fund));
        fund.grantRole(fund.ORIGINADOR_ROLE(), c.originador);
        // En la demo la misma wallet es oráculo y gestor (PM).
        fund.grantRole(fund.ORACULO_ROLE(), c.oraculo);
        fund.grantRole(fund.GESTOR_ROLE(), c.oraculo);
        // El receptor de la comisión es el admin y ya queda con KYC desde el constructor.
        fund.setKyc(c.inversor1, true);
        fund.setKyc(c.inversor2, true);
        fund.setKyc(c.pyme, true);
        argt.mint(c.oraculo, MINT_ORACULO);
        argt.mint(c.inversor1, MINT_INVERSOR);
        argt.mint(c.inversor2, MINT_INVERSOR);
    }
}
