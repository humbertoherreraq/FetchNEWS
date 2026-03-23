const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SEARCHES_FILE = path.join(DATA_DIR, 'searches.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SOURCES = [
  {
    name: 'Ars Technica',
    feeds: ['https://arstechnica.com/index.ars/feed/', 'https://arstechnica.com/rss-feeds/'],
    notes: 'Consulta el feed principal oficial y devuelve solo resultados de Ars Technica.'
  },
  {
    name: 'AWS News Blog',
    feeds: ['https://aws.amazon.com/blogs/aws/feed/'],
    notes: 'Usa exclusivamente ese feed oficial.'
  },
  {
    name: 'Bloomberg',
    feeds: [
      'https://feeds.bloomberg.com/technology/news.rss',
      'https://feeds.bloomberg.com/news.rss',
      'https://feeds.bloomberg.com/economics/news.rss'
    ],
    notes: 'Para IA, tecnología o cloud, empieza por technology/news.rss. Para negocio general o macro, usa news.rss y economics/news.rss.'
  },
  {
    name: 'Financial Times',
    feeds: ['https://www.ft.com/technology?format=rss', 'https://www.ft.com/news-feed?format=rss'],
    notes: 'Prioriza technology para IA, tecnología o cloud; usa news-feed para negocio general.'
  },
  {
    name: 'Google Cloud Blog',
    feeds: ['https://cloud.google.com/blog/rss'],
    notes: 'Usa exclusivamente el feed oficial del blog.'
  },
  {
    name: 'McKinsey Insights & Publications',
    feeds: ['https://www.mckinsey.com/insights/rss'],
    notes: 'Usa exclusivamente el feed oficial.'
  },
  {
    name: 'The Official Microsoft Blog',
    feeds: ['https://blogs.microsoft.com/feed/'],
    notes: 'Usa exclusivamente el feed oficial.'
  },
  {
    name: 'Portal de la PCM',
    feeds: [],
    notes: 'Verifica si existe RSS/Atom oficial en el dominio. Si no existe, responde exactamente: Sin RSS/Atom oficial confirmado para PCM en esta revisión.'
  },
  {
    name: 'Diario Oficial El Peruano',
    feeds: [],
    notes: 'Verifica si existe RSS/Atom oficial en el dominio. Si no existe, responde exactamente: Sin RSS/Atom oficial confirmado para El Peruano en esta revisión.'
  },
  {
    name: 'Semafor',
    feeds: ['https://www.semafor.com/rss.xml'],
    notes: 'Usa exclusivamente el feed oficial.'
  },
  {
    name: 'Stanford AI Index / Stanford HAI',
    feeds: [],
    notes: 'Verifica si existe RSS/Atom oficial en el dominio. Si no existe, responde exactamente: Sin RSS/Atom oficial confirmado para Stanford AI Index en esta revisión.'
  },
  {
    name: 'TechCrunch',
    feeds: ['https://techcrunch.com/feed/', 'https://techcrunch.com/feed/?category_name=artificial-intelligence'],
    notes: 'Para temas de IA, empieza por el feed de artificial-intelligence y complementa con el feed general.'
  },
  {
    name: 'The Verge',
    feeds: [
      'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
      'https://www.theverge.com/rss/how-to/index.xml',
      'https://www.theverge.com/rss/tech/index.xml',
      'https://www.theverge.com/rss/front-page/index.xml'
    ],
    notes: 'Prioriza AI, How-to o Tech según el tema y usa Front Page como complemento.'
  },
  {
    name: 'VentureBeat',
    feeds: ['https://venturebeat.com/feed/'],
    notes: 'Usa exclusivamente el feed oficial.'
  },
  {
    name: 'WIRED',
    feeds: ['https://www.wired.com/about/rss-feeds/', 'https://www.wired.com/feed/rss'],
    notes: 'Primero usa la página oficial de feeds para elegir la categoría más alineada; si no aplica, usa el feed general.'
  }
];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEARCHES_FILE)) fs.writeFileSync(SEARCHES_FILE, '[]', 'utf8');
}

function readSearches() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(SEARCHES_FILE, 'utf8'));
}

function writeSearches(searches) {
  ensureDataFile();
  fs.writeFileSync(SEARCHES_FILE, JSON.stringify(searches, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error('Payload demasiado grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildVariants(topic) {
  const cleaned = topic.trim();
  const base = cleaned
    .split(/[;,/\n]/)
    .map(item => item.trim())
    .filter(Boolean);

  const lowered = cleaned.toLowerCase();
  const variants = new Set(base);
  const mappings = [
    ['inteligencia artificial', ['IA', 'artificial intelligence', 'generative AI', 'genAI', 'machine learning']],
    ['nube', ['cloud', 'cloud computing', 'infraestructura cloud', 'multicloud']],
    ['regulación', ['policy', 'compliance', 'governance', 'normativa', 'regulation']],
    ['negocio', ['business', 'market', 'strategy', 'go-to-market']],
    ['tecnología', ['technology', 'tech', 'plataforma', 'software']],
  ];

  mappings.forEach(([needle, synonyms]) => {
    if (lowered.includes(needle)) {
      synonyms.forEach(item => variants.add(item));
    }
  });

  cleaned.split(/\s+/).filter(Boolean).forEach(token => variants.add(token));
  return Array.from(variants);
}

function buildPrompt(input) {
  const topicVariants = buildVariants(input.topic);
  const exclusionsText = input.exclusions?.trim() ? input.exclusions.trim() : 'ninguna';
  const language = input.language || 'ambos';
  const maxPerSource = input.maxPerSource || 'no definido';

  const sourceBlocks = SOURCES.map(source => {
    const feedLines = source.feeds.length
      ? source.feeds.map(feed => `- ${feed}`).join('\n')
      : '- Sin feed preconfirmado; requiere verificación manual del dominio oficial.';

    return `### ${source.name}\nFeeds oficiales permitidos:\n${feedLines}\n${source.notes}`;
  }).join('\n\n');

  return `# FetchNews\n\n## Perfil operativo\nActúa como un analista editorial senior de inteligencia competitiva especializado en IA, tecnología, negocios, cloud y regulación. Usa solo RSS/Atom oficiales o páginas oficiales de feeds de las fuentes autorizadas.\n\n## Parámetros\nTEMA: ${input.topic}\nRANGO_FECHA: ${input.dateRange}\nIDIOMA_PREFERIDO: ${language}\nMAX_POR_FUENTE: ${maxPerSource}\nEXCLUSIONES: ${exclusionsText}\n\n## Variantes semánticas sugeridas\n${topicVariants.map(item => `- ${item}`).join('\n')}\n\n## Reglas obligatorias\n1. Usa solo feeds RSS/Atom oficiales del dominio autorizado.\n2. No uses agregadores, mirrors ni resúmenes de terceros.\n3. Descubre publicaciones primero desde el feed oficial y solo abre la URL oficial del artículo para completar autor, tags o validar fecha, dentro del mismo dominio.\n4. Respeta estrictamente el tema y el rango de fechas.\n5. Si no existe un feed oficial confirmado para una fuente, dilo explícitamente y no inventes resultados RSS.\n6. Si un campo no está disponible, escribe \"no disponible\".\n7. Entrega la salida en español, conservando el titular original.\n8. No copies el texto completo del artículo; usa el resumen del feed o una síntesis breve basada únicamente en metadatos oficiales.\n9. Elimina duplicados por URL canónica o por titulares casi idénticos del mismo artículo.\n10. Si no hay coincidencias para una fuente, devuelve \"sin coincidencias\".\n\n## Procedimiento\n1. Normaliza el tema y trabaja con variantes semánticas en español e inglés.\n2. Recorre únicamente los feeds oficiales permitidos por fuente.\n3. Conserva solo publicaciones dentro del rango [${input.dateRange}].\n4. Filtra por coincidencia temática usando título, resumen del feed, tags y metadatos oficiales del artículo si hace falta.\n5. Extrae: fuente, categoría, titular, fecha, url, resumen, autor, tags, tipo, feed_origen y motivo_de_coincidencia.\n6. Asigna categoría por contenido: tecnología, negocio, IA, cloud o regulación.\n7. Asigna tipo: noticia, análisis, how-to, controversia, regulación o research.\n8. Ordena la tabla por fecha descendente.\n9. Debajo de la tabla añade total de coincidencias, patrones observados y advertencias.\n\n## Salida estándar\nTabla con columnas:\nfuente | categoria | titular | fecha | url | resumen | autor | tags | tipo | feed_origen | motivo_de_coincidencia\n\n## Relevancia y análisis\nDespués de consolidar resultados, enriquece la tabla con:\nrelevancia | justificacion_relevancia | hallazgo_clave\n\nIncluye además:\n- resumen ejecutivo de máximo 10 puntos\n- Top 10 publicaciones por relevancia\n- Top 5 controversias\n- Top 5 señales de mercado\n- Top 5 piezas tipo how-to o research más útiles\n\n## Fuentes autorizadas\n${sourceBlocks}`;
}

function validateSearchInput(input) {
  if (!input.topic || !String(input.topic).trim()) return 'El tema es obligatorio.';
  if (!input.dateRange || !String(input.dateRange).trim()) return 'El rango de fechas es obligatorio.';
  if (input.maxPerSource && Number(input.maxPerSource) <= 0) return 'MAX_POR_FUENTE debe ser mayor a cero.';
  return null;
}

function buildSearchRecord(input) {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    topic: String(input.topic).trim(),
    dateRange: String(input.dateRange).trim(),
    language: input.language || 'ambos',
    maxPerSource: input.maxPerSource ? Number(input.maxPerSource) : null,
    exclusions: input.exclusions ? String(input.exclusions).trim() : '',
    prompt: buildPrompt(input)
  };
}

function serveStaticFile(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Acceso denegado.' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Recurso no encontrado.' });
        return;
      }
      sendJson(res, 500, { error: 'Error al leer recurso estático.' });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/sources') {
      sendJson(res, 200, { sources: SOURCES });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/searches') {
      const searches = readSearches().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      sendJson(res, 200, { searches });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/searches') {
      const input = await parseBody(req);
      const error = validateSearchInput(input);
      if (error) {
        sendJson(res, 400, { error });
        return;
      }

      const searches = readSearches();
      const record = buildSearchRecord(input);
      searches.push(record);
      writeSearches(searches);
      sendJson(res, 201, { search: record });
      return;
    }

    const rerunMatch = req.method === 'POST' && req.url.match(/^\/api\/searches\/([^/]+)\/rerun$/);
    if (rerunMatch) {
      const searchId = rerunMatch[1];
      const searches = readSearches();
      const existing = searches.find(search => search.id === searchId);
      if (!existing) {
        sendJson(res, 404, { error: 'Búsqueda no encontrada.' });
        return;
      }

      const rerunRecord = buildSearchRecord(existing);
      searches.push(rerunRecord);
      writeSearches(searches);
      sendJson(res, 201, { search: rerunRecord, rerunOf: searchId });
      return;
    }

    serveStaticFile(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor.';
    sendJson(res, 500, { error: escapeHtml(message) });
  }
});

server.listen(PORT, () => {
  console.log(`FetchNews disponible en http://localhost:${PORT}`);
});
