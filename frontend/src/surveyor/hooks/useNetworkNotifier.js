import { useEffect, useRef } from 'react';
import { addNetworkListener, getNetworkStatus, hapticNotify } from '../../utils/capacitorBridge';
import { toastSuccess, toastWarning } from '../../utils/toastBus';

/**
 * useNetworkNotifier — menampilkan toast + getar saat status jaringan BERUBAH
 * (offline ↔ online). Hanya bereaksi pada perubahan (bukan saat mount), agar
 * tidak mengganggu. Dipasang sekali di root via <GlobalNotifications/>.
 */
export default function useNetworkNotifier() {
  const lastConnected = useRef(null);

  useEffect(() => {
    let cleanup = () => {};
    let active = true;

    (async () => {
      // Baseline awal — tidak memunculkan toast.
      try {
        const init = await getNetworkStatus();
        if (active) lastConnected.current = init.connected;
      } catch { /* abaikan */ }

      cleanup = await addNetworkListener(({ connected }) => {
        if (!active) return;
        if (lastConnected.current === connected) return; // tidak ada perubahan
        lastConnected.current = connected;
        if (connected) {
          toastSuccess('Kembali online — menyinkronkan data…');
          hapticNotify('success');
        } else {
          toastWarning('Mode offline — data tetap aman di perangkat');
          hapticNotify('warning');
        }
      });
    })();

    return () => { active = false; if (typeof cleanup === 'function') cleanup(); };
  }, []);
}
