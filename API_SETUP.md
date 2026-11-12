# Cómo se conectan las tiendas a ALIUM

ALIUM no usa marketplaces externos. Las tiendas y proveedores locales se registran desde la web, ALIUM carga sus productos con precio, modelo e imagen real, y valida la compatibilidad antes de mostrar cada pieza.

## Flujo de una tienda

1. La tienda entra en `/tiendas.html` y completa el formulario de registro (nombre, contacto, WhatsApp, ciudad, catálogo aproximado).
2. El registro llega a `alium_suppliers` y queda en estado `pendiente`.
3. ALIUM revisa la tienda desde `/admin.html` y la marca como `aprobada` o `rechazada`.
4. ALIUM carga los productos de la tienda en `alium_products` (categoría, marca, modelo, precio, imagen real y notas de compatibilidad).
5. Cuando un cliente cierra un pedido, ALIUM compra a la tienda y paga el 10% de comisión por venta concretada. Sin cuota fija ni costo por publicar.

## Endpoints públicos

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/site` | Configuración pública del sitio |
| `GET` | `/api/stores` | Tiendas aprobadas que se muestran en la web |
| `GET` | `/api/products` | Catálogo verificado (filtros por categoría y tienda) |
| `POST` | `/api/suppliers` | Registro de una tienda o proveedor |
| `POST` | `/api/orders` | Guarda el pedido antes de abrir WhatsApp |
| `GET` | `/api/orders/track?code=...&contact=...` | Seguimiento del pedido con código y contacto |

Los pedidos guardan el subtotal de piezas, el costo de armado (`assembly_fee`), el total y el anticipo del 50%. El seguimiento nunca devuelve la dirección ni los datos completos del cliente.

## Panel de administración

`/admin.html` usa sesión con cookie `alium_admin`. La clave se valida contra el hash guardado en `alium_settings.admin_key_hash`; nunca se guarda en texto plano ni se muestra en el navegador.

- Pedidos: estado, fecha estimada, notas internas, anticipo calculado sobre el total.
- Tiendas: aprobar, rechazar, editar contacto.
- Productos: precio, modelo, imagen real, compatibilidad.
- Resumen: usuarios, suscriptores, pedidos, tiendas y productos.

## Variables privadas

Copia `.env.example` a `.env` para trabajar localmente (`.env` está excluido de Git):

- `DATABASE_URL`: cadena de conexión de Neon Postgres. Sin ella, cuentas y pedidos quedan desactivados.
- `PUBLIC_SITE_URL`: URL pública usada en los enlaces de correo y seguimiento.
- `RESEND_API_KEY` / `EMAIL_FROM`: correo transaccional opcional.
- `PORT` / `HOST`: servidor local.

El número de WhatsApp de ALIUM y el costo de armado se editan en `public/assets/alium-config.js`, no en variables de entorno.

No pegues credenciales en el chat, GitHub, HTML, JavaScript público ni capturas.

## Base de datos

- `alium_suppliers`: tiendas registradas y su estado.
- `alium_products`: catálogo cargado por ALIUM.
- `alium_orders`: pedidos con piezas, anticipo, entrega y seguimiento.
- `alium_users`, `alium_sessions`, `alium_subscribers`, `alium_builds`: cuentas, sesiones, avisos y PCs guardadas.

El esquema se crea al arrancar el servidor, incluidas las migraciones `ADD COLUMN IF NOT EXISTS` para bases ya existentes.
