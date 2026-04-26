// ============================================================
// app.js — Lógica central do index (todas as versões de tema)
// Requer: tema.js carregado antes deste arquivo
// ============================================================

const URL_API = 'https://api-advogada.siterefrigeracaoeliezer.workers.dev/api/v1';

// Palavra reservada de bootstrap — funciona ANTES da planilha ter
// qualquer palavra_secreta cadastrada. Hardcoded no frontend E no Worker.
const BOOTSTRAP_WORD = 'admin';

let countdownInterval;
let deferredPrompt;
let _bioData = null; // cache do bio para uso nas funções

// ── PWA ───────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installApp');
  if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
});

document.getElementById('installApp')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    const btn = document.getElementById('installApp');
    if (btn) { btn.classList.add('hidden'); btn.style.display = 'none'; }
  }
  deferredPrompt = null;
});

// ── Loading ───────────────────────────────────────────────
function showLoading() {
  const el = document.getElementById('globalLoader');
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = 'flex';
}
function hideLoading() {
  const el = document.getElementById('globalLoader');
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none';
}

// ── Modais ─────────────────────────────────────────────────
function showErrorModal(msg) {
  const el = document.getElementById('errorMessage');
  if (el) el.textContent = msg; // textContent = XSS safe
  const m = document.getElementById('modalError');
  if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
}
function closeErrorModal() {
  const m = document.getElementById('modalError');
  if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
}

function openOtpModal() {
  const inp = document.getElementById('inputOtp');
  if (inp) inp.value = '';
  const m = document.getElementById('modalCode');
  if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
  startTimer(180);
}
function closeOtpModal() {
  const m = document.getElementById('modalCode');
  if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
  clearInterval(countdownInterval);
}

// ── Timer OTP ─────────────────────────────────────────────
function startTimer(duration) {
  let remaining = duration;
  clearInterval(countdownInterval);
  const timerEl    = document.getElementById('timer');
  const timerLabel = document.getElementById('timerLabel');
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      if (timerLabel) timerLabel.textContent = 'CÓDIGO EXPIRADO';
      else if (timerEl) timerEl.parentElement.textContent = 'CÓDIGO EXPIRADO';
      return;
    }
    if (timerEl) {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
  }, 1000);
}

// ── Banner de notificação de processo ──────────────────────
function exibirBannerNotificacao(mensagem) {
  const banner = document.getElementById('notifBanner');
  const texto  = document.getElementById('notifBannerTexto');
  if (!banner || !texto) return;
  texto.textContent = mensagem;
  banner.classList.remove('hidden');
  banner.style.display = 'flex';
  // Animação suave
  banner.style.opacity = '0';
  setTimeout(() => { banner.style.transition = 'opacity 0.4s'; banner.style.opacity = '1'; }, 10);
}
function ocultarBannerNotificacao() {
  const banner = document.getElementById('notifBanner');
  if (!banner) return;
  banner.classList.add('hidden');
  banner.style.display = 'none';
}

// ── Checar notificação (blur no campo email) ───────────────
async function checarNotificacao(email) {
  if (!email || !email.includes('@')) return;
  try {
    const res  = await fetch(URL_API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checar_notificacao', email }),
    });
    const data = await res.json();
    if (data.tem_novidade && data.mensagem) {
      exibirBannerNotificacao(data.mensagem);
    } else {
      ocultarBannerNotificacao();
    }
  } catch { /* silencioso */ }
}

// ── Banner de primeiro acesso ─────────────────────────────
function exibirBannerPrimeiroAcesso(msg) {
  const banner = document.getElementById('primeiroAcessoBanner');
  const texto  = document.getElementById('primeiroAcessoTexto');
  if (!banner) return;
  if (texto) texto.textContent = msg || `Para configurar o sistema pela primeira vez, digite "${BOOTSTRAP_WORD}" no campo de busca abaixo.`;
  banner.classList.remove('hidden');
  banner.style.display = 'flex';
}

// ── Preencher bio na página ───────────────────────────────
function preencherBio(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '';
  };
  const setAttr = (id, attr, val) => {
    const el = document.getElementById(id);
    if (el && val) el[attr] = val;
  };

  set('bio-name', data.name);
  set('bio-oab',  data.oab);
  set('bio-desc', data.desc);

  if (data.img) setAttr('bio-img', 'src', data.img);
  if (data.phone) {
    const clean = String(data.phone).replace(/\D/g, '');
    setAttr('bio-phone', 'href', `https://wa.me/55${clean}`);
  }
  if (data.email_advogada) {
    setAttr('bio-email', 'href', `mailto:${data.email_advogada}`);
  }
}

// ── Init principal ────────────────────────────────────────
async function init() {
  showLoading();
  try {
    // 1. Verificar se é primeiro acesso + carregar bio + detectar tema
    const data = await carregarTemaEBio(); // de tema.js
    if (!data) return; // redirecionou para outro tema

    _bioData = data;
    preencherBio(data);

    // 2. Verificar setup — exibe banner informativo se for primeiro acesso
    try {
      const setupRes  = await fetch(URL_API, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verificar_setup' }),
      });
      const setupData = await setupRes.json();
      if (setupData.primeiro_acesso) {
        const msgIndex = data.msg_index ||
          `Para configurar o sistema pela primeira vez, digite "${BOOTSTRAP_WORD}" no campo de busca abaixo.`;
        exibirBannerPrimeiroAcesso(msgIndex);
      }
    } catch { /* se falhar, não bloqueia */ }

  } catch (err) {
    console.error('Erro ao inicializar:', err);
    const el = document.getElementById('bio-name');
    if (el) el.textContent = 'Erro ao carregar';
  } finally {
    hideLoading();
  }
}

// ── Passo 1: solicitar OTP ────────────────────────────────
async function handleClientSearch() {
  const emailInput = document.getElementById('searchCpf');
  const email      = emailInput?.value.trim();
  if (!email) return showErrorModal('Por favor, preencha o campo com seu e-mail.');

  // Ocultar banner de notificação anterior
  ocultarBannerNotificacao();

  showLoading();
  try {
    const res  = await fetch(URL_API, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', usuario: email, passo: 'solicitar' }),
    });
    const data = await res.json();

    if (data.status === 'ir_para_admin') {
      window.location.href = 'manutencao.html';
      return;
    }
    if (data.status === 'codigo_enviado') {
      openOtpModal();
    } else {
      showErrorModal(data.message || 'E-mail não encontrado no sistema.');
    }
  } catch {
    showErrorModal('Erro na comunicação. Verifique sua conexão e tente novamente.');
  } finally {
    hideLoading();
  }
}

// ── Passo 2: confirmar OTP ────────────────────────────────
async function confirmCode() {
  const emailInput = document.getElementById('searchCpf');
  const otpInput   = document.getElementById('inputOtp');
  const email      = emailInput?.value.trim();
  const codigo     = otpInput?.value.trim();
  if (!codigo) return showErrorModal('Digite o código recebido por e-mail.');

  showLoading();
  try {
    const res  = await fetch(URL_API, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', usuario: email, codigo, passo: 'verificar' }),
    });
    const data = await res.json();

    if (data.status === 'ok') {
      // Cookie HttpOnly setado pelo Worker — apenas redireciona
      closeOtpModal();
      window.location.href = 'linha-tempo.html';
    } else {
      showErrorModal(data.message || 'Código inválido ou expirado.');
    }
  } catch {
    showErrorModal('Erro na conexão. Tente novamente.');
  } finally {
    hideLoading();
  }
}

// ── Tema ──────────────────────────────────────────────────
function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('ADV_GLOBAL_THEME', isDark ? 'dark' : 'light');
  const icon = document.getElementById('themeIcon');
  if (icon) icon.classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');
}

// ── DOMContentLoaded ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Aplicar tema salvo localmente enquanto carrega do servidor
  const isDark = localStorage.getItem('ADV_GLOBAL_THEME') === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');

  // Listener blur no campo email → checar notificação
  const searchInput = document.getElementById('searchCpf');
  if (searchInput) {
    searchInput.addEventListener('blur', () => checarNotificacao(searchInput.value.trim()));
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleClientSearch(); });
  }

  // Listener botão buscar
  document.getElementById('btnSearch')?.addEventListener('click', handleClientSearch);

  // Fechar modal OTP com ESC
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOtpModal(); });

  // Inicializar
  init();
});
