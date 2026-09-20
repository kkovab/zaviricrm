/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development compiler away from production build artifacts.
  // Running `next build` while `next dev` is open can otherwise replace
  // chunks underneath the dev server and cause missing ./331.js-style errors.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};
module.exports = nextConfig;
