/** @type {import('jest').Config} */
module.exports = {
  // GuardBox ships on iOS only, so tests run against the iOS platform modules.
  preset: 'jest-expo/ios',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    'src/components/**/*.{ts,tsx}',
    'src/app/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/types.ts',
  ],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  // CI fails if coverage drops below these. Raise them as coverage grows;
  // never lower them to get a change through. Business logic (src/lib) is held
  // to a higher bar than screens.
  coverageThreshold: {
    global: { statements: 75, branches: 70, functions: 65, lines: 80 },
    './src/lib/': { statements: 90, branches: 80, functions: 85, lines: 90 },
  },
};
