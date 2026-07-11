// Extensionless on purpose: the repo resolves with moduleResolution=Bundler
// (tsc/vitest/tsx all fine), and Turbopack cannot map "./contracts.js" onto
// the .ts source when web imports this package.
export * from "./contracts";
