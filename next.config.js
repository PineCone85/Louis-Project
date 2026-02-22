/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'nodemailer'],
  },
}

module.exports = nextConfig
