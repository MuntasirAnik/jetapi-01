const { Client } = require('pg');

async function check() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password', // check if password is correct? JetAPI backend uses default docker pg?
    database: 'jetapi'
  });
  
  try {
    await client.connect();
    const res = await client.query("SELECT id, name, body FROM request_item WHERE name = 'Create' LIMIT 5");
    console.log(`Found ${res.rows.length} rows`);
    for (const row of res.rows) {
      console.log(`ID: ${row.id}, Name: ${row.name}`);
      console.log(`Body: ${row.body}`);
      console.log('---');
    }
  } catch (err) {
    console.error(err.message);
  } finally {
    await client.end();
  }
}

check();
