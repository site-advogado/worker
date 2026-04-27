// ============================================================
// tema.js — Módulo central de temas (v2 — arquivo único por página)
//
// MUDANÇA ARQUITETURAL:
//   Antes: redirecionava para index-masculino.html etc. (arquivos
//          que não existem no GitHub Pages → erro 404)
//   Agora: tema é aplicado via CSS variables + classes no <html>
//          em um ÚNICO arquivo por página. Sem redirecionamento.
//
// Fluxo correto:
//   1. Carrega tema do localStorage (evita flash)
//   2. Busca bio no servidor → recebe campo `tema`
//   3. Aplica CSS variables do tema no documento
//   4. Salva no localStorage como cache
//
// Uso em todas as páginas:
//   <script src="tema.js"></script>
//   const bioData = await carregarTemaEBio();
// ============================================================

const URL_API    = 'https://api-advogada.siterefrigeracaoeliezer.workers.dev/api/v1';
const URL_SESSAO = 'https://api-advogada.siterefrigeracaoeliezer.workers.dev/api/verificar-sessao';
const URL_REFRESH = 'https://api-advogada.siterefrigeracaoeliezer.workers.dev/api/refresh-token';

// ── Paletas de tema ───────────────────────────────────────────
const TEMAS = {
  'feminino-q': {
    '--gold':        '#C5A059',
    '--gold-light':  '#D4B578',
    '--gold-dim':    'rgba(197,160,89,0.10)',
    '--gold-border': 'rgba(197,160,89,0.28)',
    '--cream':       '#FAF8F3',
    '--ink':         '#1C1917',
    '--ink-soft':    '#44403C',
    '--ink-muted':   '#A8A29E',
    '--font-serif':  "'Playfair Display', serif",
    '--font-body':   "'Jost', sans-serif",
    '--radius':      '4px',
    // vars do glossário
    '--g-card-bg':     '#FAF8F3',
    '--g-border':      'rgba(197,160,89,0.25)',
    '--g-radius':      '4px',
    '--g-radius-sm':   '2px',
    '--g-accent':      '#C5A059',
    '--g-text':        '#1C1917',
    '--g-text-soft':   '#44403C',
    '--g-font-serif':  "'Playfair Display', serif",
  },
  'obsidian': {
    '--gold':        '#C9A84C',
    '--gold-light':  '#E0C070',
    '--gold-dim':    'rgba(201,168,76,0.10)',
    '--gold-border': 'rgba(201,168,76,0.30)',
    '--cream':       '#0E0D0B',
    '--ink':         '#EDE5D0',
    '--ink-soft':    '#B8AC96',
    '--ink-muted':   '#706A5C',
    '--font-serif':  "'Cormorant Garamond', serif",
    '--font-body':   "'Jost', sans-serif",
    '--radius':      '2px',
    '--g-card-bg':   '#131210',
    '--g-border':    'rgba(201,168,76,0.25)',
    '--g-radius':    '2px',
    '--g-radius-sm': '1px',
    '--g-accent':    '#C9A84C',
    '--g-text':      '#EDE5D0',
    '--g-text-soft': '#B8AC96',
    '--g-font-serif':"'Cormorant Garamond', serif",
  },
  'masculino': {
    '--gold':        '#5B8DB8',
    '--gold-light':  '#7AAAD0',
    '--gold-dim':    'rgba(91,141,184,0.10)',
    '--gold-border': 'rgba(91,141,184,0.28)',
    '--cream':       '#F4F6F9',
    '--ink':         '#1A2433',
    '--ink-soft':    '#3A4A5C',
    '--ink-muted':   '#8A9AAC',
    '--font-serif':  "'Playfair Display', serif",
    '--font-body':   "'Jost', sans-serif",
    '--radius':      '6px',
    '--g-card-bg':   '#F4F6F9',
    '--g-border':    'rgba(91,141,184,0.25)',
    '--g-radius':    '6px',
    '--g-radius-sm': '3px',
    '--g-accent':    '#5B8DB8',
    '--g-text':      '#1A2433',
    '--g-text-soft': '#3A4A5C',
    '--g-font-serif':"'Playfair Display', serif",
  },
  'feminino-r': {
    '--gold':        '#B07090',
    '--gold-light':  '#C890A8',
    '--gold-dim':    'rgba(176,112,144,0.10)',
    '--gold-border': 'rgba(176,112,144,0.28)',
    '--cream':       '#FDF8F9',
    '--ink':         '#2C1A22',
    '--ink-soft':    '#5C3A4A',
    '--ink-muted':   '#A88898',
    '--font-serif':  "'Cormorant Garamond', serif",
    '--font-body':   "'Jost', sans-serif",
    '--radius':      '20px',
    '--g-card-bg':   '#FDF8F9',
    '--g-border':    'rgba(176,112,144,0.25)',
    '--g-radius':    '20px',
    '--g-radius-sm': '10px',
    '--g-accent':    '#B07090',
    '--g-text':      '#2C1A22',
    '--g-text-soft': '#5C3A4A',
    '--g-font-serif':"'Cormorant Garamond', serif",
  },
};

// Obsidian é sempre dark, os demais respeitam preferência do usuário
const TEMA_FORCADO_DARK = ['obsidian'];

/**
 * Aplica as CSS variables do tema no :root.
 * Não redireciona — tudo em um único arquivo.
 */
function aplicarTema(nomeTema) {
  const paleta = TEMAS[nomeTema] || TEMAS['feminino-q'];
  const root   = document.documentElement;

  for (const [prop, val] of Object.entries(paleta)) {
    root.style.setProperty(prop, val);
  }

  // Obsidian força dark mode
  if (TEMA_FORCADO_DARK.includes(nomeTema)) {
    root.classList.add('dark');
    root.classList.remove('light');
    localStorage.setItem('ADV_GLOBAL_THEME', 'dark');
  }

  // Salva o tema atual
  localStorage.setItem('ADV_TEMA', nomeTema);

  // Atualiza atributo data-tema para CSS específico por tema
  root.setAttribute('data-tema', nomeTema);
}

/**
 * Inicialização rápida — aplica o tema do cache antes da
 * resposta do servidor para evitar flash (FOUC).
 */
(function aplicarTemaCache() {
  const temaCache = localStorage.getItem('ADV_TEMA') || 'feminino-q';
  aplicarTema(temaCache);
  const isDark = localStorage.getItem('ADV_GLOBAL_THEME') === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
})();

/**
 * Carrega o bio do servidor e aplica o tema correto.
 * Retorna os dados do bio para uso imediato pela página.
 * NÃO redireciona para outro arquivo.
 */
async function carregarTemaEBio() {
  try {
    const res  = await fetch(URL_API, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ action: 'bio' }),
    });
    if (!res.ok) throw new Error('bio_falhou');
    const data = await res.json();

    // Aplica o tema vindo do servidor
    const temaServidor = data.tema || 'feminino-q';
    aplicarTema(temaServidor);

    // Mantém preferência dark/light do usuário (exceto obsidian)
    if (!TEMA_FORCADO_DARK.includes(temaServidor)) {
      const isDark = localStorage.getItem('ADV_GLOBAL_THEME') === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
    }

    return data;
  } catch {
    // Falha silenciosa — usa o tema do cache e retorna null
    return null;
  }
}

/**
 * Verifica sessão + aplica tema em páginas protegidas.
 * roleNecessario: 'cliente' | 'admin'
 * Retorna o payload da sessão (com expiresAt) ou redireciona.
 */
async function verificarSessaoComTema(roleNecessario = 'cliente') {
  try {
    const res = await fetch(URL_SESSAO, {
      method:      'GET',
      credentials: 'include',
    });

    if (!res.ok) { sessaoExpirada(); return null; }

    const sessao = await res.json();

    if (!sessao.autenticado) { sessaoExpirada(); return null; }
    if (roleNecessario === 'admin' && sessao.role !== 'admin') {
      window.location.href = 'index.html'; return null;
    }

    // Agendar silent refresh se expiresAt foi retornado
    if (sessao.expiresAt) {
      agendarRefresh(sessao.expiresAt);
    }

    // Carregar tema em segundo plano (sem bloquear renderização)
    fetch(URL_API, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ action: 'bio' }),
    })
    .then(r => r.json())
    .then(data => {
      const temaServidor = data.tema || 'feminino-q';
      aplicarTema(temaServidor);
      if (!TEMA_FORCADO_DARK.includes(temaServidor)) {
        const isDark = localStorage.getItem('ADV_GLOBAL_THEME') === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('light', !isDark);
      }
    })
    .catch(() => {});

    return sessao;
  } catch {
    sessaoExpirada();
    return null;
  }
}

/**
 * Silent refresh — renova o token automaticamente antes de expirar.
 * Chamado quando verificarSessao retorna expiresAt.
 */
let _refreshTimer = null;
function agendarRefresh(expiresAt) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const agora        = Math.floor(Date.now() / 1000);
  const tempoRestante = expiresAt - agora; // em segundos
  const refreshEm    = Math.max((tempoRestante - 600) * 1000, 5000); // 10 min antes

  _refreshTimer = setTimeout(async () => {
    try {
      const res = await fetch(URL_REFRESH, {
        method:      'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.expiresAt) agendarRefresh(data.expiresAt);
      }
    } catch { /* silencioso */ }
  }, refreshEm);
}

/**
 * Mostra modal elegante de sessão expirada em vez de redirect silencioso.
 */
function sessaoExpirada() {
  // Tenta mostrar modal se existir na página
  const modal = document.getElementById('modalSessaoExpirada');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    return;
  }
  // Fallback: redireciona com parâmetro para exibir aviso no index
  window.location.href = 'index.html?sessao=expirada';
}

/**
 * HTML do modal de sessão expirada.
 * Adicione ao <body> das páginas protegidas.
 */
function getSessaoExpiradaModalHTML() {
  return `
<div id="modalSessaoExpirada"
  class="hidden"
  style="position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);">
  <div style="background:var(--g-card-bg,#fff);border:1px solid var(--g-border);border-radius:var(--g-radius,8px);max-width:340px;width:100%;padding:32px 28px;text-align:center;">
    <div style="width:48px;height:48px;border-radius:50%;background:rgba(197,160,89,0.1);border:1px solid var(--gold-border);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;">
      <i class="fas fa-clock" style="color:var(--gold);font-size:16px;"></i>
    </div>
    <h3 style="font-family:var(--font-serif);font-size:18px;font-weight:600;color:var(--ink);margin-bottom:10px;">Sessão Encerrada</h3>
    <p style="font-size:13px;color:var(--ink-soft);line-height:1.7;margin-bottom:24px;">Por segurança, sua sessão expirou. Faça login novamente para continuar.</p>
    <button onclick="window.location.href='index.html'"
      style="width:100%;padding:12px;background:linear-gradient(135deg,var(--gold),#9A7535);border:none;border-radius:var(--g-radius-sm,4px);color:#fff;font-size:11px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;cursor:pointer;">
      Fazer Login
    </button>
  </div>
</div>`;
}

// ── Glossário jurídico ────────────────────────────────────────

const GLOSSARIO = {
  'Petição Inicial Protocolada': {
    titulo: 'Petição Inicial',
    texto:  'É o documento que dá início ao processo judicial. Nele, seu advogado apresenta os fatos, os fundamentos jurídicos e os pedidos ao juiz.',
  },
  'Aguardando Citação': {
    titulo: 'Citação',
    texto:  'É o ato oficial pelo qual a parte contrária é comunicada da existência do processo e convocada a se defender.',
  },
  'Audiência de Conciliação Designada': {
    titulo: 'Audiência de Conciliação',
    texto:  'Reunião formal onde um mediador tenta aproximar as partes para chegarem a um acordo sem precisar de julgamento.',
  },
  'Audiência de Instrução e Julgamento': {
    titulo: 'Audiência de Instrução',
    texto:  'Sessão onde testemunhas são ouvidas, provas são apresentadas e o juiz colhe os elementos necessários para proferir a sentença.',
  },
  'Sentença Proferida': {
    titulo: 'Sentença',
    texto:  'É a decisão final do juiz de primeira instância. Ela pode ser favorável ou desfavorável, e pode ser objeto de recurso.',
  },
  'Fase de Execução / Cálculos': {
    titulo: 'Fase de Execução',
    texto:  'Após a sentença definitiva, esta fase trata de efetivar a decisão — ou seja, fazer com que a parte vencedora receba o que lhe é de direito.',
  },
  'Processo Finalizado / Arquivado': {
    titulo: 'Processo Finalizado',
    texto:  'O processo chegou ao fim. Todas as obrigações foram cumpridas e o processo foi arquivado pelo juízo.',
  },
};

function getBotaoGlossario(status) {
  if (!GLOSSARIO[status]) return '';
  return `<button
    type="button"
    onclick="abrirGlossario('${encodeURIComponent(status)}')"
    class="glossario-btn"
    title="O que significa isso?"
    aria-label="Explicar termo jurídico"
  ><i class="fas fa-circle-question"></i></button>`;
}

function abrirGlossario(statusEncoded) {
  const status = decodeURIComponent(statusEncoded);
  const entry  = GLOSSARIO[status];
  if (!entry) return;
  const modal = document.getElementById('glossarioModal');
  if (!modal) return;
  document.getElementById('glossarioTitulo').textContent = entry.titulo;
  document.getElementById('glossarioTexto').textContent  = entry.texto;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function fecharGlossario() {
  const modal = document.getElementById('glossarioModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function getGlossarioModalHTML() {
  return `
<div id="glossarioModal"
  class="hidden fixed inset-0 z-[500] items-center justify-center p-4"
  style="background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);"
  onclick="if(event.target===this)fecharGlossario()">
  <div style="background:var(--g-card-bg,#fff);border:1px solid var(--g-border,rgba(197,160,89,0.25));border-radius:var(--g-radius,16px);max-width:360px;width:100%;padding:32px 28px;position:relative;">
    <div style="position:absolute;top:0;left:16px;right:16px;height:1px;background:linear-gradient(90deg,transparent,var(--g-accent,#C5A059),transparent);"></div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(197,160,89,0.1);border:1px solid rgba(197,160,89,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <i class="fas fa-scale-balanced" style="color:var(--g-accent,#C5A059);font-size:14px;"></i>
      </div>
      <div>
        <p style="font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--g-accent,#C5A059);opacity:0.8;">Glossário Jurídico</p>
        <h3 id="glossarioTitulo" style="font-size:17px;font-weight:600;color:var(--g-text,#1C1917);line-height:1.2;font-family:var(--g-font-serif,'Georgia',serif);"></h3>
      </div>
    </div>
    <p id="glossarioTexto" style="font-size:13px;line-height:1.7;color:var(--g-text-soft,#44403C);opacity:0.85;"></p>
    <button onclick="fecharGlossario()" style="margin-top:22px;width:100%;padding:11px;background:linear-gradient(135deg,var(--g-accent,#C5A059),#9A7535);border:none;border-radius:var(--g-radius-sm,8px);color:#fff;font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;cursor:pointer;">
      Entendido
    </button>
  </div>
</div>`;
}

// ── Fases ─────────────────────────────────────────────────────

const FASE_LABELS = {
  0:   'Não iniciado',
  10:  'Petição Inicial',
  30:  'Fase de Conhecimento',
  60:  'Sentença / Recursos',
  90:  'Execução / Cálculos',
  100: 'Finalizado',
};

function getFaseLabel(pct) {
  return FASE_LABELS[pct] || 'Em andamento';
}

// ── Logout ────────────────────────────────────────────────────

async function logout() {
  try {
    await fetch(URL_API, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ action: 'logout' }),
    });
  } catch {}
  window.location.href = 'index.html';
}

// ── Formatar data ──────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

// ── Dark mode toggle ──────────────────────────────────────────
// Exportado para uso nas páginas (app.js NÃO precisa redefinir)
function toggleDarkMode() {
  const temaAtual = localStorage.getItem('ADV_TEMA') || 'feminino-q';
  // Obsidian sempre dark — toggle não aplicável
  if (TEMA_FORCADO_DARK.includes(temaAtual)) return;

  const isDark = document.documentElement.classList.toggle('dark');
  document.documentElement.classList.toggle('light', !isDark);
  localStorage.setItem('ADV_GLOBAL_THEME', isDark ? 'dark' : 'light');

  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  }
}
