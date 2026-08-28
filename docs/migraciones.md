# Migraciones

Toda la lógica de datos vive en procedimientos almacenados definidos por
migraciones SQL. Hay **una sola base**, `iniciativas_legislativas`, compartida
por los seis microservicios.

Las migraciones están repartidas en `ms-*/migraciones/NN_*.sql` y se numeran de
forma **global** (el número, no el repositorio, marca el orden). Son idempotentes
y todas hacen `USE iniciativas_legislativas`.

## Orden global

| Nº | Archivo | Repositorio |
|----|---------|-------------|
| 01 | `01_schema.sql` | ms-iniciativas |
| 02 | `02_procedimientos.sql` | ms-iniciativas |
| 03 | `03_datos_iniciales.sql` | ms-iniciativas |
| 04 | `04_autenticacion.sql` | ms-autenticacion |
| 05 | `05_propuestas.sql` | ms-radicacion |
| 06 | `06_roles_permisos.sql` | ms-administracion *(idéntica en ms-autenticacion)* |
| 07 | `07_flujo_estados.sql` | ms-flujo-estados |
| 08 | `08_correcciones.sql` | ms-iniciativas |
| 09 | `09_flujo_al_crear.sql` | ms-flujo-estados |
| 10 | `10_historial_de_edicion.sql` | ms-iniciativas |
| 11 | `11_historial_fiel.sql` | ms-iniciativas |
| 12 | `12_ver_proponente.sql` | ms-radicacion |
| 13 | `13_tiempo_en_estado.sql` | ms-iniciativas |
| 14 | `14_autorizacion_y_flujo.sql` | ms-flujo-estados |
| 15 | `15_cuentas_y_sesiones.sql` | ms-autenticacion |

El orden importa: la 01 crea `usuarios` e `iniciativas`, y las migraciones de
autenticación, radicación y flujo las **alteran**. La 06 es idéntica en dos
repositorios (herencia del monolito): se aplica **una sola vez**.

## Aplicación automática (recomendada)

Con Docker no hay que hacer nada: el servicio `migrador` de la orquestación
aplica todo en orden, deduplicando la 06, cada vez que se levanta la plataforma:

```bash
docker compose up -d --build
```

Es idempotente; volver a levantar no rompe nada.

## Aplicación manual

Contra una base ya creada, en orden numérico global y deduplicando por nombre de
archivo:

```bash
for f in $(for p in ms-*/migraciones/*.sql; do echo "$(basename "$p")|$p"; done \
          | sort | awk -F'|' '!v[$1]++{print $2}'); do
  echo "-> $(basename "$f")"
  mysql --default-character-set=utf8mb4 -u root -p iniciativas_legislativas < "$f"
done
```

> Ejecutar **siempre** con `--default-character-set=utf8mb4`, o las tildes y la
> «ñ» se corrompen.

## Comprobar el estado

```sql
USE iniciativas_legislativas;
SHOW TABLES;                                   -- deben existir 15 tablas
SELECT COUNT(*) FROM information_schema.routines
  WHERE routine_schema = 'iniciativas_legislativas';   -- ~50 procedimientos
SELECT COUNT(*) FROM direcciones;              -- 6 direcciones sembradas
```
