# Proveedores y precios reales de ALIUM

## Estado actual

- **eBay Browse API:** el servidor ya admite consultas reales y muestra la foto, el precio y el enlace de la publicación del vendedor. En producción faltan las credenciales privadas `EBAY_CLIENT_ID` y `EBAY_CLIENT_SECRET`; hasta añadirlas, el configurador usa las imágenes de categoría y precios de ejemplo.
- **Amazon:** la integración no está activada. Amazon sustituyó PA-API por **Creators API**. Antes de mostrar sus precios o imágenes en ALIUM hace falta la aprobación de Amazon para este caso de uso.
- Los precios del catálogo incluido en ALIUM son referencias de ejemplo. No son ofertas de Amazon ni cotizaciones actuales.

## Activar eBay en Netlify

1. Abre <https://app.netlify.com/projects/alium-pc-builder> → **Project configuration** → **Environment variables**.
2. Añade `EBAY_CLIENT_ID` y `EBAY_CLIENT_SECRET` con las credenciales de **Production** creadas en eBay Developer.
3. Confirma que `EBAY_ENV=production` y `EBAY_MARKETPLACE_ID=EBAY_US`.
4. Guarda los cambios y lanza **Trigger deploy** (o espera al siguiente push). Las funciones toman las variables nuevas en el siguiente despliegue.
5. Prueba una búsqueda de producto en el configurador: las publicaciones reales deben mostrar foto del proveedor, precio y enlace.

No pegues credenciales en el chat, GitHub, HTML, JavaScript público ni capturas. El servidor no revela los valores de las variables; el indicador del configurador solo informa si eBay tiene ambas claves.

Para trabajar localmente, copia `.env.example` a `.env`, introduce las claves allí y reinicia `npm start`. `.env` está excluido de Git.

## Amazon: requisito antes de integrar

La API vigente es [Amazon Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction), no la antigua PA-API. Amazon requiere inscripción en Associates para el marketplace, acceso a Creators API y credenciales. Su documentación actual indica además que se necesitan 10 ventas calificadas en los 30 días previos para el acceso de API.

Antes de integrar ALIUM, solicita confirmación escrita a Amazon de que permite este uso concreto: un configurador que compara componentes de varios proveedores y que se adapta a móviles. Las políticas de Amazon restringen mostrar Product Advertising Content en aplicaciones pensadas para teléfonos sin aprobación previa y prohíben asociar ese contenido con enlaces que dirijan a otros comercios. Revisa [las políticas oficiales](https://affiliate-program.amazon.com/help/operating/policies) y confirma expresamente el caso de comparación de ALIUM. Sin esa aprobación, no se deben presentar aquí sus fotos, precios ni disponibilidad como datos reales.

Una vez autorizado, se necesitarán credenciales de Creators API y un Partner Tag válidos para el marketplace elegido. Se guardarán únicamente en variables privadas de Netlify. Las imágenes no se pueden almacenar en caché; los datos de precio y disponibilidad requieren sello de fecha/hora y el aviso exigido por Amazon.

## Correo transaccional

Los avisos de mantenimiento, incidencias y ofertas usan **Resend**. Añade `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_SITE_URL` y `ADMIN_TOKEN` en las variables de Netlify. El detalle está en `CUENTAS.md`.

## Límites del catálogo

- Las ofertas y existencias pueden cambiar; verifica el precio final en el comercio.
- En eBay la compatibilidad de publicaciones externas queda pendiente hasta revisar modelo, socket, memoria, medidas, envío e impuestos.
- La consulta actual de eBay usa el marketplace `EBAY_US`; el configurador no estima impuestos ni courier a República Dominicana.
- Las cuentas, el historial de PCs y la lista de avisos usan Neon Postgres. Las consultas de proveedores se hacen al vuelo; la base de datos solo guarda usuarios, sesiones, suscripciones y las PCs que cada persona decide guardar. Ver `CUENTAS.md`.
