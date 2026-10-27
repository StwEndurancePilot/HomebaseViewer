import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)));
    else if (/\.(ts|cjs)$/.test(file)) files.push(file);
  }
  return files;
}

const issues = [];
let classCount = 0;
for (const file of [...(await sourceFiles('src')), ...(await sourceFiles('electron'))]) {
  const source = ts.createSourceFile(
    file,
    await readFile(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const classes = [];
  function visit(node) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) classes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  classCount += classes.length;
  if (classes.length > 1) issues.push(`${file}: each class must have its own file.`);
  for (const declaration of classes) {
    const name = declaration.name?.text;
    const expected = name?.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    if (!expected || path.parse(file).name !== expected) {
      issues.push(`${file}: name the file after its class (${name ?? 'unnamed'}).`);
    }
  }
  const withComments = ts.createPrinter().printFile(source);
  const withoutComments = ts.createPrinter({ removeComments: true }).printFile(source);
  if (withComments !== withoutComments) issues.push(`${file}: move explanatory notes into docs/.`);
}

if (issues.length) throw new Error(issues.join('\n'));
console.log(`Source structure passed: ${classCount} classes in separate, named files.`);
