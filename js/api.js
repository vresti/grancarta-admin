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

    // ---- Empresas ----
    // Se retiraron los wrappers muertos empresaListar/empresaObtener/empresaActualizar
    // (Etapa 2, paso 4, 4/7): ningún caller en el admin. La LECTURA de empresa la sirve
    // Firestore (dashboard override, paso 3). Los handlers GAS quedan por ahora.
    empresaCrear(datos) {
      return llamar('empresa_crear', datos);
    },

    // ---- Locales ----
    // Se retiraron los wrappers muertos localListar/localObtener (paso 4): sin caller en
    // el admin. OJO: el handler GAS `local_listar` SIGUE VIVO — lo usa grancarta-caja
    // (su propio api.js). Acá solo se saca el wrapper del admin.
    localCrear(datos) {
      return llamar('local_crear', datos);
    },

    // ---- Cartas / Secciones / Productos: MIGRADO a Firestore (Etapa 1+2, GCFirestore) ----
    //      El editor (crear/editar/borrar/ordenar/toggle de cartas, secciones y productos)
    //      Y la metadata del modal "editar carta" (leerCartaMetadata, frente B, 4/7) viven
    //      100% en firestore-horno.js. Se retiraron TODOS los wrappers GAS sin caller
    //      (carta_*, seccion_*, producto_*, cuenta_obtenerEstructura). Los handlers GAS quedan.

    // ---- Colaboradores / Equipo (Bloque A — Nivel 2, 12/6/2026) ----
    /**
     * (6/7) colaboradorListar → RETIRADO: "Equipo" lee SOLO de Firestore
     * (GCFirestore.colaboradorListar). El handler GAS colaborador_listar quedó
     * fuera del dispatcher. Ver bitácora 047.
     */

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

  };

})();
