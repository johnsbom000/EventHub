#!/usr/bin/env node
import { up } from '../migrations/0001_initial_schema_and_seed';
import * as dotenv from 'dotenv';
import { Command } from 'commander';

const program = new Command();

dotenv.config();

program
  .name('migrate')
  .description('CLI to manage database migrations')
  .version('1.0.0');

program
  .command('up')
  .description('Run migrations')
  .action(async () => {
    try {
      console.log('Running migrations...');
      await up();
      console.log('Migrations completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  });

program
  .command('down')
  .description('Rollback migrations')
  .action(async () => {
    try {
      console.log('Rolling back migrations...');
      const { down } = await import('../migrations/0001_initial_schema_and_seed');
      await down();
      console.log('Rollback completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Rollback failed:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
