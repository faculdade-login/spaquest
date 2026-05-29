/**
 * Guilda — Cofre, Loot, Boss, Energia, Boosters
 */
const BOSS_MAX_HP = 50000;

const LOOT_TABLE = [
  { id: 'coins', label: 'Moedas extras', emoji: '🪙', weight: 35 },
  { id: 'mystery', label: 'Caixa misteriosa', emoji: '📦', weight: 20 },
  { id: 'rare', label: 'Item raro', emoji: '💎', weight: 10 },
  { id: 'xp_boost', label: 'Booster de XP', emoji: '⚡', weight: 15 },
  { id: 'skin', label: 'Skin exclusiva', emoji: '🎨', weight: 10 },
  { id: 'title', label: 'Título lendário', emoji: '🏅', weight: 10 },
];

const BOOSTER_SHOP = [
  {
    id: 'focus',
    name: 'Potion of Focus',
    emoji: '🧪',
    desc: 'Próximas 2 tarefas: +50% XP',
    cost: 80,
    uses: 2,
    xpMult: 1.5,
    instant: true,
  },
  {
    id: 'energy',
    name: 'Elixir de Vigor',
    emoji: '💚',
    desc: 'Restaura mana, energia e stamina',
    cost: 50,
    restore: true,
    instant: true,
  },
  {
    id: 'streak',
    name: 'Elixir de Combo',
    emoji: '🔥',
    desc: 'Restaura seu streak (combo seg–sex)',
    cost: 120,
    streakRestore: true,
    instant: false,
  },
];

const VAULT_DISTRIBUTE_RATE = 0.12;
const VAULT_DISTRIBUTE_MIN = 40;

function calcBossDamage(task) {
  if (task.type === 'saude') return 100;
  if (task.difficulty === 'dificil') return 500;
  if (task.type === 'estudo') return Math.max(100, Math.min(500, task.xpReward * 2));
  return 200;
}

function getEnergyMultiplier(energy) {
  const min = Math.min(energy.mana, energy.energy, energy.stamina);
  if (min < 20) return 0.5;
  if (min < 40) return 0.75;
  return 1;
}

function drainEnergy(energy, amount = 12) {
  return {
    mana: Math.max(0, energy.mana - amount),
    energy: Math.max(0, energy.energy - amount),
    stamina: Math.max(0, energy.stamina - amount),
  };
}

function rollLoot() {
  const total = LOOT_TABLE.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of LOOT_TABLE) {
    r -= item.weight;
    if (r <= 0) return { ...item, at: Date.now() };
  }
  return { ...LOOT_TABLE[0], at: Date.now() };
}

function getVaultContributors() {
  return getUsers()
    .filter((u) => u.character?.name)
    .map((u) => ({
      userId: u.id,
      name: u.character.name,
      classIcon: u.character.classIcon || '⚔️',
      className: u.character.className,
      amount: ensureUserPhase2(u).vaultContributed || 0,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function pushVaultRewardToPhase2(phase2, entry) {
  const vaultRewards = [...(phase2.vaultRewards || [])];
  vaultRewards.unshift(entry);
  if (vaultRewards.length > 15) vaultRewards.length = 15;
  return { ...phase2, vaultRewards };
}

/**
 * Distribui moedas e loot do cofre proporcionalmente à contribuição.
 */
function distributeVaultRewards(global, reason) {
  const contributors = getVaultContributors();
  if (!contributors.length) return { global, recipients: [] };

  ensureGlobalVault(global);
  const totalContrib = contributors.reduce((s, c) => s + c.amount, 0);
  const pool = Math.max(
    VAULT_DISTRIBUTE_MIN,
    Math.min(global.vault.coins, Math.floor(global.vault.coins * VAULT_DISTRIBUTE_RATE) + 25)
  );

  const recipients = [];
  const users = getUsers();

  contributors.forEach((c, index) => {
    const user = users.find((u) => u.id === c.userId);
    if (!user) return;

    const share = c.amount / totalContrib;
    let coinsGrant = Math.max(5, Math.floor(pool * share));
    if (index === 0) coinsGrant += 25;
    else if (index < 3) coinsGrant += 10;

    let phase2 = ensureUserPhase2(user);
    let loot = null;
    let newCoins = (user.coins || 0) + coinsGrant;

    if (index === 0) {
      loot = rollLoot();
      const applied = applyLootToUser({ ...user, coins: newCoins, phase2 }, loot, 0);
      newCoins = applied.coins;
      phase2 = {
        ...phase2,
        boosters: applied.boosters,
        lootLog: applied.lootLog,
      };
    }

    phase2 = pushVaultRewardToPhase2(phase2, {
      at: Date.now(),
      reason,
      coins: coinsGrant,
      loot: loot ? { emoji: loot.emoji, label: loot.label, id: loot.id } : null,
      rank: index + 1,
    });

    updateUser(c.userId, {
      coins: newCoins,
      phase2,
    });

    recipients.push({
      userId: c.userId,
      name: c.name,
      classIcon: c.classIcon,
      coins: coinsGrant,
      loot,
      sharePct: Math.round(share * 100),
      rank: index + 1,
    });
  });

  global.vault.coins = Math.max(0, global.vault.coins - Math.floor(pool * 0.4));
  global.vault.lastDistributionAt = Date.now();
  global.vault.distributionHistory.unshift({
    at: Date.now(),
    reason,
    pool,
    recipients: recipients.map((r) => ({
      name: r.name,
      coins: r.coins,
      loot: r.loot ? { emoji: r.loot.emoji, label: r.loot.label } : null,
      sharePct: r.sharePct,
    })),
  });
  if (global.vault.distributionHistory.length > 8) {
    global.vault.distributionHistory.length = 8;
  }

  saveGlobalState(global);
  return { global, recipients };
}

function applyLootToUser(user, loot, xpGain) {
  let coins = user.coins || 0;
  let boosters = [...(user.phase2?.boosters || [])];
  const log = [...(user.phase2?.lootLog || [])];

  switch (loot.id) {
    case 'coins':
      coins += 15 + Math.floor(Math.random() * 20);
      break;
    case 'mystery':
      coins += 40;
      break;
    case 'rare':
      coins += 25;
      boosters.push({ id: crypto.randomUUID(), type: 'rare_badge', name: 'Emblema raro', emoji: '💎' });
      break;
    case 'xp_boost':
      boosters.push({
        id: crypto.randomUUID(),
        type: 'xp_boost',
        name: 'Surge de XP',
        usesLeft: 1,
        xpMult: 1.3,
      });
      break;
    case 'skin':
      boosters.push({ id: crypto.randomUUID(), type: 'skin', name: 'Skin Aurora', emoji: '🎨' });
      break;
    case 'title':
      boosters.push({ id: crypto.randomUUID(), type: 'title', name: 'Título: Focado', emoji: '🏅' });
      break;
    default:
      break;
  }

  log.unshift({ ...loot, xpGain });
  if (log.length > 12) log.length = 12;

  return { coins, boosters, lootLog: log };
}

function processTaskCompletePhase2(user, task, baseXp) {
  const global = getGlobalState();
  let phase2 = ensureUserPhase2(user);
  let xpGain = baseXp;
  let coins = user.coins || 0;

  const energyMult = getEnergyMultiplier(phase2.energy);
  xpGain = Math.round(xpGain * energyMult);

  if (phase2.activeBooster?.xpMult) {
    xpGain = Math.round(xpGain * phase2.activeBooster.xpMult);
    phase2.activeBooster.usesLeft -= 1;
    if (phase2.activeBooster.usesLeft <= 0) phase2.activeBooster = null;
  }

  phase2.energy = drainEnergy(phase2.energy);

  ensureGlobalVault(global);
  const prevVaultLevel = global.vault.level || 1;

  const damage = calcBossDamage(task);
  global.boss.hp = Math.max(0, global.boss.hp - damage);
  let vaultDistribution = null;
  if (global.boss.hp === 0) {
    global.boss.defeats += 1;
    global.boss.hp = BOSS_MAX_HP;
    global.vault.coins += 200;
    coins += 50;
    const dist = distributeVaultRewards(global, 'Boss derrotado');
    global = dist.global;
    vaultDistribution = dist.recipients;
  }

  const vaultAdd = Math.floor(xpGain / 8) + 5;
  global.vault.coins += vaultAdd;
  global.vault.level = 1 + Math.floor(global.vault.coins / 500);
  const lastDistLevel = global.vault.lastDistributedLevel || 0;
  if (global.vault.level > prevVaultLevel && global.vault.level > lastDistLevel) {
    const dist = distributeVaultRewards(global, `Cofre nível ${global.vault.level}`);
    global = dist.global;
    global.vault.lastDistributedLevel = global.vault.level;
    saveGlobalState(global);
    vaultDistribution = vaultDistribution || dist.recipients;
  }
  phase2.vaultContributed = (phase2.vaultContributed || 0) + vaultAdd;
  global.totalTasksGlobal += 1;

  let loot = null;
  if (Math.random() < 0.45) {
    loot = rollLoot();
    const applied = applyLootToUser({ ...user, coins, phase2 }, loot, xpGain);
    coins = applied.coins;
    phase2.boosters = applied.boosters;
    phase2.lootLog = applied.lootLog;
  }

  saveGlobalState(global);
  return {
    xpGain,
    coins,
    phase2,
    global,
    loot,
    energyMult,
    bossDamage: damage,
    vaultDistribution,
  };
}

function buyBooster(userId, boosterId) {
  const user = getCurrentUser();
  const item = BOOSTER_SHOP.find((b) => b.id === boosterId);
  if (!user || !item) return { error: 'Item inválido.' };
  if ((user.coins || 0) < item.cost) return { error: 'Moedas insuficientes.' };

  let phase2 = ensureUserPhase2(user);
  let coins = user.coins - item.cost;
  let streak = user.streak;

  if (item.restore) {
    phase2.energy = { mana: 100, energy: 100, stamina: 100 };
  } else if (item.streakRestore) {
    phase2.boosters = [
      ...(phase2.boosters || []),
      {
        id: crypto.randomUUID(),
        type: 'streak_restore',
        name: item.name,
        emoji: item.emoji,
        usable: true,
      },
    ];
  } else if (item.instant !== false) {
    phase2.activeBooster = {
      id: item.id,
      name: item.name,
      usesLeft: item.uses,
      xpMult: item.xpMult,
    };
  } else {
    phase2.boosters = [
      ...(phase2.boosters || []),
      {
        id: crypto.randomUUID(),
        type: item.id,
        name: item.name,
        emoji: item.emoji,
        usable: true,
        usesLeft: item.uses,
        xpMult: item.xpMult,
      },
    ];
  }

  const patch = { coins, phase2 };
  if (streak) patch.streak = streak;
  updateUser(userId, patch);
  return { success: true, phase2 };
}

function useInventoryBooster(userId, instanceId) {
  const user = getCurrentUser();
  if (!user || user.id !== userId) return { error: 'Sessão inválida.' };

  let phase2 = ensureUserPhase2(user);
  const items = phase2.boosters || [];
  const idx = items.findIndex((i) => i.id === instanceId);
  if (idx === -1) return { error: 'Item não encontrado.' };

  const item = items[idx];
  let streak = user.streak;
  let message = 'Item usado!';

  if (item.type === 'streak_restore') {
    if (typeof restoreUserStreak !== 'function') {
      return { error: 'Sistema de streak indisponível.' };
    }
    const result = restoreUserStreak(streak || {});
    if (!result.restored) return { error: result.message || 'Não foi possível restaurar.' };
    streak = result;
    message = `Combo restaurado! 🔥 ${result.currentStreak} dias`;
  } else if (item.type === 'xp_boost' && item.usesLeft) {
    phase2.activeBooster = {
      id: item.id,
      name: item.name,
      usesLeft: item.usesLeft,
      xpMult: item.xpMult || 1.3,
    };
    message = 'Booster de XP ativado!';
  } else {
    return { error: 'Este item é apenas colecionável.' };
  }

  const nextBoosters = items.filter((_, i) => i !== idx);
  phase2 = { ...phase2, boosters: nextBoosters };
  updateUser(userId, { phase2, streak });
  return { success: true, message, phase2, streak };
}

function renderPhase2Page() {
  const user = getCurrentUser();
  if (!user) return;

  const global = getGlobalState();
  const phase2 = ensureUserPhase2(user);
  if (!user.phase2) updateUser(user.id, { phase2 });

  renderUserHeader(user);

  const bossPct = (global.boss.hp / global.boss.maxHp) * 100;
  const bossHpEl = document.getElementById('boss-hp-fill');
  const bossMeta = document.getElementById('boss-meta');
  if (bossHpEl) bossHpEl.style.width = `${bossPct}%`;
  if (bossMeta) {
    bossMeta.textContent = `${global.boss.hp.toLocaleString('pt-BR')} / ${global.boss.maxHp.toLocaleString('pt-BR')} HP`;
  }

  const bossName = document.getElementById('boss-name');
  if (bossName) bossName.textContent = global.boss.name;

  ensureGlobalVault(global);
  setPhase2Text('vault-coins', global.vault.coins);
  setPhase2Text('vault-level', global.vault.level);
  setPhase2Text('vault-yours', phase2.vaultContributed || 0);
  setPhase2Text('boss-defeats', global.boss.defeats);

  renderVaultContributors(user.id);
  renderVaultDistributions(global, phase2);
  renderEnergyBars(user);

  const lootList = document.getElementById('loot-log');
  if (lootList) {
    const logs = phase2.lootLog || [];
    lootList.innerHTML = logs.length
      ? logs
          .map(
            (l) => `
        <div class="loot-item">
          <span>${l.emoji} ${escapeHtml(l.label)}</span>
          <span class="muted">${new Date(l.at).toLocaleDateString('pt-BR')}</span>
        </div>`
          )
          .join('')
      : '<p class="muted empty-loot">Complete tarefas para ganhar loot aleatório!</p>';
  }

  const boosterActive = document.getElementById('booster-active');
  if (boosterActive) {
    boosterActive.innerHTML = phase2.activeBooster
      ? `<span class="tag">${escapeHtml(phase2.activeBooster.name)} · ${phase2.activeBooster.usesLeft} uso(s)</span>`
      : '<span class="muted">Nenhum booster ativo</span>';
  }

  const shop = document.getElementById('booster-shop');
  if (shop) {
    shop.innerHTML = BOOSTER_SHOP.map(
      (b) => `
      <div class="booster-card">
        <span class="booster-emoji">${b.emoji}</span>
        <div>
          <strong>${escapeHtml(b.name)}</strong>
          <p class="muted">${escapeHtml(b.desc)}</p>
        </div>
        <button type="button" class="btn btn-success btn-sm" data-buy-booster="${b.id}">
          ${b.cost} 🪙
        </button>
      </div>
    `
    ).join('');

    shop.querySelectorAll('[data-buy-booster]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = buyBooster(user.id, btn.dataset.buyBooster);
        if (res.error) showToast(res.error, true);
        else {
          showToast('Comprado!');
          renderPhase2Page();
        }
      });
    });
  }

  const inventory = document.getElementById('booster-inventory');
  if (inventory) {
    const items = phase2.boosters || [];
    inventory.innerHTML = items.length
      ? items
          .map((i) => {
            const usable =
              i.usable ||
              i.type === 'streak_restore' ||
              (i.type === 'xp_boost' && i.usesLeft);
            return `
        <div class="inventory-item ${usable ? 'usable' : ''}">
          <span>${i.emoji || '✨'} ${escapeHtml(i.name)}</span>
          ${
            usable
              ? `<button type="button" class="btn btn-sm btn-success" data-use-booster="${i.id}">Usar</button>`
              : '<span class="tag tag-collect">Colecionável</span>'
          }
        </div>`;
          })
          .join('')
      : '<span class="muted">Inventário vazio</span>';

    inventory.querySelectorAll('[data-use-booster]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = useInventoryBooster(user.id, btn.dataset.useBooster);
        if (res.error) showToast(res.error, true);
        else {
          showToast(res.message || 'Usado!');
          renderPhase2Page();
        }
      });
    });
  }
}

function renderVaultContributors(currentUserId) {
  const list = document.getElementById('vault-contributors-list');
  const totalEl = document.getElementById('vault-contrib-total');
  if (!list) return;

  const contributors = getVaultContributors();
  const total = contributors.reduce((s, c) => s + c.amount, 0);

  if (totalEl) {
    totalEl.textContent = total
      ? `🪙 ${total.toLocaleString('pt-BR')} moedas depositadas pelo time no cofre`
      : '🪙 Ninguém depositou no cofre ainda — complete missões para começar';
  }

  if (!contributors.length) {
    list.innerHTML = '<p class="muted">Complete tarefas para aparecer no ranking do cofre.</p>';
    return;
  }

  list.innerHTML = contributors
    .map((c, i) => {
      const pct = total ? Math.round((c.amount / total) * 100) : 0;
      const isYou = c.userId === currentUserId;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      return `
      <div class="vault-contributor-row ${isYou ? 'you' : ''}">
        <span class="vault-contrib-pos">${medal}</span>
        <span class="vault-contrib-icon">${c.classIcon}</span>
        <div class="vault-contrib-info">
          <strong>${escapeHtml(c.name)}${isYou ? ' <span class="tag tag-you">Você</span>' : ''}</strong>
          <div class="vault-contrib-bar-wrap">
            <div class="vault-contrib-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="vault-contrib-amount">
          <strong>🪙 ${c.amount.toLocaleString('pt-BR')}</strong>
          <span class="muted">${pct}%</span>
        </div>
      </div>`;
    })
    .join('');
}

function renderVaultDistributions(global, phase2) {
  const historyEl = document.getElementById('vault-distribution-history');
  const mineEl = document.getElementById('vault-my-rewards');

  if (historyEl) {
    const history = global.vault?.distributionHistory || [];
    historyEl.innerHTML = history.length
      ? history
          .map(
            (h) => `
        <div class="vault-dist-block">
          <p class="vault-dist-title"><strong>${escapeHtml(h.reason)}</strong> · ${new Date(h.at).toLocaleDateString('pt-BR')}</p>
          <ul class="vault-dist-recipients">
            ${(h.recipients || [])
              .map(
                (r) => `
              <li>
                ${r.loot ? `${r.loot.emoji} ${escapeHtml(r.loot.label)} + ` : ''}
                <strong>${r.coins}</strong> 🪙 → ${escapeHtml(r.name)}
                <span class="muted">(${r.sharePct}% do cofre)</span>
              </li>`
              )
              .join('')}
          </ul>
        </div>`
          )
          .join('')
      : '<p class="muted">Quando o boss cair ou o cofre subir de nível, as recompensas vão para os contribuidores.</p>';
  }

  if (mineEl) {
    const rewards = phase2.vaultRewards || [];
    mineEl.innerHTML = rewards.length
      ? rewards
          .map(
            (r) => `
        <div class="vault-my-reward-item">
          <span>${r.loot ? `${r.loot.emoji} ${escapeHtml(r.loot.label)} · ` : ''}+${r.coins} 🪙</span>
          <span class="muted">${escapeHtml(r.reason)} · ${new Date(r.at).toLocaleDateString('pt-BR')}</span>
        </div>`
          )
          .join('')
      : '<p class="muted">Suas recompensas do cofre aparecem aqui após cada distribuição.</p>';
  }
}

function setPhase2Text(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = typeof val === 'number' ? val.toLocaleString('pt-BR') : val;
}

function renderEnergyBars(user) {
  if (!document.getElementById('bar-mana')) return;
  const phase2 = ensureUserPhase2(user || getCurrentUser());
  ['mana', 'energy', 'stamina'].forEach((key) => {
    const val = phase2.energy[key];
    const fill = document.getElementById(`bar-${key}`);
    const label = document.getElementById(`val-${key}`);
    if (fill) fill.style.width = `${val}%`;
    if (label) label.textContent = `${val}%`;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('guilda-page')) return;
  await window.storageReady;
  const user = requireAuth();
  if (!user) return;

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await clearSession();
    window.location.href = 'index.html';
  });

  renderPhase2Page();
});
