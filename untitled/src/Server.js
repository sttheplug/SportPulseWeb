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
    const { timestamp, device_id, bpm, acc_x, acc_y, acc_z, note, sampling_rate } = req.body;

    if (!timestamp || !device_id) {
        return res.status(400).json({ error: "❌ Timestamp and Device ID are required!" });
    }

    try {
        if (bpm != null) {
            const bpmQuery = `INSERT INTO sensor_data (timestamp, device_id, bpm, note) VALUES (?, ?, ?, ?)`;
            await db.promise().query(bpmQuery, [timestamp, device_id, bpm, note]);
            console.log(`✅ BPM Inserted: ${device_id} - BPM: ${bpm} - Note: ${note}`);
        }

        if (acc_x != null && acc_y != null && acc_z != null) {
            const imuQuery = `INSERT INTO imu_data (timestamp, device_id, acc_x, acc_y, acc_z, note, sampling_rate) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            await db.promise().query(imuQuery, [timestamp, device_id, acc_x, acc_y, acc_z, note, sampling_rate || 26]);
            console.log(`✅ IMU Data Inserted: ${device_id} - X: ${acc_x}, Y: ${acc_y}, Z: ${acc_z} - Note: ${note} - Sampling Rate: ${sampling_rate}`);
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
            "SELECT timestamp, device_id, bpm, note FROM sensor_data WHERE device_id = ? ORDER BY timestamp ASC",
            [device_id]
        );

        const [imuData] = await db.promise().query(
            "SELECT timestamp, device_id, acc_x, acc_y, acc_z, note, sampling_rate FROM imu_data WHERE device_id = ? ORDER BY timestamp ASC",
            [device_id]
        );

        if (sensorData.length === 0 && imuData.length === 0) {
            return res.status(404).json({ error: "Ingen data hittades för enheten." });
        }

        const bpmFields = ["timestamp", "device_id", "bpm", "note"];
        const imuFields = ["timestamp", "device_id", "acc_x", "acc_y", "acc_z", "sampling_rate", "note"];

        // 🎵 BPM-tabell
        const bpmParser = new Parser({ fields: bpmFields, delimiter: ";", header: true, quote: "" });
        const bpmCsv = bpmParser.parse(sensorData);

        // 📈 IMU-tabell med sampling_rate
        const imuParser = new Parser({ fields: imuFields, delimiter: ";", header: true, quote: "" });
        const imuCsv = imuParser.parse(imuData);

        // 📝 Kombinera CSV med tydliga sektioner
        const combinedCsv = `BPM Data:\n${bpmCsv}\n\nIMU Data:\n${imuCsv}`;

        const filePath = path.join(__dirname, `sensor_data_${device_id}.csv`);
        fs.writeFileSync(filePath, combinedCsv);

        res.download(filePath, `sensor_data_${device_id}.csv`, (err) => {
            if (err) {
                console.error("❌ Fel vid filnedladdning:", err);
                res.status(500).send("Fel vid nedladdning av fil.");
            }
            fs.unlinkSync(filePath); // Radera filen efter nedladdning
        });

    } catch (error) {
        console.error("❌ Fel vid generering av CSV:", error);
        res.status(500).json({ error: "Fel vid generering av fil." });
    }
});
app.get("/download-selected-data/:device_id", async (req, res) => {
    const { device_id } = req.params;
    const sensorIds = req.query.sensorIds ? req.query.sensorIds.split(",") : [];
    const imuIds = req.query.imuIds ? req.query.imuIds.split(",") : [];

    if (!sensorIds.length && !imuIds.length) {
        return res.status(400).json({ error: "No data selected" });
    }

    try {
        let sensorData = [];
        let imuData = [];

        // Format the timestamps to be compatible with MySQL and add 1 hour
        const formatTimestamp = (timestamp) => {
            const date = new Date(timestamp);
            date.setHours(date.getHours() + 1);  // Add 1 hour to the timestamp
            return date.toISOString().slice(0, 19).replace('T', ' ');  // Format: YYYY-MM-DD HH:MM:SS
        };

        const sensorIdParams = sensorIds.map(id => formatTimestamp(id));
        const imuIdParams = imuIds.map(id => formatTimestamp(id));

        console.log("Sensor query parameters:", sensorIdParams);
        console.log("IMU query parameters:", imuIdParams);

        // Retrieve sensor data if sensorIds are provided
        if (sensorIdParams.length > 0) {
            const sensorQuery = `
                SELECT timestamp, device_id, bpm, note
                FROM sensor_data
                WHERE timestamp IN (?);
            `;
            [sensorData] = await db.promise().query(sensorQuery, [sensorIdParams]);
        }

        // Retrieve imu data if imuIds are provided
        if (imuIdParams.length > 0) {
            const imuQuery = `
                SELECT timestamp, device_id, acc_x, acc_y, acc_z, note, sampling_rate
                FROM imu_data
                WHERE timestamp IN (?);
            `;
            [imuData] = await db.promise().query(imuQuery, [imuIdParams]);
        }

        console.log("Sensor Data Retrieved:", sensorData);
        console.log("IMU Data Retrieved:", imuData);

        // CSV parsing logic
        const sensorParser = new Parser({
            fields: ["timestamp", "device_id", "bpm", "note"],
            delimiter: ";",
            header: true
        });

        const imuParser = new Parser({
            fields: ["timestamp", "device_id", "acc_x", "acc_y", "acc_z", "note", "sampling_rate"],
            delimiter: ";",
            header: true
        });

        const bpmCsv = sensorData.length > 0 ? sensorParser.parse(sensorData) : "No BPM data available";
        const imuCsv = imuData.length > 0 ? imuParser.parse(imuData) : "No IMU data available";

        const combinedCsv = `BPM Data:\n${bpmCsv}\n\nIMU Data:\n${imuCsv}`;
        res.setHeader("Content-Disposition", `attachment; filename=selected_data_${device_id}.csv`);
        res.setHeader("Content-Type", "text/csv");
        res.send(combinedCsv);

    } catch (error) {
        console.error("❌ Error generating CSV:", error);
        res.status(500).json({ error: "Error generating file." });
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
            console.log("✅ Sensor Data Fetched:", results); // Debugging
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
            console.log("✅ Imu Data Fetched:", results); // Debugging
            res.json(results);
        });
});

app.listen(5000, () => {
    console.log("🚀 Server running on port 5000");
});
