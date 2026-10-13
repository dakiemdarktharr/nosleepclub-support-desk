import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Check local file targets, not remote availability or heading anchors.
export function checkMarkdown(file, markdown, exists = existsSync) {
  const issues = [];
  let fence = null;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (/^(?:<{7}|={7}|>{7})(?:\s|$)/.test(line))
      issues.push(`${file}:${index + 1}: unresolved conflict marker`);
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const targets = [...line.matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g)].map(m => m[1]);
    const reference = line.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/);
    if (reference) targets.push(reference[1]);
    for (const raw of targets) {
      const target = raw.replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
      let path;
      try { path = decodeURIComponent(target.split(/[?#]/)[0]); }
      catch { issues.push(`${file}:${index + 1}: invalid URL encoding: ${target}`); continue; }
      if (path && !exists(resolve(dirname(file), path)))
        issues.push(`${file}:${index + 1}: missing local target: ${target}`);
    }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0'))]
    .filter(file => /\.md$/i.test(file) && existsSync(file));
  const issues = files.flatMap(file => checkMarkdown(file, readFileSync(file, 'utf8')));
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log(`PASS: ${files.length} Markdown files; local link targets and conflict markers checked (remote URLs/anchors not checked).`);
}
