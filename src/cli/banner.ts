import chalk from 'chalk';
import isCI from 'is-ci';

import pkg from '../../package.json';

const BANNER = `
   ____   _____  _____
  / __ \\ / ____|/ ____|
 | |  | | (___ | |
 | |  | |\\___ \\| |
 | |__| |____) | |____
  \\____/|_____/ \\_____|
  Open Source Contributing Agent
`;

export function showBanner(): void {
  // Only show banner in interactive terminals, not in CI or pipes
  if (!isCI && process.stdout.isTTY) {
    console.log(chalk.cyan(BANNER));
    console.log(chalk.gray(` Running version ${pkg.version}\n`));
  }
}
