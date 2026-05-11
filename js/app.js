/*
 * ============================================================
 * GRANCARTA ADMIN - App principal
 *
 * Orquesta:
 *   - Login (mismo patrón que panel de caja)
 *   - Dashboard
 *   - Wizard de Empresa (V1)
 *   - (Próximas sesiones: Local, Mesas, Carta)
 * ============================================================
 */

const AdminApp = (function() {

  // Estado global
  const state = {
    mail: null,
    jwt: null,
    usuarioLogueado: null,
    estructura: null   // {cuenta, empresas, locales, stats}
  };


  // ============================================================
  // BOOTSTRAP
  // ============================================================

  async function init() {
    // ⚠️ NUEVO: si vinimos desde app.grancarta.com con un JWT contextual
    // en el query string, lo guardamos en localStorage y limpiamos la URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenDeURL = urlParams.get('t');
    if (tokenDeURL) {
      localStorage.setItem('admin_jwt', tokenDeURL);
      // Guardamos también el mail si vino (es opcional, podemos obtenerlo
      // del backend al pedir la sesión)
      const mailDeURL = urlParams.get('m');
      if (mailDeURL) localStorage.setItem('admin_mail', mailDeURL);
      // Limpiar el query string para que el token no quede expuesto
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const jwt = localStorage.getItem('admin_jwt');
    const mail = localStorage.getItem('admin_mail');

    if (jwt) {
      state.jwt = jwt;
      state.mail = mail || '';

      // Si tenemos JWT pero no mail, lo pedimos al backend
      if (!mail) {
        const resp = await AdminAPI.obtenerMiSesion();
        if (resp.ok && resp.usuario) {
          state.mail = resp.usuario.mail || resp.usuario.Mail || '';
          state.usuarioLogueado = resp.usuario;
          localStorage.setItem('admin_mail', state.mail);
        }
      }

      await cargarDashboard();
    } else {
      AdminUI.mostrarPantalla('screen-login-mail');
    }
  }


  // ============================================================
  // LOGIN
  // ============================================================

  async function solicitarCodigo(event) {
    event.preventDefault();
    const mail = document.getElementById('input-mail').value.trim().toLowerCase();
    if (!mail) return;

    const btn = document.getElementById('btn-solicitar-codigo');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    AdminUI.setLoginStatus('login-status-1', '');

    const resp = await AdminAPI.solicitarCodigo(mail);

    btn.disabled = false;
    btn.textContent = 'Pedir código';

    if (!resp.ok) {
      AdminUI.setLoginStatus('login-status-1', resp.error || 'No pudimos enviar el código', 'error');
      return;
    }

    state.mail = mail;
    document.getElementById('mail-display').textContent = mail;
    AdminUI.mostrarPantalla('screen-login-code');

    setTimeout(() => {
      const input = document.getElementById('input-code');
      if (input) {
        input.focus();
        input.value = '';
      }
    }, 100);
  }

  async function verificarCodigo(event) {
    event.preventDefault();
    const codigo = document.getElementById('input-code').value.trim();
    if (codigo.length !== 6) return;

    const btn = document.getElementById('btn-verificar-codigo');
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    AdminUI.setLoginStatus('login-status-2', '');

    const resp = await AdminAPI.verificarCodigo(state.mail, codigo);

    btn.disabled = false;
    btn.textContent = 'Ingresar';

    if (!resp.ok) {
      AdminUI.setLoginStatus('login-status-2', resp.error || 'Código inválido', 'error');
      return;
    }

    state.jwt = resp.token;
    state.usuarioLogueado = resp.usuario;
    localStorage.setItem('admin_jwt', resp.token);
    localStorage.setItem('admin_mail', state.mail);

    AdminUI.setLoginStatus('login-status-2', '¡Bienvenido!', 'success');

    setTimeout(() => cargarDashboard(), 600);
  }

  function volverALoginMail() {
    document.getElementById('input-code').value = '';
    AdminUI.setLoginStatus('login-status-2', '');
    AdminUI.mostrarPantalla('screen-login-mail');
  }

  async function cerrarSesion() {
    const confirmar = await AdminUI.confirm({
      title: '¿Cerrar sesión?',
      message: 'Volverás al selector para elegir otra empresa o salir definitivamente.',
      okLabel: 'Cerrar sesión',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    try {
      await AdminAPI.cerrarSesion();
    } catch (e) {}

    // Limpiar el contexto del admin pero NO el del app
    // (el usuario sigue logueado a nivel cuenta, vuelve al selector)
    localStorage.removeItem('admin_jwt');
    localStorage.removeItem('admin_mail');
    state.jwt = null;
    state.mail = null;
    state.estructura = null;
    AdminUI.setLoading(false);

    // Redirigir al selector de ámbitos
    window.location.href = 'https://app.grancarta.com';
  }


  // ============================================================
  // DASHBOARD
  // ============================================================

  async function cargarDashboard() {
    AdminUI.setLoading(true);
    AdminUI.mostrarPantalla('screen-dashboard');

    const resp = await AdminAPI.obtenerEstructura();

    AdminUI.setLoading(false);

    if (!resp.ok) {
      // Si el JWT venció, volver al login
      if (resp.error && (resp.error.includes('Sesión') || resp.error.includes('Token'))) {
        cerrarSesionForzado();
        return;
      }
      AdminUI.toast(resp.error || 'No pudimos cargar los datos', 'error');
      return;
    }

    state.estructura = resp;
    renderDashboard();
  }

  function cerrarSesionForzado() {
    localStorage.removeItem('admin_jwt');
    localStorage.removeItem('admin_mail');
    window.location.href = 'https://app.grancarta.com';
  }

  function renderDashboard() {
    // Header info
    const cuenta = state.estructura.cuenta;
    const accountInfo = cuenta
      ? 'Plan ' + (cuenta.Plan || 'trial') + ' · ' + state.estructura.stats.empresas_count + ' empresa(s)'
      : 'Cuenta no configurada';
    document.getElementById('dash-account-info').textContent = accountInfo;

    // Stats
    renderStats();

    // Empresas
    renderEmpresas();
  }

  function renderStats() {
    const stats = state.estructura.stats;
    const container = document.getElementById('dash-stats');

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Empresas</div>
        <div class="stat-value">${stats.empresas_count}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Locales</div>
        <div class="stat-value">${stats.locales_count}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Mesas</div>
        <div class="stat-value">${stats.mesas_count}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Productos</div>
        <div class="stat-value">${stats.productos_count}</div>
      </div>
    `;
  }

  function renderEmpresas() {
    const empresas = state.estructura.empresas || [];
    const locales = state.estructura.locales || [];
    const container = document.getElementById('empresas-list');

    if (empresas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏢</div>
          <div class="empty-state-title">No tenés empresas todavía</div>
          <div class="empty-state-detail">Empezá creando tu primera empresa para configurar tu carta digital.</div>
          <button class="btn btn-primary" onclick="iniciarWizardEmpresa()">+ Crear mi primera empresa</button>
        </div>
      `;
      return;
    }

    let html = '';
    empresas.forEach(function(e) {
      const localesDeEmpresa = locales.filter(function(l) { return l.Id_Empresa === e.Id_Empresa; });
      html += `
        <button class="empresa-card" onclick="abrirEmpresa('${AdminUI.escapeHtml(e.Id_Empresa)}')">
          <div class="empresa-card-name">${AdminUI.escapeHtml(e.Nombre_Comercial)}</div>
          <div class="empresa-card-razon">${AdminUI.escapeHtml(e.Razon_Social)}</div>
          <div class="empresa-card-meta">
            <span class="empresa-card-meta-item">📍 ${localesDeEmpresa.length} local(es)</span>
            <span class="empresa-card-meta-item">${AdminUI.escapeHtml(e.CUIT || '')}</span>
          </div>
        </button>
      `;
    });

    container.innerHTML = html;
  }

  function abrirEmpresa(idEmpresa) {
    // Por ahora solo toast - en próxima sesión: pantalla de detalle de empresa
    AdminUI.toast('Próximamente: pantalla de detalle de empresa', 'info');
  }


  // ============================================================
  // WIZARD DE EMPRESA
  // ============================================================

  function iniciarWizardEmpresa() {
    Wizard.start({
      id: 'empresa',
      initialData: {},
      steps: [
        {
          type: 'welcome',
          icon: 'G',
          title: 'Bienvenido a GranCarta',
          subtitle: 'Vamos a crear tu primera empresa. Te lleva cinco minutos. Después podrás configurar tu carta digital.'
        },
        {
          type: 'input',
          eyebrow: 'Paso 1 de 4',
          title: 'Empezamos por lo legal',
          subtitle: '¿Cuál es la razón social registrada de tu empresa? Tal cual figura en AFIP.',
          field: 'razon_social',
          placeholder: 'Juan Pérez S.A.',
          hint: 'Esto debe coincidir con tu CUIT. Lo usamos para reportes legales y facturación.',
          validate: function(d) { return AdminUI.validar.longitudMinima(d.razon_social, 3); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 2 de 4',
          title: 'CUIT',
          subtitle: 'El número de identificación fiscal de tu empresa.',
          field: 'cuit',
          placeholder: '30-12345678-9',
          mono: true,
          maxLength: 13,
          formatter: AdminUI.formatearCUIT,
          hint: 'Once dígitos. Te formateamos los guiones automáticamente mientras escribís.',
          validate: function(d) { return AdminUI.validar.cuit(d.cuit); },
          validationMessage: function(d, valid) {
            const limpio = String(d.cuit || '').replace(/[^0-9]/g, '');
            if (valid) return { text: '✓ CUIT válido', type: 'success' };
            if (limpio.length === 0) return { text: '' };
            return { text: limpio.length + ' de 11 dígitos', type: 'error' };
          }
        },
        {
          type: 'input',
          eyebrow: 'Paso 3 de 4',
          title: 'Nombre comercial',
          subtitle: '¿Con qué nombre te conoce tu cliente cuando entra al lugar?',
          field: 'nombre_comercial',
          placeholder: 'La Cantina de Leo',
          hint: 'Este es el nombre que ve el cliente al escanear el QR. Suele ser distinto a la razón social.',
          validate: function(d) { return AdminUI.validar.longitudMinima(d.nombre_comercial, 2); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 4 de 4',
          title: 'Mail de contacto',
          subtitle: 'Para soporte técnico y notificaciones del sistema.',
          field: 'mail_contacto',
          placeholder: 'leo@lacantina.com',
          inputType: 'email',
          validate: function(d) { return AdminUI.validar.mail(d.mail_contacto); },
          validationMessage: function(d, valid) {
            if (valid) return { text: '✓ Mail válido', type: 'success' };
            return { text: '' };
          }
        },
        {
          type: 'confirm',
          eyebrow: 'Confirmación',
          title: 'Revisemos tus datos',
          subtitle: 'Si todo está correcto, creamos tu empresa. Para cambiar algo, volvé al paso correspondiente.',
          fields: [
            { label: 'Razón social', field: 'razon_social' },
            { label: 'CUIT', field: 'cuit', mono: true },
            { label: 'Nombre comercial', field: 'nombre_comercial' },
            { label: 'Mail', field: 'mail_contacto' }
          ],
          validate: function(d) {
            return AdminUI.validar.longitudMinima(d.razon_social, 3) &&
                   AdminUI.validar.cuit(d.cuit) &&
                   AdminUI.validar.longitudMinima(d.nombre_comercial, 2) &&
                   AdminUI.validar.mail(d.mail_contacto);
          }
        },
        {
          type: 'success',
          title: 'Empresa creada',
          subtitle: function(d) {
            return (d.nombre_comercial || 'Tu empresa') + ' ya está registrada. El siguiente paso es configurar tu primer local — la dirección física donde está tu negocio.';
          },
          nextLabel: 'Crear primer local →',
          // En el success agregamos un segundo botón "Más tarde" para volver al dashboard
          showSkipButton: true,
          skipLabel: 'Más tarde'
        }
      ],

      onComplete: async function(data) {
        const resp = await AdminAPI.empresaCrear({
          razon_social: data.razon_social,
          cuit: data.cuit,
          nombre_comercial: data.nombre_comercial,
          mail_contacto: data.mail_contacto
        });

        if (!resp.ok) {
          AdminUI.toast(resp.error || 'Error creando la empresa', 'error');
          return false;
        }

        // Guardar el id_empresa en data para usarlo en encadenamiento
        data._id_empresa = resp.id_empresa;

        AdminUI.toast('Empresa creada exitosamente', 'success');
        return true;
      },

      onSuccessNext: function(data) {
        // Encadenar: arrancar wizard de Local con la empresa recién creada
        iniciarWizardLocal({
          id_empresa: data._id_empresa,
          nombreEmpresa: data.nombre_comercial
        });
      },

      onSuccessSkip: function(data) {
        // El usuario eligió "Más tarde" — refrescar dashboard
        cargarDashboard();
      }
    });
  }


  // ============================================================
  // WIZARD DE LOCAL
  // ============================================================

  /**
   * Inicia el wizard de Local.
   *
   * @param {Object} opciones
   * @param {string} opciones.id_empresa - ID de la empresa donde se crea el local (obligatorio)
   * @param {string} [opciones.nombreEmpresa] - Para mostrar en la bienvenida
   */
  function iniciarWizardLocal(opciones) {
    if (!opciones || !opciones.id_empresa) {
      AdminUI.toast('Falta indicar la empresa', 'error');
      return;
    }

    const idEmpresa = opciones.id_empresa;
    const nombreEmpresa = opciones.nombreEmpresa || 'tu empresa';

    Wizard.start({
      id: 'local',
      initialData: { id_empresa: idEmpresa },
      steps: [
        {
          type: 'welcome',
          icon: '📍',
          title: 'Configuremos tu primer local',
          subtitle: 'Ahora vamos a cargar la dirección física de ' + nombreEmpresa + '. Solo el nombre es obligatorio — el resto lo podés saltar y completar después.'
        },
        {
          type: 'input',
          eyebrow: 'Paso 1 de 6',
          title: '¿Cómo se llama esta sucursal?',
          subtitle: 'El nombre interno con el que la vas a identificar.',
          field: 'nombre',
          placeholder: 'Sucursal Centro',
          hint: 'Si tenés un solo local, podés ponerle "Local principal" o el nombre del bar.',
          validate: function(d) { return AdminUI.validar.longitudMinima(d.nombre, 2); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 2 de 6 · Opcional',
          title: '¿Dónde queda?',
          subtitle: 'La dirección de la calle (sin ciudad, eso viene después).',
          field: 'direccion',
          placeholder: 'Av. Corrientes 1234',
          optional: true
        },
        {
          type: 'input',
          eyebrow: 'Paso 3 de 6 · Opcional',
          title: 'Ciudad',
          subtitle: '¿En qué ciudad está tu local?',
          field: 'ciudad',
          placeholder: 'Buenos Aires',
          optional: true
        },
        {
          type: 'input',
          eyebrow: 'Paso 4 de 6 · Opcional',
          title: 'Provincia',
          subtitle: '¿Y la provincia?',
          field: 'provincia',
          placeholder: 'CABA',
          optional: true
        },
        {
          type: 'input',
          eyebrow: 'Paso 5 de 6 · Opcional',
          title: 'Teléfono del local',
          subtitle: 'Por si querés que tu cliente pueda llamar al local desde la carta digital.',
          field: 'telefono',
          placeholder: '+54 11 4567 8900',
          inputType: 'tel',
          optional: true,
          hint: 'Lo podés cambiar o agregar después desde el panel.'
        },
        {
          type: 'input',
          eyebrow: 'Paso 6 de 6 · Opcional',
          title: 'Mail del local',
          subtitle: 'Si el local tiene un mail propio (distinto al de la empresa).',
          field: 'mail',
          placeholder: 'centro@lacantina.com',
          inputType: 'email',
          optional: true,
          validationMessage: function(d, valid) {
            if (!d.mail) return { text: '' };
            if (AdminUI.validar.mail(d.mail)) return { text: '✓ Mail válido', type: 'success' };
            return { text: '' };
          }
        },
        {
          type: 'confirm',
          eyebrow: 'Confirmación',
          title: 'Revisemos los datos del local',
          subtitle: 'Si todo está correcto, creamos el local. Para cambiar algo, volvé al paso correspondiente.',
          fields: [
            { label: 'Nombre', field: 'nombre' },
            { label: 'Dirección', field: 'direccion' },
            { label: 'Ciudad', field: 'ciudad' },
            { label: 'Provincia', field: 'provincia' },
            { label: 'Teléfono', field: 'telefono' },
            { label: 'Mail', field: 'mail' }
          ],
          validate: function(d) {
            return AdminUI.validar.longitudMinima(d.nombre, 2);
          }
        },
        {
          type: 'success',
          title: 'Local creado',
          subtitle: function(d) {
            return (d.nombre || 'Tu local') + ' está listo. Próximo paso: cargar las mesas y la carta.';
          },
          nextLabel: 'Volver al panel →'
        }
      ],

      onComplete: async function(data) {
        // Limpiar campos vacíos antes de mandar
        const payload = {
          id_empresa: idEmpresa,
          nombre: data.nombre
        };
        if (data.direccion) payload.direccion = data.direccion;
        if (data.ciudad) payload.ciudad = data.ciudad;
        if (data.provincia) payload.provincia = data.provincia;
        if (data.telefono) payload.telefono = data.telefono;
        if (data.mail) payload.mail = data.mail;

        const resp = await AdminAPI.localCrear(payload);

        if (!resp.ok) {
          AdminUI.toast(resp.error || 'Error creando el local', 'error');
          return false;
        }

        data._id_local = resp.id_local;
        AdminUI.toast('Local creado exitosamente', 'success');
        return true;
      },

      onSuccessNext: function(data) {
        // Por ahora vuelve al dashboard.
        // Próxima sesión: aquí ofreceríamos crear las mesas.
        cargarDashboard();
      }
    });
  }


  // ============================================================
  // EXPORTAR API PÚBLICA
  // ============================================================

  return {
    init,
    solicitarCodigo,
    verificarCodigo,
    volverALoginMail,
    cerrarSesion,
    iniciarWizardEmpresa,
    iniciarWizardLocal,
    abrirEmpresa
  };

})();


// ============================================================
// FUNCIONES GLOBALES (para handlers inline en HTML)
// ============================================================

function solicitarCodigo(e) { AdminApp.solicitarCodigo(e); }
function verificarCodigo(e) { AdminApp.verificarCodigo(e); }
function volverALoginMail() { AdminApp.volverALoginMail(); }
function cerrarSesion() { AdminApp.cerrarSesion(); }
function iniciarWizardEmpresa() { AdminApp.iniciarWizardEmpresa(); }
function abrirEmpresa(idEmpresa) { AdminApp.abrirEmpresa(idEmpresa); }
function cancelarWizard() { Wizard.cancel(); }


// ============================================================
// BOOTSTRAP
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', AdminApp.init);
} else {
  AdminApp.init();
}
