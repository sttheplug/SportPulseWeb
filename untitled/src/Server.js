const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Skapa MySQL-anslutning
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "4321", // Byt till ditt MySQL-lösenord
    database: "sensor_data",
});

// 🔹 Kontrollera MySQL-anslutning
db.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
        return;
    }
    console.log("✅ Connected to MySQL database.");
});

// 🔹 API: Spara sensor-data (heart rate & accelerometer)
app.post("/save-sensor-data", (req, res) => {
    const { timestamp, device_id, bpm, acc_x, acc_y, acc_z } = req.body;

    if (!device_id || (!bpm && acc_x === null && acc_y === null && acc_z === null)) {
        return res.status(400).json({ error: "❌ Device ID and at least one data point (BPM or accelerometer) required!" });
    }

    // 🔹 SQL Query för att spara data
    const query = `
        INSERT INTO polarsensorconnection.sensor_data (timestamp, device_id, bpm, acc_x, acc_y, acc_z)
        VALUES (?, ?, ?, ?, ?, ?)
    `;


    db.query(query, [timestamp, device_id, bpm, acc_x, acc_y, acc_z], (err, result) => {
        if (err) {
            console.error("❌ Database Insert Error:", err);
            return res.status(500).json({ error: "Database insert failed!" });
        }

        console.log(`✅ Data Inserted: ${device_id} - BPM: ${bpm} - X: ${acc_x}, Y: ${acc_y}, Z: ${acc_z}`);
        res.status(200).json({ message: "Data saved successfully!" });
    });
});

// 🔹 API: Hämta de senaste 50 värdena per enhet
app.get("/get-sensor-data/:device_id", (req, res) => {
    const { device_id } = req.params;

    db.query("SELECT * FROM sensor_data WHERE device_id = ? ORDER BY timestamp DESC LIMIT 50", [device_id], (err, results) => {
        if (err) {
            console.error("❌ Failed to fetch data:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// 🔹 Starta servern
app.listen(5000, () => {
    console.log("🚀 Server running on port 5000");
});
