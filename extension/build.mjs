import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const outdir = join(__dirname, 'dist');

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function injectManifest() {
  const raw = readFileSync(join(__dirname, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);

  // Host permission for the configured Supabase project (placeholder stays if unset).
  const hosts = new Set(manifest.host_permissions ?? []);
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      hosts.add(`${u.origin}/*`);
    } catch {
      // keep placeholder
    }
  } else {
    hosts.add('https://*.supabase.co/*');
  }
  manifest.host_permissions = [...hosts];

  writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function copyStatic() {
  ensureDir(join(outdir, 'content'));
  copyFileSync(join(__dirname, 'src', 'offscreen.html'), join(outdir, 'offscreen.html'));
  copyFileSync(join(__dirname, 'src', 'audio-worklet.js'), join(outdir, 'audio-worklet.js'));
  copyFileSync(join(__dirname, 'src', 'content', 'panel.css'), join(outdir, 'content', 'panel.css'));
  injectManifest();

  writeFileSync(
    join(outdir, 'config.json'),
    JSON.stringify(
      {
        supabaseUrl: supabaseUrl || null,
        supabaseAnonKey: supabaseAnonKey || null,
        note: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY when building, or edit chrome.storage after load.',
      },
      null,
      2,
    ),
  );
}

const define = {
  '__STUDYPILOT_SUPABASE_URL__': JSON.stringify(supabaseUrl),
  '__STUDYPILOT_SUPABASE_ANON_KEY__': JSON.stringify(supabaseAnonKey),
};

/** @type {esbuild.BuildOptions[]} */
const builds = [
  {
    entryPoints: [join(__dirname, 'src', 'background.ts')],
    outfile: join(outdir, 'background.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: true,
    define,
  },
  {
    entryPoints: [join(__dirname, 'src', 'offscreen.ts')],
    outfile: join(outdir, 'offscreen.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: true,
    define,
  },
  {
    entryPoints: [join(__dirname, 'src', 'content', 'panel.ts')],
    outfile: join(outdir, 'content', 'panel.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: true,
    define,
  },
];

async function run() {
  rmSync(outdir, { recursive: true, force: true });
  ensureDir(outdir);
  copyStatic();

  if (watch) {
    const contexts = await Promise.all(
      builds.map((opts) =>
        esbuild.context({
          ...opts,
          plugins: [
            {
              name: 'copy-static-on-rebuild',
              setup(build) {
                build.onEnd((result) => {
                  if (!result.errors.length) copyStatic();
                });
              },
            },
          ],
        }),
      ),
    );
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[extension] watching… load unpacked from extension/dist');
  } else {
    await Promise.all(builds.map((opts) => esbuild.build(opts)));
    console.log('[extension] built → extension/dist');
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        '[extension] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — host_permissions use *.supabase.co placeholder; configure via storage or rebuild.',
      );
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
