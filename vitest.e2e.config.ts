import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/**/*.e2e.test.ts'], environment: 'node', testTimeout: 30000 } });
