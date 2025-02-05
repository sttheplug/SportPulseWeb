import React, { useState } from "react";
import "./PolarSensor.css"; // Import styles

const PolarSensor = () => {
    const [heartRate, setHeartRate] = useState(null);
    const [device, setDevice] = useState(null);
    const [characteristic, setCharacteristic] = useState(null);
    const [isMeasuring, setIsMeasuring] = useState(false);

    const connectToSensor = async () => {
        if (device) {
            disconnectSensor();
            return;
        }

        try {
            console.log("Requesting Bluetooth Device...");
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ["heart_rate"],
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
    };

    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    return (
        <div className="container">
            <h2>Polar Sensor</h2>
            <button onClick={connectToSensor}>
                {device ? "Disconnect from Sensor" : "Connect to Polar Sensor"}
            </button>
            <button onClick={toggleMeasurement} disabled={!device}>
                {isMeasuring ? "Stop Measurement" : "Start Measurement"}
            </button>
            <h3>Heart Rate: {heartRate ? `${heartRate} BPM` : "No Data"}</h3>
        </div>
    );
};

export default PolarSensor;
