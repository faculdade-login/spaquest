/**
 * Missões de saúde diárias (reset diário)
 */
const MANDATORY_HEALTH = [
  {
    id: 'agua',
    title: 'Beber água',
    hint: 'Hidrate o corpo',
    emoji: '💧',
    xp: 20,
    difficulty: 'facil',
  },
  {
    id: 'ideias',
    title: 'Trazer novas ideias',
    hint: 'Anote 3 insights do dia',
    emoji: '💡',
    xp: 25,
    difficulty: 'facil',
  },
  {
    id: 'podcast',
    title: 'Podcast de investimento',
    hint: 'Ouça pelo menos 15 min',
    emoji: '🎧',
    xp: 30,
    difficulty: 'facil',
  },
  {
    id: 'pausa',
    title: 'Pausa da tela',
    hint: '5 min longe do celular',
    emoji: '👀',
    xp: 15,
    difficulty: 'facil',
  },
];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ensureHealthDaily(user) {
  const key = todayKey();
  if (!user.healthDaily || user.healthDaily.dayKey !== key) {
    return { dayKey: key, doneIds: [] };
  }
  return user.healthDaily;
}

function isHealthMissionDone(user, healthId) {
  const daily = ensureHealthDaily(user);
  return daily.doneIds.includes(healthId);
}

function renderMandatoryHealth(user, userId) {
  const container = document.getElementById('health-missions');
  if (!container) return;

  const daily = ensureHealthDaily(user);
  const doneCount = MANDATORY_HEALTH.filter((h) => daily.doneIds.includes(h.id)).length;
  const allDone = doneCount === MANDATORY_HEALTH.length;

  const progressEl = document.getElementById('health-progress');
  if (progressEl) {
    progressEl.textContent = `${doneCount}/${MANDATORY_HEALTH.length}`;
    progressEl.classList.toggle('complete', allDone);
  }

  container.innerHTML = MANDATORY_HEALTH.map((h) => {
    const done = daily.doneIds.includes(h.id);
    return `
      <label class="health-card ${done ? 'done' : ''}" title="${escapeHtml(h.hint)}">
        <input type="checkbox" class="health-card-input" data-health-id="${h.id}" ${done ? 'checked disabled' : ''} />
        ${done ? '<span class="health-card-badge">✓</span>' : ''}
        <span class="health-card-emoji" aria-hidden="true">${h.emoji}</span>
        <span class="health-card-title">${escapeHtml(h.title)}</span>
        <span class="health-card-hint">${escapeHtml(h.hint)}</span>
        <span class="health-card-xp">+${h.xp} XP</span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('[data-health-id]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) completeHealthMission(userId, input.dataset.healthId);
    });
  });
}

function completeHealthMission(userId, healthId) {
  const user = getCurrentUser();
  const mission = MANDATORY_HEALTH.find((h) => h.id === healthId);
  if (!user || !mission) return;

  let daily = ensureHealthDaily(user);
  if (daily.doneIds.includes(healthId)) return;

  daily = {
    ...daily,
    doneIds: [...daily.doneIds, healthId],
  };

  const task = {
    id: `health-${healthId}`,
    title: mission.title,
    type: 'saude',
    difficulty: mission.difficulty,
    xpReward: mission.xp,
    mandatory: true,
  };

  let baseXp = applyClassXpBonus(mission.xp, task, user.character);
  finishTaskRewards(userId, user, task, baseXp, { healthDaily: daily });
}
