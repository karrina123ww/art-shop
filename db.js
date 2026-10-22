const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: 'OH781auv82fi',
    host: 'localhost',
    port: 5432,
    database: 'art-shop'
});

module.exports = pool;