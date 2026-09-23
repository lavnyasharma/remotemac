import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: 'Control your Mac from your iPhone.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#0071E3',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
