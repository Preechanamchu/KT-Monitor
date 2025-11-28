const { Client } = require('pg');
const bcrypt = require('bcryptjs');

// Helper to handle CORS and Response formatting
const response = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*", // Allow all origins (Adjust for production)
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    },
    body: JSON.stringify(body)
  };
};

exports.handler = async (event, context) => {
  // Handle Preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return response(200, { message: "CORS OK" });
  }

  // Database Connection
  // IMPORTANT: Set 'DATABASE_URL' in your Netlify Environment Variables
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon.tech
  });

  try {
    await client.connect();
    
    const path = event.path.replace('/api/', '').replace('api/', ''); // Clean path
    const method = event.httpMethod;
    const data = event.body ? JSON.parse(event.body) : {};

    // --- ROUTING LOGIC ---

    // 1. LOGIN (POST /api/login)
    if (path === 'login' && method === 'POST') {
        const { pin } = data;
        
        // Fetch admin
        const res = await client.query('SELECT * FROM admins WHERE username = $1', ['admin']);
        if (res.rows.length === 0) {
            await client.end();
            return response(401, { success: false, message: "Admin not found" });
        }

        const admin = res.rows[0];
        // Compare PIN with Hash
        const match = await bcrypt.compare(pin, admin.password_hash);
        
        await client.end();
        if (match) {
            return response(200, { success: true, token: "mock-jwt-token-xyz" });
        } else {
            return response(401, { success: false, message: "Invalid PIN" });
        }
    }

    // 2. GET STAFF (GET /api/staff)
    if (path === 'staff' && method === 'GET') {
        const res = await client.query('SELECT * FROM staff ORDER BY id DESC');
        await client.end();
        return response(200, res.rows);
    }

    // 3. ADD/UPDATE STAFF (POST /api/staff)
    if (path === 'staff' && method === 'POST') {
        const { id, name, phone, lat, lng, area, status, image } = data;

        if (id) {
            // Update
            const query = `
                UPDATE staff 
                SET name=$1, phone=$2, lat=$3, lng=$4, area=$5, status=$6, image=$7 
                WHERE id=$8 RETURNING *`;
            const values = [name, phone, lat, lng, area || '', status || 'ready', image, id];
            const res = await client.query(query, values);
            await client.end();
            return response(200, res.rows[0]);
        } else {
            // Insert
            const query = `
                INSERT INTO staff (name, phone, lat, lng, area, status, image) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
            const values = [name, phone, lat, lng, area || 'กำหนดเอง', status || 'ready', image];
            const res = await client.query(query, values);
            await client.end();
            return response(201, res.rows[0]);
        }
    }

    // 4. DELETE STAFF (DELETE /api/staff)
    if (path === 'staff' && method === 'DELETE') {
        const { id } = data;
        await client.query('DELETE FROM staff WHERE id = $1', [id]);
        await client.end();
        return response(200, { success: true, id });
    }

    await client.end();
    return response(404, { message: "Endpoint not found" });

  } catch (error) {
    console.error("Database Error:", error);
    await client.end();
    return response(500, { error: error.message });
  }
};