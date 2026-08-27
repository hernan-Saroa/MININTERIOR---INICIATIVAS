import type { Estado, ColorEstado } from '../api/tipos';
import { tono } from './base';

// =====================================================================
// El riel de estados.
//
// Dibuja el flujo configurado como un carril y marca dónde está una
// iniciativa. Es la pieza que mejor representa el dominio: un trámite
// que avanza, se devuelve y se rechaza. Se reutiliza en el tablero
// (ubicar), en configuración (ordenar) y en estadísticas (dónde se
// acumula).
// ===================================================================== */

export function Riel({ estados, actualId, onElegir, conteos }: {
  estados: Estado[];
  actualId?: number;
  onElegir?: (id: number) => void;
  conteos?: Record<number, number>;
}) {
  return (
    <div className="riel -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-stretch gap-0">
        {estados.map((e, i) => {
          const t = tono(e.color);
          const actual = e.id === actualId;
          const pasado = actualId != null && e.orden < (estados.find((x) => x.id === actualId)?.orden ?? 0);
          const clicable = !!onElegir;

          return (
            <li key={e.id} className="flex items-stretch">
              {i > 0 && (
                <span aria-hidden className="flex items-center px-1.5">
                  <span className={`block h-[2px] w-4 rounded ${pasado || actual ? 'bg-linea-fuerte' : 'bg-linea'}`} />
                </span>
              )}
              <button
                type="button"
                disabled={!clicable}
                onClick={() => onElegir?.(e.id)}
                aria-current={actual ? 'step' : undefined}
                className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-all
                  ${actual
                    ? `${t.fondo} ${t.borde} shadow-[0_1px_3px_rgba(16,26,46,0.08)]`
                    : 'border-transparent bg-transparent hover:bg-panel-2'}
                  ${clicable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${actual || pasado ? t.solido : 'bg-linea-fuerte'}`} />
                  <span className={`whitespace-nowrap text-[12.5px] font-semibold ${actual ? t.texto : 'text-tinta-2'}`}>
                    {e.nombre}
                  </span>
                </span>
                {conteos && (
                  <span className="cifras pl-3.5 text-[11px] text-tenue">
                    {conteos[e.id] ?? 0} {conteos[e.id] === 1 ? 'iniciativa' : 'iniciativas'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------
// Barra proporcional: la misma idea del riel, comprimida. Sirve para
// leer de un vistazo dónde está represado el trámite.
// ---------------------------------------------------------------------
export function RielProporcional({ datos }: {
  datos: { id: number; nombre: string; color: ColorEstado; valor: number }[];
}) {
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-panel-2">
        {datos.map((d) => (
          d.valor > 0 && (
            <span
              key={d.id}
              title={`${d.nombre}: ${d.valor}`}
              style={{ width: `${(d.valor / total) * 100}%` }}
              className={tono(d.color).solido}
            />
          )
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {datos.map((d) => (
          <li key={d.id} className="flex items-center gap-1.5 text-[12px] text-tinta-2">
            <span aria-hidden className={`h-2 w-2 rounded-full ${tono(d.color).solido}`} />
            {d.nombre}
            <span className="cifras font-bold">{d.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
