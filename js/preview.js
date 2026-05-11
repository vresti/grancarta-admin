/*
 * ============================================================
 * GRANCARTA - Motor de renderizado de cartas
 *
 * Genera el HTML de la carta tal como la ve el cliente final.
 * Este código es la BASE de:
 *   - Vista previa en el admin (modal en iframe)
 *   - m.grancarta.com (cliente con QR de mesa)
 *   - Publicación a grancarta.com/{slug} (HTML estático)
 *
 * Filosofía: "menos es más" — Victor Resti
 * ============================================================
 */

const CartaRenderer = (function() {

  // ============================================================
  // TEMPLATES — cada uno es una función que devuelve CSS
  // ============================================================

  const TEMPLATES = {

    // 🌿 MINIMALISTA — El primero, el universal
    minimalista: {
      nombre: 'Minimalista',
      descripcion: 'Blanco, espacio, tipografía elegante. El más universal.',
      premium: false,
      generarCss: function() {
        return `
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          html, body {
            background: #FAFAF7;
            color: #1A1A1A;
            font-family: 'Inter', sans-serif;
            font-weight: 300;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
          }

          body {
            min-height: 100vh;
            padding: 4rem 1.5rem 3rem;
            display: flex;
            justify-content: center;
          }

          .carta {
            max-width: 600px;
            width: 100%;
          }

          .carta-header {
            text-align: center;
            margin-bottom: 3.5rem;
            animation: fadeInUp 0.6s ease;
          }

          .carta-empresa {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2rem;
            font-weight: 500;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #1A1A1A;
            margin-bottom: 0.5rem;
            line-height: 1.2;
          }

          .carta-local {
            font-size: 0.8125rem;
            color: #888;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-weight: 400;
          }

          .carta-divider {
            width: 40px;
            height: 1px;
            background: #1A1A1A;
            margin: 2rem auto;
            opacity: 0.3;
          }

          .carta-secciones {
            display: flex;
            flex-direction: column;
            gap: 3rem;
          }

          .seccion {
            animation: fadeInUp 0.6s ease backwards;
          }

          .seccion:nth-child(1) { animation-delay: 0.1s; }
          .seccion:nth-child(2) { animation-delay: 0.2s; }
          .seccion:nth-child(3) { animation-delay: 0.3s; }
          .seccion:nth-child(4) { animation-delay: 0.4s; }
          .seccion:nth-child(n+5) { animation-delay: 0.5s; }

          .seccion-titulo {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            font-weight: 500;
            color: #1A1A1A;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            text-align: center;
            margin-bottom: 0.5rem;
          }

          .seccion-desc {
            text-align: center;
            font-size: 0.875rem;
            color: #888;
            font-style: italic;
            margin-bottom: 2rem;
            letter-spacing: 0.01em;
          }

          .seccion:not(:has(.seccion-desc)) .seccion-titulo {
            margin-bottom: 2rem;
          }

          .productos {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .producto {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }

          .producto-line {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem;
          }

          .producto-nombre {
            font-family: 'Inter', sans-serif;
            font-size: 1rem;
            font-weight: 500;
            color: #1A1A1A;
            letter-spacing: 0.005em;
          }

          .producto-dots {
            flex: 1;
            border-bottom: 1px dotted #C5C5C0;
            margin: 0 0.5rem;
            position: relative;
            top: -3px;
            opacity: 0.6;
          }

          .producto-precio {
            font-family: 'Inter', sans-serif;
            font-size: 1rem;
            font-weight: 500;
            color: #1A1A1A;
            white-space: nowrap;
          }

          .producto-desc {
            font-size: 0.875rem;
            color: #666;
            font-weight: 300;
            line-height: 1.5;
            margin-top: 0.125rem;
          }

          .producto-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.625rem;
            margin-top: 0.375rem;
          }

          .producto-tag {
            font-size: 0.7rem;
            color: #999;
            letter-spacing: 0.04em;
            font-weight: 400;
          }

          .producto-tag-alergenos {
            color: #B85C00;
            font-weight: 400;
          }

          .carta-footer {
            text-align: center;
            margin-top: 4rem;
            padding-top: 2.5rem;
            border-top: 1px solid #E8E6E0;
            color: #888;
            font-size: 0.875rem;
            line-height: 1.8;
            animation: fadeInUp 0.6s ease backwards;
            animation-delay: 0.6s;
          }

          .carta-footer-item {
            display: block;
            margin: 0.25rem 0;
          }

          .carta-footer-item a {
            color: #888;
            text-decoration: none;
          }

          .carta-notas {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid #E8E6E0;
            text-align: center;
            font-size: 0.8125rem;
            color: #777;
            font-style: italic;
            line-height: 1.7;
            white-space: pre-line;
          }

          .carta-empty {
            text-align: center;
            padding: 4rem 2rem;
            color: #999;
          }

          .carta-empty-icon {
            font-size: 3rem;
            opacity: 0.3;
            margin-bottom: 1rem;
          }

          .carta-empty-text {
            font-size: 0.875rem;
            font-style: italic;
          }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          /* Responsive */
          @media (max-width: 600px) {
            body { padding: 2rem 1.25rem; }
            .carta-empresa { font-size: 1.5rem; }
            .seccion-titulo { font-size: 1.25rem; }
            .carta-secciones { gap: 2.5rem; }
            .productos { gap: 1.25rem; }
          }
        `;
      }
    }

    // TODO: clasico_madera, moderno_oscuro, festivo_color, bistro_tiza
    // se construirán en C4
  };


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
   * @param {string} datos.template - 'minimalista' | 'clasico_madera' | etc
   * @return {string} HTML completo
   */
  function renderizar(datos) {
    const templateKey = datos.template || 'minimalista';
    const template = TEMPLATES[templateKey] || TEMPLATES.minimalista;
    const css = template.generarCss();
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
      return Object.keys(TEMPLATES).map(function(k) {
        return {
          id: k,
          nombre: TEMPLATES[k].nombre,
          descripcion: TEMPLATES[k].descripcion,
          premium: TEMPLATES[k].premium
        };
      });
    }
  };

})();
