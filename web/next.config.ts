import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readAppVersion() {
    try {
        const version = readFileSync(join(projectRoot, 'VERSION'), 'utf-8').trim()
        return version || '0.0.0'
    } catch {
        return '0.0.0'
    }
}

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || readAppVersion()
const backendOrigin = process.env.NEXT_DEV_BACKEND_ORIGIN || 'http://127.0.0.1:8000'

const nextConfig: NextConfig = {
    allowedDevOrigins: ['127.0.0.1'],
    env: {
        NEXT_PUBLIC_APP_VERSION: appVersion,
    },
    async rewrites() {
        if (process.env.NODE_ENV !== 'development') {
            return []
        }

        return [
            {
                source: '/api/:path*',
                destination: `${backendOrigin}/api/:path*`,
            },
            {
                source: '/auth/:path*',
                destination: `${backendOrigin}/auth/:path*`,
            },
            {
                source: '/v1/:path*',
                destination: `${backendOrigin}/v1/:path*`,
            },
            {
                source: '/images/:path*',
                destination: `${backendOrigin}/images/:path*`,
            },
            {
                source: '/version',
                destination: `${backendOrigin}/version`,
            },
        ]
    },
    output: 'export',
    trailingSlash: true,
    images: {
        unoptimized: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
}

export default nextConfig
