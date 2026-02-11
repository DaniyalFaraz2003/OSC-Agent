import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
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
      logger.info(chalk.green('✓ GitHub API connection successful'));
      metrics.record('api_connection_success', 1, { service: 'github' });
    } catch (error) {
      logger.error(chalk.red('✗ GitHub API connection failed'), { error });
      metrics.record('api_connection_success', 0, { service: 'github' });
      if (axios.isAxiosError(error)) {
        logger.error(chalk.red(`  ${error.message}`));
      }
    }

    // Test Gemini
    try {
      // Simplified check, real check might involve a dummy generation call
      if (!config.gemini.api_key) throw new Error('Missing API Key');
      logger.info(chalk.green('✓ Gemini API key present (connection check skipped for now)'));
      metrics.record('api_connection_success', 1, { service: 'gemini' });
    } catch (error) {
      logger.error(chalk.red('✗ Gemini API check failed'), { error });
      metrics.record('api_connection_success', 0, { service: 'gemini' });
    }

    // Test E2B
    try {
      if (!config.e2b.api_key) throw new Error('Missing API Key');
      // Real E2B check would require instantiating a sandbox which might process intensive or cost money?
      // We can try a simple list call if available or just check existence.
      // sandbox.list() if using the SDK.
      logger.info(chalk.green('✓ E2B API key present (connection check skipped for now)'));
      metrics.record('api_connection_success', 1, { service: 'e2b' });
    } catch (error) {
      logger.error(chalk.red('✗ E2B API check failed'), { error });
      metrics.record('api_connection_success', 0, { service: 'e2b' });
    }
  }
}
