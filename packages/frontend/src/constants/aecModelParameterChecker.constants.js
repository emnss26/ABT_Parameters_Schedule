export const PARAMETER_CHECKER_DISCIPLINES = [
  {
    id: "architecture_exteriors",
    name: "Arquitectura y Exteriores",
    focus:
      "Se enfoca en habitabilidad, acabados y normativa de superficies.",
    categories: [
      { id: "architecture_walls", name: "Walls (Muros)", query: "Walls" },
      { id: "architecture_floors", name: "Floors (Suelos)", query: "Floors" },
      { id: "architecture_roofs", name: "Roofs (Cubiertas)", query: "Roofs" },
      { id: "architecture_doors", name: "Doors (Puertas)", query: "Doors" },
      { id: "architecture_windows", name: "Windows (Ventanas)", query: "Windows" },
      { id: "architecture_rooms", name: "Rooms (Habitaciones)", query: "Rooms" },
      { id: "architecture_railings", name: "Railings (Barandillas)", query: "Railings" },
      { id: "architecture_stairs", name: "Stairs (Escaleras)", query: "Stairs" },
      {
        id: "architecture_curtain_panels_mullions",
        name: "Curtain Panels / Mullions",
        query: "CurtainPanels",
      },
    ],
    keyParameters: [
      "Resistencia al fuego",
      "Coeficiente de transmitancia",
      "Funcion (Interior/Exterior)",
      "Nivel de acabado",
    ],
  },
  {
    id: "structure",
    name: "Estructura",
    focus: "Se enfoca en integridad fisica y analisis estructural.",
    categories: [
      {
        id: "structure_foundations",
        name: "Structural Foundations (Cimentaciones)",
        query: "Structural Foundations",
      },
      {
        id: "structure_columns",
        name: "Structural Columns (Pilares estructurales)",
        query: "Structural Columns",
      },
      {
        id: "structure_framing",
        name: "Structural Framing (Vigas/Armazon estructural)",
        query: "Structural Framing",
      },
      {
        id: "structure_walls",
        name: "Structural Walls (Muros de carga)",
        query: "Walls",
      },
      {
        id: "structure_floors",
        name: "Floors (Suelos estructurales)",
        query: "Floors",
      },
      {
        id: "structure_rebar",
        name: "Structural Rebar (Refuerzo)",
        query: "Structural Rebar",
      },
    ],
    keyParameters: [
      "Material estructural",
      "Uso estructural",
      "Nivel (Top/Bottom)",
      "Resistencia del concreto (f'c)",
    ],
  },
  {
    id: "electrical",
    name: "Instalacion Electrica",
    focus: "Enfoque en cargas, circuitos y conectividad.",
    categories: [
      {
        id: "electrical_equipment",
        name: "Electrical Equipment (Tableros, transformadores)",
        query: "Electrical Equipment",
      },
      {
        id: "electrical_fixtures",
        name: "Electrical Fixtures (Tomas de corriente)",
        query: "Electrical Fixtures",
      },
      {
        id: "electrical_lighting_fixtures",
        name: "Lighting Fixtures (Luminarias)",
        query: "Lighting Fixtures",
      },
      {
        id: "electrical_lighting_devices",
        name: "Lighting Devices (Interruptores)",
        query: "Lighting Devices",
      },
      {
        id: "electrical_conduits",
        name: "Conduits (Tuberias electricas)",
        query: "Conduits",
      },
      {
        id: "electrical_cable_trays",
        name: "Cable Trays (Charolas de cables)",
        query: "Cable Trays",
      },
    ],
    keyParameters: [
      "Voltaje",
      "Carga aparente",
      "Nombre de circuito",
      "Panel al que pertenece",
    ],
  },
  {
    id: "hydraulic_pluvial",
    name: "Instalacion Hidraulica y Pluvial",
    focus: "Enfoque en diametros, pendientes y sistemas.",
    categories: [
      { id: "hydraulic_pipes", name: "Pipes (Tuberias)", query: "Pipes" },
      {
        id: "hydraulic_pipe_fittings",
        name: "Pipe Fittings (Uniones)",
        query: "Pipe Fittings",
      },
      {
        id: "hydraulic_pipe_accessories",
        name: "Pipe Accessories (Valvulas)",
        query: "Pipe Accessories",
      },
      {
        id: "hydraulic_plumbing_fixtures",
        name: "Plumbing Fixtures (Aparatos sanitarios)",
        query: "Plumbing Fixtures",
      },
      {
        id: "hydraulic_mechanical_equipment",
        name: "Mechanical Equipment (Bombas, tanques)",
        query: "Mechanical Equipment",
      },
    ],
    keyParameters: [
      "System Classification",
      "Diametro",
      "Pendiente",
      "Material",
      "Tipo de fluido",
    ],
  },
  {
    id: "hvac",
    name: "Instalacion de HVAC",
    focus: "Enfoque en flujo de aire y confort termico.",
    categories: [
      { id: "hvac_ducts", name: "Ducts (Conductos)", query: "Ducts" },
      {
        id: "hvac_duct_fittings",
        name: "Duct Fittings (Uniones)",
        query: "Duct Fittings",
      },
      {
        id: "hvac_duct_accessories",
        name: "Duct Accessories (Dampers)",
        query: "Duct Accessories",
      },
      {
        id: "hvac_air_terminals",
        name: "Air Terminals (Difusores, rejillas)",
        query: "Air Terminals",
      },
      {
        id: "hvac_mechanical_equipment",
        name: "Mechanical Equipment (UMA, Fan Coil, Chiller)",
        query: "Mechanical Equipment",
      },
    ],
    keyParameters: [
      "Flow",
      "Velocidad",
      "Presion estatica",
      "Aislamiento termico",
    ],
  },
  {
    id: "special_systems",
    name: "Instalaciones Especiales",
    focus: "Incluye Voz y Datos, CCTV, Sonido y sistemas de emergencia.",
    categories: [
      {
        id: "special_data_devices",
        name: "Data Devices (Nodos de red)",
        query: "Data Devices",
      },
      {
        id: "special_communication_devices",
        name: "Communication Devices (Intercomunicadores)",
        query: "Communication Devices",
      },
      {
        id: "special_security_devices",
        name: "Security Devices (Camaras, sensores)",
        query: "Security Devices",
      },
      {
        id: "special_fire_alarm_devices",
        name: "Fire Alarm Devices (Detectores de humo)",
        query: "Fire Alarm Devices",
      },
    ],
    keyParameters: [
      "MAC Address (si aplica)",
      "Tipo de senal",
      "Ubicacion",
      "Sistema de emergencia",
    ],
  },
]

export const DEFAULT_DISCIPLINE_ID = PARAMETER_CHECKER_DISCIPLINES[0]?.id || ""

export const DISCIPLINE_BY_ID = PARAMETER_CHECKER_DISCIPLINES.reduce((acc, discipline) => {
  acc[discipline.id] = discipline
  return acc
}, {})

export const getDisciplineById = (disciplineId) => DISCIPLINE_BY_ID[disciplineId] || null

export const getCategoryById = (disciplineId, categoryId) => {
  const discipline = getDisciplineById(disciplineId)
  if (!discipline) return null
  return discipline.categories.find((category) => category.id === categoryId) || null
}
