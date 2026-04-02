import { useState, useEffect } from 'react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function useLogoBase64(src = `${BASE}/assets/logo.png`) {
  const [logoBase64, setLogoBase64] = useState('');

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setLogoBase64(canvas.toDataURL('image/png'));
      }
    };
    img.src = `${src}?t=${Date.now()}`;
  }, [src]);

  return logoBase64;
}
