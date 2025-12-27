const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret';

async function testFullFlow() {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    const headers = { Authorization: `Bearer ${token}` };

    try {
        // 1. Trigger Refresh
        console.log("Triggering scan...");
        await axios.post('http://localhost:3002/api/library/refresh', {}, { headers });
        
        // 2. Poll Status until done
        let isScanning = true;
        while (isScanning) {
            const res = await axios.get('http://localhost:3002/api/library/status', { headers });
            isScanning = res.data.isScanning;
            const progress = res.data.scanProgress;
            if (isScanning && progress) {
                console.log(`Scanning: ${progress.current}/${progress.total} (${Math.round(progress.current/progress.total*100)}%)`);
            } else if (!isScanning) {
                console.log("Scan complete.");
                if (res.data.lastScanStats) {
                    console.log("Stats:", res.data.lastScanStats);
                }
            }
            await new Promise(r => setTimeout(r, 500));
        }

        // 3. Search for "song"
        console.log("Searching for 'song'...");
        const searchRes = await axios.get('http://localhost:3002/api/library/search?q=song', { headers });
        console.log(`Found ${searchRes.data.length} results.`);
        searchRes.data.forEach(s => console.log(`- ${s.artist} - ${s.title} (${s.file_path})`));

    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) console.error(err.response.data);
    }
}

testFullFlow();
