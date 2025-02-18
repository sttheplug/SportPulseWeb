import React, { useState } from "react";
import { Line } from "react-chartjs-2"; // Import Chart.js
import "chart.js/auto"; // Required for Chart.js v3+
import "./PolarSensor.css"; // Import styles

const PolarSensor = () => {
    const [heartRate, setHeartRate] = useState(null);
    const [device, setDevice] = useState(null);
    const [characteristic, setCharacteristic] = useState(null);
    const [isMeasuring, setIsMeasuring] = useState(false);
    const [connecting, setConnecting] = useState(false); // Loading state
    const [heartRateHistory, setHeartRateHistory] = useState([]); // Stores data for graph

    const connectToSensor = async () => {
        if (device) {
            await disconnectSensor();
            return;
        }

        try {
            setConnecting(true); // Show loading indicator
            console.log("Requesting Bluetooth Device...");

            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: "Polar" }, // Filter for devices with names starting with "Polar"
                    { services: ["heart_rate"] } // Ensure device supports heart rate service
                ]
            });

            console.log(`Connected to ${device.name}`);
            setDevice(device);

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService("heart_rate");
            const characteristic = await service.getCharacteristic("heart_rate_measurement");

            setCharacteristic(characteristic);
            console.log("Device connected, ready to start measurement");
        } catch (error) {
            console.error("Connection failed:", error);
        } finally {
            setConnecting(false); // Hide loading indicator
        }
    };


    const disconnectSensor = async () => {
        if (device && device.gatt.connected) {
            try {
                if (isMeasuring) stopMeasurement(); // Ensure measurement stops before disconnecting
                await device.gatt.disconnect();
                setDevice(null);
                setCharacteristic(null);
                setHeartRate(null);
                setIsMeasuring(false);
                setHeartRateHistory([]); // Clear history on disconnect
                console.log("Disconnected from sensor.");
            } catch (error) {
                console.error("Failed to disconnect:", error);
            }
        }
    };

    const startMeasurement = async () => {
        if (!characteristic) {
            console.error("No characteristic found. Ensure the device is connected.");
            return;
        }

        try {
            await characteristic.startNotifications();
            characteristic.addEventListener("characteristicvaluechanged", handleData);
            setIsMeasuring(true);
            console.log("Started measurement...");
        } catch (error) {
            console.error("Failed to start measurement:", error);
        }
    };

    const stopMeasurement = async () => {
        if (!characteristic) {
            console.error("No characteristic found. Ensure the device is connected.");
            return;
        }

        try {
            characteristic.removeEventListener("characteristicvaluechanged", handleData);
            await characteristic.stopNotifications();
            setIsMeasuring(false);
            console.log("Stopped measurement.");
        } catch (error) {
            console.error("Failed to stop measurement:", error);
        }
    };

    const toggleMeasurement = async () => {
        if (isMeasuring) {
            await stopMeasurement();
        } else {
            await startMeasurement();
        }
    };

    const handleData = (event) => {
        let value = event.target.value;
        let heartRate = parseHeartRate(value);

        setHeartRate(heartRate);
        setHeartRateHistory((prev) => [...prev.slice(-50), heartRate]); // Keep last 50 data points

        // Send data to the backend
        fetch("http://localhost:5000/save-heart-rate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bpm: heartRate }),
        })
            .then((response) => response.json())
            .then((data) => console.log("Data saved:", data))
            .catch((error) => console.error("Error saving data:", error));
    };


    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    // Data for Chart.js
    const chartData = {
        labels: heartRateHistory.map((_, i) => i), // X-axis as index (time)
        datasets: [
            {
                label: "Heart Rate (BPM)",
                data: heartRateHistory,
                borderColor: "red",
                backgroundColor: "rgba(255, 0, 0, 0.5)",
                fill: false,
            },
        ],
    };

    return (
        <div className="container">
            <h2>Polar Sensor</h2>
            {connecting && <p>Connecting... ⏳</p>}
            {device && <p>Connected to: {device.name}</p>}
            <button onClick={connectToSensor} disabled={connecting}>
                {device ? "Disconnect from Sensor" : "Connect to Polar Sensor"}
            </button>
            <button onClick={toggleMeasurement} disabled={!device}>
                {isMeasuring ? "Stop Measurement" : "Start Measurement"}
            </button>
            <h3>Heart Rate: {heartRate ? `${heartRate} BPM` : "No Data"}</h3>

            {/* Display chart if data exists */}
            {heartRateHistory.length > 0 && (
                <div className="chart-container">
                    <Line data={chartData} />
                </div>
            )}
        </div>
    );
};

export default PolarSensor;
