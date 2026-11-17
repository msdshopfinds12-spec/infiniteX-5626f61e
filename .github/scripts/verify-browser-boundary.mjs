import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));
const FORBIDDEN_PATH = /(^|\/)(?:apps\/api|(?:src\/)?lib\/ai)(?:\/|$)/;

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

function moduleReferences(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const references = [];
  const issues = [];

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      references.push({ specifier: node.moduleSpecifier.text, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) {
          references.push({ specifier: argument.text, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
        } else {
          issues.push({ file: filename, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            message: "Non-literal dynamic import/require cannot be statically audited." });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { references, issues };
}

function resolveSourceImport(fromFile, specifier, rootDir) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const root = path.resolve(rootDir);
  if (base !== root && !base.startsWith(root + path.sep)) {
    return { outsideRoot: true, candidate: base };
  }
  const candidates = path.extname(base)
    ? [base]
    : [...SOURCE_EXTENSIONS.map((extension) => base + extension),
      ...SOURCE_EXTENSIONS.map((extension) => path.join(base, "index" + extension))];
  const found = candidates.find((candidate) => existsSync(candidate) && isSourceFile(candidate));
  if (found) return { file: found };
  if (path.extname(base) && !isSourceFile(base)) return { asset: true };
  return { missing: true, candidate: base };
}

export async function scanBrowserImportGraph({ rootDir = process.cwd(), entrypoint = "src/main.tsx" } = {}) {
  const root = path.resolve(rootDir);
  const entry = path.resolve(root, entrypoint);
  const issues = [];
  const visited = new Set();

  async function walk(filename) {
    let canonical;
    try {
      canonical = await realpath(filename);
    } catch {
      issues.push({ file: path.relative(root, filename), line: 1, message: "Browser entrypoint/import target does not exist." });
      return;
    }
    if (visited.has(canonical)) return;
    visited.add(canonical);

    const relativeFile = path.relative(root, canonical).split(path.sep).join("/");
    if (FORBIDDEN_PATH.test(relativeFile)) {
      issues.push({ file: relativeFile, line: 1, message: "Trusted server-only module is reachable from the browser entrypoint." });
      return;
    }

    const source = await readFile(canonical, "utf8");
    const { references, issues: parseIssues } = moduleReferences(source, canonical);
    for (const issue of parseIssues) issues.push({ ...issue, file: relativeFile });

    for (const reference of references) {
      const specifier = reference.specifier;
      const normalized = specifier.replaceAll("\\", "/");
      const packageRoot = normalized.replace(/^node:/, "").split("/")[0];
      if (normalized.startsWith("node:") || BUILTINS.has(packageRoot)) {
        issues.push({ file: relativeFile, line: reference.line, message: "Node.js built-in module is prohibited in the browser import graph: " + specifier });
        continue;
      }
      if (FORBIDDEN_PATH.test(normalized)) {
        issues.push({ file: relativeFile, line: reference.line, message: "Import points to a trusted server-only module: " + specifier });
        continue;
      }
      const resolved = resolveSourceImport(canonical, specifier, root);
      if (!resolved) continue;
      if (resolved.outsideRoot) {
        issues.push({ file: relativeFile, line: reference.line, message: "Relative import escapes the repository root: " + specifier });
      } else if (resolved.missing) {
        issues.push({ file: relativeFile, line: reference.line, message: "Unable to resolve source import for browser audit: " + specifier });
      } else if (resolved.file) {
        await walk(resolved.file);
      }
    }
  }

  await walk(entry);
  return { files: [...visited].map((file) => path.relative(root, file).split(path.sep).join("/")).sort(), issues };
}

export async function runBrowserBoundaryCheck(options = {}) {
  const { files, issues } = await scanBrowserImportGraph(options);
  if (issues.length) {
    console.error("Browser/server import boundary check failed:");
    for (const issue of issues) console.error("- " + issue.file + ":" + issue.line + " " + issue.message);
    return false;
  }
  console.log("Browser/server import boundary passed (" + files.length + " source files audited).");
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!(await runBrowserBoundaryCheck())) process.exitCode = 1;
}
