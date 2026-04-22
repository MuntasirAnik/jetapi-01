async function run() {
  const login = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@postclone.com', password: 'password123' })
  });
  const { access_token } = await login.json();
  
  const headers = { 
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + access_token
  };

  const wsRes = await fetch('http://localhost:3001/workspaces', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Temp WS' })
  });
  const ws = await wsRes.json();

  const colRes = await fetch('http://localhost:3001/collections', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Temp Col', workspaceId: ws.id })
  });
  const col = await colRes.json();

  const payload = {
    method: "GET",
    url: "",
    name: "Test Request",
    folder: null,
    collectionId: col.id
  };

  const res = await fetch('http://localhost:3001/requests', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  
  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}

run().catch(console.error);
