import { Module } from '@nestjs/common';

import { UNIT_OF_WORK } from '../../application/ports/unit-of-work.js';
import { MikroOrmUnitOfWork } from './mikro-orm-unit-of-work.js';

@Module({
  providers: [
    MikroOrmUnitOfWork,
    {
      provide: UNIT_OF_WORK,
      useExisting: MikroOrmUnitOfWork,
    },
  ],
  exports: [
    UNIT_OF_WORK,
  ],
})
export class DatabaseTransactionModule {}