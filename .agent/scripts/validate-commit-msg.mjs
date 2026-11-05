#!/usr/bin/env node

import fs from 'node:fs';

const SUBJECT_MAX = 72;
const SUBJECT_RE = /^(feat|fix|docs|refactor|test|chore|perf|build)\([^)]+\):\s+\S.+$/;
const WORK_ITEM_RE = /^(PRD|FRD|BUG)-\d+\b/;
const SHIP_STATUS_RE = /^Ship status:\s*(shipped|shipped_with_caveats|incomplete)\s*$/i;
const TRAILER_RE = /^[A-Za-z-]+:\s*.+$/;

const messageFile = process.argv[2];
if (!messageFile) {
  console.error('validate-commit-msg: missing commit message file path.');
  process.exit(2);
}

let raw = '';
try {
  raw = fs.readFileSync(messageFile, 'utf8');
} catch (error) {
  console.error(`validate-commit-msg: unable to read ${messageFile}`);
  console.error(String(error));
  process.exit(2);
}

const lines = raw
  .split(/\r?\n/)
  // Git writes help/instruction lines as comments in commit templates.
  .filter((line) => !line.startsWith('#'));

const subjectIndex = lines.findIndex((line) => line.trim() !== '');
if (subjectIndex === -1) {
  console.error('commit-msg: empty commit message.');
  process.exit(1);
}

const subject = lines[subjectIndex].trim();

// Allow auto-generated or autosquash subjects.
if (/^(Merge |Revert ")/.test(subject) || /^(fixup!|squash!)/.test(subject)) {
  process.exit(0);
}

const errors = [];

if (!SUBJECT_RE.test(subject)) {
  errors.push(
    'Subject must follow: type(scope): summary, with type in feat|fix|docs|refactor|test|chore|perf|build.'
  );
}

if (subject.length > SUBJECT_MAX) {
  errors.push(`Subject is ${subject.length} chars; max is ${SUBJECT_MAX}.`);
}

let bodyLines = lines.slice(subjectIndex + 1);
while (bodyLines.length > 0 && bodyLines[0].trim() === '') {
  bodyLines.shift();
}
while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
  bodyLines.pop();
}

// Exclude trailing reference/status lines and git trailers from rationale counting.
while (bodyLines.length > 0) {
  const tail = bodyLines[bodyLines.length - 1].trim();
  if (
    tail === '' ||
    WORK_ITEM_RE.test(tail) ||
    SHIP_STATUS_RE.test(tail) ||
    TRAILER_RE.test(tail)
  ) {
    bodyLines.pop();
    continue;
  }
  break;
}

const rationaleLineCount = bodyLines.filter((line) => line.trim() !== '').length;
if (rationaleLineCount < 1) {
  errors.push('Body must include a short rationale (1-4 non-empty lines/sentences).');
}
if (rationaleLineCount > 4) {
  errors.push(
    `Body rationale has ${rationaleLineCount} non-empty lines; max is 4 (excluding trailing reference/status lines).`
  );
}

if (errors.length === 0) {
  process.exit(0);
}

console.error('commit-msg: message violates commit guardrails.');
for (const error of errors) {
  console.error(`- ${error}`);
}
console.error('');
console.error('Required shape:');
console.error('  type(scope): short outcome');
console.error('');
console.error('  Why this change was needed.');
console.error('  What behavior it fixes or improves.');
console.error('');
console.error('  PRD-003');
console.error('  Ship status: shipped');
console.error('');
console.error('See .agent/glossary.md section "Commit message convention".');
process.exit(1);
