import VaultClient from "./vault-client";
import { loadDemoVaultSnapshot } from "./vault-server";

export default async function VaultPage() {
  const initialDocuments = await loadDemoVaultSnapshot();
  return <VaultClient initialDocuments={initialDocuments} />;
}
