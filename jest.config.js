module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // 1. Tell Jest to treat .ts files as ESM
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    // 2. This allows Jest to transpile the ESM code inside node_modules
    '^.+\\.(ts|js|mjs)$': ['ts-jest', { useESM: true }],
  },
  transformIgnorePatterns: [
    // 3. Keep this, but ensure the regex is clean
    'node_modules/(?!(@e2b|e2b|chalk|ansi-styles)/)',
  ],
  // This helps with Chalk's internal subpath imports (like #ansi-styles)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.interface.ts', '!src/**/*.type.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'json', 'mjs'],
  verbose: true,
};
