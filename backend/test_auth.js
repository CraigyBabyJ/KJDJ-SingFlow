const axios = require('axios');

const BASE_URL = 'http://localhost:3002/api';
let token = null;

const runTest = async () => {
    try {
        console.log('--- Testing Auth Flow ---');

        // 1. Try to access protected route without token (Should fail)
        console.log('\n1. Access /api/library/status without token...');
        try {
            await axios.get(`${BASE_URL}/library/status`);
        } catch (err) {
            console.log('Result:', err.response.status, err.response.data); // Should be 401
        }

        // 2. Register a new admin user
        const username = `admin_${Date.now()}`;
        console.log(`\n2. Registering user: ${username}...`);
        try {
            const regRes = await axios.post(`${BASE_URL}/auth/register`, {
                username: username,
                password: 'password123',
                role: 'admin'
            });
            console.log('Result:', regRes.status, regRes.data);
        } catch (err) {
            console.log('Registration Failed:', err.response ? err.response.data : err.message);
        }

        // 3. Login
        console.log(`\n3. Logging in...`);
        try {
            const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
                username: username,
                password: 'password123'
            });
            console.log('Login Success. Token received.');
            token = loginRes.data.token;
        } catch (err) {
            console.log('Login Failed:', err.response ? err.response.data : err.message);
            return;
        }

        // 4. Access protected route WITH token (Should success)
        console.log('\n4. Access /api/library/status WITH token...');
        try {
            const statusRes = await axios.get(`${BASE_URL}/library/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Result:', statusRes.status, statusRes.data);
        } catch (err) {
            console.log('Failed:', err.response ? err.response.data : err.message);
        }

        // 5. Try admin route (refresh)
        console.log('\n5. Access /api/library/refresh (Admin only)...');
        try {
            const refreshRes = await axios.post(`${BASE_URL}/library/refresh`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Result:', refreshRes.status, refreshRes.data);
        } catch (err) {
            console.log('Failed:', err.response ? err.response.data : err.message);
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
};

runTest();
