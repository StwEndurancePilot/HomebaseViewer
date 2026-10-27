import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import '@material/web/chips/filter-chip.js';
import '@fontsource-variable/roboto/standard.css';
import '@phosphor-icons/web/regular';
import {
  applyTheme,
  themeFromSourceColor,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities';
const theme = themeFromSourceColor(argbFromHex('#3678d7'));
const system = matchMedia('(prefers-color-scheme: dark)');
let preference = localStorage.getItem('homebase-color-theme') ?? 'system';
export function applyColorTheme() {
  const dark = preference === 'dark' || (preference === 'system' && system.matches);
  applyTheme(theme, { target: document.documentElement, dark });
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const [name, tone] of Object.entries(
    dark
      ? {
          surface: 6,
          'surface-container-low': 10,
          'surface-container': 12,
          'surface-container-high': 17,
          'surface-container-highest': 22,
        }
      : {
          surface: 98,
          'surface-container-low': 96,
          'surface-container': 94,
          'surface-container-high': 92,
          'surface-container-highest': 90,
        },
  ))
    document.documentElement.style.setProperty(
      `--md-sys-color-${name}`,
      hexFromArgb(theme.palettes.neutral.tone(tone)),
    );
  const button = document.getElementById('theme');
  if (button) {
    button.title = `Color theme: ${preference}`;
    button.setAttribute('aria-label', `Color theme: ${preference}. Click to change.`);
    button.innerHTML = `<i class="ph ph-${preference === 'dark' ? 'moon' : preference === 'light' ? 'sun' : 'circle-half'}" aria-hidden="true"></i>`;
  }
}
export function cycleColorTheme() {
  preference = preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system';
  localStorage.setItem('homebase-color-theme', preference);
  applyColorTheme();
}
system.addEventListener('change', () => {
  if (preference === 'system') applyColorTheme();
});
applyColorTheme();
