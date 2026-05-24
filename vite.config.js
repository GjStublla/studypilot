import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.indexOf('node_modules') === -1) {
                        return;
                    }
                    if (id.indexOf('react') !== -1 || id.indexOf('scheduler') !== -1) {
                        return 'react-vendor';
                    }
                    if (id.indexOf('framer-motion') !== -1 ||
                        id.indexOf('motion-dom') !== -1 ||
                        id.indexOf('motion-utils') !== -1) {
                        return 'motion-vendor';
                    }
                },
            },
        },
    },
});
