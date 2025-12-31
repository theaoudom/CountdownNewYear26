/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ignore OneSignal requests (likely from browser extensions)
  async rewrites() {
    return [
      {
        source: '/OneSignalSDKWorker.js',
        destination: '/api/onesignal-worker', // Returns 204 No Content
      },
    ]
  },
}

module.exports = nextConfig



