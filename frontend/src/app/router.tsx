import { createBrowserRouter, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import HealthPage from "../pages/Health";

export const router = createBrowserRouter([
  { path: "/health", element: <HealthPage /> },
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HealthPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
