const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Create MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Aprilapril23.",
    database: "sensor_data",
});

// 🔹 Check MySQL connection
db.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
        return;
    }
    console.log("✅ Connected to MySQL database.");
});

// 🔹 Save sensor data (BPM & IMU separately)
app.post("/save-sensor-data", async (req, res) => {
    const { timestamp, device_id, bpm, acc_x, acc_y, acc_z } = req.body;

    if (!timestamp || !device_id) {
        return res.status(400).json({ error: "❌ Timestamp and Device ID are required!" });
    }

    try {
        // 🩺 Store BPM in `sensor_data` if it's not null
        if (bpm != null) {
            const bpmQuery = `INSERT INTO sensor_data (timestamp, device_id, bpm) VALUES (?, ?, ?)`;
            await db.promise().query(bpmQuery, [timestamp, device_id, bpm]);
            console.log(`✅ BPM Inserted: ${device_id} - BPM: ${bpm}`);
        }

        // 📡 Store IMU data in `imu_data` if all values are provided
        if (acc_x != null && acc_y != null && acc_z != null) {
            const imuQuery = `INSERT INTO imu_data (timestamp, device_id, acc_x, acc_y, acc_z) VALUES (?, ?, ?, ?, ?)`;
            await db.promise().query(imuQuery, [timestamp, device_id, acc_x, acc_y, acc_z]);
            console.log(`✅ IMU Data Inserted: ${device_id} - X: ${acc_x}, Y: ${acc_y}, Z: ${acc_z}`);
        }

        res.status(200).json({ message: "Data saved successfully!" });

    } catch (error) {
        console.error("❌ Database Insert Error:", error);
        res.status(500).json({ error: "Database insert failed!" });
    }
});

// 🔹 Get the latest 50 BPM readings
app.get("/get-sensor-data/:device_id", (req, res) => {
    const { device_id } = req.params;

    db.query("SELECT * FROM sensor_data WHERE device_id = ? ORDER BY timestamp DESC LIMIT 50",
        [device_id], (err, results) => {
            if (err) {
                console.error("❌ Failed to fetch data:", err);
                return res.status(500).json({ error: "Database error" });
            }
            res.json(results);
        });
});

// 🔹 Get the latest 50 IMU readings
app.get("/get-imu-data/:device_id", (req, res) => {
    const { device_id } = req.params;

    db.query("SELECT * FROM imu_data WHERE device_id = ? ORDER BY timestamp DESC LIMIT 50",
        [device_id], (err, results) => {
            if (err) {
                console.error("❌ Failed to fetch IMU data:", err);
                return res.status(500).json({ error: "Database error" });
            }
            res.json(results);
        });
});

// 🔹 Start server
app.listen(5000, () => {
    console.log("🚀 Server running on port 5000");
});
