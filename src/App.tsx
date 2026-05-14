import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import PolicyList from './pages/PolicyList';
import PolicyDetail from './pages/PolicyDetail';
import PolicyEditor from './pages/PolicyEditor';
import DecisionTableEditor from './pages/DecisionTableEditor';
import ScorecardEditor from './pages/ScorecardEditor';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pages inside the sidebar shell */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<PolicyList />} />
          <Route path="/policies/:policyId" element={<PolicyDetail />} />
        </Route>

        {/* Full-screen editors — no sidebar */}
        <Route path="/policies/new" element={<PolicyEditor />} />
        <Route path="/editor/decision-table" element={<DecisionTableEditor />} />
        <Route path="/editor/scorecard" element={<ScorecardEditor />} />
      </Routes>
    </BrowserRouter>
  );
}
