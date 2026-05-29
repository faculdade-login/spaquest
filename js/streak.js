/**
 * Streak seg–sex — S.P.A. Quest
 */
const STREAK_TIERS = [
  { days: 100, id: 'lendario', label: 'Lendário', emoji: '👑' },
  { days: 30, id: 'ouro', label: 'Combo Ouro', emoji: '🥇' },
  { days: 7, id: 'prata', label: 'Combo Prata', emoji: '🥈' },
  { days: 3, id: 'bronze', label: 'Combo Bronze', emoji: '🥉' },
];

function isWeekday(date = new Date()) {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

function weekdayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function prevWeekdayKey(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - 1);
  while (!isWeekday(d)) {
    d.setDate(d.getDate() - 1);
  }
  return weekdayKey(d);
}

function getStreakTier(streakDays) {
  for (const t of STREAK_TIERS) {
    if (streakDays >= t.days) return t;
  }
  return { days: 0, id: 'none', label: 'Sem combo', emoji: '🔥' };
}

function getWeekdayLabels() {
  return ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
}

function getCurrentWeekWeekdays() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      key: weekdayKey(d),
      label: getWeekdayLabels()[i],
      isToday: weekdayKey(d) === weekdayKey(now),
    });
  }
  return days;
}

/**
 * Registra atividade em dia útil e atualiza streak.
 */
function registerWeekdayActivity(streakState) {
  const today = new Date();
  if (!isWeekday(today)) {
    return { ...streakState, message: 'Streak conta apenas de segunda a sexta.' };
  }

  const todayKey = weekdayKey(today);
  const completed = new Set(streakState.weekdaysCompleted || []);

  if (completed.has(todayKey)) {
    return streakState;
  }

  completed.add(todayKey);
  const prevKey = prevWeekdayKey(today);
  let current = streakState.currentStreak || 0;

  if (streakState.lastWeekdayKey === prevKey || streakState.lastWeekdayKey === null) {
    current += 1;
  } else if (streakState.lastWeekdayKey !== todayKey) {
    current = 1;
  }

  const best = Math.max(streakState.bestStreak || 0, current);

  return {
    weekdaysCompleted: [...completed],
    currentStreak: current,
    bestStreak: best,
    lastWeekdayKey: todayKey,
  };
}

/**
 * Restaura combo: preenche dias úteis da semana até hoje e recupera o streak.
 */
function restoreUserStreak(streakState) {
  const today = new Date();
  if (!isWeekday(today)) {
    return { ...streakState, restored: false, message: 'Streak só em dias úteis (seg–sex).' };
  }

  const todayK = weekdayKey(today);
  const completed = new Set(streakState.weekdaysCompleted || []);
  const weekDays = getCurrentWeekWeekdays();

  for (const d of weekDays) {
    if (d.key <= todayK) completed.add(d.key);
  }

  const daysThisWeek = weekDays.filter((d) => completed.has(d.key)).length;
  const restoredStreak = Math.max(
    streakState.bestStreak || 0,
    streakState.currentStreak || 0,
    daysThisWeek
  );

  return {
    weekdaysCompleted: [...completed],
    currentStreak: restoredStreak,
    bestStreak: Math.max(streakState.bestStreak || 0, restoredStreak),
    lastWeekdayKey: todayK,
    restored: true,
  };
}
