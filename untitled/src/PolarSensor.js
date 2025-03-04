import React, {useEffect, useState} from "react";
import "./PolarSensor.css";
import {Bar, Line} from "react-chartjs-2";
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
import device from "mysql/lib/protocol/packets/Field";

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
    const [deviceNotes, setDeviceNotes] = useState({});
    const [samplingRates, setSamplingRates] = useState({});

    //  Automatically fetch offline data when a device is added to state
    useEffect(() => {
        if (devices.length > 0) {
            const latestDevice = devices[devices.length - 1].device;
            console.log(` Checking for offline data on ${latestDevice.name}...`);
            fetchOfflineData(latestDevice);
        }
    }, [devices]); // Runs every time `devices` state changes

    const connectToSensor = async () => {
        try {
            setConnecting(true);
            console.log(" Requesting Bluetooth Device...");

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: "Polar" }],
                optionalServices: ["heart_rate", "fb005c80-02e7-f387-1cad-8acd2d8df0c8"]
            });

            console.log(` Connected to ${device.name}`);
            const server = await device.gatt.connect();

            //  Get Heart Rate Service
            const heartRateService = await server.getPrimaryService("heart_rate");
            const heartRateCharacteristic = await heartRateService.getCharacteristic("00002a37-0000-1000-8000-00805f9b34fb");

            //  Get IMU Service
            const imuService = await server.getPrimaryService("fb005c80-02e7-f387-1cad-8acd2d8df0c8");
            const imuControlCharacteristic = await imuService.getCharacteristic("fb005c81-02e7-f387-1cad-8acd2d8df0c8");
            const imuDataCharacteristic = await imuService.getCharacteristic("fb005c82-02e7-f387-1cad-8acd2d8df0c8");

            console.log(` Characteristics retrieved successfully for ${device.name}`);

            //  Update state
            setDevices((prevDevices) => {
                const updatedDevices = [
                    ...prevDevices.filter(({ device: d }) => d.id !== device.id),
                    { device, heartRateCharacteristic, imuDataCharacteristic, imuControlCharacteristic }
                ];
                console.log(" Device added to state:", updatedDevices);
                return updatedDevices;
            });

            setMeasuringDevices((prev) => ({ ...prev, [device.name]: false }));

        } catch (error) {
            console.error(" Connection failed:", error);
        } finally {
            setConnecting(false);
        }
    };

    // ✅ Define IMU Data Handler BEFORE calling addEventListener
    const handleIMUOfflineData = async (event) => {
        let value = event.target.value;
        if (!value || value.byteLength < 16) {
            console.error(" IMU Data is too short, might be incorrect format!");
            return;
        }

        let data = new DataView(value.buffer);
        let timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

        let acc_x = data.getInt16(10, true) * 0.0024 * 9.80665;
        let acc_y = data.getInt16(12, true) * 0.0024 * 9.80665;
        let acc_z = data.getInt16(14, true) * 0.0024 * 9.80665;

        console.log(` Retrieved stored IMU Data: X:${acc_x}, Y:${acc_y}, Z:${acc_z}`);

        // Send to backend
        await sendDataToBackend(device.name, null, acc_x, acc_y, acc_z, timestamp);
    };

    // Define BPM Data Handler BEFORE calling addEventListener
    const handleBPMOfflineData = async (event) => {
        let value = event.target.value;
        let bpm = parseHeartRate(value);
        let timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

        console.log(`Retrieved stored BPM: ${bpm} BPM`);

        // ✅ Send to backend
        await sendDataToBackend(device.name, bpm, null, null, null, timestamp);
    };

    const fetchOfflineData = async (device) => {
        try {
            console.log(` Fetching offline data from ${device.name}`);
            const deviceData = devices.find(({ device: d }) => d === device);
            if (!deviceData) return console.error(" Device not found");

            const { imuControlCharacteristic, heartRateCharacteristic } = deviceData;

            // 🛠 Command to retrieve stored data
            const retrieveCommand = new Uint8Array([4]);
            await imuControlCharacteristic.writeValueWithResponse(retrieveCommand);

            console.log(`📡 Offline data retrieval initiated. Waiting for stored IMU & BPM data...`);

            // Remove existing listeners before adding new ones to prevent duplication
            imuControlCharacteristic.removeEventListener("characteristicvaluechanged", handleIMUOfflineData);
            heartRateCharacteristic.removeEventListener("characteristicvaluechanged", handleBPMOfflineData);

            imuControlCharacteristic.addEventListener("characteristicvaluechanged", handleIMUOfflineData);
            await imuControlCharacteristic.startNotifications();

            heartRateCharacteristic.addEventListener("characteristicvaluechanged", handleBPMOfflineData);
            await heartRateCharacteristic.startNotifications();

        } catch (error) {
            console.error(" Error fetching offline data:", error);
        }
    };

    const startMeasurement = async (device) => {
        try {
            console.log(` Starting measurement for ${device.name}`);

            // 🛠 Ensure the device exists in state
            const deviceData = devices.find(({ device: d }) => d === device);
            if (!deviceData) {
                console.error(" Device not found in state!");
                return;
            }

            // 🛠 Validate characteristics exist
            const { heartRateCharacteristic, imuControlCharacteristic, imuDataCharacteristic } = deviceData;
            if (!heartRateCharacteristic || !imuDataCharacteristic) {
                console.error(" Device characteristics are undefined! Reconnecting might help.");
                return;
            }

            // 🛠 Remove previous event listeners to prevent duplication
            if (deviceData.heartRateHandler) {
                heartRateCharacteristic.removeEventListener("characteristicvaluechanged", deviceData.heartRateHandler);
            }
            if (deviceData.imuDataHandler) {
                imuDataCharacteristic.removeEventListener("characteristicvaluechanged", deviceData.imuDataHandler);
            }

            //  Attach new event listeners
            const heartRateHandler = (event) => handleHeartRate(event, device);
            const imuDataHandler = (event) => handleIMUData(event, device);

            imuDataCharacteristic.addEventListener("characteristicvaluechanged", imuDataHandler);
            heartRateCharacteristic.addEventListener("characteristicvaluechanged", heartRateHandler);

            // 🛠 Update state to store new handlers
            setDevices((prevDevices) =>
                prevDevices.map((d) =>
                    d.device === device ? { ...d, heartRateHandler, imuDataHandler } : d
                )
            );

            //  Start notifications
            await heartRateCharacteristic.startNotifications();

            //  Configure IMU Sampling
            const selectedFrequency = samplingRates[device.name] || 26;
            const frequencyByte = selectedFrequency === 200 ? 2 : 1;
            const startCommand = new Uint8Array([2, 2, 0, 1, 52, 0, 1, frequencyByte, 16, 0, 2, 1, 8, 0, 4, 1, 3]);

            await imuControlCharacteristic.writeValueWithResponse(startCommand);
            console.log(`📡 IMU Measurement Started at ${selectedFrequency} Hz!`);

            await imuDataCharacteristic.startNotifications();
            setMeasuringDevices((prev) => ({ ...prev, [device.name]: true }));

        } catch (error) {
            console.error(" Error starting measurement:", error);
        }
    };

    const stopMeasurement = async (device) => {
        try {
            console.log(` Stopping measurement for ${device.name}`);
            const deviceData = devices.find(({ device: d }) => d === device);
            if (!deviceData) {
                console.error(" Device not found");
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

            // ✅Markera enheten som redo för nedladdning
            setDownloadReadyDevices((prev) => ({ ...prev, [device.name]: true }));

            console.log(` Measurement stopped for ${device.name}`);
        } catch (error) {
            console.error(" Error stopping measurement:", error);
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
            console.error(" IMU Data is too short, might be incorrect format!");
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
            console.error(" IMU Data Processing Failed:", error);
        }
    };
    
    const parseHeartRate = (value) => {
        let data = new DataView(value.buffer);
        let flags = data.getUint8(0);
        return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
    };

    const sendDataToBackend = (device_id, bpm, acc_x, acc_y, acc_z) => {
        const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
        const note = deviceNotes[device_id] || "";
        const sampling_rate = samplingRates[device_id] || 26; // Hämta vald frekvens

        fetch("http://localhost:5000/save-sensor-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                timestamp,
                device_id,
                bpm,
                acc_x,
                acc_y,
                acc_z,
                note,
                sampling_rate
            }),
        })
            .then(response => response.json())
            .then(data => console.log(`✅ Data saved for ${device_id}:`, data))
            .catch(error => console.error(" Error saving data:", error));
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
            {/* Connect button stays outside button-group */}
            {devices.length === 0 ? (
                <button className="cbutton" onClick={connectToSensor} disabled={connecting}>
                    {connecting ? "Connecting..." : "Connect to Polar Sensor"}
                </button>
            ) : (
                <>
                    {/* Button group contains both buttons */}
                    <div className="button-group">
                        <button className="disconnect-btn" onClick={() => devices.forEach(({ device }) => disconnectSensor(device))}>
                            Disconnect from Sensors
                        </button>
                        <button className="add-device-btn" onClick={connectToSensor} disabled={connecting}>
                            {connecting ? "Connecting..." : "Add a Device"}
                        </button>
                    </div>
                </>
            )}
            {devices.map(({ device }) => (
                <div key={device.id} className="sensor-card-container">
                    <div className="sensor-card">
                        <h3>{device.name}</h3>
                        {!measuringDevices[device.name] ? (
                            <div className="note-container">
                                <label className="note-label">📝 Note:</label>
                                <input
                                    type="text"
                                    className="note-input"
                                    value={deviceNotes[device.name] || ""}
                                    onChange={(e) => setDeviceNotes({ ...deviceNotes, [device.name]: e.target.value })}
                                    placeholder="Enter a note..."
                                />
                            </div>
                        ) : (
                            <p className="note-text">📝 Note: {deviceNotes[device.name]}</p>
                        )}

                        {/* Dropdown för sampling frekvens */}
                        <div className="sampling-container">
                            <label className="sampling-label">📊 Sampling Frequency:</label>
                            <select
                                className="sampling-dropdown"
                                value={samplingRates[device.name] || 26}
                                onChange={(e) =>
                                    setSamplingRates({ ...samplingRates, [device.name]: parseInt(e.target.value) })
                                }
                            >
                                <option value={26}>26 Hz</option>
                                <option value={200}>200 Hz</option>
                            </select>
                        </div>

                        <div className="data-container">
                            {/* Heart Rate Card */}
                            <div className="data-card heart-rate-card">
                                <h4>💓 Heart Rate</h4>
                                <p className="heart-rate-value">
                                    {heartRateData[device.name]?.slice(-1)[0] || "No Data"} BPM
                                </p>
                            </div>

                            {/* IMU Data Card */}
                            <div className="data-card imu-card">
                                <h4>📡 Accelerometer Data (IMU)</h4>
                                {imuData[device.name] ? (
                                    <div className="imu-values">
                                        <p><strong>X:</strong> <span className="imu-value">{imuData[device.name].x.toFixed(2)}</span> m/s²</p>
                                        <p><strong>Y:</strong> <span className="imu-value">{imuData[device.name].y.toFixed(2)}</span> m/s²</p>
                                        <p><strong>Z:</strong> <span className="imu-value">{imuData[device.name].z.toFixed(2)}</span> m/s²</p>
                                    </div>
                                ) : (
                                    <p className="no-data">No Data</p>
                                )}
                            </div>
                        </div>
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