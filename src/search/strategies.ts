import { runRipgrep } from './ripgrep';
import { SearchResult } from './types';

export async function searchPattern(pattern: string): Promise<SearchResult[]> {
  return runRipgrep({ pattern });
}

export async function searchFunction(functionName: string): Promise<SearchResult[]> {
  return runRipgrep({ pattern: `function ${functionName}` });
}

export async function searchClass(className: string): Promise<SearchResult[]> {
  return runRipgrep({ pattern: `class ${className}` });
}

export async function searchImport(moduleName: string): Promise<SearchResult[]> {
  return runRipgrep({ pattern: `import .*${moduleName}` });
}
