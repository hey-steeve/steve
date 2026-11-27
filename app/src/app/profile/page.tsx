import { loadDemoPatientMemory } from "@steve/profile";
import ProfileClient from "./profile-client";

export default function ProfilePage() {
  return <ProfileClient initialMemory={loadDemoPatientMemory()} />;
}
