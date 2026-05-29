/**
 * XP, níveis e ranks — S.P.A. Quest
 */
const RANKS = [
  { id: 'ferro', name: 'Ferro', minLevel: 1 },
  { id: 'bronze', name: 'Bronze', minLevel: 5 },
  { id: 'prata', name: 'Prata', minLevel: 10 },
  { id: 'ouro', name: 'Ouro', minLevel: 20 },
  { id: 'platina', name: 'Platina', minLevel: 35 },
  { id: 'ascendente', name: 'Ascendente', minLevel: 50 },
  { id: 'imortal', name: 'Imortal', minLevel: 75 },
];

const XP_PER_LEVEL_BASE = 100;

function xpForLevel(level) {
  return XP_PER_LEVEL_BASE * level;
}

function totalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpForLevel(i);
  return total;
}

function getLevelFromXp(xp) {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpInLevel: remaining, xpNeeded: xpForLevel(level) };
}

function getRank(level) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
  }
  return rank;
}

function defaultTaskXp(difficulty) {
  const map = { facil: 25, medio: 50, dificil: 100 };
  return map[difficulty] || 50;
}
