/**
 * Perfil: personagem, cursos, atividades e saúde — S.P.A. Quest
 */
let selectedClassId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('character-form')) return;

  let user = requireAuth();
  if (!user) return;

  user = migrateAndSyncUser(user);

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });

  renderUserHeader(user);
  initClassPicker();
  loadCharacterForm(user);
  renderCoursesWithActivities(user);
  bindCourseForm(user.id);
  bindTaskForm(user.id);

  document.getElementById('character-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCharacter(user.id);
  });

  const taskType = document.getElementById('task-type');
  taskType?.addEventListener('change', () => updateTaskFormForType(taskType.value));
  updateTaskFormForType(taskType?.value || 'estudo');
});

function migrateAndSyncUser(user) {
  let courses = [...(user.courses || [])].map((c) => ({
    ...c,
    activities: c.activities || [],
  }));

  const healthDaily = ensureHealthDaily(user);
  const courseStudyDaily =
    typeof ensureCourseStudyDaily === 'function'
      ? ensureCourseStudyDaily(user)
      : user.courseStudyDaily || { dayKey: todayKey(), studied: {} };
  const patch = { healthDaily, courseStudyDaily };
  let changed =
    !user.healthDaily ||
    user.healthDaily.dayKey !== healthDaily.dayKey ||
    !user.courseStudyDaily ||
    user.courseStudyDaily.dayKey !== courseStudyDaily.dayKey;

  const orphanTasks = user.tasks || [];
  if (orphanTasks.length > 0) {
    for (const t of orphanTasks) {
      if (t.type === 'saude' && t.mandatory) continue;
      if (t.courseId) {
        const course = courses.find((c) => c.id === t.courseId);
        if (course) course.activities.push(migrateTaskToActivity(t));
      }
    }
    patch.courses = courses;
    patch.tasks = [];
    changed = true;
  }

  if (changed) {
    return updateUser(user.id, patch) || { ...user, ...patch };
  }
  return getCurrentUser() || user;
}

function migrateTaskToActivity(t) {
  return {
    id: t.id,
    title: t.title,
    difficulty: t.difficulty || 'medio',
    type: t.type || 'estudo',
    xpReward: t.xpReward || 50,
    done: !!t.done,
    completedAt: t.completedAt || null,
    createdAt: t.createdAt || Date.now(),
  };
}

function initClassPicker() {
  const grid = document.getElementById('class-grid');
  if (!grid) return;

  grid.innerHTML = CLASSES.map(
    (c) => `
    <button type="button" class="class-option" data-class="${c.id}" title="${escapeHtml(c.bonus)}">
      <span class="icon">${c.icon}</span>
      <strong>${escapeHtml(c.name)}</strong>
      <p class="muted" style="font-size:0.7rem;margin-top:0.25rem">${escapeHtml(c.bonus)}</p>
    </button>
  `
  ).join('');

  grid.querySelectorAll('.class-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.class-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedClassId = btn.dataset.class;
    });
  });
}

function loadCharacterForm(user) {
  if (!user.character) return;
  selectedClassId = user.character.classId;
  document.getElementById('char-name').value = user.character.name;
  document.querySelector(`.class-option[data-class="${selectedClassId}"]`)?.classList.add('selected');
}

function saveCharacter(userId) {
  const name = document.getElementById('char-name').value.trim();
  if (!selectedClassId) {
    showToast('Escolha uma classe.', true);
    return;
  }
  if (name.length < 2) {
    showToast('Nome do personagem muito curto.', true);
    return;
  }
  const cls = getClassById(selectedClassId);
  updateUser(userId, {
    character: {
      name,
      classId: cls.id,
      className: cls.name,
      classIcon: cls.icon,
    },
  });
  showToast('Personagem salvo!');
}

function bindCourseForm(userId) {
  document.getElementById('course-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('course-name').value.trim();
    if (!name) return;

    const user = getCurrentUser();
    const courses = [
      ...(user.courses || []),
      { id: crypto.randomUUID(), name, createdAt: Date.now(), activities: [] },
    ];
    updateUser(userId, { courses });
    document.getElementById('course-form').reset();
    refreshProfileUI(userId);
    showToast('Curso adicionado!');
  });
}

function updateTaskFormForType(type) {
  const courseGroup = document.getElementById('task-course-group');
  const courseSelect = document.getElementById('task-course');
  const hint = document.getElementById('task-course-hint');
  if (!courseGroup || !courseSelect) return;

  if (type === 'estudo') {
    courseGroup.classList.remove('hidden');
    courseSelect.required = true;
    if (hint) hint.textContent = 'Atividades de estudo devem pertencer a um curso.';
  } else if (type === 'saude') {
    courseGroup.classList.add('hidden');
    courseSelect.required = false;
    courseSelect.value = '';
    if (hint) hint.textContent = 'Use as missões obrigatórias acima para hábitos de saúde.';
  } else {
    courseGroup.classList.remove('hidden');
    courseSelect.required = false;
    if (hint) hint.textContent = 'Opcional: vincule a um curso.';
  }
}

function bindTaskForm(userId) {
  document.getElementById('task-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const courseId = document.getElementById('task-course').value || null;
    const difficulty = document.getElementById('task-difficulty').value;
    const type = document.getElementById('task-type').value;
    const xpReward = defaultTaskXp(difficulty);

    if (!title) {
      showToast('Digite o título da atividade.', true);
      return;
    }
    if (type === 'estudo' && !courseId) {
      showToast('Escolha um curso para atividades de estudo.', true);
      return;
    }
    if (type === 'saude') {
      showToast('Missões de saúde estão na seção obrigatória acima.', true);
      return;
    }
    if (!courseId) {
      showToast('Selecione um curso.', true);
      return;
    }

    const user = getCurrentUser();
    const activity = {
      id: crypto.randomUUID(),
      title,
      difficulty,
      type,
      xpReward,
      done: false,
      createdAt: Date.now(),
    };

    const courses = (user.courses || []).map((c) =>
      c.id === courseId ? { ...c, activities: [...(c.activities || []), activity] } : c
    );

    updateUser(userId, { courses });
    document.getElementById('task-form').reset();
    updateTaskFormForType('estudo');
    refreshProfileUI(userId);
    showToast('Atividade adicionada ao curso!');
  });
}

function renderCoursesWithActivities(user) {
  const list = document.getElementById('course-list');
  if (!list) return;

  const courses = user.courses || [];
  updateCourseSelect(user);

  if (!courses.length) {
    list.innerHTML = '<p class="empty muted">Nenhum curso ainda. Adicione um curso e crie atividades dentro dele.</p>';
    return;
  }

  list.innerHTML = courses
    .map((course) => {
      const activities = course.activities || [];
      const done = activities.filter((a) => a.done).length;
      const total = activities.length;
      const pct = total ? Math.round((done / total) * 100) : 0;

      const activityRows = activities.length
        ? activities
            .map((a) => activityCheckboxRow(course.id, a))
            .join('')
        : '<p class="muted course-empty">Nenhuma atividade neste curso.</p>';

      return `
        <article class="course-block" data-course-id="${course.id}">
          <header class="course-block-head">
            <div>
              <h3>📚 ${escapeHtml(course.name)}</h3>
              <p class="course-progress-label">${done}/${total} concluídas · ${pct}%</p>
            </div>
            <button type="button" class="btn btn-sm btn-danger" data-remove-course="${course.id}">Remover</button>
          </header>
          <div class="course-progress-bar">
            <div class="course-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="course-activities">${activityRows}</div>
        </article>
      `;
    })
    .join('');

  list.querySelectorAll('[data-remove-course]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.removeCourse;
      const u = getCurrentUser();
      const courses = (u.courses || []).filter((c) => c.id !== id);
      updateUser(user.id, { courses });
      refreshProfileUI(user.id);
      showToast('Curso removido.');
    });
  });

  bindActivityCheckboxes(user.id);
}

function activityCheckboxRow(courseId, activity) {
  const done = !!activity.done;
  return `
    <label class="task-check-row ${done ? 'done' : ''}">
      <input
        type="checkbox"
        class="task-checkbox"
        data-course-id="${courseId}"
        data-activity-id="${activity.id}"
        ${done ? 'checked disabled' : ''}
      />
      <span class="task-check-box" aria-hidden="true"></span>
      <span class="task-check-body">
        <span class="task-title">${escapeHtml(activity.title)}</span>
        <span class="task-meta">${activity.xpReward} XP · ${activity.difficulty} · ${activity.type}</span>
      </span>
      ${done ? '<span class="tag tag-done">✓</span>' : ''}
    </label>
  `;
}

function bindActivityCheckboxes(userId) {
  document.querySelectorAll('[data-course-id][data-activity-id]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) {
        completeCourseActivity(userId, input.dataset.courseId, input.dataset.activityId);
      }
    });
  });
}

function completeCourseActivity(userId, courseId, activityId) {
  const user = getCurrentUser();
  const course = (user.courses || []).find((c) => c.id === courseId);
  const activity = course?.activities?.find((a) => a.id === activityId);
  if (!activity || activity.done) return;

  const task = {
    id: activity.id,
    title: activity.title,
    courseId,
    type: activity.type || 'estudo',
    difficulty: activity.difficulty,
    xpReward: activity.xpReward,
  };

  let baseXp = applyClassXpBonus(activity.xpReward, task, user.character);

  const courses = (user.courses || []).map((c) => {
    if (c.id !== courseId) return c;
    return {
      ...c,
      activities: (c.activities || []).map((a) =>
        a.id === activityId ? { ...a, done: true, completedAt: Date.now() } : a
      ),
    };
  });

  finishTaskRewards(userId, user, task, baseXp, { courses });
}

function finishTaskRewards(userId, user, task, baseXp, extraPatch = {}) {
  let phase2Result = null;
  if (typeof processTaskCompletePhase2 === 'function') {
    phase2Result = processTaskCompletePhase2(user, task, baseXp);
  }

  let xpGain = phase2Result?.xpGain ?? baseXp;
  let phase2 = phase2Result?.phase2 ?? ensureUserPhase2(user);
  const taskCoins = Math.floor(xpGain / 5);
  let coins = phase2Result ? phase2Result.coins + taskCoins : (user.coins || 0) + taskCoins;

  if (user.character?.classId === 'arqueiro') {
    coins += Math.ceil(taskCoins * 0.05);
  }

  const newXp = (user.xp || 0) + xpGain;
  const { level: newLevel } = getLevelFromXp(newXp);
  const oldLevel = getLevelFromXp(user.xp || 0).level;
  const streak = registerWeekdayActivity(user.streak || {});

  updateUser(userId, {
    xp: newXp,
    level: newLevel,
    coins,
    streak,
    phase2,
    ...extraPatch,
  });

  let msg = `+${xpGain} XP!`;
  if (phase2Result?.energyMult < 1) msg += ' (energia baixa)';
  if (phase2Result?.bossDamage) msg += ` · -${phase2Result.bossDamage} HP no boss`;
  if (phase2Result?.loot) msg += ` · ${phase2Result.loot.emoji} ${phase2Result.loot.label}`;
  if (phase2Result?.vaultDistribution?.length) {
    const mine = phase2Result.vaultDistribution.find((r) => r.userId === userId);
    if (mine) {
      msg += ` · Cofre: +${mine.coins}🪙`;
      if (mine.loot) msg += ` ${mine.loot.emoji}`;
    }
  }
  if (newLevel > oldLevel) msg += ` Nível ${newLevel}!`;
  if (streak.currentStreak) {
    const tier = getStreakTier(streak.currentStreak);
    if (tier.id !== 'none') msg += ` ${tier.emoji} ${tier.label}!`;
  }
  if (task.type === 'saude') msg = `Saúde ✓ ${msg}`;
  showToast(msg);

  refreshProfileUI(userId);
  if (typeof refreshDashboardStats === 'function') refreshDashboardStats();
  else {
    const u = getCurrentUser();
    if (u && typeof renderCoursesStudyStatus === 'function') {
      renderCoursesStudyStatus(u, userId);
    }
  }
  if (typeof renderPhase2Page === 'function') renderPhase2Page();
}

function refreshProfileUI(userId) {
  const user = getCurrentUser();
  if (!user) return;
  renderCoursesWithActivities(user);
  updateCourseSelect(user);
}

function updateCourseSelect(user) {
  const select = document.getElementById('task-course');
  if (!select) return;
  const courses = user.courses || [];
  select.innerHTML =
    '<option value="">Selecione o curso</option>' +
    courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}
