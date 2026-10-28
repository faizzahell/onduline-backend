/**
 * The shape of `request.user` once `JwtAuthGuard` has validated the token.
 * Produced by `JwtStrategy.validate()`.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
}
