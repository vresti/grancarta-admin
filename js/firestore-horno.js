/*
 * ============================================================================
 * GRANCARTA ADMIN · Operación Firestore (módulo GCFirestore)
 * ----------------------------------------------------------------------------
 * Hogar de toda la escritura del admin a Firestore. Hoy:
 *   · setEstadoProducto(...)  → cambia estado_visibilidad / precio de un producto
 *   · hornearLocal(...)       → rehornea menus_publicados de un local (en el navegador)
 *   · hornearLocalesDeCarta() → rehornea todos los locales que publican una carta
 *
 * Requiere: Firebase (app+auth+firestore compat) cargado e inicializado, y que
 * el admin haya hecho signInWithCustomToken (identidad USR-xxxx ya activa).
 * Las reglas gobiernan todo: solo el dueño de la cuenta escribe lo suyo.
 *
 * Patrón estrangulador: el admin sigue escribiendo la planilla vía GAS; ADEMÁS
 * llama a estas funciones para reflejar el cambio en Firestore y que el cliente
 * lo vea. Si algo de acá falla, el admin sigue funcionando con la planilla.
 * ============================================================================
 */
(function () {
  'use strict';

  function db() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      throw new Error('Firestore no está disponible');
    }
    return firebase.firestore();
  }
  function ordenar(a, b) { return (a.orden || 0) - (b.orden || 0); }

  // ---------------------------------------------------------------------------
  // GENERADOR DE IDs en Firestore (reemplaza a GAS). Transacción atómica sobre
  // contadores/{PREFIJO}.ultimo → devuelve 'PREFIJO-XXXX' (4 dígitos, padding).
  // Requiere haber corrido seed_contadores.js una vez (siembra el valor inicial).
  // ---------------------------------------------------------------------------
  async function generarId(prefijo) {
    const D = db();
    const ref = D.collection('contadores').doc(prefijo);
    const nuevoNumero = await D.runTransaction(async function (tx) {
      const doc = await tx.get(ref);
      if (!doc.exists) {
        throw new Error('Contador ' + prefijo + ' no existe. Correr seed_contadores.js primero.');
      }
      const ultimo = doc.data().ultimo || 0;
      const siguiente = ultimo + 1;
      tx.update(ref, { ultimo: siguiente });
      return siguiente;
    });
    return prefijo + '-' + String(nuevoNumero).padStart(4, '0');
  }

  // ---------------------------------------------------------------------------
  // Escritura puntual del producto (estado y/o precio) en la carta normalizada.
  // ruta: empresas/{emp}/cartas/{carta}/productos/{prod}
  // ---------------------------------------------------------------------------
  async function setEstadoProducto(idEmpresa, idCarta, idProducto, campos) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .collection('productos').doc(idProducto);
    await ref.update(campos);   // campos: { estado_visibilidad, disponible_hoy, precio, ... }
  }

  // ---------------------------------------------------------------------------
  // Actualiza campos de un producto EXISTENTE (editar): nombre, descripcion,
  // precio, etiquetas. ruta: empresas/{emp}/cartas/{carta}/productos/{prod}
  // ---------------------------------------------------------------------------
  async function actualizarProducto(idEmpresa, idCarta, idProducto, campos) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .collection('productos').doc(idProducto);
    await ref.update(campos);
  }

  // ---------------------------------------------------------------------------
  // Crea un producto NUEVO en Firestore con el ID que ya generó GAS.
  // (GAS es la fuente del ID por su contador con LockService; acá solo
  //  espejamos el documento con ese mismo ID para que el cliente lo vea.)
  // ---------------------------------------------------------------------------
  async function crearProducto(idEmpresa, idCarta, idProducto, datos) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .collection('productos').doc(idProducto);
    await ref.set(datos);   // set: crea el doc nuevo con el ID dado
  }

  // ---------------------------------------------------------------------------
  // Elimina FÍSICAMENTE un producto de Firestore (delete del doc). Definitivo.
  // ruta: empresas/{emp}/cartas/{carta}/productos/{prod}
  // ---------------------------------------------------------------------------
  async function eliminarProducto(idEmpresa, idCarta, idProducto) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .collection('productos').doc(idProducto);
    await ref.delete();
  }

  // ---------------------------------------------------------------------------
  // SECCIONES — operaciones sobre empresas/{emp}/cartas/{carta}/secciones/{scc}
  // ---------------------------------------------------------------------------
  async function actualizarSeccion(idEmpresa, idCarta, idSeccion, campos) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .collection('secciones').doc(idSeccion);
    await ref.update(campos);   // { nombre, descripcion }
  }

  async function crearSeccion(idEmpresa, idCarta, idSeccion, datos) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .collection('secciones').doc(idSeccion);
    await ref.set(datos);       // { nombre, descripcion, orden }
  }

  // Elimina una sección Y TODOS sus productos (no hay padrón reutilizable: el
  // producto vive dentro de su sección). Borrado físico, definitivo.
  async function eliminarSeccionConProductos(idEmpresa, idCarta, idSeccion) {
    const D = db();
    const cartaRef = D.collection('empresas').doc(idEmpresa).collection('cartas').doc(idCarta);

    // 1) Borrar todos los productos de esa sección.
    const prodSnap = await cartaRef.collection('productos').where('id_seccion', '==', idSeccion).get();
    const batch = D.batch();
    prodSnap.docs.forEach(function (d) { batch.delete(d.ref); });
    // 2) Borrar la sección.
    batch.delete(cartaRef.collection('secciones').doc(idSeccion));
    await batch.commit();
    return { productos_borrados: prodSnap.size };
  }

  // Intercambia el campo 'orden' entre dos productos (subir/bajar) dentro de una carta.
  async function intercambiarOrdenProductos(idEmpresa, idCarta, idProdA, ordenA, idProdB, ordenB) {
    const D = db();
    const cartaRef = D.collection('empresas').doc(idEmpresa).collection('cartas').doc(idCarta);
    const batch = D.batch();
    batch.update(cartaRef.collection('productos').doc(idProdA), { orden: ordenB });
    batch.update(cartaRef.collection('productos').doc(idProdB), { orden: ordenA });
    await batch.commit();
  }

  // Intercambia el campo 'orden' entre dos secciones (subir/bajar).
  async function intercambiarOrdenSecciones(idEmpresa, idCarta, idSeccionA, ordenA, idSeccionB, ordenB) {
    const D = db();
    const cartaRef = D.collection('empresas').doc(idEmpresa).collection('cartas').doc(idCarta);
    const batch = D.batch();
    batch.update(cartaRef.collection('secciones').doc(idSeccionA), { orden: ordenB });
    batch.update(cartaRef.collection('secciones').doc(idSeccionB), { orden: ordenA });
    await batch.commit();
  }

  // ---------------------------------------------------------------------------
  // LECTURA del editor: lee carta + secciones + TODOS los productos de Firestore
  // y devuelve la forma EXACTA que espera renderEditor (campos con Mayúscula).
  // A diferencia del horno, NO filtra por estado (el editor gestiona todos).
  // ---------------------------------------------------------------------------
  async function leerCartaCompleta(idEmpresa, idCarta) {
    const D = db();
    const cartaRef = D.collection('empresas').doc(idEmpresa).collection('cartas').doc(idCarta);
    const cartaSnap = await cartaRef.get();
    if (!cartaSnap.exists) throw new Error('Carta no encontrada en Firestore: ' + idCarta);
    const c = cartaSnap.data();

    const seccSnap = await cartaRef.collection('secciones').get();
    const prodSnap = await cartaRef.collection('productos').get();

    // Productos por sección (forma del front), sin filtrar estado.
    const productos = prodSnap.docs.map(function (d) {
      const p = d.data();
      return {
        Id_Producto: d.id,
        Id_Seccion: p.id_seccion || '',
        Nombre: p.nombre || '',
        Descripcion: p.descripcion || '',
        Precio: (p.precio === undefined || p.precio === null) ? 0 : p.precio,
        Estado_Visibilidad: p.estado_visibilidad || (p.disponible_hoy ? 'visible' : 'oculto'),
        Disponible_Hoy: (p.estado_visibilidad ? p.estado_visibilidad === 'visible' : !!p.disponible_hoy),
        Etiquetas: p.etiquetas || { alergenos: [], vegetariano: false, sin_tacc: false, picante: false },
        Orden: p.orden || 0
      };
    });

    const secciones = seccSnap.docs.map(function (d) {
      const s = d.data();
      const items = productos
        .filter(function (pr) { return pr.Id_Seccion === d.id; })
        .sort(function (a, b) { return (a.Orden || 0) - (b.Orden || 0); });
      return {
        Id_Seccion: d.id,
        Nombre: s.nombre || '',
        Descripcion: s.descripcion || '',
        Orden: s.orden || 0,
        productos: items
      };
    }).sort(function (a, b) { return (a.Orden || 0) - (b.Orden || 0); });

    const cantidadProductos = productos.length;
    const disponibles = productos.filter(function (p) { return p.Estado_Visibilidad === 'visible'; }).length;

    const carta = {
      Id_Carta: idCarta,
      Id_Empresa: c.id_empresa || idEmpresa,
      Nombre: c.nombre || '',
      Descripcion: c.descripcion || '',
      Redondeo: (c.redondeo === undefined || c.redondeo === null) ? '10' : c.redondeo,
      Estado: c.estado || 'activa',
      Template: c.template || ''
    };

    return {
      carta: carta,
      secciones: secciones,
      stats: {
        cantidad_secciones: secciones.length,
        cantidad_productos: cantidadProductos,
        productos_disponibles: disponibles
      }
    };
  }

  // Metadata de la carta (SIN secciones/productos), para el modal "editar carta".
  // Reemplaza el read GAS cartaObtenerCompleta. Mapea el doc FS (snake_case) a los
  // nombres que usa el modal (PascalCase). Etapa 2, frente B.
  async function leerCartaMetadata(idEmpresa, idCarta) {
    const snap = await db().collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta).get();
    if (!snap.exists) throw new Error('Carta no encontrada en Firestore: ' + idCarta);
    const c = snap.data();
    return {
      Id_Carta: idCarta,
      Nombre: c.nombre || '',
      Descripcion: c.descripcion || '',
      Redondeo: (c.redondeo === undefined || c.redondeo === null) ? '10' : c.redondeo,
      Pie_Direccion: c.pie_direccion || '',
      Pie_Telefono: c.pie_telefono || '',
      Pie_Mail: c.pie_mail || '',
      Notas: c.notas || '',
      Template: c.template || 'minimalista',
      Estado: c.estado || 'activa'
    };
  }

  // ---------------------------------------------------------------------------
  // CARTAS (nivel carta) — operan sobre empresas/{emp}/cartas/{carta}
  // ---------------------------------------------------------------------------

  // Lista las cartas de una empresa (excluye archivadas). Devuelve la forma
  // PascalCase que espera renderCartas en el admin.
  async function listarCartas(idEmpresa) {
    const snap = await db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').get();
    return snap.docs.map(function (d) {
      const c = d.data();
      return {
        Id_Carta: d.id,
        Nombre: c.nombre || '',
        Descripcion: c.descripcion || '',
        Estado: c.estado || 'activa',
        Redondeo: (c.redondeo === undefined || c.redondeo === null) ? '10' : c.redondeo,
        Template: c.template || ''
      };
    }).filter(function (c) { return c.Estado !== 'archivada'; });
  }

  // Actualiza campos de una carta EXISTENTE. Sirve para metadatos
  // ({ nombre, descripcion, redondeo, pie_*, notas, template }) o para cambiar
  // de estado ({ estado: 'activa' | 'archivada' }). Campos en minúscula = los
  // del doc en Firestore.
  async function actualizarCarta(idEmpresa, idCarta, campos) {
    const ref = db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta);
    await ref.update(campos);
  }

  // Redondeo de precios — réplica EXACTA de _redondear() de GAS (Script 09).
  function _redondearPrecio(valor, modo) {
    const num = parseFloat(valor);
    if (isNaN(num)) return valor;
    switch (modo) {
      case 'sin':  return Math.round(num * 100) / 100;
      case '10':   return Math.round(num / 10) * 10;
      case '100':  return Math.round(num / 100) * 100;
      case '1000': return Math.round(num / 1000) * 1000;
      default:     return Math.round(num / 10) * 10;
    }
  }

  // Crea una carta NUEVA en Firestore, en estado 'borrador'. Genera el ID
  // CAR-XXXX con el contador de Firestore (requiere contadores/CAR sembrado).
  async function crearCarta(idEmpresa, datos) {
    const idCarta = await generarId('CAR');
    await db()
      .collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta)
      .set({
        id_empresa: idEmpresa,
        nombre: datos.nombre || '',
        descripcion: datos.descripcion || '',
        redondeo: datos.redondeo || '10',
        template: datos.template || 'minimalista',
        estado: 'borrador',
        pie_direccion: datos.pie_direccion || '',
        pie_telefono: datos.pie_telefono || '',
        pie_mail: datos.pie_mail || '',
        notas: datos.notas || ''
      });
    return idCarta;
  }

  // Siembra una CARTA DE EJEMPLO para una empresa que arranca de cero (sin cartas).
  // 2 secciones × 2 productos de muestra, precios de ejemplo, todo visible, y la deja
  // en estado 'activa' → lista para publicar de una. Usa la estructura NORMAL de
  // secciones/productos, así el editor de siempre la edita y la borra sin nada especial.
  // Devuelve el id de la carta creada.
  async function sembrarCartaEjemplo(idEmpresa) {
    const idCarta = await crearCarta(idEmpresa, {
      nombre: 'Carta de ejemplo',
      descripcion: 'Carta de muestra: editá o borrá estas secciones y productos, cambiá los precios, y cuando esté lista publicala.',
      redondeo: '10'
    });

    // 2 secciones × 2 productos. Precios de ejemplo (el dueño los cambia).
    const secciones = [
      {
        nombre: 'Entradas', descripcion: '', orden: 1,
        productos: [
          { nombre: 'Empanada de carne', descripcion: 'Producto de ejemplo — editalo o borralo', precio: 2500, orden: 1 },
          { nombre: 'Provoleta',         descripcion: 'Producto de ejemplo — editalo o borralo', precio: 4000, orden: 2 }
        ]
      },
      {
        nombre: 'Principales', descripcion: '', orden: 2,
        productos: [
          { nombre: 'Milanesa con papas', descripcion: 'Producto de ejemplo — editalo o borralo', precio: 8000,  orden: 1 },
          { nombre: 'Bife de chorizo',    descripcion: 'Producto de ejemplo — editalo o borralo', precio: 12000, orden: 2 }
        ]
      }
    ];

    for (const sec of secciones) {
      const idSeccion = await generarId('SCC');
      await crearSeccion(idEmpresa, idCarta, idSeccion, {
        nombre: sec.nombre, descripcion: sec.descripcion, orden: sec.orden
      });
      for (const p of sec.productos) {
        const idProducto = await generarId('PRD');
        await crearProducto(idEmpresa, idCarta, idProducto, {
          id_seccion: idSeccion,
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: p.precio,
          foto_url: '',
          etiquetas: { alergenos: [], vegetariano: false, sin_tacc: false, picante: false },
          estado_visibilidad: 'visible',
          disponible_hoy: true,
          orden: p.orden
        });
      }
    }

    // Dejarla activa → lista para publicar (crearCarta la deja en 'borrador').
    await actualizarCarta(idEmpresa, idCarta, { estado: 'activa' });
    return idCarta;
  }

  // Duplica una carta (carta + secciones + productos) dentro de la misma empresa.
  // Aplica un modificador % a los precios y redondea según la carta nueva.
  // La carta nueva queda en 'borrador'. Genera todos los IDs en Firestore.
  async function duplicarCarta(idEmpresa, idOrigen, nombreNueva, modificador) {
    const empRef = db().collection('empresas').doc(idEmpresa);
    const origRef = empRef.collection('cartas').doc(idOrigen);
    const origSnap = await origRef.get();
    if (!origSnap.exists) throw new Error('Carta de origen no encontrada: ' + idOrigen);
    const orig = origSnap.data();

    const redondeo = orig.redondeo || '10';
    const template = orig.template || 'minimalista';
    const factor = 1 + ((parseFloat(modificador) || 0) / 100);

    // 1) Carta nueva (borrador), copiando metadatos del origen.
    const idNueva = await generarId('CAR');
    const nuevaRef = empRef.collection('cartas').doc(idNueva);
    await nuevaRef.set({
      id_empresa: idEmpresa,
      nombre: nombreNueva,
      descripcion: orig.descripcion || '',
      redondeo: redondeo,
      template: template,
      estado: 'borrador',
      pie_direccion: orig.pie_direccion || '',
      pie_telefono: orig.pie_telefono || '',
      pie_mail: orig.pie_mail || '',
      notas: orig.notas || ''
    });

    // 2) Secciones (mapeo id viejo -> id nuevo).
    const seccSnap = await origRef.collection('secciones').get();
    const mapeoSecciones = {};
    for (const d of seccSnap.docs) {
      const s = d.data();
      const idSecNuevo = await generarId('SCC');
      mapeoSecciones[d.id] = idSecNuevo;
      await nuevaRef.collection('secciones').doc(idSecNuevo).set({
        nombre: s.nombre || '',
        descripcion: s.descripcion || '',
        foto_url: s.foto_url || '',
        orden: s.orden || 0
      });
    }

    // 3) Productos (precio modificado + redondeado; preserva visibilidad).
    const prodSnap = await origRef.collection('productos').get();
    let productosCopiados = 0;
    for (const d of prodSnap.docs) {
      const p = d.data();
      const idSecNuevo = mapeoSecciones[p.id_seccion];
      if (!idSecNuevo) continue;
      const precioFinal = _redondearPrecio((parseFloat(p.precio) || 0) * factor, redondeo);
      const estadoVis = p.estado_visibilidad || (p.disponible_hoy ? 'visible' : 'oculto');
      const idProdNuevo = await generarId('PRD');
      await nuevaRef.collection('productos').doc(idProdNuevo).set({
        id_seccion: idSecNuevo,
        nombre: p.nombre || '',
        descripcion: p.descripcion || '',
        precio: precioFinal,
        foto_url: p.foto_url || '',
        etiquetas: p.etiquetas || { alergenos: [], vegetariano: false, sin_tacc: false, picante: false },
        estado_visibilidad: estadoVis,
        disponible_hoy: estadoVis === 'visible',
        orden: p.orden || 0
      });
      productosCopiados++;
    }

    return {
      id_carta_nueva: idNueva,
      secciones_copiadas: seccSnap.size,
      productos_copiados: productosCopiados
    };
  }

  // ---------------------------------------------------------------------------
  // SECTORES — toggle de botones de atención (espejo a Firestore).
  // El comensal lee empresas/{emp}/locales/{loc}/sectores/{sec}.botones_activos
  // de Firestore; GAS solo escribía la planilla, así que el cambio no le llegaba.
  // Esto refleja el toggle en Firestore para cerrar ese hueco.
  //   alcance 'sector'   → solo ese sector.
  //   alcance 'sucursal' → todos los sectores del local.
  // ---------------------------------------------------------------------------
  async function toggleBotonesSector(idEmpresa, idLocal, idSector, activo, alcance) {
    const D = db();
    const sectoresRef = D
      .collection('empresas').doc(idEmpresa)
      .collection('locales').doc(idLocal)
      .collection('sectores');
    if (alcance === 'sucursal') {
      const snap = await sectoresRef.get();
      const batch = D.batch();
      snap.docs.forEach(function (d) { batch.update(d.ref, { botones_activos: !!activo }); });
      await batch.commit();
      return { actualizados: snap.size };
    }
    await sectoresRef.doc(idSector).update({ botones_activos: !!activo });
    return { actualizados: 1 };
  }

  // ---------------------------------------------------------------------------
  // SECTORES — listado enriquecido (reemplaza el GAS sector_listar, SOLO LECTURA).
  // Arma la forma PascalCase que espera renderSectores en el admin, fiel al GAS:
  //   · sectores: filtra estado != 'eliminado', ordena por orden
  //   · mesas:    filtra estado != 'eliminada', agrupa por sector, orden natural
  //   · canal:    cruza audience_slug del sector contra las publicaciones ACTIVAS
  //               del local → canal_existe + carta_nombre (nombre de la carta).
  // Url_Completa_QR queda '' (el listado no la muestra; el QR real es otro paso).
  // ---------------------------------------------------------------------------
  function _compararNatural(a, b) {
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b),
      undefined, { numeric: true, sensitivity: 'base' });
  }

  async function listarSectores(idEmpresa, idLocal) {
    const D = db();
    const locRef = D.collection('empresas').doc(idEmpresa)
      .collection('locales').doc(idLocal);

    // 1) Publicaciones activas → mapa audience_slug → carta publicada.
    const pubsSnap = await locRef.collection('publicaciones')
      .where('estado', '==', 'activa').get();
    const canalPorSlug = {};
    const cartaIds = {};
    pubsSnap.docs.forEach(function (d) {
      const p = d.data();
      const slug = p.audience_slug || '';
      canalPorSlug[slug] = { id_carta: p.id_carta || '' };
      if (p.id_carta) cartaIds[p.id_carta] = true;
    });

    // 2) Nombre de cada carta publicada (una lectura por carta distinta).
    const cartaNombre = {};
    await Promise.all(Object.keys(cartaIds).map(async function (cid) {
      const cs = await D.collection('empresas').doc(idEmpresa)
        .collection('cartas').doc(cid).get();
      cartaNombre[cid] = cs.exists ? (cs.data().nombre || '') : '';
    }));

    // 3) Mesas vivas del local, agrupadas por sector.
    const mesasSnap = await locRef.collection('mesas').get();
    const mesasPorSector = {};
    mesasSnap.docs.forEach(function (d) {
      const m = d.data();
      if (m.estado === 'eliminada') return;
      const sec = m.id_sector || '';
      if (!mesasPorSector[sec]) mesasPorSector[sec] = [];
      mesasPorSector[sec].push({
        Id_Mesa: d.id,
        Numero: m.numero,
        Nombre_Visible: m.nombre_visible || '',
        Capacidad: m.capacidad || '',
        Token_QR: m.token_qr || '',
        Url_Completa_QR: '',          // se resuelve en vivo en el paso de QR
        Estado: m.estado || 'activa'
      });
    });

    // 4) Sectores vivos, ordenados y enriquecidos con su canal/carta.
    const secSnap = await locRef.collection('sectores').get();
    const sectores = secSnap.docs
      .map(function (d) { return { id: d.id, data: d.data() }; })
      .filter(function (x) { return x.data.estado !== 'eliminado'; })
      .sort(function (a, b) {
        return (parseInt(a.data.orden, 10) || 0) - (parseInt(b.data.orden, 10) || 0);
      })
      .map(function (x) {
        const s = x.data;
        const slug = s.audience_slug || '';
        const canal = canalPorSlug[slug] || null;
        const mesas = (mesasPorSector[x.id] || []).sort(function (m1, m2) {
          return _compararNatural(m1.Numero, m2.Numero);
        });
        return {
          Id_Sector: x.id,
          Id_Local: s.id_local || idLocal,
          Nombre: s.nombre || '',
          Color_Hex: s.color_hex || '#1B2B4A',
          Orden: s.orden,
          Estado: s.estado || 'activo',
          Audience_Slug: slug,
          Botones_Activos: s.botones_activos === true,
          canal_nombre: slug || '(default)',
          canal_existe: !!canal,
          carta_nombre: canal ? (cartaNombre[canal.id_carta] || '') : '',
          cantidad_mesas: mesas.length,
          mesas: mesas
        };
      });

    return { sectores: sectores, cantidad: sectores.length };
  }

  // ---------------------------------------------------------------------------
  // SECTORES/MESAS — escritura (reemplaza el GAS sector_crear/actualizar/eliminar).
  // Preserva las validaciones del GAS: canal activo, número de mesa único por
  // local (case-insensitive), sector nace con ≥1 mesa, borrado lógico.
  // ---------------------------------------------------------------------------

  function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    // Fallback simple (RFC4122 v4) por si el navegador no tiene crypto.randomUUID.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Slugs de los canales (publicaciones ACTIVAS) del local — para validar canal.
  async function _slugsCanalesActivos(locRef) {
    const snap = await locRef.collection('publicaciones').where('estado', '==', 'activa').get();
    return snap.docs.map(function (d) { return (d.data().audience_slug || ''); });
  }

  // ¿El número de mesa ya existe en el local? (case-insensitive + trim; ignora
  // mesas eliminadas y, opcionalmente, una mesa que se está editando).
  async function _numeroMesaRepetido(locRef, numero, idMesaExcluir) {
    const objetivo = String(numero == null ? '' : numero).trim().toLowerCase();
    if (objetivo === '') return false;
    const snap = await locRef.collection('mesas').get();
    return snap.docs.some(function (d) {
      const m = d.data();
      if (m.estado === 'eliminada') return false;
      if (idMesaExcluir && d.id === idMesaExcluir) return false;
      return String(m.numero || '').trim().toLowerCase() === objetivo;
    });
  }

  // Próximo orden de sector libre en el local (max + 1, ignora eliminados).
  async function _siguienteOrdenSector(locRef) {
    const snap = await locRef.collection('sectores').get();
    let max = 0;
    snap.docs.forEach(function (d) {
      const s = d.data();
      if (s.estado === 'eliminado') return;
      const o = parseInt(s.orden, 10);
      if (!isNaN(o) && o > max) max = o;
    });
    return max + 1;
  }

  // Crea una mesa: doc mesa + doc tokens_mesa (atómico vía batch). Compartido por
  // crearSector (primera mesa) y crearMesa (paso 5). Mintea el token (regla v1.4).
  // NO guarda URL: el QR se calcula en vivo en el paso de impresión.
  async function _crearMesaDoc(idEmpresa, idLocal, idSector, audienceSlug, numero, capacidad, nombreVisible) {
    const D = db();
    const locRef = D.collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);

    const numFinal = String(numero == null ? '' : numero).trim();
    if (numFinal === '') throw new Error('El identificador de la mesa es obligatorio (ej: 1, Barra 1, VIP-A)');
    if (await _numeroMesaRepetido(locRef, numFinal, null)) {
      throw new Error('Ya existe una mesa "' + numFinal + '" en este local. Los identificadores no se pueden repetir.');
    }

    const idMesa = await generarId('MES');
    const token = _uuid();
    // nombre_visible: si no se especifica otro, es IGUAL al número (sin "Mesa ").
    const nombreFinal = (nombreVisible && String(nombreVisible).trim() !== '')
      ? String(nombreVisible).trim() : numFinal;

    const mesaDoc = {
      id_local: idLocal,
      id_sector: idSector,
      numero: numFinal,
      nombre_visible: nombreFinal,
      token_qr: token,
      estado: 'activa',
      fecha_alta: firebase.firestore.Timestamp.now()
    };
    const capNum = (capacidad !== undefined && capacidad !== null && String(capacidad).trim() !== '')
      ? (parseInt(capacidad, 10) || null) : null;
    if (capNum !== null) mesaDoc.capacidad = capNum;

    const tokenDoc = {
      id_mesa: idMesa,
      id_empresa: idEmpresa,
      id_local: idLocal,
      id_sector: idSector,
      audience: audienceSlug || '',
      nombre_visible: nombreFinal
    };

    const batch = D.batch();
    batch.set(locRef.collection('mesas').doc(idMesa), mesaDoc);
    batch.set(D.collection('tokens_mesa').doc(token), tokenDoc);
    await batch.commit();

    return { idMesa: idMesa, token: token, nombre_visible: nombreFinal };
  }

  // Crea un sector con su PRIMERA mesa (un sector sin mesa no tiene QR → ≥1).
  // datos: { nombre, audienceSlug, colorHex, mesaNumero, mesaCapacidad }.
  async function crearSector(idEmpresa, idLocal, datos) {
    const D = db();
    const locRef = D.collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);

    const nombre = String(datos.nombre || '').trim();
    const audienceSlug = String(datos.audienceSlug || '').trim().toLowerCase();
    const colorHex = String(datos.colorHex || '#1B2B4A').trim() || '#1B2B4A';
    const mesaNumero = String(datos.mesaNumero == null ? '' : datos.mesaNumero).trim();

    if (!nombre) throw new Error('Nombre del sector requerido');

    // Canal válido: debe existir como publicación activa del local.
    const slugs = await _slugsCanalesActivos(locRef);
    if (slugs.length === 0) {
      throw new Error('Este local no tiene canales (publicaciones activas) todavía. Creá una publicación primero.');
    }
    if (slugs.indexOf(audienceSlug) === -1) {
      const disp = slugs.map(function (s) { return s || '(default)'; }).join(', ');
      throw new Error('No existe el canal "' + (audienceSlug || '(default)') + '" en este local. Canales disponibles: ' + disp);
    }

    // Validar la primera mesa ANTES de crear el sector (no dejar sector huérfano).
    if (mesaNumero === '') throw new Error('El identificador de la primera mesa es obligatorio (ej: 1, Barra 1, VIP-A)');
    if (await _numeroMesaRepetido(locRef, mesaNumero, null)) {
      throw new Error('Ya existe una mesa "' + mesaNumero + '" en este local. Los identificadores no se pueden repetir.');
    }

    const idSector = await generarId('SEC');
    const orden = await _siguienteOrdenSector(locRef);
    await locRef.collection('sectores').doc(idSector).set({
      id_local: idLocal,
      nombre: nombre,
      color_hex: colorHex,
      orden: orden,
      estado: 'activo',
      audience_slug: audienceSlug,
      botones_activos: false
    });

    const mesa = await _crearMesaDoc(idEmpresa, idLocal, idSector, audienceSlug, mesaNumero, datos.mesaCapacidad, null);
    return { id_sector: idSector, id_mesa: mesa.idMesa };
  }

  // Actualiza nombre y/o color de un sector (lo único que el front edita).
  async function actualizarSector(idEmpresa, idLocal, idSector, campos) {
    const patch = {};
    if (campos.nombre !== undefined) {
      const v = String(campos.nombre).trim();
      if (v.length < 1) throw new Error('Nombre vacío');
      patch.nombre = v;
    }
    if (campos.color_hex !== undefined) {
      patch.color_hex = String(campos.color_hex).trim() || '#1B2B4A';
    }
    if (Object.keys(patch).length === 0) throw new Error('Sin cambios para aplicar');
    await db().collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal)
      .collection('sectores').doc(idSector).update(patch);
    return { id_sector: idSector, cambios: patch };
  }

  // Elimina un sector (borrado LÓGICO) y EN CASCADA sus mesas. Además borra el
  // doc tokens_mesa de cada mesa para que sus QR dejen de resolver (lo prometido
  // al dueño: "los QR de esas mesas dejarán de funcionar"). Todo atómico (batch).
  async function eliminarSector(idEmpresa, idLocal, idSector) {
    const D = db();
    const locRef = D.collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);
    const mesasSnap = await locRef.collection('mesas').where('id_sector', '==', idSector).get();

    const batch = D.batch();
    let mesasEliminadas = 0;
    mesasSnap.docs.forEach(function (d) {
      const m = d.data();
      if (m.estado === 'eliminada') return;
      batch.update(d.ref, { estado: 'eliminada' });
      if (m.token_qr) batch.delete(D.collection('tokens_mesa').doc(m.token_qr));
      mesasEliminadas++;
    });
    batch.update(locRef.collection('sectores').doc(idSector), { estado: 'eliminado' });
    await batch.commit();

    return { id_sector: idSector, mesas_eliminadas: mesasEliminadas };
  }

  // Crea una mesa suelta en un sector existente (reemplaza el GAS mesa_crear).
  // El token hereda el audience (canal) del sector. Valida sector vivo.
  async function crearMesa(idEmpresa, idLocal, idSector, datos) {
    const secRef = db().collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal)
      .collection('sectores').doc(idSector);
    const secSnap = await secRef.get();
    if (!secSnap.exists) throw new Error('Sector no encontrado');
    const s = secSnap.data();
    if (s.estado === 'eliminado') throw new Error('No podés agregar mesas a un sector eliminado');

    const mesa = await _crearMesaDoc(idEmpresa, idLocal, idSector, (s.audience_slug || ''),
      datos.numero, datos.capacidad, (datos.nombreVisible || null));
    return { id_mesa: mesa.idMesa };
  }

  // Actualiza número y/o capacidad de una mesa (lo único que el front edita).
  // NO regenera el token (el QR impreso sigue válido) ni mueve de sector.
  async function actualizarMesa(idEmpresa, idLocal, idMesa, campos) {
    const locRef = db().collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);
    const patch = {};
    if (campos.numero !== undefined) {
      const v = String(campos.numero).trim();
      if (v.length < 1) throw new Error('El identificador de la mesa no puede estar vacío');
      if (await _numeroMesaRepetido(locRef, v, idMesa)) {
        throw new Error('Ya existe otra mesa "' + v + '" en este local. Los identificadores no se pueden repetir.');
      }
      patch.numero = v;
    }
    if (campos.capacidad !== undefined) {
      const cap = String(campos.capacidad).trim();
      patch.capacidad = cap === '' ? null : (parseInt(cap, 10) || null);
    }
    if (Object.keys(patch).length === 0) throw new Error('Sin cambios para aplicar');
    await locRef.collection('mesas').doc(idMesa).update(patch);
    return { id_mesa: idMesa, cambios: patch };
  }

  // Elimina una mesa (borrado lógico) + baja su token (el QR deja de resolver).
  // GUARDA: no se puede eliminar la ÚLTIMA mesa viva del sector (quedaría sin QR).
  async function eliminarMesa(idEmpresa, idLocal, idMesa) {
    const D = db();
    const locRef = D.collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);
    const mesaRef = locRef.collection('mesas').doc(idMesa);
    const mesaSnap = await mesaRef.get();
    if (!mesaSnap.exists) throw new Error('Mesa no encontrada');
    const m = mesaSnap.data();
    if (m.estado === 'eliminada') throw new Error('La mesa ya estaba eliminada');

    // Guarda: contar mesas vivas del sector. Si esta es la única, no se elimina.
    const enSector = await locRef.collection('mesas').where('id_sector', '==', m.id_sector).get();
    const vivas = enSector.docs.filter(function (d) { return d.data().estado !== 'eliminada'; }).length;
    if (vivas <= 1) {
      throw new Error('No podés eliminar la única mesa del sector (quedaría sin QR para escanear). Si querés que el sector desaparezca, eliminá el sector entero.');
    }

    const batch = D.batch();
    batch.update(mesaRef, { estado: 'eliminada' });
    if (m.token_qr) batch.delete(D.collection('tokens_mesa').doc(m.token_qr));
    await batch.commit();
    return { id_mesa: idMesa };
  }

  // ---------------------------------------------------------------------------
  // QR — URLs públicas EN VIVO (reemplaza el GAS mesa_obtener_url_qr / qrs_imprimir).
  // La mesa NO guarda URL: se arma con los slugs de empresa/local + canal del sector.
  // Forma: grancarta.com/<empSlug>/<locSlug>[/<canal>]?t=<token>  (la lee el Worker).
  // ---------------------------------------------------------------------------
  const QR_BASE_PUBLICA = 'https://grancarta.com';

  function _armarUrlQr(empresaSlug, localSlug, audienceSlug, token) {
    let url = QR_BASE_PUBLICA + '/' + empresaSlug + '/' + localSlug;
    if (audienceSlug) url += '/' + audienceSlug;
    url += '?t=' + encodeURIComponent(token);
    return url;
  }

  // URL pública del QR de UNA mesa (para el botón "descargar QR").
  async function urlQrMesa(idEmpresa, idLocal, idMesa) {
    const D = db();
    const empRef = D.collection('empresas').doc(idEmpresa);
    const locRef = empRef.collection('locales').doc(idLocal);

    const mesaSnap = await locRef.collection('mesas').doc(idMesa).get();
    if (!mesaSnap.exists || mesaSnap.data().estado === 'eliminada') throw new Error('Mesa no encontrada');
    const m = mesaSnap.data();

    const empSnap = await empRef.get();
    const locSnap = await locRef.get();
    const empresaSlug = String((empSnap.data() || {}).slug || '').trim();
    const localSlug = String((locSnap.data() || {}).slug || '').trim();
    if (!empresaSlug || !localSlug) throw new Error('Falta el slug de empresa o local para armar la URL pública');

    // El canal (audience) lo aporta el SECTOR de la mesa.
    let audienceSlug = '';
    if (m.id_sector) {
      const secSnap = await locRef.collection('sectores').doc(m.id_sector).get();
      if (secSnap.exists && secSnap.data().estado !== 'eliminado') {
        audienceSlug = String(secSnap.data().audience_slug || '').trim().toLowerCase();
      }
    }
    return { url_qr: _armarUrlQr(empresaSlug, localSlug, audienceSlug, m.token_qr), token: m.token_qr };
  }

  // Todas las mesas de un local para la hoja A4 de QRs, con filtros canal/sector.
  // filtros: { audienceSlug?, idSector? } (idSector gana sobre audienceSlug).
  async function qrsImprimir(idEmpresa, idLocal, filtros) {
    const D = db();
    const empRef = D.collection('empresas').doc(idEmpresa);
    const locRef = empRef.collection('locales').doc(idLocal);

    const empSnap = await empRef.get();
    const locSnap = await locRef.get();
    const emp = empSnap.data() || {}, loc = locSnap.data() || {};
    const empresaSlug = String(emp.slug || '').trim();
    const localSlug = String(loc.slug || '').trim();
    if (!empresaSlug || !localSlug) throw new Error('Falta el slug de empresa o local para armar las URLs');

    const filtroAudience = (filtros && filtros.audienceSlug != null)
      ? String(filtros.audienceSlug).trim().toLowerCase() : null;
    const filtroSector = (filtros && filtros.idSector) ? String(filtros.idSector).trim() : '';

    // Sectores vivos → mapa id → { nombre, audience_slug }.
    const secSnap = await locRef.collection('sectores').get();
    const sectorPorId = {};
    secSnap.docs.forEach(function (d) {
      const s = d.data();
      if (s.estado === 'eliminado') return;
      sectorPorId[d.id] = { nombre: s.nombre || '', audience_slug: String(s.audience_slug || '').trim().toLowerCase() };
    });

    // Mesas vivas (con sector existente), aplicando filtros.
    const mesasSnap = await locRef.collection('mesas').get();
    let mesas = mesasSnap.docs
      .map(function (d) { return { id: d.id, data: d.data() }; })
      .filter(function (x) {
        return x.data.estado !== 'eliminada' && x.data.id_sector && sectorPorId[x.data.id_sector];
      });
    if (filtroSector) {
      mesas = mesas.filter(function (x) { return x.data.id_sector === filtroSector; });
    } else if (filtroAudience !== null) {
      mesas = mesas.filter(function (x) { return sectorPorId[x.data.id_sector].audience_slug === filtroAudience; });
    }

    const out = mesas.map(function (x) {
      const m = x.data;
      const sec = sectorPorId[m.id_sector];
      const audienceSlug = sec.audience_slug;
      return {
        id_mesa: x.id,
        numero: m.numero,
        nombre_visible: m.nombre_visible || m.numero,
        sector_nombre: sec.nombre,
        id_sector: m.id_sector,
        audience_slug: audienceSlug,
        canal_label: audienceSlug ? audienceSlug.replace(/-/g, ' ') : 'Principal',
        url_qr: _armarUrlQr(empresaSlug, localSlug, audienceSlug, m.token_qr),
        token: m.token_qr
      };
    });

    // Orden: por nombre de sector, luego por número de mesa (natural).
    out.sort(function (a, b) {
      if (a.sector_nombre !== b.sector_nombre) return a.sector_nombre.localeCompare(b.sector_nombre, 'es');
      return _compararNatural(String(a.numero), String(b.numero));
    });

    return {
      empresa: { nombre: emp.nombre_comercial || emp.razon_social || '', slug: empresaSlug },
      local: { nombre: loc.nombre || '', slug: localSlug },
      total: out.length,
      mesas: out
    };
  }

  // Publicaciones (canales) ACTIVAS de un local, para el dropdown del modal imprimir.
  async function listarPublicaciones(idEmpresa, idLocal) {
    const snap = await db().collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal)
      .collection('publicaciones').where('estado', '==', 'activa').get();
    return snap.docs.map(function (d) {
      const p = d.data();
      return { audience_slug: String(p.audience_slug || '').trim(), nombre_canal: p.nombre_canal || '' };
    });
  }

  // ---------------------------------------------------------------------------
  // Hornea UN local: lee empresa, local, publicaciones activas, y por cada canal
  // arma menus_publicados (doble clave id + slug). Espejo del hornear.js de Node.
  // ---------------------------------------------------------------------------
  async function hornearLocal(idEmpresa, idLocal) {
    const D = db();
    const empSnap = await D.collection('empresas').doc(idEmpresa).get();
    const locRef  = D.collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);
    const locSnap = await locRef.get();
    if (!empSnap.exists || !locSnap.exists) {
      throw new Error('Falta empresa o local: ' + idEmpresa + '/' + idLocal);
    }
    const emp = empSnap.data();
    const loc = locSnap.data();

    const pubsSnap = await locRef.collection('publicaciones').where('estado', '==', 'activa').get();
    if (pubsSnap.empty) return { canales: 0 };

    let canales = 0;
    for (const pubDoc of pubsSnap.docs) {
      await hornearCanal(idEmpresa, idLocal, emp, loc, pubDoc.data());
      canales++;
    }
    return { canales: canales };
  }

  async function hornearCanal(idEmpresa, idLocal, emp, loc, pub) {
    const D = db();
    const audience = pub.audience_slug || '';
    const audienceKey = audience || 'default';
    const cartaId = pub.id_carta;

    const cartaRef = D.collection('empresas').doc(idEmpresa).collection('cartas').doc(cartaId);
    const cartaSnap = await cartaRef.get();
    if (!cartaSnap.exists) return;
    const carta = cartaSnap.data();

    const seccSnap = await cartaRef.collection('secciones').get();
    const prodSnap = await cartaRef.collection('productos').get();
    const secciones = seccSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(ordenar);
    const productos = prodSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .filter(function (p) { return p.estado_visibilidad === 'visible'; }).sort(ordenar);

    const seccionesBaked = secciones.map(function (s) {
      const items = productos.filter(function (p) { return p.id_seccion === s.id; }).map(function (p) {
        return {
          id: p.id, nombre: p.nombre, descripcion: p.descripcion || '',
          precio: (p.precio === undefined ? null : p.precio),
          foto_url: p.foto_url || '', etiquetas: p.etiquetas || {}, orden: p.orden || 0
        };
      });
      return { id: s.id, nombre: s.nombre, descripcion: s.descripcion || '', orden: s.orden || 0, productos: items };
    }).filter(function (s) { return s.productos.length > 0; });

    // Foto (snapshot) de la piel: se congela al publicar. Editar la piel
    // después NO re-pinta esta carta; el Worker pinta desde esta foto.
    const _tpl = carta.template || 'minimalista';
    const pielSnap = (typeof GranCartaPieles !== 'undefined')
      ? (GranCartaPieles.PRESETS[_tpl] || GranCartaPieles.PRESETS.minimalista)
      : null;

    const doc = {
      id_local: idLocal, id_empresa: idEmpresa, audience_slug: audience,
      nombre_canal: pub.nombre_canal || '', id_carta: cartaId,
      generado_en: firebase.firestore.Timestamp.now(),
      empresa: {
        nombre_comercial: emp.nombre_comercial || '', color_primario: emp.color_primario || '',
        color_secundario: emp.color_secundario || '', logo_url: emp.logo_url || '', instagram: emp.instagram || ''
      },
      local: {
        nombre: loc.nombre || '', direccion: loc.direccion || '', slug: loc.slug || '',
        whatsapp: loc.whatsapp || '', mensaje_whatsapp_default: loc.mensaje_whatsapp_default || ''
      },
      carta: {
        nombre: carta.nombre || '', template: _tpl, piel: pielSnap,
        redondeo: (carta.redondeo === undefined ? null : carta.redondeo),
        pie_direccion: carta.pie_direccion || '', pie_telefono: carta.pie_telefono || '',
        pie_mail: carta.pie_mail || '', notas: carta.notas || ''
      },
      secciones: seccionesBaked
    };

    const idKey = idLocal + '_' + audienceKey;
    const slugKey = (emp.slug || '') + '__' + (loc.slug || '') + '__' + audienceKey;
    await D.collection('menus_publicados').doc(idKey).set(doc);
    await D.collection('menus_publicados').doc(slugKey).set(doc);
  }

  // ---------------------------------------------------------------------------
  // Hornea TODOS los locales (de una empresa) que publican una carta dada.
  // localesEmpresa: [{ id_local, id_carta_publicada }] — lista provista por app.js
  // (de su estado de publicaciones). Rehornea solo los que tengan esa carta.
  // ---------------------------------------------------------------------------
  async function hornearLocalesDeCarta(idEmpresa, idCarta, localesConEstaCarta) {
    let total = 0;
    for (const idLocal of localesConEstaCarta) {
      const r = await hornearLocal(idEmpresa, idLocal);
      total += (r.canales || 0);
    }
    return { locales: localesConEstaCarta.length, canales: total };
  }

  // ===========================================================================
  // PUBLICACIONES (ABM) — Firestore-primero. Cada escritura RE-HORNEA
  // menus_publicados (lo que ve el comensal). Réplica de las invariantes del
  // GAS Script 10: I2 (un default activo por local), I3 (un activo por canal),
  // carta de la misma empresa + 'activa', idempotencia, reasignación de default.
  // ===========================================================================

  const _PUB_SLUGS_RESERVADOS = ['admin', 'api', 'app', 'static', 'assets', 'health', 'qr', 'm', 'c'];
  const _PUB_SLUG_RX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  function _normSlug(s) { return s ? String(s).trim().toLowerCase() : ''; }

  function _validarSlugPub(slug) {
    if (slug === '') return;                       // '' = canal default, válido
    if (slug.length > 32 || !_PUB_SLUG_RX.test(slug)) {
      throw new Error('Slug inválido. Solo minúsculas, números y guiones (ej: "delivery").');
    }
    if (_PUB_SLUGS_RESERVADOS.indexOf(slug) !== -1) throw new Error('Slug reservado por el sistema: "' + slug + '"');
  }

  function _nombreCanalDesdeSlug(slug) {
    const s = _normSlug(slug);
    if (s === '') return 'Principal';
    const t = s.replace(/-/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function _pubRef(idEmpresa, idLocal) {
    return db().collection('empresas').doc(idEmpresa)
      .collection('locales').doc(idLocal).collection('publicaciones');
  }

  async function _pubsDelLocal(idEmpresa, idLocal) {
    const snap = await _pubRef(idEmpresa, idLocal).get();
    return snap.docs.map(function (d) { return Object.assign({ Id_Publicacion: d.id }, d.data()); });
  }

  async function _cartaActivaOError(idEmpresa, idCarta) {
    const cs = await db().collection('empresas').doc(idEmpresa).collection('cartas').doc(idCarta).get();
    if (!cs.exists) throw new Error('Carta no encontrada: ' + idCarta);
    const est = cs.data().estado || '';
    if (est !== 'activa') throw new Error('La carta debe estar "lista para publicar". Estado actual: ' + est);
    return cs.data();
  }

  // Desmarca la default activa del local (si la hay), excluyendo idExcluir.
  async function _demoteDefault(idEmpresa, idLocal, pubs, idExcluir) {
    const actual = pubs.find(function (p) {
      return p.es_default === true && p.estado === 'activa' && p.Id_Publicacion !== idExcluir;
    });
    if (!actual) return null;
    await _pubRef(idEmpresa, idLocal).doc(actual.Id_Publicacion).update({
      es_default: false, fecha_modificacion: firebase.firestore.Timestamp.now()
    });
    return actual.Id_Publicacion;
  }

  // Lectura enriquecida para el admin (misma forma que daba dashboard_completo):
  // { por_local: { idLocal: [pub...] }, cartas_catalogo: [...] }
  // preloaded (opcional): { empData, localesDocs, cartasDocs } ya leídos por el
  // caller (armarDashboardFS) para NO re-leer empresa/locales/cartas. Si no vienen,
  // se leen EN PARALELO (llamada standalone, p.ej. app.js).
  async function listarPublicacionesEnriquecidas(idEmpresa, preloaded) {
    const D = db();
    const empRef = D.collection('empresas').doc(idEmpresa);

    let emp, localesDocs, cartasDocs;
    if (preloaded && preloaded.empData && preloaded.localesDocs && preloaded.cartasDocs) {
      emp = preloaded.empData;
      localesDocs = preloaded.localesDocs;
      cartasDocs = preloaded.cartasDocs;
    } else {
      const res = await Promise.all([
        empRef.get(),
        empRef.collection('locales').get(),
        empRef.collection('cartas').get()
      ]);
      emp = res[0].exists ? res[0].data() : {};
      localesDocs = res[1].docs;
      cartasDocs = res[2].docs;
    }
    const empSlug = emp.slug || '';

    const locales = {};
    localesDocs.forEach(function (d) { locales[d.id] = d.data(); });

    const cartas = {};
    cartasDocs.forEach(function (d) { cartas[d.id] = Object.assign({ id: d.id }, d.data()); });

    // PERF: publicaciones de TODOS los locales EN PARALELO (antes: 1 query por
    // local en serie = N+1).
    const idLocales = Object.keys(locales);
    const pubsPorLocal = await Promise.all(
      idLocales.map(function (idLocal) { return _pubsDelLocal(idEmpresa, idLocal); })
    );

    const porLocal = {};
    const cartasPublicadas = {};
    idLocales.forEach(function (idLocal, _i) {
      const loc = locales[idLocal];
      const pubs = pubsPorLocal[_i];
      pubs.filter(function (p) { return p.estado !== 'archivada'; }).forEach(function (p) {
        if (p.estado === 'activa') cartasPublicadas[p.id_carta] = true;
        const carta = cartas[p.id_carta] || {};
        const slug = _normSlug(p.audience_slug);
        let url = null;
        if (empSlug && loc.slug) {
          url = 'https://grancarta.com/' + empSlug + '/' + loc.slug;
          if (slug) url += '/' + slug;
        }
        if (!porLocal[idLocal]) porLocal[idLocal] = [];
        porLocal[idLocal].push({
          Id_Publicacion: p.Id_Publicacion,
          Id_Local: idLocal,
          Id_Carta: p.id_carta,
          Id_Empresa: idEmpresa,
          Audience_Slug: slug,
          Nombre_Canal: p.nombre_canal || _nombreCanalDesdeSlug(slug),
          Es_Default: p.es_default === true,
          Estado: p.estado,
          local_nombre: loc.nombre || '',
          local_slug: loc.slug || '',
          carta_nombre: carta.nombre || '',
          carta_template: carta.template || '',
          carta_estado: carta.estado || '',
          url_publica: url
        });
      });
    });

    const catalogo = Object.keys(cartas).map(function (id) { return cartas[id]; })
      .filter(function (c) { return (c.estado || '') === 'activa'; })
      .map(function (c) {
        return {
          Id_Carta: c.id, Nombre: c.nombre || '', Descripcion: c.descripcion || '',
          Template: c.template || '', Tipo_Carta: c.tipo_carta || '',
          esta_publicada: !!cartasPublicadas[c.id]
        };
      }).sort(function (a, b) {
        if (a.esta_publicada !== b.esta_publicada) return a.esta_publicada ? 1 : -1;
        return (a.Nombre || '').localeCompare(b.Nombre || '');
      });

    return { por_local: porLocal, cartas_catalogo: catalogo };
  }

  // Activar / cambiar la carta de un canal: swap in-place (canal existente) o
  // canal nuevo. Después RE-HORNEA el local (el comensal pasa a ver la carta nueva).
  async function activarCartaEnCanal(idEmpresa, idLocal, audienceSlug, idCartaNueva, nombreCanal) {
    const slug = _normSlug(audienceSlug);
    _validarSlugPub(slug);
    await _cartaActivaOError(idEmpresa, idCartaNueva);

    const pubs = await _pubsDelLocal(idEmpresa, idLocal);
    const pubActual = pubs.find(function (p) {
      return _normSlug(p.audience_slug) === slug && p.estado === 'activa';
    });
    const now = firebase.firestore.Timestamp.now();

    if (pubActual) {
      if (pubActual.id_carta === idCartaNueva) {
        return { id_publicacion: pubActual.Id_Publicacion, canal_creado: false, sin_cambios: true };
      }
      await _pubRef(idEmpresa, idLocal).doc(pubActual.Id_Publicacion).update({
        id_carta: idCartaNueva, fecha_modificacion: now
      });
      await hornearLocal(idEmpresa, idLocal);
      return {
        id_publicacion: pubActual.Id_Publicacion,
        id_carta_anterior: pubActual.id_carta, id_carta_nueva: idCartaNueva, canal_creado: false
      };
    }

    // Canal nuevo (necesita contadores/PUB sembrado; si falta, generarId tira error claro)
    const hayDefault = pubs.some(function (p) { return p.es_default === true && p.estado === 'activa'; });
    const esDefaultFinal = !hayDefault;
    const nombre = (nombreCanal && String(nombreCanal).trim()) ? String(nombreCanal).trim() : _nombreCanalDesdeSlug(slug);
    const idPub = await generarId('PUB');
    await _pubRef(idEmpresa, idLocal).doc(idPub).set({
      id_local: idLocal, id_carta: idCartaNueva, id_empresa: idEmpresa,
      audience_slug: slug, es_default: esDefaultFinal, estado: 'activa',
      plan_publicacion: 'trial', nombre_canal: nombre,
      fecha_inicio: now, fecha_creacion: now, fecha_modificacion: now
    });
    await hornearLocal(idEmpresa, idLocal);
    return { id_publicacion: idPub, canal_creado: true, es_default: esDefaultFinal };
  }

  // Renombrar el canal (Nombre_Canal). El nombre viaja al doc del comensal → rehornea.
  async function renombrarCanal(idEmpresa, idLocal, idPublicacion, nombreCanal) {
    const nombre = String(nombreCanal || '').trim();
    if (!nombre) throw new Error('El nombre del canal no puede estar vacío');
    if (nombre.length > 40) throw new Error('El nombre del canal no puede tener más de 40 caracteres');
    await _pubRef(idEmpresa, idLocal).doc(idPublicacion).update({
      nombre_canal: nombre, fecha_modificacion: firebase.firestore.Timestamp.now()
    });
    await hornearLocal(idEmpresa, idLocal);
    return { id_publicacion: idPublicacion, nombre_canal: nombre };
  }

  // Crear una publicación nueva (canal nuevo). Paridad con GAS publicacion_crear.
  // (No tiene UI viva hoy; queda para retirar GAS sin perder capacidad.)
  async function crearPublicacion(idEmpresa, idLocal, idCarta, audienceSlug, esDefaultPed, nombreCanal) {
    const slug = _normSlug(audienceSlug);
    _validarSlugPub(slug);
    await _cartaActivaOError(idEmpresa, idCarta);
    const pubs = await _pubsDelLocal(idEmpresa, idLocal);
    const conflicto = pubs.find(function (p) { return _normSlug(p.audience_slug) === slug && p.estado !== 'archivada'; });
    if (conflicto) throw new Error('Ya existe una publicación para ese canal en este local (' + conflicto.Id_Publicacion + ')');
    const hayDefault = pubs.some(function (p) { return p.es_default === true && p.estado === 'activa'; });
    let esDefaultFinal = !!esDefaultPed;
    if (!hayDefault) esDefaultFinal = true;
    if (esDefaultFinal && hayDefault) await _demoteDefault(idEmpresa, idLocal, pubs, null);
    const nombre = (nombreCanal && String(nombreCanal).trim()) ? String(nombreCanal).trim() : _nombreCanalDesdeSlug(slug);
    const idPub = await generarId('PUB');
    const now = firebase.firestore.Timestamp.now();
    await _pubRef(idEmpresa, idLocal).doc(idPub).set({
      id_local: idLocal, id_carta: idCarta, id_empresa: idEmpresa,
      audience_slug: slug, es_default: esDefaultFinal, estado: 'activa',
      plan_publicacion: 'trial', nombre_canal: nombre,
      fecha_inicio: now, fecha_creacion: now, fecha_modificacion: now
    });
    await hornearLocal(idEmpresa, idLocal);
    return { id_publicacion: idPub, es_default: esDefaultFinal };
  }

  // Despublicar (pausar/archivar). Paridad con GAS publicacion_despublicar.
  // Reasigna el default a otra activa; BORRA el menus_publicados del canal que
  // sale (el comensal deja de verlo) y rehornea el resto.
  async function despublicarPublicacion(idEmpresa, idLocal, idPublicacion, accion) {
    const acc = (accion === 'archivar') ? 'archivar' : 'pausar';
    const estadoObjetivo = acc === 'pausar' ? 'pausada' : 'archivada';
    const D = db();
    const empSnap = await D.collection('empresas').doc(idEmpresa).get();
    const locRef = D.collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal);
    const locSnap = await locRef.get();
    const emp = empSnap.exists ? empSnap.data() : {};
    const loc = locSnap.exists ? locSnap.data() : {};

    const pubs = await _pubsDelLocal(idEmpresa, idLocal);
    const pub = pubs.find(function (p) { return p.Id_Publicacion === idPublicacion; });
    if (!pub) throw new Error('Publicación no encontrada');
    if (pub.estado === estadoObjetivo) return { id_publicacion: idPublicacion, sin_cambios: true };

    let nuevoDefault = null;
    if (pub.es_default === true) {
      const otras = pubs.filter(function (p) { return p.Id_Publicacion !== idPublicacion && p.estado === 'activa'; });
      if (otras.length === 0) throw new Error('No podés ' + acc + ' la única publicación activa del local. Activá otra carta primero.');
      otras.sort(function (a, b) {
        const fa = a.fecha_creacion && a.fecha_creacion.toMillis ? a.fecha_creacion.toMillis() : 0;
        const fb = b.fecha_creacion && b.fecha_creacion.toMillis ? b.fecha_creacion.toMillis() : 0;
        return fb - fa;
      });
      await _pubRef(idEmpresa, idLocal).doc(otras[0].Id_Publicacion).update({
        es_default: true, fecha_modificacion: firebase.firestore.Timestamp.now()
      });
      nuevoDefault = otras[0].Id_Publicacion;
    }

    await _pubRef(idEmpresa, idLocal).doc(idPublicacion).update({
      estado: estadoObjetivo, es_default: false, fecha_modificacion: firebase.firestore.Timestamp.now()
    });

    // El canal desaparece para el comensal → borrar sus 2 claves en menus_publicados
    const audienceKey = _normSlug(pub.audience_slug) || 'default';
    await D.collection('menus_publicados').doc(idLocal + '_' + audienceKey).delete().catch(function () {});
    await D.collection('menus_publicados').doc((emp.slug || '') + '__' + (loc.slug || '') + '__' + audienceKey).delete().catch(function () {});
    await hornearLocal(idEmpresa, idLocal);
    return { id_publicacion: idPublicacion, accion: acc, nuevo_default: nuevoDefault };
  }

  // ===========================================================================
  // LOCALES (config) — Firestore-primero. Editar campos del local + RE-HORNEAR
  // (whatsapp/mensaje se hornean en menus_publicados; los usa el botón del comensal).
  // ===========================================================================

  // Réplica EXACTA de normalizarWhatsApp() del GAS (Script 07): deja el número
  // listo para wa.me/<num> (formato 549...). Mismo resultado que la planilla.
  function _normalizarWhatsApp(input) {
    if (!input) return '';
    let n = String(input).replace(/\D+/g, '');
    if (!n) return '';
    if (n.length > 12 && n.substring(0, 2) === '00') n = n.substring(2);
    if (n.substring(0, 2) === '54' && n.length >= 12 && n.length <= 14) {
      if (n.substring(2, 3) !== '9') n = '549' + n.substring(2);
      return n;
    }
    if (n.charAt(0) === '0' && n.length >= 10 && n.length <= 12) { n = n.substring(1); return '549' + n; }
    if (n.substring(0, 2) === '11' && n.length === 10) return '549' + n;
    if (n.substring(0, 2) === '15' && n.length === 10) return '54911' + n.substring(2);
    return n;
  }

  // Actualiza campos del local en FS y rehornea. Hoy admite lo que el front edita:
  // whatsapp + mensaje_whatsapp_default (config del botón de WhatsApp del comensal).
  async function actualizarLocal(idEmpresa, idLocal, campos) {
    const updates = {};
    if (campos.whatsapp !== undefined) updates.whatsapp = _normalizarWhatsApp(campos.whatsapp);
    if (campos.mensaje_whatsapp_default !== undefined) {
      updates.mensaje_whatsapp_default = String(campos.mensaje_whatsapp_default || '').trim();
    }
    if (Object.keys(updates).length === 0) throw new Error('Sin cambios para aplicar');
    await db().collection('empresas').doc(idEmpresa).collection('locales').doc(idLocal).update(updates);
    await hornearLocal(idEmpresa, idLocal);
    return { id_local: idLocal, cambios: updates };
  }

  // Arma el dashboard COMPLETO desde Firestore, scopeado a la empresa activa
  // (la del token). Devuelve el mismo shape que hoy arma el front desde GAS, para
  // reemplazar dashboard_completo (la lectura viva de la planilla). Etapa 2.
  // Solo lectura; todas las rutas caen bajo un empId conocido + el doc propio
  // usuarios/{uid} → permitido por las reglas v1.5, sin tocar seguridad.
  //   Devuelve: { empresa, locales:[...], publicaciones:{por_local,cartas_catalogo}, es_admin }
  async function armarDashboardFS(idEmpresa) {
    const D = db();
    const empRef = D.collection('empresas').doc(idEmpresa);
    const user = firebase.auth().currentUser;

    // PERF: las 4 lecturas independientes (empresa, locales, cartas, usuario) van
    // EN PARALELO (antes: en serie + empresa/locales re-leídas dentro de
    // listarPublicacionesEnriquecidas). Las publicaciones (que dependen de la
    // lista de locales) van en una 2ª tanda, también paralela por local.
    const [empSnap, locSnap, cartasSnap, miSnap] = await Promise.all([
      empRef.get(),
      empRef.collection('locales').get(),
      empRef.collection('cartas').get(),
      (user && user.uid) ? D.collection('usuarios').doc(user.uid).get() : Promise.resolve(null)
    ]);

    // 1) Empresa
    if (!empSnap.exists) throw new Error('empresa ' + idEmpresa + ' no está en Firestore');
    const e = empSnap.data();
    const empresa = {
      Id_Empresa: idEmpresa,
      Razon_Social: e.razon_social || '',
      Nombre_Comercial: e.nombre_comercial || '',
      CUIT: e.cuit || '',
      Pais: e.pais || '',
      Logo_Url: e.logo_url || '',
      Mail_Contacto: e.mail_contacto || '',
      Estado: e.estado || 'activa'
    };

    // 2) Locales (no archivados), mismo shape que el dashboard GAS
    const locales = locSnap.docs
      .map(function (d) {
        const l = d.data();
        return {
          Id_Local: d.id,
          Id_Empresa: idEmpresa,
          Nombre: l.nombre || '',
          Direccion: l.direccion || '',
          Ciudad: l.ciudad || '',
          Capacidad_Mesas: l.capacidad_mesas || 0,
          Id_Carta_Activa: l.id_carta_activa || null,
          Modo_Carta: l.modo_carta || 'completa',
          Estado: l.estado || 'activo',
          Slug: l.slug || null,
          WhatsApp: l.whatsapp || '',
          Mensaje_WhatsApp_Default: l.mensaje_whatsapp_default || ''
        };
      })
      .filter(function (l) { return l.Estado !== 'archivado'; });

    // 3) Publicaciones — reusa empresa/locales/cartas YA leídos (no re-lee) y
    //    paraleliza las publicaciones por local.
    const publicaciones = await listarPublicacionesEnriquecidas(idEmpresa, {
      empData: e, localesDocs: locSnap.docs, cartasDocs: cartasSnap.docs
    });

    // 4) es_admin desde el doc usuarios/{uid} ya leído arriba
    let esAdmin = false;
    try {
      const roles = (miSnap && miSnap.exists && Array.isArray(miSnap.data().roles)) ? miSnap.data().roles : [];
      esAdmin = roles.some(function (r) { return String(r.tipo || '').toLowerCase().trim() === 'admin'; });
    } catch (err) {
      console.warn('[FS] no se pudo derivar es_admin de FS:', err && err.message);
    }

    return { empresa: empresa, locales: locales, publicaciones: publicaciones, es_admin: esAdmin };
  }

  // Colaboradores de una empresa (pantalla "Equipo"), 100% Firestore (v1.6).
  // Reemplaza el read GAS colaborador_listar. Devuelve el MISMO shape que GAS:
  //   { ok, colaboradores: [{ id_usuario, mail, nombre, apellido, tiene_dni,
  //     es_dueno, rol_visible, locales_habilitados[] }], locales_empresa: [{ id_local, nombre }] }
  // Query: usuarios where cuentas_relacionadas array-contains <cuenta de la empresa>
  // (la regla v1.6 exige que esa cuenta sea la del que consulta). Si algo falla,
  // lanza → el caller cae a GAS (fallback).
  async function colaboradorListar(idEmpresa) {
    const empRef = db().collection('empresas').doc(idEmpresa);
    const empSnap = await empRef.get();
    if (!empSnap.exists) throw new Error('empresa no encontrada en FS: ' + idEmpresa);
    const idCuenta = empSnap.data().id_cuenta;
    if (!idCuenta) throw new Error('empresa sin id_cuenta en FS: ' + idEmpresa);

    // Locales ACTIVOS de la empresa (para locales_empresa[] y para acotar gerentes).
    const locSnap = await empRef.collection('locales').get();
    const localesEmpresa = [];
    const idLocalesEmpresa = {};
    locSnap.docs.forEach(function (d) {
      const l = d.data();
      if (l.estado === 'activo') {
        localesEmpresa.push({ id_local: d.id, nombre: l.nombre || '' });
        idLocalesEmpresa[d.id] = true;
      }
    });

    // Usuarios relacionados a la cuenta de esta empresa (dueños + gerentes).
    const usSnap = await db().collection('usuarios')
      .where('cuentas_relacionadas', 'array-contains', idCuenta).get();

    const colaboradores = [];
    usSnap.docs.forEach(function (d) {
      const u = d.data();
      const roles = u.roles || [];
      // Dueño/secretaría de ESTA cuenta: rol dueño, misma cuenta, sin local.
      const esDueno = roles.some(function (r) {
        return (r.tipo === 'dueño' || r.tipo === 'duenio') && r.id_cuenta === idCuenta && !r.id_local;
      });
      // Locales de ESTA empresa donde el usuario es encargado.
      const localesHab = (u.locales_gerente || []).filter(function (idLoc) {
        return idLocalesEmpresa[idLoc];
      });
      // Incluir solo si es dueño de la cuenta O gerente de un local de la empresa.
      if (!esDueno && localesHab.length === 0) return;
      colaboradores.push({
        id_usuario: d.id,
        mail: u.mail || '',
        nombre: u.nombre || '',
        apellido: u.apellido || '',
        tiene_dni: false,                       // no existe columna DNI (igual que GAS hoy)
        es_dueno: esDueno,
        rol_visible: esDueno ? 'Dueño / Secretaría' : 'Gerente',
        locales_habilitados: localesHab         // SIEMPRE array (la UI llama .indexOf/.length)
      });
    });

    return { ok: true, colaboradores: colaboradores, locales_empresa: localesEmpresa };
  }

  // ---------------------------------------------------------------------------
  // CATÁLOGO DE PRODUCTOS (por empresa) — base maestra de productos que alimenta
  // el armado de cartas. Ruta: empresas/{emp}/catalogo/{CAT-XXXX}.
  // Campos: nombre, detalle, precio (precio puede ser 0 — ej. servicio de mesa).
  // El precio del catálogo es solo el "sugerido"; al armar cada carta se puede
  // editar sin tocar la base. Requiere contadores/CAT sembrado (seed_contadores).
  // ---------------------------------------------------------------------------
  async function catalogoListar(idEmpresa) {
    const snap = await db()
      .collection('empresas').doc(idEmpresa)
      .collection('catalogo').get();
    return snap.docs.map(function (d) {
      const c = d.data();
      return {
        Id_Catalogo: d.id,
        Nombre: c.nombre || '',
        Detalle: c.detalle || '',
        Precio: (c.precio === undefined || c.precio === null) ? 0 : c.precio
      };
    }).sort(function (a, b) {
      return a.Nombre.localeCompare(b.Nombre, 'es', { sensitivity: 'base' });
    });
  }

  async function catalogoCrear(idEmpresa, datos) {
    const idCat = await generarId('CAT');
    await db()
      .collection('empresas').doc(idEmpresa)
      .collection('catalogo').doc(idCat)
      .set({
        id_empresa: idEmpresa,
        nombre: datos.nombre || '',
        detalle: datos.detalle || '',
        precio: (datos.precio === undefined || datos.precio === null) ? 0 : datos.precio
      });
    return idCat;
  }

  async function catalogoActualizar(idEmpresa, idCat, campos) {
    await db()
      .collection('empresas').doc(idEmpresa)
      .collection('catalogo').doc(idCat)
      .update(campos);
  }

  async function catalogoEliminar(idEmpresa, idCat) {
    await db()
      .collection('empresas').doc(idEmpresa)
      .collection('catalogo').doc(idCat)
      .delete();
  }

  // ---------------------------------------------------------------------------
  // PRECIOS EN MASA (pestaña "Precios" del editor). Actualiza el precio de VARIOS
  // productos de una carta en una sola pasada atómica (batch). cambios =
  // [{ idProducto, precio }]. Ruta: empresas/{emp}/cartas/{carta}/productos/{prod}.
  // Firestore limita a 500 ops por batch → troceamos por las dudas.
  // ---------------------------------------------------------------------------
  async function actualizarPreciosMasivo(idEmpresa, idCarta, cambios) {
    const D = db();
    const base = D.collection('empresas').doc(idEmpresa)
      .collection('cartas').doc(idCarta).collection('productos');
    for (let i = 0; i < cambios.length; i += 450) {
      const batch = D.batch();
      cambios.slice(i, i + 450).forEach(function (c) {
        batch.update(base.doc(c.idProducto), { precio: c.precio });
      });
      await batch.commit();
    }
  }

  // Exponer el módulo
  window.GCFirestore = {
    colaboradorListar: colaboradorListar,
    catalogoListar: catalogoListar,
    catalogoCrear: catalogoCrear,
    catalogoActualizar: catalogoActualizar,
    catalogoEliminar: catalogoEliminar,
    redondearPrecio: _redondearPrecio,
    actualizarPreciosMasivo: actualizarPreciosMasivo,
    generarId: generarId,
    setEstadoProducto: setEstadoProducto,
    actualizarProducto: actualizarProducto,
    crearProducto: crearProducto,
    eliminarProducto: eliminarProducto,
    leerCartaCompleta: leerCartaCompleta,
    leerCartaMetadata: leerCartaMetadata,
    listarCartas: listarCartas,
    actualizarCarta: actualizarCarta,
    crearCarta: crearCarta,
    sembrarCartaEjemplo: sembrarCartaEjemplo,
    duplicarCarta: duplicarCarta,
    actualizarSeccion: actualizarSeccion,
    crearSeccion: crearSeccion,
    eliminarSeccionConProductos: eliminarSeccionConProductos,
    intercambiarOrdenSecciones: intercambiarOrdenSecciones,
    intercambiarOrdenProductos: intercambiarOrdenProductos,
    toggleBotonesSector: toggleBotonesSector,
    listarSectores: listarSectores,
    crearSector: crearSector,
    actualizarSector: actualizarSector,
    eliminarSector: eliminarSector,
    crearMesa: crearMesa,
    actualizarMesa: actualizarMesa,
    eliminarMesa: eliminarMesa,
    urlQrMesa: urlQrMesa,
    qrsImprimir: qrsImprimir,
    listarPublicaciones: listarPublicaciones,
    listarPublicacionesEnriquecidas: listarPublicacionesEnriquecidas,
    activarCartaEnCanal: activarCartaEnCanal,
    renombrarCanal: renombrarCanal,
    crearPublicacion: crearPublicacion,
    despublicarPublicacion: despublicarPublicacion,
    actualizarLocal: actualizarLocal,
    armarDashboardFS: armarDashboardFS,
    hornearLocal: hornearLocal,
    hornearLocalesDeCarta: hornearLocalesDeCarta
  };
  console.log('[Firebase] módulo GCFirestore listo.');
})();
