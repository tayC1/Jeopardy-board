import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getPlayBaseOrigin } from '../lib/playUrl.js';

export default function PlayQrCode({ code }) {
  const [dataUrl, setDataUrl] = useState('');
  const [playUrl, setPlayUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const origin = await getPlayBaseOrigin();
      const url = `${origin}/play/${code}`;
      if (cancelled) return;
      setPlayUrl(url);
      const qr = await QRCode.toDataURL(url, {
        width: 320,
        margin: 1,
        color: { dark: '#04099c', light: '#ffffff' },
      });
      if (!cancelled) setDataUrl(qr);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!dataUrl) return null;

  return (
    <div className="play-qr">
      <img src={dataUrl} alt="Scan to join on your phone" />
      <p className="play-qr-caption">Scan to join · {playUrl.replace(/^https?:\/\//, '')}</p>
    </div>
  );
}
