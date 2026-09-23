import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const iconPath = join(process.cwd(), 'public', 'app-icon-256.png');
  const iconBase64 = readFileSync(iconPath).toString('base64');
  const iconSrc = `data:image/png;base64,${iconBase64}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background: '#000000',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 44 }}>
          <img src={iconSrc} width={96} height={96} style={{ borderRadius: 22 }} />
          <span style={{ fontSize: 40, fontWeight: 600, color: '#F5F5F7', letterSpacing: -0.5 }}>
            RemoteMac
          </span>
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#F5F5F7',
            lineHeight: 1.08,
            letterSpacing: -1.5,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>Your Mac.</span>
          <span style={{ color: '#0071E3' }}>On your iPhone.</span>
        </div>
        <div style={{ fontSize: 28, color: '#9A9DAE', marginTop: 28, maxWidth: 820 }}>
          See it, control it, from wherever your iPhone is.
        </div>
      </div>
    ),
    { ...size }
  );
}
