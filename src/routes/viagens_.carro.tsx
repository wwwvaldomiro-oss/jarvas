import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Settings2 } from "lucide-react";
import { AppShell, useRequireUser } from "@/components/AppShell";
import { RoadTripPlatform } from "@/road-trip-platform/RoadTripPlatform";

export const Route = createFileRoute("/viagens_/carro")({
  head: () => ({ meta: [{ title: "Viagem de carro — Axion" }] }),
  component: CarTripPage,
});

function CarTripPage() {
  const user = useRequireUser();
  const storageKey = user?.email ? `axion:google-maps-key:${user.email.trim().toLowerCase()}` : null;
  const [saved, setSaved] = useState<{ ownerKey: string; value: string }>({
    ownerKey: "",
    value: "",
  });
  const [draft, setDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Uma chave configurada para outra conta nunca deve ser repassada ao mapa.
  const personalKey = storageKey && saved.ownerKey === storageKey ? saved.value : "";
  const projectKey = (import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined) || "";

  useEffect(() => {
    if (!storageKey) {
      setSaved({ ownerKey: "", value: "" });
      setDraft("");
      return;
    }
    try {
      const value = window.localStorage.getItem(storageKey) ?? "";
      setSaved({ ownerKey: storageKey, value });
      setDraft(value);
      setError("");
    } catch {
      setSaved({ ownerKey: storageKey, value: "" });
      setDraft("");
      setError("Não foi possível acessar as configurações locais deste navegador.");
    }
  }, [storageKey]);

  function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storageKey) return;
    const value = draft.trim();
    if (!value) {
      setError("Informe uma chave ou use Remover chave.");
      return;
    }
    try {
      window.localStorage.setItem(storageKey, value);
      setSaved({ ownerKey: storageKey, value });
      setDraft(value);
      setError("");
      setShowSettings(false);
      setShowKey(false);
      setNotice("Chave salva com sucesso. O mapa será atualizado.");
    } catch {
      setError("Não foi possível salvar. Verifique se o navegador permite armazenamento local.");
    }
  }

  function removeKey() {
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
      setSaved({ ownerKey: storageKey, value: "" });
      setDraft("");
      setError("");
      setShowKey(false);
      setNotice("Chave removida. O mapa alternativo está disponível.");
    } catch {
      setError("Não foi possível remover a chave deste navegador.");
    }
  }

  return (
    <AppShell active="viagens" user={user}>
      <div className="flex w-full flex-wrap items-center justify-between gap-3 bg-slate-100 px-4 py-3">
        <Link to="/viagens" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Voltar para Viagens do Axion
        </Link>
        <button
          type="button"
          onClick={() => {
            setShowSettings((current) => !current);
            setDraft(personalKey);
            setError("");
            setNotice("");
            setShowKey(false);
          }}
          aria-expanded={showSettings}
          aria-controls="google-maps-configuration"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Settings2 className="size-4" />
          Google Maps
        </button>
      </div>

      {showSettings && (
        <section
          id="google-maps-configuration"
          aria-label="Configuração da chave do Google Maps"
          className="border-b border-slate-200 bg-white px-4 py-5"
        >
          <form onSubmit={saveKey} className="mx-auto max-w-xl space-y-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Configurar Google Maps</h2>
              <p className="mt-1 text-sm text-slate-600">
                {personalKey
                  ? "Há uma chave pessoal cadastrada neste navegador."
                  : projectKey
                    ? "O mapa está usando a chave configurada no projeto."
                    : "Nenhuma chave cadastrada. O mapa alternativo continuará disponível."}
              </p>
            </div>
            <label htmlFor="google-maps-api-key" className="block text-sm font-medium text-slate-800">
              Chave da API Google Maps
            </label>
            <div className="flex gap-2">
              <input
                id="google-maps-api-key"
                type={showKey ? "text" : "password"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Cole sua chave do Google Maps"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                className="rounded-lg border border-slate-300 px-3 text-slate-700"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              A chave fica neste navegador, para esta conta. Como é usada pelo
              Google Maps no navegador, restrinja-a no Google Cloud aos domínios autorizados
              e às APIs necessárias. O cadastro não valida a chave automaticamente.
            </p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">
                Salvar chave
              </button>
              {personalKey && (
                <button type="button" onClick={removeKey} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
                  Remover chave
                </button>
              )}
              <button type="button" onClick={() => { setShowSettings(false); setError(""); setShowKey(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                Fechar
              </button>
            </div>
          </form>
        </section>
      )}

      {notice && <p role="status" className="bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}
      {(!storageKey || saved.ownerKey === storageKey) && (
        <RoadTripPlatform key={personalKey || "mapa-alternativo"} googleMapsApiKey={personalKey} />
      )}
    </AppShell>
  );
}
