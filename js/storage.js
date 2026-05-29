/**
 * Persistência local — S.P.A. Quest
 */
const STORAGE_KEYS = {
  USERS: 'spa_quest_users',
  SESSION: 'spa_quest_session',
  GLOBAL: 'spa_quest_global',
};

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || 'null');
  } catch {
    return null;
  }
}

function setSession(userId) {
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ userId }));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
}

function getCurrentUser() {
  const session = getSession();
  if (!session?.userId) return null;
  return getUsers().find((u) => u.id === session.userId) || null;
}

function updateUser(userId, patch) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...patch, updatedAt: Date.now() };
  saveUsers(users);
  return users[idx];
}

function createUser({ username, password }) {
  const users = getUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { error: 'Usuário já existe.' };
  }
  const user = {
    id: crypto.randomUUID(),
    username,
    password,
    createdAt: Date.now(),
    character: null,
    courses: [],
    tasks: [],
    xp: 0,
    level: 1,
    coins: 0,
    streak: {
      weekdaysCompleted: [],
      currentStreak: 0,
      bestStreak: 0,
      lastWeekdayKey: null,
    },
    taskCompletionsByDay: {},
    phase2: defaultUserPhase2(),
    healthDaily: { dayKey: todayKeyStorage(), doneIds: [] },
    courseStudyDaily: { dayKey: todayKeyStorage(), studied: {} },
  };
  users.push(user);
  saveUsers(users);
  return { user };
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
  if (!user.phase2) {
    return defaultUserPhase2();
  }
  return user.phase2;
}

function getGlobalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GLOBAL);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.boss?.name === 'Rei da Procrastinação') {
        state.boss.name = 'Boss Otanos';
        saveGlobalState(state);
      }
      ensureGlobalVault(state);
      return state;
    }
  } catch {
    /* ignore */
  }
  return defaultGlobalState();
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
  localStorage.setItem(STORAGE_KEYS.GLOBAL, JSON.stringify(state));
}

function findUserByCredentials(username, password) {
  return getUsers().find(
    (u) =>
      u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
}
