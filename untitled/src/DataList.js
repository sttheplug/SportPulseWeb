import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./DataList.css";

const DataList = () => {
    const { deviceId } = useParams();
    const [sensorData, setSensorData] = useState([]);
    const [imuData, setImuData] = useState([]);
    const [selectedSensorIds, setSelectedSensorIds] = useState(new Set());
    const [selectedImuIds, setSelectedImuIds] = useState(new Set());

    useEffect(() => {
        if (!deviceId) return;

        fetch(`http://localhost:5000/get-sensor-data/${deviceId}`)
            .then((res) => res.json())
            .then((data) => setSensorData(Array.isArray(data) ? data : []))
            .catch((err) => console.error("❌ Error fetching sensor data:", err));

        fetch(`http://localhost:5000/get-imu-data/${deviceId}`)
            .then((res) => res.json())
            .then((data) => setImuData(Array.isArray(data) ? data : []))
            .catch((err) => console.error("❌ Error fetching IMU data:", err));
    }, [deviceId]);

    const toggleSensorSelection = (timestamp) => {
        setSelectedSensorIds((prev) => {
            const newSet = new Set(prev);
            newSet.has(timestamp) ? newSet.delete(timestamp) : newSet.add(timestamp);
            return newSet;
        });
    };

    const toggleImuSelection = (timestamp) => {
        setSelectedImuIds((prev) => {
            const newSet = new Set(prev);
            newSet.has(timestamp) ? newSet.delete(timestamp) : newSet.add(timestamp);
            return newSet;
        });
    };

    const downloadSelectedData = () => {
        if (selectedSensorIds.size === 0 && selectedImuIds.size === 0) {
            console.error("❌ No data selected.");
            return;
        }
        const params = new URLSearchParams();
        if (selectedSensorIds.size > 0) {
            params.append("sensorIds", Array.from(selectedSensorIds).join(",")); // Changed to "sensorIds"
        }
        if (selectedImuIds.size > 0) {
            params.append("imuIds", Array.from(selectedImuIds).join(",")); // Changed to "imuIds"
        }

        const url = `http://localhost:5000/download-selected-data/${deviceId}?${params.toString()}`;

        fetch(url, { method: "GET" })
            .then((response) => response.blob())
            .then((blob) => {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `selected_data_${deviceId}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            })
            .catch((error) => console.error("❌ Download error:", error));
    };

    return (
        <div className="container2">
            <h2>Heart Rate & IMU Data</h2>
            <div className="data-grid">
                <h3>Heart Rate Data</h3>
                {sensorData.map((item) => (
                    <div key={item.timestamp} className="data-card1">
                        <label className="checkbox-container">
                            <input
                                type="checkbox"
                                checked={selectedSensorIds.has(item.timestamp)}
                                onChange={() => toggleSensorSelection(item.timestamp)}
                            />
                            <span className="custom-checkbox"></span>
                        </label>
                        <div className="data-content">
                            <p><strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleString()}</p>
                            <p><strong>BPM:</strong> {item.bpm}</p>
                            <p><strong>Note:</strong> {item.note}</p>
                        </div>
                    </div>
                ))}

                <h3>IMU Data</h3>
                {imuData.map((item) => (
                    <div key={item.timestamp} className="data-card1">
                        <label className="checkbox-container">
                            <input
                                type="checkbox"
                                checked={selectedImuIds.has(item.timestamp)}
                                onChange={() => toggleImuSelection(item.timestamp)}
                            />
                            <span className="custom-checkbox"></span>
                        </label>
                        <div className="data-content">
                            <p><strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleString()}</p>
                            <p><strong>Acc X:</strong> {item.acc_x}</p>
                            <p><strong>Acc Y:</strong> {item.acc_y}</p>
                            <p><strong>Acc Z:</strong> {item.acc_z}</p>
                            <p><strong>Sampling Rate:</strong> {item.sampling_rate} Hz</p>
                            <p><strong>Note:</strong> {item.note}</p>
                        </div>
                    </div>
                ))}
            </div>
            <button
                className="download-button"
                onClick={downloadSelectedData}
                disabled={selectedSensorIds.size === 0 && selectedImuIds.size === 0}
            >
                Download Selected Data
            </button>
        </div>
    );
};

export default DataList;
