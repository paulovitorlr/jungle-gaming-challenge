import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { UnitOfWork } from '../../application/ports/unit-of-work.js';
import { UniqueConstraintViolationError } from '../../application/errors/unique-constraint-violation.error.js';

@Injectable()
export class MikroOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly entityManager: EntityManager) {}

  async execute<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await this.entityManager.transactional(async () => work());
    } catch (error: unknown) {
      const constraint = this.getUniqueConstraint(error);

      if (constraint) {
        throw new UniqueConstraintViolationError(constraint);
      }

      throw error;
    }
  }

  private getUniqueConstraint(error: unknown): string | undefined {
    let current: unknown = error;

    while (current && typeof current === 'object') {
      const candidate = current as {
        code?: string;
        constraint?: string;
        cause?: unknown;
      };

      if (candidate.code === '23505') {
        return candidate.constraint;
      }

      current = candidate.cause;
    }

    return undefined;
  }
}
