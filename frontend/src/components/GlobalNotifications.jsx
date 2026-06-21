import React from 'react';
import ToastContainer from './ToastContainer';
import useNetworkNotifier from '../surveyor/hooks/useNetworkNotifier';

/**
 * GlobalNotifications — dipasang sekali di root: menjalankan notifier jaringan
 * (toast + getar saat online/offline) dan merender wadah toast global.
 */
function GlobalNotifications() {
  useNetworkNotifier();
  return <ToastContainer />;
}

export default GlobalNotifications;
