/*
 * ============================================================
 * GRANCARTA - Motor de renderizado de cartas
 *
 * Genera el HTML de la carta tal como la ve el cliente final.
 * Este código es la BASE de:
 *   - Vista previa en el admin (modal en iframe)
 *   - Publicación a grancarta.com/{slug} (vía el Worker)
 *
 * El HTML (la ESTRUCTURA / los huecos) vive acá.
 * La APARIENCIA (colores, tipografías, gestos) vive en pieles.js
 * como un juego de PERILLAS que el motor GranCartaPieles pinta.
 * Cambiar de piel = cambiar perillas, no HTML.
 *
 * Filosofía: "menos es más" — Victor Resti
 * ============================================================
 */

const CartaRenderer = (function() {

  // Motor de pieles (global en el browser; require en Node para tests)
  const Pieles = (typeof GranCartaPieles !== 'undefined')
    ? GranCartaPieles
    : (typeof require !== 'undefined' ? require('./pieles.js') : null);


  // ============================================================
  // FORMATEO DE PRECIO según redondeo de la carta
  // ============================================================

  function formatearPrecio(valor, redondeo) {
    const num = parseFloat(valor) || 0;

    // Si el redondeo es 'sin', muestra hasta 2 decimales
    // Si tiene un redondeo entero, no muestra decimales
    const opciones = redondeo === 'sin'
      ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 };

    return '$' + num.toLocaleString('es-AR', opciones);
  }


  // ============================================================
  // RENDERIZADO DEL CUERPO HTML
  // ============================================================

  /**
   * Genera el HTML completo de la carta (autocontenido, listo para iframe o publicación).
   *
   * @param {Object} datos
   * @param {Object} datos.carta - la carta con sus configuraciones
   * @param {Array} datos.secciones - secciones con productos adentro
   * @param {string} datos.nombreEmpresa - nombre comercial
   * @param {string} datos.nombreLocal - nombre del local (opcional)
   * @param {string} datos.template - id de la piel ('minimalista' | 'clasico_madera' | ...)
   * @param {Object} [datos.pielObj] - piel COMPLETA para pintar directo (Fábrica:
   *        previsualiza una piel editada en memoria que aún no está en PRESETS).
   *        Si viene, tiene prioridad sobre datos.template.
   * @return {string} HTML completo
   */
  function renderizar(datos) {
    const templateKey = datos.template || 'minimalista';
    const piel = (datos.pielObj && datos.pielObj.color && datos.pielObj.fuente)
      ? datos.pielObj
      : (Pieles.PRESETS[templateKey] || Pieles.PRESETS.minimalista);
    const css = Pieles.generarCss(piel);
    const redondeo = datos.carta.Redondeo || '10';

    const escape = function(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // Filtrar secciones con al menos un producto disponible
    const seccionesConProductos = (datos.secciones || []).filter(function(s) {
      return s.productos && s.productos.some(function(p) { return p.Disponible_Hoy; });
    });

    let bodyHtml = '';

    if (seccionesConProductos.length === 0) {
      bodyHtml = `
        <div class="carta-empty">
          <div class="carta-empty-icon">🍽️</div>
          <div class="carta-empty-text">Esta carta está vacía o todos sus productos están agotados hoy.</div>
        </div>
      `;
    } else {
      let seccionesHtml = '';

      seccionesConProductos.forEach(function(sec) {
        const productosDisponibles = sec.productos.filter(function(p) { return p.Disponible_Hoy; });

        let productosHtml = '';
        productosDisponibles.forEach(function(p) {
          const et = p.Etiquetas || {};

          // Construir tags
          const tags = [];
          if (et.vegetariano) tags.push('<span class="producto-tag">🌱 Vegetariano</span>');
          if (et.sin_tacc) tags.push('<span class="producto-tag">🌾 Sin TACC</span>');
          if (et.picante) tags.push('<span class="producto-tag">🌶 Picante</span>');

          if (et.alergenos && et.alergenos.length > 0) {
            tags.push(
              '<span class="producto-tag producto-tag-alergenos">⚠️ ' +
              et.alergenos.map(escape).join(', ') +
              '</span>'
            );
          }

          productosHtml += `
            <div class="producto">
              <div class="producto-line">
                <span class="producto-nombre">${escape(p.Nombre)}</span>
                <span class="producto-dots"></span>
                <span class="producto-precio">${formatearPrecio(p.Precio, redondeo)}</span>
              </div>
              ${p.Descripcion ? `<div class="producto-desc">${escape(p.Descripcion)}</div>` : ''}
              ${tags.length > 0 ? `<div class="producto-tags">${tags.join('')}</div>` : ''}
            </div>
          `;
        });

        seccionesHtml += `
          <section class="seccion">
            <h2 class="seccion-titulo">${escape(sec.Nombre)}</h2>
            ${sec.Descripcion ? `<div class="seccion-desc">${escape(sec.Descripcion)}</div>` : ''}
            <div class="productos">
              ${productosHtml}
            </div>
          </section>
        `;
      });

      bodyHtml = `<div class="carta-secciones">${seccionesHtml}</div>`;
    }

    // Pie de carta
    const c = datos.carta;
    const tieneFooter = c.Pie_Direccion || c.Pie_Telefono || c.Pie_Mail;
    const tieneNotas = c.Notas && c.Notas.trim();

    let footerHtml = '';
    if (tieneFooter) {
      footerHtml += '<div class="carta-footer">';
      if (c.Pie_Direccion) {
        footerHtml += `<span class="carta-footer-item">📍 ${escape(c.Pie_Direccion)}</span>`;
      }
      if (c.Pie_Telefono) {
        footerHtml += `<span class="carta-footer-item">📞 <a href="tel:${escape(c.Pie_Telefono.replace(/\s/g, ''))}">${escape(c.Pie_Telefono)}</a></span>`;
      }
      if (c.Pie_Mail) {
        footerHtml += `<span class="carta-footer-item">✉️ <a href="mailto:${escape(c.Pie_Mail)}">${escape(c.Pie_Mail)}</a></span>`;
      }
      footerHtml += '</div>';
    }

    if (tieneNotas) {
      footerHtml += `<div class="carta-notas">${escape(c.Notas)}</div>`;
    }

    // HTML completo
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(datos.nombreEmpresa || 'Carta')} · ${escape(c.Nombre)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="carta">
    <header class="carta-header">
      <h1 class="carta-empresa">${escape(datos.nombreEmpresa || 'Bienvenidos')}</h1>
      ${datos.nombreLocal ? `<div class="carta-local">${escape(datos.nombreLocal)}</div>` : ''}
      <div class="carta-divider"></div>
    </header>
    ${bodyHtml}
    ${footerHtml}
  </div>
</body>
</html>`;
  }


  // ============================================================
  // API PÚBLICA
  // ============================================================

  return {
    renderizar: renderizar,
    listarTemplates: function() {
      return Pieles.listar().map(function(t) {
        return {
          id: t.id,
          nombre: t.nombre,
          descripcion: t.descripcion,
          premium: t.premium
        };
      });
    }
  };

})();
