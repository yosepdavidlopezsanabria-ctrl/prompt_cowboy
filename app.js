/**
 * ==========================================================================
 * TaskFlow — Lógica principal de la aplicación (app.js)
 * Desarrollado en JavaScript puro (Vanilla JS) sin dependencias externas.
 * ==========================================================================
 */

(() => {
  'use strict';

  // Clave para persistencia en localStorage
  const STORAGE_KEY = 'taskflow_tasks_v1';

  // Estado global de la aplicación
  let tasks = [];
  let currentFilter = 'all'; // 'all' | 'pending' | 'completed'
  let editingTaskId = null;
  let pendingDeleteAction = null; // Función a ejecutar si el usuario confirma el borrado
  let lastFocusedElement = null; // Para devolver el foco al cerrar el modal

  // Referencias a elementos del DOM
  const dom = {
    currentDate: document.getElementById('current-date'),
    taskForm: document.getElementById('task-form'),
    taskInput: document.getElementById('task-input'),
    formError: document.getElementById('form-error'),
    taskList: document.getElementById('task-list'),
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.getElementById('empty-title'),
    emptyDescription: document.getElementById('empty-description'),
    countPending: document.getElementById('count-pending'),
    countCompleted: document.getElementById('count-completed'),
    countTotal: document.getElementById('count-total'),
    progressPercentage: document.getElementById('progress-percentage'),
    progressBarContainer: document.getElementById('progress-bar-container'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    clearCompletedBtn: document.getElementById('clear-completed-btn'),
    srAnnouncer: document.getElementById('sr-announcer'),
    // Modal de confirmación
    confirmModal: document.getElementById('confirm-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn')
  };

  /**
   * Escapa caracteres especiales HTML para prevenir inyección de código (XSS)
   * cuando se inserta contenido dinámico en plantillas HTML.
   * @param {string} texto - Cadena introducida por el usuario.
   * @returns {string} Cadena segura con entidades HTML escapadas.
   */
  function escaparHTML(texto) {
    const mapa = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(texto).replace(/[&<>"']/g, (caracter) => mapa[caracter]);
  }

  /**
   * Genera un identificador único para cada tarea.
   * @returns {string} ID único.
   */
  function generarId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Formatea una marca de tiempo en una fecha legible en español.
   * @param {number} timestamp - Fecha en milisegundos.
   * @returns {string} Fecha formateada.
   */
  function formatearFecha(timestamp) {
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(timestamp));
    } catch {
      return '';
    }
  }

  /**
   * Muestra la fecha actual en el encabezado de la aplicación.
   */
  function mostrarFechaActual() {
    try {
      const opciones = { weekday: 'long', day: 'numeric', month: 'short' };
      dom.currentDate.textContent = new Intl.DateTimeFormat('es-ES', opciones).format(new Date());
    } catch {
      dom.currentDate.textContent = new Date().toLocaleDateString();
    }
  }

  /**
   * Anuncia un mensaje a los lectores de pantalla mediante una región aria-live.
   * @param {string} mensaje - Mensaje descriptivo de la acción realizada.
   */
  function anunciarParaLectores(mensaje) {
    dom.srAnnouncer.textContent = '';
    setTimeout(() => {
      dom.srAnnouncer.textContent = mensaje;
    }, 50);
  }

  /**
   * Carga la lista de tareas almacenada en localStorage.
   */
  function cargarTareasDeStorage() {
    try {
      const datosGuardados = localStorage.getItem(STORAGE_KEY);
      if (!datosGuardados) {
        tasks = [];
        return;
      }
      const parseadas = JSON.parse(datosGuardados);
      if (Array.isArray(parseadas)) {
        tasks = parseadas.filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.text === 'string' &&
            typeof item.completed === 'boolean'
        );
      } else {
        tasks = [];
      }
    } catch (error) {
      console.warn('No se pudieron cargar las tareas desde localStorage:', error);
      tasks = [];
    }
  }

  /**
   * Guarda la lista actual de tareas en localStorage.
   */
  function guardarTareasEnStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.warn('No se pudieron guardar las tareas en localStorage:', error);
    }
  }

  /**
   * Muestra un mensaje de error de validación bajo el campo principal.
   * @param {string} mensaje - Mensaje de error a mostrar.
   */
  function mostrarErrorFormulario(mensaje) {
    dom.formError.textContent = `⚠️ ${mensaje}`;
    dom.formError.hidden = false;
    dom.taskInput.classList.remove('input-invalid');
    // Forzar reflujo para reiniciar la animación si se repite el error
    void dom.taskInput.offsetWidth;
    dom.taskInput.classList.add('input-invalid');
    dom.taskInput.setAttribute('aria-invalid', 'true');
  }

  /**
   * Limpia cualquier mensaje de error activo en el formulario principal.
   */
  function limpiarErrorFormulario() {
    if (!dom.formError.hidden) {
      dom.formError.hidden = true;
      dom.formError.textContent = '';
    }
    dom.taskInput.classList.remove('input-invalid');
    dom.taskInput.removeAttribute('aria-invalid');
  }

  /**
   * Agrega una nueva tarea tras validar que el texto no esté vacío.
   * @param {string} textoBruto - Texto ingresado por el usuario.
   */
  function agregarTarea(textoBruto) {
    const textoLimpio = textoBruto.trim();

    if (!textoLimpio) {
      mostrarErrorFormulario('Por favor, escribe una descripción antes de agregar la tarea.');
      dom.taskInput.focus();
      return;
    }

    limpiarErrorFormulario();

    const nuevaTarea = {
      id: generarId(),
      text: textoLimpio,
      completed: false,
      createdAt: Date.now()
    };

    tasks.unshift(nuevaTarea);
    guardarTareasEnStorage();

    // Si el filtro está en "completadas", cambiar a "todas" para que vea su nueva tarea
    if (currentFilter === 'completed') {
      cambiarFiltro('all');
    } else {
      renderizarAplicacion();
    }

    dom.taskInput.value = '';
    dom.taskInput.focus();
    anunciarParaLectores(`Tarea agregada: ${textoLimpio}`);
  }

  /**
   * Cambia el estado completado/pendiente de una tarea por su ID.
   * @param {string} id - Identificador de la tarea.
   */
  function alternarEstadoTarea(id) {
    const tarea = tasks.find((t) => t.id === id);
    if (!tarea) return;

    tarea.completed = !tarea.completed;
    guardarTareasEnStorage();
    renderizarAplicacion();

    const estadoTexto = tarea.completed ? 'completada' : 'marcada como pendiente';
    anunciarParaLectores(`Tarea "${tarea.text}" ${estadoTexto}.`);
  }

  /**
   * Activa el modo de edición en línea para una tarea específica.
   * @param {string} id - Identificador de la tarea a editar.
   */
  function iniciarEdicionTarea(id) {
    editingTaskId = id;
    renderizarAplicacion();

    const inputEdicion = dom.taskList.querySelector(`.edit-input[data-id="${id}"]`);
    if (inputEdicion) {
      inputEdicion.focus();
      inputEdicion.setSelectionRange(inputEdicion.value.length, inputEdicion.value.length);
    }
  }

  /**
   * Guarda los cambios de una tarea en edición tras validar que no quede vacía.
   * @param {string} id - Identificador de la tarea.
   * @param {string} nuevoTextoBruto - Nuevo texto introducido.
   */
  function guardarEdicionTarea(id, nuevoTextoBruto) {
    const textoLimpio = nuevoTextoBruto.trim();
    const inputEdicion = dom.taskList.querySelector(`.edit-input[data-id="${id}"]`);

    if (!textoLimpio) {
      if (inputEdicion) {
        inputEdicion.classList.remove('input-invalid');
        void inputEdicion.offsetWidth;
        inputEdicion.classList.add('input-invalid');
        inputEdicion.focus();
      }
      anunciarParaLectores('El texto de la tarea no puede estar vacío.');
      return;
    }

    const tarea = tasks.find((t) => t.id === id);
    if (tarea) {
      tarea.text = textoLimpio;
      guardarTareasEnStorage();
      anunciarParaLectores(`Tarea actualizada a: ${textoLimpio}`);
    }

    editingTaskId = null;
    renderizarAplicacion();
  }

  /**
   * Cancela el modo de edición actual sin guardar cambios.
   */
  function cancelarEdicionTarea() {
    if (editingTaskId === null) return;
    editingTaskId = null;
    renderizarAplicacion();
    anunciarParaLectores('Edición cancelada.');
  }

  /**
   * Abre el cuadro de diálogo de confirmación antes de eliminar una tarea.
   * @param {string} id - Identificador de la tarea a eliminar.
   * @param {HTMLElement} elementoOrigen - Botón desde el cual se invocó la acción.
   */
  function solicitarEliminacionTarea(id, elementoOrigen) {
    const tarea = tasks.find((t) => t.id === id);
    if (!tarea) return;

    abrirModalConfirmacion({
      titulo: '¿Eliminar esta tarea?',
      mensaje: `Se eliminará permanentemente la tarea "${tarea.text}".`,
      elementoOrigen,
      alConfirmar: () => ejecutarEliminacionTarea(id)
    });
  }

  /**
   * Ejecuta la animación de salida y elimina la tarea del estado y localStorage.
   * @param {string} id - Identificador de la tarea a eliminar.
   */
  function ejecutarEliminacionTarea(id) {
    const tarea = tasks.find((t) => t.id === id);
    const nombreTarea = tarea ? tarea.text : '';
    const elementoItem = dom.taskList.querySelector(`.task-item[data-id="${id}"]`);

    const finalizarBorrado = () => {
      tasks = tasks.filter((t) => t.id !== id);
      if (editingTaskId === id) {
        editingTaskId = null;
      }
      guardarTareasEnStorage();
      renderizarAplicacion();
      anunciarParaLectores(`Tarea "${nombreTarea}" eliminada.`);
    };

    if (elementoItem) {
      elementoItem.classList.add('removing');
      setTimeout(finalizarBorrado, 210);
    } else {
      finalizarBorrado();
    }
  }

  /**
   * Solicita confirmación para eliminar todas las tareas completadas.
   */
  function solicitarLimpiarCompletadas() {
    const cantidadCompletadas = tasks.filter((t) => t.completed).length;
    if (cantidadCompletadas === 0) return;

    abrirModalConfirmacion({
      titulo: '¿Eliminar tareas completadas?',
      mensaje: `Se eliminarán ${cantidadCompletadas} ${
        cantidadCompletadas === 1 ? 'tarea completada' : 'tareas completadas'
      }. Esta acción no se puede deshacer.`,
      elementoOrigen: dom.clearCompletedBtn,
      alConfirmar: () => {
        tasks = tasks.filter((t) => !t.completed);
        guardarTareasEnStorage();
        renderizarAplicacion();
        anunciarParaLectores('Se han eliminado todas las tareas completadas.');
      }
    });
  }

  /**
   * Muestra el modal de confirmación accesible.
   * @param {Object} opciones - Configuración del modal.
   */
  function abrirModalConfirmacion({ titulo, mensaje, elementoOrigen, alConfirmar }) {
    lastFocusedElement = elementoOrigen || document.activeElement;
    pendingDeleteAction = alConfirmar;

    dom.modalTitle.textContent = titulo;
    dom.modalMessage.textContent = mensaje;
    dom.confirmModal.hidden = false;

    // Enfocar el botón de cancelar por seguridad para evitar borrados accidentales
    dom.modalCancelBtn.focus();
  }

  /**
   * Cierra el modal de confirmación y restaura el foco al elemento previo.
   */
  function cerrarModalConfirmacion() {
    dom.confirmModal.hidden = true;
    pendingDeleteAction = null;

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function' && document.body.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    } else {
      dom.taskInput.focus();
    }
  }

  /**
   * Cambia el filtro activo ('all', 'pending', 'completed') y vuelve a renderizar.
   * @param {string} nuevoFiltro - Identificador del filtro.
   */
  function cambiarFiltro(nuevoFiltro) {
    currentFilter = nuevoFiltro;

    dom.filterButtons.forEach((boton) => {
      const esActivo = boton.dataset.filter === nuevoFiltro;
      boton.classList.toggle('active', esActivo);
      boton.setAttribute('aria-pressed', esActivo ? 'true' : 'false');
    });

    renderizarAplicacion();
  }

  /**
   * Actualiza los contadores de tareas pendientes, completadas, total y barra de progreso.
   */
  function actualizarContadores() {
    const total = tasks.length;
    const completadas = tasks.filter((t) => t.completed).length;
    const pendientes = total - completadas;
    const porcentaje = total === 0 ? 0 : Math.round((completadas / total) * 100);

    dom.countPending.textContent = String(pendientes);
    dom.countCompleted.textContent = String(completadas);
    dom.countTotal.textContent = String(total);

    dom.progressPercentage.textContent = `${porcentaje}%`;
    dom.progressBarFill.style.width = `${porcentaje}%`;
    dom.progressBarContainer.setAttribute('aria-valuenow', String(porcentaje));

    // Mostrar u ocultar botón para limpiar completadas
    dom.clearCompletedBtn.hidden = completadas === 0;
  }

  /**
   * Obtiene las tareas que corresponden al filtro seleccionado actualmente.
   * @returns {Array} Lista de tareas filtradas.
   */
  function obtenerTareasFiltradas() {
    if (currentFilter === 'pending') {
      return tasks.filter((t) => !t.completed);
    }
    if (currentFilter === 'completed') {
      return tasks.filter((t) => t.completed);
    }
    return tasks;
  }

  /**
   * Actualiza la visibilidad y los textos del estado vacío según el filtro activo.
   * @param {number} cantidadFiltrada - Número de tareas visibles con el filtro actual.
   */
  function actualizarEstadoVacio(cantidadFiltrada) {
    if (cantidadFiltrada > 0) {
      dom.emptyState.hidden = true;
      return;
    }

    dom.emptyState.hidden = false;

    if (tasks.length === 0) {
      dom.emptyTitle.textContent = 'No tienes tareas registradas';
      dom.emptyDescription.textContent =
        'Añade tu primera tarea en el campo superior para comenzar a organizar tu día.';
    } else if (currentFilter === 'pending') {
      dom.emptyTitle.textContent = '¡Todo al día!';
      dom.emptyDescription.textContent = 'No tienes tareas pendientes en este momento.';
    } else if (currentFilter === 'completed') {
      dom.emptyTitle.textContent = 'Aún no hay tareas completadas';
      dom.emptyDescription.textContent =
        'Marca la casilla de verificación de una tarea cuando la termines para verla aquí.';
    }
  }

  /**
   * Construye el elemento DOM (`<li>`) correspondiente a una tarea,
   * escapando siempre el contenido introducido por el usuario.
   * @param {Object} tarea - Objeto de la tarea.
   * @returns {HTMLLIElement} Elemento de lista listo para insertar.
   */
  function crearElementoTarea(tarea) {
    const li = document.createElement('li');
    const estaEditando = editingTaskId === tarea.id;
    const textoSeguro = escaparHTML(tarea.text);
    const fechaSegura = escaparHTML(formatearFecha(tarea.createdAt));
    const idSeguro = escaparHTML(tarea.id);

    li.className = `task-item${tarea.completed ? ' completed' : ''}${estaEditando ? ' editing' : ''}`;
    li.dataset.id = tarea.id;

    if (estaEditando) {
      li.innerHTML = `
        <div class="edit-form" role="group" aria-label="Editando tarea">
          <label for="edit-input-${idSeguro}" class="sr-only">Editar descripción de la tarea</label>
          <input
            type="text"
            id="edit-input-${idSeguro}"
            class="edit-input"
            data-id="${idSeguro}"
            value="${textoSeguro}"
            maxlength="200"
            autocomplete="off"
          />
          <div class="edit-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm save-edit-btn"
              data-action="save-edit"
              data-id="${idSeguro}"
              aria-label="Guardar cambios"
            >
              Guardar
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm cancel-edit-btn"
              data-action="cancel-edit"
              data-id="${idSeguro}"
              aria-label="Cancelar edición"
            >
              Cancelar
            </button>
          </div>
        </div>
      `;
      return li;
    }

    li.innerHTML = `
      <div class="task-content">
        <label class="checkbox-wrapper" title="${tarea.completed ? 'Desmarcar tarea' : 'Marcar como completada'}">
          <input
            type="checkbox"
            class="task-checkbox"
            data-action="toggle"
            data-id="${idSeguro}"
            ${tarea.completed ? 'checked' : ''}
            aria-label="${tarea.completed ? 'Desmarcar como completada:' : 'Marcar como completada:'} ${textoSeguro}"
          />
          <span class="checkbox-custom" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        </label>

        <div class="task-text-wrapper">
          <span
            class="task-text"
            data-action="dblclick-edit"
            data-id="${idSeguro}"
            title="Doble clic para editar"
          >${textoSeguro}</span>
          ${fechaSegura ? `<span class="task-meta">Creada: ${fechaSegura}</span>` : ''}
        </div>
      </div>

      <div class="task-actions">
        <button
          type="button"
          class="icon-btn edit-btn"
          data-action="edit"
          data-id="${idSeguro}"
          title="Editar tarea"
          aria-label="Editar tarea: ${textoSeguro}"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>

        <button
          type="button"
          class="icon-btn delete-btn"
          data-action="delete"
          data-id="${idSeguro}"
          title="Eliminar tarea"
          aria-label="Eliminar tarea: ${textoSeguro}"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </button>
      </div>
    `;

    return li;
  }

  /**
   * Renderiza la lista completa de tareas, los contadores y el estado vacío.
   */
  function renderizarAplicacion() {
    actualizarContadores();

    const tareasFiltradas = obtenerTareasFiltradas();
    dom.taskList.innerHTML = '';

    const fragmento = document.createDocumentFragment();
    tareasFiltradas.forEach((tarea) => {
      fragmento.appendChild(crearElementoTarea(tarea));
    });

    dom.taskList.appendChild(fragmento);
    actualizarEstadoVacio(tareasFiltradas.length);
  }

  /**
   * Configura todos los escuchadores de eventos (Event Listeners) de la interfaz.
   */
  function configurarEventos() {
    // 1. Envío del formulario para agregar tarea
    dom.taskForm.addEventListener('submit', (evento) => {
      evento.preventDefault();
      agregarTarea(dom.taskInput.value);
    });

    // Limpiar el error de validación al escribir en el campo principal
    dom.taskInput.addEventListener('input', () => {
      if (!dom.formError.hidden) {
        limpiarErrorFormulario();
      }
    });

    // 2. Delegación de eventos de clic y cambio en la lista de tareas
    dom.taskList.addEventListener('click', (evento) => {
      const botonAccion = evento.target.closest('[data-action]');
      if (!botonAccion) return;

      const { action, id } = botonAccion.dataset;

      if (action === 'edit') {
        iniciarEdicionTarea(id);
      } else if (action === 'delete') {
        solicitarEliminacionTarea(id, botonAccion);
      } else if (action === 'save-edit') {
        const inputEdicion = dom.taskList.querySelector(`.edit-input[data-id="${id}"]`);
        if (inputEdicion) {
          guardarEdicionTarea(id, inputEdicion.value);
        }
      } else if (action === 'cancel-edit') {
        cancelarEdicionTarea();
      }
    });

    // Cambio en casillas de verificación (completar / desmarcar)
    dom.taskList.addEventListener('change', (evento) => {
      const checkbox = evento.target.closest('input.task-checkbox[data-action="toggle"]');
      if (!checkbox) return;
      alternarEstadoTarea(checkbox.dataset.id);
    });

    // Doble clic sobre el texto de una tarea para editarla
    dom.taskList.addEventListener('dblclick', (evento) => {
      const textoTarea = evento.target.closest('[data-action="dblclick-edit"]');
      if (!textoTarea) return;
      iniciarEdicionTarea(textoTarea.dataset.id);
    });

    // Navegación por teclado en el campo de edición (Enter = guardar, Escape = cancelar)
    dom.taskList.addEventListener('keydown', (evento) => {
      const inputEdicion = evento.target.closest('.edit-input');
      if (!inputEdicion) return;

      const id = inputEdicion.dataset.id;
      if (evento.key === 'Enter') {
        evento.preventDefault();
        guardarEdicionTarea(id, inputEdicion.value);
      } else if (evento.key === 'Escape') {
        evento.preventDefault();
        cancelarEdicionTarea();
      }
    });

    // 3. Botones de filtro (Todas / Pendientes / Completadas)
    dom.filterButtons.forEach((boton) => {
      boton.addEventListener('click', () => {
        cambiarFiltro(boton.dataset.filter);
      });
    });

    // 4. Botón para limpiar todas las tareas completadas
    dom.clearCompletedBtn.addEventListener('click', () => {
      solicitarLimpiarCompletadas();
    });

    // 5. Eventos del modal de confirmación
    dom.modalCancelBtn.addEventListener('click', cerrarModalConfirmacion);

    dom.modalConfirmBtn.addEventListener('click', () => {
      if (typeof pendingDeleteAction === 'function') {
        pendingDeleteAction();
      }
      cerrarModalConfirmacion();
    });

    // Cerrar modal al hacer clic en el fondo oscuro (backdrop)
    dom.confirmModal.addEventListener('click', (evento) => {
      if (evento.target === dom.confirmModal) {
        cerrarModalConfirmacion();
      }
    });

    // Manejo de teclado global cuando el modal está abierto (Escape para cerrar, Tab atrapado)
    document.addEventListener('keydown', (evento) => {
      if (dom.confirmModal.hidden) return;

      if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrarModalConfirmacion();
      } else if (evento.key === 'Tab') {
        // Mantener el foco dentro de los botones del modal
        const elementosEnfocables = [dom.modalCancelBtn, dom.modalConfirmBtn];
        const primerElemento = elementosEnfocables[0];
        const ultimoElemento = elementosEnfocables[elementosEnfocables.length - 1];

        if (evento.shiftKey && document.activeElement === primerElemento) {
          evento.preventDefault();
          ultimoElemento.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimoElemento) {
          evento.preventDefault();
          primerElemento.focus();
        }
      }
    });
  }

  /**
   * Inicializa la aplicación al cargar el documento.
   */
  function inicializar() {
    mostrarFechaActual();
    cargarTareasDeStorage();
    configurarEventos();
    renderizarAplicacion();
  }

  // Arrancar la aplicación
  inicializar();
})();

