import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import HostPage from './pages/HostPage.jsx';
import DisplayPage from './pages/DisplayPage.jsx';
import PlayPage from './pages/PlayPage.jsx';
import EditorPage from './pages/EditorPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/host/:code" element={<HostPage />} />
      <Route path="/display/:code" element={<DisplayPage />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/play/:code" element={<PlayPage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/editor/:id" element={<EditorPage />} />
    </Routes>
  );
}
