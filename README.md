# ALIUM

ALIUM es un intermediario de compra de PCs en República Dominicana. El cliente configura su equipo en la web, cierra el pedido por WhatsApp, paga el 50% de anticipo y ALIUM compra las piezas a tiendas locales, valida la compatibilidad y responde por el dinero, las piezas y la fecha.

No es una tienda con inventario propio ni un marketplace de publicaciones. No se usan eBay, Amazon, programas de afiliados ni APIs de marketplaces.

## Cómo funciona el pedido

1. El cliente elige plataforma (AMD o Intel), uso, gama y presupuesto.
2. El configurador propone piezas de referencia y valida socket, memoria, potencia, espacio del case y longitud de la GPU.
3. El cliente elige armado por ALIUM (RD$1,500) o armado propio, y entrega a domicilio o retiro.
4. Al pulsar «Guardar pedido y abrir WhatsApp», el pedido se guarda en la base de datos con un código de seguimiento.
5. WhatsApp se abre con el mensaje completo: piezas, precios de referencia, subtotal, armado, total, anticipo del 50%, entrega y enlace de seguimiento.
6. ALIUM confirma disponibilidad, precio final y fecha por escrito; el cliente paga el anticipo y ALIUM compra al proveedor.
7. El saldo se paga contra entrega verificada. La garantía y la compensación por retraso están publicadas por escrito.

## Páginas

| Ruta | Uso |
| --- | --- |
| `/` | Portada, propuesta de valor, piezas, equipo y suscripción |
| `/configurador.html` | Configurador, catálogo, compatibilidad y cierre del pedido |
| `/tiendas.html` | Red de tiendas verificadas y registro de proveedores |
| `/garantia.html` | Política de garantía, anticipo, retrasos y reclamos |
| `/presentacion.html` | Presentación de 10 diapositivas para empresas y tiendas |
| `/pedido.html` | Seguimiento con código y contacto |
| `/cuenta.html` | Registro, sesión e historial de PCs guardadas |
| `/montaje.html` | Información del servicio de armado |
| `/admin.html` | Panel privado: pedidos, tiendas, productos, usuarios y avisos |

## Stack

- `server.js`: servidor HTTP sin framework, API y esquema de base de datos.
- `public/`: sitio estático mobile-first en español.
- Neon Postgres: cuentas, sesiones, pedidos, tiendas, productos, avisos y builds.
- Netlify: CDN para el sitio y Netlify Functions para la API (`netlify/functions/api.js`).
- `public/assets/alium-config.js`: número de WhatsApp, costo de armado, anticipo y comisión.

## Desarrollo local

```powershell
cd C:\Users\CHACHO\Desktop\ALIUM-v2
Copy-Item .env.example .env   # completar DATABASE_URL
npm install
npm start
```

El servidor escucha en `http://localhost:4174` por defecto. Abre `http://localhost:4174/index.html` (usa `localhost`, no `127.0.0.1`).

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Cadena de Neon Postgres (secreta) |
| `PUBLIC_SITE_URL` | URL pública para correos y enlaces de seguimiento |
| `RESEND_API_KEY` | Correo transaccional opcional |
| `EMAIL_FROM` | Remitente verificado |
| `PORT` / `HOST` | Servidor local |

Las credenciales viven en `.env` (excluido de Git) o en las variables de Netlify. Nunca se pegan en el chat, el HTML ni el JavaScript público.

## API principal

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/site` | Configuración pública |
| `GET` | `/api/stores` | Tiendas aprobadas |
| `GET` | `/api/products` | Catálogo verificado |
| `POST` | `/api/suppliers` | Registro de tienda |
| `POST` | `/api/orders` | Guarda el pedido |
| `GET` | `/api/orders/track?code=...&contact=...` | Seguimiento |
| `POST` | `/api/admin/login` | Sesión del panel privado |

El detalle de endpoints, tablas y flujo de tiendas está en [`API_SETUP.md`](API_SETUP.md). El despliegue está en [`DESPLIEGUE.md`](DESPLIEGUE.md).

## Estado de pruebas

- Flujo completo del configurador probado con AMD/Alta e Intel/Básica.
- Pedido guardado antes de WhatsApp, con código, total, anticipo y seguimiento.
- Formulario de tiendas probado con envío inválido y válido.
- Seguimiento probado con pedido demo `AL-I8ZALE403`.
- Las 10 páginas revisadas en navegador: 0 errores de consola, 0 imágenes rotas, 0 desbordes horizontales.
- Datos de QA eliminados; la base conserva solo cuentas reales y el pedido demo.

## Seguridad y privacidad

- Sesiones con cookies `httpOnly`; clave admin guardada como hash.
- El seguimiento exige código y contacto, y no devuelve dirección ni datos completos.
- `.env`, llaves y documentos legales viven fuera del repositorio.
- Los documentos privados están en `C:\Users\CHACHO\Desktop\ALIUM-Privado\documentos`.
