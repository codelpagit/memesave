import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GameProvider } from './context/GameContext';
import Home from './pages/Home';
import GameLobby from './pages/GameLobby';
import GameRoom from './pages/GameRoom';
import GameResults from './pages/GameResults';
import './App.css';

function App() {
  return (
    <GameProvider>
      <Toaster position="top-right" />
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:roomCode" element={<GameLobby />} />
          <Route path="/game/:roomCode" element={<GameRoom />} />
          <Route path="/results/:roomCode" element={<GameResults />} />
        </Routes>
      </Router>
    </GameProvider>
  );
}

export default App;
