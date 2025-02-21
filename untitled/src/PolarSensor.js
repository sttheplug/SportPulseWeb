import React, { useState } from "react";
import "./PolarSensor.css";

const PolarSensor = () => {
    const [devices, setDevices] = useState([]);
    const [heartRateData, setHeartRateData] = useState({});
    const [imuData, setImuData] = useState({});
    const [connecting, setConnecting] = useState(false);

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

            // 🫀 Heart Rate Service
            const heartRateService = await server.getPrimaryService("heart_rate");
            console.log(`✅ Found Heart Rate Service`);
            const heartRateCharacteristic = await heartRateService.getCharacteristic("00002a37-0000-1000-8000-00805f9b34fb");

            await heartRateCharacteristic.startNotifications();
            heartRateCharacteristic.addEventListener("characteristicvaluechanged", (event) => handleHeartRate(event, device));

            // 📡 IMU (Accelerometer) Service
            const imuService = await server.getPrimaryService("fb005c80-02e7-f387-1cad-8acd2d8df0c8");
            console.log(`✅ Found IMU Service`);

            const imuControlCharacteristic = await imuService.getCharacteristic("fb005c81-02e7-f387-1cad-8acd2d8df0c8");
            console.log(`✅ Found IMU Control Characteristic`);

            const imuDataCharacteristic = await imuService.getCharacteristic("fb005c82-02e7-f387-1cad-8acd2d8df0c8");
            console.log(`✅ Found IMU Data Characteristic`);

            // 🚀 Start IMU Measurement (Start Acceleration Data Stream)
            const startMeasurementCommand = new Uint8Array([2, 2, 0, 1, 52, 0, 1, 1, 16, 0, 2, 1, 8, 0, 4, 1, 3]);
            await imuControlCharacteristic.writeValueWithResponse(startMeasurementCommand);
            console.log("📡 IMU Measurement Start Command Sent!");

            // 🚀 Start Listening for IMU Data
            await imuDataCharacteristic.startNotifications();
            console.log("📡 IMU Notifications Started! Waiting for data...");

            imuDataCharacteristic.addEventListener("characteristicvaluechanged", (event) => handleIMUData(event, device));

            setDevices((prevDevices) => [...prevDevices, { device, heartRateCharacteristic, imuDataCharacteristic }]);
        } catch (error) {
            console.error("❌ Connection failed:", error);
        } finally {
            setConnecting(false);
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

    const handleHeartRate = (event, device) => {
        let value = event.target.value;
        let heartRate = parseHeartRate(value);

        setHeartRateData((prevData) => ({
            ...prevData,
            [device.name]: heartRate,
        }));
    };

    const handleIMUData = (event, device) => {
        console.log(`📡 IMU Data Event Triggered for ${device.name}`);

        let value = event.target.value;
        if (!value || value.byteLength < 16) {
            console.error("❌ IMU Data is too short, might be incorrect format!");
            return;
        }

        console.log(`📡 Raw IMU Data from ${device.name}:`, new Uint8Array(value.buffer));

        let data = new DataView(value.buffer);
        try {
            let x = data.getInt16(10, true) * 0.0024 * 9.80665; // Convert to m/s²
            let y = data.getInt16(12, true) * 0.0024 * 9.80665;
            let z = data.getInt16(14, true) * 0.0024 * 9.80665;

            console.log(`✅ Processed IMU Data - X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);

            setImuData((prevData) => ({
                ...prevData,
                [device.name]: { x, y, z },
            }));
        } catch (error) {
            console.error("❌ IMU Data Processing Failed:", error);
        }
    };

    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    return (
        <div className="container">
            <h2>Polar Sensor Data App</h2>
            {connecting && <p>Connecting... ⏳</p>}
            <button onClick={connectToSensor} disabled={connecting}>
                Connect to Polar Sensor
            </button>

            {/* Loop through connected devices */}
            {devices.map(({ device }) => (
                <div key={device.id} className="sensor-card">
                    <h3>{device.name}</h3>
                    <p><strong>Heart Rate:</strong> {heartRateData[device.name] || "No Data"} BPM</p>

                    {/* IMU Data Display */}
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

                    <button onClick={() => disconnectSensor(device)}>Disconnect</button>
                </div>
            ))}
        </div>
    );
};

export default PolarSensor;
