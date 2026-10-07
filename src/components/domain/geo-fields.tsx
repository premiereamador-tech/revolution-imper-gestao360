"use client";

import { useState } from "react";

/** Captura a localização do aparelho (com permissão do usuário) em campos ocultos. */
export function GeoFields() {
  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(null);
  const [msg, setMsg] = useState<string>();
  return (
    <div className="text-sm">
      <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
      <input type="hidden" name="longitude" value={coords?.lng ?? ""} />
      <button
        type="button"
        className="text-primary hover:underline"
        onClick={() => {
          if (!navigator.geolocation) return setMsg("Este aparelho não fornece localização.");
          setMsg("Obtendo localização…");
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setCoords({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) });
              setMsg(undefined);
            },
            () => setMsg("Não foi possível obter a localização."),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        }}
      >
        {coords ? `Localização registrada (${coords.lat}, ${coords.lng})` : "Registrar localização atual"}
      </button>
      {msg && <span className="ml-2 text-muted">{msg}</span>}
    </div>
  );
}
