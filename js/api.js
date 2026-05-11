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

    productoToggleDisponible(idProducto, disponible) {
      return llamar('producto_toggle_disponible', {
        id_producto: idProducto,
        disponible: disponible
      });
    },

    productoEliminar(idProducto) {
      return llamar('producto_eliminar', { id_producto: idProducto });
    }
  };

})();
