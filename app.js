document.getElementById("connectBtn").addEventListener("click", async () => {
    try {
        console.log("Requesting Bluetooth Device...");
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['heart_rate']
        });

        console.log("Connecting to GATT Server...");
        const server = await device.gatt.connect();

        console.log("Getting Heart Rate Service...");
        const service = await server.getPrimaryService('heart_rate');

        console.log("Getting Heart Rate Measurement Characteristic...");
        const characteristic = await service.getCharacteristic('heart_rate_measurement');

        await characteristic.startNotifications();
        characteristic.addEventListener("characteristicvaluechanged", (event) => {
            let value = event.target.value;
            let heartRate = parseHeartRate(value);
            document.getElementById("sensorData").textContent = `Heart Rate: ${heartRate} BPM`;
        });

        console.log("Listening for heart rate data...");
    } catch (error) {
        console.error("Error:", error);
    }
});

function parseHeartRate(value) {
    let data = new DataView(value.buffer);
    let flags = data.getUint8(0);
    return (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);
}
