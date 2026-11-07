# Publicar en Vercel: pasos para Joaquín

La lista completa de variables está en el checklist de Rama (`docs/DEPLOY-WEB.md`, PR #41). Esto es el recorrido corto y la verificación.

1. **Importar:** vercel.com → Add New → Project → el repo `hackatwin-fondo-cheques`. Production branch: `main`. Framework: Next.js (lo detecta solo).
2. **Variables:** Settings → Environment Variables, **solo en Production**. Las secretas con *Sensitive* activado.
   - Las que te pasa Rama por privado: `BASE_SEPOLIA_RPC_URL`, las 4 claves privadas (originador, oráculo, inversor1, inversor2), `CUIT_SALT` (idéntica a la de Rama, si no cambia el hash de librador y se rompe el 40 %).
   - Públicas (están en `shared/deployments/base-sepolia.json`): `CHEQUE_FUND_ADDRESS`, `MOCK_ARGT_ADDRESS`, `ADMIN_ADDRESS`, `PYME_ADDRESS`; `CHEQUE_FUND_FROM_BLOCK=54059154`.
   - Las tuyas: `OPENROUTER_API_KEY`, `DEMO_CLAVE` y `COTIZACION_SECRETO` (inventá dos valores largos y aleatorios).
   - **No cargar:** `DEPLOYER_PRIVATE_KEY`, `PYME_PRIVATE_KEY`, `API_MODE`, `CHAIN_DEPLOYMENT_FILE`.
3. **Deploy.** Copiá la URL.
4. **Verificar** (solo lectura, no toca el fondo):

```bash
node scripts/verificar-deploy.mjs https://TU-URL.vercel.app
```

   Tiene que terminar en "Todo en orden". Si algo falla, el mensaje dice qué.
5. **Mirar a mano:** abrí la URL, entrá a `/api/demo/acceso` con tu `DEMO_CLAVE` y recorré `/` y `/pyme`.

**Importante:** no uses `pnpm demo:preparar` ni toques el fondo desde producción antes de la demo: Rama ya lo dejó preparado.
