import React, {useEffect, useState} from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import "./PolarSensor.css";

const PolarSensor = () => {
    const [devices, setDevices] = useState([]); // List of connected devices
    const [heartRateData, setHeartRateData] = useState({}); // Stores heart rate per device
    const [connecting, setConnecting] = useState(false);
    const [measuringDevices, setMeasuringDevices] = useState({}); // Tracks measurement state per device

    useEffect(() => {
        const offlineData = JSON.parse(localStorage.getItem("offlineHeartRateData")) || [];

        if (offlineData.length > 0) {
            const groupedData = offlineData.reduce((acc, entry) => {
                acc[entry.device_id] = [...(acc[entry.device_id] || []), entry.bpm];
                return acc;
            }, {});

            setHeartRateData(groupedData);
        }
        syncOfflineData();
    }, []);

    const connectToSensor = async () => {
        try {
            setConnecting(true);
            console.log("Requesting Bluetooth Device...");

            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: "Polar" },
                    { services: ["heart_rate"] }
                ]
            });

            console.log(`Connected to ${device.name}`);

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService("heart_rate");
            const characteristic = await service.getCharacteristic("heart_rate_measurement");

            setDevices((prevDevices) => [...prevDevices, { device, characteristic }]);
        } catch (error) {
            console.error("Connection failed:", error);
        } finally {
            setConnecting(false);
        }
    };

    const disconnectAllSensors = async () => {
        const connectedDevices = devices.filter(({ device }) => device.gatt.connected);
        for (const { device } of connectedDevices) {
            try {
                await device.gatt.disconnect();
                console.log(`Disconnected from ${device.name}`);
            } catch (error) {
                console.error(`Failed to disconnect from ${device.name}:`, error);
            }
        }
        setDevices([]);
        setMeasuringDevices({});
        setHeartRateData({});
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
        setMeasuringDevices((prev) => {
            const updatedState = { ...prev };
            delete updatedState[deviceToRemove.name];
            return updatedState;
        });
        setHeartRateData((prevData) => {
            const newData = { ...prevData };
            delete newData[deviceToRemove.name];
            return newData;
        });
    };

    const startMeasurement = async (device, characteristic) => {
        try {
            await characteristic.startNotifications();
            if (device.eventListener) {
                characteristic.removeEventListener("characteristicvaluechanged", device.eventListener);
            }
            const handleDataWrapper = (event) => handleData(event, device);
            device.eventListener = handleDataWrapper;
            characteristic.addEventListener("characteristicvaluechanged", handleDataWrapper);
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: true }));
            console.log(`Started measurement for ${device.name}`);
        } catch (error) {
            console.error("Failed to start measurement:", error);
        }
    };

    const stopMeasurement = async (device, characteristic) => {
        try {
            if (device.eventListener) {
                characteristic.removeEventListener("characteristicvaluechanged", device.eventListener);
                device.eventListener = null; // Remove reference after cleanup
            }
            await characteristic.stopNotifications();
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: false }));
            console.log(`Stopped measurement for ${device.name}`);
        } catch (error) {
            console.error("Failed to stop measurement:", error);
        }
    };

    const saveOfflineData = (device, heartRate, timestamp) => {
        let offlineData = JSON.parse(localStorage.getItem("offlineHeartRateData")) || [];
        if (offlineData.length > 0) {
            const lastEntry = offlineData[offlineData.length - 1];
            if (lastEntry.device_id === device.name && lastEntry.timestamp === timestamp) {
                return; // Skip duplicate within the same second
            }
        }
        offlineData.push({
            device_id: device.name,
            bpm: heartRate,
            timestamp: timestamp, // Use the provided timestamp
        });
        localStorage.setItem("offlineHeartRateData", JSON.stringify(offlineData));
    };


    let lastSavedTimestamp = {}; // Store last saved timestamp per device

    const handleData = (event, device) => {
        let value = event.target.value;
        let heartRate = parseHeartRate(value);

        // Get the exact measurement timestamp from the Bluetooth event
        let eventTimestamp = new Date(event.timeStamp); // Bluetooth event timestamp
        eventTimestamp.setMilliseconds(0); // Remove milliseconds for consistency
        let timestampString = eventTimestamp.toISOString(); // Convert to ISO format

        // Prevent duplicate entries for the same second
        if (lastSavedTimestamp[device.name] === timestampString) {
            return; // Skip duplicate within the same second
        }
        lastSavedTimestamp[device.name] = timestampString;

        // Update UI state
        setHeartRateData((prevData) => ({
            ...prevData,
            [device.name]: [...(prevData[device.name] || []).slice(-50), heartRate], // Keep last 50 values
        }));

        // Save offline data
        saveOfflineData(device, heartRate, timestampString);

        // Send data to the server
        fetch("http://localhost:5000/save-heart-rate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_id: device.name,
                bpm: heartRate,
                timestamp: timestampString, // Send correct timestamp
            }),
        })
            .then((response) => response.json())
            .then((data) => console.log(`✅ Data saved for ${device.name}:`, data))
            .catch((error) => console.error("❌ Error saving data:", error));
    };


    const syncOfflineData = async () => {
        let offlineData = JSON.parse(localStorage.getItem("offlineHeartRateData")) || [];
        if (offlineData.length === 0) return; // No offline data to sync
        const remainingData = [];
        for (const entry of offlineData) {
            try {
                const response = await fetch("http://localhost:5000/save-heart-rate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(entry),
                });
                if (!response.ok) {
                    throw new Error("Failed to sync offline data");
                }
                console.log(`✅ Synced offline data for ${entry.device_id} at ${entry.timestamp}`);
            } catch (error) {
                console.error("❌ Error syncing offline data:", error);
                remainingData.push(entry); // Keep failed entries for next sync
            }
        }
        localStorage.setItem("offlineHeartRateData", JSON.stringify(remainingData));
    };
    window.addEventListener("online", syncOfflineData);

    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    return (
        <div className="container">
            <h2>Polar Sensor</h2>

            {/* Connect/Disconnect Button Group */}
            <div className="button-group">
                {devices.length === 0 ? (
                    <button className="connect-btn" onClick={connectToSensor} disabled={connecting}>
                        {connecting ? "Connecting..." : "Connect to Polar Sensor"}
                    </button>
                ) : (
                    <>
                        <button className="connect-btn" onClick={() => devices.forEach(({ device }) => disconnectAllSensors())}>
                            Disconnect from Sensors
                        </button>
                        <button className="add-device-btn" onClick={connectToSensor} disabled={connecting}>
                            {connecting ? "Connecting..." : "Add a Device"}
                        </button>
                    </>
                )}
            </div>

            {/* Display all connected devices */}
            {devices.map(({ device, characteristic }) => (
                <div key={device.id} className="sensor-card-container">
                    {/* Sensor Card */}
                    <div className="sensor-card">
                        <h3>{device.name}</h3>
                        <p className="heart-rate-text">
                            Heart Rate: {heartRateData[device.name]?.slice(-1)[0] || "No Data"} BPM
                        </p>

                        {/* Buttons for each device */}
                        <div className="button-group">
                            <button className="action-btn" onClick={() => disconnectSensor(device)}>
                                Disconnect
                            </button>

                            {!measuringDevices[device.name] ? (
                                <button className="action-btn" onClick={() => startMeasurement(device, characteristic)}>
                                    Start Measurement
                                </button>
                            ) : (
                                <button className="action-btn" onClick={() => stopMeasurement(device, characteristic)}>
                                    Stop Measurement
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Chart container displayed after sensor card */}
                    {heartRateData[device.name] && heartRateData[device.name].length > 0 && (
                        <div className="chart-container">
                            <Line
                                data={{
                                    labels: heartRateData[device.name].map((_, i) => i),
                                    datasets: [
                                        {
                                            label: `Heart Rate - ${device.name}`,
                                            data: heartRateData[device.name],
                                            borderColor: "red",
                                            backgroundColor: "rgba(255, 0, 0, 0.5)",
                                            fill: false,
                                        },
                                    ],
                                }}
                            />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default PolarSensor;
