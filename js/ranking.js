/**
 * Ranking global (local) — S.P.A. Quest
 */
function buildLeaderboard(limit = 20) {
  const users = getUsers()
    .filter((u) => u.character?.name)
    .map((u) => {
      const { level } = getLevelFromXp(u.xp || 0);
      const rank = getRank(level);
      return {
        userId: u.id,
        username: u.username,
        name: u.character.name,
        className: u.character.className,
        classIcon: u.character.classIcon,
        xp: u.xp || 0,
        level,
        rank,
        streak: u.streak?.currentStreak || 0,
      };
    })
    .sort((a, b) => b.xp - a.xp);

  return users.slice(0, limit).map((entry, i) => ({ ...entry, position: i + 1 }));
}

function renderRankingTable(containerId, currentUserId) {
  const tbody = document.querySelector(`#${containerId} tbody`);
  if (!tbody) return;

  const board = buildLeaderboard();
  if (!board.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="muted">Nenhum aventureiro no ranking ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = board
    .map(
      (e) => `
    <tr class="${e.userId === currentUserId ? 'you' : ''}">
      <td class="pos">#${e.position}</td>
      <td>${e.classIcon || '⚔️'} ${escapeHtmlRanking(e.name)}</td>
      <td><span class="rank-badge rank-${e.rank.id}">${e.rank.name}</span></td>
      <td>Nv. ${e.level}</td>
      <td>${e.xp.toLocaleString('pt-BR')} XP</td>
    </tr>
  `
    )
    .join('');
}

function escapeHtmlRanking(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCompletedActivitiesForUser(user) {
  return (user.courses || [])
    .flatMap((c) =>
      (c.activities || [])
        .filter((a) => a.done)
        .map((a) => ({
          title: a.title,
          courseName: c.name,
          xpReward: a.xpReward || 0,
          completedAt: a.completedAt || 0,
        }))
    )
    .sort((a, b) => b.completedAt - a.completedAt);
}

function countPendingActivities(user) {
  return (user.courses || [])
    .flatMap((c) => c.activities || [])
    .filter((a) => !a.done).length;
}

/** Ranking por quantidade de atividades concluídas (mais → menos). */
function buildActivityVisibilityBoard(recentLimit = 5) {
  return getUsers()
    .filter((u) => u.character?.name)
    .map((u) => {
      const completed = getCompletedActivitiesForUser(u);
      const { level } = getLevelFromXp(u.xp || 0);
      const rank = getRank(level);
      return {
        userId: u.id,
        name: u.character.name,
        className: u.character.className,
        classIcon: u.character.classIcon,
        username: u.username,
        totalDone: completed.length,
        totalPending: countPendingActivities(u),
        recent: completed.slice(0, recentLimit),
        lastActivityAt: completed[0]?.completedAt || 0,
        level,
        rank,
        xp: u.xp || 0,
      };
    })
    .sort((a, b) => {
      if (b.totalDone !== a.totalDone) return b.totalDone - a.totalDone;
      if (b.lastActivityAt !== a.lastActivityAt) return b.lastActivityAt - a.lastActivityAt;
      return b.xp - a.xp;
    })
    .map((entry, i) => ({ ...entry, position: i + 1 }));
}
