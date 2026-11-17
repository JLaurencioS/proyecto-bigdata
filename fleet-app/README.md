# fleet-app

Prototipo de Smart Fleet Tracking: API Express + MongoDB (OpenAPI) y frontend con Leaflet.

## Puesta en marcha
```bash
cp .env.example .env      # completa MONGO_URI y secretos
npm install
npm run seed              # usuarios despachador1 / analista1
npm run load:zonas        # carga zonas GeoJSON (por defecto, una muestra pequeña)
npm run dev               # http://localhost:3000
```

## Zonas GeoJSON
`GET /api/zonas` devuelve un `FeatureCollection` (WGS84) con `zone_id`, `zone` y `borough`.
Para cargar las 263 zonas reales de TLC en formato GeoJSON WGS84:
```bash
npm run load:zonas -- ruta/o/url/taxi_zones.geojson
```
El script acepta propiedades `LocationID`/`location_id`/`zone_id`, `zone` y `borough`, es idempotente
(upsert por `zone_id`) y rechaza archivos con coordenadas proyectadas (p. ej. EPSG:2263).
`data/zonas.sample.geojson` es solo una muestra aproximada de 6 zonas para desarrollo.

## Frontend (`public/`)
Login por sesión, mapa Leaflet con las zonas, búsqueda, filtro por borough y panel de detalle.
Leaflet se sirve desde `node_modules` (`/vendor/leaflet`) para cumplir la CSP de helmet.
