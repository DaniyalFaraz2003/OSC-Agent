/**
 * Builds a compact text representation of the repository file tree.
 *
 * Used to give the LLM a bird's-eye view of the project so it can
 * intelligently pick which files / directories to examine.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Directories that are always skipped */
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output', '.next', '.nuxt', '.cache', '.parcel-cache', '.turbo', '.vercel', '.osc-agent', '__pycache__', '.tox', '.mypy_cache', '.pytest_cache', 'vendor', 'target', 'out']);

/** Files that are always skipped */
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

export interface FileTreeOptions {
  /** Root directory to scan (defaults to process.cwd()) */
  root?: string;
  /** Maximum directory depth (default: 4) */
  maxDepth?: number;
  /** Maximum entries per directory before truncating (default: 25) */
  maxEntriesPerDir?: number;
}

/**
 * Walk the repo and return a compact indented text tree.
 *
 * Example output:
 * ```
 * .
 * ├─ src/
 * │  ├─ cli/
 * │  │  ├─ commands/
 * │  │  │  ├─ issue.ts
 * │  │  │  └─ index.ts
 * │  │  ├─ formatters.ts
 * │  │  └─ validators.ts
 * │  ├─ agents/
 * │  │  └─ ...
 * ├─ tests/
 * │  └─ ...
 * ├─ package.json
 * └─ tsconfig.json
 * ```
 */
export function buildFileTree(options: FileTreeOptions = {}): string {
  const root = options.root ?? process.cwd();
  const maxDepth = options.maxDepth ?? 4;
  const maxEntries = options.maxEntriesPerDir ?? 25;

  const lines: string[] = ['.'];
  walkDir(root, '', maxDepth, maxEntries, lines);
  return lines.join('\n');
}

function walkDir(dir: string, prefix: string, depthLeft: number, maxEntries: number, lines: string[]): void {
  if (depthLeft <= 0) {
    lines.push(`${prefix}└─ ...`);
    return;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((e) => {
      if (e.startsWith('.') && e !== '.env.example') return false;
      if (IGNORE_DIRS.has(e)) return false;
      if (IGNORE_FILES.has(e)) return false;
      return true;
    });
  } catch {
    return;
  }

  // Sort: directories first, then files, alphabetical within each group
  entries.sort((a, b) => {
    const aIsDir = isDir(path.join(dir, a));
    const bIsDir = isDir(path.join(dir, b));
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  });

  const truncated = entries.length > maxEntries;
  const visible = truncated ? entries.slice(0, maxEntries) : entries;

  visible.forEach((entry, idx) => {
    const fullPath = path.join(dir, entry);
    const isLast = idx === visible.length - 1 && !truncated;
    const connector = isLast ? '└─' : '├─';
    const childPrefix = isLast ? '   ' : '│  ';

    if (isDir(fullPath)) {
      lines.push(`${prefix}${connector} ${entry}/`);
      walkDir(fullPath, prefix + childPrefix, depthLeft - 1, maxEntries, lines);
    } else {
      lines.push(`${prefix}${connector} ${entry}`);
    }
  });

  if (truncated) {
    lines.push(`${prefix}└─ ... (${entries.length - maxEntries} more)`);
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
