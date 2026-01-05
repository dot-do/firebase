/**
 * Firebase Auth Module
 *
 * Re-exports all public APIs from the auth module.
 */

// Identity Toolkit API handlers and types
export {
  handleSignUp,
  handleSignInWithPassword,
  handleLookup,
  handleUpdate,
  handleDelete,
  handleSendOobCode,
  setProjectId,
  getProjectId,
  type IdentityToolkitError,
  type SignUpRequest,
  type SignUpResponse,
  type SignInWithPasswordRequest,
  type SignInWithPasswordResponse,
  type LookupRequest,
  type LookupResponse,
  type UpdateRequest,
  type UpdateResponse,
  type DeleteRequest,
  type DeleteResponse,
  type SendOobCodeRequest,
  type SendOobCodeResponse,
} from './identity-toolkit.js'

// JWT token handling
export {
  rotateSigningKey,
  generateFirebaseToken,
  verifyFirebaseToken,
  fetchGooglePublicKeys,
  clearGooglePublicKeyCache,
  setVerificationMode,
  getVerificationMode,
  type GenerateTokenOptions,
  type VerifiedTokenPayload,
  type VerifyTokenOptions,
  type VerificationMode,
} from './jwt.js'

// User management
export {
  generateUserId,
  hashPassword,
  verifyPassword,
  isValidEmail,
  isValidPassword,
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  deleteUser,
  updateLastLoginAt,
  updateLastRefreshAt,
  clearAllUsers,
  type UserRecord,
} from './users.js'

// Auth emulator server
export { startEmulator, stopEmulator } from './emulator.js'
