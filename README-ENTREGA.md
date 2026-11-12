# ALIUM v2 — Entrega de noviembre de 2026

## Qué incluye esta entrega

- Modelo de intermediación: el cliente configura, cierra por WhatsApp, paga 50% de anticipo y ALIUM compra las piezas a tiendas locales.
- Configurador con catálogo, compatibilidad, armado ALIUM (RD$1,500) o armado propio, entrega a domicilio o retiro.
- El pedido se guarda en la base de datos antes de abrir WhatsApp y recibe un código de seguimiento.
- Páginas nuevas: `tiendas.html`, `garantia.html`, `pedido.html` y `presentacion.html`.
- Registro de tiendas, carga de productos y validación de compatibilidad desde el panel privado.
- Sin eBay, Amazon, marketplaces externos ni programas de afiliados.

## Modelo

- WhatsApp: +1 849 588 9657.
- Anticipo: 50% del total confirmado; saldo contra entrega o retiro verificado.
- Armado ALIUM: RD$1,500 con garantía escrita del montaje.
- Comisión a tiendas: 10% por venta concretada, sin cuota fija.
- Compensación por retraso: 2% (1-3 días), 5% (4-7 días), 10% o devolución del anticipo (más de 7 días).

## Probar en local

```powershell
cd C:\Users\CHACHO\Desktop\ALIUM-v2
Copy-Item .env.example .env   # completa DATABASE_URL de Neon
npm install
npm start                     # http://localhost:4174
```

Sin `DATABASE_URL` el sitio sirve las páginas, pero los pedidos no se guardan en la base.

## Publicar

El repositorio desplegado es `saulferrerapaulino6-lgtm/ALIUM-v2` (rama `main`). Cada push a `main` despliega en <https://alium-pc-builder.netlify.app> en 15-30 segundos.

Después de publicar, verifica:

- `/health` responde `{"ok":true,"accounts":true}`.
- `/tiendas.html`, `/garantia.html`, `/pedido.html` y `/presentacion.html` abren sin 404.
- Las fotos del equipo cargan en la sección `#nosotros` de la portada.
- El configurador guarda un pedido y abre WhatsApp con el mensaje completo.
- El seguimiento responde con el código y el contacto del pedido.

## Documentos privados

Están en `C:\Users\CHACHO\Desktop\ALIUM-Privado\documentos`:

- `ALIUM - Modelo de negocio para revision legal.docx`
- `ALIUM - Presentacion para empresas y tiendas.pptx`
- `ALIUM - Presentacion para empresas y tiendas.pdf`

No copies credenciales ni documentos privados dentro del repositorio.
