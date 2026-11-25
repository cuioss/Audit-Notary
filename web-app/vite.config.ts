import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { resolvePorts, holdsAssignedPort } from './src/lib/ports.ts';

/** The addresses a request from this machine itself carries. */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Whether a proxied request arrives from this machine itself.
 *
 * @param request the proxied request
 * @returns `true` for a loopback client
 */
function isLoopbackRequest(request: { socket: { remoteAddress?: string | null } }): boolean {
  return LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? '');
}

const ports = resolvePorts();

export default defineConfig({
  plugins: [
    {
      // SvelteKit's route announcer carries an inline `style` attribute, which `style-src 'self'`
      // (AUN-WEB-8) blocks; the attribute becomes a class that base.css styles.
      name: 'strip-announcer-inline-style',
      enforce: 'post',
      transform(code, id) {
        if (id.includes('root.svelte')) {
          return {
            code: code.replace(/style="position:\s*absolute;[^"]*"/g, 'class="svelte-announcer"'),
            map: null,
          };
        }
      },
      renderChunk(code) {
        if (code.includes('svelte-announcer')) {
          return {
            code: code
              .replace(/style=\\"position:\s*absolute;[^\\"]*\\"/g, 'class=\\"svelte-announcer\\"')
              .replace(/style="position:\s*absolute;[^"]*"/g, 'class="svelte-announcer"'),
            map: null,
          };
        }
      },
    },
    sveltekit({
      adapter: adapter({
        pages: 'build',
        assets: 'build',
        fallback: 'index.html',
        precompress: false,
        strict: false,
      }),
      preprocess: vitePreprocess(),
      // AUN-WEB-8: SvelteKit writes the policy with the hash of its bootstrap script into the
      // fallback page as a <meta> tag; the application sends the full policy as a header, with
      // `frame-ancestors`, which a <meta> policy cannot carry.
      csp: {
        mode: 'hash',
        directives: {
          'default-src': ['self'],
          'script-src': ['self'],
          'style-src': ['self'],
          'img-src': ['self', 'data:'],
          'connect-src': ['self'],
          'base-uri': ['none'],
          'form-action': ['self'],
        },
      },
    }),
  ],
  build: {
    // Every asset is a file of the app's own origin (AUN-WEB-1).
    assetsInlineLimit: 0,
  },
  resolve: {
    conditions: ['browser'],
  },
  server: {
    // Loopback only: the dev server is a development tool, not a way to reach the mock from the network.
    host: '127.0.0.1',
    // The unit tests read the mock server's scenario files from the sibling module.
    fs: {
      allow: ['..'],
    },
    port: ports.webPort,
    strictPort: holdsAssignedPort(),
    proxy: {
      '/api': {
        target: ports.mockTarget,
        changeOrigin: true,
        // The mock compares a request's Origin with X-Forwarded-Host, as the application compares it
        // with its own origin (AUN-WEB-8, AUN-TEST-1).
        xfwd: true,
      },
      // The local login's form post (AUN-AUTH-6), the one request outside `/api/v1`.
      '/j_security_check': {
        target: ports.mockTarget,
        changeOrigin: true,
        xfwd: true,
      },
      '/mock': {
        target: ports.mockTarget,
        changeOrigin: true,
        bypass(request, response) {
          if (isLoopbackRequest(request) || !response) {
            return undefined;
          }
          response.statusCode = 403;
          response.end('mock controls are loopback only');
          return false;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 20_000,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Measured by `npm run test:coverage` (Maven profiles `coverage` and `sonar`).
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
      reportsDirectory: './target/coverage',
      include: ['src/**/*.{ts,js,svelte}'],
      exclude: [
        'src/**/*.test.{ts,js}',
        'src/**/*.d.ts',
        'src/setupTests.ts',
        'src/test/**',
        'src/lib/test/**',
        'src/routes/**',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
