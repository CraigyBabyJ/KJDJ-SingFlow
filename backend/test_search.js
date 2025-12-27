const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET = 'test-secret';

async function testSearch() {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    console.log("Token:", token);
    
    try {
        const res = await axios.get('http://localhost:3002/api/library/search?q=test', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Search Results:", res.data);
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) console.log(err.response.data);
    }
}

testSearch();
