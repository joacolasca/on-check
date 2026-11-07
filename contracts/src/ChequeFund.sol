// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ChequeToken} from "./ChequeToken.sol";

/// @title ChequeFund v2: fondo de cheques y pagarés con gestor, cada documento como registro público (y como NFT)
/// @notice Pool único (ERC-4626) sobre ARGt. El inversor deposita y recibe cuotapartes (valor inicial $1.000); el fondo le compra
/// cheques y pagarés con descuento a las pymes. Las reglas duras las hace cumplir el contrato: KYC, tope por librador (10 %),
/// tope por industria (25 %) y liquidez mínima (15 %). El backend y el agente proponen, el contrato dispone (D10).
/// Los rescates van en cola: el inversor los solicita y el gestor los liquida pasado el plazo. Spec: docs/V2-SPEC.md.
contract ChequeFund is ERC4626, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Estado {
        None,
        Pending,
        Funded,
        Paid,
        Rejected
    }

    enum EstadoRescate {
        None,
        Pendiente,
        Liquidado,
        Cancelado
    }

    struct Cheque {
        bytes32 libradorHash; // keccak256(cuit ‖ salt): el CUIT nunca va en claro (D9)
        address pyme; // quien recibe el adelanto
        uint256 nominal; // ARGt, 18 decimales
        uint256 precioCompra; // lo que se adelanta a la pyme
        uint64 vencimiento; // unix timestamp
        uint8 puntaje; // 0–100
        uint16 tasaBps; // TNA en basis points (2800 = 28%)
        bytes32 cotizacionHash; // keccak256 del JSON de la cotización (D8)
        uint8 tipo; // 0 cheque, 1 pagaré
        uint8 industria; // id de shared/industrias.json (0–12)
        uint8 tipoGarantia; // orden de TIPOS_GARANTIA (0–9)
        uint16 coberturaBps; // cobertura de la garantía sobre el nominal, en bps
        bytes32 garantiaHash; // keccak256 del análisis de garantía
        Estado estado;
    }

    struct Rescate {
        address duenio;
        uint256 shares; // cuotapartes en custodia del fondo mientras está Pendiente
        uint256 assets; // ARGt pagados (0 hasta que se liquida)
        uint64 solicitadoEn;
        uint64 liquidableDesde;
        EstadoRescate estado;
    }

    bytes32 public constant ORIGINADOR_ROLE = keccak256("ORIGINADOR_ROLE");
    bytes32 public constant ORACULO_ROLE = keccak256("ORACULO_ROLE");
    /// @notice El gestor (PM) del fondo: liquida los rescates.
    bytes32 public constant GESTOR_ROLE = keccak256("GESTOR_ROLE");

    uint256 private constant BPS = 10_000;
    /// @notice Pesos por cuotaparte cuando el fondo está vacío ($1.000).
    uint256 public constant PRECIO_INICIAL = 1000;
    /// @notice Suscripción mínima: 1.000 cuotapartes (18 decimales). "Se negocia a mínimo 1.000 cuotapartes y de a 1."
    uint256 public constant MIN_CUOTAPARTES = 1000e18;
    uint8 private constant MAX_INDUSTRIA = 12;
    uint8 private constant MAX_TIPO = 1;
    uint8 private constant MAX_TIPO_GARANTIA = 9;
    uint256 private constant ANIO = 365 days;
    /// @dev Buenos Aires es UTC−3 todo el año (sin horario de verano).
    uint256 private constant OFFSET_BA = 3 hours;
    uint256 private constant CORTE_RESCATE = 15 hours;

    /// @notice Tope de exposición por librador, en bps del patrimonio (1000 = 10 %).
    uint16 public maxConcentracionBps = 1000;
    /// @notice Tope de exposición por industria, en bps del patrimonio (2500 = 25 %).
    uint16 public maxIndustriaBps = 2500;
    /// @notice Liquidez mínima en ARGt, en bps del patrimonio, que debe quedar después de comprar un cheque (1500 = 15 %).
    uint16 public liquidezMinBps = 1500;
    /// @notice Comisión anual sobre el patrimonio, en bps (300 = 3 %). Se devenga día a día en cuotapartes.
    uint16 public comisionAnualBps = 300;
    /// @notice Quien recibe las cuotapartes de la comisión (por defecto el admin).
    address public feeReceptor;
    /// @notice Último momento hasta el que se devengó la comisión.
    uint64 public ultimoDevengo;
    /// @notice Si está activo, el gestor puede liquidar rescates sin esperar el plazo (solo para la demo).
    bool public modoDemo;

    /// @notice Solo estas direcciones pueden depositar, rescatar y recibir cuotapartes.
    mapping(address => bool) public kyc;
    /// @notice Lo que el fondo tiene hoy comprado (Funded) a cada librador, en ARGt.
    mapping(bytes32 => uint256) public exposicion;
    /// @notice Lo que el fondo tiene hoy comprado (Funded) en cada industria, en ARGt.
    mapping(uint8 => uint256) public exposicionIndustria;

    /// @notice NFT de cada cheque; solo este fondo lo puede mover.
    ChequeToken public immutable chequeToken;

    mapping(bytes32 => Cheque) private _cheques;
    Rescate[] private _rescates;
    /// @dev Suma de `precioCompra` de los cheques en estado Funded. Entra en `totalAssets()`.
    uint256 private _totalFondeado;
    /// @dev Verdadero solo mientras el fondo mueve cuotapartes hacia/desde su custodia (rescates).
    bool private _enCustodia;

    event ChequeRegistrado(bytes32 indexed id, bytes32 indexed libradorHash, Cheque datos);
    event ChequeFondeado(bytes32 indexed id, uint256 precioCompra);
    event ChequePagado(bytes32 indexed id, uint256 nominal);
    event ChequeRechazado(bytes32 indexed id, uint256 perdida);
    event KycActualizado(address indexed cuenta, bool ok);
    event ComisionDevengada(uint256 shares, uint64 hasta);
    event RescateSolicitado(uint256 indexed id, address indexed duenio, uint256 shares, uint64 liquidableDesde);
    event RescateLiquidado(uint256 indexed id, address indexed duenio, uint256 shares, uint256 assets);
    event RescateCancelado(uint256 indexed id);
    event ModoDemoActualizado(bool activo);

    error ChequeYaRegistrado(bytes32 id);
    error ChequeInexistente(bytes32 id);
    error EstadoInvalido(bytes32 id, Estado actual, Estado esperado);
    error DatosInvalidos(string motivo);
    /// @dev El cheque llevaría la exposición del librador por encima del tope.
    error ConcentracionExcedida(bytes32 libradorHash, uint256 exposicionProyectada, uint256 maximoPermitido);
    /// @dev El cheque llevaría la exposición de la industria por encima del tope.
    error IndustriaExcedida(uint8 industria, uint256 exposicionProyectada, uint256 maximoPermitido);
    /// @dev Después de comprar el cheque, la liquidez en ARGt quedaría por debajo del mínimo.
    error LiquidezMinimaInsuficiente(uint256 liquidezPosterior, uint256 minima);
    /// @dev La suscripción es de menos de `MIN_CUOTAPARTES` cuotapartes.
    error MinimoCuotapartes(uint256 shares, uint256 minimo);
    /// @dev La suscripción no es de cuotapartes enteras (de a 1).
    error CuotapartesEnteras(uint256 shares);
    error SinLiquidez(uint256 disponible, uint256 requerido);
    error SinKyc(address cuenta);
    error RescateInexistente(uint256 id);
    error RescateNoPendiente(uint256 id, EstadoRescate actual);
    error RescateNoVencido(uint256 id, uint64 liquidableDesde);
    error SoloElDuenio(address quien);

    constructor(IERC20 argt, address admin, ChequeToken token_) ERC4626(argt) ERC20("Fondo de Cheques", "cCHQ") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        chequeToken = token_;
        feeReceptor = admin;
        kyc[admin] = true; // el receptor de la comisión necesita KYC para poder rescatar
        ultimoDevengo = uint64(block.timestamp);
    }

    // ------------------------------------------------------------------ cheques

    /// @notice El originador (backend) registra un cheque o pagaré cotizado. Estado → Pending. Emite el NFT a la pyme. No mueve fondos.
    function registrarCheque(bytes32 id, Cheque calldata datos) external onlyRole(ORIGINADOR_ROLE) {
        if (_cheques[id].estado != Estado.None) revert ChequeYaRegistrado(id);
        if (datos.libradorHash == bytes32(0)) revert DatosInvalidos("libradorHash vacio");
        if (datos.pyme == address(0)) revert DatosInvalidos("pyme invalida");
        if (datos.nominal == 0 || datos.precioCompra == 0) revert DatosInvalidos("monto en cero");
        if (datos.precioCompra > datos.nominal) revert DatosInvalidos("el precio supera al nominal");
        if (datos.vencimiento <= block.timestamp) revert DatosInvalidos("vencimiento en el pasado");
        if (datos.puntaje > 100) revert DatosInvalidos("puntaje fuera de rango");
        if (datos.tipo > MAX_TIPO) revert DatosInvalidos("tipo invalido (0 cheque, 1 pagare)");
        if (datos.industria > MAX_INDUSTRIA) revert DatosInvalidos("industria invalida");
        if (datos.tipoGarantia > MAX_TIPO_GARANTIA) revert DatosInvalidos("tipo de garantia invalido");

        Cheque memory c = datos;
        c.estado = Estado.Pending; // el estado que venga en `datos` se ignora
        _cheques[id] = c;

        emit ChequeRegistrado(id, datos.libradorHash, c);
        chequeToken.emitir(datos.pyme, uint256(id), datos.tipo, datos.nominal, datos.vencimiento);
    }

    /// @notice El fondo compra el cheque: transfiere `precioCompra` a la pyme con la liquidez del pool y recibe el NFT. Pending → Funded.
    /// @dev Reglas duras, sobre el patrimonio actual: librador ≤ maxConcentracionBps, industria ≤ maxIndustriaBps y
    /// liquidez posterior ≥ liquidezMinBps.
    function fondearCheque(bytes32 id) external nonReentrant onlyRole(ORIGINADOR_ROLE) {
        _devengar();
        Cheque storage c = _cheques[id];
        _exigirEstado(id, c.estado, Estado.Pending);

        uint256 patrimonio = totalAssets();

        uint256 proyectada = exposicion[c.libradorHash] + c.precioCompra;
        uint256 maximo = Math.mulDiv(patrimonio, maxConcentracionBps, BPS);
        if (proyectada > maximo) revert ConcentracionExcedida(c.libradorHash, proyectada, maximo);

        uint256 proyectadaIndustria = exposicionIndustria[c.industria] + c.precioCompra;
        uint256 maximoIndustria = Math.mulDiv(patrimonio, maxIndustriaBps, BPS);
        if (proyectadaIndustria > maximoIndustria) revert IndustriaExcedida(c.industria, proyectadaIndustria, maximoIndustria);

        uint256 disponible = IERC20(asset()).balanceOf(address(this));
        if (disponible < c.precioCompra) revert SinLiquidez(disponible, c.precioCompra);

        uint256 liquidezPosterior = disponible - c.precioCompra;
        uint256 minima = Math.mulDiv(patrimonio, liquidezMinBps, BPS, Math.Rounding.Ceil);
        if (liquidezPosterior < minima) revert LiquidezMinimaInsuficiente(liquidezPosterior, minima);

        c.estado = Estado.Funded;
        exposicion[c.libradorHash] = proyectada;
        exposicionIndustria[c.industria] = proyectadaIndustria;
        _totalFondeado += c.precioCompra;

        emit ChequeFondeado(id, c.precioCompra);
        chequeToken.mover(uint256(id), address(this));
        IERC20(asset()).safeTransfer(c.pyme, c.precioCompra);
    }

    /// @notice El oráculo confirma el cobro: transfiere `nominal` al fondo (necesita ARGt y allowance) y se quema el NFT. Funded → Paid.
    function marcarPagado(bytes32 id) external nonReentrant onlyRole(ORACULO_ROLE) {
        _devengar();
        Cheque storage c = _cheques[id];
        _exigirEstado(id, c.estado, Estado.Funded);

        c.estado = Estado.Paid;
        _cerrarPosicion(c);

        emit ChequePagado(id, c.nominal);
        chequeToken.quemar(uint256(id));
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), c.nominal);
    }

    /// @notice El oráculo confirma que el cheque rebotó: la pérdida (el precio pagado) queda registrada. Funded → Rejected.
    /// El NFT queda en el fondo.
    function marcarRechazado(bytes32 id) external nonReentrant onlyRole(ORACULO_ROLE) {
        _devengar();
        Cheque storage c = _cheques[id];
        _exigirEstado(id, c.estado, Estado.Funded);

        c.estado = Estado.Rejected;
        _cerrarPosicion(c);

        emit ChequeRechazado(id, c.precioCompra);
    }

    function cheques(bytes32 id) external view returns (Cheque memory) {
        return _cheques[id];
    }

    // ------------------------------------------------------------------ rescates en cola

    /// @notice El inversor pide rescatar `shares` cuotapartes: quedan en custodia del fondo hasta que el gestor liquide.
    /// El valor se fija al liquidar, no al solicitar.
    function solicitarRescate(uint256 shares) external returns (uint256 id) {
        if (!kyc[msg.sender]) revert SinKyc(msg.sender);
        if (shares == 0) revert DatosInvalidos("cuotapartes en cero");
        _devengar();

        uint64 desde = liquidableDesde(uint64(block.timestamp));
        id = _rescates.length;
        _rescates.push(Rescate(msg.sender, shares, 0, uint64(block.timestamp), desde, EstadoRescate.Pendiente));
        _moverEnCustodia(msg.sender, address(this), shares); // revierte si no tiene tantas cuotapartes

        emit RescateSolicitado(id, msg.sender, shares, desde);
    }

    /// @notice El dueño cancela su rescate mientras está Pendiente y recupera las cuotapartes.
    function cancelarRescate(uint256 id) external {
        Rescate storage r = _rescatePendiente(id);
        if (msg.sender != r.duenio) revert SoloElDuenio(msg.sender);

        r.estado = EstadoRescate.Cancelado;
        _moverEnCustodia(address(this), r.duenio, r.shares);
        emit RescateCancelado(id);
    }

    /// @notice El gestor liquida un rescate vencido (o cualquiera, con `modoDemo`): paga al valor de la cuotaparte de este momento
    /// y quema las cuotapartes. Revierte con `SinLiquidez` si el fondo no tiene tanto ARGt libre.
    function liquidarRescate(uint256 id) external nonReentrant onlyRole(GESTOR_ROLE) {
        _devengar();
        Rescate storage r = _rescatePendiente(id);
        if (!modoDemo && block.timestamp < r.liquidableDesde) revert RescateNoVencido(id, r.liquidableDesde);
        if (!kyc[r.duenio]) revert SinKyc(r.duenio);

        uint256 assets = _convertToAssets(r.shares, Math.Rounding.Floor);
        uint256 disponible = IERC20(asset()).balanceOf(address(this));
        if (disponible < assets) revert SinLiquidez(disponible, assets);

        r.estado = EstadoRescate.Liquidado;
        r.assets = assets;
        _burn(address(this), r.shares);

        emit RescateLiquidado(id, r.duenio, r.shares, assets);
        IERC20(asset()).safeTransfer(r.duenio, assets);
    }

    function rescates(uint256 id) external view returns (Rescate memory) {
        if (id >= _rescates.length) revert RescateInexistente(id);
        return _rescates[id];
    }

    function cantidadRescates() external view returns (uint256) {
        return _rescates.length;
    }

    /// @notice Desde cuándo se puede liquidar un rescate pedido en `ts`. Hora de Buenos Aires (UTC−3), días hábiles lunes a viernes
    /// (feriados no se consideran, TODO(confirmar)). Pedido en día hábil antes de las 15:00: el plazo corre desde ese día; si es
    /// después de las 15:00 o fin de semana, desde el siguiente día hábil. Vence a las 00:00 (BA) del día hábil siguiente al de inicio.
    function liquidableDesde(uint64 ts) public pure returns (uint64) {
        uint256 local = uint256(ts) - OFFSET_BA; // reloj de Buenos Aires
        uint256 dia = local / 1 days;
        bool aTiempo = _esHabil(dia) && (local % 1 days) < CORTE_RESCATE;
        uint256 inicio = aTiempo ? dia : _siguienteHabil(dia);
        return uint64(_siguienteHabil(inicio) * 1 days + OFFSET_BA); // 00:00 de BA = 03:00 UTC
    }

    // ---------------------------------------------------------------- administración

    function setKyc(address cuenta, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE) {
        kyc[cuenta] = ok;
        emit KycActualizado(cuenta, ok);
    }

    /// @notice Cambia el tope de concentración por librador (default 1000 = 10 %).
    function setMaxConcentracionBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > BPS) revert DatosInvalidos("el tope no puede superar 10000 bps");
        maxConcentracionBps = bps;
    }

    /// @notice Cambia el tope por industria (default 2500 = 25 %).
    function setMaxIndustriaBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > BPS) revert DatosInvalidos("el tope no puede superar 10000 bps");
        maxIndustriaBps = bps;
    }

    /// @notice Cambia la liquidez mínima (default 1500 = 15 %).
    function setLiquidezMinBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > BPS) revert DatosInvalidos("la liquidez minima no puede superar 10000 bps");
        liquidezMinBps = bps;
    }

    /// @notice Cambia la comisión anual (default 300 = 3 %, máximo 1000 = 10 %). Antes devenga lo acumulado a la tasa vieja.
    function setComisionAnualBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > 1000) revert DatosInvalidos("la comision no puede superar 1000 bps");
        _devengar();
        comisionAnualBps = bps;
    }

    /// @notice Cambia quien recibe la comisión. Antes devenga lo acumulado para el receptor anterior; el nuevo queda con KYC.
    function setFeeReceptor(address receptor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (receptor == address(0)) revert DatosInvalidos("receptor invalido");
        _devengar();
        feeReceptor = receptor;
        kyc[receptor] = true;
        emit KycActualizado(receptor, true);
    }

    function setModoDemo(bool activo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        modoDemo = activo;
        emit ModoDemoActualizado(activo);
    }

    // ---------------------------------------------------------------------- comisión

    /// @notice Cuotapartes de comisión devengadas desde el último devengo y todavía no emitidas.
    function comisionPendiente() external view returns (uint256) {
        return _comisionPendiente(block.timestamp - ultimoDevengo);
    }

    /// @dev Con f = comisionAnualBps * dt / (10000 * 1 año), se emiten supply * f / (1 − f) cuotapartes al receptor:
    /// así el receptor queda con exactamente la fracción f del fondo.
    function _comisionPendiente(uint256 dt) private view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0 || comisionAnualBps == 0 || dt == 0) return 0;
        uint256 x = uint256(comisionAnualBps) * dt;
        return Math.mulDiv(supply, x, BPS * ANIO - x);
    }

    function _devengar() internal {
        uint256 dt = block.timestamp - ultimoDevengo;
        if (dt == 0) return;
        uint256 shares = _comisionPendiente(dt);
        ultimoDevengo = uint64(block.timestamp);
        if (shares > 0) {
            _mint(feeReceptor, shares);
            emit ComisionDevengada(shares, uint64(block.timestamp));
        }
    }

    // ---------------------------------------------------------------------- ERC-4626

    /// @notice Saldo de ARGt del fondo + suma de `precioCompra` de los cheques Funded (los cheques se valúan a lo pagado).
    /// El valor de la cuotaparte sube cuando un cheque se paga (entra el nominal) y baja si rebota (se pierde el precio).
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + _totalFondeado;
    }

    /// @dev Precio inicial $1.000: con el fondo vacío, shares = assets / 1000. Después, proporcional al patrimonio.
    function _convertToShares(uint256 assets, Math.Rounding rounding) internal view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return Math.mulDiv(assets, 1, PRECIO_INICIAL, rounding);
        uint256 patrimonio = totalAssets();
        if (patrimonio == 0) return 0;
        return Math.mulDiv(assets, supply, patrimonio, rounding);
    }

    function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return Math.mulDiv(shares, PRECIO_INICIAL, 1, rounding);
        return Math.mulDiv(shares, totalAssets(), supply, rounding);
    }

    function maxDeposit(address receptor) public view override returns (uint256) {
        return kyc[receptor] ? type(uint256).max : 0;
    }

    function maxMint(address receptor) public view override returns (uint256) {
        return kyc[receptor] ? type(uint256).max : 0;
    }

    /// @dev El retiro estándar de ERC-4626 está deshabilitado: se rescata con `solicitarRescate`.
    function maxWithdraw(address) public pure override returns (uint256) {
        return 0;
    }

    function maxRedeem(address) public pure override returns (uint256) {
        return 0;
    }

    /// @dev Devenga la comisión antes de calcular cuántas cuotapartes corresponden. Toda suscripción (deposit o mint) debe ser de
    /// al menos MIN_CUOTAPARTES y de cuotapartes enteras: la forma correcta de suscribir es `mint(shares, receptor)` con `previewMint`.
    /// La comisión devengada (`_devengar`) emite fracciones al receptor y no pasa por acá.
    function deposit(uint256 assets, address receptor) public override returns (uint256) {
        _devengar();
        return super.deposit(assets, receptor);
    }

    function mint(uint256 shares, address receptor) public override returns (uint256) {
        _devengar();
        return super.mint(shares, receptor);
    }

    function _deposit(address caller, address receptor, uint256 assets, uint256 shares) internal override {
        if (!kyc[caller]) revert SinKyc(caller);
        if (!kyc[receptor]) revert SinKyc(receptor);
        if (shares < MIN_CUOTAPARTES) revert MinimoCuotapartes(shares, MIN_CUOTAPARTES);
        if (shares % 1e18 != 0) revert CuotapartesEnteras(shares);
        super._deposit(caller, receptor, assets, shares);
    }

    /// @dev Las cuotapartes solo se transfieren entre direcciones con KYC. Mint y burn no se controlan acá, y el fondo
    /// puede tomarlas y devolverlas en custodia (rescates) solo a través de `_moverEnCustodia`.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && !_enCustodia) {
            if (!kyc[from]) revert SinKyc(from);
            if (!kyc[to]) revert SinKyc(to);
        }
        super._update(from, to, value);
    }

    // ---------------------------------------------------------------------- internos

    function _moverEnCustodia(address from, address to, uint256 shares) private {
        _enCustodia = true;
        _update(from, to, shares);
        _enCustodia = false;
    }

    function _rescatePendiente(uint256 id) private view returns (Rescate storage r) {
        if (id >= _rescates.length) revert RescateInexistente(id);
        r = _rescates[id];
        if (r.estado != EstadoRescate.Pendiente) revert RescateNoPendiente(id, r.estado);
    }

    function _exigirEstado(bytes32 id, Estado actual, Estado esperado) private pure {
        if (actual == Estado.None) revert ChequeInexistente(id);
        if (actual != esperado) revert EstadoInvalido(id, actual, esperado);
    }

    /// @dev Al cerrarse un cheque (pagado o rechazado) deja de estar comprado: baja la exposición y el total fondeado.
    function _cerrarPosicion(Cheque storage c) private {
        exposicion[c.libradorHash] -= c.precioCompra;
        exposicionIndustria[c.industria] -= c.precioCompra;
        _totalFondeado -= c.precioCompra;
    }

    /// @dev Día número `dia` desde el 1-1-1970 (que fue jueves). 0 = domingo … 6 = sábado.
    function _esHabil(uint256 dia) private pure returns (bool) {
        uint256 diaSemana = (dia + 4) % 7;
        return diaSemana != 0 && diaSemana != 6;
    }

    function _siguienteHabil(uint256 dia) private pure returns (uint256) {
        do {
            dia += 1;
        } while (!_esHabil(dia));
        return dia;
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
