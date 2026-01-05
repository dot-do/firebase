import { startEmulator, stopEmulator } from '../src/auth/emulator.js'

export async function setup() {
  console.log('Starting Firebase Auth Emulator...')
  await startEmulator()
}

export async function teardown() {
  console.log('Stopping Firebase Auth Emulator...')
  await stopEmulator()
}
