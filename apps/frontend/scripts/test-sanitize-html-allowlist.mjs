// Regression test for the shared rich-text sanitizer (src/lib/sanitize-html.ts).
//
// Lesson/assignment/AI-tutor content rendered via dangerouslySetInnerHTML can
// originate from an uploaded spreadsheet (content-blocks-import / course
// content import, run through `marked`, which passes raw embedded HTML
// through unescaped) or any other saved rich-text field. The ONLY thing
// standing between that content and student browsers is DOMPurify's
// RICH_TEXT_CONFIG allowlist in sanitize-html.ts.
//
// A previous version of that allowlist included `script`, `iframe`, `link`,
// `meta` in ALLOWED_TAGS and `onclick` in ALLOWED_ATTR — which defeats
// sanitization entirely: DOMPurify only strips tags/attrs NOT in an explicit
// allowlist, so listing them there makes it pass dangerous markup straight
// through (e.g. a `<script>` tag, an `onclick="..."` handler on any element,
// or a `<meta http-equiv="refresh" content="0;url=https://evil/">` auto
// redirect planted via an imported lesson's "Block Content" cell).
//
// We can't exercise real DOMPurify here (it needs jsdom, which isn't a
// project dependency), so this statically parses the ALLOWED_TAGS /
// ALLOWED_ATTR arrays out of the source file via the TypeScript AST and
// asserts the dangerous entries are absent — the same guard the frontend CI
// "regression" scripts already use for other bugs in this file (see
// test-attendance-settings.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const path = new URL('../src/lib/sanitize-html.ts', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const tree = ts.createSourceFile('sanitize-html.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

let allowedTags = null;
let allowedAttrs = null;

function visit(node) {
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
    if (node.name.text === 'ALLOWED_TAGS' && ts.isArrayLiteralExpression(node.initializer)) {
      allowedTags = node.initializer.elements.filter(ts.isStringLiteral).map((e) => e.text);
    }
    if (node.name.text === 'ALLOWED_ATTR' && ts.isArrayLiteralExpression(node.initializer)) {
      allowedAttrs = node.initializer.elements.filter(ts.isStringLiteral).map((e) => e.text);
    }
  }
  ts.forEachChild(node, visit);
}
visit(tree);

assert.ok(Array.isArray(allowedTags) && allowedTags.length > 0, 'Could not find ALLOWED_TAGS in sanitize-html.ts');
assert.ok(Array.isArray(allowedAttrs) && allowedAttrs.length > 0, 'Could not find ALLOWED_ATTR in sanitize-html.ts');

const forbiddenTags = ['script', 'iframe', 'link', 'meta', 'object', 'embed', 'base'];
for (const tag of forbiddenTags) {
  assert.ok(!allowedTags.includes(tag), `ALLOWED_TAGS must not include "${tag}" — it lets sanitized HTML execute/redirect/load arbitrary content (e.g. a malicious content-blocks-import xlsx planting a <${tag}> in a lesson's Block Content)`);
}

const forbiddenAttrPrefixes = ['on']; // onclick, onerror, onload, onmouseover, ...
for (const attr of allowedAttrs) {
  const isWildcard = attr.endsWith('*');
  if (isWildcard) continue;
  for (const prefix of forbiddenAttrPrefixes) {
    assert.ok(!attr.toLowerCase().startsWith(prefix) || attr.toLowerCase() === 'on', `ALLOWED_ATTR must not include event-handler attribute "${attr}" — it lets sanitized HTML run arbitrary script on click/error/load without ever using a <script> tag`);
  }
}

console.log(`PASS: sanitize-html.ts ALLOWED_TAGS/ALLOWED_ATTR excludes script/iframe/link/meta/object/embed/base tags and on* event-handler attributes (${allowedTags.length} tags, ${allowedAttrs.length} attrs checked)`);
