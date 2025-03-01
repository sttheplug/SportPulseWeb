import React, { useState } from "react";
import "./PolarSensor.css";
import {Bar, Line} from "react-chartjs-2";
import { openDB } from "idb";
import { Download } from "lucide-react";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement, // Required for Bar chart
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from "chart.js";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    BarElement, // Required for Bar chart
    LineElement,
    Title,
    Tooltip,
    Legend
);
const PolarSensor = () => {
    const [devices, setDevices] = useState([]);
    const [heartRateData, setHeartRateData] = useState({});
    const [imuData, setImuData] = useState({});
    const [measuringDevices, setMeasuringDevices] = useState({});
    const [connecting, setConnecting] = useState(false);
    const [downloadReadyDevices, setDownloadReadyDevices] = useState({});

    const connectToSensor = async () => {
        try {
            setConnecting(true);
            console.log("🔄 Requesting Bluetooth Device...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: "Polar" }],
                optionalServices: ["heart_rate", "fb005c80-02e7-f387-1cad-8acd2d8df0c8"]
            });
            console.log(`🔗 Connected to ${device.name}`);
            const server = await device.gatt.connect();
            const heartRateService = await server.getPrimaryService("heart_rate");
            console.log(`✅ Found Heart Rate Service`);
            const heartRateCharacteristic = await heartRateService.getCharacteristic("00002a37-0000-1000-8000-00805f9b34fb");
            const imuService = await server.getPrimaryService("fb005c80-02e7-f387-1cad-8acd2d8df0c8");
            console.log(`✅ Found IMU Service`);
            const imuControlCharacteristic = await imuService.getCharacteristic("fb005c81-02e7-f387-1cad-8acd2d8df0c8");
            console.log(`✅ Found IMU Control Characteristic`);
            const imuDataCharacteristic = await imuService.getCharacteristic("fb005c82-02e7-f387-1cad-8acd2d8df0c8");
            console.log(`✅ Found IMU Data Characteristic`);
            setDevices((prevDevices) => [
                ...prevDevices.filter(({ device: d }) => d.id !== device.id),
                { device, heartRateCharacteristic, imuDataCharacteristic, imuControlCharacteristic }
            ]);
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: false }));
        } catch (error) {
            console.error("❌ Connection failed:", error);
        } finally {
            setConnecting(false);
        }
    };


    const startMeasurement = async (device) => {
        try {
            console.log(`🚀 Starting measurement for ${device.name}`);
            const deviceData = devices.find(({ device: d }) => d === device);
            if (!deviceData) {
                console.error("❌ Device not found");
                return;
            }
            const { heartRateCharacteristic, imuControlCharacteristic, imuDataCharacteristic } = deviceData;
            if (deviceData.heartRateHandler) {
                heartRateCharacteristic.removeEventListener("characteristicvaluechanged", deviceData.heartRateHandler);
            }
            if (deviceData.imuDataHandler) {
                imuDataCharacteristic.removeEventListener("characteristicvaluechanged", deviceData.imuDataHandler);
            }
            const heartRateHandler = (event) => handleHeartRate(event, device);
            const imuDataHandler = (event) => handleIMUData(event, device);
            imuDataCharacteristic.addEventListener("characteristicvaluechanged", imuDataHandler);           heartRateCharacteristic.addEventListener("characteristicvaluechanged", heartRateHandler);
            setDevices((prevDevices) =>
                prevDevices.map((d) =>
                    d.device === device
                        ? { ...d, heartRateHandler, imuDataHandler }
                        : d
                )
            );
            await heartRateCharacteristic.startNotifications();
            const startCommand = new Uint8Array([2, 2, 0, 1, 52, 0, 1, 1, 16, 0, 2, 1, 8, 0, 4, 1, 3]);
            await imuControlCharacteristic.writeValueWithResponse(startCommand);
            console.log("📡 IMU Measurement Started!");
            await imuDataCharacteristic.startNotifications();
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: true }));
        } catch (error) {
            console.error("❌ Error starting measurement:", error);
        }
    };

    const stopMeasurement = async (device) => {
        try {
            console.log(`🛑 Stopping measurement for ${device.name}`);
            const deviceData = devices.find(({ device: d }) => d === device);
            if (!deviceData) {
                console.error("❌ Device not found");
                return;
            }

            const { heartRateCharacteristic, imuDataCharacteristic, heartRateHandler, imuDataHandler } = deviceData;
            await heartRateCharacteristic.stopNotifications();
            await imuDataCharacteristic.stopNotifications();

            if (heartRateHandler) heartRateCharacteristic.removeEventListener("characteristicvaluechanged", heartRateHandler);
            if (imuDataHandler) imuDataCharacteristic.removeEventListener("characteristicvaluechanged", imuDataHandler);

            setDevices((prevDevices) =>
                prevDevices.map((d) => d.device === device ? { ...d, heartRateHandler: null, imuDataHandler: null } : d)
            );
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: false }));

            setDownloadReadyDevices((prev) => ({ ...prev, [device.name]: true }));

            console.log(`✅ Measurement stopped for ${device.name}`);
        } catch (error) {
            console.error("❌ Error stopping measurement:", error);
        }
    };

    const disconnectSensor = async (deviceToRemove) => {
        const updatedDevices = devices.filter(({ device }) => device !== deviceToRemove);
        if (deviceToRemove.gatt.connected) {
            try {
                await deviceToRemove.gatt.disconnect();
                console.log(`Disconnected from ${deviceToRemove.name}`);
            } catch (error) {
                console.error("Failed to disconnect:", error);
            }
        }
        setDownloadReadyDevices((prev) => { const newReady = { ...prev }; delete newReady[deviceToRemove.name]; return newReady; });
        setDevices(updatedDevices);
        setHeartRateData((prevData) => {
            const newData = { ...prevData };
            delete newData[deviceToRemove.name];
            return newData;
        });
        setImuData((prevData) => {
            const newData = { ...prevData };
            delete newData[deviceToRemove.name];
            return newData;
        });
    };

    const initializeDB = async () => {
        return openDB("sensorDB", 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains("heartRate")) {
                    db.createObjectStore("heartRate", { keyPath: "id", autoIncrement: true });
                    console.log("💾 Created object store: heartRate");
                }
                if (!db.objectStoreNames.contains("imu")) {
                    db.createObjectStore("imu", { keyPath: "id", autoIncrement: true });
                }
            }
        });
    };
    const saveOfflineData = async (deviceName, data, type) => {
        try {
            let db = await initializeDB();
            if (!db.objectStoreNames.contains(type)) {
                console.warn(`⚠️ Skipping ${type}, object store does not exist.`);
                return;
            }
            const tx = db.transaction(type, "readwrite");
            const store = tx.objectStore(type);
            const result = await store.add({ device_id: deviceName, ...data });
            await tx.done;
            console.log(`💾 Successfully saved offline ${type} data:`, { id: result, ...data });
        } catch (error) {
            console.error("❌ Failed to save offline data:", error);
        }
    };

    const sendOfflineData = async () => {
        try {
            let db = await initializeDB();
            let existingStores = Array.from(db.objectStoreNames).filter(store =>
                ["heartRate", "imu"].includes(store)
            );
            if (existingStores.length === 0) {
                console.warn("⚠️ No valid object stores found, skipping offline data send.");
                return;
            }

            for (const type of existingStores) {
                let tx = db.transaction(type, "readwrite");
                let store = tx.objectStore(type);
                let allData = await store.getAll();

                for (let data of allData) {
                    try {
                        let requestBody = {
                            timestamp: data.timestamp,
                            device_id: data.device_id,
                        };

                        if (type === "heartRate") {
                            requestBody.bpm = data.bpm;
                        } else if (type === "imu") {
                            requestBody.acc_x = data.acc_x;
                            requestBody.acc_y = data.acc_y;
                            requestBody.acc_z = data.acc_z;
                        }

                        let response = await fetch("http://localhost:5000/save-sensor-data", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(requestBody),
                        });

                        if (response.ok) {
                            console.log(`✅ Successfully sent offline ${type} data for ${data.device_id}`);
                            let deleteTx = db.transaction(type, "readwrite");
                            let deleteStore = deleteTx.objectStore(type);
                            deleteStore.delete(data.id);
                            await deleteTx.done;
                        } else {
                            console.warn(`⚠️ Failed to send offline ${type} data. Server Response:`, await response.text());
                        }
                    } catch (error) {
                        console.error("❌ Error sending offline data:", error);
                        return; // Exit loop if still offline
                    }
                }
                await tx.done;
            }
        } catch (error) {
            console.error("❌ Error accessing offline database:", error);
        }
    };
    window.addEventListener("online", sendOfflineData);
    const checkConnectionAndSendOfflineData = async () => {
        if (!navigator.onLine) {
            console.log("📴 Offline. Waiting for connection...");
            return; // Exit if offline
        }
        console.log("🌍 Online! Checking for offline data...");
        let db = await initializeDB();
        let hasData = false;
        for (const type of ["heartRate", "imu"]) {
            let count = await db.count(type); // Check if any data exists
            if (count > 0) {
                hasData = true;
                break; // No need to check further, data exists
            }
        }
        if (hasData) {
            console.log("📤 Sending stored offline data...");
            await sendOfflineData();
        } else {
            console.log("✅ No offline data found.");
        }
    };
    setInterval(checkConnectionAndSendOfflineData, 30000);

    const handleHeartRate = (event, device) => {
        let value = event.target.value;
        let heartRate = parseHeartRate(value);
        setHeartRateData((prevData) => ({
            ...prevData,
            [device.name]: [...(prevData[device.name] || []), heartRate].slice(-50), // Keep last 50 values
        }));
        sendDataToBackend(device.name, heartRate, null, null, null);
    };

    let lastIMUSecond = {};
    const handleIMUData = (event, device) => {
        console.log(`📡 IMU Data Event Triggered for ${device.name}`);
        let value = event.target.value;
        if (!value || value.byteLength < 16) {
            console.error("❌ IMU Data is too short, might be incorrect format!");
            return;
        }
        let data = new DataView(value.buffer);
        let now = Date.now();
        let roundedSecond = Math.floor(now / 1000); // Round to nearest second
        try {
            let x = data.getInt16(10, true) * 0.0024 * 9.80665;
            let y = data.getInt16(12, true) * 0.0024 * 9.80665;
            let z = data.getInt16(14, true) * 0.0024 * 9.80665;
            if (lastIMUSecond[device.name] === roundedSecond) {
                return;
            }
            lastIMUSecond[device.name] = roundedSecond;
            setImuData((prevData) => ({
                ...prevData,
                [device.name]: { x, y, z, timestamp: now },
            }));
            sendDataToBackend(device.name, null, x, y, z);
        } catch (error) {
            console.error("❌ IMU Data Processing Failed:", error);
        }
    };

    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    const sendDataToBackend = async (deviceName, heartRate, x, y, z) => {
        let now = new Date();
        now.setMilliseconds(0);
        let timestampString = now.toISOString().slice(0, 19).replace("T", " ");
        let dataToSend = {
            timestamp: timestampString,
            device_id: deviceName,
            bpm: heartRate,
            acc_x: x,
            acc_y: y,
            acc_z: z
        };

        try {
            if (!navigator.onLine) {
                throw new Error("Offline Mode: Saving Data Locally");
            }

            let response = await fetch("http://localhost:5000/save-sensor-data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            console.log("📡 Data sent successfully!");
        } catch (error) {
            console.warn("⚠️ Failed to send data, saving offline...", error);
            let offlineData = { timestamp: timestampString };

            if (heartRate !== null) {
                offlineData.bpm = heartRate;
                await saveOfflineData(deviceName, offlineData, "heartRate");
            } else {
                offlineData.acc_x = x;
                offlineData.acc_y = y;
                offlineData.acc_z = z;
                await saveOfflineData(deviceName, offlineData, "imu");
            }
        }
    };

    const downloadData = (device) => {
        const link = document.createElement("a");
        link.href = `http://localhost:5000/download-data/${device.name}`;
        link.setAttribute("download", `sensor_data_${device.name}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };





    return (
        <div className="container">
            <div className="button-group">
                {devices.length === 0 ? (
                    <button className="connect-btn" onClick={connectToSensor} disabled={connecting}>
                        {connecting ? "Connecting..." : "Connect to Polar Sensor"}
                    </button>
                ) : (
                    <>
                        <button className="connect-btn" onClick={() => devices.forEach(({ device }) => disconnectSensor(device))}>
                            Disconnect from Sensors
                        </button>
                        <button className="add-device-btn" onClick={connectToSensor} disabled={connecting}>
                            {connecting ? "Connecting..." : "Add a Device"}
                        </button>
                    </>
                )}
            </div>
            {devices.map(({ device }) => (
                <div key={device.id} className="sensor-card-container">
                    <div className="sensor-card">
                        <h3>{device.name}</h3>
                        <p><strong>Heart Rate:</strong> {heartRateData[device.name]?.slice(-1)[0] || "No Data"} BPM</p>
                        {imuData[device.name] ? (
                            <div className="imu-container">
                                <h4>Accelerometer Data (IMU)</h4>
                                <p><strong>X:</strong> {imuData[device.name].x.toFixed(2)} m/s²</p>
                                <p><strong>Y:</strong> {imuData[device.name].y.toFixed(2)} m/s²</p>
                                <p><strong>Z:</strong> {imuData[device.name].z.toFixed(2)} m/s²</p>
                            </div>
                        ) : (
                            <p><strong>Accelerometer Data:</strong> No Data</p>
                        )}
                        <div className="button-group">
                            <button className="action-btn" onClick={() => disconnectSensor(device)}>Disconnect</button>
                            {!measuringDevices[device.name] ? (
                                <button className="action-btn" onClick={() => startMeasurement(device)}>
                                    Start Measurement
                                </button>
                            ) : (
                                <button className="action-btn" onClick={() => stopMeasurement(device)}>
                                    Stop Measurement
                                </button>
                            )}
                            {downloadReadyDevices[device.name] && (
                                <div className="download-container">
                                    <a
                                        href="#"
                                        className="download-link"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            downloadData(device);
                                        }}
                                    >
                                        Download Data <Download size={16} className="download-icon" />
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                    {imuData[device.name] && imuData[device.name].x && imuData[device.name].y && imuData[device.name].z && (
                        <div className="chart-container">
                            <h3 className="chart-title">IMU Data Monitor</h3>
                            <Bar
                                key={device.name} // Ensures a new instance is created per device
                                data={{
                                    labels: ["X", "Y", "Z"],
                                    datasets: [{
                                        label: `IMU Acceleration (${device.name})`,
                                        data: [imuData[device.name]?.x || 0, imuData[device.name]?.y || 0, imuData[device.name]?.z || 0],
                                        backgroundColor: ["blue", "green", "orange"],
                                        borderColor: ["darkblue", "darkgreen", "darkorange"],
                                        borderWidth: 2,
                                    }]
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    scales: { y: { beginAtZero: true } },
                                    layout: {
                                        padding: {
                                            left: 10,
                                            right: 10,
                                            top: 10,
                                            bottom: 40,
                                        },
                                    },
                                }}
                                style={{ width: "100%", height: "100%" }}
                            />
                        </div>
                    )}

                    {heartRateData[device.name] && Array.isArray(heartRateData[device.name]) && heartRateData[device.name].length > 0 && (
                        <div className="chart-container">
                            {/* Heading inside the container */}
                            <h3 className="chart-title">Heart Rate Monitor</h3>
                            <Line
                                data={{
                                    labels: heartRateData[device.name].map((_, i) => i),
                                    datasets: [{
                                        label: `Heart Rate - ${device.name}`,
                                        data: heartRateData[device.name],
                                        borderColor: "red",
                                        backgroundColor: "rgba(255, 0, 0, 0.5)",
                                        fill: false,
                                    }],
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    layout: {
                                        padding: {
                                            left: 10,
                                            right: 10,
                                            top: 10,
                                            bottom: 40,
                                        },
                                    },
                                }}
                                style={{ width: '100%', height: '100%' }} // Ensures the chart takes full container space
                            />
                        </div>
                    )}

                </div>
            ))}
        </div>
    );
};

export default PolarSensor;
