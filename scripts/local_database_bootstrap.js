'use strict';
// Loaded explicitly by the local launcher; never changes the saved environment file.
process.env.DATABASE_URL=require('./local_database').resolveLocalDatabase().dsn;
