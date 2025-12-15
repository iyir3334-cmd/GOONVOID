import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// Proxy endpoint
app.get('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;

        if (!targetUrl) {
            return res.status(400).send('Missing url param');
        }

        console.log('[Server] Proxying request to:', targetUrl);

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });

        if (!response.ok) {
            console.error(`[Server] Upstream Block/Error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'text/html';
        const text = await response.text();

        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status).send(text);

    } catch (e) {
        console.error('[Server] Proxy Error:', e);
        res.status(500).send(`Proxy Error: ${e.message}`);
    }
});

// Handle React routing, return all requests to React app
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Production server running on http://localhost:${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, 'dist')}`);
});
