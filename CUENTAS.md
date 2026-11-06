# Cuentas, historial y avisos por correo

ALIUM guarda las cuentas y las PCs en **Neon Postgres**. Netlify sirve la web y ejecuta la API; Neon solo guarda usuarios, sesiones, configuraciones y la lista de personas que aceptaron recibir avisos.

## Por qué Neon

La base de datos gratuita de Render caduca a los 30 días y borra sus datos. Neon Free no caduca, ofrece 1 GB por proyecto y 100 horas de cómputo al mes; el cómputo se suspende al quedar inactivo y **se reactiva solo** en la siguiente consulta. El historial de las PCs sigue disponible al volver a iniciar sesión.

## Configuración (ya aplicada en producción)

1. Proyecto de Neon: `alium` (ID `snowy-river-04035024`), rama `production`, base `neondb`, región AWS `us-east-2`.
2. La cadena de conexión agrupada se guarda como `DATABASE_URL` en Netlify, marcada como secreta.
3. El servidor crea las tablas al arrancar. `/health` devuelve `"accounts": true` cuando la base responde.
4. La cadena de conexión es un secreto: no se sube a GitHub, no se pega en el chat y `.env` está excluido por `.gitignore`.

## Qué se guarda

| Tabla | Contenido |
| --- | --- |
| `alium_users` | nombre, correo (único), hash scrypt de la contraseña y fecha de alta |
| `alium_sessions` | sesiones con vencimiento de 30 días; se guarda el hash del token, no el token |
| `alium_builds` | nombre de la PC, plataforma, uso, gama, presupuesto, total y piezas en JSON |
| `alium_subscribers` | correo, origen, preferencia de avisos y fechas de alta/baja |

## Avisos por correo

- Al registrarse con la casilla de avisos marcada, la persona queda en `alium_subscribers` y recibe un correo de bienvenida si Resend está configurado.
- Los avisos de mantenimiento, incidencias u ofertas se envían desde el panel protegido por `ADMIN_TOKEN`:
  - `GET /api/admin/subscribers` lista las personas suscritas.
  - `POST /api/admin/notify` envía un correo a todas las suscripciones activas.
- El envío usa **Resend** (`RESEND_API_KEY` y `EMAIL_FROM`). Sin esas variables, las cuentas y el historial siguen funcionando, pero el estado de correo aparece como no configurado.
- Cada correo incluye un enlace para darse de baja (`/api/unsubscribe?token=...`).

## Seguridad implementada

- Contraseñas con **scrypt** (N=16384, r=8, p=1), sal aleatoria de 16 bytes y comparación en tiempo constante.
- Cookie de sesión `HttpOnly`, `SameSite=Lax` y `Secure` cuando el sitio usa HTTPS.
- Consultas SQL parametrizadas; nunca se concatena entrada del usuario.
- Validación y límites de tamaño en todas las entradas; el servidor no confía en el total que envía el navegador.
- Límite de intentos por IP en registro, inicio de sesión y eliminación de cuenta.
- Cada PC se consulta y elimina filtrando por el usuario de la sesión.
- El servidor bloquea el acceso estático a `.env`, `.git`, `node_modules` y rutas con segmentos ocultos.

## Pendiente antes de abrir al público

- Verificación de correo y recuperación de contraseña.
- Política de privacidad revisada legalmente y términos de servicio.
- Copias de seguridad. Neon Free no incluye restauración a un punto en el pasado; se puede exportar con `pg_dump`.
- Revisar los límites de Neon y Netlify si ALIUM crece.

## Probar en local

Copia `.env.example` a `.env`, añade `DATABASE_URL` y ejecuta:

```powershell
npm install
npm start
```

Abre <http://127.0.0.1:4174/cuenta.html>. Sin `DATABASE_URL`, el resto del sitio funciona pero las cuentas muestran un aviso de configuración pendiente.
