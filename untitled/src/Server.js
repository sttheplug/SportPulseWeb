const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Parser } = require("json2csv"); // Lägg till json2csv för att konvertera JSON till CSV


const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Create MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "4321Moses",
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
        if (bpm != null) {
            const bpmQuery = `INSERT INTO sensor_data (timestamp, device_id, bpm) VALUES (?, ?, ?)`;
            await db.promise().query(bpmQuery, [timestamp, device_id, bpm]);
            console.log(`✅ BPM Inserted: ${device_id} - BPM: ${bpm}`);
        }

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

// Installera json2csv: npm install json2csv

app.get("/download-data/:device_id", async (req, res) => {
    const { device_id } = req.params;

    try {
        const [sensorData] = await db.promise().query(
            "SELECT * FROM sensor_data WHERE device_id = ? ORDER BY timestamp ASC",
            [device_id]
        );

        const [imuData] = await db.promise().query(
            "SELECT * FROM imu_data WHERE device_id = ? ORDER BY timestamp ASC",
            [device_id]
        );

        if (sensorData.length === 0 && imuData.length === 0) {
            return res.status(404).json({ error: "Ingen data hittades för enheten." });
        }

        const mergedData = [];

        // Kombinera sensor- och IMU-data i ett gemensamt format
        sensorData.forEach((entry) => {
            mergedData.push({
                timestamp: entry.timestamp,
                device_id: entry.device_id,
                bpm: entry.bpm || "",
                acc_x: "",
                acc_y: "",
                acc_z: "",
            });
        });

        imuData.forEach((entry) => {
            mergedData.push({
                timestamp: entry.timestamp,
                device_id: entry.device_id,
                bpm: "",
                acc_x: entry.acc_x,
                acc_y: entry.acc_y,
                acc_z: entry.acc_z,
            });
        });

        // Konvertera till CSV
        const fields = ["timestamp", "device_id", "bpm", "acc_x", "acc_y", "acc_z"];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(mergedData);

        const filePath = path.join(__dirname, `sensor_data_${device_id}.csv`);
        fs.writeFileSync(filePath, csv);

        res.download(filePath, `sensor_data_${device_id}.csv`, (err) => {
            if (err) {
                console.error("❌ Fel vid filnedladdning:", err);
                res.status(500).send("Fel vid nedladdning av fil.");
            }
            fs.unlinkSync(filePath); // Radera filen efter nedladdning för att undvika skräp
        });
    } catch (error) {
        console.error("❌ Fel vid generering av CSV:", error);
        res.status(500).json({ error: "Fel vid generering av fil." });
    }
});

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

app.listen(5000, () => {
    console.log("🚀 Server running on port 5000");
});
