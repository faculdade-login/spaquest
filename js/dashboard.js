/**
 * Dashboard — status geral — S.P.A. Quest
 */
document.addEventListener('DOMContentLoaded', async () => {
  await window.storageReady;
  let user = requireAuth();
  if (!user) return;

  if (typeof migrateAndSyncUser === 'function') {
    user = migrateAndSyncUser(user) || user;
  }

  if (!user.character?.name) {
    window.location.href = 'profile.html';
    return;
  }

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await clearSession();
    window.location.href = 'index.html';
  });

  renderUserHeader(user);
  initCoursesStudyCheckboxDelegation();
  refreshDashboardStats();
  renderMandatoryHealth(user, user.id);
  renderCoursesStudyStatus(user, user.id);

  renderRankingTable('ranking-table', user.id);
});

/** Um listener no container — checkboxes são recriados a cada render. */
function initCoursesStudyCheckboxDelegation() {
  const list = document.getElementById('courses-study-list');
  if (!list || list.dataset.delegationBound === '1') return;
  list.dataset.delegationBound = '1';
  list.addEventListener('change', (e) => {
    const input = e.target;
    if (
      !(input instanceof HTMLInputElement) ||
      !input.classList.contains('task-checkbox') ||
      !input.dataset.courseId ||
      !input.dataset.activityId ||
      !input.checked
    ) {
      return;
    }
    const session = getSession();
    if (!session?.userId || typeof completeCourseActivity !== 'function') return;
    completeCourseActivity(session.userId, input.dataset.courseId, input.dataset.activityId);
  });
}

function ensureCourseStudyDaily(user) {
  const key = typeof todayKey === 'function' ? todayKey() : todayKeyStorage();
  if (!user.courseStudyDaily || user.courseStudyDaily.dayKey !== key) {
    return { dayKey: key, studied: {} };
  }
  return user.courseStudyDaily;
}

function getCourseStudiedToday(user, courseId) {
  const daily = ensureCourseStudyDaily(user);
  return daily.studied[courseId] === true;
}

function setCourseStudiedToday(userId, courseId, studied) {
  let user = getCurrentUser();
  if (!user) return;
  const daily = ensureCourseStudyDaily(user);
  daily.studied[courseId] = studied;
  user = updateUser(userId, { courseStudyDaily: daily });
  renderCoursesStudyStatus(user, userId);
  refreshDashboardStats();
}

function renderCoursesStudyStatus(user, userId) {
  const list = document.getElementById('courses-study-list');
  const summary = document.getElementById('courses-study-summary');
  if (!list) return;

  const courses = user.courses || [];
  const daily = ensureCourseStudyDaily(user);
  if (user.courseStudyDaily?.dayKey !== daily.dayKey && userId) {
    user = updateUser(userId, { courseStudyDaily: daily }) || user;
  }

  if (!courses.length) {
    list.innerHTML =
      '<p class="muted courses-study-empty">Nenhum curso ainda. Crie cursos e atividades no perfil.</p>';
    if (summary) summary.textContent = '0/0';
    return;
  }

  const studiedYes = courses.filter((c) => daily.studied[c.id] === true).length;
  if (summary) summary.textContent = `${studiedYes}/${courses.length}`;

  list.innerHTML = courses
    .map((course) => {
      const activities = course.activities || [];
      const doneCount = activities.filter((a) => a.done).length;
      const studied = daily.studied[course.id] === true;
      const studiedNo = daily.studied[course.id] === false;

      const activityRows =
        activities.length && typeof activityCheckboxRow === 'function'
          ? activities.map((a) => activityCheckboxRow(course.id, a)).join('')
          : activities.length
            ? '<p class="muted">Sem atividades cadastradas</p>'
            : '<p class="muted course-empty">Nenhuma atividade neste curso.</p>';

      return `
        <article class="course-study-card ${studied ? 'studied-yes' : studiedNo ? 'studied-no' : ''}">
          <header class="course-study-head">
            <div>
              <h3>${escapeHtml(course.name)}</h3>
              <p class="muted course-study-meta">${doneCount}/${activities.length} atividades concluídas</p>
            </div>
            <div class="course-study-today">
              <span class="course-study-today-label">Estudou hoje?</span>
              <div class="course-study-toggle" role="group" aria-label="Estudou ${escapeHtml(course.name)} hoje">
                <button type="button" class="btn-study ${studied ? 'active yes' : ''}" data-study-yes="${course.id}">Sim</button>
                <button type="button" class="btn-study ${studiedNo ? 'active no' : ''}" data-study-no="${course.id}">Não</button>
              </div>
            </div>
          </header>
          <p class="muted course-study-list-label">Atividades — marque ao concluir:</p>
          <div class="course-activities course-study-checkboxes">${activityRows}</div>
        </article>`;
    })
    .join('');

  list.querySelectorAll('[data-study-yes]').forEach((btn) => {
    btn.addEventListener('click', () => setCourseStudiedToday(userId, btn.dataset.studyYes, true));
  });
  list.querySelectorAll('[data-study-no]').forEach((btn) => {
    btn.addEventListener('click', () => setCourseStudiedToday(userId, btn.dataset.studyNo, false));
  });
}

function refreshDashboardStats() {
  const user = getCurrentUser();
  if (!user) return;

  const { level, xpInLevel, xpNeeded } = getLevelFromXp(user.xp || 0);
  const rank = getRank(level);
  const streak = user.streak || {};
  const tier = getStreakTier(streak.currentStreak || 0);
  const weekDays = getCurrentWeekWeekdays();
  const completed = new Set(streak.weekdaysCompleted || []);

  const allActivities = (user.courses || []).flatMap((c) => c.activities || []);
  const pending = allActivities.filter((a) => !a.done).length;
  const done = allActivities.filter((a) => a.done).length;

  setText('stat-xp', (user.xp || 0).toLocaleString('pt-BR'));
  setText('stat-level', level);
  setText('stat-coins', (user.coins || 0).toLocaleString('pt-BR'));
  setText('stat-streak', streak.currentStreak || 0);
  setText('stat-tasks-pending', pending);
  setText('stat-tasks-done', done);
  setText('stat-courses', (user.courses || []).length);

  const rankEl = document.getElementById('rank-badge');
  if (rankEl) {
    rankEl.textContent = rank.name;
    rankEl.className = `rank-badge rank-${rank.id}`;
  }

  const xpFill = document.getElementById('xp-fill');
  const xpMeta = document.getElementById('xp-meta');
  if (xpFill) xpFill.style.width = `${Math.min(100, (xpInLevel / xpNeeded) * 100)}%`;
  if (xpMeta) xpMeta.textContent = `${xpInLevel} / ${xpNeeded} XP para nível ${level + 1}`;

  const streakTierEl = document.getElementById('streak-tier');
  const streakFlame = document.getElementById('streak-flame');
  if (streakTierEl) {
    streakTierEl.textContent = tier.label;
    streakTierEl.className = `streak-tier ${tier.id === 'none' ? '' : tier.id}`;
  }
  if (streakFlame) streakFlame.textContent = tier.emoji;

  const weekdaysEl = document.getElementById('weekdays-dots');
  if (weekdaysEl) {
    weekdaysEl.innerHTML = weekDays
      .map(
        (d) =>
          `<span class="weekday-dot ${completed.has(d.key) ? 'done' : ''} ${d.isToday ? 'today' : ''}" title="${d.key}">${d.label}</span>`
      )
      .join('');
  }

  const charCard = document.getElementById('character-card');
  if (charCard && user.character) {
    charCard.innerHTML = `
      <p class="char-avatar">${user.character.classIcon}</p>
      <h3>${escapeHtml(user.character.name)}</h3>
      <p class="muted">${escapeHtml(user.character.className)}</p>
      <p class="muted char-email">${escapeHtml(user.username.includes('@') ? user.username : '@' + user.username)}</p>
    `;
  }

  renderRecentTasks(user);
  renderRankingTable('ranking-table', user.id);

  const session = getSession();
  if (session?.userId) {
    renderMandatoryHealth(user, session.userId);
    renderCoursesStudyStatus(user, session.userId);
  }

  if (typeof renderEnergyBars === 'function') renderEnergyBars(user);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderRecentTasks(user) {
  const list = document.getElementById('recent-tasks');
  if (!list) return;

  const recent = (user.courses || [])
    .flatMap((c) => (c.activities || []).map((a) => ({ ...a, courseName: c.name })))
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 5);

  if (!recent.length) {
    list.innerHTML = '<p class="muted">Complete tarefas no perfil para ver o histórico.</p>';
    return;
  }

  list.innerHTML = recent
    .map(
      (t) => `
    <section class="list-item done">
      <p class="task-title">${escapeHtml(t.title)}</p>
      <span class="tag">+${t.xpReward} XP</span>
    </section>
  `
    )
    .join('');
}
