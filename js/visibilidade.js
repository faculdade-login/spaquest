/**
 * Visibilidade geral — ranking por atividades concluídas
 */
document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth();
  if (!user) return;

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });

  renderUserHeader(user);
  renderVisibilityLeaderboard('visibility-leaderboard', user.id);
});

function renderVisibilityLeaderboard(containerId, currentUserId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const board = buildActivityVisibilityBoard();
  if (!board.length) {
    container.innerHTML =
      '<section class="card"><p class="muted">Nenhum personagem criado ainda. Crie seu personagem no perfil para aparecer aqui.</p></section>';
    return;
  }

  container.innerHTML = board.map((entry) => visibilityCardHtml(entry, currentUserId)).join('');
}

function visibilityCardHtml(entry, currentUserId) {
  const posClass = entry.position <= 3 ? `visibility-pos-${entry.position}` : '';
  const youClass = entry.userId === currentUserId ? 'visibility-card-you' : '';
  const medal =
    entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `#${entry.position}`;

  const recentHtml = entry.recent.length
    ? entry.recent
        .map(
          (a) => `
        <li class="visibility-activity">
          <span class="visibility-activity-title">${escapeHtmlRanking(a.title)}</span>
          <span class="visibility-activity-meta muted">${escapeHtmlRanking(a.courseName)} · ${formatVisibilityWhen(a.completedAt)}</span>
        </li>`
        )
        .join('')
    : '<li class="visibility-activity empty"><span class="muted">Nenhuma atividade concluída ainda</span></li>';

  return `
    <article class="visibility-card ${posClass} ${youClass}">
      <header class="visibility-card-head">
        <div class="visibility-rank" aria-label="Posição ${entry.position}">${medal}</div>
        <div class="visibility-identity">
          <p class="visibility-avatar">${entry.classIcon || '⚔️'}</p>
          <div>
            <h3>${escapeHtmlRanking(entry.name)}${entry.userId === currentUserId ? ' <span class="tag tag-you">Você</span>' : ''}</h3>
            <p class="muted">${escapeHtmlRanking(entry.className)} · Nv. ${entry.level} · <span class="rank-badge rank-${entry.rank.id}">${entry.rank.name}</span></p>
          </div>
        </div>
        <div class="visibility-score">
          <div class="visibility-score-value">${entry.totalDone}</div>
          <div class="visibility-score-label">atividades feitas</div>
          ${entry.totalPending > 0 ? `<p class="muted visibility-pending">${entry.totalPending} pendente${entry.totalPending === 1 ? '' : 's'}</p>` : ''}
        </div>
      </header>
      <div class="visibility-recent">
        <h4>Últimas atividades</h4>
        <ul class="visibility-activities">${recentHtml}</ul>
      </div>
    </article>`;
}

function formatVisibilityWhen(ts) {
  if (!ts) return 'sem data';
  if (typeof formatDate === 'function') return formatDate(ts);
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
