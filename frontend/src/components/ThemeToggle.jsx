import React from 'react';
import Icon from './Icon';
import useThemeMode from '../hooks/useThemeMode';
import { toastInfo } from '../utils/toastBus';

const LABEL = { light: 'Terang', dark: 'Gelap', system: 'Ikuti sistem' };
const NEXT = { light: 'dark', dark: 'system', system: 'light' };
const ICON = { light: 'sun', dark: 'moon', system: 'monitor' };

/**
 * Sakelar tema. Sekali ketuk pindah ke mode berikutnya; label aksesibel menyebut
 * mode sekarang. Tanpa popover: aside Layout memakai overflow-hidden dan lebarnya
 * hanya 56px saat dilipat. Toast memberi umpan balik karena pindah ke "Ikuti sistem"
 * bisa tampak tak mengubah apa pun; singkat karena menutupi kaki drawer di HP.
 */
function ThemeToggle({
  className = 'p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors flex-shrink-0',
  iconClassName = 'w-[18px] h-[18px]',
}) {
  const { mode, cycle } = useThemeMode();
  const label = `Tema: ${LABEL[mode]}. Ganti ke ${LABEL[NEXT[mode]]}`;
  return (
    <button
      type="button"
      onClick={() => { cycle(); toastInfo(`Tema: ${LABEL[NEXT[mode]]}`, { duration: 1500 }); }}
      aria-label={label}
      title={label}
      className={className}
    >
      <Icon name={ICON[mode]} className={iconClassName} />
    </button>
  );
}

export default ThemeToggle;
