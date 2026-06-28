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
        nombre: carta.nombre || '', template: carta.template || '',
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

  // Exponer el módulo
  window.GCFirestore = {
    generarId: generarId,
    setEstadoProducto: setEstadoProducto,
    actualizarProducto: actualizarProducto,
    crearProducto: crearProducto,
    eliminarProducto: eliminarProducto,
    leerCartaCompleta: leerCartaCompleta,
    listarCartas: listarCartas,
    actualizarCarta: actualizarCarta,
    crearCarta: crearCarta,
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
    hornearLocal: hornearLocal,
    hornearLocalesDeCarta: hornearLocalesDeCarta
  };
  console.log('[Firebase] módulo GCFirestore listo.');
})();
