/** @type {import('next').NextConfig} */
const remotePatterns = [
  {
    protocol: 'http',
    hostname: 'localhost',
    port: '9000',
    pathname: '/**',
  },
  {
    protocol: 'http',
    hostname: '127.0.0.1',
    port: '9000',
    pathname: '/**',
  },
  {
    protocol: 'https',
    hostname: 'images.unsplash.com',
    pathname: '/**',
  },
];

if (process.env.NEXT_PUBLIC_IMAGE_HOST) {
  try {
    const raw = process.env.NEXT_PUBLIC_IMAGE_HOST;
    const url = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
    remotePatterns.push({
      protocol: (url.protocol.replace(':', '') || 'http'),
      hostname: url.hostname,
      port: url.port || undefined,
      pathname: '/**',
    });
  } catch {
    // Ignore invalid custom image host url
  }
}

const nextConfig = {
  async rewrites() {
    const bucket = process.env.MINIO_BUCKET || 'product-images';
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid storage bucket');
    const internal = process.env.MINIO_INTERNAL_URL || 'http://localhost:9000';
    return [{ source: `/storage/${bucket}/:path*`, destination: `${internal.replace(/\/+$/, '')}/${bucket}/:path*` }];
  },
  images: {
    remotePatterns,
  },
};

export default nextConfig;
