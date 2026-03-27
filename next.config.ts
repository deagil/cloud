import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep sandbox SDK and Node streams on the server runtime; avoids broken stream constructors when bundling.
  serverExternalPackages: ['@vercel/sandbox'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig
