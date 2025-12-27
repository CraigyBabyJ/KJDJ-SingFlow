const axios = require('axios');

const BASE_URL = 'http://localhost:3002/api';
let token = null;

const runTest = async () => {
    try {
        console.log('--- Testing Queue System ---');

        // 1. Login
        const username = `queue_tester_${Date.now()}`;
        console.log(`\n1. Login/Register as ${username}...`);
        
        try {
             await axios.post(`${BASE_URL}/auth/register`, {
                username, password: 'password', role: 'admin' // Admin needed for delete
            });
        } catch (e) {}

        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            username, password: 'password'
        });
        token = loginRes.data.token;
        console.log('Login Success.');

        // 2. Add to Queue
        // We need a valid song ID. Since we don't know what's in the DB, 
        // we'll try ID 1. If it fails due to FK constraint, we know the DB is empty.
        // But let's assume at least one song exists or we insert a dummy one directly if we could.
        // For now, let's try adding. If it fails with SQLITE_CONSTRAINT, it proves the endpoint works but data is missing.
        
        console.log('\n2. Add to Queue (Song ID 1, Singer "Alice")...');
        let queueId;
        try {
            const addRes = await axios.post(`${BASE_URL}/queue`, {
                songId: 1,
                singerName: 'Alice'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Result:', addRes.status, addRes.data);
            queueId = addRes.data.queueId;
        } catch (err) {
            console.log('Failed:', err.response ? err.response.data : err.message);
            // If failed, likely no song with ID 1. That's fine for structure testing.
        }

        // 3. Get Queue
        console.log('\n3. Get Queue...');
        try {
            const getRes = await axios.get(`${BASE_URL}/queue`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Queue Length:', getRes.data.length);
            if (getRes.data.length > 0) {
                console.log('First Item:', getRes.data[0]);
            }
        } catch (err) {
            console.log('Failed:', err.response ? err.response.data : err.message);
        }

        // 4. Delete from Queue (if we added one)
        if (queueId) {
            console.log(`\n4. Remove Queue Item ${queueId}...`);
            try {
                const delRes = await axios.delete(`${BASE_URL}/queue/${queueId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('Result:', delRes.status, delRes.data);
            } catch (err) {
                console.log('Failed:', err.response ? err.response.data : err.message);
            }
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
};

runTest();
