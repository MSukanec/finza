import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finza',
    short_name: 'Finza',
    description: 'Gestión inteligente de tus finanzas personales y empresariales.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0e14',
    theme_color: '#0e0e14',
    icons: [
      {
        src: '/icon',
        sizes: 'any',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
  }
}
