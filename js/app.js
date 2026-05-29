/**
 * Utilitários compartilhados — S.P.A. Quest
 */
function requireAuth(redirectTo = '../html/index.html') {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const el = document.createElement('d' + 'iv');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const CLASSES = [
  { id: 'guerreiro', name: 'Guerreiro', icon: '⚔️', bonus: '+10% XP em tarefas difíceis' },
  { id: 'mago', name: 'Mago', icon: '🔮', bonus: '+10% XP em estudo' },
  { id: 'arqueiro', name: 'Arqueiro', icon: '🏹', bonus: 'Streak +5% moedas' },
  { id: 'clerigo', name: 'Clérigo', icon: '✨', bonus: 'Missões de saúde +20% XP' },
  { id: 'ladino', name: 'Ladino', icon: '🗡️', bonus: 'Loot extra (em breve)' },
  { id: 'paladino', name: 'Paladino', icon: '🛡️', bonus: 'Cofre da guilda +5%' },
];

function getClassById(id) {
  return CLASSES.find((c) => c.id === id) || CLASSES[0];
}

function applyClassXpBonus(baseXp, task, character) {
  if (!character?.classId) return baseXp;
  let xp = baseXp;
  if (character.classId === 'guerreiro' && task.difficulty === 'dificil') xp *= 1.1;
  if (character.classId === 'mago' && task.type === 'estudo') xp *= 1.1;
  if (character.classId === 'clerigo' && task.type === 'saude') xp *= 1.2;
  return Math.round(xp);
}

function getHeaderUserLabel(user) {
  if (user?.character?.name && user.character?.classIcon) {
    return `${user.character.classIcon} ${user.character.name}`;
  }
  if (user?.username) return user.username;
  return 'Perfil';
}

function renderUserHeader(user) {
  const nameEl = document.getElementById('header-user');
  if (!nameEl) return;
  const label = getHeaderUserLabel(user);
  nameEl.textContent = label;
  document.documentElement.dataset.headerUser = label;
}
