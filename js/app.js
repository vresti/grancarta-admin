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
    // PERF: token de Firebase pre-minteado por el selector (ambito_seleccionar) →
    // lo usamos directo y NOS SALTEAMOS la llamada GAS obtenerTokenFirebase.
    const fbTokenDeURL = urlParams.get('fb');
    if (fbTokenDeURL) state._fbTokenPreMint = fbTokenDeURL;
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

      // PERFORMANCE/UX (13/6): mostramos el loading desde YA, sobre la
      // pantalla del dashboard (aún vacía). Así el usuario NUNCA ve la
      // pantalla de login del admin mientras carga (antes parpadeaba un
      // "segundo login" falso). La puerta ya nos pasó el mail en la URL.
      AdminUI.setLoading(true);
      AdminUI.mostrarPantalla('screen-dashboard');

      // Solo si NO tenemos el mail (caso raro: el mail no vino en la URL),
      // lo pedimos al backend. Con la puerta pasando ?m=, esto casi nunca corre.
      if (!state.mail) {
        const resp = await AdminAPI.obtenerMiSesion();
        if (resp.ok && resp.usuario) {
          state.mail = resp.usuario.mail || resp.usuario.Mail || '';
          state.usuarioLogueado = resp.usuario;
          localStorage.setItem('admin_mail', state.mail);
        }
      }

      // Tendé la identidad Firebase ahora que hay sesión (el admin no tiene login
      // propio: llega ya logueado desde app.grancarta.com). No bloquea el dashboard.
      iniciarSesionFirebase();

      await cargarDashboard();
    } else {
      // PUERTA ÚNICA: admin NO tiene login propio.
      // Sin token = ya no tenés sesión acá. Por la regla del logout voluntario,
      // vas al LANDING (no al login). El caso "sesión vencida en pleno uso" lo
      // agarra antes cerrarSesionForzado (que sí va al login para re-entrar).
      window.location.replace('https://grancarta.com');
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

        // Resetear: arranca en paso 1 (confirmar mail)
        document.getElementById('registro-paso-confirmar').style.display = 'block';
        document.getElementById('registro-paso-form').style.display = 'none';

        AdminUI.setLoginStatus('login-status-registro', '');
        AdminUI.mostrarPantalla('screen-registro');
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
  // AUTO-REGISTRO (patrón LegalPagaré con confirmación previa)
  // ============================================================

  /**
   * Cuando el usuario llega a la pantalla de registro, primero
   * confirma que el mail está bien escrito. Si dice "sí, está bien",
   * se llama a esta función para mostrar el form de nombre.
   */
  function mostrarFormRegistro() {
    document.getElementById('registro-paso-confirmar').style.display = 'none';
    document.getElementById('registro-paso-form').style.display = 'block';

    // Limpiar form y enfocar nombre
    document.getElementById('input-nombre').value = '';
    document.getElementById('input-apellido').value = '';
    AdminUI.setLoginStatus('login-status-registro', '');

    setTimeout(function() {
      const i = document.getElementById('input-nombre');
      if (i) i.focus();
    }, 100);
  }

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

    // Tendé la identidad Firebase en segundo plano (no bloquea el dashboard).
    // Si falla, el admin sigue funcionando igual.
    iniciarSesionFirebase();

    AdminUI.setLoginStatus('login-status-2', '¡Bienvenido!', 'success');

    setTimeout(() => cargarDashboard(), 600);
  }

  // Identidad Firebase para el dueño (extra, NO bloqueante). Pide el custom token
  // al backend y hace signInWithCustomToken, dejando al navegador listo para escribir
  // Firestore. Si algo falla, se loguea un aviso y el admin sigue 100% normal.
  function iniciarSesionFirebase() {
    // Guardamos la promesa para poder ESPERARLA antes de leer/escribir Firestore
    // (el dashboard lee publicaciones de FS y arranca por setTimeout → carrera).
    state._fsAuthPromise = (async function () {
      try {
        if (typeof firebase === 'undefined' || !firebase.auth) return false;
        if (firebase.auth().currentUser) return true;

        // PERF: si el selector ya nos pasó el token de Firebase pre-minteado
        // (?fb=), lo usamos DIRECTO y nos salteamos la llamada GAS
        // obtenerTokenFirebase (ahorra ~2-3s). Si falla, caemos al camino GAS.
        const preMint = state._fbTokenPreMint || null;
        state._fbTokenPreMint = null;  // usar una sola vez
        if (preMint) {
          try {
            await firebase.auth().signInWithCustomToken(preMint);
            console.log('[Firebase] sesion iniciada (token pre-minteado):', firebase.auth().currentUser && firebase.auth().currentUser.uid);
            return true;
          } catch (ePre) {
            console.warn('[Firebase] token pre-minteado no sirvió, pido uno nuevo:', ePre && ePre.message);
            // sigue al fallback GAS de abajo
          }
        }

        const resp = await AdminAPI.obtenerTokenFirebase();
        if (!resp || !resp.ok || !resp.firebase_token) {
          console.warn('[Firebase] no se obtuvo token:', resp && resp.error);
          return false;
        }
        await firebase.auth().signInWithCustomToken(resp.firebase_token);
        const u = firebase.auth().currentUser;
        console.log('[Firebase] sesion iniciada:', u && u.uid);
        return true;
      } catch (e) {
        console.warn('[Firebase] no se pudo iniciar sesion (el admin sigue normal):', e && e.message);
        return false;
      }
    })();
    return state._fsAuthPromise;
  }

  // Espera a que la sesión Firebase esté lista (idempotente). Devuelve true/false.
  // Si nadie la arrancó todavía, la arranca. No rompe el admin si falla.
  async function asegurarSesionFirebase() {
    if (firebase && firebase.auth && firebase.auth().currentUser) return true;
    if (!state._fsAuthPromise) iniciarSesionFirebase();
    try { return await state._fsAuthPromise; } catch (e) { return false; }
  }

  function volverALoginMail() {
    document.getElementById('input-code').value = '';
    AdminUI.setLoginStatus('login-status-2', '');
    AdminUI.mostrarPantalla('screen-login-mail');
  }

  async function cerrarSesion() {
    const confirmar = await AdminUI.confirm({
      title: '¿Cerrar sesión?',
      message: 'Vas a salir de GranCarta. Para volver a entrar tendrás que ingresar de nuevo.',
      okLabel: 'Cerrar sesión',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    try {
      await AdminAPI.cerrarSesion();
    } catch (e) {}

    // LOGOUT REAL (13/6): borra TODO el contexto, también el de la puerta
    // (app_jwt/app_mail), para que "cerrar sesión" SALGA de verdad y NO
    // deje al usuario en el selector. Una acción: salís.
    localStorage.removeItem('admin_jwt');
    localStorage.removeItem('admin_mail');
    localStorage.removeItem('app_jwt');
    localStorage.removeItem('app_mail');
    state.jwt = null;
    state.mail = null;
    state.estructura = null;
    AdminUI.setLoading(false);

    // Afuera de la app: a la landing pública (NO al login/2FA, NO al selector)
    window.location.href = 'https://grancarta.com';
  }

  // VOLVER A EMPRESAS (13/6): "un paso atrás" para cambiar de empresa.
  // Mantiene la sesión (NO borra app_jwt) y vuelve al selector de la puerta.
  // Si el usuario tiene UNA sola empresa, no hay a dónde cambiar → modal polite.
  async function volverAEmpresas() {
    const empresas = (state.estructura && state.estructura.empresas) || [];

    if (empresas.length <= 1) {
      const salir = await AdminUI.confirm({
        title: 'Tenés una sola empresa',
        message: 'Por ahora estás trabajando en tu única empresa, así que no hay otra a la cual cambiar. Si querés, podés cerrar sesión.',
        okLabel: 'Cerrar sesión',
        cancelLabel: 'Seguir acá'
      });
      if (salir) {
        cerrarSesion();
      }
      return;
    }

    // Tiene varias: vuelve al selector SIN cerrar sesión (mantiene app_jwt).
    // Limpiamos solo el contexto del admin para que la próxima entrada
    // tome el ámbito nuevo limpio.
    localStorage.removeItem('admin_jwt');
    localStorage.removeItem('admin_mail');
    window.location.href = 'https://app.grancarta.com';
  }


  // ============================================================
  // DASHBOARD
  // ============================================================

  async function cargarDashboard() {
    AdminUI.setLoading(true);
    AdminUI.mostrarPantalla('screen-dashboard');

    // ════════════════════════════════════════════════════════════════════
    // FS-ONLY (Etapa 2, 7/7): el dashboard del admin se arma 100% desde
    // Firestore (armarDashboardFS). El fallback GAS (dashboard_completo) se
    // retiró tras el soak (bitácora 049): ningún camino vivo lo llamaba.
    // Acá SIEMPRE hay empresa en el token — quien no eligió empresa queda en
    // el selector de app.grancarta.com y no llega hasta este punto.
    // ════════════════════════════════════════════════════════════════════
    state.idEmpresaActiva = _idEmpresaDelToken();
    if (!state.idEmpresaActiva) {
      // Estado anómalo (app.grancarta.com garantiza la empresa en el token):
      // volvemos a app a re-elegir ámbito en vez de quedar sin datos.
      AdminUI.setLoading(false);
      cerrarSesionForzado();
      return;
    }

    try {
      const fsOk = await asegurarSesionFirebase();
      if (!fsOk || !window.GCFirestore || !window.GCFirestore.armarDashboardFS) {
        throw new Error('sesión Firestore no disponible');
      }
      const d = await window.GCFirestore.armarDashboardFS(state.idEmpresaActiva);

      state.estructura = { empresas: [d.empresa], locales: d.locales };
      state.esAdmin = !!d.es_admin;
      state.cartasPorEmpresa = {};   // vacío a propósito: el render cae a estructura.locales (FS)
      state.publicacionesPorEmpresa = {};
      state.cartasCatalogoPorEmpresa = {};
      state.publicacionesPorEmpresa[d.empresa.Id_Empresa] = d.publicaciones.por_local || {};
      state.cartasCatalogoPorEmpresa[d.empresa.Id_Empresa] = d.publicaciones.cartas_catalogo || [];

      const btnSis = document.getElementById('btn-panel-sistema');
      if (btnSis) btnSis.style.display = state.esAdmin ? 'inline-flex' : 'none';
      const btnFab = document.getElementById('btn-fabrica');
      if (btnFab) btnFab.style.display = state.esAdmin ? 'inline-flex' : 'none';

      AdminUI.setLoading(false);
      renderDashboard();
      console.log('[FS] dashboard armado desde Firestore (empresa ' + state.idEmpresaActiva + ').');
    } catch (err) {
      // El fallback GAS se retiró (bitácora 049): sin red a GAS. Mostramos un
      // error propio y dejamos reintentar. (En todo el soak FS nunca falló.)
      AdminUI.setLoading(false);
      console.error('[FS] no se pudo armar el dashboard desde Firestore:', err && err.message);
      AdminUI.toast('No pudimos cargar el panel. Reintentá en unos segundos.', 'error');
    }
  }

  function cerrarSesionForzado() {
    localStorage.removeItem('admin_jwt');
    localStorage.removeItem('admin_mail');
    window.location.href = 'https://app.grancarta.com';
  }

  // Lee id_empresa_activa del payload del token contextual (solo lectura;
  // el backend valida la firma en cada llamada). Si no hay o falla, null.
  function _idEmpresaDelToken() {
    try {
      const jwt = localStorage.getItem('admin_jwt');
      if (!jwt) return null;
      let b64 = jwt.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const payload = JSON.parse(atob(b64));
      return payload.id_empresa_activa || null;
    } catch (e) {
      return null;
    }
  }

  function renderDashboard() {
    // Empresa activa (la elegida en app). Fallback a la primera si el token
    // no trae scope, para no romper nunca.
    const empresas = state.estructura.empresas || [];
    let activa = null;
    if (state.idEmpresaActiva) {
      activa = empresas.find(function(e) { return e.Id_Empresa === state.idEmpresaActiva; }) || null;
    }
    if (!activa) activa = empresas[0] || null;

    // Barra: nombre de la empresa + CUIT. Nada más.
    const nombreEl = document.getElementById('dash-empresa-nombre');
    const cuitEl = document.getElementById('dash-account-info');
    if (nombreEl) nombreEl.textContent = activa ? (activa.Nombre_Comercial || 'Empresa') : 'GranCarta';
    if (cuitEl) cuitEl.textContent = activa ? (activa.CUIT || '') : '';

    // Sucursales de esa empresa
    renderEmpresas();
  }

  function renderEmpresas() {
    // Scope a la empresa activa (la elegida en app). Si por algún motivo el
    // token no trae scope, caemos al comportamiento anterior (todas), para
    // no romper nunca.
    const todasEmpresas = state.estructura.empresas || [];
    let empresas = todasEmpresas;
    if (state.idEmpresaActiva) {
      const _filtradas = todasEmpresas.filter(function(e) { return e.Id_Empresa === state.idEmpresaActiva; });
      if (_filtradas.length > 0) empresas = _filtradas;
    }
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
      const countElVacio = document.getElementById('dash-sucursales-count');
      if (countElVacio) countElVacio.textContent = '';
      return;
    }

    let html = '';
    let totalLocales = 0;
    empresas.forEach(function(e) {
      const datosEmp = cartasPorEmpresa[e.Id_Empresa];
      // Si tenemos datos enriquecidos, los usamos. Si no, fallback a los planos.
      const localesDeEmpresa = datosEmp
        ? datosEmp.locales
        : locales.filter(function(l) { return l.Id_Empresa === e.Id_Empresa; });
      const cartasDisponibles = datosEmp ? datosEmp.cartas_disponibles : [];
      totalLocales += localesDeEmpresa.length;

      html += `
        <div class="empresa-block">
          <div class="empresa-block-header">
            <div class="empresa-block-info">
              <div class="empresa-block-name"><span class="empresa-block-label">Empresa:</span> ${AdminUI.escapeHtml(e.Nombre_Comercial)}</div>
            </div>
            <div class="empresa-block-actions">
              <button class="btn btn-secondary btn-sm" onclick="abrirCartasEmpresa('${e.Id_Empresa}', '${AdminUI.escapeHtml(e.Nombre_Comercial)}')">
                📋 Cartas
              </button>
              <button class="btn btn-secondary btn-sm" onclick="abrirCatalogo('${e.Id_Empresa}')">
                📖 Catálogo
              </button>
              <button class="btn btn-secondary btn-sm" onclick="abrirEquipo('${e.Id_Empresa}')">
                👥 Equipo
              </button>
            </div>
          </div>
      `;

      if (localesDeEmpresa.length === 0) {
        html += `
          <div class="empresa-block-empty">
            <span>📍 Todavía no tenés sucursales.</span>
            <button class="btn btn-primary btn-sm" onclick="nuevaSucursal('${e.Id_Empresa}')">+ Crear la primera sucursal</button>
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

    // Contador de sucursales al lado del título "Sucursales"
    const countEl = document.getElementById('dash-sucursales-count');
    if (countEl) {
      countEl.textContent = totalLocales > 0
        ? ' · ' + totalLocales + ' ' + (totalLocales === 1 ? 'local' : 'locales')
        : '';
    }
  }

  function renderLocalCard(l, e, cartasDisponibles) {
    const nombreEmpresa = e.Nombre_Comercial;
    const direccion = l.Direccion || 'Sin dirección';
    const ciudad = l.Ciudad || '';

    // ============================================================
    // BLOQUE NUEVO (modelo D): listar TODAS las publicaciones del local
    // Una publicación = una carta + audience_slug = una URL pública sirviendo.
    // ============================================================
    const pubsDeEmpresa = state.publicacionesPorEmpresa && state.publicacionesPorEmpresa[l.Id_Empresa];
    const publicacionesDelLocal = (pubsDeEmpresa && pubsDeEmpresa[l.Id_Local]) || [];

    // Catálogo de cartas standby de la empresa (A2.2)
    const catalogoCartas = (state.cartasCatalogoPorEmpresa && state.cartasCatalogoPorEmpresa[l.Id_Empresa]) || [];

    // Orden: default primero, después por audience_slug alfabético
    publicacionesDelLocal.sort(function(a, b) {
      if (a.Es_Default && !b.Es_Default) return -1;
      if (!a.Es_Default && b.Es_Default) return 1;
      return (a.Audience_Slug || '').localeCompare(b.Audience_Slug || '');
    });

    let bloquePublicacionesHtml = '';
    if (publicacionesDelLocal.length > 0) {
      const tarjetas = publicacionesDelLocal.map(function(pub) {
        const esDefault = pub.Es_Default === true;
        const audienceSlug = pub.Audience_Slug || '';
        const audienceKey = audienceSlug || 'default';

        // Nombre del espacio: la default es "Principal"; el resto, el slug capitalizado.
        const espacioNombre = esDefault
          ? 'Principal'
          : (audienceSlug.charAt(0).toUpperCase() + audienceSlug.slice(1));

        // Badge identificador del espacio
        const badge = esDefault
          ? '<span class="pub-badge pub-badge-default">Espacio: ' + AdminUI.escapeHtml(espacioNombre) + '</span>'
          : '<span class="pub-badge pub-badge-audience">Espacio: ' + AdminUI.escapeHtml(espacioNombre) + '</span>';

        // Nombre para QR/PDF (sufijo audience cuando aplica)
        const nombreParaArchivo = audienceSlug
          ? (l.Nombre || '') + ' · ' + audienceSlug.charAt(0).toUpperCase() + audienceSlug.slice(1)
          : (l.Nombre || '');

        // Cada publicación tiene su propia URL (la default termina en el local,
        // las otras agregan /audience al final)
        const urlPub = pub.url_publica || '';

        // ─── Selector "Cambiar carta de este canal" (A2.2) ───
        // Muestra todas las cartas del catálogo EXCEPTO la que ya está sirviéndose
        // en este canal. Si la carta está publicada en OTRO canal, lo indicamos.
        const cartasParaSwap = catalogoCartas.filter(function(c) {
          return c.Id_Carta !== pub.Id_Carta;
        });

        let bloqueSwapHtml = '';
        if (cartasParaSwap.length > 0) {
          const selectId = 'swap-select-' + AdminUI.escapeHtml(l.Id_Local) + '-' + AdminUI.escapeHtml(audienceKey);
          const opciones = cartasParaSwap.map(function(c) {
            const indicador = c.esta_publicada ? ' (📤 publicada en otro canal)' : '';
            return '<option value="' + AdminUI.escapeHtml(c.Id_Carta) + '" data-nombre="' + AdminUI.escapeHtml(c.Nombre) + '">'
                 + AdminUI.escapeHtml(c.Nombre) + indicador + '</option>';
          }).join('');

          bloqueSwapHtml = `
            <div class="publicacion-swap-row">
              <span class="publicacion-swap-label">Cambiar a:</span>
              <select class="publicacion-swap-select" id="${selectId}">
                <option value="">Seleccionar la carta</option>
                ${opciones}
              </select>
              <button class="btn btn-secondary btn-sm publicacion-swap-btn"
                      onclick="confirmarSwapPublicacion('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(audienceSlug)}', '${AdminUI.escapeHtml(pub.Id_Carta)}', '${AdminUI.escapeHtml(pub.carta_nombre || '')}', '${selectId}')">
                Cambiar →
              </button>
            </div>
          `;
        } else {
          // No hay otras cartas para swap
          bloqueSwapHtml = `
            <div class="publicacion-swap-row publicacion-swap-empty">
              <small>📭 No hay otras cartas "listas para publicar" en el catálogo. Creá una para poder cambiar.</small>
            </div>
          `;
        }

        return `
          <div class="publicacion-card${esDefault ? ' publicacion-default' : ''}">
            <div class="publicacion-header">
              ${badge}
            </div>
            <div class="publicacion-carta-activa">
              <span class="publicacion-carta-activa-label">Carta activa:</span>
              <span class="publicacion-carta-nombre">${AdminUI.escapeHtml(pub.carta_nombre || '(sin nombre)')}</span>
              ${pub.carta_template ? '<span class="local-carta-template-tag">' + AdminUI.escapeHtml(pub.carta_template) + '</span>' : ''}
            </div>
            ${urlPub ? `
              <div class="publicacion-url-row">
                <span class="local-url-label">🌐</span>
                <code class="local-url-value">${AdminUI.escapeHtml(urlPub)}</code>
                <button class="btn-icon-mini" onclick="descargarPdfPublicacion('${AdminUI.escapeHtml(urlPub)}', '${AdminUI.escapeHtml(nombreParaArchivo)}')" title="Descargar carta en PDF">
                  📄
                </button>
                <button class="btn-icon-mini" onclick="descargarQrLocal('${AdminUI.escapeHtml(urlPub)}', '${AdminUI.escapeHtml(nombreParaArchivo)}')" title="Descargar QR para imprimir">
                  🔲
                </button>
                <button class="btn-icon-mini" onclick="copiarUrlPublica('${AdminUI.escapeHtml(urlPub)}')" title="Copiar URL">
                  📋
                </button>
                <a class="btn-icon-mini" href="${AdminUI.escapeHtml(urlPub)}" target="_blank" rel="noopener" title="Abrir en nueva pestaña">
                  ↗
                </a>
              </div>
            ` : ''}
            ${bloqueSwapHtml}
            <div class="publicacion-sectores-row" style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);">
              <button class="btn btn-secondary btn-sm"
                      onclick="abrirSectoresMesas('${AdminUI.escapeHtml(l.Id_Local)}','${AdminUI.escapeHtml(audienceSlug)}','${AdminUI.escapeHtml(pub.Nombre_Canal || '')}','${AdminUI.escapeHtml(l.Nombre || '')}','${AdminUI.escapeHtml(nombreEmpresa)}','${AdminUI.escapeHtml(pub.Id_Publicacion || '')}')">
                🪑 Sectores y mesas
              </button>
            </div>
          </div>
        `;
      }).join('');

      bloquePublicacionesHtml = `
        <div class="publicaciones-section">
          <div class="publicaciones-list">
            ${tarjetas}
          </div>
        </div>
      `;
    }

    // ============================================================
    // Bloque "Estado del local" (solo aparece en casos especiales)
    // Cuando hay publicaciones activas, la gestión se hace dentro de
    // cada publicacion-card con el dropdown "Cambiar a:". Este bloque
    // solo se activa para 2 casos edge:
    //   1. La empresa no tiene NINGUNA carta creada todavía
    //   2. Hay cartas pero el local no tiene publicación viva (raro)
    // ============================================================
    let bloqueCartaHtml = '';
    const hayPublicaciones = publicacionesDelLocal.length > 0;

    if (!hayPublicaciones) {
      if (catalogoCartas.length === 0) {
        // Empresa sin cartas todavía
        bloqueCartaHtml = `
          <div class="local-carta-box local-carta-empty">
            <div class="local-carta-empty-icon">📋</div>
            <div class="local-carta-empty-text">
              Esta empresa todavía no tiene cartas "listas para publicar".
              <br><small>Creá la primera carta y volvé acá para asignarla a un canal.</small>
            </div>
            <button class="btn btn-secondary btn-sm"
                    onclick="abrirCartasEmpresa('${AdminUI.escapeHtml(l.Id_Empresa)}', '${AdminUI.escapeHtml(nombreEmpresa)}')">
              + Crear carta
            </button>
          </div>
        `;
      } else {
        // Hay cartas en el catálogo pero el local todavía no tiene publicación
        // → ofrecer activar la primera (será default automáticamente)
        const opcionesActivar = catalogoCartas.map(function(c) {
          return '<option value="' + AdminUI.escapeHtml(c.Id_Carta) + '">' + AdminUI.escapeHtml(c.Nombre) + '</option>';
        }).join('');

        const selectIdInicial = 'swap-select-' + AdminUI.escapeHtml(l.Id_Local) + '-default';

        bloqueCartaHtml = `
          <div class="local-carta-box local-carta-needs-assign">
            <div class="local-carta-warning">⚠️ Este local todavía no tiene ninguna carta publicada</div>
            <div class="local-carta-select-row">
              <select class="local-carta-select" id="${selectIdInicial}">
                <option value="">— Elegí una carta —</option>
                ${opcionesActivar}
              </select>
              <button class="btn btn-primary btn-sm"
                      onclick="confirmarSwapPublicacion('${AdminUI.escapeHtml(l.Id_Local)}', '', '', '', '${selectIdInicial}')">
                Publicar →
              </button>
            </div>
          </div>
        `;
      }
    }

    // Bloque WhatsApp interactivo en carta web
    // Banner amarillo si NO está configurado (educativo + comercial).
    // Estado neutro si SÍ está configurado.
    const whatsappCargado = l.WhatsApp && String(l.WhatsApp).trim();
    let whatsappHtml = '';
    if (whatsappCargado) {
      whatsappHtml = `
        <div class="local-ws-row local-ws-ok">
          <span>💬 WhatsApp: <strong>+${AdminUI.escapeHtml(l.WhatsApp)}</strong></span>
          <button class="btn-icon-mini" onclick="abrirModalWhatsApp('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(l.Nombre)}')" title="Editar WhatsApp">
            ✏️
          </button>
        </div>
      `;
    } else {
      whatsappHtml = `
        <div class="local-ws-row local-ws-missing">
          <div class="local-ws-icon">⚠️</div>
          <div class="local-ws-text">
            <strong>Cargá tu WhatsApp</strong> para activar el botón verde en tu carta web.
            <br><small>El cliente toca y te escribe directo desde el celu.</small>
          </div>
          <button class="btn btn-primary btn-sm"
                  onclick="abrirModalWhatsApp('${AdminUI.escapeHtml(l.Id_Local)}', '${AdminUI.escapeHtml(l.Nombre)}')">
            💬 Configurar
          </button>
        </div>
      `;
    }

    return `
      <div class="local-card local-card-expanded">
        <div class="local-card-header">
          <div class="local-card-info">
            <div class="local-card-name">📍 ${AdminUI.escapeHtml(l.Nombre)}</div>
            <div class="local-card-meta">
              ${AdminUI.escapeHtml(direccion)} ${ciudad ? '· ' + AdminUI.escapeHtml(ciudad) : ''}
            </div>
          </div>
          <div class="local-card-pubs-count">
            📺 Publicaciones activas: <strong>${publicacionesDelLocal.length}</strong>
          </div>
        </div>
        ${bloquePublicacionesHtml}
        ${bloqueCartaHtml}
        ${whatsappHtml}
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
  // SWAP DE CARTA EN CANAL (A2.2 — modelo canal+standby)
  // ============================================================
  // Flujo:
  //   1. Leo elige una carta del dropdown de una publicación
  //   2. Click "Cambiar →" → confirmarSwapPublicacion(...)
  //      → confirmación inline mínima [Sí] [No]
  //   3. Si confirma → ejecutarSwapPublicacion(...)
  //      → llama AdminAPI.publicacionActivarCarta()
  //      → recarga el dashboard
  //
  // La carta vieja vuelve automáticamente al catálogo "lista para
  // publicar". El canal NUNCA queda sin carta.

  // Resuelve el Id_Empresa de un local desde la estructura cargada.
  function _empresaDeLocal(idLocal) {
    const locales = (state.estructura && state.estructura.locales) || [];
    const l = locales.find(function (x) { return x.Id_Local === idLocal; });
    return l ? l.Id_Empresa : null;
  }

  function confirmarSwapPublicacion(idLocal, audienceSlug, idCartaActual, nombreCartaActual, selectId) {
    const select = document.getElementById(selectId);
    if (!select) {
      AdminUI.toast('No pudimos leer la selección. Reintentá.', 'error');
      return;
    }

    const idCartaNueva = select.value;
    if (!idCartaNueva) {
      AdminUI.toast('Elegí una carta del catálogo primero', 'warn');
      return;
    }

    // Sacar nombre de la opción seleccionada (limpio, sin sufijos)
    const opcionSeleccionada = select.options[select.selectedIndex];
    const nombreCartaNueva = opcionSeleccionada.getAttribute('data-nombre')
                          || opcionSeleccionada.textContent.replace(/\s*\(.*\)\s*$/, '');

    // Construir mensaje según el caso
    const audienceLabel = audienceSlug ? '"' + audienceSlug + '"' : 'default';
    let mensaje;
    if (idCartaActual) {
      // Caso swap (canal ya tenía carta)
      mensaje = 'Estás por publicar "' + nombreCartaNueva + '" en el canal ' + audienceLabel + '.\n\n' +
                '"' + nombreCartaActual + '" volverá al catálogo "lista para publicar".\n\n' +
                '¿Continuar?';
    } else {
      // Caso publicación nueva (canal nuevo o local vacío)
      mensaje = 'Estás por publicar "' + nombreCartaNueva + '" en el canal ' + audienceLabel + '.\n\n' +
                'Esta será la primera carta de este canal.\n\n' +
                '¿Continuar?';
    }

    if (!confirm(mensaje)) {
      return;
    }

    // Confirmado: ejecutar swap
    ejecutarSwapPublicacion(idLocal, audienceSlug, idCartaNueva, nombreCartaNueva);
  }

  async function ejecutarSwapPublicacion(idLocal, audienceSlug, idCartaNueva, nombreCartaNueva) {
    AdminUI.setLoading(true, 'Publicando carta…');

    const idEmpresa = _empresaDeLocal(idLocal);
    let resp;
    try {
      await asegurarSesionFirebase();
      resp = await window.GCFirestore.activarCartaEnCanal(idEmpresa, idLocal, audienceSlug, idCartaNueva);
    } catch (e) {
      AdminUI.setLoading(false);
      AdminUI.toast(e && e.message ? e.message : 'No pudimos publicar la carta', 'error');
      return;
    }

    // Mensaje según el caso
    let toastMsg;
    if (resp.canal_creado) {
      toastMsg = '✓ "' + nombreCartaNueva + '" publicada (canal creado)';
    } else if (resp.sin_cambios) {
      toastMsg = 'Esta carta ya estaba publicada en este canal';
    } else {
      toastMsg = '✓ "' + nombreCartaNueva + '" publicada. La anterior volvió al catálogo.';
    }

    AdminUI.toast(toastMsg, 'success');

    // Recargar dashboard para reflejar el swap
    await cargarDashboard();
  }


  // ============================================================
  // PUBLICAR CARTA DESDE EL EDITOR (A2.2 — día 10)
  // ============================================================
  // El botón "📤 Publicar ahora" del editor abre un modal que muestra:
  //   · La carta que se va a publicar
  //   · Los canales DISPONIBLES de los locales de la empresa
  //     (un canal por cada publicación activa existente
  //      + opción "Abrir canal nuevo" — para A2.3 / fase 3)
  //
  // Al elegir un canal y confirmar, se dispara publicacion_activar_carta
  // (mismo handler que el swap del dashboard). La carta vieja del canal
  // vuelve al catálogo "lista para publicar".

  function actualizarBotonPublicarEnEditor(carta) {
    const btn = document.getElementById('btn-editor-publicar');
    if (!btn) return;

    // Solo se puede publicar una carta "lista para publicar" (Estado='activa')
    if (carta && carta.Estado === 'activa') {
      btn.style.display = '';
      btn.disabled = false;
      btn.title = 'Publicar esta carta en un canal de un local';
    } else if (carta && carta.Estado === 'borrador') {
      btn.style.display = '';
      btn.disabled = true;
      btn.title = 'Primero marcá la carta como "lista para publicar"';
    } else {
      btn.style.display = 'none';
    }
  }

  function abrirModalPublicarAhora() {
    const ctx = state.editorContexto;
    if (!ctx || !ctx.carta) {
      AdminUI.toast('No hay carta cargada en el editor', 'error');
      return;
    }

    const carta = ctx.carta;
    if (carta.Estado !== 'activa') {
      AdminUI.toast('La carta debe estar "lista para publicar" antes de publicarla', 'warn');
      return;
    }

    // Calcular canales disponibles: una entrada por cada publicación activa
    // existente en los locales de esta empresa.
    const idEmpresa = carta.Id_Empresa;
    const pubsDeEmpresa = (state.publicacionesPorEmpresa && state.publicacionesPorEmpresa[idEmpresa]) || {};
    const locales = (state.estructura && state.estructura.locales) || [];
    const localesDeEmpresa = locales.filter(function(l) { return l.Id_Empresa === idEmpresa; });

    // Construir lista plana de canales agrupada por local
    const canalesPosibles = [];

    localesDeEmpresa.forEach(function(local) {
      const pubsDelLocal = pubsDeEmpresa[local.Id_Local] || [];
      pubsDelLocal.forEach(function(pub) {
        const yaTieneEstaCarta = pub.Id_Carta === carta.Id_Carta;
        canalesPosibles.push({
          id_local:           local.Id_Local,
          nombre_local:       local.Nombre,
          audience_slug:      pub.Audience_Slug || '',
          es_default:         pub.Es_Default === true,
          carta_actual:       pub.carta_nombre || '(sin nombre)',
          url_publica:        pub.url_publica || '',
          ya_tiene_esta_carta: yaTieneEstaCarta
        });
      });
    });

    // Guardar contexto para confirmarPublicarAhora
    state.publicarAhoraContexto = {
      idCarta:           carta.Id_Carta,
      nombreCarta:       carta.Nombre,
      template:          carta.Template,
      canalesPosibles:   canalesPosibles,
      seleccionado:      null
    };

    // Render del modal
    document.getElementById('publicar-carta-nombre').textContent = carta.Nombre;
    document.getElementById('publicar-carta-template').textContent = carta.Template || '';

    const lista = document.getElementById('publicar-canales-list');

    if (canalesPosibles.length === 0) {
      lista.innerHTML = `
        <div class="publicar-canales-empty">
          <div class="publicar-canales-empty-icon">📭</div>
          <div>
            Esta empresa todavía no tiene canales activos.
            <br><small>Andá al dashboard, abrí un local y publicá esta carta desde ahí.</small>
          </div>
        </div>
      `;
      document.getElementById('btn-confirmar-publicar').disabled = true;
    } else {
      lista.innerHTML = canalesPosibles.map(function(canal, idx) {
        const audienceLabel = canal.audience_slug
          ? '📍 ' + AdminUI.escapeHtml(canal.audience_slug)
          : '⭐ default';

        const reemplazaHtml = canal.ya_tiene_esta_carta
          ? '<div class="publicar-canal-info publicar-canal-already">✓ Esta carta YA está publicada acá</div>'
          : '<div class="publicar-canal-info">⚠ Reemplazará: <strong>' + AdminUI.escapeHtml(canal.carta_actual) + '</strong></div>';

        return `
          <label class="publicar-canal-item${canal.ya_tiene_esta_carta ? ' is-disabled' : ''}">
            <input type="radio" name="publicar-canal" value="${idx}"
                   ${canal.ya_tiene_esta_carta ? 'disabled' : ''}
                   onchange="seleccionarCanalParaPublicar(${idx})">
            <div class="publicar-canal-content">
              <div class="publicar-canal-local">📍 ${AdminUI.escapeHtml(canal.nombre_local)}</div>
              <div class="publicar-canal-audience">Canal ${audienceLabel}</div>
              ${canal.url_publica ? '<div class="publicar-canal-url"><code>' + AdminUI.escapeHtml(canal.url_publica) + '</code></div>' : ''}
              ${reemplazaHtml}
            </div>
          </label>
        `;
      }).join('');
      document.getElementById('btn-confirmar-publicar').disabled = true;  // Hasta que elija
    }

    // Mostrar el modal
    document.getElementById('modal-publicar-ahora').classList.add('is-visible');
  }

  function seleccionarCanalParaPublicar(idx) {
    if (!state.publicarAhoraContexto) return;
    state.publicarAhoraContexto.seleccionado = idx;
    document.getElementById('btn-confirmar-publicar').disabled = false;
  }

  function cerrarModalPublicar() {
    document.getElementById('modal-publicar-ahora').classList.remove('is-visible');
    state.publicarAhoraContexto = null;
  }

  async function confirmarPublicarAhora() {
    const ctx = state.publicarAhoraContexto;
    if (!ctx || ctx.seleccionado === null) {
      AdminUI.toast('Elegí un canal primero', 'warn');
      return;
    }

    const canal = ctx.canalesPosibles[ctx.seleccionado];
    if (!canal) return;

    const btn = document.getElementById('btn-confirmar-publicar');
    btn.disabled = true;
    btn.textContent = 'Publicando…';

    const idEmpresa = _empresaDeLocal(canal.id_local);
    let resp;
    try {
      await asegurarSesionFirebase();
      resp = await window.GCFirestore.activarCartaEnCanal(idEmpresa, canal.id_local, canal.audience_slug, ctx.idCarta);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '📤 Publicar →';
      AdminUI.toast(e && e.message ? e.message : 'No pudimos publicar la carta', 'error');
      return;
    }

    btn.disabled = false;
    btn.textContent = '📤 Publicar →';

    cerrarModalPublicar();

    // Toast contextual (opción α: nos quedamos en el editor)
    const audienceLabel = canal.audience_slug || 'default';
    const localLabel = canal.nombre_local;
    let toastMsg;
    if (resp.sin_cambios) {
      toastMsg = 'Esta carta ya estaba publicada en ese canal';
    } else {
      toastMsg = '✓ Publicada en canal "' + audienceLabel + '" de ' + localLabel;
    }
    AdminUI.toast(toastMsg, 'success');

    // Recargar publicaciones por empresa en state (para que la próxima vez
    // que abra el modal vea el estado actualizado)
    const empresa = _empresaDeLocal(canal.id_local) || ctx.idEmpresa
      || (state.editorContexto && state.editorContexto.carta && state.editorContexto.carta.Id_Empresa);
    if (empresa) {
      try {
        const pf = await window.GCFirestore.listarPublicacionesEnriquecidas(empresa);
        state.publicacionesPorEmpresa[empresa] = pf.por_local || {};
        state.cartasCatalogoPorEmpresa[empresa] = pf.cartas_catalogo || [];
      } catch (e) {
        console.warn('[FS] no se pudo refrescar publicaciones tras publicar:', e && e.message);
      }
    }

    // Fix día 10: si el usuario tiene abierta la pantalla "📋 Cartas" del
    // local (viene de ahí, va a volver con ←), recargar la lista de cartas
    // para que el flag esta_publicada se vea actualizado al volver.
    // Sin este fix, la pantalla "Cartas" sigue mostrando datos stale.
    if (state.cartasContexto && state.cartasContexto.idEmpresa === empresa) {
      await cargarCartas();
    }
  }


  // ============================================================
  // CONFIGURACIÓN DE WHATSAPP POR LOCAL
  // ============================================================
  // El dueño configura:
  //   - WhatsApp (número celular para wa.me)
  //   - Mensaje pre-rellenado que aparece al hacer click
  // El sistema normaliza el WhatsApp al guardar.

  function abrirModalWhatsApp(idLocal, nombreLocal) {
    // Buscar el local actual en state.estructura
    let local = null;
    if (state.estructura && state.estructura.locales) {
      local = state.estructura.locales.find(function(l) { return l.Id_Local === idLocal; });
    }
    if (!local) {
      AdminUI.toast('No pudimos cargar los datos del local', 'error');
      return;
    }

    // Default automático del mensaje si está vacío:
    // "Hola! Te escribo desde la carta digital de {Nombre_Local}"
    const mensajeActual = local.Mensaje_WhatsApp_Default || '';
    const mensajeDefault = 'Hola! Te escribo desde la carta digital de ' + nombreLocal;

    document.getElementById('modal-ws-local-id').value = idLocal;
    document.getElementById('modal-ws-local-nombre').textContent = nombreLocal;
    document.getElementById('modal-ws-numero').value = local.WhatsApp || '';
    document.getElementById('modal-ws-mensaje').value = mensajeActual || mensajeDefault;
    document.getElementById('modal-ws-status').textContent = '';
    document.getElementById('modal-ws-status').className = '';

    document.getElementById('modal-whatsapp').classList.add('is-visible');

    setTimeout(function() {
      const input = document.getElementById('modal-ws-numero');
      if (input) input.focus();
    }, 100);
  }

  function cerrarModalWhatsApp() {
    document.getElementById('modal-whatsapp').classList.remove('is-visible');
  }

  async function guardarWhatsApp() {
    const idLocal = document.getElementById('modal-ws-local-id').value;
    const numero = document.getElementById('modal-ws-numero').value.trim();
    const mensaje = document.getElementById('modal-ws-mensaje').value.trim();

    if (!numero) {
      AdminUI.setLoginStatus('modal-ws-status', 'Ingresá un número de WhatsApp', 'error');
      return;
    }

    const btn = document.getElementById('modal-ws-btn-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    AdminUI.setLoginStatus('modal-ws-status', '');

    const idEmpresa = _empresaDeLocal(idLocal);
    let normalizado = numero;
    try {
      await asegurarSesionFirebase();
      const r = await window.GCFirestore.actualizarLocal(idEmpresa, idLocal, {
        whatsapp: numero,
        mensaje_whatsapp_default: mensaje
      });
      if (r && r.cambios && r.cambios.whatsapp !== undefined) normalizado = r.cambios.whatsapp;
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      AdminUI.setLoginStatus('modal-ws-status', (e && e.message) ? e.message : 'No pudimos guardar', 'error');
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Guardar';

    // Patch en memoria (consistencia de sesión; la lectura full de estructura
    // migra con el dashboard/login). El dashboard ya parchea estos campos de FS al cargar.
    const locEstado = ((state.estructura && state.estructura.locales) || []).find(function (l) { return l.Id_Local === idLocal; });
    if (locEstado) { locEstado.WhatsApp = normalizado; locEstado.Mensaje_WhatsApp_Default = mensaje; }

    AdminUI.toast('✓ WhatsApp configurado', 'success');
    cerrarModalWhatsApp();

    // Refrescar el dashboard para que se vea el banner verde en lugar del amarillo
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
  // DESCARGA DE QR DE LA URL PÚBLICA
  // ============================================================
  // Genera un PNG 800x800 con:
  //   Arriba:  Nombre del local (ej "La Cantina - Martinez")
  //   Centro:  QR de la URL pública
  //   Abajo:   Powered by GranCarta
  //
  // Usa la librería qrcode-generator cargada via CDN.

  function descargarQrLocal(url, nombreLocal) {
    if (!url) {
      AdminUI.toast('No hay URL pública para generar el QR', 'error');
      return;
    }
    if (typeof qrcode === 'undefined') {
      AdminUI.toast('Cargando generador de QR…', 'info');
      cargarScriptCDN('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', function() {
        descargarQrLocal(url, nombreLocal);
      });
      return;
    }

    try {
      // Generar el QR con corrección de errores alta (resiste manchas/rayones)
      const qr = qrcode(0, 'H');
      qr.addData(url);
      qr.make();

      const SIZE = 800;
      const QR_PADDING_TOP = 100;      // espacio para título arriba
      const QR_PADDING_BOTTOM = 60;    // espacio para "Powered by" abajo
      const QR_SIZE = SIZE - QR_PADDING_TOP - QR_PADDING_BOTTOM - 60;  // dejamos márgenes laterales

      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');

      // Fondo blanco
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Título arriba — nombre del local
      ctx.fillStyle = '#1A1A2A';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nombreLocal || 'GranCarta', SIZE / 2, 50);

      // Dibujar el QR centrado
      const qrX = (SIZE - QR_SIZE) / 2;
      const qrY = QR_PADDING_TOP;
      const cellSize = QR_SIZE / qr.getModuleCount();

      ctx.fillStyle = '#000000';
      for (let r = 0; r < qr.getModuleCount(); r++) {
        for (let c = 0; c < qr.getModuleCount(); c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              qrX + c * cellSize,
              qrY + r * cellSize,
              cellSize,
              cellSize
            );
          }
        }
      }

      // Texto abajo — "Powered by GranCarta"
      ctx.fillStyle = '#666666';
      ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Powered by GranCarta', SIZE / 2, SIZE - 35);

      // Descargar el PNG
      canvas.toBlob(function(blob) {
        const link = document.createElement('a');
        const slug = (nombreLocal || 'qr')
          .toLowerCase()
          .replace(/[áä]/g, 'a').replace(/[éë]/g, 'e').replace(/[íï]/g, 'i')
          .replace(/[óö]/g, 'o').replace(/[úü]/g, 'u').replace(/[ñ]/g, 'n')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        link.download = 'qr-' + slug + '.png';
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
        AdminUI.toast('QR descargado · listo para imprimir', 'success');
      }, 'image/png');
    } catch (err) {
      console.error('Error generando QR:', err);
      AdminUI.toast('No pudimos generar el QR. Volvé a intentar.', 'error');
    }
  }


  // ============================================================
  // DESCARGA DE LA CARTA EN PDF (vía window.print del navegador)
  // ============================================================
  // Estrategia:
  //   1. Abrimos la URL pública en una pestaña nueva
  //   2. Cuando termina de cargar, disparamos window.print()
  //   3. El navegador muestra el diálogo "Imprimir"
  //   4. El usuario elige "Guardar como PDF" (o destino real impresora)
  //
  // ¿Por qué? Porque el navegador bloquea html2canvas + iframe entre
  // subdominios (cross-origin), aunque sean ambos *.grancarta.com.
  // Esta solución usa la API NATIVA del navegador y siempre funciona.

  function descargarPdfCarta(idLocal, idCarta, nombreLocal) {
    // Obtenemos la URL pública del local (ya está en state.cartasPorEmpresa)
    const idEmpresa = state.estructura && state.estructura.locales
      ? (state.estructura.locales.find(function(l) { return l.Id_Local === idLocal; }) || {}).Id_Empresa
      : null;

    if (!idEmpresa) {
      AdminUI.toast('No pudimos identificar la empresa del local', 'error');
      return;
    }

    const datos = state.cartasPorEmpresa[idEmpresa];
    const localEnriquecido = datos && datos.locales
      ? datos.locales.find(function(l) { return l.Id_Local === idLocal; })
      : null;

    if (!localEnriquecido || !localEnriquecido.url_publica) {
      AdminUI.toast('No hay URL pública para generar el PDF', 'error');
      return;
    }

    // Agregamos ?print=1 para que el Worker (cuando lo soporte) pueda
    // aplicar estilos específicos de impresión (ej: ocultar elementos
    // interactivos, ajustar márgenes). Por ahora es informativo.
    const sep = localEnriquecido.url_publica.indexOf('?') === -1 ? '?' : '&';
    const url = localEnriquecido.url_publica + sep + 'print=1';

    AdminUI.toast('Abriendo carta para imprimir como PDF…', 'info');

    // Abrir la URL en una pestaña nueva
    const ventana = window.open(url, '_blank');

    if (!ventana) {
      AdminUI.toast('El navegador bloqueó la pestaña nueva. Permitilas y reintentá.', 'warn');
      return;
    }

    // Esperar a que la página cargue + un margen para fuentes/imágenes,
    // después disparar el diálogo de impresión automáticamente.
    ventana.addEventListener('load', function() {
      setTimeout(function() {
        try {
          ventana.focus();
          ventana.print();
        } catch (err) {
          console.error('Error al imprimir:', err);
        }
      }, 1500);  // 1.5 segundos para webfonts/imagenes
    });

    // Fallback por si el evento load no se dispara (algunos navegadores
    // con páginas cacheadas): forzar print después de 4 segundos
    setTimeout(function() {
      try {
        if (ventana && !ventana.closed) {
          ventana.focus();
          ventana.print();
        }
      } catch (err) {
        // ignoramos si ya se imprimió
      }
    }, 4000);
  }


  // ============================================================
  // DESCARGAR PDF DE UNA PUBLICACIÓN (modelo D — día 9)
  // ============================================================
  // Variante simple de descargarPdfCarta() que recibe la URL completa
  // de la publicación (ya incluye el audience_slug si corresponde).
  //
  // ¿Por qué una función separada en vez de modificar la existente?
  // La función vieja deriva la URL del local (no soporta múltiples
  // publicaciones por local). Esta variante recibe la URL específica
  // de la publicación que se quiere imprimir, así puede manejar
  // /sucursal-albarellos/delivery distinto de /sucursal-albarellos.

  function descargarPdfPublicacion(urlPublica, nombreParaArchivo) {
    if (!urlPublica) {
      AdminUI.toast('URL pública no disponible', 'error');
      return;
    }

    // ?print=1 le dice al Worker (cuando lo soporte) que aplique estilos
    // específicos de impresión.
    const sep = urlPublica.indexOf('?') === -1 ? '?' : '&';
    const url = urlPublica + sep + 'print=1';

    AdminUI.toast('Abriendo "' + nombreParaArchivo + '" para imprimir como PDF…', 'info');

    const ventana = window.open(url, '_blank');
    if (!ventana) {
      AdminUI.toast('El navegador bloqueó la pestaña nueva. Permitilas y reintentá.', 'warn');
      return;
    }

    // Esperar a que cargue + margen para fuentes/imágenes, después print().
    setTimeout(function() {
      try {
        if (ventana && !ventana.closed) {
          ventana.focus();
          ventana.print();
        }
      } catch (err) {
        // ignoramos si ya se imprimió
      }
    }, 4000);
  }


  // ============================================================
  // HELPER: CARGA DINÁMICA DE SCRIPTS DESDE CDN
  // ============================================================
  // Permite cargar librerías bajo demanda en vez de incluir
  // jsPDF y html2canvas siempre (pesan ~200KB juntas).

  function cargarScriptCDN(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    script.onerror = function() {
      AdminUI.toast('No pudimos cargar la librería necesaria. Verificá tu conexión.', 'error');
    };
    document.head.appendChild(script);
  }


  // ============================================================
  // CARTAS DEL LOCAL
  // ============================================================

  // ============================================================
  // SECTORES Y MESAS — pantalla por canal (B1: ver y navegar)
  // 16/6/2026. La pantalla se crea al vuelo (no está en index.html).
  // ============================================================

  /**
   * Deriva el nombre visible del canal desde el audience_slug, como fallback
   * si el backend no mandó Nombre_Canal (misma lógica que el Script 10).
   *   '' → 'Principal' · 'delivery' → 'Delivery' · 'a-b' → 'A b'
   */
  function _nombreCanalDesdeSlug(slug) {
    const s = String(slug || '').trim().toLowerCase();
    if (s === '') return 'Principal';
    const conEsp = s.replace(/-/g, ' ');
    return conEsp.charAt(0).toUpperCase() + conEsp.slice(1);
  }

  /**
   * Garantiza que exista la pantalla screen-sectores-mesas en el DOM.
   * Como vamos por "panel autocontenido en JS" (no tocamos index.html), la
   * creamos la primera vez que se abre y después la reusamos.
   */
  function _asegurarPantallaSectores() {
    let screen = document.getElementById('screen-sectores-mesas');
    if (screen) return screen;

    screen = document.createElement('div');
    screen.id = 'screen-sectores-mesas';
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="screen-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 20px;">
        <div>
          <button class="btn btn-secondary btn-sm" onclick="volverDeSectores()" style="margin-bottom:10px;">← Volver</button>
          <nav id="sectores-breadcrumb" style="font-size:13px;color:#9ca3af;display:flex;flex-wrap:wrap;gap:6px;align-items:center;"></nav>
          <h2 id="sectores-titulo" style="margin:6px 0 0;font-size:20px;color:#fff;"></h2>
        </div>
      </div>
      <div class="screen-body" style="padding:0 20px 40px;">
        <div id="sectores-stats" style="color:#9ca3af;font-size:13px;margin-bottom:14px;"></div>
        <div id="sectores-list"></div>
      </div>
    `;

    // Montar dentro del contenedor principal de la app (al lado de las otras screens)
    const refScreen = document.getElementById('screen-cartas') || document.getElementById('screen-dashboard');
    if (refScreen && refScreen.parentNode) {
      refScreen.parentNode.appendChild(screen);
    } else {
      document.body.appendChild(screen);
    }
    return screen;
  }

  /**
   * Abre la pantalla de sectores y mesas de un canal concreto.
   * Llamada desde el botón "🪑 Sectores y mesas" de cada publicacion-card.
   */
  async function abrirSectoresMesas(idLocal, audienceSlug, nombreCanal, nombreLocal, nombreEmpresa, idPublicacion) {
    const nombreCanalFinal = (nombreCanal && nombreCanal.trim() !== '')
      ? nombreCanal.trim()
      : _nombreCanalDesdeSlug(audienceSlug);

    state.sectoresContexto = {
      idLocal: idLocal,
      audienceSlug: audienceSlug || '',
      nombreCanal: nombreCanalFinal,
      nombreLocal: nombreLocal || '',
      nombreEmpresa: nombreEmpresa || '',
      idPublicacion: idPublicacion || '',
      sectores: []
    };

    _asegurarPantallaSectores();

    // Breadcrumb: Empresa → Local → Espacio X (con lapicito para renombrar el canal)
    const bc = document.getElementById('sectores-breadcrumb');
    const lapicito = idPublicacion
      ? ' <button class="btn-icon-mini" title="Renombrar canal" onclick="abrirModalRenombrarCanal()" style="vertical-align:middle;">✏️</button>'
      : '';
    bc.innerHTML =
      '<span>' + AdminUI.escapeHtml(nombreEmpresa || '') + '</span>' +
      '<span style="opacity:.5;">→</span>' +
      '<span>' + AdminUI.escapeHtml(nombreLocal || '') + '</span>' +
      '<span style="opacity:.5;">→</span>' +
      '<span id="sectores-breadcrumb-canal" style="color:#c4b5fd;font-weight:600;">Espacio ' + AdminUI.escapeHtml(nombreCanalFinal) + '</span>' +
      lapicito;

    document.getElementById('sectores-titulo').textContent = '🪑 Sectores y mesas';

    AdminUI.mostrarPantalla('screen-sectores-mesas');
    await cargarSectores();
  }

  async function cargarSectores() {
    const ctx = state.sectoresContexto;
    if (!ctx) return;

    AdminUI.setLoading(true);
    let todos = [];
    try {
      // Firestore-primero: lee sectores + mesas + canal del local desde Firestore
      // (reemplaza el GAS sector_listar). Solo lectura, no escribe nada.
      const resp = await window.GCFirestore.listarSectores(state.idEmpresaActiva, ctx.idLocal);
      todos = resp.sectores || [];
    } catch (e) {
      AdminUI.setLoading(false);
      AdminUI.toast((e && e.message) || 'No pudimos cargar los sectores', 'error');
      return;
    }
    AdminUI.setLoading(false);

    // Filtrar SOLO los sectores de ESTE canal (audience_slug del contexto).
    // El horno devuelve todos los del local; acá nos quedamos con los del canal.
    ctx.sectores = todos.filter(function(s) {
      return (s.Audience_Slug || '') === ctx.audienceSlug;
    });
    renderSectores();
  }

  function renderSectores() {
    const ctx = state.sectoresContexto;
    const cont = document.getElementById('sectores-list');
    const stats = document.getElementById('sectores-stats');
    const sectores = ctx.sectores || [];

    const totalMesas = sectores.reduce(function(t, s) { return t + (s.cantidad_mesas || 0); }, 0);
    stats.textContent = sectores.length + ' sector(es) · ' + totalMesas + ' mesa(s) en este canal';

    // Botón "+ Nuevo sector" + "Imprimir QRs" (alineados arriba de la lista)
    const btnNuevoSector =
      '<div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="abrirModalNuevoSector()">+ Nuevo sector</button>' +
        '<button class="btn" onclick="abrirModalImprimirQrs()" style="background:#0EA5E9;color:#fff;font-weight:600;">🖨️ Imprimir QRs</button>' +
      '</div>';

    if (sectores.length === 0) {
      cont.innerHTML = btnNuevoSector + `
        <div class="empty-state" style="text-align:center;padding:40px 20px;">
          <div class="empty-state-icon" style="font-size:40px;">🪑</div>
          <div class="empty-state-title" style="font-size:17px;margin-top:8px;">Todavía no hay sectores en este canal</div>
          <div class="empty-state-detail" style="color:#9ca3af;margin-top:6px;">
            Un sector es una ubicación física (Piso 1, Vereda, Barra...). Cada sector tiene sus mesas con QR.
            <br><small>Tocá "+ Nuevo sector" para crear el primero.</small>
          </div>
        </div>
      `;
      return;
    }

    let html = btnNuevoSector;
    sectores.forEach(function(s) {
      const color = s.Color_Hex || '#1B2B4A';
      const mesas = s.mesas || [];
      const idSectorJs = AdminUI.escapeHtml(s.Id_Sector);
      const nombreSectorJs = AdminUI.escapeHtml(s.Nombre).replace(/'/g, "\\'");

      const mesasHtml = mesas.length > 0
        ? mesas.map(function(m) {
            const idMesaJs = AdminUI.escapeHtml(m.Id_Mesa);
            const numMesaJs = AdminUI.escapeHtml(String(m.Numero)).replace(/'/g, "\\'");
            const urlQrJs = AdminUI.escapeHtml(m.Url_Completa_QR || '').replace(/'/g, "\\'");
            const capJs = AdminUI.escapeHtml(String(m.Capacidad || '')).replace(/'/g, "\\'");
            return `
              <div class="mesa-row" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.05);">
                <span style="font-weight:600;color:#fff;min-width:90px;">${AdminUI.escapeHtml(String(m.Numero))}</span>
                <span style="color:#9ca3af;flex:1;">${AdminUI.escapeHtml(m.Nombre_Visible || '')}</span>
                ${m.Capacidad ? '<span style="color:#6b7280;font-size:12px;">👥 ' + AdminUI.escapeHtml(String(m.Capacidad)) + '</span>' : ''}
                <button class="btn-icon-mini" title="Descargar QR para imprimir" onclick="descargarQrMesa('${idMesaJs}','${numMesaJs}','${nombreSectorJs}')">🔲</button>
                <button class="btn-icon-mini" title="Editar mesa" onclick="abrirModalEditarMesa('${idMesaJs}','${numMesaJs}','${capJs}')">✏️</button>
                <button class="btn-icon-mini" title="Eliminar mesa" onclick="eliminarMesa('${idMesaJs}','${numMesaJs}')" style="color:#f87171;">🗑</button>
              </div>
            `;
          }).join('')
        : '<div style="padding:8px 12px;color:#6b7280;font-size:13px;">Sin mesas</div>';

      const colorJs = AdminUI.escapeHtml(color).replace(/'/g, "\\'");
      const botonesOn = s.Botones_Activos === true;
      const toggleTexto = botonesOn
        ? '🔔 Los clientes pueden llamar al mozo desde la carta'
        : '🔕 Los clientes ven la carta sin botones de llamado';
      html += `
        <div class="sector-card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;margin-bottom:14px;overflow:hidden;">
          <div class="sector-card-header" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-left:4px solid ${color};">
            <span style="font-size:16px;font-weight:700;color:#fff;">${AdminUI.escapeHtml(s.Nombre)}</span>
            <span style="color:#9ca3af;font-size:13px;">${s.cantidad_mesas || 0} mesa(s)</span>
            ${s.canal_existe === false ? '<span style="color:#f59e0b;font-size:12px;">⚠ canal despublicado</span>' : ''}
            <span style="flex:1;"></span>
            <button class="btn btn-secondary btn-sm" onclick="abrirModalNuevaMesa('${idSectorJs}','${nombreSectorJs}')">+ Mesa</button>
            <button class="btn-icon-mini" title="Editar sector" onclick="abrirModalEditarSector('${idSectorJs}','${nombreSectorJs}','${colorJs}')">✏️</button>
            <button class="btn-icon-mini" title="Eliminar sector (y sus mesas)" onclick="eliminarSector('${idSectorJs}','${nombreSectorJs}',${s.cantidad_mesas || 0})" style="color:#f87171;">🗑</button>
          </div>
          <div class="sector-botones-row" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.05);">
            <button class="switch-botones${botonesOn ? ' is-on' : ''}" role="switch" aria-checked="${botonesOn}"
                    onclick="toggleBotonesSector('${idSectorJs}','${nombreSectorJs}',${botonesOn})"
                    style="position:relative;width:46px;height:26px;border-radius:999px;border:none;cursor:pointer;flex-shrink:0;background:${botonesOn ? '#22c55e' : '#3f3f46'};transition:background .2s;">
              <span style="position:absolute;top:3px;left:${botonesOn ? '23px' : '3px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;"></span>
            </button>
            <span style="color:${botonesOn ? '#86efac' : '#9ca3af'};font-size:12.5px;">${toggleTexto}</span>
          </div>
          <div class="sector-card-mesas">
            ${mesasHtml}
          </div>
        </div>
      `;
    });

    cont.innerHTML = html;
  }

  function volverDeSectores() {
    AdminUI.mostrarPantalla('screen-dashboard');
    state.sectoresContexto = null;
  }

  // ── B2: alta y baja de sectores y mesas ──────────────────────────

  /**
   * Crea (al vuelo) un overlay de modal genérico reutilizable para sectores/mesas.
   * Reusa las clases CSS existentes (modal-overlay, modal-box, etc.).
   */
  function _asegurarModalSectores() {
    let ov = document.getElementById('modal-sectores-generico');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'modal-sectores-generico';
    ov.className = 'modal-overlay';
    ov.style.display = 'none';
    ov.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-sect-titulo">—</h3>
          <button class="modal-close" onclick="cerrarModalSectores()">×</button>
        </div>
        <div class="modal-body" id="modal-sect-body"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="cerrarModalSectores()">Cancelar</button>
          <button class="btn btn-primary" id="modal-sect-ok" onclick="confirmarModalSectores()">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    return ov;
  }

  function cerrarModalSectores() {
    const ov = document.getElementById('modal-sectores-generico');
    if (ov) ov.style.display = 'none';
    // Restaurar el botón Guardar (el toggle de botones lo oculta)
    const okBtn = document.getElementById('modal-sect-ok');
    if (okBtn) okBtn.style.display = '';
    state.modalSectoresAccion = null;
  }

  function _abrirModalSectores(titulo, bodyHtml, accionFn, okLabel) {
    const ov = _asegurarModalSectores();
    document.getElementById('modal-sect-titulo').textContent = titulo;
    document.getElementById('modal-sect-body').innerHTML = bodyHtml;
    document.getElementById('modal-sect-ok').textContent = okLabel || 'Guardar';
    state.modalSectoresAccion = accionFn;
    ov.style.display = 'flex';
  }

  async function confirmarModalSectores() {
    if (typeof state.modalSectoresAccion === 'function') {
      await state.modalSectoresAccion();
    }
  }

  // ── Nuevo sector (con su primera mesa — opción b: completo) ──
  function abrirModalNuevoSector() {
    const body = `
      <label class="login-label" for="sect-nombre">Nombre del sector</label>
      <input type="text" id="sect-nombre" class="login-input" placeholder="Piso 1, Vereda, Barra...">

      <label class="login-label" for="sect-color" style="margin-top:10px;">Color (para distinguirlo)</label>
      <input type="color" id="sect-color" value="#1B2B4A" style="width:60px;height:38px;border:none;background:none;cursor:pointer;">

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);">
        <div style="color:#c4b5fd;font-weight:600;font-size:13px;margin-bottom:8px;">Primera mesa de este sector</div>
        <label class="login-label" for="sect-mesa-num">Identificador de la mesa</label>
        <input type="text" id="sect-mesa-num" class="login-input" placeholder="ej: 1, Barra 1, VIP-A">
        <label class="login-label" for="sect-mesa-cap" style="margin-top:10px;">Capacidad (opcional)</label>
        <input type="number" id="sect-mesa-cap" class="login-input" placeholder="ej: 4" min="1">
      </div>
      <div class="login-status" id="modal-sect-status" style="margin-top:10px;"></div>
    `;
    _abrirModalSectores('Nuevo sector', body, _guardarNuevoSector, 'Crear sector');
  }

  async function _guardarNuevoSector() {
    const ctx = state.sectoresContexto;
    const nombre = (document.getElementById('sect-nombre').value || '').trim();
    const color = document.getElementById('sect-color').value || '';
    const mesaNum = (document.getElementById('sect-mesa-num').value || '').trim();
    const mesaCap = (document.getElementById('sect-mesa-cap').value || '').trim();
    const status = document.getElementById('modal-sect-status');

    if (!nombre) { status.textContent = 'Poné un nombre para el sector.'; status.style.color = '#f87171'; return; }
    if (!mesaNum) { status.textContent = 'El identificador de la primera mesa es obligatorio.'; status.style.color = '#f87171'; return; }

    const okBtn = document.getElementById('modal-sect-ok');
    okBtn.disabled = true;
    try {
      // Firestore-primero: crea el sector con su primera mesa (+token) en Firestore.
      await window.GCFirestore.crearSector(state.idEmpresaActiva, ctx.idLocal, {
        nombre: nombre, audienceSlug: ctx.audienceSlug, colorHex: color,
        mesaNumero: mesaNum, mesaCapacidad: mesaCap
      });
    } catch (e) {
      okBtn.disabled = false;
      status.textContent = (e && e.message) || 'No pudimos crear el sector';
      status.style.color = '#f87171';
      return;
    }
    okBtn.disabled = false;
    cerrarModalSectores();
    AdminUI.toast('Sector creado', 'info');
    await cargarSectores();
  }

  // ── Nueva mesa en un sector existente ──
  function abrirModalNuevaMesa(idSector, nombreSector) {
    const body = `
      <div style="color:#9ca3af;font-size:13px;margin-bottom:10px;">Sector: <strong style="color:#fff;">${AdminUI.escapeHtml(nombreSector)}</strong></div>
      <label class="login-label" for="mesa-num">Identificador de la mesa</label>
      <input type="text" id="mesa-num" class="login-input" placeholder="ej: 1, Barra 1, VIP-A">
      <label class="login-label" for="mesa-cap" style="margin-top:10px;">Capacidad (opcional)</label>
      <input type="number" id="mesa-cap" class="login-input" placeholder="ej: 4" min="1">
      <div class="login-status" id="modal-sect-status" style="margin-top:10px;"></div>
    `;
    _abrirModalSectores('Nueva mesa', body, function() { return _guardarNuevaMesa(idSector); }, 'Crear mesa');
  }

  async function _guardarNuevaMesa(idSector) {
    const num = (document.getElementById('mesa-num').value || '').trim();
    const cap = (document.getElementById('mesa-cap').value || '').trim();
    const status = document.getElementById('modal-sect-status');

    if (!num) { status.textContent = 'El identificador de la mesa es obligatorio.'; status.style.color = '#f87171'; return; }

    const okBtn = document.getElementById('modal-sect-ok');
    okBtn.disabled = true;
    try {
      await window.GCFirestore.crearMesa(
        state.idEmpresaActiva, state.sectoresContexto.idLocal, idSector,
        { numero: num, capacidad: cap });
    } catch (e) {
      okBtn.disabled = false;
      status.textContent = (e && e.message) || 'No pudimos crear la mesa';
      status.style.color = '#f87171';
      return;
    }
    okBtn.disabled = false;
    cerrarModalSectores();
    AdminUI.toast('Mesa creada', 'info');
    await cargarSectores();
  }

  // ── Eliminar mesa (con guarda de "no la última" en backend) ──
  async function eliminarMesa(idMesa, numeroMesa) {
    const ok = await AdminUI.confirm({
      title: 'Eliminar mesa',
      message: '¿Eliminar la mesa "' + numeroMesa + '"? Su QR dejará de funcionar.',
      okLabel: 'Eliminar', cancelLabel: 'Cancelar'
    });
    if (!ok) return;
    try {
      await window.GCFirestore.eliminarMesa(
        state.idEmpresaActiva, state.sectoresContexto.idLocal, idMesa);
    } catch (e) {
      AdminUI.toast((e && e.message) || 'No pudimos eliminar la mesa', 'error');
      return;
    }
    AdminUI.toast('Mesa eliminada', 'info');
    await cargarSectores();
  }

  // ── Eliminar sector (cascada: se lleva sus mesas) ──
  async function eliminarSector(idSector, nombreSector, cantMesas) {
    const aviso = cantMesas > 0
      ? '¿Eliminar el sector "' + nombreSector + '" y sus ' + cantMesas + ' mesa(s)? Los QR de esas mesas dejarán de funcionar.'
      : '¿Eliminar el sector "' + nombreSector + '"?';
    const ok = await AdminUI.confirm({
      title: 'Eliminar sector',
      message: aviso,
      okLabel: 'Eliminar', cancelLabel: 'Cancelar'
    });
    if (!ok) return;
    try {
      // Borrado lógico + cascada a mesas + baja de sus tokens (QR dejan de resolver).
      await window.GCFirestore.eliminarSector(
        state.idEmpresaActiva, state.sectoresContexto.idLocal, idSector);
    } catch (e) {
      AdminUI.toast((e && e.message) || 'No pudimos eliminar el sector', 'error');
      return;
    }
    AdminUI.toast('Sector eliminado', 'info');
    await cargarSectores();
  }

  // ── Toggle de botones de atención (con modal de alcance: bonus track) ──
  function toggleBotonesSector(idSector, nombreSector, estadoActual) {
    // estadoActual = estado vigente; al togglear, el destino es el opuesto
    const destino = !estadoActual;
    const accionTxt = destino ? 'prender' : 'apagar';
    const body = `
      <div style="color:#d1d5db;font-size:14px;line-height:1.6;margin-bottom:6px;">
        Vas a <strong style="color:${destino ? '#86efac' : '#fca5a5'};">${accionTxt}</strong>
        los botones de llamado.
      </div>
      <div style="color:#9ca3af;font-size:13px;margin-bottom:16px;">
        ¿Aplicar solo al sector <strong style="color:#fff;">${AdminUI.escapeHtml(nombreSector)}</strong>,
        o a todos los sectores de la sucursal?
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button class="btn btn-primary" onclick="confirmarToggleBotones('${AdminUI.escapeHtml(idSector)}',${destino},'sector')">
          Solo este sector
        </button>
        <button class="btn btn-secondary" onclick="confirmarToggleBotones('${AdminUI.escapeHtml(idSector)}',${destino},'sucursal')">
          Toda la sucursal
        </button>
      </div>
      <div class="login-status" id="modal-sect-status" style="margin-top:12px;"></div>
    `;
    // Reusamos el modal genérico, pero la acción la disparan los botones del body.
    _abrirModalSectores(destino ? 'Prender botones de atención' : 'Apagar botones de atención', body, null, '');
    // Ocultar el botón "Guardar" del pie (acá decidimos con los 2 botones del body)
    const okBtn = document.getElementById('modal-sect-ok');
    if (okBtn) okBtn.style.display = 'none';
  }

  async function confirmarToggleBotones(idSector, activo, alcance) {
    const status = document.getElementById('modal-sect-status');
    if (status) { status.textContent = 'Guardando…'; status.style.color = '#9ca3af'; }

    // Firestore-primero: el comensal lee botones_activos de Firestore. Escribimos
    // directo el sector (o toda la sucursal); ya no pasa por GAS. Si falla, lo
    // mostramos en el modal y no cerramos (igual que antes con el error de GAS).
    try {
      const idEmpresa = state.idEmpresaActiva || null;
      const idLocal = (state.sectoresContexto && state.sectoresContexto.idLocal) || null;
      if (!idEmpresa || !idLocal) throw new Error('Falta empresa o local activo');
      await window.GCFirestore.toggleBotonesSector(idEmpresa, idLocal, idSector, activo, alcance);
    } catch (e) {
      if (status) { status.textContent = (e && e.message) || 'No pudimos guardar'; status.style.color = '#f87171'; }
      return;
    }
    // Restaurar el botón Guardar para futuros usos del modal genérico
    const okBtn = document.getElementById('modal-sect-ok');
    if (okBtn) okBtn.style.display = '';
    cerrarModalSectores();
    AdminUI.toast('Botones actualizados', 'info');
    await cargarSectores();
  }

  // ── Imprimir QRs (hoja A4) — modal con dropdowns canal/sector ──
  async function abrirModalImprimirQrs() {
    const ctx = state.sectoresContexto;
    if (!ctx || !ctx.idLocal) { AdminUI.toast('Abrí un canal primero', 'error'); return; }

    // Traer los canales (publicaciones) del local para el dropdown.
    // El id_empresa lo tomo de la empresa activa del admin.
    const idEmpresa = state.idEmpresaActiva || null;

    let canales = [];
    try {
      const pubs = await window.GCFirestore.listarPublicaciones(idEmpresa, ctx.idLocal);
      canales = pubs.map(function(p) {
        const slug = (p.audience_slug || '').trim();
        return { slug: slug, label: slug ? (p.nombre_canal || slug) : 'Principal' };
      });
    } catch (e) { canales = []; }
    // Fallback: si no vinieron canales, al menos el actual
    if (canales.length === 0) {
      canales = [{ slug: ctx.audienceSlug || '', label: ctx.nombreCanal || 'Principal' }];
    }

    const optsCanal = ['<option value="__todos">Todos los canales</option>']
      .concat(canales.map(function(c) {
        return '<option value="' + AdminUI.escapeHtml(c.slug) + '">' + AdminUI.escapeHtml(c.label) + '</option>';
      })).join('');

    const body = `
      <div style="color:#9ca3af;font-size:13px;margin-bottom:14px;line-height:1.5;">
        ${AdminUI.escapeHtml(ctx.nombreEmpresa || '')} → ${AdminUI.escapeHtml(ctx.nombreLocal || '')}<br>
        Elegí qué QR imprimir. Se abre una hoja A4 lista para imprimir y recortar.
      </div>

      <label class="login-label" for="qr-canal">Canal</label>
      <select id="qr-canal" class="login-input" onchange="onCambioCanalImprimir()">
        ${optsCanal}
      </select>

      <div id="qr-sector-wrap" style="display:none;margin-top:12px;">
        <label class="login-label" for="qr-sector">Sector</label>
        <select id="qr-sector" class="login-input">
          <option value="__todos">Todos los sectores</option>
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-primary" style="flex:1;" onclick="confirmarImprimirQrs()">🖨️ Generar hoja</button>
      </div>
      <div class="login-status" id="qr-imprimir-status" style="margin-top:10px;"></div>
    `;
    _abrirModalSectores('Imprimir QRs', body, null, '');
    const okBtn = document.getElementById('modal-sect-ok');
    if (okBtn) okBtn.style.display = 'none';
  }

  // Al cambiar el canal: si es uno puntual, mostrar el dropdown de sector con
  // los sectores de ese canal. Si es "todos", ocultar el de sector.
  async function onCambioCanalImprimir() {
    const ctx = state.sectoresContexto;
    const canalSel = document.getElementById('qr-canal').value;
    const wrap = document.getElementById('qr-sector-wrap');
    const selSector = document.getElementById('qr-sector');

    if (canalSel === '__todos') {
      wrap.style.display = 'none';
      return;
    }
    // Traer los sectores del local (Firestore) y filtrar por el canal elegido
    let sectores = [];
    try {
      const resp = await window.GCFirestore.listarSectores(state.idEmpresaActiva, ctx.idLocal);
      sectores = resp.sectores || [];
    } catch (e) { sectores = []; }
    sectores = sectores.filter(function(s) {
      return (s.Audience_Slug || '') === canalSel;
    });
    selSector.innerHTML = '<option value="__todos">Todos los sectores</option>' +
      sectores.map(function(s) {
        return '<option value="' + AdminUI.escapeHtml(s.Id_Sector) + '">' + AdminUI.escapeHtml(s.Nombre) + '</option>';
      }).join('');
    wrap.style.display = 'block';
  }

  async function confirmarImprimirQrs() {
    const ctx = state.sectoresContexto;
    const status = document.getElementById('qr-imprimir-status');
    const canalSel = document.getElementById('qr-canal').value;
    const sectorEl = document.getElementById('qr-sector');
    const sectorSel = (sectorEl && document.getElementById('qr-sector-wrap').style.display !== 'none')
      ? sectorEl.value : '__todos';

    if (status) { status.textContent = 'Buscando mesas…'; status.style.color = '#9ca3af'; }

    // Armar filtros para el backend
    const audienceSlug = (canalSel === '__todos') ? null : canalSel;
    const idSector = (sectorSel && sectorSel !== '__todos') ? sectorSel : null;

    let resp;
    try {
      resp = await window.GCFirestore.qrsImprimir(state.idEmpresaActiva, ctx.idLocal,
        { audienceSlug: audienceSlug, idSector: idSector });
    } catch (e) {
      if (status) { status.textContent = (e && e.message) || 'No pudimos traer las mesas'; status.style.color = '#f87171'; }
      return;
    }
    if (!resp.mesas || resp.mesas.length === 0) {
      if (status) { status.textContent = 'No hay mesas para esa selección'; status.style.color = '#f59e0b'; }
      return;
    }

    // Asegurar que la librería de QR esté cargada antes de abrir la hoja
    if (typeof qrcode === 'undefined') {
      if (status) { status.textContent = 'Cargando generador de QR…'; }
      cargarScriptCDN('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', function() {
        _abrirHojaQrA4(resp);
        cerrarModalSectores();
      });
      return;
    }
    _abrirHojaQrA4(resp);
    cerrarModalSectores();
  }

  // Abre una ventana nueva con la hoja A4 maquetada (cuadritos con QR + textos).
  function _abrirHojaQrA4(data) {
    const empresaNom = data.empresa ? data.empresa.nombre : '';
    const localNom = data.local ? data.local.nombre : '';
    const mesas = data.mesas || [];

    // Generar el dataURL del QR de cada mesa (con la librería ya cargada)
    function qrDataUrl(url) {
      const qr = qrcode(0, 'H');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(6, 0); // cellSize 6, margin 0
    }

    let celdas = '';
    mesas.forEach(function(m) {
      const arriba = (m.canal_label ? (m.canal_label + ' · ') : '') + (m.sector_nombre || '');
      const mesaTxt = m.numero || m.nombre_visible || '';
      const abajo = (empresaNom ? empresaNom : '') + (localNom ? (' · ' + localNom) : '');
      celdas += `
        <div class="qr-celda">
          <div class="qr-arriba">${escAttr(arriba)}</div>
          <div class="qr-mesa">${escAttr(mesaTxt)}</div>
          <img class="qr-img" src="${qrDataUrl(m.url_qr)}" alt="QR ${escAttr(mesaTxt)}">
          <div class="qr-abajo">${escAttr(abajo)}</div>
        </div>`;
    });

    function escAttr(s) {
      return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>QRs · ${escAttr(localNom)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; padding: 10mm; }
  .barra-print {
    position: sticky; top: 0; background: #1B2B4A; color: #fff; padding: 12px 16px;
    border-radius: 10px; margin-bottom: 10mm; display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 10px rgba(0,0,0,.2);
  }
  .barra-print h1 { font-size: 15px; font-weight: 600; }
  .barra-print small { opacity: .8; font-weight: 400; }
  .barra-print button {
    background: #0EA5E9; color: #fff; border: none; border-radius: 8px;
    padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .hoja {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm;
    background: #fff; padding: 8mm; border-radius: 4px; max-width: 210mm; margin: 0 auto;
  }
  .qr-celda {
    border: 1px dashed #b0b0b0; border-radius: 6px; padding: 4mm 2mm;
    display: flex; flex-direction: column; align-items: center; gap: 1.5mm;
    text-align: center; break-inside: avoid; page-break-inside: avoid; min-height: 58mm;
    justify-content: center;
  }
  .qr-arriba { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; line-height: 1.2; }
  .qr-mesa { font-size: 15px; font-weight: 800; color: #1A1A2A; line-height: 1.1; margin-bottom: 1mm; }
  .qr-img { width: 38mm; height: 38mm; display: block; }
  .qr-abajo { font-size: 8px; color: #888; margin-top: 1mm; line-height: 1.2; }
  @media print {
    body { background: #fff; padding: 0; }
    .barra-print { display: none; }
    .hoja { box-shadow: none; padding: 6mm; gap: 3mm; }
    @page { size: A4; margin: 8mm; }
  }
</style></head>
<body>
  <div class="barra-print">
    <h1>QRs para imprimir <small>· ${escAttr(empresaNom)} · ${escAttr(localNom)} · ${mesas.length} mesa(s)</small></h1>
    <button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  </div>
  <div class="hoja">${celdas}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { AdminUI.toast('Permití las ventanas emergentes para abrir la hoja', 'error'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // ── B3: editar mesa, editar sector, QR imprimible ────────────────

  // ── Editar mesa (identificador + capacidad) ──
  function abrirModalEditarMesa(idMesa, numeroActual, capacidadActual) {
    const body = `
      <label class="login-label" for="emesa-num">Identificador de la mesa</label>
      <input type="text" id="emesa-num" class="login-input" placeholder="ej: 1, Barra 1, VIP-A" value="${AdminUI.escapeHtml(numeroActual)}">
      <label class="login-label" for="emesa-cap" style="margin-top:10px;">Capacidad (opcional)</label>
      <input type="number" id="emesa-cap" class="login-input" placeholder="ej: 4" min="1" value="${AdminUI.escapeHtml(capacidadActual)}">
      <div class="login-status" id="modal-sect-status" style="margin-top:10px;"></div>
    `;
    _abrirModalSectores('Editar mesa', body, function() { return _guardarEdicionMesa(idMesa); }, 'Guardar cambios');
  }

  async function _guardarEdicionMesa(idMesa) {
    const num = (document.getElementById('emesa-num').value || '').trim();
    const cap = (document.getElementById('emesa-cap').value || '').trim();
    const status = document.getElementById('modal-sect-status');

    if (!num) { status.textContent = 'El identificador de la mesa es obligatorio.'; status.style.color = '#f87171'; return; }

    const okBtn = document.getElementById('modal-sect-ok');
    okBtn.disabled = true;
    try {
      await window.GCFirestore.actualizarMesa(
        state.idEmpresaActiva, state.sectoresContexto.idLocal, idMesa,
        { numero: num, capacidad: cap });
    } catch (e) {
      okBtn.disabled = false;
      status.textContent = (e && e.message) || 'No pudimos guardar la mesa';
      status.style.color = '#f87171';
      return;
    }
    okBtn.disabled = false;
    cerrarModalSectores();
    AdminUI.toast('Mesa actualizada', 'info');
    await cargarSectores();
  }

  // ── Editar sector (nombre + color) ──
  function abrirModalEditarSector(idSector, nombreActual, colorActual) {
    const color = (colorActual && colorActual.trim() !== '') ? colorActual : '#1B2B4A';
    const body = `
      <label class="login-label" for="esect-nombre">Nombre del sector</label>
      <input type="text" id="esect-nombre" class="login-input" placeholder="Piso 1, Vereda, Barra..." value="${AdminUI.escapeHtml(nombreActual)}">
      <label class="login-label" for="esect-color" style="margin-top:10px;">Color</label>
      <input type="color" id="esect-color" value="${AdminUI.escapeHtml(color)}" style="width:60px;height:38px;border:none;background:none;cursor:pointer;">
      <div class="login-status" id="modal-sect-status" style="margin-top:10px;"></div>
    `;
    _abrirModalSectores('Editar sector', body, function() { return _guardarEdicionSector(idSector); }, 'Guardar cambios');
  }

  async function _guardarEdicionSector(idSector) {
    const nombre = (document.getElementById('esect-nombre').value || '').trim();
    const color = document.getElementById('esect-color').value || '';
    const status = document.getElementById('modal-sect-status');

    if (!nombre) { status.textContent = 'Poné un nombre para el sector.'; status.style.color = '#f87171'; return; }

    const okBtn = document.getElementById('modal-sect-ok');
    okBtn.disabled = true;
    try {
      await window.GCFirestore.actualizarSector(
        state.idEmpresaActiva, state.sectoresContexto.idLocal, idSector,
        { nombre: nombre, color_hex: color });
    } catch (e) {
      okBtn.disabled = false;
      status.textContent = (e && e.message) || 'No pudimos guardar el sector';
      status.style.color = '#f87171';
      return;
    }
    okBtn.disabled = false;
    cerrarModalSectores();
    AdminUI.toast('Sector actualizado', 'info');
    await cargarSectores();
  }

  // ── QR imprimible de una mesa (pide la URL pública al backend) ──
  async function descargarQrMesa(idMesa, numeroMesa, nombreSector) {
    if (!idMesa) {
      AdminUI.toast('No pude identificar la mesa', 'error');
      return;
    }
    AdminUI.setLoading(true);
    // La URL pública del QR se arma en vivo desde Firestore (mesa→sector→canal +
    // slugs de empresa/local). Siempre lleva ?t=<token>; apunta al worker.
    let urlQr;
    try {
      const r = await window.GCFirestore.urlQrMesa(state.idEmpresaActiva, state.sectoresContexto.idLocal, idMesa);
      urlQr = r.url_qr;
    } catch (e) {
      AdminUI.setLoading(false);
      AdminUI.toast((e && e.message) || 'No pudimos armar la URL del QR', 'error');
      return;
    }
    AdminUI.setLoading(false);

    // El "título" del QR es el identificador de la mesa + su sector,
    // para que el dueño sepa qué QR imprimió: "Mesa 5 · Piso 2".
    const titulo = (numeroMesa || 'Mesa') + (nombreSector ? ' · ' + nombreSector : '');
    descargarQrLocal(urlQr, titulo);
  }

  // ── Renombrar canal ("Espacio X") desde el breadcrumb ──
  function abrirModalRenombrarCanal() {
    const ctx = state.sectoresContexto;
    if (!ctx || !ctx.idPublicacion) {
      AdminUI.toast('No pude identificar el canal para renombrar', 'error');
      return;
    }
    const body = `
      <div style="color:#9ca3af;font-size:13px;margin-bottom:10px;">Se mostrará como <strong style="color:#c4b5fd;">Espacio <span id="ecanal-preview">${AdminUI.escapeHtml(ctx.nombreCanal)}</span></strong></div>
      <label class="login-label" for="ecanal-nombre">Nombre del canal</label>
      <input type="text" id="ecanal-nombre" class="login-input" placeholder="Principal, Delivery, Barra, Terraza..." value="${AdminUI.escapeHtml(ctx.nombreCanal)}" oninput="document.getElementById('ecanal-preview').textContent = this.value || '—'">
      <div class="login-status" id="modal-sect-status" style="margin-top:10px;"></div>
    `;
    _abrirModalSectores('Renombrar canal', body, _guardarNombreCanal, 'Guardar');
  }

  async function _guardarNombreCanal() {
    const ctx = state.sectoresContexto;
    const nombre = (document.getElementById('ecanal-nombre').value || '').trim();
    const status = document.getElementById('modal-sect-status');

    if (!nombre) { status.textContent = 'El nombre del canal no puede estar vacío.'; status.style.color = '#f87171'; return; }

    const okBtn = document.getElementById('modal-sect-ok');
    okBtn.disabled = true;
    const idEmpresa = state.idEmpresaActiva;
    try {
      await asegurarSesionFirebase();
      await window.GCFirestore.renombrarCanal(idEmpresa, ctx.idLocal, ctx.idPublicacion, nombre);
    } catch (e) {
      okBtn.disabled = false;
      status.textContent = (e && e.message) ? e.message : 'No pudimos renombrar el canal';
      status.style.color = '#f87171';
      return;
    }
    okBtn.disabled = false;
    cerrarModalSectores();
    // Actualizar el breadcrumb en vivo
    ctx.nombreCanal = nombre;
    const bcCanal = document.getElementById('sectores-breadcrumb-canal');
    if (bcCanal) bcCanal.textContent = 'Espacio ' + nombre;
    AdminUI.toast('Canal renombrado', 'info');
  }

  // Cartas es POR EMPRESA (el catálogo de cartas se lista con idEmpresa; el publicar
  // arma canales de todos los locales). Por eso el botón vive en el header de la
  // empresa, no en la sucursal. nombreLocal queda vacío (no hay sucursal en juego).
  async function abrirCartasEmpresa(idEmpresa, nombreEmpresa) {
    state.cartasContexto = {
      idLocal: null,
      idEmpresa: idEmpresa,
      nombreLocal: '',
      nombreEmpresa: nombreEmpresa,
      cartas: []
    };

    document.getElementById('cartas-titulo').textContent = 'Cartas';
    document.getElementById('cartas-subtitulo').textContent = nombreEmpresa;

    AdminUI.mostrarPantalla('screen-cartas');
    await cargarCartas();
  }

  async function cargarCartas() {
    if (!state.cartasContexto) return;
    AdminUI.setLoading(true);
    try {
      const cartas = await window.GCFirestore.listarCartas(state.cartasContexto.idEmpresa);
      state.cartasContexto.cartas = cartas || [];
      renderCartas();
    } catch (e) {
      AdminUI.toast('No pudimos cargar las cartas: ' + ((e && e.message) || e), 'error');
    } finally {
      AdminUI.setLoading(false);
    }
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
          <div class="empty-state-detail">Empezá con una carta de ejemplo (2 secciones y productos de muestra que después editás o borrás), o creá una vacía desde cero.</div>
          <button class="btn btn-primary" id="btn-carta-ejemplo" onclick="sembrarCartaEjemplo()">🍽️ Empezar con una carta de ejemplo</button>
          <button class="btn btn-secondary" onclick="abrirModalCartaNueva()">Crear carta vacía</button>
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

    try {
      await window.GCFirestore.crearCarta(state.cartasContexto.idEmpresa, {
        nombre: nombre,
        descripcion: descripcion,
        redondeo: redondeo
      });
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Crear carta';
      AdminUI.toast('No pudimos crear la carta: ' + ((e && e.message) || e), 'error');
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Crear carta';
    AdminUI.toast('Carta creada', 'success');
    cerrarModales();
    await cargarCartas();
  }

  // Siembra una carta de ejemplo (2 secciones × 2 productos, ya activa) para una
  // empresa que arranca sin cartas. Después el dueño edita/borra desde el editor.
  async function sembrarCartaEjemplo() {
    if (!state.cartasContexto) return;
    const btn = document.getElementById('btn-carta-ejemplo');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando carta de ejemplo…'; }
    try {
      await window.GCFirestore.sembrarCartaEjemplo(state.cartasContexto.idEmpresa);
      AdminUI.toast('Carta de ejemplo lista — editala y publicala', 'success');
      await cargarCartas();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '🍽️ Empezar con una carta de ejemplo'; }
      AdminUI.toast('No pudimos crear la carta de ejemplo: ' + ((e && e.message) || e), 'error');
    }
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

    let r;
    try {
      r = await window.GCFirestore.duplicarCarta(
        state.cartasContexto.idEmpresa, state.cartaDuplicarId, nombreNueva, modificador
      );
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Duplicar carta';
      AdminUI.toast('No pudimos duplicar la carta: ' + ((e && e.message) || e), 'error');
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Duplicar carta';
    AdminUI.toast(
      'Carta duplicada · ' + r.secciones_copiadas + ' secciones, ' + r.productos_copiados + ' productos',
      'success'
    );
    cerrarModales();
    await cargarCartas();
  }

  // --- Editar ---

  async function abrirModalEditarCarta(idCarta) {
    AdminUI.setLoading(true);
    // FS (Etapa 2, frente B): la metadata de la carta se lee de Firestore (antes GAS
    // cartaObtenerCompleta → planilla, que quedaba viejo porque el guardado ya es FS).
    let c;
    try {
      const idEmpresa = state.cartasContexto.idEmpresa;
      c = await window.GCFirestore.leerCartaMetadata(idEmpresa, idCarta);
    } catch (e) {
      AdminUI.setLoading(false);
      console.error('[FS] no se pudo leer la metadata de la carta:', e && e.message);
      AdminUI.toast('No pudimos cargar la carta', 'error');
      return;
    }
    AdminUI.setLoading(false);

    state.cartaEditarId = idCarta;

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

    // Selector de templates (pieles). Hidrata desde FS antes de pintar (cae al
    // código si FS no responde). Await seguro: asegurarPielesFS nunca rechaza.
    state.cartaEditarTemplate = c.Template || 'minimalista';
    await asegurarPielesFS();
    renderTemplatesGrid();

    document.getElementById('modal-carta-editar').classList.add('is-visible');
  }

  // Fábrica (sub-paso 3): hidrata el catálogo de pieles desde Firestore UNA vez
  // (promesa cacheada). Si FS falla (reglas, auth, red), atrapa y cae al catálogo
  // del código: el selector muestra igual las pieles hardcodeadas. Cero riesgo.
  var _pielesFSPromise = null;
  function asegurarPielesFS() {
    if (_pielesFSPromise) return _pielesFSPromise;
    _pielesFSPromise = (async function () {
      try {
        if (!window.GCFirestore || !GCFirestore.leerPieles || typeof GranCartaPieles === 'undefined') return;
        const arr = await GCFirestore.leerPieles();
        const n = GranCartaPieles.hidratar(arr);
        console.log('[Pieles] hidratadas ' + n + ' pieles desde Firestore.');
      } catch (e) {
        console.warn('[Pieles] no se pudo leer de Firestore; uso el catálogo del código:', e && e.message);
      }
    })();
    return _pielesFSPromise;
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

    const idEmpresa = state.cartasContexto.idEmpresa;
    const idCarta = state.cartaEditarId;
    try {
      // Firestore directo: actualizar la carta y rehornear (los cambios de
      // nombre/redondeo/pie/template/notas afectan lo que ve el comensal).
      await window.GCFirestore.actualizarCarta(idEmpresa, idCarta, cambios);
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
      AdminUI.toast('No pudimos guardar: ' + ((e && e.message) || e), 'error');
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
    AdminUI.toast('Cambios guardados', 'success');
    cerrarModales();
    await cargarCartas();
  }

  // --- Activar ---

  async function activarCarta(idCarta, nombreCarta) {
    const confirmar = await AdminUI.confirm({
      title: '¿Activar esta carta?',
      message: '"' + nombreCarta + '" pasará a estado activa, lista para publicar en los canales que elijas. Puede haber varias cartas activas a la vez.',
      okLabel: 'Activar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    const idEmpresa = state.cartasContexto.idEmpresa;
    AdminUI.setLoading(true);
    try {
      await window.GCFirestore.actualizarCarta(idEmpresa, idCarta, { estado: 'activa' });
    } catch (e) {
      AdminUI.setLoading(false);
      AdminUI.toast('No pudimos activar: ' + ((e && e.message) || e), 'error');
      return;
    }
    AdminUI.setLoading(false);
    AdminUI.toast('Carta activada', 'success');
    await cargarCartas();
  }

  // --- Archivar ---

  async function archivarCarta(idCarta, nombreCarta) {
    const idEmpresa = state.cartasContexto.idEmpresa;

    // Guarda (desde memoria): no se archiva una carta publicada en algún canal.
    const porLocal = (state.publicacionesPorEmpresa && state.publicacionesPorEmpresa[idEmpresa]) || {};
    const localesPublicando = [];
    Object.keys(porLocal).forEach(function (idLocal) {
      const pubs = porLocal[idLocal] || [];
      if (pubs.some(function (p) { return p.Id_Carta === idCarta; })) localesPublicando.push(idLocal);
    });
    if (localesPublicando.length > 0) {
      AdminUI.toast('No podés archivar esta carta: está publicada en ' + localesPublicando.length +
                    ' local(es). Activá otra carta en esos canales primero.', 'error');
      return;
    }

    const confirmar = await AdminUI.confirm({
      title: '¿Archivar esta carta?',
      message: '"' + nombreCarta + '" se va a archivar (no se borra, queda oculta). Podés recuperarla cambiándole el estado en Firestore si lo necesitás.',
      okLabel: 'Archivar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    AdminUI.setLoading(true);
    try {
      await window.GCFirestore.actualizarCarta(idEmpresa, idCarta, { estado: 'archivada' });
    } catch (e) {
      AdminUI.setLoading(false);
      AdminUI.toast('No pudimos archivar: ' + ((e && e.message) || e), 'error');
      return;
    }
    AdminUI.setLoading(false);
    AdminUI.toast('Carta archivada', 'success');
    await cargarCartas();
  }

  // --- Editor (Sesión B: secciones y productos) ---

  async function abrirEditorCarta(idCarta) {
    const idEmpresa = state.cartasContexto && state.cartasContexto.idEmpresa;
    AdminUI.setLoading(true);
    let datos;
    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa) throw new Error('falta idEmpresa en el contexto');
      // Hidratar las pieles de FS (Fábrica) EN PARALELO con la lectura de la carta.
      // Deja PRESETS listo antes de cualquier rehorneo posterior (publicar, precios,
      // editar, toggle) → la piel congelada en menus_publicados es la correcta y no
      // cae a 'minimalista'. Await seguro: asegurarPielesFS nunca rechaza. Se solapa
      // con leerCartaCompleta bajo el mismo spinner → sin latencia extra.
      const pielesReady = asegurarPielesFS();
      datos = await window.GCFirestore.leerCartaCompleta(idEmpresa, idCarta);
      await pielesReady;
    } catch (e) {
      AdminUI.setLoading(false);
      console.error('[Firestore] error leyendo la carta:', e && e.message);
      AdminUI.toast('No pudimos cargar la carta', 'error');
      return;
    }
    AdminUI.setLoading(false);

    state.editorContexto = {
      idCarta: idCarta,
      idEmpresa: idEmpresa,
      carta: datos.carta,
      secciones: datos.secciones || [],
      stats: datos.stats || { cantidad_secciones: 0, cantidad_productos: 0, productos_disponibles: 0 }
    };

    document.getElementById('editor-titulo').textContent = datos.carta.Nombre;
    document.getElementById('editor-subtitulo').textContent =
      (state.cartasContexto
        ? (state.cartasContexto.nombreLocal
            ? state.cartasContexto.nombreLocal + ' · ' + state.cartasContexto.nombreEmpresa
            : state.cartasContexto.nombreEmpresa)
        : '');

    // Mostrar/ocultar botón "📤 Publicar ahora" según Estado de la carta
    // Solo "activa" = "lista para publicar" puede publicarse.
    // borrador → no se puede (todavía está en construcción)
    // archivada → no se puede (descartada)
    actualizarBotonPublicarEnEditor(datos.carta);

    cambiarTabEditor('contenido');
    AdminUI.mostrarPantalla('screen-editor');
    renderEditor();
  }

  async function recargarEditor() {
    if (!state.editorContexto) return;
    const idEmpresa = state.editorContexto.idEmpresa || (state.cartasContexto && state.cartasContexto.idEmpresa);
    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa) throw new Error('falta idEmpresa');
      const datos = await window.GCFirestore.leerCartaCompleta(idEmpresa, state.editorContexto.idCarta);
      state.editorContexto.carta = datos.carta;
      state.editorContexto.secciones = datos.secciones || [];
      state.editorContexto.stats = datos.stats || {};
      actualizarBotonPublicarEnEditor(datos.carta);
      renderEditor();
    } catch (e) {
      console.error('[Firestore] error recargando el editor:', e && e.message);
      AdminUI.toast('No pudimos recargar', 'error');
    }
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
          // v1.5: estado de visibilidad de 3 valores ('visible'|'agotado'|'oculto').
          // Fallback al booleano viejo por si una fila no trae el campo nuevo.
          const estadoVis = p.Estado_Visibilidad || (p.Disponible_Hoy ? 'visible' : 'oculto');
          const disponible = estadoVis === 'visible';

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

          // v1.5: control de 3 estados (semáforo). Siempre uno activo.
          // verde=visible, ámbar=agotado, gris=oculto. Estilos inline para que
          // funcione sin depender de CSS nuevo.
          const _segBtn = function(val, label, colOn) {
            const on = estadoVis === val;
            return '<button type="button"' +
              ' onclick="toggleDisponible(\'' + p.Id_Producto + '\',\'' + val + '\')"' +
              ' title="' + label + '"' +
              ' style="flex:1 0 auto;border:none;cursor:pointer;padding:7px 10px;' +
              'font-size:11px;font-weight:700;letter-spacing:.02em;line-height:1;white-space:nowrap;' +
              'background:' + (on ? colOn : 'transparent') + ';' +
              'color:' + (on ? '#fff' : '#9ca3af') + ';' +
              'transition:background .12s,color .12s;">' + label + '</button>';
          };
          const segHtml =
            '<div style="display:inline-flex;margin-right:14px;border:1px solid #374151;' +
            'border-radius:8px;overflow:hidden;background:#111827;">' +
              _segBtn('visible', 'Visible', '#16a34a') +
              '<span style="width:1px;background:#374151;flex:0 0 auto;"></span>' +
              _segBtn('agotado', 'Agotado', '#d97706') +
              '<span style="width:1px;background:#374151;flex:0 0 auto;"></span>' +
              _segBtn('oculto', 'Oculto', '#6b7280') +
            '</div>';

          html += `
            <div class="producto-row ${disponible ? '' : 'is-unavailable'}">
              <div class="producto-toggle">
                ${segHtml}
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
    if (tab === 'precios') renderTabPrecios();
  }

  // ============================================================
  // PESTAÑA "PRECIOS" — modificación masiva sobre la carta abierta.
  // Porcentaje o monto fijo, subir/bajar, toda la carta o secciones
  // elegidas. Respeta el redondeo de la carta. Vista previa obligatoria
  // + clamp a $0. Escribe con batch y rehornea. No toca GAS.
  // ============================================================
  function renderTabPrecios() {
    const ctx = state.editorContexto;
    if (!ctx) return;

    // Redondeo de la carta (informativo; se aplica siempre).
    const modo = ctx.carta.Redondeo || '10';
    document.getElementById('precios-redondeo-info').textContent = (modo === 'sin')
      ? 'Sin redondear (conserva centavos).'
      : 'Múltiplos de $' + modo + '. Se aplica automáticamente al resultado.';

    // Checkboxes de secciones (todas tildadas por defecto).
    document.getElementById('precios-secciones').innerHTML = ctx.secciones.map(function(s) {
      const n = (s.productos || []).length;
      return '<label class="precios-seccion-check">'
        + '<input type="checkbox" value="' + AdminUI.escapeHtml(s.Id_Seccion) + '" checked onchange="onPreciosCambio()">'
        + '<span>' + AdminUI.escapeHtml(s.Nombre) + ' <small>(' + n + ')</small></span></label>';
    }).join('');

    onPreciosCambio();
  }

  function onPreciosAlcanceCambio() {
    const alcanceEl = document.querySelector('input[name="precios-alcance"]:checked');
    const alcance = alcanceEl ? alcanceEl.value : 'carta';
    document.getElementById('precios-secciones').style.display = (alcance === 'secciones') ? '' : 'none';
    onPreciosCambio();
  }

  function onPreciosCambio() {
    const tipoEl = document.querySelector('input[name="precios-tipo"]:checked');
    const tipo = tipoEl ? tipoEl.value : 'pct';
    document.getElementById('precios-valor-unidad').textContent = (tipo === 'pct') ? '%' : '$';
    renderPreviewPrecios();
  }

  // Calcula la lista de cambios {idProducto, nombre, precioViejo, precioNuevo}
  // según el alcance y la operación elegidos. Aplica clamp a $0 y el redondeo
  // de la carta (misma función que el resto del sistema).
  function _calcularCambiosPrecios() {
    const ctx = state.editorContexto;
    if (!ctx) return [];

    const alcanceEl = document.querySelector('input[name="precios-alcance"]:checked');
    const alcance = alcanceEl ? alcanceEl.value : 'carta';
    const tipoEl = document.querySelector('input[name="precios-tipo"]:checked');
    const tipo = tipoEl ? tipoEl.value : 'pct';
    const dirEl = document.querySelector('input[name="precios-dir"]:checked');
    const dir = dirEl ? dirEl.value : 'subir';
    const valor = parseFloat(document.getElementById('precios-valor').value);

    if (isNaN(valor) || valor <= 0) return [];

    let secciones = ctx.secciones;
    if (alcance === 'secciones') {
      const marcadas = {};
      document.querySelectorAll('#precios-secciones input[type="checkbox"]:checked').forEach(function(cb) {
        marcadas[cb.value] = true;
      });
      secciones = ctx.secciones.filter(function(s) { return marcadas[s.Id_Seccion]; });
    }

    const signo = (dir === 'bajar') ? -1 : 1;
    const modo = ctx.carta.Redondeo || '10';
    const cambios = [];

    secciones.forEach(function(s) {
      (s.productos || []).forEach(function(p) {
        const actual = Number(p.Precio) || 0;
        let nuevo = (tipo === 'pct')
          ? actual * (1 + signo * valor / 100)
          : actual + signo * valor;
        if (nuevo < 0) nuevo = 0;                                  // clamp a $0
        nuevo = window.GCFirestore.redondearPrecio(nuevo, modo);
        if (nuevo < 0) nuevo = 0;                                  // por si el redondeo baja de 0
        cambios.push({
          idProducto: p.Id_Producto, nombre: p.Nombre,
          precioViejo: actual, precioNuevo: nuevo
        });
      });
    });
    return cambios;
  }

  function renderPreviewPrecios() {
    const cont = document.getElementById('precios-preview');
    const btn = document.getElementById('btn-precios-aplicar');
    const cambios = _calcularCambiosPrecios();
    state.preciosCambios = cambios;

    if (cambios.length === 0) {
      cont.innerHTML = '<div class="precios-preview-empty">Elegí una operación y un valor mayor a 0 para ver la vista previa.</div>';
      btn.disabled = true;
      btn.textContent = 'Aplicar';
      return;
    }

    let filas = '';
    cambios.forEach(function(c) {
      const igual = c.precioNuevo === c.precioViejo;
      filas += '<div class="precios-preview-fila' + (igual ? ' is-igual' : '') + '">'
        + '<span class="precios-preview-nom">' + AdminUI.escapeHtml(c.nombre) + '</span>'
        + '<span class="precios-preview-precios">'
        + '<span class="precios-viejo">' + _catPrecioFmt(c.precioViejo) + '</span>'
        + '<span class="precios-flecha">→</span>'
        + '<span class="precios-nuevo">' + _catPrecioFmt(c.precioNuevo) + '</span>'
        + '</span></div>';
    });
    cont.innerHTML =
      '<div class="precios-preview-titulo">Vista previa (' + cambios.length + ' producto(s) afectado(s))</div>' + filas;
    btn.disabled = false;
    btn.textContent = 'Aplicar a ' + cambios.length + ' producto(s)';
  }

  async function aplicarPrecios() {
    const ctx = state.editorContexto;
    const cambios = state.preciosCambios || [];
    if (!ctx || cambios.length === 0) return;

    const idEmpresa = ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa);
    const idCarta   = ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta);

    const ok = await AdminUI.confirm({
      title: 'Aplicar cambio de precios',
      message: 'Vas a actualizar ' + cambios.length + ' precio(s) en esta carta. No hay "deshacer" (se revierte aplicando la operación inversa). ¿Confirmás?',
      okLabel: 'Sí, aplicar',
      cancelLabel: 'Cancelar'
    });
    if (!ok) return;

    const btn = document.getElementById('btn-precios-aplicar');
    btn.disabled = true;
    btn.textContent = 'Aplicando…';

    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');

      await window.GCFirestore.actualizarPreciosMasivo(idEmpresa, idCarta,
        cambios.map(function(c) { return { idProducto: c.idProducto, precio: c.precioNuevo }; }));

      // Reflejar en memoria (Contenido y la preview quedan al día sin recargar).
      const nuevoPorId = {};
      cambios.forEach(function(c) { nuevoPorId[c.idProducto] = c.precioNuevo; });
      ctx.secciones.forEach(function(s) {
        (s.productos || []).forEach(function(p) {
          if (Object.prototype.hasOwnProperty.call(nuevoPorId, p.Id_Producto)) p.Precio = nuevoPorId[p.Id_Producto];
        });
      });

      AdminUI.toast(cambios.length + ' precio(s) actualizado(s)', 'success');
      renderEditor();                                       // refresca el tab Contenido
      document.getElementById('precios-valor').value = '';  // limpiar → preview vacía
      renderPreviewPrecios();

      // Rehornear (el comensal ve los precios nuevos).
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      console.error('[FS] no se pudo aplicar el cambio de precios:', e && e.message);
      AdminUI.toast('No pudimos aplicar los cambios. Reintentá.', 'error');
      btn.disabled = false;
      renderPreviewPrecios();
    }
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

    const ctx = state.editorContexto;
    const idEmpresa = (ctx && (ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa)));
    const idCarta   = (ctx && (ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta)));
    const esEditar = !!state.seccionEditarId;

    // ---- EDITAR: FIRESTORE PRIMERO + cero recarga (vuela) ----
    if (esEditar) {
      const idSeccion = state.seccionEditarId;
      ctx.secciones.forEach(function(s) {
        if (s.Id_Seccion === idSeccion) { s.Nombre = nombre; s.Descripcion = descripcion; }
      });
      cerrarModales();
      renderEditor();
      AdminUI.toast('Sección actualizada', 'success');

      try {
        if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
        if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');
        await window.GCFirestore.actualizarSeccion(idEmpresa, idCarta, idSeccion, {
          nombre: nombre, descripcion: descripcion
        });
        await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
      } catch (e) {
        console.warn('[Firestore] no se pudo guardar la sección:', e && e.message);
        AdminUI.toast('No pudimos guardar el cambio. Reintentá.', 'error');
        await recargarEditor();
        return;
      }
      return;
    }

    // ---- CREAR: 100% FIRESTORE (sin GAS). Firestore genera el ID SCC-XXXX. ----
    const btn = document.getElementById('btn-seccion-guardar');
    btn.disabled = true;
    btn.textContent = 'Creando…';

    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');

      // 1) Generar ID en Firestore (SCC-XXXX, transacción atómica).
      const idSeccionNueva = await window.GCFirestore.generarId('SCC');

      // 2) Orden = última + 1.
      let maxOrden = 0;
      ctx.secciones.forEach(function(s) { if ((s.Orden||0) > maxOrden) maxOrden = s.Orden; });
      const ordenNueva = maxOrden + 1;

      // 3) Crear la sección en Firestore.
      await window.GCFirestore.crearSeccion(idEmpresa, idCarta, idSeccionNueva, {
        nombre: nombre, descripcion: descripcion, orden: ordenNueva
      });

      // 4) Reflejar en pantalla al instante.
      ctx.secciones.push({
        Id_Seccion: idSeccionNueva, Nombre: nombre, Descripcion: descripcion,
        Orden: ordenNueva, productos: []
      });
      if (ctx.stats) ctx.stats.cantidad_secciones = (ctx.stats.cantidad_secciones || 0) + 1;

      btn.disabled = false;
      btn.textContent = 'Crear sección';
      AdminUI.toast('Sección creada', 'success');
      cerrarModales();
      renderEditor();

      // 5) Rehornear.
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Crear sección';
      console.error('[Firestore] no se pudo crear la sección:', e && e.message);
      AdminUI.toast('No pudimos crear la sección. Reintentá.', 'error');
    }
  }

  async function ordenarSeccion(idSeccion, direccion) {
    const ctx = state.editorContexto;
    if (!ctx) return;
    const idEmpresa = ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa);
    const idCarta   = ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta);

    const hermanas = ctx.secciones.slice().sort(function(a,b){ return (a.Orden||0)-(b.Orden||0); });
    const idx = hermanas.findIndex(function(s){ return s.Id_Seccion === idSeccion; });
    if (idx === -1) return;
    const idxObj = direccion === 'arriba' ? idx - 1 : idx + 1;
    if (idxObj < 0 || idxObj >= hermanas.length) {
      AdminUI.toast('La sección ya está en el extremo', 'info');
      return;
    }
    const A = hermanas[idx], B = hermanas[idxObj];
    const ordenA = A.Orden || 0, ordenB = B.Orden || 0;

    // 1) PANTALLA AL INSTANTE: intercambiar Orden en memoria y redibujar (vuela).
    A.Orden = ordenB;
    B.Orden = ordenA;
    renderEditor();

    // 2) Firestore + rehornear.
    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');
      await window.GCFirestore.intercambiarOrdenSecciones(idEmpresa, idCarta, A.Id_Seccion, ordenA, B.Id_Seccion, ordenB);
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      console.warn('[Firestore] no se pudo reordenar la sección:', e && e.message);
      AdminUI.toast('No pudimos reordenar. Reintentá.', 'error');
      await recargarEditor();
      return;
    }
  }

  async function eliminarSeccion(idSeccion, nombreSeccion, cantidadProductos) {
    let mensaje = '"' + nombreSeccion + '" se va a eliminar definitivamente.';
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

    const ctx = state.editorContexto;
    const idEmpresa = ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa);
    const idCarta   = ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta);

    // FIRESTORE PRIMERO: borrar sección + sus productos (físico, definitivo).
    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');
      await window.GCFirestore.eliminarSeccionConProductos(idEmpresa, idCarta, idSeccion);
    } catch (e) {
      console.warn('[Firestore] no se pudo eliminar la sección:', e && e.message);
      AdminUI.toast('No pudimos eliminar la sección. Reintentá.', 'error');
      return;
    }

    // Sacar de la pantalla al instante.
    ctx.secciones = ctx.secciones.filter(function(s){ return s.Id_Seccion !== idSeccion; });
    if (ctx.stats) {
      ctx.stats.cantidad_secciones = ctx.secciones.length;
      let cp = 0, disp = 0;
      ctx.secciones.forEach(function(s){ s.productos.forEach(function(p){ cp++; if ((p.Estado_Visibilidad||'')==='visible') disp++; }); });
      ctx.stats.cantidad_productos = cp;
      ctx.stats.productos_disponibles = disp;
    }
    renderEditor();
    AdminUI.toast('Sección eliminada', 'success');

    // Rehornear (el comensal deja de verla).
    try { await rehornearLocalesDeLaCarta(idEmpresa, idCarta); }
    catch (e) { console.warn('[Firestore] no se pudo rehornear tras eliminar sección:', e && e.message); }
  }

  // ============================================================
  // PRODUCTOS (modales y CRUD)
  // ============================================================

  async function abrirModalProductoNuevo(idSeccion) {
    state.productoEditarId = null;
    state.productoSeccionId = idSeccion;
    state.productoCatPick = null;
    document.getElementById('modal-producto-titulo').textContent = 'Nuevo producto';
    document.getElementById('producto-nombre').value = '';
    document.getElementById('producto-descripcion').value = '';
    document.getElementById('producto-precio').value = '';
    document.getElementById('producto-vegetariano').checked = false;
    document.getElementById('producto-sin-tacc').checked = false;
    document.getElementById('producto-picante').checked = false;
    document.querySelectorAll('[data-alergeno]').forEach(function(cb) { cb.checked = false; });
    document.getElementById('btn-producto-guardar').textContent = 'Crear producto';

    // Paso 2: mostrar buscador del catálogo + checkbox de mirror (solo en alta).
    document.getElementById('producto-cat-buscar').style.display = '';
    document.getElementById('producto-cat-mirror-field').style.display = '';
    document.getElementById('producto-cat-search').value = '';
    document.getElementById('producto-cat-results').innerHTML = '';
    _resetMirrorCheckbox();

    actualizarHintRedondeo();

    document.getElementById('modal-producto').classList.add('is-visible');
    setTimeout(function() { document.getElementById('producto-cat-search').focus(); }, 200);

    // Cargar el catálogo de la empresa para el buscador (best-effort).
    await _cargarCatalogoEditor();
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
    state.productoCatPick = null;

    // Paso 2: al editar un producto que ya existe, no hay interacción con el
    // catálogo (ni buscador ni mirror).
    document.getElementById('producto-cat-buscar').style.display = 'none';
    document.getElementById('producto-cat-mirror-field').style.display = 'none';

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

  // ============================================================
  // PASO 2 · Buscador del catálogo dentro del modal "Nuevo producto".
  // Modelo: el catálogo es un MOLDE. Elegir rellena los campos (copia);
  // editar el precio acá NO toca la base. El alta a mano puede espejarse
  // al catálogo (checkbox), en una sola dirección. Cero sincronización.
  // ============================================================
  function _idEmpresaEditor() {
    const ctx = state.editorContexto;
    return ctx && (ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa));
  }

  async function _cargarCatalogoEditor() {
    state.catalogoEditor = [];
    const idEmpresa = _idEmpresaEditor();
    if (!idEmpresa || !window.GCFirestore) return;
    try {
      state.catalogoEditor = await window.GCFirestore.catalogoListar(idEmpresa);
    } catch (e) {
      console.warn('[FS] no se pudo cargar el catálogo para el buscador:', e && e.message);
    }
  }

  function _resetMirrorCheckbox() {
    const chk = document.getElementById('producto-cat-mirror');
    chk.checked = true;
    chk.disabled = false;
    document.getElementById('producto-cat-mirror-field').classList.remove('is-locked');
    document.getElementById('producto-cat-mirror-hint').textContent =
      'Se suma a tu base de productos para reusarlo en otras cartas.';
  }

  function buscarEnCatalogoProducto() {
    const term = (document.getElementById('producto-cat-search').value || '').toLowerCase().trim();
    const cont = document.getElementById('producto-cat-results');
    const lista = state.catalogoEditor || [];

    if (!term) { cont.innerHTML = ''; return; }

    const matches = lista.filter(function(p) {
      return (p.Nombre || '').toLowerCase().indexOf(term) !== -1
          || (p.Detalle || '').toLowerCase().indexOf(term) !== -1;
    }).slice(0, 8);

    if (matches.length === 0) {
      cont.innerHTML = '<div class="cat-search-empty">Sin coincidencias. Cargalo abajo como producto nuevo (queda tildado “También guardar en el catálogo”).</div>';
      return;
    }

    let html = '';
    matches.forEach(function(p) {
      const det = p.Detalle
        ? '<span class="cat-res-det">' + AdminUI.escapeHtml(p.Detalle) + '</span>'
        : '';
      html += `
        <button type="button" class="cat-res" onclick="elegirDelCatalogo('${AdminUI.escapeHtml(p.Id_Catalogo)}')">
          <span class="cat-res-nom">${AdminUI.escapeHtml(p.Nombre)}</span>
          ${det}
          <span class="cat-res-precio">${_catPrecioFmt(p.Precio)}</span>
        </button>
      `;
    });
    cont.innerHTML = html;
  }

  function elegirDelCatalogo(idCat) {
    const p = (state.catalogoEditor || []).find(function(x) { return x.Id_Catalogo === idCat; });
    if (!p) return;
    state.productoCatPick = idCat;

    document.getElementById('producto-nombre').value = p.Nombre || '';
    document.getElementById('producto-descripcion').value = p.Detalle || '';
    document.getElementById('producto-precio').value = (p.Precio === 0 || p.Precio) ? p.Precio : '';

    // Vino del catálogo → ya está en la base: apagar y bloquear el mirror.
    const chk = document.getElementById('producto-cat-mirror');
    chk.checked = false;
    chk.disabled = true;
    document.getElementById('producto-cat-mirror-field').classList.add('is-locked');
    document.getElementById('producto-cat-mirror-hint').textContent = 'Ya está en el catálogo.';

    // Limpiar la búsqueda y saltar al precio (lo más común de ajustar por carta).
    document.getElementById('producto-cat-search').value = '';
    document.getElementById('producto-cat-results').innerHTML = '';
    const precio = document.getElementById('producto-precio');
    precio.focus(); precio.select();
  }

  // Si editás el nombre después de haber elegido del catálogo, dejás de estar
  // "atado" a ese pick → se reactiva la opción de guardarlo en el catálogo.
  function productoNombreEditado() {
    if (state.productoCatPick) {
      state.productoCatPick = null;
      _resetMirrorCheckbox();
    }
  }

  // Espeja el producto al catálogo si el checkbox está tildado y NO vino del
  // catálogo. Dedup por nombre+detalle. Devuelve true si lo agregó (para el toast).
  async function _mirrorAlCatalogoSiCorresponde(idEmpresa, nombre, detalle, precio) {
    const chk = document.getElementById('producto-cat-mirror');
    if (!chk || !chk.checked) return false;
    if (state.productoCatPick) return false;
    if (!window.GCFirestore) return false;

    const claveNueva = _catNorm(nombre) + '¦' + _catNorm(detalle);
    const yaExiste = (state.catalogoEditor || []).some(function(p) {
      return (_catNorm(p.Nombre) + '¦' + _catNorm(p.Detalle)) === claveNueva;
    });
    if (yaExiste) return false;

    await window.GCFirestore.catalogoCrear(idEmpresa, {
      nombre: nombre, detalle: detalle, precio: precio
    });
    return true;
  }

  async function confirmarProducto() {
    const nombre = document.getElementById('producto-nombre').value.trim();
    const descripcion = document.getElementById('producto-descripcion').value.trim();
    const precioCrudo = document.getElementById('producto-precio').value.trim();
    const precio = parseFloat(precioCrudo);

    if (nombre.length < 1) { AdminUI.toast('Poné un nombre al producto', 'error'); return; }
    // El precio $0 es válido (ej: "Servicio de mesa"), pero el campo NO puede estar vacío.
    if (precioCrudo === '') { AdminUI.toast('Falta el precio. Poné 0 si es sin cargo.', 'error'); return; }
    if (isNaN(precio)) { AdminUI.toast('El precio no es un número válido', 'error'); return; }
    if (precio < 0) { AdminUI.toast('El precio no puede ser negativo', 'error'); return; }

    const alergenos = [];
    document.querySelectorAll('[data-alergeno]').forEach(function(cb) {
      if (cb.checked) alergenos.push(cb.dataset.alergeno);
    });
    const etiquetasObj = {
      alergenos: alergenos,
      vegetariano: document.getElementById('producto-vegetariano').checked,
      sin_tacc: document.getElementById('producto-sin-tacc').checked,
      picante: document.getElementById('producto-picante').checked
    };
    const etiquetasJson = JSON.stringify(etiquetasObj);
    const payloadGas = { nombre: nombre, descripcion: descripcion, precio: precio, etiquetas_json: etiquetasJson };

    const ctx = state.editorContexto;
    const idEmpresa = (ctx && (ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa)));
    const idCarta   = (ctx && (ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta)));
    const esEditar = !!state.productoEditarId;

    // =====================================================================
    // CASO A — EDITAR: FIRESTORE PRIMERO + cero recarga (vuela).
    // =====================================================================
    if (esEditar) {
      const idProducto = state.productoEditarId;

      // 1) Pantalla al instante (memoria) + cerrar modal.
      ctx.secciones.forEach(function(s) {
        s.productos.forEach(function(p) {
          if (p.Id_Producto === idProducto) {
            p.Nombre = nombre; p.Descripcion = descripcion; p.Precio = precio; p.Etiquetas = etiquetasObj;
          }
        });
      });
      cerrarModales();
      renderEditor();
      AdminUI.toast('Producto actualizado', 'success');

      // 2) Firestore (fuente de verdad) + rehornear.
      try {
        if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
        if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');
        await window.GCFirestore.actualizarProducto(idEmpresa, idCarta, idProducto, {
          nombre: nombre, descripcion: descripcion, precio: precio, etiquetas: etiquetasObj
        });
        await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
      } catch (e) {
        console.warn('[Firestore] no se pudo guardar la edición:', e && e.message);
        AdminUI.toast('No pudimos guardar el cambio. Reintentá.', 'error');
        await recargarEditor();
        return;
      }
      return;
    }

    // =====================================================================
    // CASO B — CREAR: 100% FIRESTORE (sin GAS). Firestore genera el ID.
    // =====================================================================
    const btn = document.getElementById('btn-producto-guardar');
    btn.disabled = true;
    btn.textContent = 'Creando…';

    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');

      // 1) Generar ID en Firestore (PRD-XXXX, transacción atómica).
      const idProductoNuevo = await window.GCFirestore.generarId('PRD');

      // 2) Calcular el orden (último + 1 dentro de la sección).
      const idSeccion = state.productoSeccionId;
      let maxOrden = 0;
      ctx.secciones.forEach(function(s) {
        if (s.Id_Seccion === idSeccion) {
          s.productos.forEach(function(p) { if ((p.Orden||0) > maxOrden) maxOrden = p.Orden; });
        }
      });
      const ordenNuevo = maxOrden + 1;

      // 3) Crear el producto en Firestore.
      await window.GCFirestore.crearProducto(idEmpresa, idCarta, idProductoNuevo, {
        id_seccion: idSeccion,
        nombre: nombre,
        descripcion: descripcion,
        precio: precio,
        foto_url: '',
        etiquetas: etiquetasObj,
        estado_visibilidad: 'visible',
        disponible_hoy: true,
        orden: ordenNuevo
      });

      // 4) Reflejar en pantalla al instante (sin recargar).
      ctx.secciones.forEach(function(s) {
        if (s.Id_Seccion === idSeccion) {
          s.productos.push({
            Id_Producto: idProductoNuevo, Id_Seccion: idSeccion,
            Nombre: nombre, Descripcion: descripcion, Precio: precio,
            Estado_Visibilidad: 'visible', Disponible_Hoy: true,
            Etiquetas: etiquetasObj, Orden: ordenNuevo
          });
        }
      });
      if (ctx.stats) {
        ctx.stats.cantidad_productos = (ctx.stats.cantidad_productos || 0) + 1;
        ctx.stats.productos_disponibles = (ctx.stats.productos_disponibles || 0) + 1;
      }

      // 4.5) Paso 2: espejar al catálogo si corresponde (alta a mano tildada).
      let mensajeOk = 'Producto creado';
      try {
        if (await _mirrorAlCatalogoSiCorresponde(idEmpresa, nombre, descripcion, precio)) {
          mensajeOk = 'Agregado a la carta y al catálogo';
        }
      } catch (e) {
        console.warn('[FS] no se pudo espejar al catálogo:', e && e.message);
      }

      btn.disabled = false;
      btn.textContent = 'Crear producto';
      AdminUI.toast(mensajeOk, 'success');
      cerrarModales();
      renderEditor();

      // 5) Rehornear (el comensal lo ve).
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Crear producto';
      console.error('[Firestore] no se pudo crear el producto:', e && e.message);
      AdminUI.toast('No pudimos crear el producto. Reintentá.', 'error');
    }
  }

  // Rehornea los locales que publican una carta dada (helper compartido).
  async function rehornearLocalesDeLaCarta(idEmpresa, idCarta) {
    if (!window.GCFirestore) return;
    const porLocal = (state.publicacionesPorEmpresa && state.publicacionesPorEmpresa[idEmpresa]) || {};
    const locales = [];
    Object.keys(porLocal).forEach(function(idLocal) {
      const pubs = porLocal[idLocal] || [];
      if (pubs.some(function(p){ return p.Id_Carta === idCarta; })) locales.push(idLocal);
    });
    if (locales.length > 0) {
      const r = await window.GCFirestore.hornearLocalesDeCarta(idEmpresa, idCarta, locales);
      console.log('[Firestore] rehorneado:', r.locales, 'local(es),', r.canales, 'canal(es).');
    } else {
      console.log('[Firestore] cambio guardado; la carta no está publicada en ningún local.');
    }
  }

  async function ordenarProducto(idProducto, direccion) {
    const ctx = state.editorContexto;
    if (!ctx) return;
    const idEmpresa = ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa);
    const idCarta   = ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta);

    // Encontrar la sección del producto y sus hermanos.
    let seccion = null;
    ctx.secciones.forEach(function(s){
      if (s.productos.some(function(p){ return p.Id_Producto === idProducto; })) seccion = s;
    });
    if (!seccion) return;

    const hermanos = seccion.productos.slice().sort(function(a,b){ return (a.Orden||0)-(b.Orden||0); });
    const idx = hermanos.findIndex(function(p){ return p.Id_Producto === idProducto; });
    const idxObj = direccion === 'arriba' ? idx - 1 : idx + 1;
    if (idxObj < 0 || idxObj >= hermanos.length) {
      AdminUI.toast('El producto ya está en el extremo', 'info');
      return;
    }
    const A = hermanos[idx], B = hermanos[idxObj];
    const ordenA = A.Orden || 0, ordenB = B.Orden || 0;

    // 1) PANTALLA AL INSTANTE.
    A.Orden = ordenB;
    B.Orden = ordenA;
    renderEditor();

    // 2) Firestore + rehornear.
    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');
      await window.GCFirestore.intercambiarOrdenProductos(idEmpresa, idCarta, A.Id_Producto, ordenA, B.Id_Producto, ordenB);
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      console.warn('[Firestore] no se pudo reordenar el producto:', e && e.message);
      AdminUI.toast('No pudimos reordenar. Reintentá.', 'error');
      await recargarEditor();
      return;
    }
  }

  async function toggleDisponible(idProducto, estado) {
    const ctx = state.editorContexto;
    if (!ctx) return;
    const disponibleHoy = (estado === 'visible');

    // 1) PANTALLA AL INSTANTE (memoria, sin recarga). El botón vuela.
    ctx.secciones.forEach(function(s) {
      s.productos.forEach(function(p) {
        if (p.Id_Producto === idProducto) {
          p.Estado_Visibilidad = estado;
          p.Disponible_Hoy = disponibleHoy;
        }
      });
    });
    let disponibles = 0;
    ctx.secciones.forEach(function(s) {
      s.productos.forEach(function(p) {
        if ((p.Estado_Visibilidad || (p.Disponible_Hoy ? 'visible' : 'oculto')) === 'visible') disponibles++;
      });
    });
    if (ctx.stats) ctx.stats.productos_disponibles = disponibles;
    renderEditor();

    // 2) FIRESTORE (fuente de verdad) + rehornear. Si falla, avisar y revertir leyendo FS.
    try {
      await espejarEstadoProductoEnFirestore(idProducto, estado, disponibleHoy);
    } catch (e) {
      console.warn('[Firestore] no se pudo guardar el toggle:', e && e.message);
      AdminUI.toast('No pudimos guardar el cambio. Reintentá.', 'error');
      await recargarEditor();   // recarga desde Firestore (rápido) para volver al estado real
      return;
    }
  }

  // Refleja el estado de un producto en Firestore y rehornea los locales que
  // publican su carta. No bloquea la UI (corre asincrónico). Errores: warn.
  async function espejarEstadoProductoEnFirestore(idProducto, estadoVisibilidad, disponibleHoy) {
    if (!window.GCFirestore) { console.warn('[Firestore] módulo no cargado'); return; }
    const ctx = state.editorContexto;
    if (!ctx) return;
    const idCarta = ctx.idCarta || (ctx.carta && ctx.carta.Id_Carta);
    const idEmpresa = ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa);
    if (!idCarta || !idEmpresa) { console.warn('[Firestore] faltan idCarta/idEmpresa'); return; }

    // 1) Escribir el estado del producto en la carta normalizada.
    await window.GCFirestore.setEstadoProducto(idEmpresa, idCarta, idProducto, {
      estado_visibilidad: estadoVisibilidad,
      disponible_hoy: (estadoVisibilidad === 'visible')
    });

    // 2) Locales que publican ESTA carta (de las publicaciones en memoria).
    const porLocal = (state.publicacionesPorEmpresa && state.publicacionesPorEmpresa[idEmpresa]) || {};
    const localesConEstaCarta = [];
    Object.keys(porLocal).forEach(function(idLocal) {
      const pubs = porLocal[idLocal] || [];
      const lapublica = pubs.some(function(p) { return p.Id_Carta === idCarta; });
      if (lapublica) localesConEstaCarta.push(idLocal);
    });

    // 3) Rehornear esos locales (si la carta no está publicada en ninguno,
    //    no hay nada que rehornear: el cambio queda en la carta normalizada).
    if (localesConEstaCarta.length > 0) {
      const r = await window.GCFirestore.hornearLocalesDeCarta(idEmpresa, idCarta, localesConEstaCarta);
      console.log('[Firestore] rehorneado:', r.locales, 'local(es),', r.canales, 'canal(es).');
    } else {
      console.log('[Firestore] producto actualizado; la carta no está publicada en ningún local.');
    }
  }

  async function eliminarProducto(idProducto, nombreProducto) {
    const confirmar = await AdminUI.confirm({
      title: '¿Eliminar producto?',
      message: '"' + nombreProducto + '" se va a eliminar definitivamente de esta carta.',
      okLabel: 'Eliminar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmar) return;

    const ctx = state.editorContexto;
    const idEmpresa = (ctx && (ctx.idEmpresa || (ctx.carta && ctx.carta.Id_Empresa)));
    const idCarta   = (ctx && (ctx.idCarta   || (ctx.carta && ctx.carta.Id_Carta)));

    // 1) FIRESTORE PRIMERO: borrar el doc (definitivo). Es la fuente de verdad.
    try {
      if (!window.GCFirestore) throw new Error('módulo Firestore no cargado');
      if (!idEmpresa || !idCarta) throw new Error('faltan idEmpresa/idCarta');
      await window.GCFirestore.eliminarProducto(idEmpresa, idCarta, idProducto);
    } catch (e) {
      console.warn('[Firestore] no se pudo eliminar:', e && e.message);
      AdminUI.toast('No pudimos eliminar el producto. Reintentá.', 'error');
      return;
    }

    // 2) Sacar de la pantalla al instante (sin esperar recarga de GAS).
    ctx.secciones.forEach(function(s) {
      s.productos = s.productos.filter(function(p) { return p.Id_Producto !== idProducto; });
    });
    let disponibles = 0;
    ctx.secciones.forEach(function(s) {
      s.productos.forEach(function(p) {
        const ev = p.Estado_Visibilidad || (p.Disponible_Hoy ? 'visible' : 'oculto');
        if (ev === 'visible') disponibles++;
      });
    });
    if (ctx.stats) ctx.stats.productos_disponibles = disponibles;
    renderEditor();
    AdminUI.toast('Producto eliminado', 'success');

    // 3) Rehornear (el comensal deja de verlo) — espejo a menus_publicados.
    try {
      await rehornearLocalesDeLaCarta(idEmpresa, idCarta);
    } catch (e) {
      console.warn('[Firestore] no se pudo rehornear tras eliminar:', e && e.message);
    }

  }

  // ============================================================
  // VISTA PREVIA DE LA CARTA
  // ============================================================

  async function abrirVistaPrevia() {
    const ctx = state.editorContexto;
    if (!ctx) {
      AdminUI.toast('Cargá una carta primero', 'error');
      return;
    }

    // Hidrata las pieles de Firestore (Fábrica) antes de pintar. Si la carta usa
    // una piel que vive SOLO en FS y aún no se hidrató PRESETS en esta sesión, sin
    // esto la preview caería a 'minimalista'. Await seguro: nunca rechaza (cae al
    // catálogo del código si FS falla). La promesa está cacheada: instantánea luego.
    await asegurarPielesFS();

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

  // Abre el alta de sucursal para la empresa indicada (o la activa).
  // Reusa iniciarWizardLocal, que ya existe y está probado (es el mismo
  // que corre al crear la primera sucursal tras dar de alta una empresa).
  function nuevaSucursal(idEmpresa) {
    const empresas = state.estructura.empresas || [];
    const id = idEmpresa || state.idEmpresaActiva;
    let emp = id ? empresas.find(function(e) { return e.Id_Empresa === id; }) : null;
    if (!emp) emp = empresas[0] || null;
    if (!emp) {
      AdminUI.toast('No encontramos la empresa', 'error');
      return;
    }
    iniciarWizardLocal({ id_empresa: emp.Id_Empresa, nombreEmpresa: emp.Nombre_Comercial });
  }

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
          title: 'Datos de la sucursal',
          subtitle: 'Cargá los datos de la sucursal de ' + nombreEmpresa + '. Son todos necesarios para que tus clientes la encuentren y puedan contactarte — se completan una sola vez.'
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
          eyebrow: 'Paso 2 de 6',
          title: '¿Dónde queda?',
          subtitle: 'La dirección de la calle (sin ciudad, eso viene después).',
          field: 'direccion',
          placeholder: 'Av. Corrientes 1234',
          validate: function(d) { return AdminUI.validar.no_vacio(d.direccion); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 3 de 6',
          title: 'Ciudad',
          subtitle: '¿En qué ciudad está tu local?',
          field: 'ciudad',
          placeholder: 'Buenos Aires',
          validate: function(d) { return AdminUI.validar.no_vacio(d.ciudad); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 4 de 6',
          title: 'Provincia',
          subtitle: '¿Y la provincia?',
          field: 'provincia',
          placeholder: 'CABA',
          validate: function(d) { return AdminUI.validar.no_vacio(d.provincia); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 5 de 6',
          title: 'Teléfono del local',
          subtitle: 'Para que tu cliente pueda llamar al local desde la carta digital.',
          field: 'telefono',
          placeholder: '+54 11 4567 8900',
          inputType: 'tel',
          validate: function(d) { return AdminUI.validar.no_vacio(d.telefono) && AdminUI.validar.telefono(d.telefono); }
        },
        {
          type: 'input',
          eyebrow: 'Paso 6 de 6',
          title: 'Mail del local',
          subtitle: 'El mail de contacto de esta sucursal.',
          field: 'mail',
          placeholder: 'centro@lacantina.com',
          inputType: 'email',
          validate: function(d) { return AdminUI.validar.mail(d.mail); },
          validationMessage: function(d, valid) {
            if (!d.mail) return { text: '' };
            if (AdminUI.validar.mail(d.mail)) return { text: '✓ Mail válido', type: 'success' };
            return { text: 'Ingresá un mail válido', type: 'error' };
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
            return AdminUI.validar.no_vacio(d.nombre)
              && AdminUI.validar.no_vacio(d.direccion)
              && AdminUI.validar.no_vacio(d.ciudad)
              && AdminUI.validar.no_vacio(d.provincia)
              && AdminUI.validar.no_vacio(d.telefono)
              && AdminUI.validar.mail(d.mail);
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

  // ============================================================
  // EQUIPO / COLABORADORES (Bloque A — Nivel 2)
  // ============================================================

  const equipoState = {
    idEmpresa: null,
    nombreEmpresa: '',
    colaboradores: [],
    localesEmpresa: [],
    tipoNuevo: 'gerente'
  };

  async function abrirEquipo(idEmpresa) {
    equipoState.idEmpresa = idEmpresa;
    const emp = (state.estructura.empresas || []).find(function(e) {
      return e.Id_Empresa === idEmpresa;
    });
    equipoState.nombreEmpresa = emp ? emp.Nombre_Comercial : idEmpresa;

    AdminUI.mostrarPantalla('screen-equipo');
    document.getElementById('equipo-empresa-nombre').textContent = equipoState.nombreEmpresa;
    document.getElementById('equipo-buscador').value = '';
    document.getElementById('equipo-list').innerHTML =
      '<div class="equipo-loading">Cargando equipo…</div>';

    await cargarEquipo();
  }

  async function cargarEquipo() {
    // Colaboradores→FS (6/7): "Equipo" se lee SOLO de Firestore. Se retiró el
    // fallback a GAS (colaborador_listar) tras verificar FS en prod (bitácora 047).
    // Si FS falla, mostramos error y se reintenta (pantalla de bajo tráfico).
    let resp;
    try {
      resp = await window.GCFirestore.colaboradorListar(equipoState.idEmpresa);
    } catch (e) {
      console.error('[FS] colaboradorListar falló:', e && e.message);
      AdminUI.toast('No pudimos cargar el equipo. Reintentá.', 'error');
      document.getElementById('equipo-list').innerHTML = '';
      return;
    }
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No pudimos cargar el equipo', 'error');
      document.getElementById('equipo-list').innerHTML = '';
      return;
    }
    equipoState.colaboradores = resp.colaboradores || [];
    equipoState.localesEmpresa = resp.locales_empresa || [];

    const filtro = document.getElementById('equipo-filtro-local');
    let opts = '<option value="">Todos los locales</option>';
    equipoState.localesEmpresa.forEach(function(l) {
      opts += '<option value="' + l.id_local + '">' + AdminUI.escapeHtml(l.nombre) + '</option>';
    });
    filtro.innerHTML = opts;

    renderEquipo();
  }

  function renderEquipo() {
    const term = (document.getElementById('equipo-buscador').value || '').toLowerCase().trim();
    const localFiltro = document.getElementById('equipo-filtro-local').value || '';

    let lista = equipoState.colaboradores.slice();

    if (term) {
      lista = lista.filter(function(c) {
        return (c.mail || '').toLowerCase().indexOf(term) !== -1
            || (c.nombre || '').toLowerCase().indexOf(term) !== -1
            || (c.apellido || '').toLowerCase().indexOf(term) !== -1;
      });
    }

    if (localFiltro) {
      lista = lista.filter(function(c) {
        return c.es_dueno || c.locales_habilitados.indexOf(localFiltro) !== -1;
      });
    }

    const cont = document.getElementById('equipo-list');
    const empty = document.getElementById('equipo-empty');

    if (lista.length === 0) {
      cont.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    let html = '';
    lista.forEach(function(c) {
      const dniBadge = c.tiene_dni ? '' :
        '<span class="colab-badge colab-badge-warn">sin DNI</span>';

      if (c.es_dueno) {
        html += `
          <div class="colab-card">
            <div class="colab-card-main">
              <div class="colab-card-name">${AdminUI.escapeHtml(c.nombre || c.mail)} ${dniBadge}</div>
              <div class="colab-card-mail">${AdminUI.escapeHtml(c.mail)}</div>
            </div>
            <span class="colab-rol-badge is-dueno">${AdminUI.escapeHtml(c.rol_visible)}</span>
            <div class="colab-card-todo">✓ Acceso pleno (ve todo)</div>
          </div>
        `;
      } else {
        let checks = '';
        equipoState.localesEmpresa.forEach(function(l) {
          const habil = c.locales_habilitados.indexOf(l.id_local) !== -1;
          checks += `
            <label class="colab-local-check ${habil ? 'is-on' : ''}">
              <input type="checkbox" ${habil ? 'checked' : ''}
                onchange="toggleLocalColaborador('${c.mail}', '${l.id_local}', this.checked, ${c.locales_habilitados.length})">
              <span>${AdminUI.escapeHtml(l.nombre)}</span>
            </label>
          `;
        });
        html += `
          <div class="colab-card">
            <div class="colab-card-main">
              <div class="colab-card-name">${AdminUI.escapeHtml(c.nombre || c.mail)} ${dniBadge}</div>
              <div class="colab-card-mail">${AdminUI.escapeHtml(c.mail)}</div>
            </div>
            <span class="colab-rol-badge is-gerente">${AdminUI.escapeHtml(c.rol_visible)}</span>
            <div class="colab-card-locales">${checks}</div>
          </div>
        `;
      }
    });
    cont.innerHTML = html;
  }

  function filtrarEquipo() { renderEquipo(); }

  async function toggleLocalColaborador(mail, idLocal, checked, cantActual) {
    if (!checked && cantActual <= 1) {
      mostrarConfirmColab({
        titulo: 'Dar de baja del equipo',
        texto: 'Si quitás este local, la persona se queda sin ningún local y pierde el acceso. ¿Confirmás la baja total?',
        okLabel: 'Sí, dar de baja',
        onOk: async function() { await ejecutarSetEncargado(mail, idLocal, false); },
        onCancel: function() { cargarEquipo(); }
      });
      return;
    }
    await ejecutarSetEncargado(mail, idLocal, checked);
  }

  async function ejecutarSetEncargado(mail, idLocal, habilitado) {
    const resp = await AdminAPI.colaboradorSetEncargado(
      equipoState.idEmpresa, mail, idLocal, habilitado);
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No se pudo actualizar', 'error');
    } else {
      AdminUI.toast(resp.mensaje || 'Actualizado', 'success');
    }
    await cargarEquipo();
  }

  function abrirModalAgregarColaborador() {
    equipoState.tipoNuevo = 'gerente';
    seleccionarTipoColab('gerente');
    document.getElementById('colab-mail').value = '';
    document.getElementById('colab-nombre').value = '';
    document.getElementById('colab-apellido').value = '';
    AdminUI.setLoginStatus('colab-status', '');
    let checks = '';
    equipoState.localesEmpresa.forEach(function(l) {
      checks += `
        <label class="colab-local-check">
          <input type="checkbox" value="${l.id_local}">
          <span>${AdminUI.escapeHtml(l.nombre)}</span>
        </label>
      `;
    });
    document.getElementById('colab-locales-checks').innerHTML = checks ||
      '<div class="colab-sin-locales">Esta empresa no tiene locales todavía. Creá un local primero.</div>';
    document.getElementById('modal-agregar-colab').style.display = 'flex';
  }

  function cerrarModalColab() {
    document.getElementById('modal-agregar-colab').style.display = 'none';
  }

  function seleccionarTipoColab(tipo) {
    equipoState.tipoNuevo = tipo;
    document.getElementById('colab-tipo-gerente').classList.toggle('is-active', tipo === 'gerente');
    document.getElementById('colab-tipo-secretaria').classList.toggle('is-active', tipo === 'secretaria');
    document.getElementById('colab-locales-wrap').style.display =
      (tipo === 'gerente') ? 'block' : 'none';
  }

  async function guardarColaborador() {
    const mail = (document.getElementById('colab-mail').value || '').trim().toLowerCase();
    const nombre = document.getElementById('colab-nombre').value.trim();
    const apellido = document.getElementById('colab-apellido').value.trim();

    if (!mail || mail.indexOf('@') === -1) {
      AdminUI.setLoginStatus('colab-status', 'Ingresá un mail válido', 'error');
      return;
    }

    const btn = document.getElementById('btn-guardar-colab');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    if (equipoState.tipoNuevo === 'secretaria') {
      const resp = await AdminAPI.colaboradorInvitarDueno(
        equipoState.idEmpresa, mail, nombre, apellido);
      btn.disabled = false;
      btn.textContent = 'Agregar';
      if (!resp.ok) {
        AdminUI.setLoginStatus('colab-status', resp.error, 'error');
        return;
      }
      cerrarModalColab();
      AdminUI.toast('Secretaría/dueño agregado', 'success');
      await cargarEquipo();
      return;
    }

    const checks = document.querySelectorAll('#colab-locales-checks input[type=checkbox]:checked');
    if (checks.length === 0) {
      btn.disabled = false;
      btn.textContent = 'Agregar';
      mostrarConfirmColab({
        titulo: 'Asigná un rol',
        texto: 'Un gerente tiene que estar habilitado al menos en un local. Tildá dónde va a trabajar antes de guardar.',
        okLabel: 'Entendido',
        soloOk: true,
        onOk: function() {}
      });
      return;
    }

    let ok = true;
    for (let i = 0; i < checks.length; i++) {
      const idLocal = checks[i].value;
      const resp = await AdminAPI.colaboradorSetEncargado(
        equipoState.idEmpresa, mail, idLocal, true, nombre, apellido);
      if (!resp.ok) { ok = false; AdminUI.toast(resp.error, 'error'); break; }
    }

    btn.disabled = false;
    btn.textContent = 'Agregar';
    if (ok) {
      cerrarModalColab();
      AdminUI.toast('Gerente agregado', 'success');
      await cargarEquipo();
    }
  }

  function mostrarConfirmColab(cfg) {
    document.getElementById('confirm-colab-titulo').textContent = cfg.titulo;
    document.getElementById('confirm-colab-texto').textContent = cfg.texto;
    const btnOk = document.getElementById('confirm-colab-ok');
    const btnCancel = document.getElementById('confirm-colab-cancelar');
    btnOk.textContent = cfg.okLabel || 'Confirmar';
    btnCancel.style.display = cfg.soloOk ? 'none' : 'inline-flex';
    btnOk.onclick = function() {
      cerrarConfirmColab();
      if (cfg.onOk) cfg.onOk();
    };
    equipoState._onCancel = cfg.onCancel || null;
    document.getElementById('modal-confirm-colab').style.display = 'flex';
  }

  function cerrarConfirmColab() {
    document.getElementById('modal-confirm-colab').style.display = 'none';
    if (equipoState._onCancel) {
      const cb = equipoState._onCancel;
      equipoState._onCancel = null;
      cb();
    }
  }

  // ============================================================
  // PANEL DE SISTEMA (Nivel 0 — Admin)
  // ============================================================
  // Nota: `state.esAdmin` se resuelve al cargar el dashboard (armarDashboardFS
  // lee usuarios/{uid}.roles de FS; GAS de red). Se retiró detectarAdminSistema
  // (función muerta, sin caller, que además pegaba a GAS obtenerMiSesion). 4/7.

  async function abrirPanelSistema() {
    if (!state.esAdmin) { AdminUI.toast('Solo para administradores del sistema', 'error'); return; }
    AdminUI.mostrarPantalla('screen-sistema');
    await recargarPadron();
    // resetear integridad
    document.getElementById('sis-integridad-resultado').innerHTML =
      '<div class="sis-integridad-vacio">Tocá "Revisar integridad" para correr el test de salud de la base.</div>';
  }

  async function recargarPadron() {
    document.getElementById('sis-padron-body').innerHTML =
      '<tr><td colspan="6" class="sis-loading">Cargando padrón…</td></tr>';
    const resp = await AdminAPI.sistemaPadron();
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No se pudo cargar el padrón', 'error');
      return;
    }

    // Totales
    const t = resp.totales;
    document.getElementById('sis-totales').innerHTML = `
      <div class="sis-total-card"><div class="sis-total-num">${t.empresas}</div><div class="sis-total-label">Empresas</div></div>
      <div class="sis-total-card"><div class="sis-total-num">${t.sucursales}</div><div class="sis-total-label">Sucursales</div></div>
      <div class="sis-total-card"><div class="sis-total-num">${t.cartas}</div><div class="sis-total-label">Cartas</div></div>
      <div class="sis-total-card"><div class="sis-total-num">$${(t.deuda||0).toLocaleString('es-AR')}</div><div class="sis-total-label">Deuda total</div></div>
    `;

    // Tabla
    let rows = '';
    (resp.padron || []).forEach(function(e) {
      const estadoClass = e.estado === 'activa' ? 'sis-estado-ok' : 'sis-estado-off';
      rows += `
        <tr>
          <td>${AdminUI.escapeHtml(e.nombre)}</td>
          <td class="sis-cuit">${AdminUI.escapeHtml(e.cuit || '—')}</td>
          <td><span class="${estadoClass}">${AdminUI.escapeHtml(e.estado)}</span></td>
          <td class="num">${e.sucursales}</td>
          <td class="num">${e.cartas}</td>
          <td class="num">${e.deuda > 0 ? '$' + e.deuda.toLocaleString('es-AR') : '—'}</td>
        </tr>
      `;
    });
    document.getElementById('sis-padron-body').innerHTML = rows ||
      '<tr><td colspan="6" class="sis-loading">Sin empresas.</td></tr>';
  }

  async function ejecutarIntegridad() {
    const cont = document.getElementById('sis-integridad-resultado');
    cont.innerHTML = '<div class="sis-integridad-vacio">Revisando la base…</div>';
    const resp = await AdminAPI.sistemaIntegridad();
    if (!resp.ok) {
      AdminUI.toast(resp.error || 'No se pudo revisar', 'error');
      cont.innerHTML = '';
      return;
    }

    const r = resp.resumen;
    let banner;
    if (r.errores > 0) {
      banner = `<div class="sis-banner sis-banner-error">❌ ${r.errores} error(es) de integridad — requieren atención</div>`;
    } else if (r.advertencias > 0) {
      banner = `<div class="sis-banner sis-banner-warn">⚠ Sin errores · ${r.advertencias} advertencia(s) menor(es)</div>`;
    } else {
      banner = `<div class="sis-banner sis-banner-ok">✓ Base 100% sana — sin errores ni advertencias</div>`;
    }

    let items = '';
    resp.chequeos.forEach(function(ch) {
      const icono = ch.ok ? '✓' : (ch.severidad === 'error' ? '❌' : '⚠');
      const cls = ch.ok ? 'is-ok' : (ch.severidad === 'error' ? 'is-error' : 'is-warn');
      let ejemplos = '';
      if (!ch.ok && ch.ejemplos.length) {
        ejemplos = '<div class="sis-chk-ejemplos">' +
          ch.ejemplos.map(function(e) { return '<div>· ' + AdminUI.escapeHtml(e) + '</div>'; }).join('') +
          '</div>';
      }
      items += `
        <div class="sis-chk ${cls}">
          <div class="sis-chk-head">
            <span class="sis-chk-icon">${icono}</span>
            <span class="sis-chk-nombre">${AdminUI.escapeHtml(ch.nombre)}</span>
            <span class="sis-chk-count">${ch.cantidad}</span>
          </div>
          ${ejemplos}
        </div>
      `;
    });

    cont.innerHTML = banner + '<div class="sis-chk-list">' + items + '</div>';
  }

  // --- Modal agregar admin ---
  function abrirModalAgregarAdmin() {
    document.getElementById('admin-mail').value = '';
    document.getElementById('admin-nombre').value = '';
    document.getElementById('admin-apellido').value = '';
    AdminUI.setLoginStatus('admin-status', '');
    document.getElementById('modal-agregar-admin').style.display = 'flex';
  }

  function cerrarModalAdmin() {
    document.getElementById('modal-agregar-admin').style.display = 'none';
  }

  async function guardarAdmin() {
    const mail = (document.getElementById('admin-mail').value || '').trim().toLowerCase();
    const nombre = document.getElementById('admin-nombre').value.trim();
    const apellido = document.getElementById('admin-apellido').value.trim();
    if (!mail || mail.indexOf('@') === -1) {
      AdminUI.setLoginStatus('admin-status', 'Ingresá un mail válido', 'error');
      return;
    }
    const btn = document.getElementById('btn-guardar-admin');
    btn.disabled = true; btn.textContent = 'Guardando…';
    const resp = await AdminAPI.sistemaAgregarAdmin(mail, nombre, apellido);
    btn.disabled = false; btn.textContent = 'Agregar';
    if (!resp.ok) {
      AdminUI.setLoginStatus('admin-status', resp.error, 'error');
      return;
    }
    cerrarModalAdmin();
    AdminUI.toast('Administrador agregado', 'success');
  }

  // ============================================================
  // FÁBRICA DE PIELES (Nivel 0 — curador del catálogo de temas)
  // ------------------------------------------------------------
  // Crea/edita pieles (temas de carta) como DATO en Firestore `pieles`.
  // Modelo: clonar una BASE probada y pisar SOLO las perillas que mueven el
  // motor de verdad (verificado empíricamente 13/7): 7 colores + tipografía +
  // mayúsculas + divisor. Lo decorativo (marco, textura, densidad) VIAJA desde
  // la base — no se expone perilla hasta cablearlo al motor. Guardar → FS
  // (regla v1.8: solo es_admin_sistema escribe). Preview en vivo con el motor.
  // ============================================================

  // Tipografías curadas: pares (títulos + cuerpo) ya probados en las 11 pieles.
  const FAB_FUENTES = [
    { id: 'cormorant_inter', nombre: 'Cormorant + Inter (elegante)',
      import: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap",
      titulos: "'Cormorant Garamond', serif", cuerpo: "'Inter', sans-serif" },
    { id: 'playfair_lora', nombre: 'Playfair + Lora (clásico serif)',
      import: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Lora:wght@400;500;600&display=swap",
      titulos: "'Playfair Display', serif", cuerpo: "'Lora', serif" },
    { id: 'cormorant_infant_inter', nombre: 'Cormorant Infant + Inter (premium)',
      import: "https://fonts.googleapis.com/css2?family=Cormorant+Infant:wght@300;500;600&family=Inter:wght@300;400;500;600&display=swap",
      titulos: "'Cormorant Infant', serif", cuerpo: "'Inter', sans-serif" },
    { id: 'bitter_nunito', nombre: 'Bitter + Nunito Sans (cálido)',
      import: 'https://fonts.googleapis.com/css2?family=Bitter:wght@400;500;600;700&family=Nunito+Sans:wght@300;400;600;700&display=swap',
      titulos: "'Bitter', serif", cuerpo: "'Nunito Sans', sans-serif" },
    { id: 'montserrat_inter', nombre: 'Montserrat + Inter (moderno)',
      import: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap',
      titulos: "'Montserrat', sans-serif", cuerpo: "'Inter', sans-serif" },
    { id: 'oswald_inter', nombre: 'Oswald + Inter (robusto)',
      import: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
      titulos: "'Oswald', sans-serif", cuerpo: "'Inter', sans-serif" },
    { id: 'staatliches_inter', nombre: 'Staatliches + Inter (condensado)',
      import: 'https://fonts.googleapis.com/css2?family=Staatliches&family=Inter:wght@300;400;500;600&display=swap',
      titulos: "'Staatliches', sans-serif", cuerpo: "'Inter', sans-serif" },
    { id: 'bebas_nunito', nombre: 'Bebas Neue + Nunito Sans (impacto)',
      import: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito+Sans:wght@300;400;600;700&display=swap',
      titulos: "'Bebas Neue', sans-serif", cuerpo: "'Nunito Sans', sans-serif" },
    { id: 'josefin_inter', nombre: 'Josefin Sans + Inter (limpio)',
      import: 'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap',
      titulos: "'Josefin Sans', sans-serif", cuerpo: "'Inter', sans-serif" }
  ];

  // Las 7 perillas de color: etiqueta + campo(s) del objeto piel que pisan.
  const FAB_COLORES = [
    { key: 'fondo',         label: 'Fondo',            campos: ['fondo'] },
    { key: 'texto',         label: 'Texto',            campos: ['texto', 'nombre'] },
    { key: 'tituloEmpresa', label: 'Título empresa',   campos: ['tituloEmpresa'] },
    { key: 'tituloSeccion', label: 'Título sección',   campos: ['tituloSeccion'] },
    { key: 'acento',        label: 'Acento',           campos: ['acento'] },
    { key: 'precio',        label: 'Precio',           campos: ['precio'] },
    { key: 'apagado',       label: 'Apagado (tenues)', campos: ['local', 'seccionDesc', 'productoDesc', 'tag', 'footer', 'notas', 'empty'] }
  ];

  // Carta de MUESTRA para el preview (fija; solo para ver la piel).
  const FAB_MUESTRA = {
    nombreEmpresa: 'La Muestra',
    nombreLocal: 'Sucursal Centro',
    carta: {
      Nombre: 'Carta de muestra', Redondeo: '10',
      Pie_Direccion: 'Av. Siempreviva 742', Pie_Telefono: '11 5555 1234',
      Pie_Mail: 'hola@lamuestra.com', Notas: 'Cocina abierta hasta las 00 hs · WiFi: lamuestra'
    },
    secciones: [
      { Nombre: 'Entradas', Descripcion: 'Para empezar', productos: [
        { Nombre: 'Provoleta a la parrilla', Precio: 4200, Descripcion: 'Con orégano y aceite de oliva', Disponible_Hoy: true, Etiquetas: { vegetariano: true } },
        { Nombre: 'Rabas', Precio: 6800, Descripcion: 'Con alioli casero', Disponible_Hoy: true, Etiquetas: {} }
      ]},
      { Nombre: 'Principales', Descripcion: '', productos: [
        { Nombre: 'Bife de chorizo', Precio: 12500, Descripcion: 'Con guarnición a elección', Disponible_Hoy: true, Etiquetas: {} },
        { Nombre: 'Risotto de hongos', Precio: 9800, Descripcion: 'Parmesano y trufa', Disponible_Hoy: true, Etiquetas: { vegetariano: true, sin_tacc: true } },
        { Nombre: 'Milanesa napolitana', Precio: 10200, Descripcion: '', Disponible_Hoy: true, Etiquetas: {} }
      ]}
    ]
  };

  var _fabLista = [];               // catálogo de pieles leído de FS
  var _fabWork = null;              // piel en edición (objeto completo)
  var _fabId = null;                // id de la piel en edición (null si nueva)
  var _fabEsNueva = false;

  function _fabClonar(obj) { return JSON.parse(JSON.stringify(obj)); }

  // ---------------------------------------------------------------------------
  // DERIVADORES DE PERILLAS (las 6 "decorativas") — TODO del lado de la Fábrica.
  // Cada perilla escribe los TOKENS FINOS que generarCss YA lee (paddings,
  // cartaMarco, fondoImage, divisorTok). NO se toca el motor ni el Worker: las
  // 11 pieles quedan intactas; solo la piel que el curador edita cambia.
  // ---------------------------------------------------------------------------

  // Presets de densidad (mismos tokens que el motor consume).
  var _FAB_DENSIDAD = {
    aireado:  { bodyPadding: '4rem 1.5rem 3rem', bodyPaddingMobile: '2rem 1.25rem', headerMb: '3.5rem',
                seccionesGap: '3rem', seccionesGapMobile: '2.5rem', productosGap: '1.5rem', productosGapMobile: '1.25rem' },
    compacto: { bodyPadding: '2.5rem 1.5rem 2rem', bodyPaddingMobile: '1.5rem 1rem', headerMb: '2.25rem',
                seccionesGap: '2rem', seccionesGapMobile: '1.6rem', productosGap: '1.1rem', productosGapMobile: '1rem' }
  };

  // Helpers de color (hex → rgb/rgba, aclarar/oscurecer). Producen strings
  // seguros (pasan GranCartaPieles.validar: sin '<', '@import', 'url(...)').
  function _fabHexRgb(hex) {
    var h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function _fabRgba(hex, a) { var c = _fabHexRgb(hex); return c ? ('rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + a + ')') : ('rgba(0,0,0,' + a + ')'); }
  function _fabMix(hex, tgt, t) {
    var c = _fabHexRgb(hex); if (!c) return hex;
    function m(a, b) { return Math.round(a + (b - a) * t); }
    var r = m(c.r, tgt.r), g = m(c.g, tgt.g), b = m(c.b, tgt.b);
    return '#' + [r, g, b].map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function _fabAclarar(hex, pct) { return _fabMix(hex, { r: 255, g: 255, b: 255 }, pct / 100); }
  function _fabOscurecer(hex, pct) { return _fabMix(hex, { r: 0, g: 0, b: 0 }, pct / 100); }

  function _fabRadio(w) { return w.esquinas === 'redondeadas' ? '14px' : '0'; }

  // Color del marco: perilla propia (color.marco). Si no se eligió, cae al acento
  // (comportamiento previo). El motor lee cartaMarco, no color.marco → no se toca.
  function _fabColorMarco(w) {
    return (w.color && (w.color.marco || w.color.acento)) || '#888888';
  }

  // caja: genera (o quita el efecto de) el cartaMarco desde los colores.
  function _fabAplicarCaja(w, val) {
    w.caja = val;
    if (val === 'ninguna') return;   // el motor ignora cartaMarco cuando caja=ninguna
    var marco = _fabColorMarco(w);
    var fondo = (w.color && w.color.fondo) || '#ffffff';
    var base = w.cartaMarco || {};
    if (val === 'borde') {
      w.cartaMarco = Object.assign({}, base, {
        border: '1px solid ' + marco, radius: _fabRadio(w),
        padding: '3rem 2.25rem', paddingMobile: '2rem 1.5rem'
      });
    } else if (val === 'doble-marco') {
      var tinte = _fabRgba(_fabAclarar(fondo, 6), 0.6);
      w.cartaMarco = Object.assign({}, base, {
        bg: tinte, padding: '3rem 2.5rem', paddingMobile: '2rem 1.5rem',
        border: '2px solid ' + marco, radius: _fabRadio(w),
        shadow: '0 0 0 8px ' + tinte + ', 0 0 0 10px ' + marco + ', 0 10px 40px ' + _fabRgba('#000000', 0.15),
        shadowMobile: '0 0 0 6px ' + tinte + ', 0 0 0 8px ' + marco,
        ornamento: base.ornamento || '✦', ornamentoColor: marco
      });
    }
  }

  // esquinas: solo redondea el marco (si hay). Sin marco, no hay qué redondear.
  function _fabAplicarEsquinas(w, val) {
    w.esquinas = val;
    if (w.cartaMarco) w.cartaMarco.radius = _fabRadio(w);
  }

  // ornamentos: floreo en las esquinas (necesita un cartaMarco donde colgarlo).
  function _fabAplicarOrnamentos(w, val) {
    w.ornamentos = val;
    if (val !== 'esquinas-divisor') return;
    var marco = _fabColorMarco(w);
    if (!w.cartaMarco) w.cartaMarco = { border: '1px solid ' + marco, radius: _fabRadio(w), padding: '3rem 2.25rem', paddingMobile: '2rem 1.5rem' };
    if (!w.cartaMarco.ornamento) w.cartaMarco.ornamento = '✦';
    w.cartaMarco.ornamentoColor = marco;
  }

  // Re-genera el marco/ornamentos cuando cambia un color del que dependen
  // (color del marco, o el fondo que tiñe el doble-marco). Solo si ya hay marco.
  function _fabResyncMarco(w) {
    if (w.caja && w.caja !== 'ninguna') _fabAplicarCaja(w, w.caja);
    if (w.ornamentos === 'esquinas-divisor') _fabAplicarOrnamentos(w, w.ornamentos);
  }

  // fondoDeco: genera color.fondoImage (el motor lo pinta si existe).
  function _fabAplicarFondoDeco(w, val) {
    w.fondoDeco = val;
    if (!w.color) w.color = {};
    var fondo = w.color.fondo || '#ffffff';
    var acento = w.color.acento || '#888888';
    if (val === 'plano') w.color.fondoImage = '';
    else if (val === 'degrade') w.color.fondoImage = 'linear-gradient(180deg, ' + _fabAclarar(fondo, 5) + ' 0%, ' + _fabOscurecer(fondo, 5) + ' 100%)';
    else if (val === 'glow') w.color.fondoImage = 'radial-gradient(ellipse at top, ' + _fabRgba(acento, 0.08) + ' 0%, transparent 55%)';
    else if (val === 'textura') w.color.fondoImage = 'repeating-linear-gradient(45deg, ' + _fabRgba(acento, 0.03) + ' 0, ' + _fabRgba(acento, 0.03) + ' 2px, transparent 2px, transparent 12px)';
  }

  // divisor: rombos inyecta el glifo; 'nada' apaga el divisorTok.
  function _fabAplicarDivisor(w, val) {
    w.divisor = val;
    if (val === 'rombos') {
      if (!w.divisorTok) w.divisorTok = { ancho: '80px', alto: '2px', margin: '1.5rem auto', opacity: '1' };
      if (!w.divisorTok.rombo) w.divisorTok.rombo = '◆';
    } else if (val === 'nada') {
      w.divisorTok = Object.assign({}, w.divisorTok, { ancho: '0', alto: '0' });
    }
  }

  async function abrirFabrica() {
    if (!state.esAdmin) { AdminUI.toast('Solo para administradores del sistema', 'error'); return; }
    AdminUI.mostrarPantalla('screen-fabrica');
    _fabWork = null; _fabId = null; _fabEsNueva = false;
    document.getElementById('fab-editor-vacio').style.display = '';
    document.getElementById('fab-editor-panel').style.display = 'none';
    await recargarFabLista();
  }

  async function recargarFabLista() {
    const cont = document.getElementById('fab-lista');
    cont.innerHTML = '<div class="fab-lista-loading">Cargando pieles…</div>';
    try {
      _fabLista = await window.GCFirestore.leerPieles();
      // mantené el motor del editor sincronizado con lo que hay en FS
      if (typeof GranCartaPieles !== 'undefined') GranCartaPieles.hidratar(_fabLista);
    } catch (e) {
      console.warn('[Fábrica] no se pudo leer pieles de FS:', e && e.message);
      _fabLista = GranCartaPieles.listar().map(function (t) { return GranCartaPieles.PRESETS[t.id]; });
    }
    renderFabLista();
  }

  function renderFabLista() {
    const cont = document.getElementById('fab-lista');
    let html = '';
    _fabLista.forEach(function (p) {
      const sel = (_fabId === p.id) ? ' is-selected' : '';
      const badge = (p.tipo === 'personalizada') ? '<span class="fab-badge fab-badge-custom">custom</span>'
                  : (p.premium ? '<span class="fab-badge fab-badge-premium">premium</span>' : '');
      html += '<button type="button" class="fab-item' + sel + '" onclick="fabricaEditar(\'' + p.id + '\')">'
            + '<span class="fab-item-swatch" style="background:' + AdminUI.escapeHtml(p.color && p.color.fondo || '#fff')
            + ';border-color:' + AdminUI.escapeHtml(p.color && p.color.acento || '#ccc') + '">'
            + '<i style="background:' + AdminUI.escapeHtml(p.color && p.color.acento || '#ccc') + '"></i></span>'
            + '<span class="fab-item-txt"><span class="fab-item-nombre">' + AdminUI.escapeHtml(p.nombre || p.id) + '</span>'
            + '<span class="fab-item-rubro">' + AdminUI.escapeHtml(p.rubro || '—') + '</span></span>'
            + badge + '</button>';
    });
    cont.innerHTML = html || '<div class="fab-lista-loading">Sin pieles.</div>';
  }

  function fabricaNueva() {
    if (!state.esAdmin) return;
    _fabWork = _fabClonar(GranCartaPieles.PRESETS.minimalista);
    _fabWork.nombre = ''; _fabWork.descripcion = ''; _fabWork.rubro = '';
    _fabWork.premium = false; _fabWork.tipo = 'generica'; _fabWork.id_empresa = null;
    delete _fabWork.orden;
    _fabId = null; _fabEsNueva = true;
    renderFabLista();
    renderFabEditor();
  }

  function fabricaEditar(id) {
    const p = _fabLista.find(function (x) { return x.id === id; }) || GranCartaPieles.PRESETS[id];
    if (!p) { AdminUI.toast('No encontré esa piel', 'error'); return; }
    _fabWork = _fabClonar(p);
    _fabId = id; _fabEsNueva = false;
    renderFabLista();
    renderFabEditor();
  }

  // Detecta cuál par de fuentes está activo en la piel (para el select).
  function _fabFuenteActual(p) {
    const f = p.fuente || {};
    const m = FAB_FUENTES.find(function (x) { return x.titulos === f.titulos && x.cuerpo === f.cuerpo; });
    return m ? m.id : '';
  }

  function renderFabEditor() {
    document.getElementById('fab-editor-vacio').style.display = 'none';
    document.getElementById('fab-editor-panel').style.display = '';
    const p = _fabWork;

    // Controles (columna izquierda del panel)
    let baseHtml = '';
    if (_fabEsNueva) {
      baseHtml = '<div class="fab-campo"><label class="fab-label">Partir de (base)</label>'
        + '<select class="login-input fab-select" onchange="fabricaCambiarBase(this.value)">'
        + GranCartaPieles.listar().map(function (t) {
            return '<option value="' + t.id + '"' + (t.id === (_fabWork._baseId || 'minimalista') ? ' selected' : '') + '>' + AdminUI.escapeHtml(t.nombre) + '</option>';
          }).join('')
        + '</select><div class="fab-hint">Lo que no editás (marco, textura, densidad) se hereda de la base.</div></div>';
    }

    const coloresHtml = FAB_COLORES.map(function (c) {
      const val = (p.color && p.color[c.campos[0]]) || '#000000';
      return '<div class="fab-color-row"><label class="fab-label">' + c.label + '</label>'
        + '<div class="fab-color-ctl"><input type="color" value="' + _fabHex(val) + '" oninput="fabricaSetColor(\'' + c.key + '\', this.value)">'
        + '<input type="text" class="fab-color-hex" value="' + AdminUI.escapeHtml(val) + '" onchange="fabricaSetColor(\'' + c.key + '\', this.value)"></div></div>';
    }).join('');

    const fuenteHtml = '<div class="fab-campo"><label class="fab-label">Tipografía</label>'
      + '<select class="login-input fab-select" onchange="fabricaSetFuente(this.value)">'
      + (_fabFuenteActual(p) ? '' : '<option value="" selected>(actual — sin cambios)</option>')
      + FAB_FUENTES.map(function (f) {
          return '<option value="' + f.id + '"' + (f.id === _fabFuenteActual(p) ? ' selected' : '') + '>' + AdminUI.escapeHtml(f.nombre) + '</option>';
        }).join('')
      + '</select></div>';

    // Helper: <select> de perilla (opciones = [[valor, etiqueta], ...]).
    function selPerilla(fn, actual, opciones) {
      return '<select class="login-input fab-select" onchange="' + fn + '(this.value)">'
        + opciones.map(function (o) {
            return '<option value="' + o[0] + '"' + (o[0] === actual ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('')
        + '</select>';
    }

    const gestosHtml = '<div class="fab-campo"><label class="fab-label">Mayúsculas en títulos</label>'
      + '<label class="fab-switch"><input type="checkbox"' + (p.mayusculas ? ' checked' : '') + ' onchange="fabricaSetBool(\'mayusculas\', this.checked)"><span></span></label></div>'
      + '<div class="fab-campo"><label class="fab-label">Densidad</label>'
      + selPerilla('fabricaSetDensidad', (p.densidad || 'aireado'), [['aireado', 'Aireada'], ['compacto', 'Compacta']]) + '</div>'
      + '<div class="fab-campo"><label class="fab-label">Divisor</label>'
      + selPerilla('fabricaSetDivisor', (p.divisor || 'linea'), [['linea', 'Línea simple'], ['rombos', 'Rombos ◆'], ['nada', 'Sin divisor']]) + '</div>';

    const marcoColorVal = (p.color && (p.color.marco || p.color.acento)) || '#888888';
    const decorativosHtml = '<div class="fab-campo"><label class="fab-label">Caja / marco</label>'
      + selPerilla('fabricaSetCaja', (p.caja || 'ninguna'), [['ninguna', 'Ninguna'], ['borde', 'Borde simple'], ['doble-marco', 'Doble marco']]) + '</div>'
      + '<div class="fab-color-row"><label class="fab-label">Color del marco</label>'
      + '<div class="fab-color-ctl"><input type="color" value="' + _fabHex(marcoColorVal) + '" oninput="fabricaSetColorMarco(this.value)">'
      + '<input type="text" class="fab-color-hex" value="' + AdminUI.escapeHtml(marcoColorVal) + '" onchange="fabricaSetColorMarco(this.value)"></div></div>'
      + '<div class="fab-campo"><label class="fab-label">Esquinas</label>'
      + selPerilla('fabricaSetEsquinas', (p.esquinas || 'rectas'), [['rectas', 'Rectas'], ['redondeadas', 'Redondeadas']]) + '</div>'
      + '<div class="fab-campo"><label class="fab-label">Ornamentos</label>'
      + selPerilla('fabricaSetOrnamentos', (p.ornamentos || 'ninguno'), [['ninguno', 'Ninguno'], ['esquinas-divisor', 'Floreo en esquinas ✦']]) + '</div>'
      + '<div class="fab-campo"><label class="fab-label">Fondo decorativo</label>'
      + selPerilla('fabricaSetFondoDeco', (p.fondoDeco || 'plano'), [['plano', 'Plano'], ['degrade', 'Degradé'], ['glow', 'Resplandor'], ['textura', 'Textura']]) + '</div>'
      + '<div class="fab-hint">Caja/esquinas/ornamentos se ven sobre un marco; el fondo decorativo se genera desde tus colores.</div>';

    const metaHtml = '<div class="fab-campo"><label class="fab-label">Nombre</label>'
      + '<input type="text" class="login-input" id="fab-nombre" value="' + AdminUI.escapeHtml(p.nombre || '') + '" oninput="fabricaSetMeta(\'nombre\', this.value)" placeholder="Ej: Bistró Verde"></div>'
      + '<div class="fab-campo"><label class="fab-label">Descripción</label>'
      + '<input type="text" class="login-input" value="' + AdminUI.escapeHtml(p.descripcion || '') + '" oninput="fabricaSetMeta(\'descripcion\', this.value)" placeholder="Para qué rubro / qué transmite"></div>'
      + '<div class="fab-campo"><label class="fab-label">Rubro</label>'
      + '<input type="text" class="login-input" value="' + AdminUI.escapeHtml(p.rubro || '') + '" oninput="fabricaSetMeta(\'rubro\', this.value)" placeholder="Ej: bistro"></div>'
      + '<div class="fab-campo"><label class="fab-label">Premium</label>'
      + '<label class="fab-switch"><input type="checkbox"' + (p.premium ? ' checked' : '') + ' onchange="fabricaSetBool(\'premium\', this.checked)"><span></span></label></div>';

    const titulo = _fabEsNueva ? 'Nueva piel' : ('Editando: ' + AdminUI.escapeHtml(p.nombre || _fabId));
    const btnGuardar = _fabEsNueva ? 'Crear piel' : 'Guardar cambios';

    document.getElementById('fab-controles').innerHTML =
        '<div class="fab-editor-titulo">' + titulo + '</div>'
      + '<div class="fab-grupo"><div class="fab-grupo-h">Identidad</div>' + metaHtml + '</div>'
      + baseHtml
      + '<div class="fab-grupo"><div class="fab-grupo-h">Colores</div>' + coloresHtml + '</div>'
      + '<div class="fab-grupo"><div class="fab-grupo-h">Tipografía y gestos</div>' + fuenteHtml + gestosHtml + '</div>'
      + '<div class="fab-grupo"><div class="fab-grupo-h">Decorativos</div>' + decorativosHtml + '</div>'
      + '<div class="fab-acciones"><button class="btn btn-secondary" onclick="fabricaCancelar()">Cancelar</button>'
      + '<button class="btn btn-primary" id="fab-btn-guardar" onclick="fabricaGuardar()">' + btnGuardar + '</button></div>';

    renderFabPreview();
  }

  function _fabHex(v) {
    // <input type=color> exige #rrggbb. Si el valor no es hex simple, cae a negro.
    return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : '#000000';
  }

  function fabricaCambiarBase(baseId) {
    const base = GranCartaPieles.PRESETS[baseId];
    if (!base) return;
    const meta = { nombre: _fabWork.nombre, descripcion: _fabWork.descripcion, rubro: _fabWork.rubro, premium: _fabWork.premium };
    _fabWork = _fabClonar(base);
    _fabWork._baseId = baseId;
    _fabWork.nombre = meta.nombre; _fabWork.descripcion = meta.descripcion;
    _fabWork.rubro = meta.rubro; _fabWork.premium = meta.premium;
    _fabWork.tipo = 'generica'; _fabWork.id_empresa = null; delete _fabWork.orden;
    renderFabEditor();
  }

  function fabricaSetColor(key, valor) {
    const c = FAB_COLORES.find(function (x) { return x.key === key; });
    if (!c || !_fabWork.color) return;
    c.campos.forEach(function (campo) { _fabWork.color[campo] = valor; });
    // El fondo decorativo y el doble-marco se GENERAN desde estos colores; si no
    // se regeneran, la imagen/borde viejo (con el color anterior) tapa el nuevo.
    if (key === 'fondo' || key === 'acento') _fabAplicarFondoDeco(_fabWork, _fabWork.fondoDeco || 'plano');
    if (key === 'fondo') _fabResyncMarco(_fabWork);
    renderFabPreview();
  }

  // Perilla nueva: color propio del marco (independiente del acento).
  function fabricaSetColorMarco(valor) {
    if (!_fabWork || !_fabWork.color) return;
    _fabWork.color.marco = valor;
    _fabResyncMarco(_fabWork);
    renderFabPreview();
  }

  function fabricaSetFuente(fid) {
    const f = FAB_FUENTES.find(function (x) { return x.id === fid; });
    if (!f) return;
    _fabWork.fuente = { import: f.import, titulos: f.titulos, cuerpo: f.cuerpo };
    renderFabPreview();
  }

  function fabricaSetBool(campo, val) { _fabWork[campo] = !!val; renderFabPreview(); }
  function fabricaSetMeta(campo, val) { _fabWork[campo] = val; }

  // Las 6 perillas decorativas → derivan tokens finos y repintan.
  function fabricaSetDivisor(val)    { _fabAplicarDivisor(_fabWork, val);    renderFabPreview(); }
  function fabricaSetDensidad(val)   { Object.assign(_fabWork, _FAB_DENSIDAD[val] || {}); _fabWork.densidad = val; renderFabPreview(); }
  function fabricaSetEsquinas(val)   { _fabAplicarEsquinas(_fabWork, val);   renderFabPreview(); }
  function fabricaSetCaja(val)       { _fabAplicarCaja(_fabWork, val);       renderFabPreview(); }
  function fabricaSetOrnamentos(val) { _fabAplicarOrnamentos(_fabWork, val); renderFabPreview(); }
  function fabricaSetFondoDeco(val)  { _fabAplicarFondoDeco(_fabWork, val);  renderFabPreview(); }

  function renderFabPreview() {
    const html = CartaRenderer.renderizar({
      carta: FAB_MUESTRA.carta,
      secciones: FAB_MUESTRA.secciones,
      nombreEmpresa: FAB_MUESTRA.nombreEmpresa,
      nombreLocal: FAB_MUESTRA.nombreLocal,
      pielObj: _fabWork
    });
    document.getElementById('fab-preview-iframe').srcdoc = html;
  }

  function fabricaCancelar() {
    _fabWork = null; _fabId = null; _fabEsNueva = false;
    document.getElementById('fab-editor-vacio').style.display = '';
    document.getElementById('fab-editor-panel').style.display = 'none';
    renderFabLista();
  }

  async function fabricaGuardar() {
    if (!_fabWork) return;
    const nombre = String(_fabWork.nombre || '').trim();
    if (nombre.length < 2) { AdminUI.toast('Poné un nombre a la piel', 'error'); return; }
    _fabWork.nombre = nombre;

    // Red al editar una piel ORIGINAL del sistema (las 11 semilla; id no-SKN):
    // pisarla afecta a las cartas que la elijan de acá en más. Confirmar.
    if (!_fabEsNueva && !/^SKN-/.test(String(_fabId))) {
      const ok = await AdminUI.confirm({
        title: 'Editar piel del sistema',
        message: 'Vas a modificar "' + nombre + '", una piel del catálogo del sistema. '
          + 'Los cambios valen para las cartas que la elijan de ahora en más; las YA publicadas no cambian. ¿Seguir?',
        okLabel: 'Guardar cambios', cancelLabel: 'Cancelar'
      });
      if (!ok) return;
    }

    const btn = document.getElementById('fab-btn-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      let id = _fabId;
      if (_fabEsNueva) {
        id = await window.GCFirestore.generarId('SKN');   // SKN-XXXX
        _fabWork.id = id;
        if (typeof _fabWork.orden !== 'number') {
          const maxOrden = _fabLista.reduce(function (m, x) { return Math.max(m, x.orden || 0); }, 0);
          _fabWork.orden = maxOrden + 1;
        }
        if (!_fabWork.tipo) _fabWork.tipo = 'generica';
        if (_fabWork.id_empresa === undefined) _fabWork.id_empresa = null;
      } else {
        _fabWork.id = id;
      }
      delete _fabWork._baseId;   // metadato de UI, no va a FS

      // Validación al registrar (sub-paso 5): perillas esperadas + sin código
      // ejecutable. Candado antes de escribir a FS (y guardarPiel revalida).
      const val = GranCartaPieles.validar(_fabWork);
      if (!val.ok) {
        AdminUI.toast('Revisá la piel: ' + val.errores.slice(0, 2).join(' · '), 'error');
        console.warn('[Fábrica] piel inválida:', val.errores);
        return;
      }

      await window.GCFirestore.guardarPiel(id, _fabWork);
      AdminUI.toast(_fabEsNueva ? 'Piel creada' : 'Piel guardada', 'success');
      _fabId = id; _fabEsNueva = false;
      await recargarFabLista();
      // reabrí la piel recién guardada
      fabricaEditar(id);
    } catch (e) {
      console.error('[Fábrica] no se pudo guardar:', e && e.message);
      AdminUI.toast('No se pudo guardar la piel: ' + (e && e.message ? e.message : 'error'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = _fabEsNueva ? 'Crear piel' : 'Guardar cambios'; }
    }
  }

  // ============================================================
  // CATÁLOGO DE PRODUCTOS (por empresa) — ABM sobre la base
  // maestra empresas/{emp}/catalogo. Es la fuente de productos
  // para armar cartas rápido (Paso 2 la enganchará al editor).
  // ============================================================
  const catalogoState = {
    idEmpresa: '',
    nombreEmpresa: '',
    productos: [],
    editandoId: null
  };

  function _catNorm(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function _catPrecioFmt(precio) {
    const n = Number(precio) || 0;
    return '$' + n.toLocaleString('es-AR');
  }

  async function abrirCatalogo(idEmpresa) {
    catalogoState.idEmpresa = idEmpresa;
    const emp = (state.estructura.empresas || []).find(function(e) {
      return e.Id_Empresa === idEmpresa;
    });
    catalogoState.nombreEmpresa = emp ? emp.Nombre_Comercial : idEmpresa;

    AdminUI.mostrarPantalla('screen-catalogo');
    document.getElementById('catalogo-empresa-nombre').textContent = catalogoState.nombreEmpresa;
    document.getElementById('catalogo-buscador').value = '';
    document.getElementById('catalogo-list').innerHTML =
      '<div class="equipo-loading">Cargando catálogo…</div>';

    await cargarCatalogo();
  }

  async function cargarCatalogo() {
    let productos;
    try {
      productos = await window.GCFirestore.catalogoListar(catalogoState.idEmpresa);
    } catch (e) {
      console.error('[FS] catalogoListar falló:', e && e.message);
      AdminUI.toast('No pudimos cargar el catálogo. Reintentá.', 'error');
      document.getElementById('catalogo-list').innerHTML = '';
      return;
    }
    catalogoState.productos = productos || [];
    renderCatalogo();
  }

  function renderCatalogo() {
    const term = (document.getElementById('catalogo-buscador').value || '').toLowerCase().trim();
    let lista = catalogoState.productos.slice();

    if (term) {
      lista = lista.filter(function(p) {
        return (p.Nombre || '').toLowerCase().indexOf(term) !== -1
            || (p.Detalle || '').toLowerCase().indexOf(term) !== -1;
      });
    }

    const cont = document.getElementById('catalogo-list');
    const empty = document.getElementById('catalogo-empty');
    const count = document.getElementById('catalogo-count');
    count.textContent = catalogoState.productos.length + ' producto(s)';

    if (lista.length === 0) {
      cont.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    let html = '';
    lista.forEach(function(p) {
      const detalle = p.Detalle
        ? '<div class="catalogo-card-detalle">' + AdminUI.escapeHtml(p.Detalle) + '</div>'
        : '';
      html += `
        <div class="catalogo-card">
          <div class="catalogo-card-main">
            <div class="catalogo-card-nombre">${AdminUI.escapeHtml(p.Nombre)}</div>
            ${detalle}
          </div>
          <div class="catalogo-card-precio">${_catPrecioFmt(p.Precio)}</div>
          <div class="catalogo-card-acciones">
            <button class="btn-icon-mini" title="Editar"
                    onclick="abrirModalCatalogoEditar('${AdminUI.escapeHtml(p.Id_Catalogo)}')">✏️</button>
            <button class="btn-icon-mini" title="Borrar"
                    onclick="eliminarProductoCatalogo('${AdminUI.escapeHtml(p.Id_Catalogo)}', '${AdminUI.escapeHtml(p.Nombre)}')">🗑️</button>
          </div>
        </div>
      `;
    });
    cont.innerHTML = html;
  }

  function filtrarCatalogo() { renderCatalogo(); }

  function abrirModalCatalogoNuevo() {
    catalogoState.editandoId = null;
    document.getElementById('catalogo-modal-titulo').textContent = 'Nuevo producto';
    document.getElementById('catalogo-nombre').value = '';
    document.getElementById('catalogo-detalle').value = '';
    document.getElementById('catalogo-precio').value = '';
    document.getElementById('modal-catalogo').classList.add('is-visible');
    setTimeout(function() { document.getElementById('catalogo-nombre').focus(); }, 200);
  }

  function abrirModalCatalogoEditar(idCat) {
    const p = catalogoState.productos.find(function(x) { return x.Id_Catalogo === idCat; });
    if (!p) return;
    catalogoState.editandoId = idCat;
    document.getElementById('catalogo-modal-titulo').textContent = 'Editar producto';
    document.getElementById('catalogo-nombre').value = p.Nombre || '';
    document.getElementById('catalogo-detalle').value = p.Detalle || '';
    document.getElementById('catalogo-precio').value = (p.Precio === 0 || p.Precio) ? p.Precio : '';
    document.getElementById('modal-catalogo').classList.add('is-visible');
    setTimeout(function() { document.getElementById('catalogo-nombre').focus(); }, 200);
  }

  async function confirmarCatalogo() {
    const nombre = document.getElementById('catalogo-nombre').value.trim();
    const detalle = document.getElementById('catalogo-detalle').value.trim();
    const precioRaw = document.getElementById('catalogo-precio').value.trim();

    if (nombre.length < 2) {
      AdminUI.toast('Poné un nombre de al menos 2 letras', 'error');
      return;
    }
    // Precio: vacío = 0 (permitido, ej. servicio de mesa). No admite negativos.
    const precio = precioRaw === '' ? 0 : Number(precioRaw);
    if (isNaN(precio) || precio < 0) {
      AdminUI.toast('El precio tiene que ser 0 o mayor', 'error');
      return;
    }

    // Duplicado exacto (nombre + detalle) → aviso, sin crear. Las VARIANTES
    // (misma milanesa distinto detalle) sí se permiten: solo bloquea el 100% igual.
    const claveNueva = _catNorm(nombre) + '¦' + _catNorm(detalle);
    const duplicado = catalogoState.productos.some(function(p) {
      if (p.Id_Catalogo === catalogoState.editandoId) return false; // no chocar consigo mismo al editar
      return (_catNorm(p.Nombre) + '¦' + _catNorm(p.Detalle)) === claveNueva;
    });
    if (duplicado) {
      AdminUI.toast('Ese producto ya está en el catálogo (mismo nombre y detalle)', 'error');
      return;
    }

    const btn = document.getElementById('btn-catalogo-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      if (catalogoState.editandoId) {
        await window.GCFirestore.catalogoActualizar(catalogoState.idEmpresa, catalogoState.editandoId, {
          nombre: nombre, detalle: detalle, precio: precio
        });
        AdminUI.toast('Producto actualizado', 'success');
      } else {
        await window.GCFirestore.catalogoCrear(catalogoState.idEmpresa, {
          nombre: nombre, detalle: detalle, precio: precio
        });
        AdminUI.toast('Producto agregado al catálogo', 'success');
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      AdminUI.toast('No pudimos guardar: ' + ((e && e.message) || e), 'error');
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Guardar';
    cerrarModales();
    await cargarCatalogo();
  }

  async function eliminarProductoCatalogo(idCat, nombre) {
    const ok = await AdminUI.confirm({
      title: 'Borrar del catálogo',
      message: '¿Borrar "' + nombre + '" de la base de productos? No afecta las cartas ya armadas.',
      okLabel: 'Sí, borrar',
      cancelLabel: 'Cancelar'
    });
    if (!ok) return;
    try {
      await window.GCFirestore.catalogoEliminar(catalogoState.idEmpresa, idCat);
      AdminUI.toast('Producto borrado', 'success');
      await cargarCatalogo();
    } catch (e) {
      AdminUI.toast('No pudimos borrar: ' + ((e && e.message) || e), 'error');
    }
  }

  return {
    init,
    solicitarCodigo,
    verificarCodigo,
    mostrarFormRegistro,
    confirmarRegistro,
    volverALoginMail,
    cerrarSesion,
    volverAEmpresas,
    iniciarWizardEmpresa,
    iniciarWizardLocal,
    nuevaSucursal,
    abrirEmpresa,
    volverADashboard,
    abrirCartasEmpresa,
    confirmarSwapPublicacion,
    ejecutarSwapPublicacion,
    abrirModalPublicarAhora,
    seleccionarCanalParaPublicar,
    cerrarModalPublicar,
    confirmarPublicarAhora,
    copiarUrlPublica,
    descargarQrLocal,
    descargarPdfCarta,
    descargarPdfPublicacion,
    abrirModalWhatsApp,
    cerrarModalWhatsApp,
    guardarWhatsApp,
    abrirModalCartaNueva,
    confirmarCartaNueva,
    sembrarCartaEjemplo,
    abrirModalDuplicarCarta,
    confirmarCartaDuplicar,
    abrirModalEditarCarta,
    confirmarCartaEditar,
    activarCarta,
    archivarCarta,
    abrirEditorCarta,
    volverACartas,
    cambiarTabEditor,
    onPreciosAlcanceCambio,
    onPreciosCambio,
    aplicarPrecios,
    abrirModalSeccionNueva,
    abrirModalSeccionEditar,
    confirmarSeccion,
    ordenarSeccion,
    eliminarSeccion,
    abrirModalProductoNuevo,
    abrirModalProductoEditar,
    confirmarProducto,
    buscarEnCatalogoProducto,
    elegirDelCatalogo,
    productoNombreEditado,
    ordenarProducto,
    toggleDisponible,
    eliminarProducto,
    abrirVistaPrevia,
    cerrarVistaPrevia,
    cambiarDispositivoPreview,
    seleccionarTemplate,
    cerrarModales,
    // Catálogo de productos (por empresa)
    abrirCatalogo,
    filtrarCatalogo,
    abrirModalCatalogoNuevo,
    abrirModalCatalogoEditar,
    confirmarCatalogo,
    eliminarProductoCatalogo,
    // Equipo / Colaboradores
    abrirEquipo,
    filtrarEquipo,
    toggleLocalColaborador,
    abrirModalAgregarColaborador,
    cerrarModalColab,
    seleccionarTipoColab,
    guardarColaborador,
    cerrarConfirmColab,
    // Panel de Sistema
    abrirPanelSistema,
    recargarPadron,
    ejecutarIntegridad,
    abrirModalAgregarAdmin,
    cerrarModalAdmin,
    guardarAdmin,
    // Fábrica de Pieles (Nivel 0)
    abrirFabrica,
    fabricaNueva,
    fabricaEditar,
    fabricaCambiarBase,
    fabricaSetColor,
    fabricaSetColorMarco,
    fabricaSetFuente,
    fabricaSetBool,
    fabricaSetDivisor,
    fabricaSetDensidad,
    fabricaSetEsquinas,
    fabricaSetCaja,
    fabricaSetOrnamentos,
    fabricaSetFondoDeco,
    fabricaSetMeta,
    fabricaCancelar,
    fabricaGuardar,
    // Sectores y Mesas (16/6)
    abrirSectoresMesas,
    volverDeSectores,
    // Sectores y Mesas — B2 (alta/baja)
    abrirModalNuevoSector,
    abrirModalNuevaMesa,
    cerrarModalSectores,
    confirmarModalSectores,
    eliminarMesa,
    eliminarSector,
    toggleBotonesSector,
    confirmarToggleBotones,
    // Sectores y Mesas — B3 (editar + QR + renombrar canal)
    abrirModalEditarMesa,
    abrirModalEditarSector,
    descargarQrMesa,
    abrirModalRenombrarCanal,
    // Sectores y Mesas — Imprimir QRs (hoja A4)
    abrirModalImprimirQrs,
    onCambioCanalImprimir,
    confirmarImprimirQrs
  };

})();


// ============================================================
// FUNCIONES GLOBALES (para handlers inline en HTML)
// ============================================================

function solicitarCodigo(e) { AdminApp.solicitarCodigo(e); }
function verificarCodigo(e) { AdminApp.verificarCodigo(e); }
function mostrarFormRegistro() { AdminApp.mostrarFormRegistro(); }
function confirmarRegistro(e) { AdminApp.confirmarRegistro(e); }
function volverALoginMail() { AdminApp.volverALoginMail(); }
function cerrarSesion() { AdminApp.cerrarSesion(); }
function volverAEmpresas() { AdminApp.volverAEmpresas(); }
function iniciarWizardEmpresa() { AdminApp.iniciarWizardEmpresa(); }
function nuevaSucursal(idEmpresa) { AdminApp.nuevaSucursal(idEmpresa); }
function abrirEmpresa(idEmpresa) { AdminApp.abrirEmpresa(idEmpresa); }
function cancelarWizard() { Wizard.cancel(); }

// Cartas
function volverADashboard() { AdminApp.volverADashboard(); }
function abrirCartasEmpresa(idEmpresa, nombreEmpresa) {
  AdminApp.abrirCartasEmpresa(idEmpresa, nombreEmpresa);
}
function confirmarSwapPublicacion(idLocal, audienceSlug, idCartaActual, nombreCartaActual, selectId) {
  AdminApp.confirmarSwapPublicacion(idLocal, audienceSlug, idCartaActual, nombreCartaActual, selectId);
}
function abrirModalPublicarAhora() { AdminApp.abrirModalPublicarAhora(); }
function seleccionarCanalParaPublicar(idx) { AdminApp.seleccionarCanalParaPublicar(idx); }
function cerrarModalPublicar() { AdminApp.cerrarModalPublicar(); }
function confirmarPublicarAhora() { AdminApp.confirmarPublicarAhora(); }
function copiarUrlPublica(url) { AdminApp.copiarUrlPublica(url); }
function descargarQrLocal(url, nombre) { AdminApp.descargarQrLocal(url, nombre); }
function descargarPdfCarta(idLocal, idCarta, nombre) { AdminApp.descargarPdfCarta(idLocal, idCarta, nombre); }
function descargarPdfPublicacion(url, nombre) { AdminApp.descargarPdfPublicacion(url, nombre); }
function abrirModalWhatsApp(idLocal, nombre) { AdminApp.abrirModalWhatsApp(idLocal, nombre); }
function cerrarModalWhatsApp() { AdminApp.cerrarModalWhatsApp(); }
function guardarWhatsApp() { AdminApp.guardarWhatsApp(); }
function abrirModalCartaNueva() { AdminApp.abrirModalCartaNueva(); }
function confirmarCartaNueva() { AdminApp.confirmarCartaNueva(); }
function sembrarCartaEjemplo() { AdminApp.sembrarCartaEjemplo(); }
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
function onPreciosAlcanceCambio() { AdminApp.onPreciosAlcanceCambio(); }
function onPreciosCambio() { AdminApp.onPreciosCambio(); }
function aplicarPrecios() { AdminApp.aplicarPrecios(); }
function abrirModalSeccionNueva() { AdminApp.abrirModalSeccionNueva(); }
function abrirModalSeccionEditar(id) { AdminApp.abrirModalSeccionEditar(id); }
function confirmarSeccion() { AdminApp.confirmarSeccion(); }
function ordenarSeccion(id, dir) { AdminApp.ordenarSeccion(id, dir); }
function eliminarSeccion(id, nombre, cant) { AdminApp.eliminarSeccion(id, nombre, cant); }
function abrirModalProductoNuevo(idSeccion) { AdminApp.abrirModalProductoNuevo(idSeccion); }
function abrirModalProductoEditar(id) { AdminApp.abrirModalProductoEditar(id); }
function confirmarProducto() { AdminApp.confirmarProducto(); }
function buscarEnCatalogoProducto() { AdminApp.buscarEnCatalogoProducto(); }
function elegirDelCatalogo(idCat) { AdminApp.elegirDelCatalogo(idCat); }
function productoNombreEditado() { AdminApp.productoNombreEditado(); }
function ordenarProducto(id, dir) { AdminApp.ordenarProducto(id, dir); }
function toggleDisponible(id, estado) { AdminApp.toggleDisponible(id, estado); }
function eliminarProducto(id, nombre) { AdminApp.eliminarProducto(id, nombre); }

// Vista previa
function abrirVistaPrevia() { AdminApp.abrirVistaPrevia(); }
function cerrarVistaPrevia() { AdminApp.cerrarVistaPrevia(); }
function cambiarDispositivoPreview(d) { AdminApp.cambiarDispositivoPreview(d); }
function seleccionarTemplate(t) { AdminApp.seleccionarTemplate(t); }


// ============================================================
// FUNCIONES GLOBALES — CATÁLOGO DE PRODUCTOS
// ============================================================
function abrirCatalogo(idEmpresa) { AdminApp.abrirCatalogo(idEmpresa); }
function filtrarCatalogo() { AdminApp.filtrarCatalogo(); }
function abrirModalCatalogoNuevo() { AdminApp.abrirModalCatalogoNuevo(); }
function abrirModalCatalogoEditar(idCat) { AdminApp.abrirModalCatalogoEditar(idCat); }
function confirmarCatalogo() { AdminApp.confirmarCatalogo(); }
function eliminarProductoCatalogo(idCat, nombre) { AdminApp.eliminarProductoCatalogo(idCat, nombre); }


// ============================================================
// FUNCIONES GLOBALES — EQUIPO / COLABORADORES
// ============================================================
function abrirEquipo(idEmpresa) { AdminApp.abrirEquipo(idEmpresa); }
function filtrarEquipo() { AdminApp.filtrarEquipo(); }
function toggleLocalColaborador(mail, idLocal, checked, cant) { AdminApp.toggleLocalColaborador(mail, idLocal, checked, cant); }
function abrirModalAgregarColaborador() { AdminApp.abrirModalAgregarColaborador(); }
function cerrarModalColab() { AdminApp.cerrarModalColab(); }
function seleccionarTipoColab(tipo) { AdminApp.seleccionarTipoColab(tipo); }
function guardarColaborador() { AdminApp.guardarColaborador(); }
function cerrarConfirmColab() { AdminApp.cerrarConfirmColab(); }


// ============================================================
// FUNCIONES GLOBALES — PANEL DE SISTEMA
// ============================================================
function abrirPanelSistema() { AdminApp.abrirPanelSistema(); }
function recargarPadron() { AdminApp.recargarPadron(); }
function ejecutarIntegridad() { AdminApp.ejecutarIntegridad(); }
function abrirModalAgregarAdmin() { AdminApp.abrirModalAgregarAdmin(); }
function cerrarModalAdmin() { AdminApp.cerrarModalAdmin(); }
function guardarAdmin() { AdminApp.guardarAdmin(); }

// ============================================================
// FUNCIONES GLOBALES — FÁBRICA DE PIELES
// ============================================================
function abrirFabrica() { AdminApp.abrirFabrica(); }
function fabricaNueva() { AdminApp.fabricaNueva(); }
function fabricaEditar(id) { AdminApp.fabricaEditar(id); }
function fabricaCambiarBase(id) { AdminApp.fabricaCambiarBase(id); }
function fabricaSetColor(k, v) { AdminApp.fabricaSetColor(k, v); }
function fabricaSetColorMarco(v) { AdminApp.fabricaSetColorMarco(v); }
function fabricaSetFuente(v) { AdminApp.fabricaSetFuente(v); }
function fabricaSetBool(c, v) { AdminApp.fabricaSetBool(c, v); }
function fabricaSetDivisor(v) { AdminApp.fabricaSetDivisor(v); }
function fabricaSetDensidad(v) { AdminApp.fabricaSetDensidad(v); }
function fabricaSetEsquinas(v) { AdminApp.fabricaSetEsquinas(v); }
function fabricaSetCaja(v) { AdminApp.fabricaSetCaja(v); }
function fabricaSetOrnamentos(v) { AdminApp.fabricaSetOrnamentos(v); }
function fabricaSetFondoDeco(v) { AdminApp.fabricaSetFondoDeco(v); }
function fabricaSetMeta(c, v) { AdminApp.fabricaSetMeta(c, v); }
function fabricaCancelar() { AdminApp.fabricaCancelar(); }
function fabricaGuardar() { AdminApp.fabricaGuardar(); }

// Sectores y Mesas (16/6)
function abrirSectoresMesas(idLocal, audienceSlug, nombreCanal, nombreLocal, nombreEmpresa, idPublicacion) {
  AdminApp.abrirSectoresMesas(idLocal, audienceSlug, nombreCanal, nombreLocal, nombreEmpresa, idPublicacion);
}
function volverDeSectores() { AdminApp.volverDeSectores(); }

// Sectores y Mesas — B2 (alta/baja)
function abrirModalNuevoSector() { AdminApp.abrirModalNuevoSector(); }
function abrirModalNuevaMesa(idSector, nombreSector) { AdminApp.abrirModalNuevaMesa(idSector, nombreSector); }
function cerrarModalSectores() { AdminApp.cerrarModalSectores(); }
function confirmarModalSectores() { AdminApp.confirmarModalSectores(); }
function eliminarMesa(idMesa, numeroMesa) { AdminApp.eliminarMesa(idMesa, numeroMesa); }
function eliminarSector(idSector, nombreSector, cantMesas) { AdminApp.eliminarSector(idSector, nombreSector, cantMesas); }
function toggleBotonesSector(idSector, nombreSector, estadoActual) { AdminApp.toggleBotonesSector(idSector, nombreSector, estadoActual); }
function confirmarToggleBotones(idSector, activo, alcance) { AdminApp.confirmarToggleBotones(idSector, activo, alcance); }

// Sectores y Mesas — B3 (editar + QR + renombrar canal)
function abrirModalEditarMesa(idMesa, numeroActual, capacidadActual) { AdminApp.abrirModalEditarMesa(idMesa, numeroActual, capacidadActual); }
function abrirModalEditarSector(idSector, nombreActual, colorActual) { AdminApp.abrirModalEditarSector(idSector, nombreActual, colorActual); }
function descargarQrMesa(idMesa, numeroMesa, nombreSector) { AdminApp.descargarQrMesa(idMesa, numeroMesa, nombreSector); }
function abrirModalRenombrarCanal() { AdminApp.abrirModalRenombrarCanal(); }

// Sectores y Mesas — Imprimir QRs (hoja A4)
function abrirModalImprimirQrs() { AdminApp.abrirModalImprimirQrs(); }
function onCambioCanalImprimir() { AdminApp.onCambioCanalImprimir(); }
function confirmarImprimirQrs() { AdminApp.confirmarImprimirQrs(); }


// ============================================================
// BOOTSTRAP
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', AdminApp.init);
} else {
  AdminApp.init();
}

// ============================================================
// GUARDIA DE LA FLECHA-ATRÁS (seguridad, 14/6)
// ============================================================
// La flecha-atrás del navegador puede restaurar el admin desde su caché
// (bfcache) SIN re-ejecutar init: mostraría el dashboard viejo con datos a la
// vista, aunque ya hayas cerrado sesión. El evento 'pageshow' con
// event.persisted === true nos avisa de esa restauración. Si en ese momento
// no hay sesión, salimos al landing ANTES de mostrar nada (regla del logout
// voluntario: te fuiste → landing). Solo actúa sin sesión: nunca molesta a un
// usuario logueado.
window.addEventListener('pageshow', function(event) {
  if (event.persisted && !localStorage.getItem('admin_jwt')) {
    window.location.replace('https://grancarta.com');
  }
});
