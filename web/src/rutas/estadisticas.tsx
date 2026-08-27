import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api } from '../api/cliente';
import { Tarjeta, Epigrafe, Cargando, tono, ErrorPantalla
} from '../ui/base';
import { RielProporcional } from '../ui/riel';

const HEX = {
  gris: '#69707e', azul: '#2151d1', ambar: '#a4690b',
  verde: '#1f8a5f', rojo: '#c0392b', morado: '#6b4bb8',
} as const;

export function Estadisticas() {
  const { data: flujo, isLoading, isError, error, refetch } = useQuery({ queryKey: ['estadisticas'], queryFn: api.estadisticas });
  const { data: direcciones } = useQuery({ queryKey: ['direcciones'], queryFn: api.direcciones });
  const { data: todas } = useQuery({ queryKey: ['iniciativas', undefined], queryFn: () => api.iniciativas() });

  if (isLoading || !flujo) return <Cargando texto="Calculando indicadores" />;

  const total = flujo.reduce((s, e) => s + e.actuales, 0);
  const enCurso = flujo.filter((e) => e.dias_promedio !== null);
  const cuelloBotella = [...enCurso].sort((a, b) => (b.dias_promedio ?? 0) - (a.dias_promedio ?? 0))[0];
  const propuestas = (todas ?? []).filter((i) => i.origen === 'propuesta').length;

  const datosDias = enCurso.map((e) => ({
    nombre: e.nombre, dias: e.dias_promedio ?? 0, color: HEX[e.color],
  }));

  return (
    <div>
      <header className="mb-6">
        <Epigrafe>Administración</Epigrafe>
        <h1 className="titulo mt-1.5 text-[26px] leading-tight sm:text-[30px]">Estadísticas del trámite</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-tenue">
          Dónde está represado el trámite y cuánto tarda cada paso. Se calcula
          con el historial de movimientos, así que refleja lo que realmente pasó.
        </p>
      </header>

      {/* El dato que importa primero: dónde se atasca */}
      {cuelloBotella && (
        <Tarjeta className="mb-4 overflow-hidden">
          <div className="border-b border-linea bg-panel-2 px-4 py-2.5 sm:px-5">
            <Epigrafe>El paso más lento del trámite</Epigrafe>
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 p-4 sm:p-5">
            <div>
              <p className="flex items-baseline gap-2">
                <span className={`cifras text-[42px] font-bold leading-none ${tono(cuelloBotella.color).texto}`}>
                  {cuelloBotella.dias_promedio}
                </span>
                <span className="text-[14px] text-tenue">días en promedio</span>
              </p>
              <p className="mt-2 text-[14.5px] font-bold">{cuelloBotella.nombre}</p>
              <p className="mt-0.5 text-[12.5px] text-tenue">
                <span className="cifras">{cuelloBotella.actuales}</span> iniciativas ahí ahora ·
                <span className="cifras"> {cuelloBotella.entradas}</span> han pasado en total
              </p>
            </div>
            {cuelloBotella.actuales > 0 && flujo.find((e) => e.id === cuelloBotella.id) && (
              <p className="max-w-xs text-[12.5px] leading-relaxed text-tenue">
                Un estado con demora alta y sin responsables asignados es la causa
                más frecuente de que una iniciativa se quede quieta sin que nadie lo note.
              </p>
            )}
          </div>
        </Tarjeta>
      )}

      <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
        <Indicador titulo="Iniciativas activas" valor={total} nota="En todas las direcciones" />
        <Indicador titulo="Llegadas por propuesta" valor={propuestas}
          nota="Registradas desde el formulario público" />
        <Indicador titulo="Direcciones vinculadas" valor={direcciones?.length ?? 0}
          nota="Con iniciativas en seguimiento" />
      </div>

      <Tarjeta className="mb-4 p-4 sm:p-5">
        <Epigrafe>Distribución por estado</Epigrafe>
        <p className="mb-4 mt-1 text-[13px] text-tenue">
          Qué proporción del trámite está en cada paso, ahora mismo.
        </p>
        <RielProporcional datos={flujo.map((e) => ({
          id: e.id, nombre: e.nombre, color: e.color, valor: e.actuales,
        }))} />
      </Tarjeta>

      <Tarjeta className="p-4 sm:p-5">
        <Epigrafe>Días promedio en cada estado</Epigrafe>
        <p className="mb-4 mt-1 text-[13px] text-tenue">
          Los estados finales no aparecen: una vez ahí, el trámite no sigue.
        </p>
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datosDias} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#e1e5ec" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#69707e' }}
                axisLine={{ stroke: '#e1e5ec' }} tickLine={false} />
              <YAxis type="category" dataKey="nombre" width={128}
                tick={{ fontSize: 11.5, fill: '#4a5364' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v} días`, 'Promedio']}
                contentStyle={{
                  fontSize: 12, borderRadius: 8, border: '1px solid #e1e5ec',
                  boxShadow: '0 2px 8px rgba(16,26,46,.08)',
                }}
              />
              <Bar dataKey="dias" radius={[0, 4, 4, 0]} barSize={22}>
                {datosDias.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>
    </div>
  );
}

function Indicador({ titulo, valor, nota }: { titulo: string; valor: number; nota: string }) {
  return (
    <Tarjeta className="p-4">
      <p className="cifras text-[30px] font-bold leading-none text-accion">{valor}</p>
      <p className="mt-2 text-[13px] font-bold">{titulo}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-tenue">{nota}</p>
    </Tarjeta>
  );
}
