import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import EventDetail from "./pages/EventDetail.jsx";
import BookingConfirmation from "./pages/BookingConfirmation.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import OrganiserDashboard from "./pages/OrganiserDashboard.jsx";
import CreateEvent from "./pages/CreateEvent.jsx";
import AdminVenues from "./pages/AdminVenues.jsx";

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route
          path="/bookings/:id/confirmation"
          element={
            <ProtectedRoute>
              <BookingConfirmation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <MyBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organiser"
          element={
            <ProtectedRoute roles={["organiser", "admin"]}>
              <OrganiserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organiser/new-event"
          element={
            <ProtectedRoute roles={["organiser", "admin"]}>
              <CreateEvent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/venues"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminVenues />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<div className="container empty-state"><h3>Page not found</h3></div>} />
      </Routes>
    </>
  );
}
