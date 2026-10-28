import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Reads the authenticated user from the request, so a handler does not have to
 * accept `@Req() req: any` just to get at `req.user`.
 *
 * @example
 * ```ts
 * findAll(@CurrentUser() user: AuthenticatedUser) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();

    return request.user;
  },
);
