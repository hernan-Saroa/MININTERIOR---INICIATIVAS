import type { ReactNode } from 'react';
import '../pie-institucional.css';

// =====================================================================
// Pie institucional del Ministerio del Interior.
//
// Réplica del pie de https://www.mininterior.gov.co/: mismas sedes, mismas
// direcciones, mismos teléfonos, mismos enlaces y mismos logos, en el mismo
// orden. La retícula y los colores están en `pie-institucional.css`, que
// anota de qué módulo de Divi sale cada valor.
//
// Los datos van escritos en el código a propósito. Son datos de contacto de
// una entidad: cambian una o dos veces al año, tienen que salir idénticos a
// los del portal —es lo que un ciudadano compara— y no hay ninguna API que
// los sirva. Ponerlos en la base de datos añadiría una consulta y un estado
// de carga a un bloque que nunca cambia entre despliegues.
//
// Si el portal cambia una dirección, se cambia aquí. El pie del portal vive
// en su plantilla de Divi «tb-31861».
// =====================================================================

// Separador entre enlaces de políticas. El original los separa con espacios
// duros (U+00A0) para conseguir un hueco visible; con espacios normales el
// navegador los colapsaría en uno y los seis enlaces quedarían pegados.
const HUECO = '      ';

const REDES = [
  {
    nombre: 'Twitter',
    url: 'https://twitter.com/MinInterior',
    // Marcas registradas: los trazos son los oficiales de cada red, que es
    // lo que la gente reconoce de un vistazo en una franja de 32 px.
    trazo: 'M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723 9.99 9.99 0 01-3.127 1.195 4.92 4.92 0 00-8.384 4.482A13.978 13.978 0 011.64 3.162a4.93 4.93 0 001.523 6.574 4.903 4.903 0 01-2.229-.616v.061a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.224.084 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.054 0 13.999-7.496 13.999-13.986 0-.209 0-.42-.015-.63a9.936 9.936 0 002.46-2.548l-.036-.02z',
  },
  {
    nombre: 'Instagram',
    url: 'https://www.instagram.com/mininterior',
    trazo: 'M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311 1.266-.058 1.646-.07 4.85-.07zm0 1.802c-3.15 0-3.503.011-4.737.067-1.096.05-1.79.24-2.29.74-.5.5-.69 1.194-.74 2.29-.056 1.234-.067 1.587-.067 4.737s.011 3.503.067 4.737c.05 1.096.24 1.79.74 2.29.5.5 1.194.69 2.29.74 1.234.056 1.587.067 4.737.067s3.503-.011 4.737-.067c1.096-.05 1.79-.24 2.29-.74.5-.5.69-1.194.74-2.29.056-1.234.067-1.587.067-4.737s-.011-3.503-.067-4.737c-.05-1.096-.24-1.79-.74-2.29-.5-.5-1.194-.69-2.29-.74-1.234-.056-1.587-.067-4.737-.067zm0 3.064a5.13 5.13 0 110 10.26 5.13 5.13 0 010-10.26zm0 1.802a3.328 3.328 0 100 6.656 3.328 3.328 0 000-6.656zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z',
  },
  {
    nombre: 'Facebook',
    url: 'https://www.facebook.com/MinInterior/',
    trazo: 'M14.5 8.5h2.7V5.2h-2.9c-3 0-4.4 1.9-4.4 4.4v2.1H7.5v3.3h2.4V24h3.7v-9h2.7l.5-3.3h-3.2V9.9c0-.9.4-1.4 1.4-1.4z',
  },
  {
    nombre: 'YouTube',
    url: 'https://www.youtube.com/c/MininteriorGovCol',
    trazo: 'M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 00.5 6.2C0 8.09 0 12 0 12s0 3.91.5 5.8a3.02 3.02 0 002.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 002.12-2.14C24 15.91 24 12 24 12s0-3.91-.5-5.8zM9.55 15.57V8.43L15.82 12l-6.27 3.57z',
  },
];

function Redes({ variante }: { variante: 'escritorio' | 'movil' }) {
  return (
    <ul className={`pie-min-social pie-min-social--${variante}`}>
      {REDES.map((red) => (
        <li key={red.nombre}>
          <a
            href={red.url}
            target="_blank"
            rel="noopener noreferrer"
            // El original pone el rótulo «Seguir» en los cuatro enlaces y lo
            // oculta con aria-hidden, así que un lector de pantalla anuncia
            // cuatro enlaces sin nombre. Aquí cada uno dice a dónde va.
            title={`Seguir al Ministerio del Interior en ${red.nombre}`}
            aria-label={`Seguir al Ministerio del Interior en ${red.nombre}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={red.trazo} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Una sede con su bloque de contacto al lado: la fila que el pie repite
// cuatro veces para Bancol, Consulta Previa, Archivo Central y Popayán.
//
// Las cuatro filas NO llevan el mismo aire, y no por diseño. En el gestor
// de contenidos del portal cada bloque se escribió a mano y unos quedaron
// dentro de <p> y otros como texto suelto. Los que van en <p> arrastran
// los 16 px de `margin-bottom` que Bootstrap le pone a todo párrafo; los
// sueltos, no. De ahí que «Sede – Bancol» tenga 16 px más de aire debajo
// que «Sede – Popayán, Cauca».
//
// Se replica porque el encargo era que el pie fuera igual al del portal,
// y esto se ve: son 16 px en tres de las cinco sedes. Los tres indicadores
// dicen qué bloque va en <p> en el portal; poniéndolos todos en false el
// pie queda con espaciado uniforme, que es lo que el portal tendría si su
// contenido se hubiera escrito de una sola forma.
function Sede({ nombre, direccion, contacto, sedeEnParrafo = false,
                contactoEnParrafo = false, direccionSuelta = false }: {
  nombre: string;
  direccion: ReactNode;
  contacto: ReactNode;
  sedeEnParrafo?: boolean;
  contactoEnParrafo?: boolean;
  direccionSuelta?: boolean;
}) {
  return (
    <div className="pie-min-fila pie-min-fila--sede">
      <div className="pie-min-col">
        <h3 className={'pie-min-rotulo' + (sedeEnParrafo ? ' pie-min-aire' : '')}>{nombre}</h3>
        <div className={'pie-min-datos' + (direccionSuelta ? ' pie-min-suelto' : '')}>
          {direccion}
        </div>
      </div>
      <div className="pie-min-col">
        <h3 className={'pie-min-rotulo' + (contactoEnParrafo ? ' pie-min-aire' : '')}>Contacto</h3>
        <div className="pie-min-datos">{contacto}</div>
      </div>
    </div>
  );
}

export function PieInstitucional() {
  return (
    <footer className="pie-min">
      {/* --------------------------------------------------------------
          Sede principal, logos institucionales y redes sociales.
          -------------------------------------------------------------- */}
      <div className="pie-min-fila pie-min-fila--datos">
        <div className="pie-min-col pie-min-col--2-5">
          <h2 className="pie-min-tit">Ministerio del Interior</h2>
          <h3 className="pie-min-rotulo">Sede Principal – La Giralda</h3>
          <div className="pie-min-datos">
            <p>
              Dirección: Carrera 8 No. 7 – 83. Bogotá, D.C.<br />
              Código Postal: 111711<br />
              Horario de Atención: Lunes a Viernes de 8:00 a.m. a 4:00 p.m.<br />
              Teléfono Conmutador: +57 601 242 74 00<br />
              Líneas Quejas y Reclamos: 018000 91 04 03<br />
              Línea Anticorrupción: 018000 91 04 03<br />
              Correo Institucional:{' '}
              <a href="mailto:servicioalciudadano@mininterior.gov.co">
                servicioalciudadano@mininterior.gov.co
              </a><br />
              Correo de notificaciones judiciales:{' '}
              <a href="mailto:notificacionesjudiciales@mininterior.gov.co">
                notificacionesjudiciales@mininterior.gov.co
              </a><br />
              Denuncias por actos de corrupción:{' '}
              <a href="mailto:servicioalciudadano@mininterior.gov.co">
                servicioalciudadano@mininterior.gov.co
              </a><br />
              Radicación de correspondencia:{' '}
              <a href="mailto:servicioalciudadano@mininterior.gov.co">
                servicioalciudadano@mininterior.gov.co
              </a>
            </p>
          </div>
          <Redes variante="escritorio" />
        </div>

        <div className="pie-min-col pie-min-col--3-5">
          <div className="pie-min-logo-interior">
            {/* Mismo archivo que la franja institucional de arriba: es el
                logo de 428 × 432 que publica el portal. */}
            <img src="/logo-mininterior.png" alt="Ministerio del Interior" width={428} height={432} />
          </div>
          <div className="pie-min-icontec">
            <img src="/sello-icontec.png" alt="Sello ICONTEC ISO 45001" width={1067} height={766} />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------
          Las otras cuatro sedes.
          -------------------------------------------------------------- */}
      <Sede
        nombre="Sede – Bancol"
        sedeEnParrafo contactoEnParrafo direccionSuelta
        direccion={
          <p>
            Dirección: Carrera 8 No. 12 B – 31. Bogotá, D.C<br />
            Código Postal: 111711<br />
            Horario de Atención: Lunes a Viernes de 8:00 a.m. a 4:00 p.m.
          </p>
        }
        contacto={
          <>
            <p>
              Teléfono: +57 601 242 74 00<br />
              Extensiones: 4130 – 4132 – 4133
            </p>
            {/* El portal deja aquí un párrafo vacío que separa esta sede de
                la siguiente. Se conserva porque el aire es parte del pie. */}
            <p>{' '}</p>
          </>
        }
      />

      <Sede
        nombre="Sede – Autoridad Nacional de Consulta Previa Ventanilla Única"
        sedeEnParrafo direccionSuelta
        direccion={
          <p>
            Dirección: Carrera 13 No. 75 – 58. 1 piso. Bogotá, D.C<br />
            Código Postal: 111711<br />
            Horario de Atención: Lunes a Viernes de 8:00 a.m. a 4:00 p.m.
          </p>
        }
        contacto={
          <p>
            Teléfono: +57 601 242 74 00<br />
            6621 Recepción<br />
            6622 Subdirección Corporativa<br />
            6624 Subdirección Técnica<br />
            6625 Subdirección de Gestión<br />
            6626 Grupo de Gestión Jurídica
          </p>
        }
      />

      <Sede
        nombre="Sede – Archivo Central"
        sedeEnParrafo
        // Esta sede es la única escrita en tres párrafos en el portal, y por
        // eso sus tres líneas van más separadas que las de las demás.
        direccion={
          <>
            <p>Dirección: Carrera 10 No 15 – 22 Piso 8. Bogotá, D.C</p>
            <p>Código Postal: 111711</p>
            <p>Horario de Atención: Lunes a Viernes de 8:00 a.m. a 4:00 p.m.</p>
          </>
        }
        contacto={
          <p>
            Teléfono: +57 601 242 74 00<br />
            Extensiones: 3982 – 3983 – 3984
          </p>
        }
      />

      <Sede
        nombre="Sede – Popayán, Cauca"
        direccionSuelta
        direccion={
          /* «Dirección: Dirección:» está repetido en el portal. Se deja tal
             cual: es el texto publicado por la entidad y el encargo era que
             el pie saliera igual. Cuando lo corrijan allí, se corrige aquí. */
          <p>
            Dirección: Dirección: Nasa Kiwe – calle 1AN No. 2 – 39. Popayán, Cauca<br />
            Código Postal: 190001<br />
            Horario de Atención: lunes a viernes de 8:00 a.m. a 5:00 p.m
          </p>
        }
        contacto={<p>Teléfono: +57 602 837 30 75</p>}
      />

      {/* --------------------------------------------------------------
          Políticas, términos y accesos. Los seis enlaces apuntan al
          portal: son documentos suyos y allí están las versiones vigentes.
          -------------------------------------------------------------- */}
      <div className="pie-min-fila pie-min-fila--enlaces">
        <div className="pie-min-col">
          <div className="pie-min-politicas">
            <p>
              <a href="https://www.mininterior.gov.co/wp-content/uploads/2022/09/2022-09-22_DOCUMENTO-POLITICA-PUBLICA-DE-PARTICIPACION-CIUDADANA-VERSION-FINAL-AJUSTADA-27092022.pdf" target="_blank" rel="noopener noreferrer">
                Otras Políticas
              </a>
              {HUECO}
              <a href="https://www.mininterior.gov.co/mapa-del-sitio/" target="_blank" rel="noopener noreferrer">
                Mapa del sitio
              </a>
              {HUECO}
              <a href="https://www.mininterior.gov.co/wp-content/uploads/2022/09/ir-a-terminos-y-condiciones-e-uso.pdf" target="_blank" rel="noopener noreferrer">
                Terminos y condiciones
              </a>
            </p>
            <p>
              <a href="https://www.mininterior.gov.co/wp-content/uploads/2025/12/politica-proteccion-datos-personales.pdf" target="_blank" rel="noopener noreferrer">
                Datos personales
              </a>
              {HUECO}
              <a href="https://www.mininterior.gov.co/wp-content/uploads/2022/09/POLITICA-DE-DERECHOS-DE-AUTOR-MININTERIOR.pdf" target="_blank" rel="noopener noreferrer">
                Derechos de autor
              </a>
              {HUECO}
              <a href="https://mininteriorgovco.sharepoint.com/sites/IntranetMininterior" target="_blank" rel="noopener noreferrer">
                Intranet Conecta Mininterior
              </a>
            </p>
          </div>
          {/* Bajo 981 px el bloque de redes de arriba se oculta y aparece
              este, igual que en el portal. */}
          <Redes variante="movil" />
        </div>
        <div className="pie-min-col" />
      </div>

      {/* --------------------------------------------------------------
          Banda azul con las marcas de país.
          -------------------------------------------------------------- */}
      <div className="pie-min-fila pie-min-fila--marcas">
        <div className="pie-min-col pie-min-col--1-5 pie-min-marca-co">
          <a href="https://www.colombia.co/" target="_blank" rel="noopener noreferrer" title="Marca País Colombia">
            <img src="/logo-co.png" alt="Marca País Colombia" width={71} height={70} />
          </a>
        </div>
        <div className="pie-min-col pie-min-col--1-5 pie-min-marca-govco">
          <a href="https://www.gov.co/" target="_blank" rel="noopener noreferrer" title="Portal Único del Estado Colombiano">
            <img src="/pie-govco.png" alt="GOV.CO" width={200} height={61} />
          </a>
        </div>
        <div className="pie-min-col pie-min-col--3-5" />
      </div>
    </footer>
  );
}
