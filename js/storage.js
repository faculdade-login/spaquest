/**
 * Persistência Supabase — S.P.A. Quest
 */
const FIELD_TO_DB = {
  taskCompletionsByDay: 'task_completions_by_day',
  healthDaily: 'health_daily',
  courseStudyDaily: 'course_study_daily',
};

let _currentUser = null;
let _usersCache = [];
let _globalState = null;
let _sessionUserId = null;

function usernameToEmail(username) {
  const safe = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  return `${safe}@spaquest.app`;
}

function usernameToLegacyEmail(username) {
  const safe = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  return `${safe}@spaquest.local`;
}

function authRedirectUrl() {
  const origin = window.location.origin;
  const path = window.location.pathname.includes('/html/')
    ? `${origin}/html/index.html`
    : `${origin}/html/index.html`;
  return path;
}

function mapAuthError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'Conta não confirmada. No Supabase, desative Confirm email ou rode supabase/06-auto-confirm-email.sql';
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
    return 'Senha inválida. Use pelo menos 4 caracteres.';
  }
  return error?.message || 'Erro de autenticação.';
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
  if (!client) {
    throw new Error('Supabase não configurado. Verifique js/config.js');
  }
  return client;
}

async function initStorage() {
  const sb = window.spaSupabase;
  if (!sb) return;

  const { data: sessionData } = await sb.auth.getSession();
  _sessionUserId = sessionData.session?.user?.id || null;

  await Promise.all([refreshUsersCache(), loadGlobalState()]);

  if (_sessionUserId) {
    await reloadCurrentUser();
  }
}

async function refreshUsersCache() {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('*');
  if (error) {
    console.error('[storage] refreshUsersCache', error);
    return;
  }
  _usersCache = (data || []).map(profileRowToUser);
}

async function reloadCurrentUser() {
  if (!_sessionUserId) {
    _currentUser = null;
    return null;
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', _sessionUserId)
    .maybeSingle();
  if (error) {
    console.error('[storage] reloadCurrentUser', error);
    return null;
  }
  _currentUser = profileRowToUser(data);
  if (_currentUser) {
    const idx = _usersCache.findIndex((u) => u.id === _currentUser.id);
    if (idx >= 0) _usersCache[idx] = _currentUser;
    else _usersCache.push(_currentUser);
  }
  return _currentUser;
}

async function loadGlobalState() {
  const sb = getSupabase();
  const { data, error } = await sb.from('global_state').select('data').eq('id', 1).maybeSingle();
  if (error || !data?.data) {
    _globalState = defaultGlobalState();
    return _globalState;
  }
  _globalState = data.data;
  if (_globalState.boss?.name === 'Rei da Procrastinação') {
    _globalState.boss.name = 'Boss Otanos';
    await persistGlobalState();
  }
  ensureGlobalVault(_globalState);
  return _globalState;
}

async function persistGlobalState() {
  const sb = getSupabase();
  const { error } = await sb.from('global_state').update({ data: _globalState }).eq('id', 1);
  if (error) console.error('[storage] persistGlobalState', error);
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
  if (sb) await sb.auth.signOut();
  _sessionUserId = null;
  _currentUser = null;
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

  persistUserPatch(userId, patch);
  return updated;
}

async function persistUserPatch(userId, patch) {
  const sb = getSupabase();
  const dbPatch = userPatchToDb(patch);
  if (!Object.keys(dbPatch).length) return;
  const { error } = await sb.from('profiles').update(dbPatch).eq('id', userId);
  if (error) console.error('[storage] persistUserPatch', error);
}

async function createUser({ username, password }) {
  const sb = getSupabase();
  const normalized = username.trim();

  const { data: existing } = await sb
    .from('profiles')
    .select('id')
    .ilike('username', normalized)
    .maybeSingle();
  if (existing) return { error: 'Usuário já existe.' };

  const email = usernameToEmail(normalized);
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { username: normalized },
      emailRedirectTo: authRedirectUrl(),
    },
  });

  if (error) return { error: mapAuthError(error) };
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
  persistGlobalState();
}

async function findUserByCredentials(username, password) {
  const result = await signInWithUsername(username, password);
  if (result.error) return { error: result.error };
  return { user: result.user };
}

window.storageReady = initStorage();
