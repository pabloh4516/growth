/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vynyhzybgjpdhocezrmh.supabase.co",
      },
    ],
  },
};

export default nextConfig;
