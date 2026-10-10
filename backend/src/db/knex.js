import knex from 'knex';
import knexConfig from '../../knexfile.js';
import { config } from '../config/index.js';

const env = config.isTest ? 'test' : config.NODE_ENV === 'production' ? 'production' : 'development';

export const db = knex(knexConfig[env] || knexConfig.development);
