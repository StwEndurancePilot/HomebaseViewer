import { el } from '../dom';

export function setupDiscordPanel() {
  const bridge = window.homebaseDiscord;
  const toggle = el('discordOpen');
  if (!bridge) {
    toggle.hidden = true;
    return;
  }
  const dialog = el<HTMLDialogElement>('discordDialog');
  const join = el<HTMLButtonElement>('discordJoin');
  const close = el<HTMLButtonElement>('discordClose');
  const error = el('discordError');
  let inviteOpened = false;
  const show = () => {
    close.hidden = !inviteOpened;
    error.hidden = true;
    if (!dialog.open) dialog.showModal();
    join.focus();
  };
  dialog.oncancel = (event) => {
    if (!inviteOpened) event.preventDefault();
  };
  close.onclick = () => dialog.close();
  toggle.onclick = show;
  join.onclick = async () => {
    if (join.disabled) return;
    join.disabled = true;
    join.textContent = 'Opening Discord…';
    error.hidden = true;
    try {
      await bridge.open();
      inviteOpened = true;
      dialog.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Could not open Discord. Try again.';
      error.hidden = false;
    } finally {
      join.disabled = false;
      join.textContent = 'Join now';
    }
  };
  void bridge
    .state()
    .then((state) => {
      inviteOpened = inviteOpened || state.inviteOpened;
      close.hidden = !inviteOpened;
      if (!inviteOpened) show();
    })
    .catch(() => show());
}
