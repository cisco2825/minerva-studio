import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PolicyList from './pages/PolicyList';
import PolicyDetail from './pages/PolicyDetail';
import PolicyEditor from './pages/PolicyEditor';
import DecisionTableEditor from './pages/DecisionTableEditor';
import ScorecardEditor from './pages/ScorecardEditor';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PolicyList />} />
        <Route path="/policies/new" element={<PolicyEditor />} />
        <Route path="/policies/:policyId" element={<PolicyDetail />} />
        <Route path="/editor/decision-table" element={<DecisionTableEditor />} />
        <Route path="/editor/scorecard" element={<ScorecardEditor />} />
      </Routes>
    </BrowserRouter>
  );
}
