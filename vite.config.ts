/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : le site fonctionne sur GitHub Pages (https://<compte>.github.io/<depot>/) sans réglage.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
