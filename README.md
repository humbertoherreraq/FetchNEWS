# FetchNews

Aplicación web ligera para construir protocolos editoriales de búsqueda sobre feeds RSS/Atom oficiales, con historial persistido en un archivo local JSON.

## Funciones

- Generación de protocolo/prompt basado en `TEMA`, `RANGO_FECHA`, idioma, exclusiones y `MAX_POR_FUENTE`.
- Catálogo visible de fuentes autorizadas y sus feeds oficiales.
- Botón para volver a realizar una búsqueda.
- Botón para ejecutar nuevamente una búsqueda anterior.
- Historial persistido en `data/searches.json`.

## Ejecutar

```bash
npm start
```

Luego abre `http://localhost:3000`.
