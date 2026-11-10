// ALIUM — configuración pública del modelo de intermediación.
// Cambia aquí el número de WhatsApp, el costo de armado y la comisión.
window.ALIUM_CONFIG = {
  // WhatsApp de ALIUM (prueba / personal de Saul). Formato internacional sin "+".
  whatsappNumber: "18495889657",
  whatsappDisplay: "+1 (849) 588-9657",
  // Armado por ALIUM, en pesos dominicanos.
  assemblyFeeDOP: 1500,
  // Anticipo que paga el cliente para confirmar el pedido.
  depositPercent: 50,
  // Comisión que ALIUM cobra a la tienda por cada venta cerrada.
  storeCommissionPercent: 10,
  // Tasa de referencia para convertir USD a RD$ (se actualiza al confirmar).
  fxRate: 60.84,
  fxDate: "29/10/2026",
  siteUrl: "https://alium-pc-builder.netlify.app"
};
