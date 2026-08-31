const fs = require('fs');
const https = require('https');
const auth = JSON.parse(fs.readFileSync('/root/.local/share/com.vercel.cli/auth.json', 'utf8'));
const body = JSON.stringify({ name: 'artflowcreativeapp.com' });
const options = {
  hostname: 'api.vercel.com',
  path: '/v9/projects/prj_DROTZuTXWIqP0aCXDtJ0xMkWAitz/domains?teamId=team_Da4vepEeO7Mr8UZvmYizxV53',
  method: 'POST',
  headers: {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`HTTP ${res.statusCode}`);
    try { console.log(JSON.stringify(JSON.parse(data), null, 2)); }
    catch { console.log(data.slice(0, 5000)); }
  });
});
req.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
req.write(body);
req.end();
