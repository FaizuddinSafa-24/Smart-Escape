import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' => the build works on GitHub Pages sub-paths, Netlify, Vercel, anywhere.
export default defineConfig({
  plugins: [react()],
  base: './',
});
