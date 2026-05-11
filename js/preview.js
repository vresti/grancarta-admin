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
    }, // /minimalista

    // 🪵 CLÁSICO MADERA — Caoba, sepia, tradicional argentino
    clasico_madera: {
      nombre: 'Clásico Madera',
      descripcion: 'Caoba, sepia, hospitalario. Para bodegones y parrillas tradicionales.',
      premium: false,
      generarCss: function() {
        return `
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Lora:wght@400;500;600&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          html, body {
            background: #F3E9D2;
            background-image:
              repeating-linear-gradient(45deg, rgba(101, 67, 33, 0.025) 0, rgba(101, 67, 33, 0.025) 2px, transparent 2px, transparent 12px),
              linear-gradient(180deg, #F5EBD4 0%, #EDDFC0 100%);
            color: #3D2814;
            font-family: 'Lora', serif;
            line-height: 1.65;
            -webkit-font-smoothing: antialiased;
          }

          body {
            min-height: 100vh;
            padding: 3rem 1.5rem 2.5rem;
            display: flex;
            justify-content: center;
          }

          .carta {
            max-width: 620px;
            width: 100%;
            background: rgba(253, 246, 227, 0.6);
            padding: 3rem 2.5rem;
            border: 2px solid #8B4513;
            border-radius: 4px;
            box-shadow:
              0 0 0 8px rgba(253, 246, 227, 0.6),
              0 0 0 10px #8B4513,
              0 10px 40px rgba(61, 40, 20, 0.2);
            position: relative;
          }

          .carta::before,
          .carta::after {
            content: '✦';
            position: absolute;
            color: #8B4513;
            font-size: 1rem;
            opacity: 0.6;
          }
          .carta::before { top: 12px; left: 12px; }
          .carta::after { bottom: 12px; right: 12px; }

          .carta-header {
            text-align: center;
            margin-bottom: 2.5rem;
            animation: fadeInUp 0.6s ease;
          }

          .carta-empresa {
            font-family: 'Playfair Display', serif;
            font-size: 2.25rem;
            font-weight: 700;
            color: #4A2814;
            line-height: 1.1;
            letter-spacing: -0.01em;
            margin-bottom: 0.5rem;
          }

          .carta-local {
            font-family: 'Lora', serif;
            font-style: italic;
            font-size: 1rem;
            color: #8B4513;
            font-weight: 400;
          }

          .carta-divider {
            width: 80px;
            height: 2px;
            background: #8B4513;
            margin: 1.5rem auto 0;
            position: relative;
          }
          .carta-divider::before,
          .carta-divider::after {
            content: '◆';
            position: absolute;
            top: -8px;
            color: #8B4513;
            font-size: 0.7rem;
          }
          .carta-divider::before { left: -16px; }
          .carta-divider::after { right: -16px; }

          .carta-secciones { display: flex; flex-direction: column; gap: 2.25rem; }

          .seccion { animation: fadeInUp 0.6s ease backwards; }
          .seccion:nth-child(1) { animation-delay: 0.1s; }
          .seccion:nth-child(2) { animation-delay: 0.2s; }
          .seccion:nth-child(3) { animation-delay: 0.3s; }
          .seccion:nth-child(4) { animation-delay: 0.4s; }
          .seccion:nth-child(n+5) { animation-delay: 0.5s; }

          .seccion-titulo {
            font-family: 'Playfair Display', serif;
            font-size: 1.5rem;
            font-weight: 700;
            color: #4A2814;
            text-align: center;
            margin-bottom: 0.5rem;
            position: relative;
            padding-bottom: 0.5rem;
          }
          .seccion-titulo::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 50px;
            height: 1px;
            background: #B8865A;
          }

          .seccion-desc {
            text-align: center;
            font-style: italic;
            font-size: 0.875rem;
            color: #8B4513;
            margin-bottom: 1.5rem;
          }

          .seccion:not(:has(.seccion-desc)) .seccion-titulo { margin-bottom: 1.25rem; }

          .productos { display: flex; flex-direction: column; gap: 1.25rem; }

          .producto-line {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 0.75rem;
          }

          .producto-nombre {
            font-family: 'Lora', serif;
            font-size: 1.0625rem;
            font-weight: 600;
            color: #3D2814;
          }

          .producto-dots {
            flex: 1;
            border-bottom: 1px dotted #8B4513;
            margin: 0 0.5rem 6px;
            opacity: 0.5;
          }

          .producto-precio {
            font-family: 'Playfair Display', serif;
            font-size: 1.0625rem;
            font-weight: 600;
            color: #4A2814;
            white-space: nowrap;
          }

          .producto-desc {
            font-size: 0.875rem;
            font-style: italic;
            color: #6B4423;
            margin-top: 0.25rem;
            line-height: 1.5;
          }

          .producto-tags { display: flex; flex-wrap: wrap; gap: 0.625rem; margin-top: 0.375rem; }

          .producto-tag { font-size: 0.7rem; color: #8B4513; font-style: italic; }
          .producto-tag-alergenos { color: #A0522D; }

          .carta-footer {
            text-align: center;
            margin-top: 2.5rem;
            padding-top: 2rem;
            border-top: 1px solid #B8865A;
            color: #6B4423;
            font-size: 0.875rem;
            line-height: 1.9;
            animation: fadeInUp 0.6s ease backwards;
            animation-delay: 0.6s;
          }

          .carta-footer-item { display: block; margin: 0.25rem 0; }
          .carta-footer-item a { color: #6B4423; text-decoration: none; }

          .carta-notas {
            margin-top: 1.75rem;
            padding-top: 1.5rem;
            border-top: 1px solid #C8A876;
            text-align: center;
            font-size: 0.8125rem;
            color: #6B4423;
            font-style: italic;
            line-height: 1.7;
            white-space: pre-line;
          }

          .carta-empty { text-align: center; padding: 3rem 2rem; color: #8B4513; }
          .carta-empty-icon { font-size: 2.5rem; opacity: 0.4; margin-bottom: 1rem; }
          .carta-empty-text { font-size: 0.875rem; font-style: italic; }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @media (max-width: 600px) {
            body { padding: 1.5rem 1rem; }
            .carta { padding: 2rem 1.5rem; box-shadow: 0 0 0 6px rgba(253,246,227,0.6), 0 0 0 8px #8B4513; }
            .carta-empresa { font-size: 1.75rem; }
            .seccion-titulo { font-size: 1.25rem; }
            .carta-secciones { gap: 1.75rem; }
          }
        `;
      }
    }, // /clasico_madera

    // 🖤 MODERNO OSCURO — Premium, contemporáneo, Filoso style
    moderno_oscuro: {
      nombre: 'Moderno Oscuro',
      descripcion: 'Negro, dorado tenue, premium. Para cocina de autor y bistrós.',
      premium: true,
      generarCss: function() {
        return `
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Infant:wght@300;500;600&family=Inter:wght@300;400;500;600&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          html, body {
            background: #0E0E0E;
            background-image: radial-gradient(ellipse at top, rgba(212, 175, 55, 0.06) 0%, transparent 50%);
            color: #E8E2D5;
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

          .carta { max-width: 600px; width: 100%; }

          .carta-header {
            text-align: center;
            margin-bottom: 3.5rem;
            animation: fadeInUp 0.6s ease;
          }

          .carta-empresa {
            font-family: 'Cormorant Infant', serif;
            font-size: 2.25rem;
            font-weight: 500;
            color: #F8F1E0;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            line-height: 1.1;
            margin-bottom: 0.625rem;
          }

          .carta-local {
            font-family: 'Inter', sans-serif;
            font-size: 0.75rem;
            color: #D4AF37;
            letter-spacing: 0.25em;
            text-transform: uppercase;
            font-weight: 400;
          }

          .carta-divider {
            width: 30px;
            height: 1px;
            background: #D4AF37;
            margin: 2rem auto;
            opacity: 0.7;
          }

          .carta-secciones { display: flex; flex-direction: column; gap: 3.5rem; }

          .seccion { animation: fadeInUp 0.6s ease backwards; }
          .seccion:nth-child(1) { animation-delay: 0.1s; }
          .seccion:nth-child(2) { animation-delay: 0.2s; }
          .seccion:nth-child(3) { animation-delay: 0.3s; }
          .seccion:nth-child(4) { animation-delay: 0.4s; }
          .seccion:nth-child(n+5) { animation-delay: 0.5s; }

          .seccion-titulo {
            font-family: 'Cormorant Infant', serif;
            font-size: 1.375rem;
            font-weight: 500;
            color: #D4AF37;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            text-align: center;
            margin-bottom: 0.375rem;
          }

          .seccion-desc {
            text-align: center;
            font-size: 0.8125rem;
            color: #8B8478;
            font-style: italic;
            margin-bottom: 2rem;
          }

          .seccion:not(:has(.seccion-desc)) .seccion-titulo { margin-bottom: 1.75rem; }

          .productos { display: flex; flex-direction: column; gap: 1.5rem; }

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
            color: #F8F1E0;
            letter-spacing: 0.01em;
          }

          .producto-dots {
            flex: 1;
            border-bottom: 1px dotted #4A4640;
            margin: 0 0.5rem 4px;
          }

          .producto-precio {
            font-family: 'Cormorant Infant', serif;
            font-size: 1.125rem;
            font-weight: 500;
            color: #D4AF37;
            letter-spacing: 0.02em;
            white-space: nowrap;
          }

          .producto-desc {
            font-size: 0.8125rem;
            color: #A8A091;
            font-weight: 300;
            font-style: italic;
            margin-top: 0.25rem;
            line-height: 1.5;
          }

          .producto-tags { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.375rem; }

          .producto-tag {
            font-size: 0.6875rem;
            color: #8B8478;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            font-weight: 400;
          }
          .producto-tag-alergenos { color: #B5915E; }

          .carta-footer {
            text-align: center;
            margin-top: 4rem;
            padding-top: 2.5rem;
            border-top: 1px solid #2A2620;
            color: #8B8478;
            font-size: 0.8125rem;
            line-height: 1.9;
            animation: fadeInUp 0.6s ease backwards;
            animation-delay: 0.6s;
          }

          .carta-footer-item { display: block; margin: 0.25rem 0; }
          .carta-footer-item a {
            color: #8B8478;
            text-decoration: none;
            transition: color 0.2s;
          }
          .carta-footer-item a:hover { color: #D4AF37; }

          .carta-notas {
            margin-top: 1.75rem;
            padding-top: 1.5rem;
            border-top: 1px solid #2A2620;
            text-align: center;
            font-size: 0.8125rem;
            color: #A8A091;
            font-style: italic;
            line-height: 1.7;
            white-space: pre-line;
          }

          .carta-empty { text-align: center; padding: 4rem 2rem; color: #8B8478; }
          .carta-empty-icon { font-size: 3rem; opacity: 0.3; margin-bottom: 1rem; }
          .carta-empty-text { font-size: 0.875rem; font-style: italic; }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @media (max-width: 600px) {
            body { padding: 2rem 1.25rem; }
            .carta-empresa { font-size: 1.625rem; }
            .seccion-titulo { font-size: 1.125rem; }
            .carta-secciones { gap: 2.75rem; }
          }
        `;
      }
    } // /moderno_oscuro
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
