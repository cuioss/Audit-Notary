/*
 * The twin of src/lib/theme.ts that runs before the first paint: the same key, and the same rule that an
 * unreadable, missing or unknown choice follows the system. It cannot import the module, because it must
 * run before any module is fetched.
 */
(function () {
  var choice = 'system';
  try {
    choice = window.localStorage.getItem('audit_notary_theme') || 'system';
  } catch (error) {
    choice = 'system';
  }
  if (choice !== 'light' && choice !== 'dark') {
    choice = 'system';
  }
  var prefersDark = false;
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (error) {
    prefersDark = false;
  }
  document.documentElement.dataset.theme =
    choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
})();
