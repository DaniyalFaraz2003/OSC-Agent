import axios from 'axios';
import { Config, ConfigSchema } from '../config/validator';
import chalk from 'chalk';

export class ConfigValidator {
  static validate(config: unknown): { valid: boolean; errors?: string[] } {
    const result = ConfigSchema.safeParse(config);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }

    return { valid: true };
  }

  static async testConnections(config: Config): Promise<void> {
    console.log(chalk.blue('\nTesting API connections...'));

    // Test GitHub
    try {
      await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${config.github.token}`,
          'User-Agent': 'OSC-Agent',
        },
      });
      console.log(chalk.green('✓ GitHub API connection successful'));
    } catch (error) {
      console.log(chalk.red('✗ GitHub API connection failed'));
      if (axios.isAxiosError(error)) {
        console.log(chalk.red(`  ${error.message}`));
      }
    }

    // Test Gemini
    try {
      // Simplified check, real check might involve a dummy generation call
      if (!config.gemini.api_key) throw new Error('Missing API Key');
      console.log(chalk.green('✓ Gemini API key present (connection check skipped for now)'));
    } catch (error) {
      console.log(chalk.red('✗ Gemini API check failed'));
    }

    // Test E2B
    try {
      if (!config.e2b.api_key) throw new Error('Missing API Key');
      // Real E2B check would require instantiating a sandbox which might process intensive or cost money?
      // We can try a simple list call if available or just check existence.
      // sandbox.list() if using the SDK.
      console.log(chalk.green('✓ E2B API key present (connection check skipped for now)'));
    } catch (error) {
      console.log(chalk.red('✗ E2B API check failed'));
    }
  }
}
