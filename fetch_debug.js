const http = require('http');
const fs = require('fs');

const targetUrl = 'http://localhost:5173/proxy?url=' + encodeURIComponent('https://www.xvideos.com/pornstars/violet-myers');

http.get(targetUrl, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log(`Fetched ${data.length} bytes`);
        fs.writeFileSync('debug_xvideos.html', data);
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
