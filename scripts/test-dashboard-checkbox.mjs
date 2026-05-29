/**
 * Teste E2E: checkbox de atividade no Status
 * Uso: node scripts/test-dashboard-checkbox.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8765/html';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (msg) => pageErrors.push(String(msg)));

  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => {
    const userId = crypto.randomUUID();
    const courseId = crypto.randomUUID();
    const activityId = crypto.randomUUID();
    const dayKey = new Date().toISOString().slice(0, 10);
    const users = [
      {
        id: userId,
        username: 'teste@teste.com',
        password: '123',
        character: {
          name: 'Tester',
          classId: 'ladino',
          className: 'Ladino',
          classIcon: '🗡️',
        },
        courses: [
          {
            id: courseId,
            name: 'Curso Teste',
            activities: [
              {
                id: activityId,
                title: 'Atividade 1',
                type: 'estudo',
                difficulty: 'medio',
                xpReward: 50,
                done: false,
              },
            ],
          },
        ],
        xp: 0,
        level: 1,
        coins: 0,
        streak: {
          weekdaysCompleted: [],
          currentStreak: 0,
          bestStreak: 0,
          lastWeekdayKey: null,
        },
        phase2: {
          energy: { mana: 100, energy: 100, stamina: 100 },
          boosters: [],
          activeBooster: null,
          lootLog: [],
          vaultContributed: 0,
          vaultRewards: [],
        },
        healthDaily: {
          dayKey,
          doneIds: [],
        },
        courseStudyDaily: { dayKey, studied: {} },
      },
    ];
    localStorage.setItem('spa_quest_users', JSON.stringify(users));
    localStorage.setItem('spa_quest_session', JSON.stringify({ userId }));
    localStorage.setItem(
      'spa_quest_global',
      JSON.stringify({
        vault: { coins: 100, level: 1, lastDistributedLevel: 0, distributionHistory: [] },
        boss: { name: 'Boss Otanos', hp: 50000, maxHp: 50000, defeats: 0 },
        totalTasksGlobal: 0,
      })
    );
  });

  await page.goto(`${BASE}/dashboard.html`);
  await page.waitForSelector('#courses-study-list .task-checkbox', {
    state: 'attached',
    timeout: 10000,
  });

  const checkbox = page.locator('#courses-study-list .task-checkbox').first();
  const enabled = await checkbox.isEnabled();

  await page.locator('#courses-study-list .task-check-row').first().click();
  await page.waitForTimeout(600);

  const checked = await checkbox.isChecked();
  const done = await page.locator('#stat-tasks-done').textContent();
  const storage = await page.evaluate(() => {
    const users = JSON.parse(localStorage.getItem('spa_quest_users') || '[]');
    const a = users[0]?.courses?.[0]?.activities?.[0];
    return { activityDone: !!a?.done, xp: users[0]?.xp ?? 0 };
  });

  await browser.close();

  const pass =
    enabled &&
    checked &&
    done === '1' &&
    storage.activityDone &&
    storage.xp > 0 &&
    pageErrors.length === 0;

  console.log(
    JSON.stringify(
      { pass, enabled, checked, done, storage, pageErrors },
      null,
      2
    )
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
