const axios = require('axios');
const { assert } = require('console');

const API_URL = 'http://localhost:3002/api';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTest() {
    console.log("Starting Verification Test...");

    try {
        // 1. Register Users
        const hostA = { username: 'hostA_' + Date.now(), password: 'password', role: 'HOST' };
        const hostB = { username: 'hostB_' + Date.now(), password: 'password', role: 'HOST' };
        const singerS = { username: 'singerS_' + Date.now(), password: 'password', role: 'SINGER' };

        console.log("Registering users...");
        await axios.post(`${API_URL}/auth/register`, hostA);
        await axios.post(`${API_URL}/auth/register`, hostB);
        await axios.post(`${API_URL}/auth/register`, singerS);

        // 2. Login & Get IDs/Tokens
        console.log("Logging in...");
        const resA = await axios.post(`${API_URL}/auth/login`, { username: hostA.username, password: hostA.password });
        const tokenA = resA.data.token;
        const idA = resA.data.user.id;

        const resB = await axios.post(`${API_URL}/auth/login`, { username: hostB.username, password: hostB.password });
        const tokenB = resB.data.token;
        const idB = resB.data.user.id;

        const resS = await axios.post(`${API_URL}/auth/login`, { username: singerS.username, password: singerS.password });
        const tokenS = resS.data.token;

        // 3. Singer Queues for Host A
        // Need a song ID. I'll search for one.
        console.log("Searching for songs...");
        const searchRes = await axios.get(`${API_URL}/library/search?q=a`, { headers: { Authorization: `Bearer ${tokenS}` } });
        if (searchRes.data.length === 0) {
            console.error("No songs found! Cannot test queue.");
            return;
        }
        const songId = searchRes.data[0].id;

        console.log(`Singer S queueing song ${songId} for Host A (${idA})...`);
        await axios.post(`${API_URL}/queue`, 
            { songId, singerName: singerS.username, hostId: idA }, 
            { headers: { Authorization: `Bearer ${tokenS}` } }
        );

        // 4. Singer Queues for Host B
        console.log(`Singer S queueing song ${songId} for Host B (${idB})...`);
        await axios.post(`${API_URL}/queue`, 
            { songId, singerName: singerS.username, hostId: idB }, 
            { headers: { Authorization: `Bearer ${tokenS}` } }
        );

        // 5. Verify Host A Queue
        console.log("Verifying Host A Queue...");
        const queueA = await axios.get(`${API_URL}/queue`, { headers: { Authorization: `Bearer ${tokenA}` } });
        console.log(`Host A Queue Length: ${queueA.data.length}`);
        
        // Host A should see 1 item (the one queued for them)
        // Note: If previous tests left data, it might be more. But new host should be empty initially?
        // Wait, 'hostA' is a new user. So their queue should be empty initially.
        // BUT 'queue_entries' are persisted. If I queue for 'idA', and 'idA' is new...
        // Ah, `getQueue` filters by `host_id`.
        // So yes, should be 1.
        
        if (queueA.data.length !== 1) {
            console.error("FAIL: Host A should have exactly 1 song.");
        } else {
            console.log("PASS: Host A has 1 song.");
            if (queueA.data[0].host_id !== idA) {
                console.error("FAIL: Queue entry host_id mismatch for Host A");
            } else {
                console.log("PASS: Queue entry host_id matches Host A.");
            }
        }

        // 6. Verify Host B Queue
        console.log("Verifying Host B Queue...");
        const queueB = await axios.get(`${API_URL}/queue`, { headers: { Authorization: `Bearer ${tokenB}` } });
        console.log(`Host B Queue Length: ${queueB.data.length}`);

        if (queueB.data.length !== 1) {
            console.error("FAIL: Host B should have exactly 1 song.");
        } else {
            console.log("PASS: Host B has 1 song.");
            if (queueB.data[0].host_id !== idB) {
                 console.error("FAIL: Queue entry host_id mismatch for Host B");
            } else {
                console.log("PASS: Queue entry host_id matches Host B.");
            }
        }
        
        // 7. Test Spoofing
        console.log("Testing Spoofing (Singer tries to queue as 'FakeElvis')...");
        try {
            await axios.post(`${API_URL}/queue`, 
                { songId, singerName: "FakeElvis", hostId: idA }, 
                { headers: { Authorization: `Bearer ${tokenS}` } }
            );
            // We expect the server to IGNORE "FakeElvis" and use "singerS.username".
            // So this call will SUCCEED, but the entry will have singer_name = singerS.username.
            
            const queueACheck = await axios.get(`${API_URL}/queue`, { headers: { Authorization: `Bearer ${tokenA}` } });
            const lastEntry = queueACheck.data[queueACheck.data.length - 1];
            console.log(`Spoof Attempt Result Name: ${lastEntry.singer_name}`);
            
            if (lastEntry.singer_name === "FakeElvis") {
                console.error("FAIL: Security Breach! Singer spoofed name.");
            } else if (lastEntry.singer_name === singerS.username) {
                console.log("PASS: Server enforced correct identity.");
            } else {
                console.error(`FAIL: Unexpected name: ${lastEntry.singer_name}`);
            }

        } catch (err) {
            console.error("Spoof request failed (unexpectedly? or correctly?)", err.message);
        }

    } catch (err) {
        console.error("Test Failed:", err.response ? err.response.data : err.message);
    }
}

runTest();
