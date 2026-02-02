// Calculadora Financiera - Vanilla JS
// Interfaz en español. Persistencia con localStorage.

(() => {
  // Keys for localStorage
  const STORAGE_KEY = 'fincalc_v1';
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error cargando estado', e);
      return defaultState();
    }
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function defaultState() {
    return {
      items: [], // ingresos
      expenses: [],
      folders: [], // each folder: {id,name,jobs:[{id,name,items,expenses,summary}]}
      history: {}, // month (YYYY-MM) -> snapshot
      settings: {
        exchangeRate: 350.00,
        showUSD: false,
      }
    };
  }

  const state = loadState();

  // Helpers
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2,9); }
  function fmtARS(v) {
    const f = new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:2 });
    return f.format(v);
  }
  function fmtUSD(v) {
    const f = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
    return f.format(v);
  }

  // DOM refs
  const itemsList = $('#items-list');
  const expensesList = $('#expenses-list');
  const subtotalIncomeEl = $('#subtotal-income');
  const totalExpensesEl = $('#total-expenses');
  const netBalanceEl = $('#net-balance');
  const exchangeRateInput = $('#exchange-rate');
  const toggleUSD = $('#toggle-usd');
  const currencyInfo = $('#currency-info');
  const addItemBtn = $('#add-item-btn');
  const addExpenseBtn = $('#add-expense-btn');
  const settingsBtn = $('#settings-btn');
  const settingsMenu = $('#settings-menu');
  const exportBtn = $('#export-data');
  const importBtn = $('#import-data');
  const importFile = $('#import-file');
  const openFoldersBtn = $('#open-folders');
  const modal = $('#modal');
  const closeModalBtn = $('#close-modal');
  const modalFolders = $('#modal-folders');
  const createFolderBtn = $('#create-folder');
  const newFolderNameInput = $('#new-folder-name');
  const foldersList = $('#folders-list');
  const jobNameInput = $('#job-name');
  const jobFolderSelect = $('#job-folder-select');
  const saveJobBtn = $('#save-job-to-folder');
  const saveSnapshotBtn = $('#save-snapshot');
  const loadSnapshotBtn = $('#load-snapshot');
  const historyMonthInput = $('#history-month');
  const openHistoryBtn = $('#open-history');
  const clearAllBtn = $('#clear-all');

  // Init inputs from state
  exchangeRateInput.value = state.settings.exchangeRate;
  toggleUSD.checked = !!state.settings.showUSD;

  // Events
  settingsBtn.addEventListener('click', () => {
    settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) settingsMenu.style.display = 'none';
  });
  exchangeRateInput.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value) || 0;
    state.settings.exchangeRate = v;
    saveState();
    renderTotals();
  });
  toggleUSD.addEventListener('change', (e) => {
    state.settings.showUSD = e.target.checked;
    saveState();
    renderTotals();
  });

  addItemBtn.addEventListener('click', () => {
    addItem({ id: uid('item'), description:'Ítem', pricePerUnit:0, quantity:1, measure:'unidad' });
  });
  addExpenseBtn.addEventListener('click', () => {
    // default expense is generic
    addExpense({ id: uid('exp'), description:'Gasto', category:'Generales', price:0 });
  });

  exportBtn.addEventListener('click', () => {
    const payload = {
      items: state.items,
      expenses: state.expenses,
      folders: state.folders,
      settings: state.settings,
      history: state.history
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fin-data.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import logic (file input). Permite REEMPLAZAR o MEZCLAR.
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      if (!payload.items || !payload.expenses) {
        if (!confirm('El archivo no tiene la estructura esperada. ¿Deseas intentar reemplazar igualmente los datos?')) return;
      }
      const replace = confirm('¿Deseas REEMPLAZAR todos los datos actuales con el archivo importado? (Aceptar = Reemplazar, Cancelar = Mezclar)');
      if (replace) {
        state.items = payload.items || [];
        state.expenses = payload.expenses || [];
        state.folders = payload.folders || [];
        state.history = payload.history || {};
        if (payload.settings) state.settings = payload.settings;
      } else {
        const incomingItems = (payload.items || []).map(i => ({...i, id: uid('item')}));
        const incomingExpenses = (payload.expenses || []).map(e => ({...e, id: uid('exp')}));
        state.items = state.items.concat(incomingItems);
        state.expenses = state.expenses.concat(incomingExpenses);
        if (payload.folders) {
          state.folders = state.folders.concat(payload.folders.map(f => ({...f, id: uid('folder'), jobs: (f.jobs||[]).map(j => ({...j, id: uid('job')}))})));
        }
      }
      saveState();
      renderAll();
      alert('Importación completada.');
    } catch (err) {
      console.error(err);
      alert('Error leyendo el archivo: ' + err.message);
    } finally {
      importFile.value = '';
    }
  });

  openFoldersBtn.addEventListener('click', () => {
    renderModalFolders();
    modal.classList.remove('hidden');
  });
  closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
  clearAllBtn.addEventListener('click', () => {
    if (!confirm('¿Restablecer todos los datos guardados?')) return;
    Object.assign(state, defaultState());
    saveState();
    exchangeRateInput.value = state.settings.exchangeRate;
    toggleUSD.checked = state.settings.showUSD;
    renderAll();
  });

  createFolderBtn.addEventListener('click', () => {
    const name = newFolderNameInput.value.trim();
    if (!name) { alert('Ingrese un nombre de carpeta'); return; }
    const folder = { id: uid('folder'), name, jobs: [] };
    state.folders.push(folder);
    saveState();
    newFolderNameInput.value = '';
    renderFolders();
    renderJobFolderSelect();
  });

  saveJobBtn.addEventListener('click', () => {
    const folderId = jobFolderSelect.value;
    const folder = state.folders.find(f => f.id === folderId);
    const jobName = jobNameInput.value.trim();
    if (!folder) { alert('Seleccione una carpeta'); return; }
    if (!jobName) { alert('Ingrese un nombre para el trabajo'); return; }
    const job = {
      id: uid('job'),
      name: jobName,
      createdAt: new Date().toISOString(),
      items: JSON.parse(JSON.stringify(state.items)),
      expenses: JSON.parse(JSON.stringify(state.expenses)),
      summary: computeSummarySnapshot()
    };
    folder.jobs.push(job);
    saveState();
    jobNameInput.value = '';
    renderFolders();
    alert('Trabajo guardado en carpeta.');
  });

  saveSnapshotBtn.addEventListener('click', () => {
    const month = historyMonthInput.value;
    if (!month) { alert('Seleccione un mes (YYYY-MM)'); return; }
    const snapshot = {
      createdAt: new Date().toISOString(),
      items: JSON.parse(JSON.stringify(state.items)),
      expenses: JSON.parse(JSON.stringify(state.expenses)),
      summary: computeSnapshotSummary()
    };
    state.history[month] = snapshot;
    saveState();
    alert('Mes guardado en historial.');
  });

  loadSnapshotBtn.addEventListener('click', () => {
    const month = historyMonthInput.value;
    if (!month) { alert('Seleccione mes'); return; }
    const snap = state.history[month];
    if (!snap) { alert('No hay registro para ese mes'); return; }
    state.items = JSON.parse(JSON.stringify(snap.items));
    state.expenses = JSON.parse(JSON.stringify(snap.expenses));
    saveState();
    renderAll();
    alert('Historial cargado.');
  });

  openHistoryBtn.addEventListener('click', () => {
    const keys = Object.keys(state.history).sort().reverse();
    const lines = keys.map(k => `${k} — ${state.history[k].summary.netBalanceFormatted || ''}`);
    if (lines.length===0) alert('No hay historial guardado');
    else alert('Historial:\n' + lines.join('\n'));
  });

  // Render functions
  function renderAll(){
    renderItems();
    renderExpenses();
    renderFolders();
    renderTotals();
    renderJobFolderSelect();
  }

  function renderItems(){
    itemsList.innerHTML = '';
    state.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'item';
      el.dataset.id = item.id;
      el.innerHTML = `
        <input class="desc" placeholder="Descripción" value="${escapeHtml(item.description)}" />
        <select class="measure">
          <option value="unidad">Unidad</option>
          <option value="metro">Metro (m)</option>
        </select>
        <input class="ppu" type="number" min="0" step="0.01" value="${item.pricePerUnit}" title="Precio por unidad / por metro" />
        <input class="qty" type="number" min="0" step="0.5" value="${item.quantity}" title="Cantidad (0.5 para medio)" />
        <div class="small subtotal">${fmtARS(lineTotal(item))}</div>
        <div class="actions">
          <button class="btn-insert">Insert</button>
          <button class="btn-delete">Eliminar</button>
        </div>
      `;
      const measureSel = el.querySelector('.measure');
      measureSel.value = item.measure || 'unidad';
      // Event listeners
      el.querySelector('.desc').addEventListener('input', (e) => { item.description = e.target.value; saveState(); renderTotals(); });
      measureSel.addEventListener('change', (e) => { item.measure = e.target.value; saveState(); renderTotals(); });
      el.querySelector('.ppu').addEventListener('input', (e) => { item.pricePerUnit = parseFloat(e.target.value) || 0; saveState(); renderTotals(); });
      el.querySelector('.qty').addEventListener('input', (e) => { item.quantity = parseFloat(e.target.value) || 0; saveState(); renderTotals(); });
      el.querySelector('.btn-delete').addEventListener('click', () => {
        if (!confirm('Eliminar ítem?')) return;
        state.items = state.items.filter(it => it.id !== item.id);
        saveState();
        renderAll();
      });
      // Insert button will save item into a folder? Provide quick "insert to folder" UX
      el.querySelector('.btn-insert').addEventListener('click', () => {
        // open modal and let user choose folder/job to insert this single item into
        renderModalFolders({ singleItem: item });
        modal.classList.remove('hidden');
      });

      itemsList.appendChild(el);
    });
  }

  function renderExpenses(){
    expensesList.innerHTML = '';
    state.expenses.forEach(exp => {
      const el = document.createElement('div');
      el.className = 'expense';
      el.dataset.id = exp.id;
      // If category is 'Salarios' we show price per día and days (default 30)
      if (exp.category === 'Salarios') {
        el.innerHTML = `
          <input class="desc" placeholder="Descripción" value="${escapeHtml(exp.description)}" />
          <select class="category">
            <option value="Salarios">Salarios</option>
            <option value="Generales">Generales</option>
            <option value="Otros">Otros</option>
          </select>
          <input class="price" type="number" min="0" step="0.01" value="${exp.price}" title="Precio por día" />
          <input class="days" type="number" min="0" step="0.5" value="${exp.days !== undefined ? exp.days : 30}" title="Días (0.5 para medio día)" />
          <div class="small subtotal">${fmtARS(expenseTotal(exp))}</div>
          <div class="actions">
            <button class="btn-delete">Eliminar</button>
          </div>
        `;
      } else {
        el.innerHTML = `
          <input class="desc" placeholder="Descripción" value="${escapeHtml(exp.description)}" />
          <select class="category">
            <option value="Generales">Generales</option>
            <option value="Salarios">Salarios</option>
            <option value="Otros">Otros</option>
          </select>
          <input class="price" type="number" min="0" step="0.01" value="${exp.price}" title="Precio total del gasto" />
          <div class="small subtotal">${fmtARS(expenseTotal(exp))}</div>
          <div class="actions">
            <button class="btn-delete">Eliminar</button>
          </div>
        `;
      }
      const categorySel = el.querySelector('.category');
      categorySel.value = exp.category || 'Generales';
      el.querySelector('.desc').addEventListener('input', (e) => { exp.description = e.target.value; saveState(); renderTotals(); });
      categorySel.addEventListener('change', (e) => {
        exp.category = e.target.value;
        // if changed to Salarios ensure days exist
        if (exp.category === 'Salarios' && exp.days === undefined) exp.days = 30;
        saveState();
        renderAll();
      });
      const priceInput = el.querySelector('.price');
      priceInput.addEventListener('input', (e) => { exp.price = parseFloat(e.target.value) || 0; saveState(); renderTotals(); });

      const daysInput = el.querySelector('.days');
      if (daysInput) {
        daysInput.addEventListener('input', (e) => {
          exp.days = parseFloat(e.target.value) || 0;
          // allow 0.5 increments
          saveState();
          renderTotals();
        });
      }

      el.querySelector('.btn-delete').addEventListener('click', () => {
        if (!confirm('Eliminar gasto?')) return;
        state.expenses = state.expenses.filter(x => x.id !== exp.id);
        saveState();
        renderAll();
      });

      expensesList.appendChild(el);
    });
  }

  function renderFolders(){
    foldersList.innerHTML = '';
    state.folders.forEach(f => {
      const el = document.createElement('div');
      el.className = 'folder-entry';
      el.innerHTML = `<div><strong>${escapeHtml(f.name)}</strong><div class="small">${f.jobs.length} trabajos</div></div>
        <div>
          <button class="btn-open">Abrir</button>
          <button class="btn-delete">Eliminar</button>
        </div>`;
      el.querySelector('.btn-open').addEventListener('click', () => {
        renderModalFolders();
        modal.classList.remove('hidden');
        setTimeout(() => {
          const node = modal.querySelector(`[data-folder-id="${f.id}"]`);
          if (node) node.scrollIntoView({behavior:'smooth', block:'center'});
        }, 80);
      });
      el.querySelector('.btn-delete').addEventListener('click', () => {
        if (!confirm('Eliminar carpeta y todos sus trabajos?')) return;
        state.folders = state.folders.filter(x => x.id !== f.id);
        saveState();
        renderFolders();
        renderJobFolderSelect();
      });
      foldersList.appendChild(el);
    });
  }

  function renderJobFolderSelect(){
    jobFolderSelect.innerHTML = '';
    state.folders.forEach(f => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.name;
      jobFolderSelect.appendChild(o);
    });
  }

  function renderModalFolders(opts){
    // opts: { singleItem }
    modalFolders.innerHTML = '';
    if (state.folders.length === 0) {
      modalFolders.innerHTML = '<div class="small">No hay carpetas. Crea una desde el panel principal.</div>';
      return;
    }
    state.folders.forEach(folder => {
      const foldEl = document.createElement('div');
      foldEl.innerHTML = `<h4>${escapeHtml(folder.name)}</h4><div class="jobs-list"></div>`;
      const jobsList = foldEl.querySelector('.jobs-list');
      jobsList.dataset.folderId = folder.id;
      folder.jobs.forEach(job => {
        const jobEl = document.createElement('div');
        jobEl.className = 'job';
        const summary = job.summary || computeSnapshotSummary(job.items, job.expenses);
        jobEl.innerHTML = `<div>
            <div><strong>${escapeHtml(job.name)}</strong></div>
            <div class="meta">${new Date(job.createdAt).toLocaleString()} • Neto: ${fmtARS(summary.netBalance)}</div>
          </div>
          <div>
            <button class="insert-job">Insertar</button>
            <button class="delete-job">Eliminar</button>
          </div>`;
        jobEl.querySelector('.insert-job').addEventListener('click', () => {
          const itemsCopy = JSON.parse(JSON.stringify(job.items || []));
          const expensesCopy = JSON.parse(JSON.stringify(job.expenses || []));
          itemsCopy.forEach(it => it.id = uid('item'));
          expensesCopy.forEach(ex => ex.id = uid('exp'));
          state.items = state.items.concat(itemsCopy);
          state.expenses = state.expenses.concat(expensesCopy);
          saveState();
          renderAll();
          alert('Trabajo insertado en el espacio de trabajo.');
        });
        jobEl.querySelector('.delete-job').addEventListener('click', () => {
          if (!confirm('Eliminar trabajo de la carpeta?')) return;
          folder.jobs = folder.jobs.filter(j => j.id !== job.id);
          saveState();
          renderModalFolders();
          renderFolders();
        });
        jobsList.appendChild(jobEl);
      });
      foldEl.dataset.folderId = folder.id;
      modalFolders.appendChild(foldEl);

      if (opts && opts.singleItem) {
        const singleItem = opts.singleItem;
        const saveBtn = document.createElement('button');
        saveBtn.textContent = `Guardar "${singleItem.description}" en esta carpeta`;
        saveBtn.addEventListener('click', () => {
          const job = {
            id: uid('job'),
            name: singleItem.description + ' (item)',
            createdAt: new Date().toISOString(),
            items: [JSON.parse(JSON.stringify(singleItem))],
            expenses: [],
            summary: computeSnapshotSummary([singleItem], [])
          };
          const f = state.folders.find(x => x.id === folder.id);
          f.jobs.push(job);
          saveState();
          renderModalFolders();
          renderFolders();
          alert('Ítem guardado como trabajo en carpeta.');
        });
        foldEl.appendChild(saveBtn);
      }
    });
  }

  // Computations
  function lineTotal(item) {
    const qty = Number(item.quantity) || 0;
    const ppu = Number(item.pricePerUnit) || 0;
    return qty * ppu;
  }
  function expenseTotal(exp) {
    if (exp.category === 'Salarios') {
      const pricePerDay = Number(exp.price) || 0;
      const days = Number(exp.days) || 0;
      return pricePerDay * days;
    } else {
      return Number(exp.price) || 0;
    }
  }
  function computeSummarySnapshot() {
    return computeSnapshotSummary(state.items, state.expenses);
  }
  function computeSnapshotSummary(items, expenses) {
    const subtotal = items.reduce((s,i) => s + lineTotal(i), 0);
    const totalExpenses = expenses.reduce((s,e) => s + expenseTotal(e), 0);
    const net = subtotal - totalExpenses;
    return {
      subtotal,
      totalExpenses,
      netBalance: net,
      netBalanceFormatted: fmtARS(net)
    };
  }

  function renderTotals() {
    const subtotal = state.items.reduce((s,i) => s + lineTotal(i), 0);
    const totalExp = state.expenses.reduce((s,e) => s + expenseTotal(e), 0);
    const net = subtotal - totalExp;
    subtotalIncomeEl.textContent = fmtARS(subtotal);
    totalExpensesEl.textContent = fmtARS(totalExp);
    netBalanceEl.textContent = fmtARS(net);
    if (state.settings.showUSD && state.settings.exchangeRate > 0) {
      const rate = state.settings.exchangeRate;
      const usdSubtotal = subtotal / rate;
      const usdExp = totalExp / rate;
      const usdNet = net / rate;
      currencyInfo.innerHTML = `
        <div class="small">USD: ${fmtUSD(usdNet)} (Ingreso ${fmtUSD(usdSubtotal)} - Gasto ${fmtUSD(usdExp)})</div>
      `;
    } else {
      currencyInfo.innerHTML = '';
    }
    Object.keys(state.history).forEach(k => {
      const snap = state.history[k];
      if (snap) {
        snap.summary = computeSnapshotSummary(snap.items, snap.expenses);
      }
    });
    saveState();
    $$('.item').forEach(el => {
      const id = el.dataset.id;
      const it = state.items.find(i => i.id === id);
      if (!it) return;
      const subEl = el.querySelector('.subtotal');
      if (subEl) subEl.textContent = fmtARS(lineTotal(it));
    });
    $$('.expense').forEach(el => {
      const id = el.dataset.id;
      const ex = state.expenses.find(x => x.id === id);
      if (!ex) return;
      const subEl = el.querySelector('.subtotal');
      if (subEl) subEl.textContent = fmtARS(expenseTotal(ex));
    });
  }

  // Utility add functions
  function addItem(item) {
    state.items.push(item);
    saveState();
    renderAll();
  }
  function addExpense(exp) {
    if (exp.category === 'Salarios' && exp.days === undefined) exp.days = 30;
    state.expenses.push(exp);
    saveState();
    renderAll();
  }

  // Utility HTML escape
  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  }

  // Initialize with at least one item and one expense if empty
  if (state.items.length === 0 && state.expenses.length === 0 && state.folders.length === 0) {
    state.items.push({ id: uid('item'), description:'Ejemplo: 1m de tubo', pricePerUnit:20, quantity:10, measure:'metro' });
    state.expenses.push({ id: uid('exp'), description:'Salarios equipo', category:'Salarios', price:1000, days:30 });
    saveState();
  }

  // Render initially
  renderAll();
})();