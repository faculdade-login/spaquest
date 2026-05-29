/**
 * Login e registro — S.P.A. Quest
 */
document.addEventListener('DOMContentLoaded', async () => {
  await window.storageReady;

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  const session = getSession();
  if (session?.userId) {
    const user = getCurrentUser();
    if (user?.character?.name) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'profile.html';
    }
    return;
  }

  function showTab(tab) {
    const isLogin = tab === 'login';
    loginForm?.classList.toggle('hidden', !isLogin);
    registerForm?.classList.toggle('hidden', isLogin);
    tabLogin?.classList.toggle('active', isLogin);
    tabRegister?.classList.toggle('active', !isLogin);
  }

  tabLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    showTab('login');
  });
  tabRegister?.addEventListener('click', (e) => {
    e.preventDefault();
    showTab('register');
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      const result = await findUserByCredentials(username, password);
      if (result.error || !result.user) {
        showToast(result.error || 'Usuário ou senha incorretos.', true);
        return;
      }
      const user = result.user;
      if (user.character?.name) {
        window.location.href = 'dashboard.html';
      } else {
        window.location.href = 'profile.html';
      }
    } finally {
      btn.disabled = false;
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = registerForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    try {
      if (username.length < 3) {
        showToast('Usuário precisa ter pelo menos 3 caracteres.', true);
        return;
      }
      if (password.length < 4) {
        showToast('Senha precisa ter pelo menos 4 caracteres.', true);
        return;
      }
      if (password !== confirm) {
        showToast('As senhas não coincidem.', true);
        return;
      }

      const result = await createUser({ username, password });
      if (result.error) {
        showToast(result.error, true);
        return;
      }
      showToast('Conta criada! Crie seu personagem.');
      setTimeout(() => {
        window.location.href = 'profile.html';
      }, 600);
    } finally {
      btn.disabled = false;
    }
  });
});
