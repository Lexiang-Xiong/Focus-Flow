import path from 'path';
import { defineConfig } from 'vitest/config';

// 独立于 vite.config.ts：测试只跑纯逻辑，不加载 app 的 react / inspect 插件。
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
