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
  images: {
    remotePatterns,
  },
};

export default nextConfig;
