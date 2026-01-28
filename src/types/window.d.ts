/// <reference types="vite/client" />

/**
 * Global type augmentation for test utilities
 * 
 * This file extends the Window interface to include test-specific properties
 * used across the test suite, avoiding repeated inline type assertions.
 */
declare global {
  interface Window {
    /**
     * Flag used in test setup to disable global fetch stub
     * @see src/test/setup.js
     */
    __DISABLE_GLOBAL_FETCH_STUB?: boolean;
  }
}

export {};
