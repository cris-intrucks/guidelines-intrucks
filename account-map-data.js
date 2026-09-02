/* Mapa de Cuentas — constantes extraídas (scripts de llamada + portafolio). */
window.ACCOUNT_MAP_CAT_LABELS = {
  crecimiento: 'Crecimiento',
  interno: 'Migración interna',
  externo: 'Objetivo externo',
  aor: 'Candidata AOR',
  evitar: 'Evitar'
};

window.ACCOUNT_MAP_FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'aor', label: '★ Candidatas AOR' },
  { id: 'externo', label: '→ Objetivo externo' },
  { id: 'interno', label: '⇄ Migración interna' },
  { id: 'crecimiento', label: '↑ En crecimiento' },
  { id: 'evitar', label: '⊘ Evitar' }
];

window.ACCOUNT_MAP_SCRIPTS = {
  aor: {
    label: 'Perfil 1 — Oportunidad de AOR',
    objetivo: 'Convertirte en agente de registro (AOR) — NO cambiar de aseguradora, ya que estadísticamente va a renovar ahí de todas formas.',
    linea: '“Hola, soy [nombre] de InTrucks. Vi que su póliza actual es con [aseguradora] — trabajamos directamente con ellos y muchos transportistas no saben que pueden tener el mismo respaldo, con el mismo precio, pero con un agente que les atiende en español y responde rápido. No busco cambiarle de aseguradora, solo ofrecerle mejor servicio con la misma cobertura.”',
    nota: 'No menciones precio de entrada — el argumento es servicio y relación, no hay diferencia de precio que ofrecer contra la misma aseguradora.'
  },
  externo: {
    label: 'Perfil 2 — Ataque directo',
    objetivo: 'Ganar el cliente hacia tu portafolio — aquí sí compites en precio y cobertura.',
    linea: '“Hola, soy [nombre] de InTrucks. Vi que su póliza con [aseguradora] vence pronto. Trabajamos con varias opciones para transportistas de su perfil y muchas veces conseguimos mejor precio o cobertura — ¿le interesa que le cotice sin compromiso antes de que renueve?”',
    nota: 'Objeción "mi precio está bien": "Perfecto, entonces esto es solo para confirmar que sigue siendo su mejor opción — no pierde nada con comparar."'
  },
  interno: {
    label: 'Perfil 3 — Migración interna',
    objetivo: 'No perder el cliente — moverlo a la alternativa interna con mejor tasa de conversión conocida.',
    linea: '“Hola [nombre], le llamo porque su renovación con [aseguradora actual] tuvo un cambio que no nos favorece esta vez, pero ya tengo otra opción lista dentro de nuestro mismo grupo de aseguradoras — con condiciones muy similares. No hace falta que busque en otro lado.”',
    nota: 'Esta llamada se hace ANTES de que el cliente reciba la noticia de un aumento por otro lado — la ventaja es la anticipación, no la persuasión.'
  },
  evitar: {
    label: 'Perfil 5 — Baja prioridad',
    objetivo: 'No es prioridad de contacto activo — estas aseguradoras retienen tan bien que el retorno esperado de atacarlas es bajo.',
    linea: 'Si de todas formas surge la oportunidad (referido directo, el cliente llama primero), trata la llamada como el Perfil 2 — pero no inviertas tiempo de prospección proactiva aquí.',
    nota: 'Redirige ese tiempo de llamada hacia el Perfil 2 (objetivo externo) o el Perfil 1 (AOR), donde la probabilidad de éxito ya es más alta.'
  },
  crecimiento: {
    label: 'Contexto — Aseguradora en crecimiento',
    objetivo: 'Esto no es un perfil de contacto en sí — es señal de que esta aseguradora tuya está ganando terreno real. Úsala con más frecuencia como primera opción de cotización en el Perfil 2 y 3.',
    linea: 'Al cotizar un lead nuevo que encaje en su apetito de riesgo, pon esta aseguradora primero en la lista de opciones — los datos muestran que está cerrando más, no solo manteniéndose.',
    nota: 'Revisar cada trimestre si la tendencia se sostiene antes de ajustar el orden de cotización.'
  }
};

window.ACCOUNT_MAP_COMPANIES = [
  {name:'Universal Casualty', cat:'crecimiento', metric:'+2.40 pp participación', detail:'FL, TX, PA, CA · 1,403 pólizas'},
  {name:'Everspan', cat:'crecimiento', metric:'+1.04 pp participación', detail:'FL, TX, NC, CA · 145 pólizas'},
  {name:'County Hall', cat:'crecimiento', metric:'+0.84 pp participación', detail:'FL, TX · 325 pólizas'},
  {name:'Brooklyn Specialty', cat:'crecimiento', metric:'+0.76 pp participación', detail:'FL, TX, GA, CA · 588 pólizas'},
  {name:'Sutton Specialty', cat:'crecimiento', metric:'+0.54 pp participación', detail:'TX, CA · 212 pólizas'},
  {name:'Commodore', cat:'crecimiento', metric:'+0.44 pp participación', detail:'TX, GA, CA · 86 pólizas'},

  {name:'Accredited Specialty → Highlander Specialty', cat:'interno', metric:'93 casos', detail:'Patrón de sustitución casi directo — tenlo listo como plan B automático'},
  {name:'Canal → Northland', cat:'interno', metric:'42 casos', detail:'Segundo par interno más frecuente'},
  {name:'Canal → Berkley Casualty', cat:'interno', metric:'24 casos', detail:''},
  {name:'Everspan Indemnity → Accredited Specialty', cat:'interno', metric:'18 casos', detail:''},

  {name:'Progressive County Mutual', cat:'externo', metric:'229 ganados', detail:'Mejor cierre: Geico County Mutual (115 casos)'},
  {name:'United Financial Casualty', cat:'externo', metric:'135 ganados', detail:'Mejor cierre: Geico Marine (54 casos)'},
  {name:'Progressive Mountain (OH)', cat:'externo', metric:'113 ganados', detail:'Mejor cierre: Geico Marine (51 casos)'},
  {name:'Accredited Surety & Casualty', cat:'externo', metric:'111 ganados', detail:'Mejor cierre: Northland (21 casos)'},
  {name:'Progressive Express', cat:'externo', metric:'82 ganados', detail:'Mejor cierre: Geico Marine (36 casos)'},
  {name:'Great West Casualty', cat:'externo', metric:'74 ganados', detail:'Mejor cierre: Geico County Mutual (16 casos)'},
  {name:'Trisura Specialty', cat:'externo', metric:'72 ganados', detail:'Mejor cierre: Cimarron (15 casos)'},
  {name:'Bulldog National', cat:'externo', metric:'42 ganados', detail:'Mejor cierre: Brooklyn Specialty (22 casos)'},
  {name:'Wesco', cat:'externo', metric:'41 ganados', detail:'Mejor cierre: Berkley Casualty (9 casos)'},
  {name:'Southlake Specialty', cat:'externo', metric:'33.1% retención', detail:'124 casos observados — objetivo fácil, retiene poco a sus clientes'},
  {name:'One Commercial', cat:'externo', metric:'25.5% retención', detail:'51 casos observados'},
  {name:'Benchmark Specialty', cat:'externo', metric:'25.4% retención', detail:'71 casos observados'},
  {name:'Knight Specialty', cat:'externo', metric:'13.5% retención', detail:'96 casos — verificado: no es migración interna de CoverWhale'},
  {name:'Harco National', cat:'externo', metric:'6.9% retención', detail:'29 casos observados'},
  {name:'Accredited Specialty (fuera de CW/MAT)', cat:'externo', metric:'0.0% retención', detail:'47 casos — verificado: fuga real, no reacomodo de MGA'},
  {name:'Canal → Geico Marine', cat:'externo', metric:'17 casos', detail:'Canal es tu aseguradora con más fuga interna en total (165 casos)'},
  {name:'Geico Marine → Canal', cat:'externo', metric:'14 casos', detail:''},

  {name:'Geico General', cat:'aor', metric:'83.8% retención', detail:'37 casos · portafolio en PA'},
  {name:'Geico County Mutual', cat:'aor', metric:'82.8% retención', detail:'413 casos · PA, TX'},
  {name:'Hyundai Marine & Fire (US Branch)', cat:'aor', metric:'81.0% retención', detail:'163 casos · CA'},
  {name:'Geico Marine', cat:'aor', metric:'80.3% retención', detail:'641 casos · FL, GA, NC, PA, TX — tu mejor candidata AOR por volumen'},
  {name:'Northland', cat:'aor', metric:'77.3% retención', detail:'379 casos · CA, FL, GA, NC, PA, TX'},
  {name:'Brooklyn Specialty', cat:'aor', metric:'71.8% retención', detail:'188 casos · CA, FL, GA, PA, TX'},

  {name:'Arch', cat:'evitar', metric:'100% retención', detail:'12 casos observados'},
  {name:'Vanliner', cat:'evitar', metric:'100% retención', detail:'17 casos observados'},
  {name:'Hartford Fire', cat:'evitar', metric:'100% retención', detail:'10 casos observados'},
  {name:'Erie Exchange', cat:'evitar', metric:'97.7% retención', detail:'44 casos observados'},
  {name:'Acuity Mutual', cat:'evitar', metric:'96.6% retención', detail:'29 casos observados'},
  {name:'Old Republic', cat:'evitar', metric:'92.0% retención', detail:'50 casos observados'}
].map(function(c, i){ return Object.assign({ id: i }, c); });
