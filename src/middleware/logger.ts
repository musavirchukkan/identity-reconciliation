import morgan from 'morgan';
import { Express } from 'express';

export function applyLogger(app: Express) {
  app.use(morgan('combined'));
}
