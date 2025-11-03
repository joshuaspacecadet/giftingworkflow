import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AdminPage from './pages/AdminPage';
import ProjectFunnelPage from './pages/ProjectFunnelPage';
import ReviewerDashboardPage from './pages/ReviewerDashboardPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Reviewer dashboard lives outside of Layout to use its own dark UI */}
        <Route path="/dashboard/:name" element={<ReviewerDashboardPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/admin" replace />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="project/:projectId" element={<ProjectFunnelPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;