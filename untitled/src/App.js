import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PolarSensor from "./PolarSensor";
import DataList from "./DataList"; // Import DataList component

function App() {
    return (
        <Router>
            <div className="App">
                <h1 className="app-title">Sport Pulse Web</h1>
                <Routes>
                    <Route path="/" element={<PolarSensor />} />
                    <Route path="/data/:deviceId" element={<DataList />} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
