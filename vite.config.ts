/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {
  assertPublicDeploymentEnv,
  mergePublicDeploymentEnv,
  shouldValidateProductionBundle,
} from './src/lib/deploymentConfig';

export default defineConfig(({ command, mode }) => {
  if (shouldValidateProductionBundle(command, mode)) {
    const fileEnv = loadEnv(mode, process.cwd(), 'VITE_');
    assertPublicDeploymentEnv(mergePublicDeploymentEnv(process.env, fileEnv), 'production');
  }

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      exclude: ['e2e/**', 'node_modules/**'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.indexOf('node_modules') === -1) {
              return;
            }

            if (id.indexOf('react') !== -1 || id.indexOf('scheduler') !== -1) {
              return 'react-vendor';
            }

            if (
              id.indexOf('framer-motion') !== -1 ||
              id.indexOf('motion-dom') !== -1 ||
              id.indexOf('motion-utils') !== -1
            ) {
              return 'motion-vendor';
            }
          },
        },
      },
    },
  };
});
