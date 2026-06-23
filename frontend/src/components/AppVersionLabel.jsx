import React, { useEffect, useState } from 'react';
import { getAppVersion } from '../utils/capacitorBridge';

/**
 * AppVersionLabel — menampilkan "Versi x.y.z" (plus build di native).
 * Berguna untuk dukungan/diagnosa: tahu TPD memakai versi berapa.
 *
 * @param {{ className?: string }} props
 */
function AppVersionLabel({ className = '' }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let active = true;
    getAppVersion().then((v) => { if (active) setInfo(v); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!info || !info.version) return null;

  return (
    <span className={className}>
      Versi {info.version}{info.build ? ` (${info.build})` : ''}
    </span>
  );
}

export default AppVersionLabel;
