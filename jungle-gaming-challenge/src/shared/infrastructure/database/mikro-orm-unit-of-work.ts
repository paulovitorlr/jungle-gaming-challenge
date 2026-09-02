import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import {
  UnitOfWork,
} from '../../application/ports/unit-of-work.js';

@Injectable()
export class MikroOrmUnitOfWork implements UnitOfWork {
  constructor(
    private readonly entityManager: EntityManager,
  ) {}

  execute<T>(
    work: () => Promise<T>,
  ): Promise<T> {
    return this.entityManager.transactional(
      async () => work(),
    );
  }
}