// ============================================================
// tema.js — Módulo central de temas
// Inclua este arquivo em TODAS as páginas:
//   <script src="tema.js"></script>
//
// Uso:
//   const bioData = await carregarTemaEBio();
//   // A função detecta o tema salvo no servidor e redireciona
//   // automaticamente para a versão correta da página atual.
//
// Mapa de temas:
//   obsidian    → *-obsidian.html   (dourado escuro, padrão atual)
//   masculino   → *-masculino.html  (navy/steel azul)
//   feminino-r  → *-feminino-r.html (dourado arredondado)
//   feminino-q  → *-feminino-q.html (playfair quadrado) ← padrão
// ============================================================

const URL_API    = 'https://api-advogada.siterefrigeracaoeliezer.workers.dev/api/v1';
const URL_SESSAO = 'https://api-advogada.siterefrigeracaoeliezer.workers.dev/api/verificar-sessao';

// Mapa: sufixo da página → tema
const TEMA_SUFIXOS = {
  'obsidian':   '-obsidian',
  'masculino':  '-masculino',
  'feminino-r': '-feminino-r',
  'feminino-q': '',        // padrão = sem sufixo
};

// Páginas que participam do sistema de temas
const PAGINAS = ['index','linha-tempo','configuracao','manutencao'];

/**
 * Detecta em qual "tema" a página atual está.
 * Ex: "linha-tempo-masculino.html" → { page:'linha-tempo', tema:'masculino' }
 */
function detectarPaginaAtual() {
  const file = window.location.pathname.split('/').pop().replace('.html','') || 'index';
  for (const p of PAGINAS) {
    if (file === p) return { page: p, tema: 'feminino-q' };
    for (const [tema, sufixo] of Object.entries(TEMA_SUFIXOS)) {
      if (file === `${p}${sufixo}` && sufixo !== '') return { page: p, tema };
    }
  }
  return { page: file, tema: 'feminino-q' };
}

/**
 * Carrega o bio do servidor (inclui campo `tema`).
 * Se o tema do servidor diferir do tema atual da página,
 * redireciona para a versão correta.
 * Retorna os dados do bio para uso imediato.
 */
async function carregarTemaEBio() {
  try {
    const res  = await fetch(URL_API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bio' }),
    });
    const data = await res.json();

    const temaServidor  = data.tema || 'feminino-q';
    const { page, tema: temaAtual } = detectarPaginaAtual();

    if (temaServidor !== temaAtual) {
      // Redireciona para a versão correta sem loop
      const sufixo   = TEMA_SUFIXOS[temaServidor] ?? '';
      const novaUrl  = `${page}${sufixo}.html`;
      if (novaUrl !== window.location.pathname.split('/').pop()) {
        window.location.replace(novaUrl);
        return null; // suspende execução
      }
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Verifica sessão + tema em páginas protegidas.
 * roleNecessario: 'cliente' | 'admin'
 * Retorna o payload da sessão ou redireciona.
 */
async function verificarSessaoComTema(roleNecessario = 'cliente') {
  try {
    // Verificar sessão
    const res  = await fetch(URL_SESSAO, {
      method: 'GET',
      credentials: 'include',
    });

    // FIX: se a resposta não for ok (rede), trata como não autenticado
    if (!res.ok) { window.location.href = 'index.html'; return null; }

    const sessao = await res.json();

    if (!sessao.autenticado) { window.location.href = 'index.html'; return null; }
    if (roleNecessario === 'admin' && sessao.role !== 'admin') {
      window.location.href = 'index.html'; return null;
    }

    // Verificar tema em segundo plano (sem bloquear)
    fetch(URL_API, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bio' }),
    })
    .then(r => r.json())
    .then(data => {
      const temaServidor = data.tema || 'feminino-q';
      const { page, tema: temaAtual } = detectarPaginaAtual();
      if (temaServidor !== temaAtual) {
        const sufixo  = TEMA_SUFIXOS[temaServidor] ?? '';
        const novaUrl = `${page}${sufixo}.html`;
        if (novaUrl !== window.location.pathname.split('/').pop())
          window.location.replace(novaUrl);
      }
    })
    .catch(() => {});

    return sessao;
  } catch {
    window.location.href = 'index.html';
    return null;
  }
}

// ── Glossário jurídico ────────────────────────────────────

const GLOSSARIO = {
  'Petição Inicial Protocolada': {
    titulo: 'Petição Inicial',
    texto: 'É o documento que dá início ao processo judicial. Nele, seu advogado apresenta os fatos, os fundamentos jurídicos e os pedidos ao juiz.',
  },
  'Aguardando Citação': {
    titulo: 'Citação',
    texto: 'É o ato oficial pelo qual a parte contrária é comunicada da existência do processo e convocada a se defender.',
  },
  'Audiência de Conciliação Designada': {
    titulo: 'Audiência de Conciliação',
    texto: 'Reunião formal onde um mediador tenta aproximar as partes para chegarem a um acordo sem precisar de julgamento.',
  },
  'Audiência de Instrução e Julgamento': {
    titulo: 'Audiência de Instrução',
    texto: 'Sessão onde testemunhas são ouvidas, provas são apresentadas e o juiz colhe os elementos necessários para proferir a sentença.',
  },
  'Sentença Proferida': {
    titulo: 'Sentença',
    texto: 'É a decisão final do juiz de primeira instância. Ela pode ser favorável ou desfavorável, e pode ser objeto de recurso.',
  },
  'Fase de Execução / Cálculos': {
    titulo: 'Fase de Execução',
    texto: 'Após a sentença definitiva, esta fase trata de efetivar a decisão — ou seja, fazer com que a parte vencedora receba o que lhe é de direito.',
  },
  'Processo Finalizado / Arquivado': {
    titulo: 'Processo Finalizado',
    texto: 'O processo chegou ao fim. Todas as obrigações foram cumpridas e o processo foi arquivado pelo juízo.',
  },
};

/**
 * Retorna o HTML do botão de glossário para um status.
 * Use em conjunto com createGlossarioModal().
 */
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

/**
 * Abre o modal do glossário para o status informado.
 */
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

/**
 * Retorna o HTML do modal de glossário.
 * Adicione ao <body> de qualquer página que use getBotaoGlossario().
 */
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
    <button onclick="fecharGlossario()" style="margin-top:22px;width:100%;padding:11px;background:linear-gradient(135deg,#C5A059,#9A7535);border:none;border-radius:var(--g-radius-sm,8px);color:#fff;font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;cursor:pointer;">
      Entendido
    </button>
  </div>
</div>`;
}

// ── Progresso por fase ────────────────────────────────────

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

// ── Logout universal ───────────────────────────────────────

async function logout() {
  try {
    await fetch(URL_API, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
  } catch {}
  window.location.href = 'index.html';
}

// ── Formatar data ─────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}
