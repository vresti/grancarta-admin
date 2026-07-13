/*
 * ============================================================
 * GRANCARTA - Motor de PIELES (temas de carta "a perillas")
 *
 * Una PIEL es la apariencia de la carta expresada como DATO
 * (un juego de perillas), NO como HTML/CSS a mano. Un único
 * generador (generarCss) lee las perillas y pinta el CSS sobre
 * la MISMA estructura HTML de siempre (la arma preview.js /
 * el Worker). Cambiar de piel = cambiar las perillas, no el HTML.
 *
 * LAS 16 PERILLAS (lo que la Fábrica expondrá al curador):
 *   Colores (7): fondo · texto · tituloEmpresa · tituloSeccion ·
 *                acento · precio · apagado
 *   Tipografías (2): fuenteTitulos · fuenteCuerpo (lista curada)
 *   Gestos simples (3): mayusculas · densidad · esquinas
 *   Gestos decorativos (4): caja · ornamentos · fondoDeco · divisor
 *
 * Además de esas 16, cada preset lleva TOKENS FINOS (tamaños,
 * pesos, letter-spacing, márgenes) que dan el carácter tipográfico
 * exacto. Para las 3 pieles heredadas están puestos a mano para
 * reproducirlas idénticas; las pieles nuevas usarán defaults.
 *
 * fondoDeco: 'plano' | 'textura' | 'glow' | 'degrade'
 *   - Todos son CSS puro (cero hosting de imágenes). 'degrade'
 *     es nuevo; las imágenes/fotos son fase "personalizada" futura.
 *
 * Filosofía: "menos es más" — Victor Resti
 * ============================================================
 */

const GranCartaPieles = (function() {

  // ============================================================
  // CATÁLOGO DE PIELES (presets)
  // Las 3 heredadas, ahora expresadas como perillas + tokens finos.
  // ============================================================

  const PRESETS = {

    // 🌿 MINIMALISTA — El primero, el universal
    minimalista: {
      id: 'minimalista',
      nombre: 'Minimalista',
      descripcion: 'Blanco, espacio, tipografía elegante. El más universal.',
      premium: false,
      rubro: 'universal',

      fuente: {
        import: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap",
        titulos: "'Cormorant Garamond', serif",
        cuerpo: "'Inter', sans-serif"
      },

      color: {
        fondo: '#FAFAF7',
        fondoImage: '',
        texto: '#1A1A1A',
        nombre: '#1A1A1A',
        tituloEmpresa: '#1A1A1A',
        tituloSeccion: '#1A1A1A',
        acento: '#1A1A1A',
        precio: '#1A1A1A',
        local: '#888',
        seccionDesc: '#888',
        productoDesc: '#666',
        tag: '#999',
        tagAlergeno: '#B85C00',
        dots: '#C5C5C0',
        footer: '#888',
        footerBorde: '#E8E6E0',
        footerHover: '',
        notas: '#777',
        notasBorde: '#E8E6E0',
        empty: '#999'
      },

      // gestos simples
      mayusculas: true,          // empresa + sección en MAYÚSCULA
      densidad: 'aireado',
      esquinas: 'rectas',

      // gestos decorativos
      caja: 'ninguna',           // ninguna | borde | doble-marco
      ornamentos: 'ninguno',     // ninguno | esquinas-divisor
      fondoDeco: 'plano',        // plano | textura | glow | degrade
      divisor: 'linea',          // linea | rombos | punteado | nada

      // tokens finos (carácter tipográfico exacto)
      bodyWeight: '300',
      bodyLh: '1.6',
      bodyPadding: '4rem 1.5rem 3rem',
      bodyPaddingMobile: '2rem 1.25rem',
      cartaMaxWidth: '600px',
      headerMb: '3.5rem',
      empresa: { size: '2rem', weight: '500', ls: '0.04em', lh: '1.2', mb: '0.5rem', sizeMobile: '1.5rem' },
      local:   { size: '0.8125rem', weight: '400', ls: '0.18em', italic: false, family: '' },
      divisorTok: { ancho: '40px', alto: '1px', margin: '2rem auto', opacity: '0.3' },
      seccionesGap: '3rem', seccionesGapMobile: '2.5rem',
      seccion: { size: '1.5rem', weight: '500', ls: '0.1em', mbConDesc: '0.5rem', mbSinDesc: '2rem', sizeMobile: '1.25rem' },
      seccionDescTok: { size: '0.875rem', ls: '0.01em', mb: '2rem' },
      productosGap: '1.5rem', productosGapMobile: '1.25rem',
      productoColumnGap: '0.25rem',    // '' = no agrupar en columna
      nombreTok: { size: '1rem', weight: '500', ls: '0.005em' },
      dots: { marginBottom: '0', top: '-3px', opacity: '0.6' },
      precioTok: { family: 'cuerpo', size: '1rem', weight: '500', ls: '' },
      descTok: { size: '0.875rem', weight: '300', italic: false, mt: '0.125rem' },
      tagsGap: '0.625rem',
      tagTok: { size: '0.7rem', ls: '0.04em', uppercase: false, italic: false, weight: '400', alergenoWeight: '400' },
      footerTok: { mt: '4rem', pt: '2.5rem', size: '0.875rem', lh: '1.8' },
      notasTok: { mt: '2rem', pt: '2rem', size: '0.8125rem' },
      emptyTok: { padding: '4rem 2rem', icon: '3rem', iconOpacity: '0.3' }
    },

    // 🪵 CLÁSICO MADERA — Caoba, sepia, tradicional argentino
    clasico_madera: {
      id: 'clasico_madera',
      nombre: 'Clásico Madera',
      descripcion: 'Caoba, sepia, hospitalario. Para bodegones y parrillas tradicionales.',
      premium: false,
      rubro: 'parrilla',

      fuente: {
        import: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Lora:wght@400;500;600&display=swap",
        titulos: "'Playfair Display', serif",
        cuerpo: "'Lora', serif"
      },

      color: {
        fondo: '#F3E9D2',
        fondoImage: "repeating-linear-gradient(45deg, rgba(101, 67, 33, 0.025) 0, rgba(101, 67, 33, 0.025) 2px, transparent 2px, transparent 12px),\n              linear-gradient(180deg, #F5EBD4 0%, #EDDFC0 100%)",
        texto: '#3D2814',
        nombre: '#3D2814',
        tituloEmpresa: '#4A2814',
        tituloSeccion: '#4A2814',
        acento: '#8B4513',
        precio: '#4A2814',
        local: '#8B4513',
        seccionDesc: '#8B4513',
        productoDesc: '#6B4423',
        tag: '#8B4513',
        tagAlergeno: '#A0522D',
        dots: '#8B4513',
        footer: '#6B4423',
        footerBorde: '#B8865A',
        footerHover: '',
        notas: '#6B4423',
        notasBorde: '#C8A876',
        empty: '#8B4513'
      },

      mayusculas: false,
      densidad: 'compacto',
      esquinas: 'redondeadas',

      caja: 'doble-marco',
      ornamentos: 'esquinas-divisor',
      fondoDeco: 'textura',
      divisor: 'rombos',

      bodyWeight: '',
      bodyLh: '1.65',
      bodyPadding: '3rem 1.5rem 2.5rem',
      bodyPaddingMobile: '1.5rem 1rem',
      cartaMaxWidth: '620px',
      cartaMarco: {
        bg: 'rgba(253, 246, 227, 0.6)',
        padding: '3rem 2.5rem',
        paddingMobile: '2rem 1.5rem',
        border: '2px solid #8B4513',
        radius: '4px',
        shadow: '0 0 0 8px rgba(253, 246, 227, 0.6),\n              0 0 0 10px #8B4513,\n              0 10px 40px rgba(61, 40, 20, 0.2)',
        shadowMobile: '0 0 0 6px rgba(253,246,227,0.6), 0 0 0 8px #8B4513',
        ornamento: '✦',
        ornamentoColor: '#8B4513'
      },
      headerMb: '2.5rem',
      empresa: { size: '2.25rem', weight: '700', ls: '-0.01em', lh: '1.1', mb: '0.5rem', sizeMobile: '1.75rem' },
      local:   { size: '1rem', weight: '400', ls: '', italic: true, family: 'cuerpo' },
      divisorTok: { ancho: '80px', alto: '2px', margin: '1.5rem auto 0', opacity: '1', rombo: '◆' },
      seccionesGap: '2.25rem', seccionesGapMobile: '1.75rem',
      seccion: { size: '1.5rem', weight: '700', ls: '', mbConDesc: '0.5rem', mbSinDesc: '1.25rem', sizeMobile: '1.25rem',
                 subrayado: { ancho: '50px', color: '#B8865A' } },
      seccionDescTok: { size: '0.875rem', ls: '', mb: '1.5rem' },
      productosGap: '1.25rem', productosGapMobile: '',
      productoColumnGap: '',
      nombreTok: { size: '1.0625rem', weight: '600', ls: '' },
      lineGap: '0.75rem',
      dots: { marginBottom: '6px', top: '', opacity: '0.5' },
      precioTok: { family: 'titulos', size: '1.0625rem', weight: '600', ls: '' },
      descTok: { size: '0.875rem', weight: '400', italic: true, mt: '0.25rem' },
      tagsGap: '0.625rem',
      tagTok: { size: '0.7rem', ls: '', uppercase: false, italic: true },
      footerTok: { mt: '2.5rem', pt: '2rem', size: '0.875rem', lh: '1.9' },
      notasTok: { mt: '1.75rem', pt: '1.5rem', size: '0.8125rem' },
      emptyTok: { padding: '3rem 2rem', icon: '2.5rem', iconOpacity: '0.4' }
    },

    // 🖤 MODERNO OSCURO — Premium, contemporáneo
    moderno_oscuro: {
      id: 'moderno_oscuro',
      nombre: 'Moderno Oscuro',
      descripcion: 'Negro, dorado tenue, premium. Para cocina de autor y bistrós.',
      premium: true,
      rubro: 'moderno',

      fuente: {
        import: "https://fonts.googleapis.com/css2?family=Cormorant+Infant:wght@300;500;600&family=Inter:wght@300;400;500;600&display=swap",
        titulos: "'Cormorant Infant', serif",
        cuerpo: "'Inter', sans-serif"
      },

      color: {
        fondo: '#0E0E0E',
        fondoImage: 'radial-gradient(ellipse at top, rgba(212, 175, 55, 0.06) 0%, transparent 50%)',
        texto: '#E8E2D5',
        nombre: '#F8F1E0',
        tituloEmpresa: '#F8F1E0',
        tituloSeccion: '#D4AF37',
        acento: '#D4AF37',
        precio: '#D4AF37',
        local: '#D4AF37',
        seccionDesc: '#8B8478',
        productoDesc: '#A8A091',
        tag: '#8B8478',
        tagAlergeno: '#B5915E',
        dots: '#4A4640',
        footer: '#8B8478',
        footerBorde: '#2A2620',
        footerHover: '#D4AF37',
        notas: '#A8A091',
        notasBorde: '#2A2620',
        empty: '#8B8478'
      },

      mayusculas: true,
      densidad: 'aireado',
      esquinas: 'rectas',

      caja: 'ninguna',
      ornamentos: 'ninguno',
      fondoDeco: 'glow',
      divisor: 'linea',

      bodyWeight: '300',
      bodyLh: '1.6',
      bodyPadding: '4rem 1.5rem 3rem',
      bodyPaddingMobile: '2rem 1.25rem',
      cartaMaxWidth: '600px',
      headerMb: '3.5rem',
      empresa: { size: '2.25rem', weight: '500', ls: '0.08em', lh: '1.1', mb: '0.625rem', sizeMobile: '1.625rem' },
      local:   { size: '0.75rem', weight: '400', ls: '0.25em', italic: false, family: 'cuerpo' },
      divisorTok: { ancho: '30px', alto: '1px', margin: '2rem auto', opacity: '0.7' },
      seccionesGap: '3.5rem', seccionesGapMobile: '2.75rem',
      seccion: { size: '1.375rem', weight: '500', ls: '0.18em', mbConDesc: '0.375rem', mbSinDesc: '1.75rem', sizeMobile: '1.125rem' },
      seccionDescTok: { size: '0.8125rem', ls: '', mb: '2rem' },
      productosGap: '1.5rem', productosGapMobile: '',
      productoColumnGap: '',
      nombreTok: { size: '1rem', weight: '500', ls: '0.01em' },
      dots: { marginBottom: '4px', top: '', opacity: '1' },
      precioTok: { family: 'titulos', size: '1.125rem', weight: '500', ls: '0.02em' },
      descTok: { size: '0.8125rem', weight: '300', italic: true, mt: '0.25rem' },
      tagsGap: '0.75rem',
      tagTok: { size: '0.6875rem', ls: '0.06em', uppercase: true, italic: false, weight: '400' },
      footerTok: { mt: '4rem', pt: '2.5rem', size: '0.8125rem', lh: '1.9' },
      notasTok: { mt: '1.75rem', pt: '1.5rem', size: '0.8125rem' },
      emptyTok: { padding: '4rem 2rem', icon: '3rem', iconOpacity: '0.3' }
    }
  };


  // ============================================================
  // GENERADOR DE CSS DESDE PERILLAS
  // ============================================================

  function fam(p, cual) {
    return cual === 'titulos' ? p.fuente.titulos : p.fuente.cuerpo;
  }

  function bgDecl(p) {
    // background base + background-image según fondoDeco
    let out = '            background: ' + p.color.fondo + ';\n';
    if (p.color.fondoImage) {
      out += '            background-image:\n              ' + p.color.fondoImage + ';\n';
    }
    return out;
  }

  function cartaDecl(p) {
    let out = '            max-width: ' + p.cartaMaxWidth + ';\n            width: 100%;\n';
    if (p.caja === 'doble-marco' && p.cartaMarco) {
      const m = p.cartaMarco;
      out += '            background: ' + m.bg + ';\n';
      out += '            padding: ' + m.padding + ';\n';
      out += '            border: ' + m.border + ';\n';
      out += '            border-radius: ' + m.radius + ';\n';
      out += '            box-shadow:\n              ' + m.shadow + ';\n';
      out += '            position: relative;\n';
    } else if (p.caja === 'borde' && p.cartaMarco) {
      const m = p.cartaMarco;
      out += '            border: ' + m.border + ';\n';
      out += '            border-radius: ' + (m.radius || '0') + ';\n';
      out += '            padding: ' + (m.padding || '2rem') + ';\n';
      out += '            position: relative;\n';
    }
    return out;
  }

  function ornamentosDecl(p) {
    if (p.ornamentos !== 'esquinas-divisor' || !p.cartaMarco) return '';
    const m = p.cartaMarco;
    return `
          .carta::before,
          .carta::after {
            content: '${m.ornamento}';
            position: absolute;
            color: ${m.ornamentoColor};
            font-size: 1rem;
            opacity: 0.6;
          }
          .carta::before { top: 12px; left: 12px; }
          .carta::after { bottom: 12px; right: 12px; }
`;
  }

  function divisorDecl(p) {
    const d = p.divisorTok;
    let out = `
          .carta-divider {
            width: ${d.ancho};
            height: ${d.alto};
            background: ${p.color.acento};
            margin: ${d.margin};`;
    if (d.opacity && d.opacity !== '1') out += `\n            opacity: ${d.opacity};`;
    if (p.divisor === 'rombos') out += `\n            position: relative;`;
    out += `\n          }\n`;
    if (p.divisor === 'rombos' && d.rombo) {
      out += `          .carta-divider::before,
          .carta-divider::after {
            content: '${d.rombo}';
            position: absolute;
            top: -8px;
            color: ${p.color.acento};
            font-size: 0.7rem;
          }
          .carta-divider::before { left: -16px; }
          .carta-divider::after { right: -16px; }
`;
    }
    return out;
  }

  function seccionTituloDecl(p) {
    const s = p.seccion;
    let out = `
          .seccion-titulo {
            font-family: ${fam(p, 'titulos')};
            font-size: ${s.size};
            font-weight: ${s.weight};
            color: ${p.color.tituloSeccion};`;
    if (s.ls) out += `\n            letter-spacing: ${s.ls};`;
    if (p.mayusculas) out += `\n            text-transform: uppercase;`;
    out += `\n            text-align: center;
            margin-bottom: ${s.mbConDesc};`;
    if (s.subrayado) {
      out += `\n            position: relative;
            padding-bottom: 0.5rem;`;
    }
    out += `\n          }\n`;
    if (s.subrayado) {
      out += `          .seccion-titulo::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: ${s.subrayado.ancho};
            height: 1px;
            background: ${s.subrayado.color};
          }
`;
    }
    return out;
  }

  function generarCss(p) {
    const c = p.color;
    const esq = p.esquinas === 'redondeadas' ? '4px' : '0';

    let css = `
          @import url('${p.fuente.import}');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          html, body {
${bgDecl(p)}            color: ${c.texto};
            font-family: ${fam(p, 'cuerpo')};${p.bodyWeight ? '\n            font-weight: ' + p.bodyWeight + ';' : ''}
            line-height: ${p.bodyLh};
            -webkit-font-smoothing: antialiased;
          }

          body {
            min-height: 100vh;
            padding: ${p.bodyPadding};
            display: flex;
            justify-content: center;
          }

          .carta {
${cartaDecl(p)}          }
${ornamentosDecl(p)}
          .carta-header {
            text-align: center;
            margin-bottom: ${p.headerMb};
            animation: fadeInUp 0.6s ease;
          }

          .carta-empresa {
            font-family: ${fam(p, 'titulos')};
            font-size: ${p.empresa.size};
            font-weight: ${p.empresa.weight};
            color: ${c.tituloEmpresa};
            letter-spacing: ${p.empresa.ls};${p.mayusculas ? '\n            text-transform: uppercase;' : ''}
            line-height: ${p.empresa.lh};
            margin-bottom: ${p.empresa.mb};
          }

          .carta-local {${p.local.family ? '\n            font-family: ' + fam(p, p.local.family) + ';' : ''}
            font-size: ${p.local.size};
            color: ${c.local};${p.local.ls ? '\n            letter-spacing: ' + p.local.ls + ';' : ''}${p.local.italic ? '\n            font-style: italic;' : ''}${!p.local.italic ? '\n            text-transform: uppercase;' : ''}
            font-weight: ${p.local.weight};
          }
${divisorDecl(p)}
          .carta-secciones {
            display: flex;
            flex-direction: column;
            gap: ${p.seccionesGap};
          }

          .seccion { animation: fadeInUp 0.6s ease backwards; }
          .seccion:nth-child(1) { animation-delay: 0.1s; }
          .seccion:nth-child(2) { animation-delay: 0.2s; }
          .seccion:nth-child(3) { animation-delay: 0.3s; }
          .seccion:nth-child(4) { animation-delay: 0.4s; }
          .seccion:nth-child(n+5) { animation-delay: 0.5s; }
${seccionTituloDecl(p)}
          .seccion-desc {
            text-align: center;
            font-size: ${p.seccionDescTok.size};
            color: ${c.seccionDesc};
            font-style: italic;
            margin-bottom: ${p.seccionDescTok.mb};${p.seccionDescTok.ls ? '\n            letter-spacing: ' + p.seccionDescTok.ls + ';' : ''}
          }

          .seccion:not(:has(.seccion-desc)) .seccion-titulo { margin-bottom: ${p.seccion.mbSinDesc}; }

          .productos {
            display: flex;
            flex-direction: column;
            gap: ${p.productosGap};
          }
${p.productoColumnGap ? `
          .producto {
            display: flex;
            flex-direction: column;
            gap: ${p.productoColumnGap};
          }
` : ''}
          .producto-line {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: ${p.lineGap || '1rem'};
          }

          .producto-nombre {
            font-family: ${fam(p, 'cuerpo')};
            font-size: ${p.nombreTok.size};
            font-weight: ${p.nombreTok.weight};
            color: ${c.nombre};${p.nombreTok.ls ? '\n            letter-spacing: ' + p.nombreTok.ls + ';' : ''}
          }

          .producto-dots {
            flex: 1;
            border-bottom: 1px dotted ${c.dots};
            margin: 0 0.5rem${p.dots.marginBottom && p.dots.marginBottom !== '0' ? ' ' + p.dots.marginBottom : ''};${p.dots.top ? '\n            position: relative;\n            top: ' + p.dots.top + ';' : ''}${p.dots.opacity && p.dots.opacity !== '1' ? '\n            opacity: ' + p.dots.opacity + ';' : ''}
          }

          .producto-precio {
            font-family: ${fam(p, p.precioTok.family)};
            font-size: ${p.precioTok.size};
            font-weight: ${p.precioTok.weight};
            color: ${c.precio};${p.precioTok.ls ? '\n            letter-spacing: ' + p.precioTok.ls + ';' : ''}
            white-space: nowrap;
          }

          .producto-desc {
            font-size: ${p.descTok.size};
            color: ${c.productoDesc};${p.descTok.weight !== '400' ? '\n            font-weight: ' + p.descTok.weight + ';' : ''}${p.descTok.italic ? '\n            font-style: italic;' : ''}
            margin-top: ${p.descTok.mt};
            line-height: 1.5;
          }

          .producto-tags {
            display: flex;
            flex-wrap: wrap;
            gap: ${p.tagsGap};
            margin-top: 0.375rem;
          }

          .producto-tag {
            font-size: ${p.tagTok.size};
            color: ${c.tag};${p.tagTok.ls ? '\n            letter-spacing: ' + p.tagTok.ls + ';' : ''}${p.tagTok.uppercase ? '\n            text-transform: uppercase;' : ''}${p.tagTok.italic ? '\n            font-style: italic;' : ''}${p.tagTok.weight ? '\n            font-weight: ' + p.tagTok.weight + ';' : ''}
          }

          .producto-tag-alergenos { color: ${c.tagAlergeno};${p.tagTok.alergenoWeight ? ' font-weight: ' + p.tagTok.alergenoWeight + ';' : ''} }

          .carta-footer {
            text-align: center;
            margin-top: ${p.footerTok.mt};
            padding-top: ${p.footerTok.pt};
            border-top: 1px solid ${c.footerBorde};
            color: ${c.footer};
            font-size: ${p.footerTok.size};
            line-height: ${p.footerTok.lh};
            animation: fadeInUp 0.6s ease backwards;
            animation-delay: 0.6s;
          }

          .carta-footer-item { display: block; margin: 0.25rem 0; }
          .carta-footer-item a {
            color: ${c.footer};
            text-decoration: none;${c.footerHover ? '\n            transition: color 0.2s;' : ''}
          }${c.footerHover ? `\n          .carta-footer-item a:hover { color: ${c.footerHover}; }` : ''}

          .carta-notas {
            margin-top: ${p.notasTok.mt};
            padding-top: ${p.notasTok.pt};
            border-top: 1px solid ${c.notasBorde};
            text-align: center;
            font-size: ${p.notasTok.size};
            color: ${c.notas};
            font-style: italic;
            line-height: 1.7;
            white-space: pre-line;
          }

          .carta-empty { text-align: center; padding: ${p.emptyTok.padding}; color: ${c.empty}; }
          .carta-empty-icon { font-size: ${p.emptyTok.icon}; opacity: ${p.emptyTok.iconOpacity}; margin-bottom: 1rem; }
          .carta-empty-text { font-size: 0.875rem; font-style: italic; }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @media (max-width: 600px) {
            body { padding: ${p.bodyPaddingMobile}; }${p.caja === 'doble-marco' && p.cartaMarco ? `\n            .carta { padding: ${p.cartaMarco.paddingMobile}; box-shadow: ${p.cartaMarco.shadowMobile}; }` : ''}
            .carta-empresa { font-size: ${p.empresa.sizeMobile}; }
            .seccion-titulo { font-size: ${p.seccion.sizeMobile}; }
            .carta-secciones { gap: ${p.seccionesGapMobile}; }${p.productosGapMobile ? `\n            .productos { gap: ${p.productosGapMobile}; }` : ''}
          }
        `;
    return css;
  }


  // ============================================================
  // API PÚBLICA
  // ============================================================

  return {
    PRESETS: PRESETS,
    generarCss: generarCss,
    listar: function() {
      return Object.keys(PRESETS).map(function(k) {
        return {
          id: k,
          nombre: PRESETS[k].nombre,
          descripcion: PRESETS[k].descripcion,
          premium: PRESETS[k].premium,
          rubro: PRESETS[k].rubro
        };
      });
    }
  };

})();

// Compatibilidad Node (para scripts de verificación); inocuo en el browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = GranCartaPieles; }
