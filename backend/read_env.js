const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password', // Add correct password if needed, or leave blank/default
    database: 'postman_clone',
  });

  const [rows] = await connection.execute('SELECT * FROM environment');
  console.log(JSON.stringify(rows, null, 2));

  await connection.end();
}

main().catch(console.error);
