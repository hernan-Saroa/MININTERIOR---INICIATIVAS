-- =====================================================================
-- Archivo: 03_datos_iniciales.sql — carga de las 6 direcciones
-- Todas las iniciativas parten en cero; cada dirección carga las suyas
-- desde el tablero.
-- =====================================================================
USE iniciativas_legislativas;

INSERT INTO direcciones (id, nombre, nombre_corto, descripcion, orden) VALUES
('dialogo', 'Dirección de Diálogo Social', 'Diálogo Social',
 'Coordinación de espacios de interlocución con actores sociales y territoriales, y seguimiento a compromisos derivados de procesos de diálogo con incidencia normativa.', 1),

('indigenas', 'Dirección de Asuntos Indígenas, Rrom y Minorías', 'Asuntos Indígenas',
 'Concertación con la Mesa Permanente de Concertación (MPC), gobierno propio, protocolización de decretos y proyectos normativos con pueblos indígenas y Rrom.', 2),

('ddhh', 'Dirección de Derechos Humanos', 'Derechos Humanos',
 'Política nacional integral de DD.HH. y DIH, garantías para líderes sociales y personas defensoras, seguimiento a proyectos de ley y actos legislativos en la materia.', 3),

('religiosos', 'Dirección de Asuntos Religiosos', 'Asuntos Religiosos',
 'Libertad religiosa y de cultos, diálogo interreligioso e implementación del sistema nacional del sector.', 4),

('negras', 'Dirección de Asuntos para Comunidades Negras, Afrocolombianas, Raizales y Palenqueras', 'Comunidades Negras',
 'Política pública, participación política y garantías normativas para comunidades negras, afrocolombianas, raizales y palenqueras.', 5),

('consulta', 'Dirección de la Autoridad Nacional de Consulta Previa', 'Consulta Previa',
 'Coordinación y realización de procesos de consulta previa para iniciativas legislativas y administrativas del nivel nacional, y protocolización de acuerdos con comunidades étnicas.', 6)

ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  nombre_corto = VALUES(nombre_corto),
  descripcion = VALUES(descripcion),
  orden = VALUES(orden);
