# Proveedores, productos y pedidos de ALIUM (modelo de intermediación)

## Estado actual

ALIUM ya no usa marketplaces externos ni afiliados. El modelo es de
intermediación con tiendas proveedoras locales:

- La tienda se registra en `/tiendas.html` con sus datos y su página web.
- ALIUM carga los productos de la tienda (nombre, modelo, imagen real y precio)
  y valida la compatibilidad (socket, memoria, potencia).
- El cliente configura su PC, cierra el pedido por WhatsApp y paga el 50% de
  anticipo. ALIUM compra las piezas a la tienda y entrega al cliente.
- Los precios del catálogo incluido en la página son referencias de ejemplo.
  La tienda confirma el precio final antes del anticipo.

## API (server.js)

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Estado del sitio y de la base |
| GET | `/api/site` | Configuración pública (anticipo, pedidos, tiendas) |
| GET | `/api/stores` | Tiendas aliadas publicadas |
| GET | `/api/products` | Productos activos de las tiendas |
| POST | `/api/suppliers` | Registro de una tienda |
| POST | `/api/orders` | Crear un pedido (guarda piezas, armado y entrega) |
| GET | `/api/orders/track?code=AL-...&contact=...` | Seguimiento de un pedido |
| POST | `/api/subscribe` | Alta de suscriptor con correo |
| POST | `/api/auth/register` · `/api/auth/login` | Cuentas de usuario |
| GET/POST | `/api/builds` | PCs guardadas del usuario |
| POST | `/api/admin/login` | Panel admin (clave con hash en Neon) |

El pedido (`POST /api/orders`) espera: `customerName`, `customerContact`,
`use`, `platform` (AMD o Intel), `tier`, `budget`, `parts` (categoría,
nombre, marca, spec, precio en USD), `assembly` (`alium` o `cliente`),
`assemblyFee` en USD (RD$1,500 ≈ US$24.65), `fulfillment` (`entrega` o
`retiro`) y `address` si la entrega es a domicilio. El servidor calcula el
subtotal y el total, y responde con el `code` del pedido (AL-XXXXXXX).

## Correo transaccional

Los avisos usan **Resend**. Añade `RESEND_API_KEY`, `EMAIL_FROM` y
`PUBLIC_SITE_URL` en las variables de Netlify. El detalle está en
`CUENTAS.md`. El panel admin valida la clave contra el hash
`alium_settings.admin_key_hash` guardado en Neon; no usa token en variables.

No pegues credenciales en el chat, GitHub, HTML, JavaScript público ni
capturas. Para trabajar localmente, copia `.env.example` a `.env`, pon
`DATABASE_URL` y reinicia `npm start`. `.env` está excluido de Git.

## Límites del catálogo

- Las ofertas y existencias pueden cambiar; la tienda confirma el precio
  final antes del anticipo.
- La compatibilidad se verifica en la página (socket, tipo de memoria y
  potencia de la fuente) antes de pedir.
- Las cuentas, el historial de PCs, las tiendas, los productos, los pedidos
  y la lista de avisos usan Neon Postgres. Ver `CUENTAS.md`.
