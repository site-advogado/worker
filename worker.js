// ============================================================
// worker.js — Cloudflare Worker (versão com KV Auth)
//
// Variáveis de ambiente (marque TODAS como Secret):
//   JWT_SECRET        → openssl rand -hex 32
//   MASTER_API_KEY    → chave para o Google Apps Script
//   GOOGLE_SCRIPT_URL → URL do Apps Script publicado
//   ENCRYPTION_KEY    → openssl rand -hex 32  (AES-256 para email/palavra)
//   SETUP_MASTER_KEY  → openssl rand -hex 32  (protege /api/setup-admin)
//
// KV Namespaces (criar no painel Cloudflare > Workers > KV):
//   AUTH_KV        → binding name: AUTH_KV
//   RATE_LIMIT_KV  → binding name: RATE_LIMIT_KV
//
// Estrutura do AUTH_KV:
//   chave "admin_credentials" → JSON {
//     email:   { iv: string, data: string },  // AES-256-GCM base64
//     senha:   { hash: string, salt: string }, // SHA-256 com salt
//     palavra: { iv: string, data: string },   // AES-256-GCM base64
//   }
// ============================================================

// ──────────────────────────────────────────────────────────
// CRIPTOGRAFIA — Web Crypto API
// ──────────────────────────────────────────────────────────

/**
 * Deriva a chave AES-256-GCM a partir do ENCRYPTION_KEY (hex).
 * A chave é importada diretamente como raw bytes.
 */
async function getEncryptionKey(hexKey) {
  const keyBytes = hexToBytes(hexKey);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa texto com AES-256-GCM.
 * Gera IV aleatório de 12 bytes para cada operação.
 * Retorna { iv: base64, data: base64 }
 */
async function encrypt(plaintext, hexKey) {
  const key = await getEncryptionKey(hexKey);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc
  );

  return {
    iv:   bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

/**
 * Descriptografa dado com AES-256-GCM.
 * Recebe { iv: base64, data: base64 }
 * Retorna string ou null se falhar.
 */
async function decrypt(encrypted, hexKey) {
  try {
    const key  = await getEncryptionKey(hexKey);
    const iv   = base64ToBytes(encrypted.iv);
    const data = base64ToBytes(encrypted.data);

    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return new TextDecoder().decode(plainBuf);
  } catch {
    return null; // falha silenciosa — não revela o motivo
  }
}

/**
 * Gera hash SHA-256 com salt aleatório de 32 bytes.
 * Retorna { hash: hex, salt: hex }
 */
async function hashPassword(password) {
  const salt    = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash    = await sha256(salt + password);
  return { hash, salt };
}

/**
 * Verifica se a senha corresponde ao hash armazenado.
 * Retorna true ou false — nunca revela detalhes.
 */
async function verifyPassword(password, storedHash, storedSalt) {
  try {
    const computed = await sha256(storedSalt + password);
    // Comparação em tempo constante para evitar timing attacks
    return constantTimeEqual(computed, storedHash);
  } catch {
    return false;
  }
}

/**
 * SHA-256 simples — retorna hex string.
 */
async function sha256(text) {
  const buf  = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return bytesToHex(new Uint8Array(buf));
}

/**
 * Comparação em tempo constante de duas strings.
 * Impede timing attacks onde o atacante mede o tempo de resposta.
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Utilitários de conversão ──────────────────────────────

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ──────────────────────────────────────────────────────────
// JWT
// ──────────────────────────────────────────────────────────

async function generateJWT(payload, secret) {
  const encode = obj =>
    btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const header    = encode({ alg:'HS256', typ:'JWT' });
  const body      = encode(payload);
  const sigInput  = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  const sig    = bytesToBase64(new Uint8Array(sigBuf))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${sigInput}.${sig}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sigB64] = parts;
    const sigInput = `${h}.${p}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name:'HMAC', hash:'SHA-256' }, false, ['verify']
    );
    const sig   = base64ToBytes(sigB64.replace(/-/g,'+').replace(/_/g,'/'));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(sigInput));
    if (!valid) return null;
    const payload = JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));
    if (!payload.exp || !payload.iat || !payload.sub || !payload.role) return null;
    if (Math.floor(Date.now()/1000) > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function getToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/ADV_SESSION_TOKEN=([^;]+)/);
  return m ? m[1] : null;
}

// SameSite=None para funcionar cross-origin (GitHub Pages → Worker)
function setCookie(token, maxAge = 0) {
  if (maxAge === 0)
    return `ADV_SESSION_TOKEN=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
  return `ADV_SESSION_TOKEN=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}

// ──────────────────────────────────────────────────────────
// CORS e Segurança
// ──────────────────────────────────────────────────────────

function secHeaders() {
  return {
    'X-Frame-Options':        'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy':        'strict-origin-when-cross-origin',
  };
}

function getCors(origin, allowed) {
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin':      origin,
    'Access-Control-Allow-Methods':     'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// ──────────────────────────────────────────────────────────
// RATE LIMITING
// ──────────────────────────────────────────────────────────

const LIMITS = {
  login_admin:        { max: 5,  ttl: 600  }, // 5 tentativas / 10 min
  otp_solicitar:      { max: 5,  ttl: 300  },
  otp_verificar:      { max: 5,  ttl: 300  },
  checar_notificacao: { max: 10, ttl: 60   },
  primeiro_acesso:    { max: 3,  ttl: 3600 },
  update_credentials: { max: 3,  ttl: 600  },
};

async function rl(kv, ip, action) {
  if (!kv) return { ok: true };
  const lim = LIMITS[action] || { max: 20, ttl: 60 };
  const key = `rl:${action}:${ip}`;
  try {
    const raw = await kv.get(key);
    const cnt = raw ? parseInt(raw, 10) : 0;
    if (cnt >= lim.max) return { ok: false, retryAfter: lim.ttl };
    await kv.put(key, String(cnt + 1), { expirationTtl: lim.ttl });
    return { ok: true };
  } catch { return { ok: true }; }
}

async function rlReset(kv, ip, action) {
  if (!kv) return;
  try { await kv.delete(`rl:${action}:${ip}`); } catch {}
}

// ──────────────────────────────────────────────────────────
// CREDENCIAIS NO KV
// ──────────────────────────────────────────────────────────

const AUTH_KEY = 'admin_credentials';

/**
 * Salva as credenciais do admin no KV com criptografia.
 * NUNCA salva dados em texto puro.
 */
async function saveCredentials(authKV, encKey, email, senha, palavra) {
  const [emailEnc, palavraEnc, senhaHash] = await Promise.all([
    encrypt(email.toLowerCase().trim(), encKey),
    encrypt(palavra.toLowerCase().trim(), encKey),
    hashPassword(senha),
  ]);

  const payload = {
    email:   emailEnc,                    // { iv, data } — AES-256-GCM
    senha:   senhaHash,                   // { hash, salt } — SHA-256+salt
    palavra: palavraEnc,                  // { iv, data } — AES-256-GCM
    updatedAt: new Date().toISOString(),
  };

  await authKV.put(AUTH_KEY, JSON.stringify(payload));
}

/**
 * Carrega e valida as credenciais do KV.
 * Retorna o objeto raw (ainda criptografado).
 */
async function loadCredentials(authKV) {
  try {
    const raw = await authKV.get(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/**
 * Verifica se o setup já foi feito (KV tem credenciais).
 */
async function isSetupDone(authKV) {
  const creds = await loadCredentials(authKV);
  return creds !== null;
}

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...secHeaders(), ...extra },
  });
}

async function gas(env, body) {
  try {
    const r = await fetch(env.GOOGLE_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, api_key: env.MASTER_API_KEY }),
    });
    return await r.json();
  } catch {
    return { status: 'erro', message: 'Falha ao conectar com o servidor.' };
  }
}

// ──────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ──────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const ip     = request.headers.get('cf-connecting-ip') || '0.0.0.0';
    const rlKV   = env.RATE_LIMIT_KV || null;
    const authKV = env.AUTH_KV;

    const allowed = [
      'https://site-advogado.github.io',
      'https://texte123445.blogspot.com',
    ];

    const cors = getCors(origin, allowed);

    if (!cors && request.method !== 'OPTIONS')
      return json({ status: 'erro', message: 'Origem não autorizada.' }, 403);

    if (request.method === 'OPTIONS')
      return new Response(null, { headers: { ...(cors || {}), ...secHeaders() } });

    // ──────────────────────────────────────────────────────
    // ROTA: POST /api/setup-admin
    // Primeiro acesso — cria credenciais no KV.
    // Bloqueado se já existir configuração.
    // ──────────────────────────────────────────────────────
    if (url.pathname === '/api/setup-admin' && request.method === 'POST') {
      const check = await rl(rlKV, ip, 'primeiro_acesso');
      if (!check.ok)
        return json({ status: 'erro', message: 'Muitas tentativas. Aguarde e tente novamente.' }, 429, cors);

      // Bloqueia se já configurado
      if (await isSetupDone(authKV))
        return json({ status: 'erro', message: 'Sistema já configurado. Use a área de credenciais no painel.' }, 409, cors);

      let body;
      try { body = await request.json(); } catch { return json({ status: 'erro', message: 'JSON inválido.' }, 400, cors); }

      const { email, senha, palavra_secreta } = body;

      // Validações no backend (nunca confiar apenas no frontend)
      if (!email || !senha || !palavra_secreta)
        return json({ status: 'erro', message: 'Dados incompletos.' }, 400, cors);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ status: 'erro', message: 'E-mail inválido.' }, 400, cors);
      if (senha.length < 8)
        return json({ status: 'erro', message: 'Senha muito curta.' }, 400, cors);
      if (palavra_secreta.length < 4)
        return json({ status: 'erro', message: 'Palavra-chave muito curta.' }, 400, cors);

      try {
        await saveCredentials(authKV, env.ENCRYPTION_KEY, email, senha, palavra_secreta);

        // Também notifica o GAS para registrar que o setup foi concluído
        // (GAS não recebe as credenciais — apenas um flag)
        gas(env, { action: 'marcar_setup_concluido' }).catch(() => {});

        return json({ status: 'ok' }, 200, cors);
      } catch (err) {
        return json({ status: 'erro', message: 'Erro interno ao salvar.' }, 500, cors);
      }
    }

    // ──────────────────────────────────────────────────────
    // ROTA: GET /api/verificar-setup
    // Verifica se o KV tem credenciais.
    // ──────────────────────────────────────────────────────
    if (url.pathname === '/api/verificar-setup' && request.method === 'GET') {
      const done = await isSetupDone(authKV);
      return json({ primeiro_acesso: !done }, 200, cors);
    }

    // ──────────────────────────────────────────────────────
    // ROTA: POST /api/update-secret-login
    // Atualiza credenciais do admin.
    // Protegido por JWT admin válido (não por SETUP_MASTER_KEY).
    // ──────────────────────────────────────────────────────
    if (url.pathname === '/api/update-secret-login' && request.method === 'POST') {
      // Verificar JWT admin
      const token   = getToken(request);
      const payload = token ? await verifyJWT(token, env.JWT_SECRET) : null;
      if (!payload || payload.role !== 'admin')
        return json({ status: 'erro', message: 'Não autorizado.' }, 401, cors);

      // Rate limit para evitar brute force na atualização
      const check = await rl(rlKV, ip, 'update_credentials');
      if (!check.ok)
        return json({ status: 'erro', message: 'Muitas tentativas. Aguarde.' }, 429, cors);

      let body;
      try { body = await request.json(); } catch { return json({ status: 'erro', message: 'JSON inválido.' }, 400, cors); }

      const { email, senha, palavra_secreta } = body;

      // Campos são opcionais — só atualiza o que foi enviado
      // Para isso, carrega os dados atuais e mescla
      const current = await loadCredentials(authKV);
      if (!current)
        return json({ status: 'erro', message: 'Configuração não encontrada.' }, 404, cors);

      // Descriptografa dados atuais para mesclar com os novos
      const emailAtual   = await decrypt(current.email,   env.ENCRYPTION_KEY);
      const palavraAtual = await decrypt(current.palavra, env.ENCRYPTION_KEY);

      if (!emailAtual || !palavraAtual)
        return json({ status: 'erro', message: 'Erro ao ler configuração atual.' }, 500, cors);

      const novoEmail   = email           ? email.toLowerCase().trim()           : emailAtual;
      const novaPalavra = palavra_secreta ? palavra_secreta.toLowerCase().trim() : palavraAtual;

      // Valida apenas os campos que foram enviados
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ status: 'erro', message: 'E-mail inválido.' }, 400, cors);
      if (senha && senha.length < 8)
        return json({ status: 'erro', message: 'Senha muito curta (mínimo 8 caracteres).' }, 400, cors);
      if (palavra_secreta && palavra_secreta.length < 4)
        return json({ status: 'erro', message: 'Palavra-chave muito curta.' }, 400, cors);

      try {
        if (senha) {
          // Nova senha — re-hash tudo
          await saveCredentials(authKV, env.ENCRYPTION_KEY, novoEmail, senha, novaPalavra);
        } else {
          // Sem nova senha — atualiza apenas email e/ou palavra
          const [emailEnc, palavraEnc] = await Promise.all([
            encrypt(novoEmail, env.ENCRYPTION_KEY),
            encrypt(novaPalavra, env.ENCRYPTION_KEY),
          ]);
          const updated = {
            email:     emailEnc,
            senha:     current.senha, // mantém hash existente
            palavra:   palavraEnc,
            updatedAt: new Date().toISOString(),
          };
          await authKV.put(AUTH_KEY, JSON.stringify(updated));
        }

        return json({ status: 'ok' }, 200, cors);
      } catch {
        return json({ status: 'erro', message: 'Erro ao atualizar.' }, 500, cors);
      }
    }

    // ──────────────────────────────────────────────────────
    // ROTA: GET /api/verificar-sessao
    // ──────────────────────────────────────────────────────
    if (url.pathname === '/api/verificar-sessao' && request.method === 'GET') {
      const token   = getToken(request);
      const payload = token ? await verifyJWT(token, env.JWT_SECRET) : null;
      if (!payload) return json({ autenticado: false }, 200, cors);
      return json({ autenticado: true, role: payload.role, usuario: payload.sub }, 200, cors);
    }

    // ──────────────────────────────────────────────────────
    // ROTA: POST /api/v1 — Todas as ações
    // ──────────────────────────────────────────────────────
    if (url.pathname === '/api/v1' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch { return json({ status: 'erro', message: 'JSON inválido.' }, 400, cors); }

      const { action } = body;

      // ── Bio pública ──────────────────────────────────────
      if (action === 'bio') {
        const r = await gas(env, { action: 'bio' });
        return json(r, 200, cors);
      }

      // ── Verificar setup (via KV, não GAS) ───────────────
      if (action === 'verificar_setup') {
        const done = await isSetupDone(authKV);
        return json({ primeiro_acesso: !done }, 200, cors);
      }

      // ── Checar notificação (pública) ─────────────────────
      if (action === 'checar_notificacao') {
        const check = await rl(rlKV, ip, 'checar_notificacao');
        if (!check.ok) return json({ tem_novidade: false }, 429, cors);
        try {
          const r = await fetch(env.GOOGLE_SCRIPT_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'checar_notificacao', email: body.email }),
          });
          return json(await r.json(), 200, cors);
        } catch { return json({ tem_novidade: false }, 200, cors); }
      }

      // ── OTP solicitar ─────────────────────────────────────
      if (action === 'login' && body.passo === 'solicitar') {
        const check = await rl(rlKV, ip, 'otp_solicitar');
        if (!check.ok)
          return json({ status: 'erro', message: 'Muitas tentativas. Aguarde 5 minutos.' }, 429, cors);

        const usuarioInput = (body.usuario || '').trim().toLowerCase();

        // Verificar palavra secreta (agora via KV, não GAS)
        const creds = await loadCredentials(authKV);
        if (creds) {
          const palavraDecrypt = await decrypt(creds.palavra, env.ENCRYPTION_KEY);
          if (palavraDecrypt && constantTimeEqual(usuarioInput, palavraDecrypt)) {
            return json({ status: 'ir_para_admin' }, 200, cors);
          }
        } else {
          // Sem setup: bootstrap word
          if (usuarioInput === 'admin') {
            return json({ status: 'ir_para_admin' }, 200, cors);
          }
        }

        // Fluxo normal de cliente
        const r = await gas(env, { action: 'login', usuario: body.usuario, passo: 'solicitar', ip });
        return json(r, 200, cors);
      }

      // ── OTP verificar ─────────────────────────────────────
      if (action === 'login' && body.passo === 'verificar') {
        const check = await rl(rlKV, ip, 'otp_verificar');
        if (!check.ok)
          return json({ status: 'erro', message: 'Muitas tentativas. Aguarde 5 minutos.' }, 429, cors);

        const r = await gas(env, { action: 'login', usuario: body.usuario, codigo: body.codigo, passo: 'verificar', ip });

        if (r.status === 'ok') {
          await rlReset(rlKV, ip, 'otp_verificar');
          await rlReset(rlKV, ip, 'otp_solicitar');
          gas(env, { action: 'marcar_lido', email: body.usuario }).catch(() => {});

          const now   = Math.floor(Date.now() / 1000);
          const token = await generateJWT(
            { sub: body.usuario, role: 'cliente', iat: now, exp: now + 28800 },
            env.JWT_SECRET
          );
          return new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookie(token, 28800), ...secHeaders(), ...cors },
          });
        }
        return json(r, 200, cors);
      }

      // ── Login admin (verifica no KV, não no GAS) ──────────
      if (action === 'login_admin') {
        const check = await rl(rlKV, ip, 'login_admin');
        if (!check.ok)
          return json({ status: 'erro', message: 'Muitas tentativas. Aguarde 10 minutos.' }, 429, cors);

        const creds = await loadCredentials(authKV);
        if (!creds)
          return json({ status: 'erro', message: 'Sistema não configurado.' }, 400, cors);

        // Descriptografa email para comparar
        const emailDecrypt = await decrypt(creds.email, env.ENCRYPTION_KEY);

        // Verifica email E senha — SEMPRE executa ambas as verificações
        // para evitar timing attacks (não para mais cedo se email errado)
        const emailOk  = emailDecrypt !== null &&
          constantTimeEqual(
            (body.usuario || '').trim().toLowerCase(),
            emailDecrypt
          );
        const senhaOk  = await verifyPassword(body.senha || '', creds.senha.hash, creds.senha.salt);

        // Mensagem genérica — não informa qual campo está errado
        if (!emailOk || !senhaOk) {
          return json({ status: 'erro', message: 'Credenciais inválidas.' }, 401, cors);
        }

        await rlReset(rlKV, ip, 'login_admin');
        const now   = Math.floor(Date.now() / 1000);
        const token = await generateJWT(
          { sub: body.usuario, role: 'admin', iat: now, exp: now + 7200 },
          env.JWT_SECRET
        );
        return new Response(JSON.stringify({ status: 'sucesso' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookie(token, 7200), ...secHeaders(), ...cors },
        });
      }

      // ── Logout ────────────────────────────────────────────
      if (action === 'logout') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookie('', 0), ...secHeaders(), ...cors },
        });
      }

      // ── Rotas autenticadas por JWT ────────────────────────
      const token   = getToken(request);
      const payload = token ? await verifyJWT(token, env.JWT_SECRET) : null;

      if (!payload)
        return json({ status: 'nao_autorizado', message: 'Sessão inválida ou expirada.' }, 401, cors);

      // Timeline (IDOR fix)
      if (action === 'timeline') {
        if (payload.role !== 'cliente' && payload.role !== 'admin')
          return json({ status: 'erro', message: 'Sem permissão.' }, 403, cors);
        const emailAlvo = payload.role === 'admin' ? (body.email || payload.sub) : payload.sub;
        return json(await gas(env, { action: 'timeline', email: emailAlvo }), 200, cors);
      }

      // Salvar tema
      if (action === 'salvar_tema') {
        if (payload.role !== 'admin')
          return json({ status: 'erro', message: 'Sem permissão.' }, 403, cors);
        return json(await gas(env, { action: 'salvar_tema', tema: body.tema }), 200, cors);
      }

      // Ações admin
      const adminActions = ['save_profile','listar_clientes','save_client','update_client_timeline','delete_client'];
      if (adminActions.includes(action)) {
        if (payload.role !== 'admin')
          return json({ status: 'erro', message: 'Acesso restrito a administradores.' }, 403, cors);
        const { api_key: _, ...safeBody } = body;
        return json(await gas(env, safeBody), 200, cors);
      }

      return json({ status: 'erro', message: 'Ação desconhecida.' }, 400, cors);
    }

    return new Response('Not Found', { status: 404, headers: secHeaders() });
  },
};
