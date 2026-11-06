# Publicar ALIUM en Netlify + Neon

ALIUM se publica como sitio estático en **Netlify** y usa **Netlify Functions** para la API. Las cuentas, el historial y los avisos por correo viven en **Neon Postgres**. El sitio no se duerme: Netlify sirve las páginas desde su CDN y las funciones se ejecutan bajo demanda.

## Sitio en producción

| Dato | Valor |
| --- | --- |
| URL | <https://alium-pc-builder.netlify.app> |
| Panel | <https://app.netlify.com/projects/alium-pc-builder> |
| Repositorio desplegado | `saulferrerapaulino6-lgtm/ALIUM-v2` (rama `main`) |
| Cuenta Netlify | `saul-ferrera-paulino` |
| ID del sitio | `7eb7185c-134a-4c98-be02-e44759d8da5d` |

## Cómo está armado

- `netlify.toml` publica la carpeta `public`, empaqueta `netlify/functions` con esbuild y redirige `/api/*` y `/health` a la función `api`.
- `netlify/functions/api.js` envuelve el servidor HTTP de `server.js` con `serverless-http`; `server.js` solo escucha en un puerto cuando se ejecuta directamente (`npm start`).
- Cada push a `main` en el repositorio desplegado lanza un build automático. También se puede lanzar desde el panel con **Trigger deploy**.

## Variables de entorno (solo en Netlify)

Se configuran en **Project configuration → Environment variables**. Nunca se suben a Git ni se pegan en el chat.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Cadena de Neon Postgres (secreta). Sin ella, `/health` devuelve `"accounts": false`. |
| `RESEND_API_KEY` | Envío de correos de bienvenida y avisos (secreta). |
| `EMAIL_FROM` | Remitente verificado en Resend, por ejemplo `ALIUM <avisos@tudominio.com>`. |
| `PUBLIC_SITE_URL` | URL pública usada en los enlaces de los correos. |
| `ADMIN_TOKEN` | Token para el panel de avisos y el envío masivo (secreto). |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Búsquedas reales de eBay (secretas). |
| `EBAY_ENV` / `EBAY_MARKETPLACE_ID` | `production` / `EBAY_US`. |

`DATABASE_URL` está guardada como variable **secreta** con los contextos `production`, `deploy-preview` y `branch-deploy`, y con los scopes `builds`, `functions` y `runtime`.

## Comprobar el despliegue

1. Abre <https://alium-pc-builder.netlify.app/health>. Debe responder `{"ok":true,"accounts":true}`.
2. Entra a la portada, al configurador y a Mi cuenta.
3. Crea una cuenta de prueba, guarda una PC, cierra sesión y vuelve a entrar: el historial debe seguir ahí.

## Limitaciones del plan gratuito

- Netlify Free incluye 100 GB de ancho de banda y 125 000 invocaciones de funciones al mes. Es de sobra para empezar y **no suspende el sitio por inactividad**.
- Las funciones tienen un límite de ejecución por invocación; las consultas de eBay pueden tardar si el proveedor responde lento.
- Neon Free incluye 1 GB de almacenamiento y 100 horas de cómputo al mes. El cómputo se suspende al quedar inactivo y se reactiva solo en la siguiente consulta (puede añadir una fracción de segundo a la primera petición).
- Los archivos estáticos se sirven con caché. Al cambiar CSS o JavaScript se sube la versión en las URL (`?v=7`) para forzar la actualización.

Guías oficiales: [Netlify Functions](https://docs.netlify.com/functions/overview/) · [netlify.toml](https://docs.netlify.com/configure-builds/file-based-configuration/) · [Neon Free](https://neon.com/pricing)
