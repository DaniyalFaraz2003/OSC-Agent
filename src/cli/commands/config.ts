import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { promptForConfig } from '../prompts';
import { ConfigValidator } from '../config-validator';
import { loadConfig } from '../../config/loader';
import { Config } from '../../config/types';

export function registerConfigCommand(program: Command): void {
  const configCommand = program.command('config').description('Manage configuration');

  configCommand
    .command('init')
    .description('Initialize configuration interactively')
    .action(async () => {
      console.log(chalk.blue('Initializing configuration...'));
      const config = await promptForConfig();

      // Convert to .env format
      let envContent = '';

      if (config.github?.token) {
        envContent += `GITHUB_TOKEN=${config.github.token}\n`;
      }
      if (config.gemini?.api_key) {
        envContent += `GEMINI_API_KEY=${config.gemini.api_key}\n`;
      }
      if (config.gemini?.model_tier) {
        envContent += `GEMINI_MODEL_TIER=${config.gemini.model_tier}\n`;
      }
      if (config.e2b?.api_key) {
        envContent += `E2B_API_KEY=${config.e2b.api_key}\n`;
      }

      const targetPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(targetPath)) {
        console.log(chalk.yellow('.env file already exists. Overwriting...'));
      }

      fs.writeFileSync(targetPath, envContent);
      console.log(chalk.green(`Configuration saved to ${targetPath}`));
    });

  configCommand
    .command('validate')
    .description('Validate current configuration')
    .action(async () => {
      try {
        const config = loadConfig();
        const validation = ConfigValidator.validate(config);

        if (validation.valid) {
          console.log(chalk.green('✓ Configuration structure is valid.'));
        } else {
          console.log(chalk.red('✗ Configuration structure is invalid:'));
          validation.errors?.forEach((e) => console.log(chalk.red(`  - ${e}`)));
          return;
        }

        await ConfigValidator.testConnections(config);
      } catch (error) {
        console.error(chalk.red('Failed to load configuration:'));
        if (error instanceof Error) {
          console.error(chalk.red(error.message));
        }
      }
    });

  configCommand
    .command('show')
    .description('Show current configuration')
    .action(() => {
      try {
        const config = loadConfig();
        // Mask secrets
        const maskedConfig = JSON.parse(JSON.stringify(config)) as Config;
        if (maskedConfig.github?.token) maskedConfig.github.token = '********';
        if (maskedConfig.gemini?.api_key) maskedConfig.gemini.api_key = '********';
        if (maskedConfig.e2b?.api_key) maskedConfig.e2b.api_key = '********';

        console.log(JSON.stringify(maskedConfig, null, 2));
      } catch (error) {
        console.error(chalk.red('Failed to load configuration:'));
        if (error instanceof Error) {
          console.error(chalk.red(error.message));
        }
      }
    });
}
