import { Command } from 'commander';
import { registerIssueCommand } from './issue';
import { registerStatusCommand } from './status';
import { registerHistoryCommand } from './history';

/**
 * Register all subcommands here
 */
export function registerCommands(program: Command): void {
  program
    .command('init')
    .description('Initialize a new workspace')
    .option('-t, --template <name>', 'Template to use')
    .action((options) => {
      console.log('Initializing with options:', options);
    });

  registerStatusCommand(program);
  registerHistoryCommand(program);
  registerIssueCommand(program);
}
