/**
 * Preenche o nick no header antes do paint (evita pulo ao recarregar).
 */
(function initHeaderEarly() {
  try {
    const session = JSON.parse(localStorage.getItem('spa_quest_session') || 'null');
    if (!session?.userId) return;

    const users = JSON.parse(localStorage.getItem('spa_quest_users') || '[]');
    const user = users.find((u) => u.id === session.userId);
    if (!user) return;

    const label =
      user.character?.name && user.character?.classIcon
        ? `${user.character.classIcon} ${user.character.name}`
        : user.username || 'Perfil';

    document.documentElement.dataset.headerUser = label;
  } catch {
    /* ignore */
  }
})();
