import React, { useState } from "react";
import "./PolarSensor.css";
import {Line} from "react-chartjs-2";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
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
            if (heartRateHandler) {
                heartRateCharacteristic.removeEventListener("characteristicvaluechanged", heartRateHandler);
            }
            if (imuDataHandler) {
                imuDataCharacteristic.removeEventListener("characteristicvaluechanged", imuDataHandler);
            }
            setDevices((prevDevices) =>
                prevDevices.map((d) =>
                    d.device === device
                        ? { ...d, heartRateHandler: null, imuDataHandler: null }
                        : d
                )
            );
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: false }));
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
            [device.name]: [...(prevData[device.name] || []), heartRate].slice(-50), // Keep last 50 values
        }));
        sendDataToBackend(device.name, heartRate, null, null, null);
    };

    let lastIMUSecond = {}; // Stores the last recorded second per device
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

    const sendDataToBackend = (device_id, bpm, acc_x, acc_y, acc_z) => {
        const timestamp = new Date().toISOString().slice(0, 19).replace("T", " "); // Converts to "YYYY-MM-DD HH:MM:SS"

        fetch("http://localhost:5000/save-sensor-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                timestamp,  // ✅ Correct format
                device_id,
                bpm,
                acc_x,
                acc_y,
                acc_z
            }),
        })
            .then(response => response.json())
            .then(data => console.log(`✅ Data saved for ${device_id}:`, data))
            .catch(error => console.error("❌ Error saving data:", error));
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
                        </div>
                    </div>
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
