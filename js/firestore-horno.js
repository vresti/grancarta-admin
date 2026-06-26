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
    hornearLocal: hornearLocal,
    hornearLocalesDeCarta: hornearLocalesDeCarta
  };
  console.log('[Firebase] módulo GCFirestore listo.');
})();
