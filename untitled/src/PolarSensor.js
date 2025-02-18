import React, { useState } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import "./PolarSensor.css";

const PolarSensor = () => {
    const [devices, setDevices] = useState([]); // Lista över anslutna enheter
    const [heartRateData, setHeartRateData] = useState({}); // Sparar hjärtfrekvensdata per enhet
    const [connecting, setConnecting] = useState(false);

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

            await characteristic.startNotifications();
            characteristic.addEventListener("characteristicvaluechanged", (event) => handleData(event, device));

            setDevices((prevDevices) => [...prevDevices, { device, characteristic }]);
        } catch (error) {
            console.error("Connection failed:", error);
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
    };

    const handleData = (event, device) => {
        let value = event.target.value;
        let heartRate = parseHeartRate(value);

        setHeartRateData((prevData) => ({
            ...prevData,
            [device.name]: [...(prevData[device.name] || []).slice(-50), heartRate], // Spara senaste 50 värden
        }));

        // Skicka enhetsnamn istället för enhets-ID till backend
        fetch("http://localhost:5000/save-heart-rate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_id: device.name, // 🔹 Använd enhetsnamn istället för id
                bpm: heartRate
            }),
        })
            .then((response) => response.json())
            .then((data) => console.log(`Data saved for ${device.name}:`, data))
            .catch((error) => console.error("Error saving data:", error));
    };

    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    return (
        <div className="container">
            <h2>Polar Sensor</h2>
            {connecting && <p>Connecting... ⏳</p>}
            <button onClick={connectToSensor} disabled={connecting}>
                Connect to Polar Sensor
            </button>

            {/* Loopar genom alla anslutna enheter och visar data */}
            {devices.map(({ device }) => (
                <div key={device.id} className="sensor-card">
                    <h3>{device.name}</h3>
                    <p>Heart Rate: {heartRateData[device.name]?.slice(-1)[0] || "No Data"} BPM</p>
                    <button onClick={() => disconnectSensor(device)}>Disconnect</button>

                    {/* Visa graf om data finns */}
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
