# ALIUM v2 — Entrega 10 de noviembre de 2026

## Qué se arregló en esta entrega
- La portada de producción NO tenía la sección del equipo: solo decía "Somos un equipo enfocado...".
  Las fotos `assets/equipo-saul.jpeg` y `assets/equipo-adicson.jpeg` daban 404.
  Aquí ya están: `public/index.html` tiene la sección #nosotros con fotos y bios completas
  de Saul Ferrera Paulino y Adicson de la Cruz Santana, con `loading="eager"` para que
  carguen al abrir la página.
- Páginas nuevas que en producción daban 404: `tiendas.html`, `garantia.html`,
  `pedido.html`, `presentacion.html`. Ya existen en `public/`.
- Sin marketplaces externos en ningún archivo de `public/` ni en `server.js` (verificado).
- Configurador corregido al contrato real del servidor: `use`, `assembly` alium/cliente,
  `fulfillment` entrega/retiro, dirección obligatoria si es entrega, cargo de armado
  en USD (US$24.65 = RD$1,500) para no mezclar monedas, y usa el código del servidor
  cuando el pedido se guarda.

## Modelo
Intermediación: el cliente configura, cierra por WhatsApp (+1 849 588 9657),
ALIUM compra a la tienda, cobra 50% de anticipo, saldo contra entrega.
Armado ALIUM RD$1,500. Comisión a tiendas 10%.
Compensación por retraso: 1-3 días 2%, 4-7 días 5%, más de 7 días 10% o devolución.

## Probar en local (tu PC)
```
cd ALIUM-v2
copy .env.example .env   (y pon DATABASE_URL de Neon)
npm install
npm start                (http://127.0.0.1:4174)
```
Sin DATABASE_URL el sitio sirve las páginas, pero los pedidos solo se guardan
en el dispositivo y se completan por WhatsApp (así está diseñado el respaldo).

## Publicar (Netlify + GitHub)
```
$git = 'C:\Users\CHACHO\AppData\Local\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe'
$repo = 'C:\Users\CHACHO\Desktop\ALIUM-v2'
# Copia esta carpeta encima de $repo (no copies .env ni admin-key.txt)
& $git -C $repo add -A
& $git -C $repo -c user.name='ALIUM' -c user.email='alium@local' commit -m "ALIUM v2: equipo visible, tiendas, garantía, pedido y presentación"
& $git -C $repo -c core.sshCommand='"C:/Windows/System32/OpenSSH/ssh.exe" -i <RUTA_LLAVE> -o IdentitiesOnly=yes -o BatchMode=yes -p 443' push ssh://git@ssh.github.com:443/saulferrerapaulino6-lgtm/ALIUM-v2.git main
```
Cada push a main despliega en https://alium-pc-builder.netlify.app (15-30 s).
Después verifica: /tiendas.html, /garantia.html, /pedido.html, /presentacion.html
y que las fotos del equipo carguen en #nosotros.

## Prueba completa incluida
Ver `PRUEBA-PC-WhatsApp.txt` (en la entrega): PC AMD de 8 piezas, US$948.00,
total RD$59,176, anticipo RD$29,588. El enlace wa.me abre WhatsApp con el
mensaje ya escrito; solo hay que pulsar enviar.

## Documentos
- `ALIUM-Documento-Legal-para-Abogado.docx`: modelo completo + 10 preguntas para el abogado.
- `ALIUM-Presentacion-para-Empresas.pptx`: 10 diapositivas para tiendas.
