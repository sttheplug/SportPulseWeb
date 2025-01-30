import React, { useState } from "react";
import "./PolarSensor.css"; // Import the styles

const PolarSensor = () => {
    const [heartRate, setHeartRate] = useState(null);
    const [device, setDevice] = useState(null);

    const connectToSensor = async () => {
        try {
            console.log("Requesting Bluetooth Device...");

            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ["heart_rate"],
            });

            setDevice(device);
            console.log(`Connected to ${device.name}`);

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService("heart_rate");
            const characteristic = await service.getCharacteristic("heart_rate_measurement");

            await characteristic.startNotifications();
            characteristic.addEventListener("characteristicvaluechanged", handleData);

            console.log("Listening for heart rate data...");
        } catch (error) {
            console.error("Connection failed:", error);
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
                {device ? "Connected" : "Connect to Polar Sensor"}
            </button>
            <h3>Heart Rate: {heartRate ? `${heartRate} BPM` : "No Data"}</h3>
        </div>
    );
};

export default PolarSensor;
