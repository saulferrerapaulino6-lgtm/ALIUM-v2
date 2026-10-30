# Proveedor eBay para ALIUM

La búsqueda de eBay usa el Browse API y un token de aplicación que genera el servidor. Las claves privadas no deben ponerse en HTML/JavaScript del navegador ni compartirse por chat.

## Configuración local

1. Crea una aplicación en el portal de desarrolladores de eBay y abre sus claves del entorno **Production**. Para hacer pruebas usa Sandbox y configura `EBAY_ENV=sandbox`.
2. Copia `.env.example` como `.env` en la carpeta raíz del proyecto.
3. Pega el **App ID / Client ID** en `EBAY_CLIENT_ID` y el **Cert ID / Client Secret** en `EBAY_CLIENT_SECRET`. Mantén ambas claves privadas en tu equipo.
4. Guarda `.env`, reinicia el servidor de ALIUM y abre el configurador. En “Tu PC para personalizar”, busca un componente y pulsa **Buscar en eBay**.

Si no hay claves configuradas, la interfaz seguirá mostrando el catálogo de ejemplo y explicará cómo habilitar la consulta real. No se necesita una base de datos para esta primera integración: eBay devuelve listados al momento y la selección permanece en el navegador.

## Alcance y límites

- El precio y la imagen vienen de la publicación de eBay consultada; la disponibilidad y el precio pueden cambiar.
- El configurador marca la compatibilidad de publicaciones externas como **Pendiente**. Revisa socket, memoria, dimensiones, envío, impuestos y courier en la página del vendedor antes de comprar.
- El total orientativo del configurador está pensado para publicaciones en USD. La búsqueda inicial usa el marketplace de Estados Unidos (`EBAY_US`); no estima impuestos ni el costo de courier a República Dominicana.
- Los enlaces usan el enlace de publicación devuelto por eBay. Los enlaces de afiliado requieren una cuenta y configuración del programa EPN.
- Antes de publicar la integración, revisa las reglas vigentes de la API, atribución, uso de imágenes y límites de consulta de eBay.

Documentación oficial: [Browse API](https://developer.ebay.com/develop/api/buy/browse_api) · [OAuth credentials](https://developer.ebay.com/api-docs/static/oauth-credentials.html)
