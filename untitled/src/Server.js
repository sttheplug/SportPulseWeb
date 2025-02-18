const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "4321", // Ändra till ditt MySQL-lösenord
    database: "sensor_data",
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to MySQL database.");
});

// API för att spara hjärtfrekvensdata med `device_id`
app.post("/save-heart-rate", (req, res) => {
    const { device_id, bpm } = req.body;

    if (!device_id || !bpm) {
        return res.status(400).json({ error: "Device ID (name) and BPM are required" });
    }

    const query = "INSERT INTO heart_rate (device_id, bpm) VALUES (?, ?)";
    db.query(query, [device_id, bpm], (err, result) => {
        if (err) {
            console.error("Failed to insert data:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.status(200).json({ message: "Heart rate saved!", insertId: result.insertId });
    });
});


// API för att hämta hjärtfrekvensdata per enhet
app.get("/get-heart-rate/:device_id", (req, res) => {
    const { device_id } = req.params;
    db.query("SELECT * FROM heart_rate WHERE device_id = ? ORDER BY recorded_at DESC LIMIT 50", [device_id], (err, results) => {
        if (err) {
            console.error("Failed to fetch data:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// Starta servern
app.listen(5000, () => {
    console.log("Server running on port 5000");
});
