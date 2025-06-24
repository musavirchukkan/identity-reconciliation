import helmet from 'helmet';
import { Express } from 'express';

export function applySecurity(app: Express) {
  app.use(helmet());
}
