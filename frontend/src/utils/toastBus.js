/**
 * toastBus.js
 *
 * Pub/sub sederhana untuk notifikasi toast (pop-up sesaat) tanpa perlu
 * membungkus Context Provider di banyak tempat. Modul mana pun (hook, util,
 * halaman) bisa memanggil showToast(); <ToastContainer/> yang dipasang sekali
 * di root akan menampilkannya.
 */

const listeners = new Set();
let seq = 0;

/**
 * Berlangganan toast baru.
 * @param {(toast: {id:number, message:string, tone:string, duration:number}) => void} cb
 * @returns {() => void} fungsi berhenti berlangganan
 */
export function subscribeToasts(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Tampilkan toast.
 * @param {{ message: string, tone?: 'info'|'success'|'warning'|'error', duration?: number }} opts
 * @returns {number} id toast
 */
export function showToast({ message, tone = 'info', duration = 3500 }) {
  if (!message) return -1;
  const toast = { id: ++seq, message, tone, duration };
  listeners.forEach((l) => {
    try { l(toast); } catch { /* abaikan listener bermasalah */ }
  });
  return toast.id;
}

export const toastInfo = (message, opts = {}) => showToast({ message, tone: 'info', ...opts });
export const toastSuccess = (message, opts = {}) => showToast({ message, tone: 'success', ...opts });
export const toastWarning = (message, opts = {}) => showToast({ message, tone: 'warning', ...opts });
export const toastError = (message, opts = {}) => showToast({ message, tone: 'error', ...opts });

export default showToast;
