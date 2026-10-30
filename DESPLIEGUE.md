# Publicar ALIUM en Render (plan gratuito de prueba)

El servidor de ALIUM sirve las páginas y el endpoint de eBay desde el mismo origen. No lo publiques como sitio estático: necesita arrancar `server.js` para mantener las credenciales de eBay en el servidor.

## Preparar el repositorio

1. Crea un repositorio **privado** en GitHub para `ALIUM-v2` y sube el proyecto desde VS Code. El `.gitignore` excluye `.env`; verifica que `.env` no aparezca entre los archivos para subir.
2. En Render, crea un **Blueprint** y conecta ese repositorio. Render leerá `render.yaml`, instalará y ejecutará el servicio Node y comprobará `/health`.
3. Al crear el servicio, Render pedirá los valores de `EBAY_CLIENT_ID` y `EBAY_CLIENT_SECRET`. Pégalos en los campos privados de Render; no los subas a GitHub.
4. Cuando el despliegue termine, abre la URL `onrender.com` que Render muestre y prueba `/configurador.html`.

## Limitaciones del plan gratuito

Render suspende servicios gratuitos después de 15 minutos sin tráfico; la siguiente visita puede tardar cerca de un minuto en volver a cargar. El sistema de archivos es efímero, así que no guardes ahí las cuentas ni las configuraciones de los usuarios. Para eso habrá que añadir una base de datos antes de convertir ALIUM en un servicio de producción.

Guías oficiales: [Deploy for Free](https://render.com/docs/free) · [Node.js web service](https://render.com/docs/deploy-node-express-app) · [Render Blueprint](https://render.com/docs/blueprint-spec)
