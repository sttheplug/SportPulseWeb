const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors()); // Enable CORS for frontend
app.use(express.json()); // Parse JSON requests

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",       // Change to your MySQL username
    password: "Aprilapril23.", // Change to your MySQL password
    database: "sensor_data",
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to MySQL database.");
});

// API endpoint to save heart rate data
app.post("/save-heart-rate", (req, res) => {
    const { bpm } = req.body;
    if (!bpm) {
        return res.status(400).json({ error: "BPM value is required" });
    }

    const query = "INSERT INTO heart_rate (bpm) VALUES (?)";
    db.query(query, [bpm], (err, result) => {
        if (err) {
            console.error("Failed to insert data:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.status(200).json({ message: "Heart rate saved!" });
    });
});

// API to fetch stored heart rate data
app.get("/get-heart-rate", (req, res) => {
    db.query("SELECT * FROM heart_rate ORDER BY timestamp DESC LIMIT 50", (err, results) => {
        if (err) {
            console.error("Failed to fetch data:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// Start the server
app.listen(5000, () => {
    console.log("Server running on port 5000");
});
