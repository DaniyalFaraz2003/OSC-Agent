import inquirer from 'inquirer';
import { Config } from '../config/types';

interface PromptAnswers {
  githubToken?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  e2bApiKey?: string;
  profileName?: string;
}

export const promptForConfig = async (): Promise<Partial<Config>> => {
  const answers = (await inquirer.prompt([
    {
      type: 'input',
      name: 'githubToken',
      message: 'Enter your GitHub Token:',
      validate: (input: string) => input.length > 0 || 'GitHub Token is required',
    },
    {
      type: 'input',
      name: 'geminiApiKey',
      message: 'Enter your Gemini API Key:',
      validate: (input: string) => input.length > 0 || 'Gemini API Key is required',
    },
    {
      type: 'list',
      name: 'geminiModel',
      message: 'Select Gemini Model:',
      choices: ['auto', 'basic', 'advanced'],
      default: 'auto',
    },
    {
      type: 'input',
      name: 'e2bApiKey',
      message: 'Enter your E2B API Key:',
      validate: (input: string) => input.length > 0 || 'E2B API Key is required',
    },
  ])) as PromptAnswers;

  const config: Partial<Config> = {
    github: {
      token: answers.githubToken || '',
    },
    gemini: {
      api_key: answers.geminiApiKey || '',
      model_tier: answers.geminiModel as 'auto' | 'basic' | 'advanced',
    },
    e2b: {
      api_key: answers.e2bApiKey || '',
    },
  };

  return config;
};

export const promptForProfileName = async (): Promise<string> => {
  const answers = (await inquirer.prompt([
    {
      type: 'input',
      name: 'profileName',
      message: 'Enter profile name:',
      default: 'default',
      validate: (input: string) => /^[a-zA-Z0-9-_]+$/.test(input) || 'Profile name must be alphanumeric with no spaces',
    },
  ])) as PromptAnswers;

  return answers.profileName || 'default';
};
