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
    setEstadoProducto: setEstadoProducto,
    actualizarProducto: actualizarProducto,
    crearProducto: crearProducto,
    eliminarProducto: eliminarProducto,
    leerCartaCompleta: leerCartaCompleta,
    actualizarSeccion: actualizarSeccion,
    crearSeccion: crearSeccion,
    eliminarSeccionConProductos: eliminarSeccionConProductos,
    intercambiarOrdenSecciones: intercambiarOrdenSecciones,
    hornearLocal: hornearLocal,
    hornearLocalesDeCarta: hornearLocalesDeCarta
  };
  console.log('[Firebase] módulo GCFirestore listo.');
})();
