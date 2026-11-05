# Publicar ALIUM en Render (plan gratuito de prueba)

El servidor de ALIUM sirve las páginas, el endpoint de eBay y la API de cuentas desde el mismo origen. No lo publiques como sitio estático: necesita arrancar `server.js` para mantener las credenciales en el servidor.

## Preparar el repositorio

1. El repositorio privado está en GitHub (`trabajosferrera-crypto/ALIUM-v2`). El `.gitignore` excluye `.env`, `.env.*` y `node_modules/`.
2. Render está conectado a ese repositorio y lee `render.yaml`. Cada push a `main` inicia un despliegue automático.
3. Los valores privados se configuran en **Environment**, nunca en el código:
   - `EBAY_CLIENT_ID` y `EBAY_CLIENT_SECRET` para las búsquedas reales de eBay.
   - `DATABASE_URL` para las cuentas y el historial de PCs.
4. Cuando el despliegue termine, abre la URL `onrender.com` y prueba `/configurador.html`, `/cuenta.html` y `/health`.

## Base de datos de cuentas

Usamos **Neon Postgres** gratuito porque la base gratuita de Render caduca a los 30 días y borra sus datos. Los pasos completos están en `CUENTAS.md`.

Resumen:

1. Crear un proyecto en <https://neon.tech>.
2. Copiar la cadena `postgresql://...`.
3. Pegarla en Render como `DATABASE_URL`.
4. El servidor crea las tablas al arrancar.

## Limitaciones del plan gratuito

- Render suspende los servicios gratuitos después de 15 minutos sin tráfico; la siguiente visita puede tardar cerca de un minuto en cargar. El primer acceso después de ese lapso también despierta la base de datos de Neon.
- El sistema de archivos de Render es efímero. Por eso las cuentas y las PCs **no** se guardan en disco: viven en Neon.
- El plan gratuito de Render tiene 750 horas de instancia al mes y un ancho de banda limitado.
- Neon Free incluye 100 horas de cómputo al mes por proyecto y 1 GB de almacenamiento. Para este uso es de sobra; si se agota, el cómputo se suspende hasta el siguiente mes.

Guías oficiales: [Deploy for Free](https://render.com/docs/free) · [Node.js web service](https://render.com/docs/deploy-node-express-app) · [Render Blueprint](https://render.com/docs/blueprint-spec) · [Neon Free](https://neon.com/pricing)
