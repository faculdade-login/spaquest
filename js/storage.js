/**
 * Persistência Supabase — S.P.A. Quest (otimizado: menos requests e menos payload)
 */
const FIELD_TO_DB = {
  taskCompletionsByDay: 'task_completions_by_day',
  healthDaily: 'health_daily',
  courseStudyDaily: 'course_study_daily',
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEYS = {
  leaderboard: 'spa_quest_cache_leaderboard',
  visibility: 'spa_quest_cache_visibility',
  global: 'spa_quest_cache_global',
};

const SELECT = {
  leaderboard: 'id, username, xp, character, streak',
  visibility: 'id, username, xp, character, courses',
  vault: 'id, character, phase2, coins',
  self: '*',
};

let _currentUser = null;
let _usersCache = [];
let _globalState = null;
let _sessionUserId = null;
let _pendingPatches = new Map();
let _persistTimer = null;
let _globalPersistTimer = null;
let _globalDirty = false;

function usernameToEmail(username) {
  const safe = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  return `${safe}@spaquest.app`;
}

function usernameToLegacyEmail(username) {
  const safe = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  return `${safe}@spaquest.local`;
}

function mapAuthError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde 1 hora ou use Entrar se já tiver conta.';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'Conta não confirmada. Desative Confirm email no Supabase ou rode supabase/06-auto-confirm-email.sql';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Usuário ou senha incorretos.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Usuário já existe.';
  }
  if (msg.includes('invalid email') || msg.includes('unable to validate email')) {
    return 'Usuário inválido. Use só letras, números e _.';
  }
  if (msg.includes('password')) {
    return 'Senha inválida. Use pelo menos 6 caracteres.';
  }
  return error?.message || 'Erro de autenticação.';
}

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeSessionCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota exceeded — ignora cache */
  }
}

function invalidateListCaches() {
  Object.values(CACHE_KEYS).forEach((key) => {
    if (key !== CACHE_KEYS.global) sessionStorage.removeItem(key);
  });
}

function getPageLoadPlan() {
  const pageId = document.body?.id || '';
  if (document.getElementById('login-form')) return { authOnly: true };
  if (pageId === 'dashboard-page') return { user: true, leaderboard: true };
  if (pageId === 'visibilidade-page') return { user: true, visibility: true };
  if (pageId === 'guilda-page') return { user: true, global: true, vault: true };
  if (document.getElementById('character-form')) return { user: true };
  return { user: true };
}

function profileRowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    character: row.character,
    courses: row.courses || [],
    tasks: row.tasks || [],
    xp: row.xp ?? 0,
    level: row.level ?? 1,
    coins: row.coins ?? 0,
    streak: row.streak || {
      weekdaysCompleted: [],
      currentStreak: 0,
      bestStreak: 0,
      lastWeekdayKey: null,
    },
    taskCompletionsByDay: row.task_completions_by_day || {},
    phase2: row.phase2 || defaultUserPhase2(),
    healthDaily: row.health_daily || { dayKey: todayKeyStorage(), doneIds: [] },
    courseStudyDaily: row.course_study_daily || { dayKey: todayKeyStorage(), studied: {} },
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

function mergeUsersIntoCache(rows) {
  (rows || []).forEach((row) => {
    const user = profileRowToUser(row);
    if (!user) return;
    const idx = _usersCache.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      _usersCache[idx] = { ..._usersCache[idx], ...user };
    } else {
      _usersCache.push(user);
    }
    if (_currentUser?.id === user.id) {
      _currentUser = { ..._currentUser, ...user };
    }
  });
}

function userPatchToDb(patch) {
  const db = {};
  for (const [key, value] of Object.entries(patch)) {
    if (['id', 'password', 'createdAt', 'updatedAt'].includes(key)) continue;
    db[FIELD_TO_DB[key] || key] = value;
  }
  return db;
}

function getSupabase() {
  const client = window.spaSupabase;
  if (!client) throw new Error('Supabase não configurado. Verifique js/config.js');
  return client;
}

async function signInWithUsername(username, password) {
  const sb = getSupabase();
  const emails = [usernameToEmail(username), usernameToLegacyEmail(username)];
  let lastError = null;

  for (const email of emails) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      _sessionUserId = data.user.id;
      await reloadCurrentUser();
      return { user: _currentUser };
    }
    lastError = error;
    if (error && !String(error.message).toLowerCase().includes('invalid login credentials')) {
      break;
    }
  }

  return { error: mapAuthError(lastError) };
}

async function initStorage() {
  const sb = window.spaSupabase;
  if (!sb) return;

  const { data: sessionData } = await sb.auth.getSession();
  _sessionUserId = sessionData.session?.user?.id || null;

  const plan = getPageLoadPlan();
  if (plan.authOnly) return;

  const tasks = [];
  if (plan.user && _sessionUserId) tasks.push(reloadCurrentUser());
  if (plan.leaderboard) tasks.push(loadLeaderboardUsers());
  if (plan.visibility) tasks.push(loadVisibilityUsers());
  if (plan.global) tasks.push(loadGlobalState());
  if (plan.vault) tasks.push(loadVaultUsers());

  await Promise.all(tasks);
}

async function loadLeaderboardUsers() {
  const cached = readSessionCache(CACHE_KEYS.leaderboard);
  if (cached) {
    mergeUsersIntoCache(cached);
    return;
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select(SELECT.leaderboard)
    .not('character', 'is', null)
    .order('xp', { ascending: false })
    .limit(25);

  if (error) {
    console.error('[storage] loadLeaderboardUsers', error);
    return;
  }

  writeSessionCache(CACHE_KEYS.leaderboard, data || []);
  mergeUsersIntoCache(data || []);
}

async function loadVisibilityUsers() {
  const cached = readSessionCache(CACHE_KEYS.visibility);
  if (cached) {
    mergeUsersIntoCache(cached);
    return;
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select(SELECT.visibility)
    .not('character', 'is', null)
    .order('xp', { ascending: false })
    .limit(40);

  if (error) {
    console.error('[storage] loadVisibilityUsers', error);
    return;
  }

  writeSessionCache(CACHE_KEYS.visibility, data || []);
  mergeUsersIntoCache(data || []);
}

async function loadVaultUsers() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select(SELECT.vault)
    .not('character', 'is', null)
    .limit(60);

  if (error) {
    console.error('[storage] loadVaultUsers', error);
    return;
  }

  mergeUsersIntoCache(data || []);
}

async function reloadCurrentUser() {
  if (!_sessionUserId) {
    _currentUser = null;
    return null;
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select(SELECT.self)
    .eq('id', _sessionUserId)
    .maybeSingle();

  if (error) {
    console.error('[storage] reloadCurrentUser', error);
    return null;
  }

  _currentUser = profileRowToUser(data);
  if (_currentUser) mergeUsersIntoCache([data]);
  return _currentUser;
}

async function loadGlobalState() {
  const cached = readSessionCache(CACHE_KEYS.global);
  if (cached) {
    _globalState = cached;
    ensureGlobalVault(_globalState);
    return _globalState;
  }

  const sb = getSupabase();
  const { data, error } = await sb.from('global_state').select('data').eq('id', 1).maybeSingle();
  if (error || !data?.data) {
    _globalState = defaultGlobalState();
    return _globalState;
  }

  _globalState = data.data;
  if (_globalState.boss?.name === 'Rei da Procrastinação') {
    _globalState.boss.name = 'Boss Otanos';
    saveGlobalState(_globalState);
  }
  ensureGlobalVault(_globalState);
  writeSessionCache(CACHE_KEYS.global, _globalState);
  return _globalState;
}

async function flushPendingPatches() {
  if (!_pendingPatches.size) return;
  const sb = getSupabase();
  const entries = [..._pendingPatches.entries()];
  _pendingPatches.clear();

  let invalidate = false;
  for (const [userId, patch] of entries) {
    const dbPatch = userPatchToDb(patch);
    if (!Object.keys(dbPatch).length) continue;
    const { error } = await sb.from('profiles').update(dbPatch).eq('id', userId);
    if (error) console.error('[storage] persistUserPatch', error);
    if (
      patch.xp != null ||
      patch.courses != null ||
      patch.character != null ||
      patch.phase2 != null ||
      patch.coins != null
    ) {
      invalidate = true;
    }
  }
  if (invalidate) invalidateListCaches();
}

async function persistGlobalStateNow() {
  if (!_globalState) return;
  const sb = getSupabase();
  const { error } = await sb.from('global_state').update({ data: _globalState }).eq('id', 1);
  if (error) console.error('[storage] persistGlobalState', error);
  else writeSessionCache(CACHE_KEYS.global, _globalState);
  _globalDirty = false;
}

function getUsers() {
  return _usersCache;
}

function getSession() {
  return _sessionUserId ? { userId: _sessionUserId } : null;
}

function setSession(userId) {
  _sessionUserId = userId;
}

async function clearSession() {
  const sb = window.spaSupabase;
  if (_persistTimer) {
    clearTimeout(_persistTimer);
    await flushPendingPatches();
  }
  if (_globalPersistTimer) {
    clearTimeout(_globalPersistTimer);
    await persistGlobalStateNow();
  }
  if (sb) await sb.auth.signOut();
  _sessionUserId = null;
  _currentUser = null;
  _usersCache = [];
  Object.values(CACHE_KEYS).forEach((key) => sessionStorage.removeItem(key));
}

function getCurrentUser() {
  return _currentUser;
}

function updateUser(userId, patch) {
  const idx = _usersCache.findIndex((u) => u.id === userId);
  const base = idx >= 0 ? _usersCache[idx] : _currentUser;
  if (!base || base.id !== userId) return null;

  const updated = { ...base, ...patch, updatedAt: Date.now() };
  if (idx >= 0) _usersCache[idx] = updated;
  else _usersCache.push(updated);
  if (_currentUser?.id === userId) _currentUser = updated;

  queueUserPatch(userId, patch);
  return updated;
}

function queueUserPatch(userId, patch) {
  const prev = _pendingPatches.get(userId) || {};
  _pendingPatches.set(userId, { ...prev, ...patch });
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    flushPendingPatches();
  }, 500);
}

async function createUser({ username, password }) {
  const sb = getSupabase();
  const normalized = username.trim();

  const { data: existing } = await sb
    .from('profiles')
    .select('id')
    .ilike('username', normalized)
    .maybeSingle();

  if (existing) {
    const signIn = await signInWithUsername(normalized, password);
    if (signIn.user) return { user: signIn.user };
    return { error: 'Usuário já existe. Use a senha correta em Entrar.' };
  }

  const email = usernameToEmail(normalized);
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username: normalized } },
  });

  if (error) {
    const mapped = mapAuthError(error);
    if (mapped.includes('já existe') || String(error.message).toLowerCase().includes('already')) {
      const signIn = await signInWithUsername(normalized, password);
      if (signIn.user) return { user: signIn.user };
    }
    return { error: mapped };
  }
  if (!data.user) return { error: 'Não foi possível criar a conta.' };

  if (data.session?.user) {
    _sessionUserId = data.session.user.id;
  } else {
    const signIn = await signInWithUsername(normalized, password);
    if (signIn.error) return { error: signIn.error };
  }

  await reloadCurrentUser();

  if (_currentUser && _currentUser.username !== normalized) {
    await sb.from('profiles').update({ username: normalized }).eq('id', data.user.id);
    _currentUser = { ..._currentUser, username: normalized };
  }

  invalidateListCaches();
  return { user: _currentUser };
}

function todayKeyStorage() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultUserPhase2() {
  return {
    energy: { mana: 100, energy: 100, stamina: 100 },
    boosters: [],
    activeBooster: null,
    lootLog: [],
    vaultContributed: 0,
    vaultRewards: [],
  };
}

function ensureUserPhase2(user) {
  if (!user.phase2) return defaultUserPhase2();
  return user.phase2;
}

function getGlobalState() {
  if (!_globalState) _globalState = defaultGlobalState();
  return _globalState;
}

function defaultGlobalState() {
  return {
    vault: {
      coins: 0,
      level: 1,
      perks: ['Cursos bônus', 'Vantagens da guilda'],
      lastDistributionAt: null,
      lastDistributedLevel: 0,
      distributionHistory: [],
    },
    boss: {
      name: 'Boss Otanos',
      hp: 50000,
      maxHp: 50000,
      defeats: 0,
    },
    totalTasksGlobal: 0,
  };
}

function ensureGlobalVault(global) {
  if (!global.vault) global.vault = defaultGlobalState().vault;
  if (!Array.isArray(global.vault.distributionHistory)) {
    global.vault.distributionHistory = [];
  }
  return global.vault;
}

function saveGlobalState(state) {
  _globalState = state;
  _globalDirty = true;
  writeSessionCache(CACHE_KEYS.global, _globalState);
  clearTimeout(_globalPersistTimer);
  _globalPersistTimer = setTimeout(() => {
    persistGlobalStateNow();
  }, 500);
}

async function findUserByCredentials(username, password) {
  const result = await signInWithUsername(username, password);
  if (result.error) return { error: result.error };
  return { user: result.user };
}

window.storageReady = initStorage();

window.addEventListener('pagehide', () => {
  if (_pendingPatches.size) flushPendingPatches();
  if (_globalDirty) persistGlobalStateNow();
});
