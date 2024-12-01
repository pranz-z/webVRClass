const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Initialize the Express app
const app = express();
app.use(bodyParser.json()); // Parse JSON request body
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded data

// Enable CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

// Configure PostgreSQL connection
const pool = new Pool({
    user: 'root', // Replace with your PostgreSQL username
    host: 'dpg-ct5ill56l47c73fq6o7g-a', // Replace with your host
    database: 'vrified', // Replace with your database name
    password: 'lFa99pMkQuSLSwAPljK0DoJaeqPkR3XW', // Replace with your database password
    port: 5432, // Default PostgreSQL port
});

// Route to handle user registration
app.post('/register', async (req, res) => {
    const { firstname, lastname, gender, birthday, acctype, email, password } = req.body;

    try {
        // Validate input
        if (!firstname || !lastname || !gender || !birthday || !acctype || !email || !password) {
            return res.status(400).send("validation_error");
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user into the database
        const query = `
            INSERT INTO users (firstname, lastname, birthday, gender, email, acctype, password)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await pool.query(query, [firstname, lastname, birthday, gender, email, acctype, hashedPassword]);

        // Respond with success
        res.send("success");
    } catch (error) {
        console.error("Error in /register:", error.message);

        // Check for unique constraint violation (error code 23505)
        if (error.code === '23505') {
            res.status(409).send("duplicate"); // Duplicate entry
        } else {
            res.status(500).send(`error: ${error.message}`); // Generic error response
        }
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
