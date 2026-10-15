import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Mermaid is a documentation tool, deliberately kept out of the app dependencies.
// Supply a local mermaid@12.2.0 browser bundle; see RUNBOOK.md.
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const bundle = option('--bundle');
if (!bundle) throw new Error('Usage: node scripts/render-diagrams.mjs --bundle <mermaid.min.js> [--screenshots <directory>]');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'docs', 'diagrams');
const screenshots = option('--screenshots');
if (screenshots) await mkdir(resolve(screenshots), { recursive: true });
const files = (await readdir(directory)).filter((file) => file.endsWith('.mmd')).sort();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.setContent('<!doctype html><html lang="vi"><meta charset="utf-8"><body style="margin:0;background:#fff"><main></main></body></html>');
  await page.addScriptTag({ path: resolve(bundle) });
  for (const file of files) {
    const name = basename(file, '.mmd');
    const source = await readFile(join(directory, file), 'utf8');
    const labels = [...source.matchAll(/^\s*(\w+)[([{]+\s*"([^"]+)"/gm)]
      .map((match) => ({ id: match[1], text: match[2].replace(/<br\s*\/?\s*>/gi, ' ').replace(/\s+/g, ' ').trim() }));
    const result = await page.evaluate(async ({ source, name, labels }) => {
      window.mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', theme: 'base', look: 'classic', htmlLabels: false,
        fontFamily: 'Arial, sans-serif', fontSize: 18,
        themeVariables: { fontFamily: 'Arial, sans-serif', fontSize: '18px', background: '#ffffff', primaryTextColor: '#0f172a', lineColor: '#64748b', edgeLabelBackground: '#ffffff' },
        flowchart: { htmlLabels: false, nodeSpacing: 24, rankSpacing: 32, padding: 18, wrappingWidth: 255, diagramPadding: 20, useMaxWidth: false, curve: 'linear' },
      });
      await document.fonts.ready;
      const { svg } = await window.mermaid.render(`diagram-${name}`, source);
      const container = document.querySelector('main');
      container.innerHTML = svg;
      await document.fonts.ready;
      const element = container.querySelector('svg');
      const box = element.viewBox.baseVal;
      element.setAttribute('width', String(Math.ceil(box.width)));
      element.setAttribute('height', String(Math.ceil(box.height)));
      element.style.background = '#ffffff';
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.id = `${name}-title`;
      title.textContent = `VNG Support: ${name}`;
      element.prepend(title);
      element.setAttribute('role', 'img');
      element.setAttribute('aria-labelledby', title.id);
      const errors = [];
      const nodes = [...element.querySelectorAll('g.node')];
      const nodeBounds = [];
      const intersects = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      for (const expected of labels) {
        const node = nodes.find((candidate) => candidate.id.includes(`flowchart-${expected.id}-`));
        if (!node) { errors.push(`Missing node: ${expected.id}`); continue; }
        const actual = node.querySelector('.label')?.textContent.replace(/\s+/g, ' ').trim();
        // SVG tspans need not contain whitespace between lines.
        if (actual?.replace(/\s/g, '') !== expected.text.replace(/\s/g, '')) errors.push(`Incomplete label: ${expected.id}`);
      }
      for (const node of nodes) {
        const shape = node.querySelector('rect, polygon, path, circle, ellipse');
        if (!shape) continue;
        const shapeBox = shape.getBoundingClientRect();
        nodeBounds.push({ id: node.id, box: shapeBox });
        for (const text of node.querySelectorAll('.label text')) {
          const textBox = text.getBoundingClientRect();
          if (textBox.left < shapeBox.left + 3 || textBox.right > shapeBox.right - 3 || textBox.top < shapeBox.top + 3 || textBox.bottom > shapeBox.bottom - 3) errors.push(`Label exceeds node: ${node.id}`);
        }
      }
      for (let i = 0; i < nodeBounds.length; i++) for (let j = i + 1; j < nodeBounds.length; j++) {
        if (intersects(nodeBounds[i].box, nodeBounds[j].box)) errors.push(`Overlapping nodes: ${nodeBounds[i].id}, ${nodeBounds[j].id}`);
      }
      const graphBox = element.getBoundingClientRect();
      for (const text of element.querySelectorAll('text')) {
        const textBox = text.getBoundingClientRect();
        if (textBox.left < graphBox.left || textBox.right > graphBox.right || textBox.top < graphBox.top || textBox.bottom > graphBox.bottom) errors.push(`Text outside SVG: ${text.textContent}`);
      }
      if (element.querySelector('foreignObject, script, image')) errors.push('SVG must contain native text and shapes only');
      return { width: Math.ceil(box.width), height: Math.ceil(box.height), nodes: nodes.length, labels: labels.length, errors, svg: element.outerHTML };
    }, { source, name, labels });
    if (result.errors.length && screenshots) await writeFile(join(resolve(screenshots), 'failed-render.svg'), result.svg);
    if (result.errors.length) throw new Error(`${file}: ${result.errors.join('; ')}`);
    await writeFile(join(directory, `${name}.svg`), `${result.svg}\n`);
    if (screenshots) {
      await page.setViewportSize({ width: Math.max(1000, result.width), height: 1000 });
      await page.locator('svg').screenshot({ path: join(resolve(screenshots), `${name}.png`) });
    }
    results.push({ file, width: result.width, height: result.height, nodes: result.nodes, labels: result.labels, errors: result.errors });
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
