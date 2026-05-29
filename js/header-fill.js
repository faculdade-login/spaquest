(function fillHeaderFromStorage() {
  const label = document.documentElement.dataset.headerUser;
  const el = document.getElementById('header-user');
  if (el && label) el.textContent = label;
})();
