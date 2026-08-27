import { Component, type ErrorInfo, type ReactNode } from 'react';

// =====================================================================
// Último recinto antes de la pantalla en blanco.
//
// Sin esto, cualquier excepción durante el dibujado desmonta el árbol
// completo y el usuario se queda mirando una página vacía, sin saber si
// se cayó el servidor, si perdió la sesión o si su equipo está mal.
// No hay forma de recuperarse desde ahí salvo recargar a ciegas.
//
// Tiene que ser una clase: los ganchos no pueden capturar errores de
// dibujado. Es la única clase del proyecto y por eso vive aparte.
// =====================================================================

interface Props { children: ReactNode; }
interface Estado { error: Error | null; }

export class LimiteError extends Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola del navegador para poder diagnosticarlo con la
    // persona al teléfono, que es como se soporta esto en la práctica.
    console.error('[interfaz] error no controlado:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: '#f4f6f9',
        fontFamily: "'Helvetica Neue', Arial, sans-serif", color: '#151b26',
      }}>
        <div style={{
          maxWidth: '520px', background: '#fff', border: '1px solid #e1e5ec',
          borderTop: '3px solid #c0392b', borderRadius: '10px', padding: '28px 30px',
        }}>
          <h1 style={{ fontSize: '19px', margin: '0 0 10px', fontWeight: 700 }}>
            La pantalla no se pudo mostrar
          </h1>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#69707e', margin: '0 0 8px' }}>
            Ocurrió un fallo al dibujar la página. <b style={{ color: '#151b26' }}>
            Las iniciativas y los documentos guardados no se han perdido</b>: el
            problema está en la interfaz, no en los datos.
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#69707e', margin: '0 0 20px' }}>
            Vuelva a cargar la página. Si sigue apareciendo este mensaje, avise al
            equipo de sistemas e indíquele qué estaba haciendo.
          </p>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                fontSize: '13px', fontWeight: 600, background: '#2151d1', color: '#fff',
                border: '1px solid #2151d1', padding: '9px 16px', borderRadius: '7px',
                cursor: 'pointer',
              }}
            >
              Volver a cargar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              style={{
                fontSize: '13px', fontWeight: 600, background: '#fff', color: '#69707e',
                border: '1px solid #e1e5ec', padding: '9px 16px', borderRadius: '7px',
                cursor: 'pointer',
              }}
            >
              Ir al tablero
            </button>
          </div>

          <p style={{
            fontSize: '11.5px', lineHeight: 1.5, color: '#69707e', margin: '18px 0 0',
            paddingTop: '14px', borderTop: '1px solid #e1e5ec',
          }}>
            Detalle técnico: <code style={{ fontSize: '11px' }}>{this.state.error.message}</code>
          </p>
        </div>
      </div>
    );
  }
}
