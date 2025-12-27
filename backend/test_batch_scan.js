const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET = 'test-secret';
const API_URL = 'http://localhost:3002/api';

async function testBatchScan() {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    console.log("Admin Token generated.");

    try {
        // Trigger Scan
        console.log("Triggering Scan...");
        try {
            await axios.post(`${API_URL}/library/refresh`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log("Scan triggered successfully.");
        } catch (e) {
            if (e.response && e.response.status === 409) {
                console.log("Scan already in progress, joining...");
            } else {
                throw e;
            }
        }

        // Poll Status
        let scanning = true;
        while (scanning) {
            const res = await axios.get(`${API_URL}/library/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const status = res.data;
            scanning = status.isScanning;
            
            if (scanning) {
                process.stdout.write(`Scanning... ${status.scanProgress ? status.scanProgress.current : '?'} / ${status.scanProgress ? status.scanProgress.total : '?'} \r`);
                await new Promise(r => setTimeout(r, 100)); // Poll every 100ms
            } else {
                console.log("\nScan Complete.");
                console.log("Stats:", status.lastScanStats);
                console.log("Total Songs:", status.songCount);
            }
        }

    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) console.log(err.response.data);
    }
}

testBatchScan();
