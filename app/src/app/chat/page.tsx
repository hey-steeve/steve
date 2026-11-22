import { loadDemoPatientMemory } from "@steve/profile";
import ChatPage from "./chat-page";

export default function Page() {
  return (
    <ChatPage patientFirstName={loadDemoPatientMemory().identity.givenName} />
  );
}
