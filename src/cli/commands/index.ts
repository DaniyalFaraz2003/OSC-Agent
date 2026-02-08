import { Command } from 'commander';
import { registerIssueCommand } from './issue';

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

  // Example of another command
  program
    .command('status')
    .description('Check the status of the project')
    .action(() => {
      console.log('Project is healthy.');
    });

  registerIssueCommand(program);
}
