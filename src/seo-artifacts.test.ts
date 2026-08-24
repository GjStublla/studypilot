import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootFile = (name: string) => join(process.cwd(), name);

describe('public SEO artifacts', () => {
  it('publishes a crawl policy and canonical sitemap routes', () => {
    const robots = readFileSync(rootFile('public/robots.txt'), 'utf8');
    const sitemap = readFileSync(rootFile('public/sitemap.xml'), 'utf8');

    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://studypilot.app/sitemap.xml');
    for (const route of ['', '#/privacy', '#/terms', '#/cookies', '#/changelog']) {
      expect(sitemap).toContain(`https://studypilot.app/${route}`);
    }
  });

  it('keeps canonical and social metadata aligned with the approved product claim', () => {
    const html = readFileSync(rootFile('index.html'), 'utf8');

    expect(html).toContain('<link rel="canonical" href="https://studypilot.app/"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('href="/assets/studypilot-modal-demo.svg"');
    expect(html).toContain('StudyPilot is a rubric-aware study coach across your browser and dashboard.');
  });
});
