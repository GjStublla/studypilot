import { spawn } from 'node:child_process';

const port = process.env.E2E_PORT ?? '5176';
const child = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port],
  {
    env: {
      ...process.env,
      VITE_API_BASE_URL: 'https://api.example.com',
      VITE_SUPABASE_URL: 'https://supabase.example.com',
      VITE_SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMmUifQ.e2e-public-key',
    },
    stdio: 'inherit',
  },
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill('SIGTERM');
  process.exit(code);
}

child.on('exit', (code, signal) => {
  if (!shuttingDown) {
    process.exit(code ?? (signal ? 1 : 0));
  }
});

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
