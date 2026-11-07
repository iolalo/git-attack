// Piso 3 · Casos reales. Problemas típicos del trabajo con BI, orígenes de
// datos, la nube y APIs, contados como síntoma + evidencia. Todos son
// genéricos: ningún nombre, tabla ni cifra viene de un proyecto de verdad.
//
// Cada caso tiene hasta tres niveles, todos de elegir una opción:
//   Pasante  → ¿cuál es la causa raíz?
//   Junior   → ¿cuál es el arreglo?
//   Senior   → ¿cuál es el cambio exacto? (opciones casi iguales)

import type { Template } from "./challenges";
import { TopicKey } from "./types";

interface Case {
  id: string;
  topic: TopicKey;
  /** Qué pasa y qué se ve. */
  symptom: string;
  cause: { answer: string; wrong: [string, string, string]; explain: string };
  fix?: { answer: string; wrong: [string, string, string]; explain: string };
  /** El cambio exacto (código o ajuste), para el nivel Senior. */
  exact?: { prompt: string; answer: string; wrong: [string, string, string]; explain: string };
}

const CASES: Case[] = [
  // ============================================================ medidas (DAX)
  {
    id: "total-distinto",
    topic: "medidas",
    symptom:
      "Un visual con filtro de medida muestra $660 en el total, pero al exportar a Excel la suma de las filas da $59. La medida usa ISINSCOPE para tratar distinto el total.",
    cause: {
      answer: "En el total la medida entra por otra rama que recorre todos los productos, sin el filtro del visual",
      wrong: ["Excel redondea distinto que Power BI", "Falta refrescar el modelo", "La columna tiene tipo de dato texto"],
      explain: "Los filtros de medida a nivel visual no se propagan dentro del iterador de la otra rama: el total suma de más.",
    },
    fix: {
      answer: "Quitar el IF(ISINSCOPE(...)) y dejar que la medida base se evalúe igual en filas y total",
      wrong: ["Sumar un ajuste fijo al total", "Ocultar la fila de totales del visual", "Cambiar el filtro de medida por uno de página"],
      explain: "Si la medida base ya es correcta en cualquier contexto, el desvío por ISINSCOPE sólo agrega un camino que se puede romper.",
    },
  },
  {
    id: "lookupvalue-duplicados",
    topic: "medidas",
    symptom:
      "Una columna calculada con LOOKUPVALUE queda en error y el modelo marca Exception. La tabla de origen tiene 9 comprobantes repetidos con distinto reparto.",
    cause: {
      answer: "LOOKUPVALUE devuelve error cuando encuentra más de un valor distinto para la misma clave",
      wrong: ["La columna no está marcada como oculta", "El modelo tiene demasiadas relaciones", "La clave está escrita en minúsculas"],
      explain: "Con claves duplicadas y valores distintos no hay un único resultado: LOOKUPVALUE falla en lugar de elegir uno.",
    },
    fix: {
      answer: "Reemplazarlo por MAXX(FILTER(...)), que tolera varias coincidencias",
      wrong: ["Envolverlo en IFERROR y dejar los vacíos", "Convertir la columna en una medida con SUM", "Borrar la tabla de origen y recargarla"],
      explain: "MAXX sobre las filas filtradas elige un valor de manera explícita. IFERROR sólo taparía el problema.",
    },
    exact: {
      prompt: "¿Cuál es la columna calculada corregida?",
      answer: "Reparto = MAXX(FILTER(Ventas, Ventas[Comprobante] = Clientes[Comprobante]), Ventas[Reparto])",
      wrong: [
        "Reparto = SUMX(FILTER(Ventas, Ventas[Comprobante] = Clientes[Comprobante]), Ventas[Reparto])",
        "Reparto = IFERROR(LOOKUPVALUE(Ventas[Reparto], Ventas[Comprobante], Clientes[Comprobante]), BLANK())",
        "Reparto = COUNTROWS(FILTER(Ventas, Ventas[Comprobante] = Clientes[Comprobante]))",
      ],
      explain: "SUMX sobre texto no sirve y COUNTROWS cuenta en vez de traer el valor. IFERROR esconde el error pero no resuelve los duplicados.",
    },
  },
  {
    id: "memoria-html",
    topic: "medidas",
    symptom:
      "Una medida que arma una tabla en HTML falla con «consulta sin memoria (límite 1 GB)». Por dentro usa CONCATENATEX y un CALCULATE por cada celda de una grilla de proveedor × región.",
    cause: {
      answer: "Cada celda dispara un CALCULATE que recorre las tablas grandes de nuevo",
      wrong: ["El HTML pesa demasiado para mostrarlo", "La grilla tiene más de dos columnas", "El visual no tiene título"],
      explain: "45 celdas × millones de filas por celda es multiplicar el trabajo: la memoria se agota antes de terminar.",
    },
    fix: {
      answer: "Calcular una vez con ADDCOLUMNS y trabajar sobre esa tabla ya resuelta; y limitar la grilla con un tope",
      wrong: ["Subir el límite de memoria del visual", "Agregar más CALCULATE para repartir la carga", "Convertir las medidas en columnas calculadas"],
      explain: "Precalcular una vez y reutilizar baja las pasadas de N a 1. Un tope evita grillas gigantes con filtros muy abiertos.",
    },
  },
  {
    id: "promedio-diario",
    topic: "medidas",
    symptom:
      "El «promedio diario de ventas» de un producto da mucho menos que la columna calculada equivalente. La medida divide por DISTINCTCOUNT de fechas dentro de ALL(Ventas).",
    cause: {
      answer: "ALL(Ventas) hace que el denominador cuente todos los días con ventas de cualquier producto",
      wrong: ["DIVIDE no admite dos argumentos", "El producto no tiene fecha de alta", "La medida está en la tabla equivocada"],
      explain: "Sin ALL, los días se cuentan en el contexto del producto filtrado: sólo los días en que ese producto vendió.",
    },
    fix: {
      answer: "Sacar el ALL para que los días se cuenten en el contexto del filtro",
      wrong: ["Agregar otro ALL sobre Calendario", "Dividir por 30 fijo", "Multiplicar el resultado por la cantidad de productos"],
      explain: "El denominador tiene que respetar el mismo filtro que el numerador.",
    },
    exact: {
      prompt: "¿Cuál es la medida corregida?",
      answer: "VAR _Total = [Venta] VAR _Dias = DISTINCTCOUNT(Ventas[fecha]) RETURN DIVIDE(_Total, _Dias)",
      wrong: [
        "VAR _Total = [Venta] VAR _Dias = CALCULATE(DISTINCTCOUNT(Ventas[fecha]), ALL(Ventas)) RETURN DIVIDE(_Total, _Dias)",
        "VAR _Total = [Venta] VAR _Dias = COUNTROWS(Ventas) RETURN DIVIDE(_Total, _Dias)",
        "VAR _Total = [Venta] RETURN _Total / 30",
      ],
      explain: "COUNTROWS cuenta filas (no días) y ALL vuelve al error original.",
    },
  },
  {
    id: "porcentaje-suma",
    topic: "medidas",
    symptom: "Un margen % se ve bien en cada fila, pero en el total aparece 480 % porque la medida es un AVERAGE de la columna margen_pct.",
    cause: {
      answer: "Los porcentajes no se promedian: hay que calcular margen total sobre venta total",
      wrong: ["El total siempre suma las filas", "La columna debería ser entera", "Falta una relación con Calendario"],
      explain: "Un promedio de porcentajes pesa igual a filas chicas y grandes. La razón correcta es SUM(margen) / SUM(venta).",
    },
    fix: {
      answer: "DIVIDE([Margen $], [Venta $]) como medida",
      wrong: ["AVERAGE([Margen $])", "SUM(Ventas[margen_pct])", "Formatear el total como texto"],
      explain: "DIVIDE de dos medidas funciona igual en filas y en el total, y evita el error si el denominador es cero.",
    },
  },
  {
    id: "columna-vs-medida",
    topic: "medidas",
    symptom: "Un importe «no reacciona» a los segmentos: al filtrar por mes sigue mostrando el mismo número en todas las filas.",
    cause: {
      answer: "Es una columna calculada: se evalúa al refrescar, fila por fila, y no mira los filtros del visual",
      wrong: ["El segmento está desconectado del informe", "La tabla de fechas tiene huecos", "El formato está en moneda"],
      explain: "Las columnas calculadas se materializan al cargar. Lo que debe reaccionar a filtros es una medida.",
    },
  },
  {
    id: "dividir-cero",
    topic: "medidas",
    symptom: "Algunas sucursales muestran «Infinito» en una tasa de cumplimiento porque no tienen objetivo cargado.",
    cause: {
      answer: "Se divide por cero con el operador «/»",
      wrong: ["La sucursal no tiene ventas", "El visual es una tabla y no una matriz", "La medida está oculta"],
      explain: "Con «/» una división por cero da infinito o error. DIVIDE devuelve vacío (o el valor alternativo) y sigue.",
    },
  },
  {
    id: "acumulado-anual",
    topic: "medidas",
    symptom: "Un acumulado del año (TOTALYTD) devuelve cualquier cosa y a veces el mismo valor todos los meses. La tabla Calendario tiene fechas salteadas.",
    cause: {
      answer: "La tabla de fechas debe ser continua y estar marcada como tabla de fechas",
      wrong: ["TOTALYTD sólo funciona con años bisiestos", "Las medidas de tiempo necesitan una relación bidireccional", "Hay que usar SUMX en vez de SUM"],
      explain: "Las funciones de tiempo necesitan un calendario completo, sin huecos, con una columna de fecha única.",
    },
  },

  // ======================================================== relaciones (modelo)
  {
    id: "rutas-ambiguas",
    topic: "relaciones",
    symptom:
      "Al relacionar una tabla nueva, Power BI dice «Hay rutas de acceso ambiguas». Tres tablas de hechos ya están unidas a la misma tabla de calendario.",
    cause: {
      answer: "Conectar todo a la nueva tabla crea dos o más caminos entre el mismo par de tablas",
      wrong: ["La tabla nueva no tiene filas", "El calendario no tiene una columna de año", "Las tablas de hechos están ocultas"],
      explain: "El motor necesita un único camino activo entre dos tablas para saber cómo propagar el filtro.",
    },
    fix: {
      answer: "Dejar una relación activa y marcar las otras como inactivas, usándolas con USERELATIONSHIP cuando haga falta",
      wrong: ["Borrar el calendario y usar la fecha de cada tabla", "Pasar todas las relaciones a bidireccional", "Borrar las tablas de hechos"],
      explain: "Una activa y el resto inactivas resuelve la ambigüedad sin perder la posibilidad de usarlas.",
    },
  },
  {
    id: "bidireccional-parcial",
    topic: "relaciones",
    symptom:
      "Se cambió una relación a bidireccional y los filtros puntuales parecen funcionar. Pero la suma por región da sólo el 0,8 % del total general, sin ningún error.",
    cause: {
      answer: "La relación entre depósito y sucursal no es 1:1, así que el filtro bidireccional queda incompleto",
      wrong: ["Bidireccional sólo funciona con fechas", "El modelo necesita reiniciarse", "La región está escrita con tilde"],
      explain: "Con cardinalidad ambigua el motor filtra sólo una parte y no avisa. Siempre se verifica contra el total.",
    },
    fix: {
      answer: "Volver a unidireccional y resolverlo con una columna calculada que marque los pares válidos",
      wrong: ["Dejarla bidireccional y aclarar el número en una nota", "Agregar más relaciones bidireccionales", "Quitar la región del informe"],
      explain: "No se fuerza la bidireccionalidad cuando los datos no son 1:1: se revierte y se usa una columna de apoyo.",
    },
  },
  {
    id: "filtro-contrario",
    topic: "relaciones",
    symptom: "Un campo de la dimensión «Organización» no filtra las medidas de ventas. La flecha de la relación apunta de Organización hacia Sucursal.",
    cause: {
      answer: "El filtro viaja desde el lado «uno» hacia el «muchos»; acá el lado «muchos» es la dimensión",
      wrong: ["Las medidas de ventas están ocultas", "La relación es activa", "Organización no tiene clave primaria definida"],
      explain: "Los filtros se propagan en el sentido de la flecha. Si la dimensión es el lado «muchos», su filtro no llega a los hechos.",
    },
  },
  {
    id: "sin-camino",
    topic: "relaciones",
    symptom: "En una tabla de compras, el filtro por sucursal y por región no hace nada. En la de ventas, el mismo filtro anda perfecto.",
    cause: {
      answer: "La tabla de compras no tiene ningún camino de relaciones hacia la dimensión de sucursal",
      wrong: ["La tabla de compras es demasiado grande", "Falta una medida con CALCULATE", "El visual usa una paleta de colores distinta"],
      explain: "Si no hay relación, no hay propagación de filtros. Hay que crear la relación con el campo en común.",
    },
  },
  {
    id: "clave-texto-numero",
    topic: "relaciones",
    symptom: "Una relación sucursal ↔ ventas no devuelve datos: en una tabla la sucursal es «0049» y en la otra es 49.",
    cause: {
      answer: "Las columnas tienen tipos distintos (texto con ceros contra número) y no cruzan",
      wrong: ["Las relaciones no admiten números", "La sucursal 49 está inactiva", "Hay que ordenar las columnas"],
      explain: "Para relacionar, las dos claves deben tener el mismo tipo y el mismo formato.",
    },
    fix: {
      answer: "Convertir las dos al mismo tipo en Power Query, antes de cargar",
      wrong: ["Borrar los ceros a mano en cada informe", "Usar una medida que compare texto", "Cambiar el formato de pantalla de la columna"],
      explain: "Se arregla en el origen de la transformación para que el modelo reciba claves limpias.",
    },
  },
  {
    id: "dos-fechas",
    topic: "relaciones",
    symptom: "Una tabla de pedidos tiene fecha de pedido y fecha de entrega. Sólo una se relaciona con Calendario y no se puede activar la otra.",
    cause: {
      answer: "Entre dos tablas sólo puede haber una relación activa",
      wrong: ["Calendario no admite más de una fecha", "Falta un segundo calendario en otro idioma", "La fecha de entrega es texto"],
      explain: "La segunda relación se crea inactiva y se activa a pedido dentro de una medida.",
    },
    fix: {
      answer: "Dejar la segunda inactiva y usar CALCULATE([Pedidos], USERELATIONSHIP(...))",
      wrong: ["Activar las dos a la vez", "Duplicar la tabla de pedidos", "Unir las dos fechas en una sola columna de texto"],
      explain: "USERELATIONSHIP activa la relación inactiva sólo dentro de esa medida.",
    },
    exact: {
      prompt: "¿Cuál es la medida que cuenta los pedidos por fecha de entrega?",
      answer: "Pedidos por entrega = CALCULATE([Pedidos], USERELATIONSHIP(Pedidos[FechaEntrega], Calendario[Fecha]))",
      wrong: [
        "Pedidos por entrega = CALCULATE([Pedidos], Pedidos[FechaEntrega] = Calendario[Fecha])",
        "Pedidos por entrega = CALCULATE([Pedidos], ALL(Calendario))",
        "Pedidos por entrega = CALCULATE([Pedidos], CROSSFILTER(Pedidos[FechaPedido], Calendario[Fecha], BOTH))",
      ],
      explain: "Sólo USERELATIONSHIP activa la relación inactiva de la fecha de entrega. Los otros caminos no la usan o abren más filtros.",
    },
  },
  {
    id: "fecha-automatica",
    topic: "relaciones",
    symptom: "El modelo pesa más de lo esperado y aparecen tablas ocultas «LocalDateTable_...» y «DateTableTemplate_...» que nadie creó.",
    cause: {
      answer: "La opción «Fecha/hora automática» crea una tabla de fechas oculta por cada columna de fecha",
      wrong: ["Son copias de seguridad automáticas del modelo", "Las crea el servicio al publicar", "Son tablas de seguridad por fila"],
      explain: "Con un calendario propio conviene desactivar esa opción para no cargar tablas de más.",
    },
  },
  {
    id: "clave-duplicada",
    topic: "relaciones",
    symptom: "Al crear una relación uno-a-muchos desde la tabla de productos, Power BI la rechaza: «la columna tiene valores duplicados».",
    cause: {
      answer: "El lado «uno» tiene códigos repetidos, así que no es una clave única",
      wrong: ["La tabla de hechos tiene pocos registros", "Se creó en el orden equivocado", "Falta una columna de índice en la tabla de hechos"],
      explain: "El lado «uno» necesita claves únicas. Hay que depurar la dimensión (o elegir otra clave) antes de relacionar.",
    },
  },

  // ===================================================== fuentes (Power Query)
  {
    id: "formato-fecha",
    topic: "fuentes",
    symptom:
      "De un día para el otro se rompen gráficos y textos dinámicos. Una columna calculada arma la fecha con LEFT/MID/RIGHT y el origen pasó de DD/MM/AAAA a M/D/AAAA (por ejemplo «6/3/2026»).",
    cause: {
      answer: "La columna calculada asume posiciones fijas y ahora hay fechas de 8 caracteres",
      wrong: ["El calendario ya no tiene fechas de 2026", "Las fechas del origen se cargaron dos veces", "El texto dinámico ocupa demasiado espacio"],
      explain: "«6/3/2026» tiene un solo dígito de día: LEFT(…,2) devuelve «6/» y la columna queda en error, rompiendo la relación.",
    },
    fix: {
      answer: "Reemplazar la columna por una conversión de fecha que acepte formato variable, y refrescar",
      wrong: ["Agregar un cero a mano en el origen", "Cambiar el idioma de todo el informe", "Ocultar las medidas que fallan"],
      explain: "Después de recrear la columna y la relación hay que refrescar la tabla para que se recalcule.",
    },
    exact: {
      prompt: "¿Cuál es la columna corregida?",
      answer: "_Fecha_Date = DATEVALUE(Ventas[Fecha])",
      wrong: [
        "_Fecha_Date = DATE(RIGHT(Ventas[Fecha], 4), MID(Ventas[Fecha], 4, 2), LEFT(Ventas[Fecha], 2))",
        "_Fecha_Date = VALUE(Ventas[Fecha])",
        "_Fecha_Date = FORMAT(Ventas[Fecha], 'DD/MM/YYYY')",
      ],
      explain: "DATEVALUE interpreta formatos variables según la cultura del modelo. FORMAT devuelve texto, no fecha.",
    },
  },
  {
    id: "formula-firewall",
    topic: "fuentes",
    symptom:
      "Un informe se actualiza bien en Desktop pero en el servicio falla: «Unable to combine data… references other queries or steps». Una consulta arma un filtro IN con valores de otra fuente y lo pega dentro de una consulta nativa.",
    cause: {
      answer: "El Formula Firewall no permite armar el texto de una consulta nativa con datos de otra fuente; Desktop lo deja pasar por tener la privacidad relajada",
      wrong: ["El servicio no soporta consultas nativas", "La consulta nativa es demasiado larga", "El gateway está apagado por la noche"],
      explain: "Mezclar fuentes distintas dentro de la misma consulta nativa nunca va a refrescar en el servicio, aunque en Desktop sí.",
    },
    fix: {
      answer: "Traer las dos fuentes por separado y unirlas después con un merge, sin parametrizar la consulta nativa",
      wrong: ["Bajar el nivel de privacidad en el servicio", "Dejar el archivo en Desktop y no publicarlo", "Repetir el refresh hasta que funcione"],
      explain: "El join se hace fuera de la consulta nativa, donde Power Query sí puede combinar fuentes.",
    },
  },
  {
    id: "folding-perdido",
    topic: "fuentes",
    symptom: "Después de agregar un paso a una consulta, el refresh pasó de 2 minutos a 40. El origen es una base SQL con millones de filas.",
    cause: {
      answer: "El paso nuevo no se puede traducir a SQL: se rompió el query folding y ahora se filtra en memoria",
      wrong: ["La base de datos cambió de servidor", "El paso nuevo tiene un nombre muy largo", "Power Query está en inglés"],
      explain: "Con folding, el filtro viaja al servidor. Sin él, Power Query baja todo y filtra después.",
    },
    fix: {
      answer: "Mover el paso que no se traduce al final, o resolver ese cálculo en la propia consulta del origen",
      wrong: ["Duplicar la consulta", "Subir la memoria del equipo", "Quitar los filtros de fecha"],
      explain: "Los pasos que sí se traducen deben ir antes, para que el servidor haga el trabajo pesado.",
    },
  },
  {
    id: "unir-duplica",
    topic: "fuentes",
    symptom: "Después de un merge con una tabla de precios, las ventas totales subieron 18 %. El número de filas también aumentó.",
    cause: {
      answer: "La tabla de precios tiene claves repetidas y el merge multiplica las filas",
      wrong: ["El merge siempre agrega 18 % de filas", "La tabla de ventas estaba incompleta", "El tipo de unión es «externa derecha» por defecto"],
      explain: "Si la clave del lado derecho no es única, cada fila de ventas se repite por cada coincidencia.",
    },
    fix: {
      answer: "Quitar duplicados de la clave en la tabla de precios antes de unir",
      wrong: ["Dividir el total por 1,18", "Cambiar la unión a «anti izquierda»", "Ocultar las filas repetidas en el informe"],
      explain: "Con una clave única del lado derecho, el merge conserva una fila por venta.",
    },
  },
  {
    id: "columna-renombrada",
    topic: "fuentes",
    symptom: "El refresh falla con «No se encontró la columna 'Importe'». Alguien renombró la columna a «Monto» en la planilla de origen.",
    cause: {
      answer: "Un paso de Power Query depende del nombre de la columna y el origen cambió",
      wrong: ["La planilla es demasiado pesada", "Power BI no admite nombres con tilde", "Falta una relación en el modelo"],
      explain: "Los pasos guardan los nombres de columna. Si cambian en el origen, el paso queda apuntando a algo que no existe.",
    },
  },
  {
    id: "credenciales-servicio",
    topic: "fuentes",
    symptom: "El informe se actualiza en Desktop sin problemas, pero el servicio dice «credenciales inválidas» en la fuente.",
    cause: {
      answer: "Las credenciales de la fuente se guardan por separado en el servicio y hay que configurarlas ahí",
      wrong: ["Desktop usa una versión más nueva de los datos", "El informe pesa más de 1 GB", "Los datos están en otro idioma"],
      explain: "Lo que anda en Desktop usa tu sesión; el servicio necesita sus propias credenciales (o un gateway).",
    },
  },
  {
    id: "coma-decimal",
    topic: "fuentes",
    symptom: "Los importes llegan como «1.234,56» y al convertirlos a número aparecen errores o valores 1000 veces más grandes.",
    cause: {
      answer: "La conversión usa la configuración regional equivocada para el separador decimal",
      wrong: ["Los números no pueden tener decimales", "La columna es demasiado larga", "Hay que reiniciar Power BI"],
      explain: "Hay que cambiar el tipo «con configuración regional» e indicar la cultura del origen (por ejemplo es-AR).",
    },
  },
  {
    id: "tabla-enorme",
    topic: "fuentes",
    symptom: "Una tabla de hechos con años de historia agota el tiempo de refresh en el servicio, aunque casi todo el historial no cambia.",
    cause: {
      answer: "Se recarga todo el historial en cada refresh en una sola partición",
      wrong: ["Los datos viejos son inválidos", "El servicio no admite tablas de hechos", "Hay que borrar el historial"],
      explain: "Si lo viejo no cambia, no tiene sentido recargarlo siempre.",
    },
    fix: {
      answer: "Particionar por período (o usar actualización incremental) para refrescar sólo lo reciente",
      wrong: ["Dividir el informe en dos archivos iguales", "Agrandar el tiempo de espera y esperar", "Eliminar columnas al azar"],
      explain: "Con particiones por trimestre, el refresh sólo toca los períodos que cambian.",
    },
  },

  // =========================================================== nube y APIs
  {
    id: "cuota-bigquery",
    topic: "nube",
    symptom:
      "Los informes dejan de actualizar con «Quota exceeded: free query bytes scanned». Las consultas no indican proyecto de facturación.",
    cause: {
      answer: "Los jobs se facturan al proyecto por defecto de la cuenta de servicio, que es de nivel gratuito",
      wrong: ["La tabla se quedó sin filas", "El informe tiene demasiadas páginas", "La API de BigQuery está caída"],
      explain: "La cuota gratuita se agotó. Los datos están en otro proyecto, pero los jobs se cobran donde se ejecutan.",
    },
    fix: {
      answer: "Darle a la cuenta el rol «BigQuery Job User» en el proyecto con facturación, y fijar BillingProject en las consultas",
      wrong: ["Esperar al mes siguiente", "Crear una cuenta gratuita nueva cada vez", "Bajar la frecuencia de actualización a la mitad"],
      explain: "El permiso es lo que habilita ejecutar jobs. Fijar el proyecto de facturación evita depender del default.",
    },
  },
  {
    id: "select-estrella",
    topic: "nube",
    symptom: "La factura de consultas de BigQuery se triplicó. Una consulta usa SELECT * sobre una tabla de eventos sin filtro de fecha.",
    cause: {
      answer: "SELECT * sin filtro de partición escanea todas las columnas de todos los días",
      wrong: ["Las consultas se cobran por minuto", "BigQuery cobra por cantidad de informes", "El almacenamiento se duplica con cada consulta"],
      explain: "BigQuery cobra por bytes leídos. Elegir columnas y filtrar por la columna de partición reduce el costo.",
    },
    fix: {
      answer: "Seleccionar sólo las columnas necesarias y filtrar por la columna de partición",
      wrong: ["Agregar LIMIT 10 al final", "Ejecutar la consulta dos veces para que use caché", "Mover la tabla a otra región"],
      explain: "LIMIT no reduce bytes escaneados; filtrar la partición sí.",
    },
    exact: {
      prompt: "¿Cuál es la consulta que escanea menos?",
      answer: "SELECT id, monto FROM eventos WHERE fecha_particion BETWEEN '2026-01-01' AND '2026-01-31'",
      wrong: [
        "SELECT * FROM eventos LIMIT 1000",
        "SELECT id, monto FROM eventos ORDER BY monto DESC LIMIT 1000",
        "SELECT * FROM eventos WHERE monto > 0",
      ],
      explain: "Pocas columnas más filtro por la columna de partición. LIMIT y ORDER BY no evitan leer toda la tabla.",
    },
  },
  {
    id: "endpoint-404",
    topic: "nube",
    symptom: "Un bot que consulta su saldo recibe 404 en /api/v2/estado-cuenta, aunque el token es válido y otras rutas responden bien.",
    cause: {
      answer: "La ruta está mal escrita: el endpoint real no lleva guion",
      wrong: ["El token venció", "La API no admite GET", "El servidor está en mantenimiento"],
      explain: "Un 404 con token válido y otras rutas andando apunta a la URL, no a la autenticación.",
    },
    fix: {
      answer: "Revisar la documentación y probar la ruta con una llamada manual antes de usarla en el bot",
      wrong: ["Reintentar la misma URL cada segundo", "Cambiar el token", "Pasar el pedido a POST"],
      explain: "Probar a mano permite ver el error y el formato real de la respuesta.",
    },
  },
  {
    id: "campo-cero",
    topic: "nube",
    symptom: "Un bot debía vender cuando una posición caía 15 %, pero nunca vende. El campo «ganancia_pct» de la API llega siempre en 0.",
    cause: {
      answer: "El bot confía en un campo que la API no completa, así que la condición nunca se cumple",
      wrong: ["El umbral de 15 % es demasiado alto para cualquier caso", "La API está en otra zona horaria", "El bot corre con demasiada frecuencia"],
      explain: "Un dato que siempre es 0 hace que la regla nunca se dispare, sin error alguno.",
    },
    fix: {
      answer: "Calcular la variación a partir del precio actual y del precio de compra que sí trae la API",
      wrong: ["Bajar el umbral a 0 %", "Ignorar la regla y vender a mano", "Esperar a que la API lo corrija"],
      explain: "Se calcula con campos confiables en vez de depender de uno que llega vacío.",
    },
  },
  {
    id: "log-vacio",
    topic: "nube",
    symptom: "Un script falla con «list indices must be integers» al leer su archivo de registro. El archivo, recién creado, contiene [].",
    cause: {
      answer: "El código espera un objeto con la clave «trades» pero el archivo guarda una lista vacía",
      wrong: ["El archivo está bloqueado por otro programa", "JSON no permite listas vacías", "La carpeta no tiene permisos de escritura"],
      explain: "Dos partes del código asumen formatos distintos para el mismo archivo.",
    },
    fix: {
      answer: "Normalizar al leer: si es una lista, convertirla en el objeto esperado",
      wrong: ["Borrar el archivo cada vez que arranca", "Agregar un try/except que ignore todo error", "Cambiar la extensión a .txt"],
      explain: "Normalizar al cargar hace que el resto del código vea siempre un único formato.",
    },
    exact: {
      prompt: "¿Cuál es la función de lectura corregida?",
      answer: "data = json.load(f); return {'trades': data} if isinstance(data, list) else data",
      wrong: [
        "data = json.load(f); return data['trades']",
        "data = json.load(f); return {'trades': data}",
        "data = json.load(f); return data or {}",
      ],
      explain: "Si ya es objeto se devuelve igual; si es lista se envuelve. Las otras opciones rompen con alguno de los dos formatos.",
    },
  },
  {
    id: "api-500",
    topic: "nube",
    symptom: "Un endpoint de series históricas devuelve 500 para todos los símbolos, desde hace horas. El resto de la API funciona.",
    cause: {
      answer: "Es un error del lado del servidor: el problema no está en el pedido del bot",
      wrong: ["El bot envió mal el token", "Los símbolos están en minúscula", "Falta una cabecera Content-Type"],
      explain: "Un 5xx general sobre un solo endpoint apunta a la API, no a tus parámetros.",
    },
    fix: {
      answer: "Usar una fuente alternativa para ese dato y registrar el error, sin frenar todo el bot",
      wrong: ["Reintentar sin pausa mil veces", "Apagar el bot hasta que la API vuelva", "Inventar valores promedio"],
      explain: "Un plan B para el dato crítico mantiene el servicio andando mientras se resuelve.",
    },
  },
  {
    id: "dry-run",
    topic: "nube",
    symptom: "Vas a activar un bot que opera con dinero real después de corregir varios errores. ¿Qué conviene hacer antes?",
    cause: {
      answer: "Correrlo en modo de prueba (dry-run), que registra lo que haría sin ejecutar operaciones",
      wrong: ["Activarlo con montos chicos sin mirar el registro", "Borrar el registro de pruebas anteriores", "Desactivar las notificaciones"],
      explain: "Ver qué decidiría con datos reales, sin consecuencias, es la forma segura de validar las correcciones.",
    },
  },
  {
    id: "token-vencido",
    topic: "nube",
    symptom: "Un proceso nocturno anda de día pero falla de madrugada con 401, siempre unas horas después de iniciarse.",
    cause: {
      answer: "El token de acceso vence y el proceso no lo renueva",
      wrong: ["La API se apaga de noche", "El proceso usa demasiada memoria", "La zona horaria del servidor es incorrecta"],
      explain: "Un 401 a horas fijas de iniciado es la firma de un token con vencimiento sin renovación.",
    },
    fix: {
      answer: "Renovar el token con el refresh token antes de que venza, o ante un 401, y reintentar",
      wrong: ["Guardar el usuario y la clave en el código", "Reiniciar el equipo cada hora", "Ignorar el error 401"],
      explain: "Se renueva con el mecanismo previsto por la API, sin guardar credenciales fijas en el código.",
    },
  },
];

const PREFIX: Record<string, string> = { medidas: "ca", relaciones: "re", fuentes: "fu", nube: "nu" };

/** Plantillas del piso 3: una por nivel de cada caso. */
export const CASE_TEMPLATES: Template[] = CASES.flatMap((c) => {
  const id = `${PREFIX[c.topic]}-${c.id}`;
  const templates: Template[] = [
    {
      id,
      topic: c.topic,
      tier: 0,
      build: () => ({
        prompt: `${c.symptom} ¿Cuál es la causa raíz?`,
        answer: c.cause.answer,
        wrong: c.cause.wrong,
        explain: c.cause.explain,
      }),
    },
  ];
  if (c.fix) {
    const fix = c.fix;
    templates.push({
      id: `${id}-fix`,
      topic: c.topic,
      tier: 1,
      build: () => ({
        prompt: `${c.symptom} Ya sabés cuál es la causa. ¿Cuál es el arreglo?`,
        answer: fix.answer,
        wrong: fix.wrong,
        explain: fix.explain,
      }),
    });
  }
  if (c.exact) {
    const exact = c.exact;
    templates.push({
      id: `${id}-exacto`,
      topic: c.topic,
      tier: 2,
      build: () => ({
        prompt: `${c.symptom} ${exact.prompt}`,
        answer: exact.answer,
        wrong: exact.wrong,
        explain: exact.explain,
      }),
    });
  }
  return templates;
});
