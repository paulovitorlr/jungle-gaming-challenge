import {
  Global,
  Module,
} from '@nestjs/common';

import {
  UNIT_OF_WORK,
} from '../../application/ports/unit-of-work.js';
import {
  MikroOrmUnitOfWork,
} from './mikro-orm-unit-of-work.js';

@Global()
@Module({
  providers: [
    {
      provide: UNIT_OF_WORK,
      useClass: MikroOrmUnitOfWork,
    },
  ],
  exports: [
    UNIT_OF_WORK,
  ],
})
export class DatabaseTransactionModule {}