import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import Clients from "./pages/Clients";
import Listings from "./pages/Listings";
import Emails from "./pages/Emails";
import Tasks from "./pages/Tasks";

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-surface-dark">
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="/tasks" element={<Tasks />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
