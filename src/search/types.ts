export interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
}

export interface SearchOptions {
  pattern: string;
  cwd?: string;
  context?: number;
  fileType?: string;
}
