/**
 * CLI module
 * Command-line interface implementation
 */

import { Command } from 'commander';
import { showBanner } from './banner';
import { registerCommands } from './commands';
import chalk from 'chalk';
import pkg from '../../package.json';

const program = new Command();

// 1. Metadata
program.name('osc').description('A powerful CLI for managing open source projects').version(pkg.version, '-v, --version', 'output the current version');

// 2. Global Options (osc [global options] <command>)
program
  .option('--verbose', 'Enable verbose logging', false)
  .option('--config <path>', 'Path to custom config file')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      process.env.DEBUG = 'true';
      console.log(chalk.yellow('DEBUG: Verbose mode enabled'));
    }
  });

// 3. Register Commands & Banner
showBanner();
registerCommands(program);

// 4. Handle invalid commands
program.on('command:*', () => {
  console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
  process.exit(1);
});

// 5. Execution
program.parse(process.argv);

// Default to help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
