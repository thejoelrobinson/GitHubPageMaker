export type NotificationType = 'success' | 'error' | 'warning' | 'info';

const MAX_NOTIFICATIONS = 5;

export function notify(msg: string, type: NotificationType = 'info'): void {
  const container = document.getElementById('notifications') as HTMLElement;
  // Prevent unbounded DOM growth if notifications arrive faster than they expire
  while (container.children.length >= MAX_NOTIFICATIONS) {
    container.firstElementChild?.remove();
  }
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}
