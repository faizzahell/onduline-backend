import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * A named wrapper around the `jwt` strategy, so controllers do not scatter the
 * magic string `AuthGuard('jwt')` across the codebase.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
