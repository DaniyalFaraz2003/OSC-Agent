import { SearchResult } from './types';

export function parseRipgrepOutput(output: string): SearchResult[] {
  const lines = output.split('\n').filter(Boolean);

  return lines
    .map((line) => {
      const parts = line.split(':');

      if (parts.length < 4) return null;

      return {
        file: parts[0] as string,
        line: Number(parts[1]),
        column: Number(parts[2]),
        match: parts.slice(3).join(':'),
      };
    })
    .filter((item): item is SearchResult => item !== null);
}
