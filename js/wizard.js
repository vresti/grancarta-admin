/*
 * ============================================================
 * GRANCARTA ADMIN - Motor de Wizard
 *
 * Wizard genérico reutilizable para alta de:
 *   - Empresa
 *   - Local
 *   - Mesas (lote)
 *   - Carta + Productos
 *
 * Cada wizard se define como un array de "steps" en app.js.
 * El motor maneja: navegación, persistencia, validación, animación.
 *
 * USO:
 *   Wizard.start({
 *     id: 'empresa',
 *     steps: [...],
 *     onComplete: async (data) => { ... }
 *   });
 *
 * Tipos de step:
 *   - welcome:  pantalla de bienvenida con botón "empezar"
 *   - input:    una pregunta con un input
 *   - dual:     una pantalla con dos inputs
 *   - confirm:  resumen de los datos antes de crear
 *   - success:  confirmación de éxito
 * ============================================================
 */

const Wizard = (function() {

  // Estado interno
  let state = {
    config: null,
    currentStep: 0,
    data: {},
    isCompleting: false
  };

  /**
   * Inicia un wizard nuevo.
   */
  function start(config) {
    state.config = config;
    state.currentStep = 0;
    state.data = config.initialData || {};
    state.isCompleting = false;

    AdminUI.mostrarPantalla('screen-wizard');
    render();
  }

  /**
   * Cancela el wizard y vuelve al dashboard.
   */
  async function cancel() {
    // Si hay datos cargados, pedir confirmación
    if (Object.keys(state.data).length > 0 && !state.isCompleting) {
      const confirmar = await AdminUI.confirm({
        title: '¿Cancelar?',
        message: 'Vas a perder los datos cargados. ¿Estás seguro?',
        okLabel: 'Sí, cancelar',
        cancelLabel: 'Volver'
      });
      if (!confirmar) return;
    }

    state = { config: null, currentStep: 0, data: {}, isCompleting: false };
    AdminUI.mostrarPantalla('screen-dashboard');
  }

  /**
   * Renderiza el step actual.
   */
  function render() {
    const cfg = state.config;
    const step = cfg.steps[state.currentStep];
    if (!step) return;

    renderProgress();
    renderContent(step);
    renderActions(step);
  }

  /**
   * Renderiza los dots de progreso (excluyendo welcome y success).
   */
  function renderProgress() {
    const container = document.getElementById('wizard-progress');
    const cfg = state.config;
    const steps = cfg.steps;

    // Solo contar steps "reales" (excluir welcome y success)
    const realSteps = steps.map((s, i) => ({ step: s, index: i }))
                           .filter(o => o.step.type !== 'welcome' && o.step.type !== 'success');

    let html = '';
    realSteps.forEach((o) => {
      let cls = 'progress-dot';
      if (o.index === state.currentStep) cls += ' is-active';
      else if (o.index < state.currentStep) cls += ' is-done';
      html += '<div class="' + cls + '"></div>';
    });

    container.innerHTML = html;
  }

  /**
   * Renderiza el contenido del step.
   */
  function renderContent(step) {
    const container = document.getElementById('wizard-content');

    let html = '';

    if (step.type === 'welcome') {
      html += '<div class="step-welcome-content">';
      if (step.icon) {
        html += '<div class="step-welcome-icon">' + AdminUI.escapeHtml(step.icon) + '</div>';
      }
      html += '<h1 class="step-title">' + AdminUI.escapeHtml(step.title) + '</h1>';
      html += '<p class="step-subtitle">' + AdminUI.escapeHtml(step.subtitle || '') + '</p>';
      html += '</div>';

    } else if (step.type === 'input') {
      if (step.eyebrow) html += '<div class="step-eyebrow">' + AdminUI.escapeHtml(step.eyebrow) + '</div>';
      html += '<h1 class="step-title">' + AdminUI.escapeHtml(step.title) + '</h1>';
      if (step.subtitle) html += '<p class="step-subtitle">' + AdminUI.escapeHtml(step.subtitle) + '</p>';

      const value = state.data[step.field] || '';
      const inputClass = step.mono ? 'step-input step-input-mono' : 'step-input';
      const inputType = step.inputType || 'text';
      const maxLen = step.maxLength ? ' maxlength="' + step.maxLength + '"' : '';

      html += '<input type="' + inputType + '"';
      html += ' id="wizard-input"';
      html += ' class="' + inputClass + '"';
      html += ' placeholder="' + AdminUI.escapeHtml(step.placeholder || '') + '"';
      html += ' value="' + AdminUI.escapeHtml(value) + '"' + maxLen + ' />';

      html += '<div class="step-validation" id="wizard-validation"></div>';

      if (step.hint) {
        html += '<div class="step-hint">';
        html += '<span class="step-hint-icon">i</span>';
        html += '<span>' + AdminUI.escapeHtml(step.hint) + '</span>';
        html += '</div>';
      }

    } else if (step.type === 'dual') {
      if (step.eyebrow) html += '<div class="step-eyebrow">' + AdminUI.escapeHtml(step.eyebrow) + '</div>';
      html += '<h1 class="step-title">' + AdminUI.escapeHtml(step.title) + '</h1>';
      if (step.subtitle) html += '<p class="step-subtitle">' + AdminUI.escapeHtml(step.subtitle) + '</p>';

      const v1 = state.data[step.field1] || '';
      const v2 = state.data[step.field2] || '';

      html += '<input type="' + (step.inputType1 || 'text') + '"';
      html += ' id="wizard-input-1"';
      html += ' class="step-input"';
      html += ' placeholder="' + AdminUI.escapeHtml(step.placeholder1 || '') + '"';
      html += ' value="' + AdminUI.escapeHtml(v1) + '" />';

      html += '<input type="' + (step.inputType2 || 'text') + '"';
      html += ' id="wizard-input-2"';
      html += ' class="step-input"';
      html += ' placeholder="' + AdminUI.escapeHtml(step.placeholder2 || '') + '"';
      html += ' value="' + AdminUI.escapeHtml(v2) + '" />';

      html += '<div class="step-validation" id="wizard-validation"></div>';

      if (step.hint) {
        html += '<div class="step-hint">';
        html += '<span class="step-hint-icon">i</span>';
        html += '<span>' + AdminUI.escapeHtml(step.hint) + '</span>';
        html += '</div>';
      }

    } else if (step.type === 'confirm') {
      if (step.eyebrow) html += '<div class="step-eyebrow">' + AdminUI.escapeHtml(step.eyebrow) + '</div>';
      html += '<h1 class="step-title">' + AdminUI.escapeHtml(step.title) + '</h1>';
      if (step.subtitle) html += '<p class="step-subtitle">' + AdminUI.escapeHtml(step.subtitle) + '</p>';

      html += '<div class="step-confirm">';
      step.fields.forEach(function(f) {
        const value = state.data[f.field] || '—';
        const valueClass = f.mono ? 'step-confirm-value step-confirm-value-mono' : 'step-confirm-value';
        html += '<div class="step-confirm-row">';
        html += '<span class="step-confirm-label">' + AdminUI.escapeHtml(f.label) + '</span>';
        html += '<span class="' + valueClass + '">' + AdminUI.escapeHtml(value) + '</span>';
        html += '</div>';
      });
      html += '</div>';

    } else if (step.type === 'success') {
      html += '<div class="step-success-content">';
      html += '<div class="step-success-icon">✓</div>';
      html += '<h1 class="step-title">' + AdminUI.escapeHtml(step.title) + '</h1>';
      // Subtitle puede ser función para incluir data dinámica
      const subtitle = typeof step.subtitle === 'function' ? step.subtitle(state.data) : step.subtitle;
      if (subtitle) html += '<p class="step-subtitle">' + AdminUI.escapeHtml(subtitle) + '</p>';
      html += '</div>';
    }

    container.innerHTML = html;

    // Bind del input si corresponde
    bindInputs(step);

    // Auto-focus
    setTimeout(function() {
      const input = document.getElementById('wizard-input') || document.getElementById('wizard-input-1');
      if (input) input.focus();
    }, 100);
  }

  /**
   * Bind de eventos en los inputs del step actual.
   */
  function bindInputs(step) {
    if (step.type === 'input') {
      const input = document.getElementById('wizard-input');
      if (!input) return;

      const handler = function() {
        let v = input.value;
        // Si tiene formateador, aplicarlo
        if (step.formatter) {
          v = step.formatter(v);
          input.value = v;
        }
        state.data[step.field] = v;
        validateAndUpdateUI(step);
      };

      input.addEventListener('input', handler);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const s = state.config.steps[state.currentStep];
          // En opcional: avanzar siempre. En obligatorio: solo si valida.
          if (s.optional || !s.validate || s.validate(state.data)) {
            e.preventDefault();
            next();
          }
        }
      });

      // Estado inicial
      validateAndUpdateUI(step);

    } else if (step.type === 'dual') {
      const input1 = document.getElementById('wizard-input-1');
      const input2 = document.getElementById('wizard-input-2');
      if (!input1 || !input2) return;

      input1.addEventListener('input', function() {
        let v = input1.value;
        if (step.formatter1) {
          v = step.formatter1(v);
          input1.value = v;
        }
        state.data[step.field1] = v;
        validateAndUpdateUI(step);
      });

      input2.addEventListener('input', function() {
        let v = input2.value;
        if (step.formatter2) {
          v = step.formatter2(v);
          input2.value = v;
        }
        state.data[step.field2] = v;
        validateAndUpdateUI(step);
      });

      input1.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input2.focus(); }
      });
      input2.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && state.config.steps[state.currentStep].validate(state.data)) {
          e.preventDefault();
          next();
        }
      });

      validateAndUpdateUI(step);
    }
  }

  /**
   * Valida el step actual y actualiza UI (input border, validation message, next button).
   */
  function validateAndUpdateUI(step) {
    const valid = step.validate ? step.validate(state.data) : true;

    // Actualizar inputs
    if (step.type === 'input') {
      const input = document.getElementById('wizard-input');
      if (input) input.classList.toggle('is-valid', valid && input.value.length > 0);
    } else if (step.type === 'dual') {
      const i1 = document.getElementById('wizard-input-1');
      const i2 = document.getElementById('wizard-input-2');
      if (i1 && step.validate1) i1.classList.toggle('is-valid', step.validate1(state.data) && i1.value.length > 0);
      if (i2 && step.validate2) i2.classList.toggle('is-valid', step.validate2(state.data) && i2.value.length > 0);
    }

    // Actualizar mensaje de validación
    const validationEl = document.getElementById('wizard-validation');
    if (validationEl && step.validationMessage) {
      const msg = step.validationMessage(state.data, valid);
      validationEl.textContent = msg.text || '';
      validationEl.className = 'step-validation';
      if (msg.type) validationEl.classList.add('is-' + msg.type);
    }

    // Actualizar botón
    updateNextButton();
  }

  /**
   * Renderiza los botones de acción (atrás / siguiente / skip).
   */
  function renderActions(step) {
    const container = document.getElementById('wizard-actions');

    let html = '';

    // Botón atrás (no en welcome ni success)
    if (step.type !== 'welcome' && step.type !== 'success' && state.currentStep > 0) {
      html += '<button class="btn btn-secondary" id="wizard-back-btn">← Atrás</button>';
    } else if (step.type === 'success' && step.showSkipButton) {
      // En success con encadenado opcional: el skip va donde estaría el botón "atrás"
      html += '<button class="btn btn-secondary" id="wizard-skip-btn">' +
              AdminUI.escapeHtml(step.skipLabel || 'Más tarde') + '</button>';
    } else {
      html += '<div></div>';
    }

    // Botón siguiente / crear / finalizar
    let nextLabel;
    if (step.nextLabel) {
      nextLabel = step.nextLabel;
    } else if (step.type === 'welcome') {
      nextLabel = 'Empezar →';
    } else if (step.type === 'confirm') {
      nextLabel = 'Crear →';
    } else if (step.type === 'success') {
      nextLabel = 'Finalizar →';
    } else {
      nextLabel = 'Siguiente →';
    }

    html += '<button class="btn" id="wizard-next-btn">' + AdminUI.escapeHtml(nextLabel) + '</button>';

    container.innerHTML = html;

    document.getElementById('wizard-back-btn') &&
      document.getElementById('wizard-back-btn').addEventListener('click', back);

    document.getElementById('wizard-skip-btn') &&
      document.getElementById('wizard-skip-btn').addEventListener('click', function() {
        const cfg = state.config;
        if (cfg.onSuccessSkip) {
          cfg.onSuccessSkip(state.data);
        } else {
          AdminUI.mostrarPantalla('screen-dashboard');
        }
      });

    document.getElementById('wizard-next-btn').addEventListener('click', next);

    updateNextButton();
  }

  /**
   * Actualiza el estado disabled del botón "siguiente".
   *
   * Para steps opcionales (step.optional === true):
   *  - Si el campo está vacío: botón "Saltar →" (gris/secondary)
   *  - Si tiene contenido: botón "Siguiente →" (azul/primary)
   *  - Nunca está deshabilitado
   *
   * Para steps obligatorios:
   *  - Disabled hasta que el campo sea válido
   */
  function updateNextButton() {
    const btn = document.getElementById('wizard-next-btn');
    if (!btn) return;
    const step = state.config.steps[state.currentStep];

    if (step.optional) {
      // Step opcional: nunca disabled, label cambia según contenido
      btn.disabled = false;
      const tieneContenido = step.field && state.data[step.field] && String(state.data[step.field]).trim().length > 0;
      const label = tieneContenido ? (step.nextLabel || 'Siguiente →') : (step.skipLabel || 'Saltar →');
      btn.textContent = label;
      btn.classList.toggle('btn-primary', tieneContenido);
      btn.classList.toggle('btn-secondary', !tieneContenido);
    } else {
      // Step obligatorio: disabled hasta validar, mantiene btn-primary
      const valid = step.validate ? step.validate(state.data) : true;
      btn.disabled = !valid;
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
    }
  }

  /**
   * Avanza al siguiente step. Si está en confirm, llama onComplete.
   * Si está en success, llama al callback final.
   */
  async function next() {
    const cfg = state.config;
    const step = cfg.steps[state.currentStep];

    // En steps obligatorios, requerir validación
    // En steps opcionales, permitir avanzar aunque el campo esté vacío
    if (!step.optional && step.validate && !step.validate(state.data)) return;

    if (step.type === 'confirm') {
      // Ejecutar onComplete
      if (cfg.onComplete) {
        state.isCompleting = true;
        AdminUI.setLoading(true);

        const exito = await cfg.onComplete(state.data);

        AdminUI.setLoading(false);
        state.isCompleting = false;

        if (!exito) return; // si falla, quedamos en confirm para reintento
      }
      // Avanzar al success
      state.currentStep++;
      render();
      return;
    }

    if (step.type === 'success') {
      // Final del wizard. Llamar callback de cierre si existe.
      if (cfg.onSuccessNext) {
        cfg.onSuccessNext(state.data);
      } else {
        AdminUI.mostrarPantalla('screen-dashboard');
      }
      return;
    }

    // Avanzar normalmente
    if (state.currentStep < cfg.steps.length - 1) {
      state.currentStep++;
      render();
    }
  }

  /**
   * Vuelve al step anterior.
   */
  function back() {
    if (state.currentStep > 0) {
      state.currentStep--;
      render();
    }
  }

  return {
    start,
    cancel,
    next,
    back
  };

})();
