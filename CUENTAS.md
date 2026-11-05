# Cuentas e historial de PCs (gratis)

ALIUM guarda las cuentas y las PCs en **Neon**, un PostgreSQL gratuito que no borra los datos por inactividad. Render sigue sirviendo la web; Neon solo guarda usuarios, sesiones y configuraciones.

## Por qué Neon y no la base de datos de Render

La base de datos gratuita de Render **caduca a los 30 días** y después se elimina con todos sus datos. Neon Free ofrece 1 GB por proyecto, hasta 20 GB por cuenta y 100 horas de cómputo al mes; el cómputo se suspende al quedar inactivo y **se reactiva solo** en la siguiente consulta. Para un historial que debe durar, Neon es la opción gratuita más conveniente.

## Configuración (una sola vez)

1. Entra a <https://neon.tech> y crea una cuenta gratuita (puedes usar GitHub).
2. Crea un proyecto, por ejemplo `alium`, en la región más cercana.
3. En **Connect** / **Connection string**, copia la cadena que empieza por `postgresql://`.
4. En Render, abre el servicio `alium-pc-builder` → **Environment** → **Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: la cadena copiada
5. Guarda. Render reinicia el servicio.
6. El servidor crea solo las tablas necesarias al arrancar. Comprueba `/health`: debe devolver `"accounts": true`.

La cadena de conexión es un secreto: no se sube a GitHub ni se pega en el chat. `.env` está excluido por `.gitignore`.

## Qué se guarda

| Tabla | Contenido |
| --- | --- |
| `alium_users` | nombre, correo (único), hash scrypt de la contraseña y fecha de alta |
| `alium_sessions` | sesiones con vencimiento de 30 días; se guarda el hash del token, no el token |
| `alium_builds` | nombre de la PC, plataforma, uso, gama, presupuesto, total y piezas en JSON |

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
- Correos transaccionales (por ejemplo, Resend o Brevo en plan gratuito).
- Política de privacidad revisada legalmente y términos de servicio.
- Copias de seguridad. Neon Free no incluye restauración a un punto en el pasado; se puede exportar con `pg_dump`.
- Si ALIUM crece, revisar los límites de Neon y Render antes de pasar a un plan de pago.

## Probar en local

Copia `.env.example` a `.env`, añade `DATABASE_URL` y ejecuta:

```powershell
npm install
npm start
```

Abre <http://127.0.0.1:4174/cuenta.html>. Sin `DATABASE_URL`, el resto del sitio funciona pero las cuentas muestran un aviso de configuración pendiente.
