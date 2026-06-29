/*
 * ============================================================
 * GRANCARTA ADMIN - Cliente API del Backend GAS
 * ============================================================
 */

const AdminAPI = (function() {

  // URL del Web App de GAS. Si cambia el deployment, actualizar acá.
  const API_URL = 'https://script.google.com/macros/s/AKfycbwFY5spQFAZHuXgwtHtuqgZG7oSlr-NhryNG90iNSHjQyNaxnM8AHA03fKDOa12x6k7/exec';

  /**
   * Llamada genérica al backend.
   * Si hay JWT en localStorage, lo manda en params._token (también queda en root para compatibilidad).
   */
  async function llamar(accion, params = {}) {
    const token = localStorage.getItem('admin_jwt');
    const paramsConToken = token ? { ...params, _token: token } : params;

    try {
      const respuesta = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          accion,
          params: paramsConToken,
          token: token
        })
      });

      if (!respuesta.ok) {
        throw new Error('HTTP ' + respuesta.status);
      }

      return await respuesta.json();
    } catch (err) {
      console.error('[API]', accion, err);
      return {
        ok: false,
        error: 'Sin conexión con el servidor. Revisá tu internet.'
      };
    }
  }

  return {

    // ---- Auth ----
    solicitarCodigo(mail) {
      return llamar('auth_solicitarCodigo', { mail });
    },

    verificarCodigo(mail, codigo) {
      return llamar('auth_verificarCodigo', { mail, codigo });
    },

    // Devuelve un custom token de Firebase para el usuario logueado.
    // (lo usa el front para signInWithCustomToken y poder escribir Firestore)
    obtenerTokenFirebase() {
      return llamar('auth_obtenerTokenFirebase', {});
    },

    /**
     * Auto-registro de cuenta nueva (sin auth previa).
     * Crea Cuenta + Usuario + Rol "dueño" en una sola operación.
     */
    registrarCuenta(mail, nombre, apellido) {
      return llamar('public_registrar_cuenta', {
        mail: mail,
        nombre: nombre,
        apellido: apellido || ''
      });
    },

    cerrarSesion() {
      return llamar('auth_cerrarSesion', {});
    },

    obtenerMiSesion() {
      return llamar('auth_obtenerMiSesion', {});
    },

    // ---- Cuenta ----
    obtenerEstructura() {
      return llamar('cuenta_obtenerEstructura', {});
    },

    // ---- Empresas ----
    empresaCrear(datos) {
      return llamar('empresa_crear', datos);
    },

    empresaListar() {
      return llamar('empresa_listar', {});
    },

    empresaObtener(idEmpresa) {
      return llamar('empresa_obtener', { id_empresa: idEmpresa });
    },

    empresaActualizar(idEmpresa, cambios) {
      return llamar('empresa_actualizar', {
        id_empresa: idEmpresa,
        ...cambios
      });
    },

    // ---- Locales ----
    localCrear(datos) {
      return llamar('local_crear', datos);
    },

    localListar(idEmpresa = null) {
      const params = idEmpresa ? { id_empresa: idEmpresa } : {};
      return llamar('local_listar', params);
    },

    localObtener(idLocal) {
      return llamar('local_obtener', { id_local: idLocal });
    },

    localActualizar(idLocal, cambios) {
      return llamar('local_actualizar', {
        id_local: idLocal,
        ...cambios
      });
    },

    /**
     * Devuelve locales de la empresa enriquecidos con carta activa + URL pública
     * + cartas disponibles para hacer switch.
     * Una sola llamada da todo lo necesario para la UI del dashboard.
     */
    localListarConCarta(idEmpresa) {
      return llamar('local_listar_con_carta', { id_empresa: idEmpresa });
    },

    // ---- Publicaciones (modelo D — día 9, 18/5/2026) ----
    // Una publicación = una carta sirviendo en una URL pública.
    // Un local puede tener N publicaciones (default + audiences).
    /**
     * Lista publicaciones activas de una empresa, enriquecidas con
     * nombre del local, nombre de la carta y URL pública (incluye audience_slug).
     *
     * @param {string} idEmpresa - obligatorio
     * @param {string} idLocal - opcional, filtra a un solo local
     * @returns { ok, publicaciones[], cantidad, agrupado_por_local[], cartas_catalogo[], empresa }
     */
    publicacionListar(idEmpresa, idLocal = null) {
      const params = idLocal
        ? { id_empresa: idEmpresa, id_local: idLocal }
        : { id_empresa: idEmpresa };
      return llamar('publicacion_listar', params);
    },

    /**
     * Activa una carta del catálogo en un canal específico de un local.
     * (A2.2 — día 10): swap atómico in-place o creación de canal nuevo.
     *
     * Si el canal ya tenía una carta, queda automáticamente "lista para
     * publicar" (vuelve al catálogo standby). El canal NUNCA queda vacío.
     *
     * @param {string} idLocal       - obligatorio
     * @param {string} audienceSlug  - '' = canal default, 'delivery'/'almuerzo'/etc
     * @param {string} idCartaNueva  - obligatorio
     * @returns { ok, id_publicacion, id_carta_anterior, id_carta_nueva, canal_creado, mensaje }
     */
    publicacionActivarCarta(idLocal, audienceSlug, idCartaNueva) {
      return llamar('publicacion_activar_carta', {
        id_local: idLocal,
        audience_slug: audienceSlug || '',
        id_carta_nueva: idCartaNueva
      });
    },

    // ---- Cartas (Editor de Carta) ----
    cartaListar(idEmpresa, incluirArchivadas = false) {
      return llamar('carta_listar', {
        id_empresa: idEmpresa,
        incluir_archivadas: incluirArchivadas
      });
    },

    cartaCrear(datos) {
      return llamar('carta_crear', datos);
    },

    cartaObtenerCompleta(idCarta) {
      return llamar('carta_obtener_completa', { id_carta: idCarta });
    },

    cartaActualizar(idCarta, cambios) {
      return llamar('carta_actualizar', {
        id_carta: idCarta,
        ...cambios
      });
    },

    cartaDuplicar(idCartaOrigen, nombreNueva, modificadorPorcentaje = 0) {
      return llamar('carta_duplicar', {
        id_carta_origen: idCartaOrigen,
        nombre_nueva: nombreNueva,
        modificador_porcentaje: modificadorPorcentaje
      });
    },

    cartaActivar(idCarta) {
      return llamar('carta_activar', { id_carta: idCarta });
    },

    cartaArchivar(idCarta) {
      return llamar('carta_archivar', { id_carta: idCarta });
    },

    // ---- Secciones ----
    seccionCrear(datos) {
      return llamar('seccion_crear', datos);
    },

    seccionListar(idCarta) {
      return llamar('seccion_listar', { id_carta: idCarta });
    },

    seccionActualizar(idSeccion, cambios) {
      return llamar('seccion_actualizar', {
        id_seccion: idSeccion,
        ...cambios
      });
    },

    seccionOrdenar(idSeccion, direccion) {
      return llamar('seccion_ordenar', {
        id_seccion: idSeccion,
        direccion: direccion
      });
    },

    seccionEliminar(idSeccion, forzar = false) {
      return llamar('seccion_eliminar', {
        id_seccion: idSeccion,
        forzar: forzar
      });
    },

    // ---- Productos ----
    productoCrear(datos) {
      return llamar('producto_crear', datos);
    },

    productoActualizar(idProducto, cambios) {
      return llamar('producto_actualizar', {
        id_producto: idProducto,
        ...cambios
      });
    },

    productoOrdenar(idProducto, direccion) {
      return llamar('producto_ordenar', {
        id_producto: idProducto,
        direccion: direccion
      });
    },

    productoToggleDisponible(idProducto, estado) {
      // El backend (script 09) espera 'estado' con 3 valores: 'visible'|'agotado'|'oculto'.
      // (Antes mandaba 'disponible', que el back interpretaba como booleano → siempre oculto.)
      return llamar('producto_toggle_disponible', {
        id_producto: idProducto,
        estado: estado
      });
    },

    productoEliminar(idProducto) {
      return llamar('producto_eliminar', { id_producto: idProducto });
    },

    // ---- Colaboradores / Equipo (Bloque A — Nivel 2, 12/6/2026) ----
    /**
     * Lista el equipo de una empresa: secretarias (dueño) + gerentes
     * (encargado) con sus locales habilitados, y los locales de la empresa.
     */
    colaboradorListar(idEmpresa) {
      return llamar('colaborador_listar', { id_empresa: idEmpresa });
    },

    /**
     * Da de alta una secretaría/dueño (acceso pleno a la cuenta).
     */
    colaboradorInvitarDueno(idEmpresa, mail, nombre, apellido) {
      return llamar('colaborador_invitar_dueno', {
        id_empresa: idEmpresa,
        mail: mail,
        nombre: nombre || '',
        apellido: apellido || ''
      });
    },

    /**
     * Tilda (habilitado=true) o destilda (false) UN local para un gerente.
     */
    colaboradorSetEncargado(idEmpresa, mail, idLocal, habilitado, nombre, apellido) {
      return llamar('colaborador_set_encargado', {
        id_empresa: idEmpresa,
        mail: mail,
        id_local: idLocal,
        habilitado: habilitado,
        nombre: nombre || '',
        apellido: apellido || ''
      });
    },

    // ---- Panel de Sistema (Nivel 0 — admin, 12/6/2026) ----
    sistemaPadron() {
      return llamar('sistema_padron', {});
    },

    sistemaIntegridad() {
      return llamar('sistema_integridad', {});
    },

    // ---- Dashboard unificado (Performance/Pareto, 13/6) ----
    dashboardCompleto() {
      return llamar('dashboard_completo', {});
    },

    sistemaAgregarAdmin(mail, nombre, apellido) {
      return llamar('sistema_agregar_admin', {
        mail: mail,
        nombre: nombre || '',
        apellido: apellido || ''
      });
    },

    // ---- Sectores y Mesas: MIGRADO a Firestore (firestore-horno.js, Camino A 28/6/2026).
    //      Las funciones GAS sector_*/mesa_*/local_obtener_qrs_imprimir se retiraron de
    //      este cliente (sin consumidores). El Script 13 de GAS queda sin uso. ----

    // ---- Nombre de canal (Script 10 v2.1 — 16/6/2026) ----

    /**
     * Renombra un canal (publicación). El front lo muestra como "Espacio "+nombre.
     */
    publicacionRenombrarCanal(idPublicacion, nombreCanal) {
      return llamar('publicacion_actualizar', {
        id_publicacion: idPublicacion,
        nombre_canal: nombreCanal
      });
    }
  };

})();
