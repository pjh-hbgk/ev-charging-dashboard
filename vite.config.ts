import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor_react: ['react', 'react-dom', 'react-router-dom'],
          vendor_charts: ['recharts'],
          vendor_data: ['@supabase/supabase-js', '@tanstack/react-query', 'luxon'],
          vendor_export: ['xlsx', 'jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
});
