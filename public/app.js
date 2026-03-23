const form = document.getElementById('searchForm');
const feedback = document.getElementById('feedback');
const promptOutput = document.getElementById('promptOutput');
const copyPromptButton = document.getElementById('copyPromptButton');
const resetFormButton = document.getElementById('resetFormButton');
const reloadHistoryButton = document.getElementById('reloadHistoryButton');
const historyList = document.getElementById('historyList');
const sourcesList = document.getElementById('sourcesList');
const historyTemplate = document.getElementById('historyItemTemplate');

let currentPrompt = '';
let currentSearch = null;

function setFeedback(message, type = '') {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`.trim();
}

function updatePrompt(prompt) {
  currentPrompt = prompt || '';
  currentSearch = currentSearch || null;
  promptOutput.textContent = currentPrompt || 'Completa el formulario para generar el protocolo.';
  promptOutput.classList.toggle('empty', !currentPrompt);
  copyPromptButton.disabled = !currentPrompt;
}

function populateForm(search) {
  form.topic.value = search.topic || '';
  form.dateRange.value = search.dateRange || '';
  form.language.value = search.language || 'ambos';
  form.maxPerSource.value = search.maxPerSource || '';
  form.exclusions.value = search.exclusions || '';
  currentSearch = search;
  updatePrompt(search.prompt || '');
  setFeedback(`Se cargó la búsqueda guardada del ${new Date(search.createdAt).toLocaleString('es-PE')}.`, 'success');
}

function serializeForm() {
  return {
    topic: form.topic.value.trim(),
    dateRange: form.dateRange.value.trim(),
    language: form.language.value,
    maxPerSource: form.maxPerSource.value.trim(),
    exclusions: form.exclusions.value.trim(),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Ocurrió un error inesperado.');
  }
  return payload;
}

async function loadSources() {
  const { sources } = await fetchJson('/api/sources');
  sourcesList.innerHTML = '';

  sources.forEach(source => {
    const card = document.createElement('article');
    card.className = 'source-card';
    const feeds = source.feeds.length
      ? `<ul>${source.feeds.map(feed => `<li><a href="${feed}" target="_blank" rel="noreferrer">${feed}</a></li>`).join('')}</ul>`
      : '<p class="hint">Sin feed preconfirmado; requiere verificación oficial.</p>';

    card.innerHTML = `
      <h3>${source.name}</h3>
      <p>${source.notes}</p>
      ${feeds}
    `;
    sourcesList.appendChild(card);
  });
}

function renderHistory(searches) {
  historyList.innerHTML = '';
  if (!searches.length) {
    historyList.innerHTML = '<p class="hint">Aún no hay búsquedas guardadas en el archivo local.</p>';
    return;
  }

  searches.forEach(search => {
    const fragment = historyTemplate.content.cloneNode(true);
    fragment.querySelector('.history-title').textContent = search.topic;
    fragment.querySelector('.history-meta').textContent = `Fecha: ${new Date(search.createdAt).toLocaleString('es-PE')} · Rango: ${search.dateRange}`;
    fragment.querySelector('.history-extra').textContent = `Idioma: ${search.language || 'ambos'} · Max por fuente: ${search.maxPerSource || 'no definido'} · Exclusiones: ${search.exclusions || 'ninguna'}`;

    fragment.querySelector('.load-button').addEventListener('click', () => populateForm(search));
    fragment.querySelector('.rerun-button').addEventListener('click', async () => {
      try {
        setFeedback('Ejecutando nuevamente la búsqueda guardada…');
        const { search: rerunSearch } = await fetchJson(`/api/searches/${search.id}/rerun`, { method: 'POST' });
        populateForm(rerunSearch);
        await loadHistory();
        setFeedback('La búsqueda anterior se ejecutó nuevamente y quedó registrada en el archivo de historial.', 'success');
      } catch (error) {
        setFeedback(error.message, 'error');
      }
    });

    historyList.appendChild(fragment);
  });
}

async function loadHistory() {
  const { searches } = await fetchJson('/api/searches');
  renderHistory(searches);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    setFeedback('Generando protocolo y guardando búsqueda…');
    const { search } = await fetchJson('/api/searches', {
      method: 'POST',
      body: JSON.stringify(serializeForm()),
    });
    currentSearch = search;
    updatePrompt(search.prompt);
    await loadHistory();
    setFeedback('Protocolo generado y búsqueda guardada en el archivo local.', 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

copyPromptButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentPrompt);
    setFeedback('Prompt copiado al portapapeles.', 'success');
  } catch (error) {
    setFeedback('No se pudo copiar el prompt automáticamente.', 'error');
  }
});

resetFormButton.addEventListener('click', () => {
  form.reset();
  currentSearch = null;
  updatePrompt('');
  setFeedback('Formulario reiniciado para una nueva búsqueda.');
});

reloadHistoryButton.addEventListener('click', async () => {
  try {
    setFeedback('Actualizando historial…');
    await loadHistory();
    setFeedback('Historial actualizado.', 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

(async function init() {
  try {
    await Promise.all([loadSources(), loadHistory()]);
    setFeedback('FetchNews listo para usar.');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
})();
