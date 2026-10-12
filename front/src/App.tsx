import { Layout } from "./components/Layout/Layout";
import { GameRedirect } from "./components/GameRedirect/GameRedirect";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SocketProvider } from "./api/SocketProvider";
import { HomePage } from "./pages/HomePage/HomePage";
import { AuthorizationPage } from "./pages/Authorization/Authorization";
import { ProfilePage } from "./pages/ProfilePage/ProfilePage";
import { NotificationsPage } from "./pages/Notifications/NotificationsPage";
import { InfoPage } from "./pages/InfoPage/InfoPage";
import { HistoryPage } from "./pages/HistoryPage/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage/SettingsPage";
import { GamePage } from "./pages/GamePage/GamePage";
import { GamePageWithCards } from "./pages/GamePage/legacy/GamePageWithCards";
import { TabletopPage } from "./pages/TabletopPage/TabletopPage";
import { InviteModal } from "./components/InviteModal/InviteModal";
import { TabletopGate } from "./components/TabletopGate/TabletopGate";

function App() {
  return (
      <SocketProvider>
        <Router>
          <TabletopGate />
          <GameRedirect />
          <InviteModal />
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/tabletop" element={<TabletopPage />} />
              <Route path="/info" element={<InfoPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/history" element={<HistoryPage />} />
              <Route path="/authorization" element={<AuthorizationPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/game" element={<GamePage />} />
              <Route path="/game/cards" element={<GamePageWithCards />} />
            </Routes>
          </Layout>
        </Router>
      </SocketProvider>
  );
}

export default App
