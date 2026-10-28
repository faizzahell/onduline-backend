import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  RbacService,
  SUPER_ADMINISTRATOR_ROLE,
} from '../../modules/rbac/rbac.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Checks the `@Roles()` metadata on the handler and the controller.
 *
 * Must run after `JwtAuthGuard` because it relies on `request.user`. A handler
 * with no `@Roles()` passes untouched, so this guard only ever narrows access.
 * SUPER_ADMINISTRATOR always passes, matching the bypass in `RbacService`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    const user = request.user;

    if (!user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }

    const allowed = await this.rbacService.hasAnyRole(user.id, [
      SUPER_ADMINISTRATOR_ROLE,
      ...requiredRoles,
    ]);

    if (!allowed) {
      throw new ForbiddenException(
        `Role denied, one of the following is required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
