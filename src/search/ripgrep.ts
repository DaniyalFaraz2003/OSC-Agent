import { spawn } from 'child_process';
import { SearchResult, SearchOptions } from './types';
import { parseRipgrepOutput } from './parsers';

export function runRipgrep(options: SearchOptions): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const args = ['--line-number', '--column', options.pattern];

    if (options.context) {
      args.push('-C', options.context.toString());
    }

    if (options.fileType) {
      args.push('-t', options.fileType);
    }

    const rg = spawn('rg', args, { cwd: options.cwd || process.cwd() });

    let output = '';
    let error = '';

    rg.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    rg.stderr.on('data', (data: Buffer) => {
      error += data.toString();
    });

    rg.on('close', (code: number) => {
      if (code !== 0 && !output) {
        reject(new Error(`ripgrep failed: ${error}`));
      } else {
        resolve(parseRipgrepOutput(output));
      }
    });
  });
}
