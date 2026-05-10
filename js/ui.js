/*
 * ============================================================
 * GRANCARTA ADMIN - Helpers de UI
 * ============================================================
 */

const AdminUI = (function() {

  /**
   * Cambiar entre pantallas.
   */
  function mostrarPantalla(idPantalla) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
    const target = document.getElementById(idPantalla);
    if (target) {
      target.classList.add('is-active');
      window.scrollTo(0, 0);
    }
  }

  /**
   * Mostrar/ocultar overlay de loading.
   */
  function setLoading(visible) {
    const overlay = document.getElementById('loading-overlay');
    if (visible) {
      overlay.classList.add('is-visible');
    } else {
      overlay.classList.remove('is-visible');
    }
  }

  /**
   * Toast efímero (3.5s).
   */
  function toast(mensaje, tipo = 'info') {
    const el = document.getElementById('toast');
    el.textContent = mensaje;
    el.className = 'toast is-visible';
    if (tipo === 'error') el.classList.add('is-error');
    if (tipo === 'success') el.classList.add('is-success');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      el.classList.remove('is-visible');
    }, 3500);
  }

  /**
   * Status en pantallas de login.
   */
  function setLoginStatus(idElemento, mensaje, tipo = '') {
    const el = document.getElementById(idElemento);
    el.textContent = mensaje;
    el.className = 'login-status';
    if (tipo) el.classList.add('is-' + tipo);
  }

  /**
   * Confirm dialog con propio diseño.
   * Devuelve Promise que resuelve true/false.
   */
  function confirm(opciones) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-overlay');
      const titleEl = document.getElementById('confirm-title');
      const messageEl = document.getElementById('confirm-message');
      const btnOk = document.getElementById('confirm-ok');
      const btnCancel = document.getElementById('confirm-cancel');

      titleEl.textContent = opciones.title || '¿Estás seguro?';
      messageEl.textContent = opciones.message || '';
      btnOk.textContent = opciones.okLabel || 'Confirmar';
      btnCancel.textContent = opciones.cancelLabel || 'Cancelar';

      const handleOk = () => { cleanup(); resolve(true); };
      const handleCancel = () => { cleanup(); resolve(false); };

      function cleanup() {
        overlay.classList.remove('is-visible');
        btnOk.removeEventListener('click', handleOk);
        btnCancel.removeEventListener('click', handleCancel);
      }

      btnOk.addEventListener('click', handleOk);
      btnCancel.addEventListener('click', handleCancel);
      overlay.classList.add('is-visible');
    });
  }

  /**
   * Helper para escapar HTML.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Formatear CUIT al estándar XX-XXXXXXXX-X.
   */
  function formatearCUIT(value) {
    const limpio = String(value || '').replace(/[^0-9]/g, '').slice(0, 11);
    if (limpio.length <= 2) return limpio;
    if (limpio.length <= 10) return limpio.slice(0, 2) + '-' + limpio.slice(2);
    return limpio.slice(0, 2) + '-' + limpio.slice(2, 10) + '-' + limpio.slice(10);
  }

  /**
   * Validadores comunes.
   */
  const validar = {
    longitudMinima: (v, min = 2) => String(v || '').trim().length >= min,
    cuit: (v) => String(v || '').replace(/[^0-9]/g, '').length === 11,
    mail: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()),
    telefono: (v) => {
      const limpio = String(v || '').replace(/[^0-9+]/g, '');
      return limpio.length === 0 || limpio.length >= 6;
    },
    no_vacio: (v) => String(v || '').trim().length > 0
  };

  return {
    mostrarPantalla,
    setLoading,
    toast,
    setLoginStatus,
    confirm,
    escapeHtml,
    formatearCUIT,
    validar
  };

})();
