// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockARGt} from "../src/MockARGt.sol";
import {ChequeToken} from "../src/ChequeToken.sol";
import {ChequeFund} from "../src/ChequeFund.sol";
import {DeployBase} from "./DeployBase.sol";

/// @notice Despliega MockARGt, ChequeToken y ChequeFund en Base Sepolia y deja la demo lista:
/// roles (originador; oráculo con ORACULO y GESTOR), KYC de inversores, pyme y receptor de la comisión, mARGt para el oráculo y los inversores, y el permiso del oráculo al fondo.
///
/// Uso (desde contracts/, con las variables del .env cargadas):
///   DEPLOY_OUT=../shared/deployments/base-sepolia.json \
///   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
/// Las claves se leen del entorno y nunca se imprimen. Solo para testnet.
contract Deploy is Script, DeployBase {
    function run() external {
        require(block.chainid == 84532, "Solo Base Sepolia (84532)");

        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 oraculoPk = vm.envUint("ORACULO_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        Cuentas memory c = Cuentas({
            originador: vm.addr(vm.envUint("ORIGINADOR_PRIVATE_KEY")),
            oraculo: vm.addr(oraculoPk),
            inversor1: vm.addr(vm.envUint("INVERSOR1_PRIVATE_KEY")),
            inversor2: vm.addr(vm.envUint("INVERSOR2_PRIVATE_KEY")),
            pyme: vm.addr(vm.envUint("PYME_PRIVATE_KEY"))
        });

        vm.startBroadcast(deployerPk);
        (MockARGt argt, ChequeToken token, ChequeFund fund) = _desplegar(deployer, c);
        vm.stopBroadcast();

        // El oráculo autoriza al fondo a cobrar los nominales (lo firma el propio oráculo).
        vm.startBroadcast(oraculoPk);
        argt.approve(address(fund), type(uint256).max);
        vm.stopBroadcast();

        console.log("MockARGt:  ", address(argt));
        console.log("ChequeToken:", address(token));
        console.log("ChequeFund:", address(fund));

        string memory salida = vm.envOr("DEPLOY_OUT", string(""));
        if (bytes(salida).length > 0) {
            string memory o = "deploy";
            vm.serializeUint(o, "chainId", block.chainid);
            vm.serializeUint(o, "bloqueDespliegue", block.number);
            vm.serializeAddress(o, "mockARGt", address(argt));
            vm.serializeAddress(o, "chequeToken", address(token));
            vm.serializeAddress(o, "chequeFund", address(fund));
            vm.serializeAddress(o, "admin", deployer);
            vm.serializeAddress(o, "originador", c.originador);
            vm.serializeAddress(o, "oraculo", c.oraculo);
            vm.serializeAddress(o, "inversor1", c.inversor1);
            vm.serializeAddress(o, "inversor2", c.inversor2);
            string memory json = vm.serializeAddress(o, "pyme", c.pyme);
            vm.writeJson(json, salida);
            console.log("Direcciones guardadas en", salida);
        }
    }
}
