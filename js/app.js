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
    if (event && event.preventDefault) event.preventDefault();
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
      // Patrón LegalPagaré: si el mail no existe, abrir pantalla de registro
      if (resp.needsRegister) {
        state.mail = mail;
        document.getElementById('registro-mail-display').textContent = mail;
        document.getElementById('input-nombre').value = '';
        document.getElementById('input-apellido').value = '';
        AdminUI.setLoginStatus('login-status-registro', '');
        AdminUI.mostrarPantalla('screen-registro');
        setTimeout(function() {
          const i = document.getElementById('input-nombre');
          if (i) i.focus();
        }, 100);
        return;
      }
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


  // ============================================================
  // AUTO-REGISTRO (patrón LegalPagaré)
  // ============================================================

  async function confirmarRegistro(event) {
    if (event && event.preventDefault) event.preventDefault();

    const nombre = document.getElementById('input-nombre').value.trim();
    const apellido = document.getElementById('input-apellido').value.trim();

    if (nombre.length < 2) {
      AdminUI.setLoginStatus('login-status-registro', 'Ingresá tu nombre (mínimo 2 letras)', 'error');
      return;
    }

    const btn = document.getElementById('btn-confirmar-registro');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta…';
    AdminUI.setLoginStatus('login-status-registro', '');

    const resp = await AdminAPI.registrarCuenta(state.mail, nombre, apellido);

    if (!resp.ok) {
      btn.disabled = false;
      btn.textContent = 'Crear cuenta y continuar →';
      AdminUI.setLoginStatus('login-status-registro', resp.error || 'No pudimos crear tu cuenta', 'error');
      return;
    }

    // Guardamos el nombre para la pantalla de bienvenida
    state.nombreNuevo = nombre;

    // Ahora pedimos el código automáticamente (la cuenta ya existe)
    btn.textContent = 'Enviando código…';
    const r2 = await AdminAPI.solicitarCodigo(state.mail);

    btn.disabled = false;
    btn.textContent = 'Crear cuenta y continuar →';

    if (!r2.ok) {
      AdminUI.setLoginStatus('login-status-registro',
        'Cuenta creada pero no pudimos enviar el código. Volvé a intentar.', 'error');
      return;
    }

    AdminUI.setLoginStatus('login-status-registro',
      '✓ Cuenta creada. Te enviamos un código por mail.', 'success');

    document.getElementById('mail-display').textContent = state.mail;

    setTimeout(function() {
      AdminUI.mostrarPantalla('screen-login-code');
      const input = document.getElementById('input-code');
      if (input) { input.focus(); input.value = ''; }
    }, 800);
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

    if (!resp.ok) {
      AdminUI.setLoading(false);
      // Si el JWT venció, volver al login
      if (resp.error && (resp.error.includes('Sesión') || resp.error.includes('Token'))) {
        cerrarSesionForzado();
        return;
      }
      AdminUI.toast(resp.error || 'No pudimos cargar los datos', 'error');
      return;
    }

    state.estructura = resp;

    // Cargar cartas+locales enriquecidos por empresa (en paralelo)
    // Esto nos da: carta_activa con nombre, URL pública, cartas_disponibles
    const empresas = resp.empresas || [];
    state.cartasPorEmpresa = {};

    if (empresas.length > 0) {
      const promesas = empresas.map(function(e) {
        return AdminAPI.localListarConCarta(e.Id_Empresa);
      });
      const resultados = await Promise.all(promesas);
      empresas.forEach(function(e, idx) {
        const r = resultados[idx];
        if (r && r.ok) {
          state.cartasPorEmpresa[e.Id_Empresa] = {
            locales: r.locales || [],
            cartas_disponibles: r.cartas_disponibles || []
          };
        }
      });
    }

    AdminUI.setLoading(false);

    // Si el usuario no tiene empresas todavía → pantalla de bienvenida con 4 pasos
    if (empresas.length === 0) {
      const nombreUsuario = state.nombreNuevo
        || (state.usuarioLogueado && state.usuarioLogueado.nombre)
        || 'amigo';
      document.getElementById('bienvenida-nombre').textContent = nombreUsuario;
      AdminUI.mostrarPantalla('screen-bienvenida');
      return;
    }

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
    const cartasPorEmpresa = state.cartasPorEmpresa || {};
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
      const datosEmp = cartasPorEmpresa[e.Id_Empresa];
      // Si tenemos datos enriquecidos, los usamos. Si no, fallback a los planos.
      const localesDeEmpresa = datosEmp
        ? datosEmp.locales
        : locales.filter(function(l) { return l.Id_Empresa === e.Id_Empresa; });
      const cartasDisponibles = datosEmp ? datosEmp.cartas_disponibles : [];

      html += `
        <div class="empresa-block">
          <div class="empresa-block-header">
            <div class="empresa-block-info">
              <div class="empresa-block-name">${AdminUI.escapeHtml(e.Nombre_Comercial)}</div>
              <div class="empresa-block-meta">
                ${AdminUI.escapeHtml(e.Razon_Social)} · ${AdminUI.escapeHtml(e.CUIT || '')}
              </div>
            </div>
            <div class="empresa-block-actions">
              <span class="empresa-block-locales-count">${localesDeEmpresa.length} local(es)</span>
            </div>
          </div>
      `;

      if (localesDeEmpresa.length === 0) {
        html += `
          <div class="empresa-block-empty">
            <span>📍 Sin locales todavía</span>
          </div>
        `;
      } else {
        html += '<div class="locales-list">';
        localesDeEmpresa.forEach(function(l) {
          html += renderLocalCard(l, e, cartasDisponibles);
        });
        html += '</div>';
      }

      html += '</div>';  // /empresa-block
    });

    container.innerHTML = html;
  }

  function renderLocalCard(l, e, cartasDisponibles) {
    const nombreEmpresa = e.Nombre_Comercial;
    const direccion = l.Direccion || 'Sin dirección';
    const ciudad = l.Ciudad || '';

    // Carta activa (puede ser null en local recién creado)
    const cartaActiva = l.carta_activa || null;
    const idCartaActiva = l.Id_Carta_Activa || null;
    const urlPublica = l.url_publica || null;

    // Sección "Carta activa + switch"
    let bloqueCartaHtml = '';

    if (cartasDisponibles.length === 0) {
      // Empresa sin cartas todavía
      bloqueCartaHtml = `
        <div class="local-carta-box local-carta-empty">
          <div class="local-carta-empty-icon">📋</div>
          <div class="local-carta-empty-text">
            Esta empresa todavía no tiene cartas creadas.
            <br><small>Creá la primera para asignarla a este local.</small>
          </div>
          <button class="btn btn-secondary btn-sm"
                  onclick="abrirCartasDelLocal('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(l.Id_Empresa)}', '${AdminUI.escapeHtml(l.Nombre)}', '${AdminUI.escapeHtml(nombreEmpresa)}')">
            + Crear carta
          </button>
        </div>
      `;
    } else if (!cartaActiva) {
      // Hay cartas en la empresa pero el local no tiene asignada todavía
      bloqueCartaHtml = `
        <div class="local-carta-box local-carta-needs-assign">
          <div class="local-carta-warning">⚠️ Este local todavía no tiene carta asignada</div>
          <div class="local-carta-select-row">
            <select class="local-carta-select" id="select-carta-${AdminUI.escapeHtml(l.Id_Local)}">
              <option value="">— Elegí una carta —</option>
              ${cartasDisponibles.map(function(c) {
                return `<option value="${AdminUI.escapeHtml(c.Id_Carta)}">${AdminUI.escapeHtml(c.Nombre)} (${AdminUI.escapeHtml(c.Template)})</option>`;
              }).join('')}
            </select>
            <button class="btn btn-primary btn-sm"
                    onclick="abrirModalCambioCarta('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(l.Nombre)}', null, null)">
              Asignar →
            </button>
          </div>
        </div>
      `;
    } else {
      // Caso normal: el local tiene carta activa, ofrecer cambiar
      const opcionesSelect = cartasDisponibles
        .filter(function(c) { return c.Id_Carta !== idCartaActiva; })
        .map(function(c) {
          return `<option value="${AdminUI.escapeHtml(c.Id_Carta)}">${AdminUI.escapeHtml(c.Nombre)} (${AdminUI.escapeHtml(c.Template)})</option>`;
        }).join('');

      const hayAlternativas = opcionesSelect.length > 0;

      bloqueCartaHtml = `
        <div class="local-carta-box local-carta-active">
          <div class="local-carta-current">
            <span class="local-carta-current-label">📺 Mostrando ahora:</span>
            <strong class="local-carta-current-name">${AdminUI.escapeHtml(cartaActiva.Nombre)}</strong>
            <span class="local-carta-template-tag">${AdminUI.escapeHtml(cartaActiva.Template)}</span>
          </div>
          ${hayAlternativas ? `
            <div class="local-carta-switch-row">
              <span class="local-carta-switch-label">Cambiar a:</span>
              <select class="local-carta-select" id="select-carta-${AdminUI.escapeHtml(l.Id_Local)}">
                <option value="">— Elegí otra —</option>
                ${opcionesSelect}
              </select>
              <button class="btn btn-secondary btn-sm"
                      onclick="abrirModalCambioCarta('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(l.Nombre)}', '${AdminUI.escapeHtml(idCartaActiva)}', '${AdminUI.escapeHtml(cartaActiva.Nombre)}')">
                Cambiar →
              </button>
            </div>
          ` : `
            <div class="local-carta-only-one">
              <small>Esta es la única carta disponible. Creá otra para poder cambiar.</small>
            </div>
          `}
        </div>
      `;
    }

    // Bloque URL pública
    let urlHtml = '';
    if (urlPublica) {
      urlHtml = `
        <div class="local-url-row">
          <span class="local-url-label">🌐</span>
          <code class="local-url-value">${AdminUI.escapeHtml(urlPublica)}</code>
          <button class="btn-icon-mini" onclick="copiarUrlPublica('${AdminUI.escapeHtml(urlPublica)}')" title="Copiar URL">
            📋
          </button>
          <a class="btn-icon-mini" href="${AdminUI.escapeHtml(urlPublica)}" target="_blank" rel="noopener" title="Abrir en nueva pestaña">
            ↗
          </a>
        </div>
      `;
    } else if (cartaActiva) {
      // Tiene carta pero no URL (algún slug faltante)
      urlHtml = `
        <div class="local-url-row local-url-missing">
          <small>⚠️ URL pública no disponible (revisar slug de empresa o local)</small>
        </div>
      `;
    }

    return `
      <div class="local-card local-card-expanded">
        <div class="local-card-header">
          <div class="local-card-info">
            <div class="local-card-name">${AdminUI.escapeHtml(l.Nombre)}</div>
            <div class="local-card-meta">
              📍 ${AdminUI.escapeHtml(direccion)} ${ciudad ? '· ' + AdminUI.escapeHtml(ciudad) : ''}
            </div>
          </div>
          <div class="local-card-actions">
            <button class="btn btn-secondary btn-sm"
                    onclick="abrirCartasDelLocal('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(l.Id_Empresa)}', '${AdminUI.escapeHtml(l.Nombre)}', '${AdminUI.escapeHtml(nombreEmpresa)}')">
              📋 Cartas
            </button>
          </div>
        </div>
        ${bloqueCartaHtml}
        ${urlHtml}
      </div>
    `;
  }

  function abrirEmpresa(idEmpresa) {
    // Pantalla de detalle de empresa - próxima sesión
    AdminUI.toast('Pronto: pantalla de detalle de empresa', 'info');
  }

  function volverADashboard() {
    state.cartasContexto = null;
    AdminUI.mostrarPantalla('screen-dashboard');
  }


  // ============================================================
  // CAMBIO DE CARTA EN UN LOCAL (modal + ejecución)
  // ============================================================

  /**
   * Abre el modal para confirmar el cambio de carta de un local.
   * - idLocal: local que se modifica
   * - nombreLocal: para mostrar en el modal
   * - idCartaActualActual: ID actual (o null si el local no tenía)
   * - nombreCartaActual: nombre de la carta actual (o null)
   *
   * La carta nueva se toma del <select> que está en la card del local.
   */
  function abrirModalCambioCarta(idLocal, nombreLocal, idCartaActual, nombreCartaActual) {
    const select = document.getElementById('select-carta-' + idLocal);
    if (!select) {
      AdminUI.toast('No encontramos el selector', 'error');
      return;
    }
    const idCartaNueva = select.value;
    if (!idCartaNueva) {
      AdminUI.toast('Elegí una carta primero', 'warn');
      return;
    }

    // Encontrar el nombre legible de la carta nueva
    const opt = select.options[select.selectedIndex];
    const nombreCartaNueva = opt ? opt.text : idCartaNueva;

    // Guardar contexto para el confirmar
    state.cambioCartaContexto = {
      idLocal: idLocal,
      nombreLocal: nombreLocal,
      idCartaActual: idCartaActual,
      nombreCartaActual: nombreCartaActual || '(sin carta)',
      idCartaNueva: idCartaNueva,
      nombreCartaNueva: nombreCartaNueva
    };

    // Llenar el modal
    document.getElementById('cambiar-carta-local-nombre').textContent = nombreLocal;
    document.getElementById('cambiar-carta-actual').textContent = state.cambioCartaContexto.nombreCartaActual;
    document.getElementById('cambiar-carta-nueva').textContent = nombreCartaNueva;

    // Si es "asignación inicial" (sin carta previa), cambiar texto del botón
    const btnConfirmar = document.getElementById('btn-confirmar-cambio');
    if (!idCartaActual) {
      btnConfirmar.textContent = 'Sí, asignar carta →';
    } else {
      btnConfirmar.textContent = 'Sí, cambiar ahora →';
    }

    document.getElementById('modal-cambiar-carta').classList.add('is-visible');
  }

  async function confirmarCambioCarta() {
    const ctx = state.cambioCartaContexto;
    if (!ctx) return;

    const btn = document.getElementById('btn-confirmar-cambio');
    btn.disabled = true;
    btn.textContent = 'Cambiando…';

    const resp = await AdminAPI.localCambiarCarta(ctx.idLocal, ctx.idCartaNueva);

    btn.disabled = false;
    btn.textContent = ctx.idCartaActual ? 'Sí, cambiar ahora →' : 'Sí, asignar carta →';

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos cambiar la carta', 'error');
      return;
    }

    cerrarModales();
    state.cambioCartaContexto = null;
    AdminUI.toast('Carta cambiada. Su comercio sigue en línea ✨', 'success');

    // Recargar el dashboard para reflejar el cambio
    await cargarDashboard();
  }

  function copiarUrlPublica(url) {
    if (!url) return;
    try {
      navigator.clipboard.writeText(url).then(function() {
        AdminUI.toast('URL copiada al portapapeles', 'success');
      }, function() {
        AdminUI.toast('No pudimos copiar. Seleccioná y copiá manualmente.', 'warn');
      });
    } catch (err) {
      // Fallback para navegadores viejos
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        AdminUI.toast('URL copiada', 'success');
      } catch (e) {
        AdminUI.toast('Copiá la URL manualmente', 'warn');
      }
      document.body.removeChild(ta);
    }
  }


  // ============================================================
  // CARTAS DEL LOCAL
  // ============================================================

  async function abrirCartasDelLocal(idLocal, idEmpresa, nombreLocal, nombreEmpresa) {
    state.cartasContexto = {
      idLocal: idLocal,
      idEmpresa: idEmpresa,
      nombreLocal: nombreLocal,
      nombreEmpresa: nombreEmpresa,
      cartas: []
    };

    document.getElementById('cartas-titulo').textContent = nombreLocal;
    document.getElementById('cartas-subtitulo').textContent = nombreEmpresa;

    AdminUI.mostrarPantalla('screen-cartas');
    await cargarCartas();
  }

  async function cargarCartas() {
    if (!state.cartasContexto) return;
    AdminUI.setLoading(true);
    const resp = await AdminAPI.cartaListar(state.cartasContexto.idEmpresa);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos cargar las cartas', 'error');
      return;
    }

    state.cartasContexto.cartas = resp.cartas || [];
    renderCartas();
  }

  function renderCartas() {
    const cartas = state.cartasContexto.cartas;
    const container = document.getElementById('cartas-list');
    document.getElementById('cartas-count').textContent = cartas.length;

    if (cartas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No hay cartas todavía</div>
          <div class="empty-state-detail">Creá la primera carta de este local. Después podrás agregar secciones y productos.</div>
          <button class="btn btn-primary" onclick="abrirModalCartaNueva()">+ Crear primera carta</button>
        </div>
      `;
      return;
    }

    let html = '';
    cartas.forEach(function(c) {
      const esActiva = c.Estado === 'activa';
      const badgeClass = esActiva ? 'is-active' : (c.Estado === 'borrador' ? 'is-draft' : '');
      const redondeoLabel = (c.Redondeo === 'sin') ? 'sin redondear' :
                            (c.Redondeo ? 'redondeo $' + c.Redondeo : 'redondeo $10');

      html += `
        <div class="carta-card ${esActiva ? 'is-active' : ''}">
          <div class="carta-card-header">
            <div class="carta-card-info">
              <div class="carta-card-name">
                ${esActiva ? '<span class="carta-star">⭐</span>' : ''}
                ${AdminUI.escapeHtml(c.Nombre)}
              </div>
              ${c.Descripcion ? '<div class="carta-card-desc">' + AdminUI.escapeHtml(c.Descripcion) + '</div>' : ''}
              <div class="carta-card-meta">
                <span class="carta-badge ${badgeClass}">${AdminUI.escapeHtml(c.Estado)}</span>
                <span class="carta-meta-item">${redondeoLabel}</span>
              </div>
            </div>
          </div>
          <div class="carta-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="abrirEditorCarta('${AdminUI.escapeHtml(c.Id_Carta)}')" title="Editar contenido (próximamente)">
              📝 Editor
            </button>
            ${!esActiva ? `
              <button class="btn btn-secondary btn-sm" onclick="activarCarta('${AdminUI.escapeHtml(c.Id_Carta)}', '${AdminUI.escapeHtml(c.Nombre)}')" title="Activar">
                ⭐ Activar
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="abrirModalDuplicarCarta('${AdminUI.escapeHtml(c.Id_Carta)}', '${AdminUI.escapeHtml(c.Nombre)}')" title="Duplicar">
              📋 Duplicar
            </button>
            <button class="btn btn-secondary btn-sm" onclick="abrirModalEditarCarta('${AdminUI.escapeHtml(c.Id_Carta)}')" title="Editar datos">
              ⚙️ Datos
            </button>
            <button class="btn btn-secondary btn-sm btn-danger-soft" onclick="archivarCarta('${AdminUI.escapeHtml(c.Id_Carta)}', '${AdminUI.escapeHtml(c.Nombre)}')" title="Archivar">
              🗑
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // --- Crear ---

  function abrirModalCartaNueva() {
    document.getElementById('carta-nueva-nombre').value = '';
    document.getElementById('carta-nueva-descripcion').value = '';
    const radios = document.querySelectorAll('input[name="carta-nueva-redondeo"]');
    radios.forEach(function(r) { r.checked = r.value === '10'; });

    document.getElementById('modal-carta-nueva').classList.add('is-visible');
    setTimeout(function() { document.getElementById('carta-nueva-nombre').focus(); }, 200);
  }

  async function confirmarCartaNueva() {
    const nombre = document.getElementById('carta-nueva-nombre').value.trim();
    if (nombre.length < 2) {
      AdminUI.toast('Pon un nombre de al menos 2 letras', 'error');
      return;
    }

    const descripcion = document.getElementById('carta-nueva-descripcion').value.trim();
    const redondeoEl = document.querySelector('input[name="carta-nueva-redondeo"]:checked');
    const redondeo = redondeoEl ? redondeoEl.value : '10';

    const btn = document.getElementById('btn-carta-nueva-crear');
    btn.disabled = true;
    btn.textContent = 'Creando…';

    const resp = await AdminAPI.cartaCrear({
      id_empresa: state.cartasContexto.idEmpresa,
      nombre: nombre,
      descripcion: descripcion,
      redondeo: redondeo
    });

    btn.disabled = false;
    btn.textContent = 'Crear carta';

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos crear la carta', 'error');
      return;
    }

    AdminUI.toast('Carta creada', 'success');
    cerrarModales();
    await cargarCartas();
  }

  // --- Duplicar ---

  function abrirModalDuplicarCarta(idCarta, nombreCarta) {
    state.cartaDuplicarId = idCarta;
    document.getElementById('duplicar-info').innerHTML = `
      <strong>Carta a duplicar:</strong> ${AdminUI.escapeHtml(nombreCarta)}<br>
      <small>Se copian todas las secciones y productos. La nueva carta queda independiente.</small>
    `;
    document.getElementById('carta-dup-nombre').value = nombreCarta + ' (copia)';
    document.getElementById('carta-dup-modificador').value = '0';
    document.querySelector('input[name="carta-dup-direccion"][value="aumentar"]').checked = true;

    document.getElementById('modal-carta-duplicar').classList.add('is-visible');
    setTimeout(function() {
      const input = document.getElementById('carta-dup-nombre');
      input.focus();
      input.select();
    }, 200);
  }

  async function confirmarCartaDuplicar() {
    const nombreNueva = document.getElementById('carta-dup-nombre').value.trim();
    if (nombreNueva.length < 2) {
      AdminUI.toast('Pon un nombre de al menos 2 letras', 'error');
      return;
    }

    let modificador = parseFloat(document.getElementById('carta-dup-modificador').value) || 0;
    const direccionEl = document.querySelector('input[name="carta-dup-direccion"]:checked');
    const direccion = direccionEl ? direccionEl.value : 'aumentar';
    if (direccion === 'reducir' && modificador > 0) modificador = -modificador;
    if (direccion === 'aumentar' && modificador < 0) modificador = -modificador;

    const btn = document.getElementById('btn-carta-dup-confirmar');
    btn.disabled = true;
    btn.textContent = 'Duplicando…';

    const resp = await AdminAPI.cartaDuplicar(state.cartaDuplicarId, nombreNueva, modificador);

    btn.disabled = false;
    btn.textContent = 'Duplicar carta';

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos duplicar la carta', 'error');
      return;
    }

    AdminUI.toast(
      'Carta duplicada · ' + resp.secciones_copiadas + ' secciones, ' + resp.productos_copiados + ' productos',
      'success'
    );
    cerrarModales();
    await cargarCartas();
  }

  // --- Editar ---

  async function abrirModalEditarCarta(idCarta) {
    AdminUI.setLoading(true);
    const resp = await AdminAPI.cartaObtenerCompleta(idCarta);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos cargar la carta', 'error');
      return;
    }

    state.cartaEditarId = idCarta;
    const c = resp.carta;

    document.getElementById('carta-edit-nombre').value = c.Nombre || '';
    document.getElementById('carta-edit-descripcion').value = c.Descripcion || '';

    const redondeo = String(c.Redondeo || '10');
    const radios = document.querySelectorAll('input[name="carta-edit-redondeo"]');
    let alguno = false;
    radios.forEach(function(r) {
      const matches = String(r.value) === redondeo;
      r.checked = matches;
      if (matches) alguno = true;
    });
    // Fallback de seguridad: si por alguna razón ninguno coincidió, marcar el default ($10)
    if (!alguno) {
      const def = document.querySelector('input[name="carta-edit-redondeo"][value="10"]');
      if (def) def.checked = true;
    }

    document.getElementById('carta-edit-pie-direccion').value = c.Pie_Direccion || '';
    document.getElementById('carta-edit-pie-telefono').value = c.Pie_Telefono || '';
    document.getElementById('carta-edit-pie-mail').value = c.Pie_Mail || '';
    document.getElementById('carta-edit-notas').value = c.Notas || '';

    // Selector de templates
    state.cartaEditarTemplate = c.Template || 'minimalista';
    renderTemplatesGrid();

    document.getElementById('modal-carta-editar').classList.add('is-visible');
  }

  function renderTemplatesGrid() {
    const grid = document.getElementById('templates-grid');
    const templates = CartaRenderer.listarTemplates();
    const activo = state.cartaEditarTemplate;

    let html = '';
    templates.forEach(function(t) {
      const seleccionado = t.id === activo;
      html += `
        <button type="button"
                class="template-card ${seleccionado ? 'is-selected' : ''} template-${t.id}"
                onclick="seleccionarTemplate('${t.id}')">
          <div class="template-preview template-preview-${t.id}">
            <div class="template-preview-title">Aa</div>
            <div class="template-preview-line"></div>
            <div class="template-preview-line short"></div>
          </div>
          <div class="template-info">
            <div class="template-nombre">
              ${AdminUI.escapeHtml(t.nombre)}
              ${t.premium ? '<span class="template-badge-premium">PREMIUM</span>' : ''}
            </div>
            <div class="template-desc">${AdminUI.escapeHtml(t.descripcion)}</div>
          </div>
        </button>
      `;
    });

    grid.innerHTML = html;
  }

  function seleccionarTemplate(idTemplate) {
    state.cartaEditarTemplate = idTemplate;
    renderTemplatesGrid();
  }

  async function confirmarCartaEditar() {
    // Lectura segura del redondeo (fallback a '10' si por algún motivo ninguno está checked)
    const redondeoEl = document.querySelector('input[name="carta-edit-redondeo"]:checked');
    const redondeo = redondeoEl ? redondeoEl.value : '10';

    const cambios = {
      nombre: document.getElementById('carta-edit-nombre').value.trim(),
      descripcion: document.getElementById('carta-edit-descripcion').value.trim(),
      redondeo: redondeo,
      pie_direccion: document.getElementById('carta-edit-pie-direccion').value.trim(),
      pie_telefono: document.getElementById('carta-edit-pie-telefono').value.trim(),
      pie_mail: document.getElementById('carta-edit-pie-mail').value.trim(),
      notas: document.getElementById('carta-edit-notas').value.trim(),
      template: state.cartaEditarTemplate || 'minimalista'
    };

    if (cambios.nombre.length < 2) {
      AdminUI.toast('El nombre debe tener al menos 2 letras', 'error');
      return;
    }

    const btn = document.getElementById('btn-carta-edit-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    const resp = await AdminAPI.cartaActualizar(state.cartaEditarId, cambios);

    btn.disabled = false;
    btn.textContent = 'Guardar cambios';

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos guardar', 'error');
      return;
    }

    AdminUI.toast('Cambios guardados', 'success');
    cerrarModales();
    await cargarCartas();
  }

  // --- Activar ---

  async function activarCarta(idCarta, nombreCarta) {
    const confirmar = await AdminUI.confirm({
      title: '¿Activar esta carta?',
      message: '"' + nombreCarta + '" se activará. Si hay otras cartas activas en la empresa, se desactivarán automáticamente. Solo una carta puede estar activa a la vez.',
      okLabel: 'Activar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    const resp = await AdminAPI.cartaActivar(idCarta);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos activar', 'error');
      return;
    }

    if (resp.otras_desactivadas > 0) {
      AdminUI.toast('Carta activada (' + resp.otras_desactivadas + ' otras desactivadas)', 'success');
    } else {
      AdminUI.toast('Carta activada', 'success');
    }
    await cargarCartas();
  }

  // --- Archivar ---

  async function archivarCarta(idCarta, nombreCarta) {
    const confirmar = await AdminUI.confirm({
      title: '¿Archivar esta carta?',
      message: '"' + nombreCarta + '" se va a archivar (no se borra, queda oculta). Podrás recuperarla manualmente desde la Sheet si lo necesitás.',
      okLabel: 'Archivar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    const resp = await AdminAPI.cartaArchivar(idCarta);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos archivar', 'error');
      return;
    }

    AdminUI.toast('Carta archivada', 'success');
    await cargarCartas();
  }

  // --- Editor (Sesión B: secciones y productos) ---

  async function abrirEditorCarta(idCarta) {
    AdminUI.setLoading(true);
    const resp = await AdminAPI.cartaObtenerCompleta(idCarta);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos cargar la carta', 'error');
      return;
    }

    state.editorContexto = {
      idCarta: idCarta,
      carta: resp.carta,
      secciones: resp.secciones || [],
      stats: resp.stats || { cantidad_secciones: 0, cantidad_productos: 0, productos_disponibles: 0 }
    };

    document.getElementById('editor-titulo').textContent = resp.carta.Nombre;
    document.getElementById('editor-subtitulo').textContent =
      (state.cartasContexto ? state.cartasContexto.nombreLocal + ' · ' + state.cartasContexto.nombreEmpresa : '');

    cambiarTabEditor('contenido');
    AdminUI.mostrarPantalla('screen-editor');
    renderEditor();
  }

  async function recargarEditor() {
    if (!state.editorContexto) return;
    const resp = await AdminAPI.cartaObtenerCompleta(state.editorContexto.idCarta);
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos recargar', 'error');
      return;
    }
    state.editorContexto.carta = resp.carta;
    state.editorContexto.secciones = resp.secciones || [];
    state.editorContexto.stats = resp.stats || {};
    renderEditor();
  }

  function renderEditor() {
    const ctx = state.editorContexto;
    if (!ctx) return;

    // Stats
    document.getElementById('editor-stats').innerHTML = `
      <div class="editor-stat-card">
        <div class="editor-stat-value">${ctx.stats.cantidad_secciones}</div>
        <div class="editor-stat-label">secciones</div>
      </div>
      <div class="editor-stat-card">
        <div class="editor-stat-value">${ctx.stats.cantidad_productos}</div>
        <div class="editor-stat-label">productos</div>
      </div>
      <div class="editor-stat-card">
        <div class="editor-stat-value">${ctx.stats.productos_disponibles}</div>
        <div class="editor-stat-label">disponibles hoy</div>
      </div>
      <div class="editor-stat-card editor-stat-redondeo">
        <div class="editor-stat-value-sm">
          ${ctx.carta.Redondeo === 'sin' ? 'sin' : '$' + ctx.carta.Redondeo}
        </div>
        <div class="editor-stat-label">redondeo</div>
      </div>
    `;

    // Secciones
    const container = document.getElementById('secciones-list');

    if (ctx.secciones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📑</div>
          <div class="empty-state-title">Carta vacía</div>
          <div class="empty-state-detail">
            Empezá creando la primera sección (ej: "Bebidas", "Entradas", "Postres").
          </div>
          <button class="btn btn-primary" onclick="abrirModalSeccionNueva()">+ Crear primera sección</button>
        </div>
      `;
      return;
    }

    let html = '';
    ctx.secciones.forEach(function(sec, idx) {
      const esPrimera = idx === 0;
      const esUltima = idx === ctx.secciones.length - 1;

      html += `
        <div class="seccion-block">
          <div class="seccion-header">
            <div class="seccion-titulo">
              <span class="seccion-nombre">${AdminUI.escapeHtml(sec.Nombre)}</span>
              ${sec.Descripcion ? `<span class="seccion-desc">${AdminUI.escapeHtml(sec.Descripcion)}</span>` : ''}
            </div>
            <div class="seccion-actions">
              <button class="btn-icon btn-icon-sm ${esPrimera ? 'is-disabled' : ''}"
                      onclick="ordenarSeccion('${sec.Id_Seccion}', 'arriba')"
                      title="Subir"
                      ${esPrimera ? 'disabled' : ''}>▲</button>
              <button class="btn-icon btn-icon-sm ${esUltima ? 'is-disabled' : ''}"
                      onclick="ordenarSeccion('${sec.Id_Seccion}', 'abajo')"
                      title="Bajar"
                      ${esUltima ? 'disabled' : ''}>▼</button>
              <button class="btn-icon btn-icon-sm"
                      onclick="abrirModalSeccionEditar('${sec.Id_Seccion}')"
                      title="Editar">✏️</button>
              <button class="btn-icon btn-icon-sm btn-danger-soft"
                      onclick="eliminarSeccion('${sec.Id_Seccion}', '${AdminUI.escapeHtml(sec.Nombre)}', ${sec.productos.length})"
                      title="Eliminar">🗑</button>
            </div>
          </div>

          <div class="productos-list">
      `;

      if (sec.productos.length === 0) {
        html += `
          <div class="seccion-empty">
            Sin productos todavía. <button class="link-btn" onclick="abrirModalProductoNuevo('${sec.Id_Seccion}')">Agregar el primero →</button>
          </div>
        `;
      } else {
        sec.productos.forEach(function(p, pIdx) {
          const esPrimP = pIdx === 0;
          const esUltimP = pIdx === sec.productos.length - 1;
          const disponible = p.Disponible_Hoy;

          // Flags y alergenos
          const flags = [];
          if (p.Etiquetas) {
            if (p.Etiquetas.vegetariano) flags.push('🌱');
            if (p.Etiquetas.sin_tacc) flags.push('🌾');
            if (p.Etiquetas.picante) flags.push('🌶');
            if (p.Etiquetas.alergenos && p.Etiquetas.alergenos.length > 0) {
              flags.push('⚠️ ' + p.Etiquetas.alergenos.join(','));
            }
          }
          const flagsHtml = flags.length > 0 ? '<span class="producto-flags">' + flags.join(' ') + '</span>' : '';

          html += `
            <div class="producto-row ${disponible ? '' : 'is-unavailable'}">
              <div class="producto-toggle">
                <label class="toggle-disponible" title="${disponible ? 'Disponible hoy' : 'Agotado'}">
                  <input type="checkbox" ${disponible ? 'checked' : ''}
                         onchange="toggleDisponible('${p.Id_Producto}', this.checked)">
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="producto-info">
                <div class="producto-nombre">${AdminUI.escapeHtml(p.Nombre)}</div>
                ${p.Descripcion ? `<div class="producto-desc">${AdminUI.escapeHtml(p.Descripcion)}</div>` : ''}
                ${flagsHtml}
              </div>
              <div class="producto-precio">$${formatearPrecio(p.Precio)}</div>
              <div class="producto-actions">
                <button class="btn-icon btn-icon-sm ${esPrimP ? 'is-disabled' : ''}"
                        onclick="ordenarProducto('${p.Id_Producto}', 'arriba')"
                        title="Subir"
                        ${esPrimP ? 'disabled' : ''}>▲</button>
                <button class="btn-icon btn-icon-sm ${esUltimP ? 'is-disabled' : ''}"
                        onclick="ordenarProducto('${p.Id_Producto}', 'abajo')"
                        title="Bajar"
                        ${esUltimP ? 'disabled' : ''}>▼</button>
                <button class="btn-icon btn-icon-sm"
                        onclick="abrirModalProductoEditar('${p.Id_Producto}')"
                        title="Editar">✏️</button>
                <button class="btn-icon btn-icon-sm btn-danger-soft"
                        onclick="eliminarProducto('${p.Id_Producto}', '${AdminUI.escapeHtml(p.Nombre)}')"
                        title="Eliminar">🗑</button>
              </div>
            </div>
          `;
        });
      }

      html += `
            <div class="seccion-add-producto">
              <button class="btn btn-secondary btn-sm" onclick="abrirModalProductoNuevo('${sec.Id_Seccion}')">
                + Agregar producto a "${AdminUI.escapeHtml(sec.Nombre)}"
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function formatearPrecio(valor) {
    const num = parseFloat(valor) || 0;
    // Formato argentino: separador de miles con punto, decimales con coma
    const opciones = { minimumFractionDigits: 0, maximumFractionDigits: 2 };
    return num.toLocaleString('es-AR', opciones);
  }

  function cambiarTabEditor(tab) {
    document.querySelectorAll('.editor-tab').forEach(function(t) {
      t.classList.toggle('is-active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.editor-tab-content').forEach(function(c) {
      c.classList.remove('is-active');
    });
    document.getElementById('editor-tab-' + tab).classList.add('is-active');
  }

  function volverACartas() {
    state.editorContexto = null;
    AdminUI.mostrarPantalla('screen-cartas');
  }


  // ============================================================
  // SECCIONES (modales y CRUD)
  // ============================================================

  function abrirModalSeccionNueva() {
    state.seccionEditarId = null;
    document.getElementById('modal-seccion-titulo').textContent = 'Nueva sección';
    document.getElementById('seccion-nombre').value = '';
    document.getElementById('seccion-descripcion').value = '';
    document.getElementById('btn-seccion-guardar').textContent = 'Crear sección';

    document.getElementById('modal-seccion').classList.add('is-visible');
    setTimeout(function() { document.getElementById('seccion-nombre').focus(); }, 200);
  }

  function abrirModalSeccionEditar(idSeccion) {
    const sec = state.editorContexto.secciones.find(function(s) { return s.Id_Seccion === idSeccion; });
    if (!sec) return;

    state.seccionEditarId = idSeccion;
    document.getElementById('modal-seccion-titulo').textContent = 'Editar sección';
    document.getElementById('seccion-nombre').value = sec.Nombre || '';
    document.getElementById('seccion-descripcion').value = sec.Descripcion || '';
    document.getElementById('btn-seccion-guardar').textContent = 'Guardar cambios';

    document.getElementById('modal-seccion').classList.add('is-visible');
    setTimeout(function() {
      const input = document.getElementById('seccion-nombre');
      input.focus();
      input.select();
    }, 200);
  }

  async function confirmarSeccion() {
    const nombre = document.getElementById('seccion-nombre').value.trim();
    const descripcion = document.getElementById('seccion-descripcion').value.trim();

    if (nombre.length < 1) {
      AdminUI.toast('Pon un nombre a la sección', 'error');
      return;
    }

    const btn = document.getElementById('btn-seccion-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    let resp;
    if (state.seccionEditarId) {
      resp = await AdminAPI.seccionActualizar(state.seccionEditarId, { nombre, descripcion });
    } else {
      resp = await AdminAPI.seccionCrear({
        id_carta: state.editorContexto.idCarta,
        nombre: nombre,
        descripcion: descripcion
      });
    }

    btn.disabled = false;
    btn.textContent = state.seccionEditarId ? 'Guardar cambios' : 'Crear sección';

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos guardar', 'error');
      return;
    }

    AdminUI.toast(state.seccionEditarId ? 'Sección actualizada' : 'Sección creada', 'success');
    cerrarModales();
    await recargarEditor();
  }

  async function ordenarSeccion(idSeccion, direccion) {
    const resp = await AdminAPI.seccionOrdenar(idSeccion, direccion);
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos reordenar', 'error');
      return;
    }
    await recargarEditor();
  }

  async function eliminarSeccion(idSeccion, nombreSeccion, cantidadProductos) {
    let mensaje = '"' + nombreSeccion + '" se va a eliminar.';
    if (cantidadProductos > 0) {
      mensaje += ' Tiene ' + cantidadProductos + ' producto(s) que también serán eliminados.';
    }

    const confirmar = await AdminUI.confirm({
      title: '¿Eliminar sección?',
      message: mensaje,
      okLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    const resp = await AdminAPI.seccionEliminar(idSeccion, cantidadProductos > 0);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos eliminar', 'error');
      return;
    }

    AdminUI.toast('Sección eliminada', 'success');
    await recargarEditor();
  }


  // ============================================================
  // PRODUCTOS (modales y CRUD)
  // ============================================================

  function abrirModalProductoNuevo(idSeccion) {
    state.productoEditarId = null;
    state.productoSeccionId = idSeccion;
    document.getElementById('modal-producto-titulo').textContent = 'Nuevo producto';
    document.getElementById('producto-nombre').value = '';
    document.getElementById('producto-descripcion').value = '';
    document.getElementById('producto-precio').value = '';
    document.getElementById('producto-vegetariano').checked = false;
    document.getElementById('producto-sin-tacc').checked = false;
    document.getElementById('producto-picante').checked = false;
    document.querySelectorAll('[data-alergeno]').forEach(function(cb) { cb.checked = false; });
    document.getElementById('btn-producto-guardar').textContent = 'Crear producto';

    actualizarHintRedondeo();

    document.getElementById('modal-producto').classList.add('is-visible');
    setTimeout(function() { document.getElementById('producto-nombre').focus(); }, 200);
  }

  function abrirModalProductoEditar(idProducto) {
    let producto = null;
    state.editorContexto.secciones.forEach(function(s) {
      const p = s.productos.find(function(x) { return x.Id_Producto === idProducto; });
      if (p) producto = p;
    });
    if (!producto) return;

    state.productoEditarId = idProducto;
    state.productoSeccionId = null;

    document.getElementById('modal-producto-titulo').textContent = 'Editar producto';
    document.getElementById('producto-nombre').value = producto.Nombre || '';
    document.getElementById('producto-descripcion').value = producto.Descripcion || '';
    document.getElementById('producto-precio').value = producto.Precio || 0;

    const et = producto.Etiquetas || {};
    document.getElementById('producto-vegetariano').checked = !!et.vegetariano;
    document.getElementById('producto-sin-tacc').checked = !!et.sin_tacc;
    document.getElementById('producto-picante').checked = !!et.picante;

    const alergenos = et.alergenos || [];
    document.querySelectorAll('[data-alergeno]').forEach(function(cb) {
      cb.checked = alergenos.indexOf(cb.dataset.alergeno) !== -1;
    });

    document.getElementById('btn-producto-guardar').textContent = 'Guardar cambios';
    actualizarHintRedondeo();

    document.getElementById('modal-producto').classList.add('is-visible');
    setTimeout(function() {
      const input = document.getElementById('producto-nombre');
      input.focus();
      input.select();
    }, 200);
  }

  function actualizarHintRedondeo() {
    const carta = state.editorContexto && state.editorContexto.carta;
    if (!carta) return;
    const r = carta.Redondeo || '10';
    const txt = r === 'sin'
      ? 'Esta carta NO redondea precios.'
      : 'Esta carta redondea a múltiplos de $' + r + ' (se aplica en cambios masivos).';
    document.getElementById('producto-precio-hint').textContent = txt;
  }

  async function confirmarProducto() {
    const nombre = document.getElementById('producto-nombre').value.trim();
    const descripcion = document.getElementById('producto-descripcion').value.trim();
    const precio = parseFloat(document.getElementById('producto-precio').value);

    if (nombre.length < 1) {
      AdminUI.toast('Pon un nombre al producto', 'error');
      return;
    }
    if (isNaN(precio) || precio < 0) {
      AdminUI.toast('Pon un precio válido', 'error');
      return;
    }

    const alergenos = [];
    document.querySelectorAll('[data-alergeno]').forEach(function(cb) {
      if (cb.checked) alergenos.push(cb.dataset.alergeno);
    });

    const payload = {
      nombre: nombre,
      descripcion: descripcion,
      precio: precio,
      alergenos: alergenos,
      vegetariano: document.getElementById('producto-vegetariano').checked,
      sin_tacc: document.getElementById('producto-sin-tacc').checked,
      picante: document.getElementById('producto-picante').checked
    };

    const btn = document.getElementById('btn-producto-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    let resp;
    if (state.productoEditarId) {
      resp = await AdminAPI.productoActualizar(state.productoEditarId, payload);
    } else {
      payload.id_seccion = state.productoSeccionId;
      resp = await AdminAPI.productoCrear(payload);
    }

    btn.disabled = false;
    btn.textContent = state.productoEditarId ? 'Guardar cambios' : 'Crear producto';

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos guardar', 'error');
      return;
    }

    AdminUI.toast(state.productoEditarId ? 'Producto actualizado' : 'Producto creado', 'success');
    cerrarModales();
    await recargarEditor();
  }

  async function ordenarProducto(idProducto, direccion) {
    const resp = await AdminAPI.productoOrdenar(idProducto, direccion);
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos reordenar', 'error');
      return;
    }
    await recargarEditor();
  }

  async function toggleDisponible(idProducto, disponible) {
    const resp = await AdminAPI.productoToggleDisponible(idProducto, disponible);
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos cambiar la disponibilidad', 'error');
      // Revertir el checkbox visualmente
      await recargarEditor();
      return;
    }
    // Update silencioso del estado local sin recarga completa
    state.editorContexto.secciones.forEach(function(s) {
      s.productos.forEach(function(p) {
        if (p.Id_Producto === idProducto) {
          p.Disponible_Hoy = resp.disponible_hoy;
        }
      });
    });
    // Actualizar stats sin recargar todo
    let disponibles = 0;
    state.editorContexto.secciones.forEach(function(s) {
      s.productos.forEach(function(p) { if (p.Disponible_Hoy) disponibles++; });
    });
    state.editorContexto.stats.productos_disponibles = disponibles;
    renderEditor();
  }

  async function eliminarProducto(idProducto, nombreProducto) {
    const confirmar = await AdminUI.confirm({
      title: '¿Eliminar producto?',
      message: '"' + nombreProducto + '" se va a eliminar de esta carta.',
      okLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    const resp = await AdminAPI.productoEliminar(idProducto);
    AdminUI.setLoading(false);

    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos eliminar', 'error');
      return;
    }

    AdminUI.toast('Producto eliminado', 'success');
    await recargarEditor();
  }

  // ============================================================
  // VISTA PREVIA DE LA CARTA
  // ============================================================

  function abrirVistaPrevia() {
    const ctx = state.editorContexto;
    if (!ctx) {
      AdminUI.toast('Cargá una carta primero', 'error');
      return;
    }

    // Datos para el renderer
    const datosCarta = {
      carta: ctx.carta,
      secciones: ctx.secciones,
      nombreEmpresa: state.cartasContexto ? state.cartasContexto.nombreEmpresa : '',
      nombreLocal: state.cartasContexto ? state.cartasContexto.nombreLocal : '',
      template: ctx.carta.Template || 'minimalista'
    };

    // Generar HTML
    const html = CartaRenderer.renderizar(datosCarta);

    // Inyectar en iframe
    const iframe = document.getElementById('preview-iframe');
    iframe.srcdoc = html;

    // Subtítulo informativo
    const cantidad = ctx.stats.productos_disponibles;
    const tplName = datosCarta.template;
    document.getElementById('preview-subtitulo').textContent =
      cantidad + ' producto(s) visible(s) · template: ' + tplName;

    // Mostrar modal
    document.getElementById('modal-preview').classList.add('is-visible');
  }

  function cerrarVistaPrevia() {
    document.getElementById('modal-preview').classList.remove('is-visible');
    // Limpiar iframe para liberar memoria
    document.getElementById('preview-iframe').srcdoc = '';
  }

  function cambiarDispositivoPreview(dispositivo) {
    document.querySelectorAll('.preview-device-btn').forEach(function(b) {
      b.classList.toggle('is-active', b.dataset.device === dispositivo);
    });
    const frame = document.getElementById('preview-frame');
    frame.classList.toggle('is-mobile', dispositivo === 'mobile');
    frame.classList.toggle('is-desktop', dispositivo === 'desktop');
  }


  // --- Modales utilitarios ---

  function cerrarModales() {
    document.querySelectorAll('.modal-overlay').forEach(function(m) {
      m.classList.remove('is-visible');
    });
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
    confirmarRegistro,
    volverALoginMail,
    cerrarSesion,
    iniciarWizardEmpresa,
    iniciarWizardLocal,
    abrirEmpresa,
    volverADashboard,
    abrirCartasDelLocal,
    abrirModalCambioCarta,
    confirmarCambioCarta,
    copiarUrlPublica,
    abrirModalCartaNueva,
    confirmarCartaNueva,
    abrirModalDuplicarCarta,
    confirmarCartaDuplicar,
    abrirModalEditarCarta,
    confirmarCartaEditar,
    activarCarta,
    archivarCarta,
    abrirEditorCarta,
    volverACartas,
    cambiarTabEditor,
    abrirModalSeccionNueva,
    abrirModalSeccionEditar,
    confirmarSeccion,
    ordenarSeccion,
    eliminarSeccion,
    abrirModalProductoNuevo,
    abrirModalProductoEditar,
    confirmarProducto,
    ordenarProducto,
    toggleDisponible,
    eliminarProducto,
    abrirVistaPrevia,
    cerrarVistaPrevia,
    cambiarDispositivoPreview,
    seleccionarTemplate,
    cerrarModales
  };

})();


// ============================================================
// FUNCIONES GLOBALES (para handlers inline en HTML)
// ============================================================

function solicitarCodigo(e) { AdminApp.solicitarCodigo(e); }
function verificarCodigo(e) { AdminApp.verificarCodigo(e); }
function confirmarRegistro(e) { AdminApp.confirmarRegistro(e); }
function volverALoginMail() { AdminApp.volverALoginMail(); }
function cerrarSesion() { AdminApp.cerrarSesion(); }
function iniciarWizardEmpresa() { AdminApp.iniciarWizardEmpresa(); }
function abrirEmpresa(idEmpresa) { AdminApp.abrirEmpresa(idEmpresa); }
function cancelarWizard() { Wizard.cancel(); }

// Cartas
function volverADashboard() { AdminApp.volverADashboard(); }
function abrirCartasDelLocal(idLocal, idEmpresa, nombreLocal, nombreEmpresa) {
  AdminApp.abrirCartasDelLocal(idLocal, idEmpresa, nombreLocal, nombreEmpresa);
}
function abrirModalCambioCarta(idLocal, nombreLocal, idCartaActual, nombreCartaActual) {
  AdminApp.abrirModalCambioCarta(idLocal, nombreLocal, idCartaActual, nombreCartaActual);
}
function confirmarCambioCarta() { AdminApp.confirmarCambioCarta(); }
function copiarUrlPublica(url) { AdminApp.copiarUrlPublica(url); }
function abrirModalCartaNueva() { AdminApp.abrirModalCartaNueva(); }
function confirmarCartaNueva() { AdminApp.confirmarCartaNueva(); }
function abrirModalDuplicarCarta(idCarta, nombreCarta) { AdminApp.abrirModalDuplicarCarta(idCarta, nombreCarta); }
function confirmarCartaDuplicar() { AdminApp.confirmarCartaDuplicar(); }
function abrirModalEditarCarta(idCarta) { AdminApp.abrirModalEditarCarta(idCarta); }
function confirmarCartaEditar() { AdminApp.confirmarCartaEditar(); }
function activarCarta(idCarta, nombreCarta) { AdminApp.activarCarta(idCarta, nombreCarta); }
function archivarCarta(idCarta, nombreCarta) { AdminApp.archivarCarta(idCarta, nombreCarta); }
function abrirEditorCarta(idCarta) { AdminApp.abrirEditorCarta(idCarta); }
function cerrarModales() { AdminApp.cerrarModales(); }

// Editor de carta (secciones y productos)
function volverACartas() { AdminApp.volverACartas(); }
function cambiarTabEditor(tab) { AdminApp.cambiarTabEditor(tab); }
function abrirModalSeccionNueva() { AdminApp.abrirModalSeccionNueva(); }
function abrirModalSeccionEditar(id) { AdminApp.abrirModalSeccionEditar(id); }
function confirmarSeccion() { AdminApp.confirmarSeccion(); }
function ordenarSeccion(id, dir) { AdminApp.ordenarSeccion(id, dir); }
function eliminarSeccion(id, nombre, cant) { AdminApp.eliminarSeccion(id, nombre, cant); }
function abrirModalProductoNuevo(idSeccion) { AdminApp.abrirModalProductoNuevo(idSeccion); }
function abrirModalProductoEditar(id) { AdminApp.abrirModalProductoEditar(id); }
function confirmarProducto() { AdminApp.confirmarProducto(); }
function ordenarProducto(id, dir) { AdminApp.ordenarProducto(id, dir); }
function toggleDisponible(id, disponible) { AdminApp.toggleDisponible(id, disponible); }
function eliminarProducto(id, nombre) { AdminApp.eliminarProducto(id, nombre); }

// Vista previa
function abrirVistaPrevia() { AdminApp.abrirVistaPrevia(); }
function cerrarVistaPrevia() { AdminApp.cerrarVistaPrevia(); }
function cambiarDispositivoPreview(d) { AdminApp.cambiarDispositivoPreview(d); }
function seleccionarTemplate(t) { AdminApp.seleccionarTemplate(t); }


// ============================================================
// BOOTSTRAP
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', AdminApp.init);
} else {
  AdminApp.init();
}
