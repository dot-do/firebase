/**
 * Firebase Emulator Suite
 *
 * Main entry point that re-exports all modules.
 */

// Auth module - Firebase Authentication emulator
export * as auth from './auth/index.js'

// Firestore module - Cloud Firestore emulator
export * as firestore from './firestore/index.js'

// Storage module - Cloud Storage emulator
export * as storage from './storage/index.js'

// Functions module - Cloud Functions emulator
export * as functions from './functions/index.js'

// Rules module - Security Rules parser and evaluator
export * as rules from './rules/index.js'
